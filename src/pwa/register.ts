/**
 * Service-worker registration.
 *
 * Registration is deliberately deferred until after first paint: on a mobile
 * connection the first screen should not wait on anything the app does not
 * need to render.
 */

let updateAvailable = false;
const listeners = new Set<(available: boolean) => void>();

export function onUpdateAvailable(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => listeners.delete(listener);
}

function announce(value: boolean) {
  updateAvailable = value;
  for (const l of listeners) l(value);
}

export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // A service worker on a dev server would cache the dev bundle; skip it.
  if (import.meta.env.DEV) return;

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // A worker that reaches "installed" while another controls the page
            // is a new version waiting to take over.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              announce(true);
            }
          });
        });
      })
      .catch(() => {
        /* offline support simply does not activate; the app still works */
      });
  });
}

/** Apply a pending update and reload once the new worker takes control. */
export async function applyUpdate(): Promise<void> {
  const registration = await navigator.serviceWorker?.getRegistration();
  registration?.waiting?.postMessage('skip-waiting');
  navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
}

/** True when the app is running from the home screen rather than in Safari. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}
