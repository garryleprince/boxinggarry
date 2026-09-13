/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Injects the real build output into the service worker's precache list.
 *
 * Without this the worker would only precache `/index.html`, and the very
 * first offline launch would have no JavaScript to run. The build id busts the
 * cache on every deployment.
 */
function serviceWorkerPrecache(): Plugin {
  return {
    name: 'bbc-sw-precache',
    apply: 'build',
    closeBundle() {
      const outDir = fileURLToPath(new URL('./dist', import.meta.url));
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else files.push('/' + relative(outDir, full).split(/[\\/]/).join('/'));
        }
      };
      walk(outDir);

      const precache = files.filter(
        (f) => f !== '/sw.js' && /\.(?:html|js|css|svg|png|webmanifest)$/i.test(f),
      );
      // Serve the app root from cache as well, so a cold offline launch works
      // whether the URL ends in `/` or `/index.html`.
      if (!precache.includes('/')) precache.unshift('/');

      const swPath = join(outDir, 'sw.js');
      const buildId = Date.now().toString(36);
      const source = readFileSync(swPath, 'utf8');
      writeFileSync(
        swPath,
        `self.__BUILD_ID__ = ${JSON.stringify(buildId)};\n` +
          `self.__PRECACHE__ = ${JSON.stringify(precache)};\n` +
          source,
      );
      console.log(`[sw] ${precache.length} fichiers précachés (build ${buildId})`);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPrecache()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Keep the payload small for 4G/5G: one vendor chunk + app code.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
    // Exercise data is inlined; warn only above a genuinely large budget.
    chunkSizeWarningLimit: 700,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
