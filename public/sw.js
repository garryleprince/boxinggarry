/**
 * Service worker.
 *
 * Strategy, chosen for an offline-first personal app on a mobile connection:
 *
 *  - the application shell (HTML, JS, CSS, icons) is precached at install, so
 *    a session can be started with no network at all;
 *  - navigations are network-first with a cache fallback, so a new version is
 *    picked up promptly when there *is* a connection and the app still opens
 *    when there is not;
 *  - static assets are cache-first — they are content-hashed by the build, so
 *    a cached copy is never stale;
 *  - nothing else is cached. There is no API and no third party: everything
 *    this app needs is in the bundle.
 *
 * The build writes the precache list into `self.__PRECACHE`.
 */

const VERSION = self.__BUILD_ID__ || 'dev';
const SHELL_CACHE = `bbc-shell-${VERSION}`;
const ASSET_CACHE = `bbc-assets-${VERSION}`;
const PRECACHE = self.__PRECACHE__ || ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A single missing file must not break the whole install.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('bbc-') && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isAsset = (url) =>
  /\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|json|webmanifest)$/i.test(url.pathname);

/** Look in every cache, then again ignoring the query string. */
async function fromCache(request) {
  const direct = await caches.match(request);
  if (direct) return direct;
  return caches.match(request, { ignoreSearch: true });
}

/**
 * Network, but never for longer than `ms`.
 *
 * A navigation must not wait on a connection that is present but unusable —
 * a captive portal, a dead cell, a stalled handshake. After the timeout the
 * cached shell is served, which is the whole point of an offline-first app.
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const NAVIGATION_TIMEOUT_MS = 3000;

async function handleNavigation(request) {
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    const cache = await caches.open(SHELL_CACHE);
    await cache.put('/index.html', response.clone());
    return response;
  } catch {
    const cached =
      (await caches.match('/index.html')) ??
      (await caches.match('/')) ??
      (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    // Nothing cached and no network: say so plainly rather than showing the
    // browser's own error page for what is an installed application.
    return new Response(
      '<!doctype html><html lang="fr"><meta charset="utf-8">' +
        '<title>Hors connexion</title>' +
        '<body style="font:16px system-ui;background:#08090b;color:#f4f5f7;padding:2rem">' +
        '<h1>Hors connexion</h1><p>Reconnecte-toi une fois pour installer l’application, ' +
        'ensuite elle fonctionnera sans réseau.</p></body></html>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function handleAsset(request) {
  const cached = await fromCache(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // One last look: a concurrent install may have finished in the meantime.
    const late = await fromCache(request);
    if (late) return late;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never touch cross-origin requests: there are none by design, and proxying
  // them would only add ways for this to go wrong.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isAsset(url)) {
    event.respondWith(handleAsset(request));
  }
});
