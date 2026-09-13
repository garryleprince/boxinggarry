import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Hash routing.
 *
 * A three-dozen-line router rather than a dependency: the app has a flat set
 * of screens, and hash URLs work identically from a home-screen launch, from
 * a cold start and offline, with no server rewrite rules to configure.
 */

export type Route = { path: string; params: Record<string, string> };

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [pathname = '/', query = ''] = raw.split('?');
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { path: pathname.replace(/\/+$/, '') || '/', params };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() =>
    parse(typeof window === 'undefined' ? '/' : window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const target = `#${path}`;
  if (window.location.hash === target) return;
  if (options.replace) window.history.replaceState(null, '', target);
  else window.location.hash = path;
  if (options.replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
  // A new screen always starts at the top.
  window.scrollTo({ top: 0 });
}

export function useNavigate() {
  return useCallback(navigate, []);
}

/** Split a path into segments, for routes like `/exercice/pompes`. */
export function useSegments(): string[] {
  const route = useRoute();
  return useMemo(() => route.path.split('/').filter(Boolean), [route.path]);
}

export function back(fallback = '/'): void {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback);
}
