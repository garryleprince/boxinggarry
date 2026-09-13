import { useEffect, useState } from 'react';
import { applyUpdate, isIos, isStandalone, onUpdateAvailable } from './register';
import { Button, Sheet } from '@/ui/primitives';

const DISMISS_KEY = 'bbc.install-hint.dismissed';

/**
 * Two small, non-intrusive prompts:
 *
 *  - how to add the app to the iPhone home screen. Safari on iOS gives web
 *    apps no install prompt, so the only honest option is to show the steps —
 *    once, dismissible, and never again after installation.
 *  - a new version is ready, when the service worker has one waiting.
 */
export function InstallHint() {
  const [showInstall, setShowInstall] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isIos()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* private browsing: show the hint, it costs nothing */
    }
    // Let the athlete look at the app first.
    const id = window.setTimeout(() => setShowInstall(true), 8000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => onUpdateAvailable(setHasUpdate), []);

  function dismiss() {
    setShowInstall(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* nothing to persist to; the hint reappears next session */
    }
  }

  return (
    <>
      {hasUpdate ? (
        <div className="update-toast" role="status">
          <span className="small">Une nouvelle version est prête.</span>
          <Button small variant="primary" onClick={() => void applyUpdate()}>
            Mettre à jour
          </Button>
        </div>
      ) : null}

      <Sheet open={showInstall} onClose={dismiss} title="Installer sur ton iPhone">
        <div className="stack">
          <p className="muted small">
            Ajoutée à l’écran d’accueil, l’application s’ouvre en plein écran, sans barre Safari, et
            fonctionne hors connexion.
          </p>
          <ol className="stack-sm">
            {[
              'Touche le bouton Partager en bas de Safari.',
              'Fais défiler et choisis « Sur l’écran d’accueil ».',
              'Touche « Ajouter » en haut à droite.',
              'Lance l’application depuis son icône.',
            ].map((step, i) => (
              <li key={i} className="row" style={{ gap: 'var(--s-3)', alignItems: 'flex-start' }}>
                <span className="step-num num">{i + 1}</span>
                <span className="small muted">{step}</span>
              </li>
            ))}
          </ol>
          <Button block variant="primary" onClick={dismiss}>
            Compris
          </Button>
        </div>
      </Sheet>
    </>
  );
}
