import { useEffect } from 'react';
import { useRoute } from './router';
import { useStore } from './store';
import { TabBar } from '@/ui/TabBar';
import { Banner } from '@/ui/primitives';
import { Splash } from '@/screens/Splash';
import { LockScreen } from '@/screens/LockScreen';
import { Onboarding } from '@/screens/Onboarding';
import { Assessment } from '@/screens/Assessment';
import { Dashboard } from '@/screens/Dashboard';
import { Calendar } from '@/screens/Calendar';
import { SessionPreview } from '@/screens/SessionPreview';
import { Training } from '@/screens/Training';
import { SessionSummary } from '@/screens/SessionSummary';
import { Progress } from '@/screens/Progress';
import { History } from '@/screens/History';
import { RecoveryScreen } from '@/screens/Recovery';
import { Goals } from '@/screens/Goals';
import { Library } from '@/screens/Library';
import { Boxing } from '@/screens/Boxing';
import { RoundTimer } from '@/screens/RoundTimer';
import { Shadowboxing } from '@/screens/Shadowboxing';
import { Settings } from '@/screens/Settings';
import { More } from '@/screens/More';
import { InstallHint } from '@/pwa/InstallHint';

/** Screens that take over the whole viewport: no tab bar, no distractions. */
const IMMERSIVE = ['/entrainement'];

export function App() {
  const status = useStore((s) => s.status);
  const boot = useStore((s) => s.boot);
  const theme = useStore((s) => s.core.settings.theme);
  const notice = useStore((s) => s.notice);
  const storageWarning = useStore((s) => s.storageWarning);
  const dismissNotice = useStore((s) => s.dismissNotice);
  const route = useRoute();

  useEffect(() => {
    void boot();
  }, [boot]);

  // Theme is applied to the root element so the tokens cascade everywhere,
  // including the iOS status bar colour set by the theme-color meta tag.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'systeme') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    const dark =
      theme === 'sombre' ||
      (theme === 'systeme' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#08090b' : '#f6f7f9');
  }, [theme]);

  if (status === 'chargement') return <Splash />;
  if (status === 'aucun-coffre') return <LockScreen mode="creation" />;
  if (status === 'verrouille') return <LockScreen mode="verrouille" />;
  if (status === 'onboarding') return <Onboarding />;
  if (status === 'evaluation') return <Assessment />;

  const immersive = IMMERSIVE.includes(route.path);

  return (
    <div className="app">
      {!immersive && (notice || storageWarning) ? (
        <div style={{ padding: 'calc(var(--safe-top) + 8px) var(--s-4) 0' }}>
          {storageWarning ? <Banner tone="danger">{storageWarning}</Banner> : null}
          {notice ? (
            <button
              type="button"
              onClick={dismissNotice}
              style={{ width: '100%', textAlign: 'left', marginTop: storageWarning ? 8 : 0 }}
            >
              <Banner tone="warn">{notice}</Banner>
            </button>
          ) : null}
        </div>
      ) : null}

      <Screen path={route.path} />
      {!immersive ? <TabBar /> : null}
      {!immersive ? <InstallHint /> : null}
    </div>
  );
}

function Screen({ path }: { path: string }) {
  switch (path) {
    case '/':
      return <Dashboard />;
    case '/calendrier':
      return <Calendar />;
    case '/seance':
      return <SessionPreview />;
    case '/entrainement':
      return <Training />;
    case '/bilan':
      return <SessionSummary />;
    case '/progression':
      return <Progress />;
    case '/historique':
      return <History />;
    case '/recuperation':
      return <RecoveryScreen />;
    case '/objectifs':
      return <Goals />;
    case '/bibliotheque':
      return <Library />;
    case '/boxe':
      return <Boxing />;
    case '/timer':
      return <RoundTimer />;
    case '/shadowboxing':
      return <Shadowboxing />;
    case '/parametres':
      return <Settings />;
    case '/plus':
      return <More />;
    default:
      return <Dashboard />;
  }
}
