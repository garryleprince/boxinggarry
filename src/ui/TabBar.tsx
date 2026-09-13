import { navigate, useRoute } from '@/app/router';
import { IconCalendar, IconChart, IconGlove, IconSettings, IconToday } from './icons';

const TABS = [
  { path: '/', label: 'Aujourd’hui', Icon: IconToday, match: (p: string) => p === '/' },
  {
    path: '/calendrier',
    label: 'Calendrier',
    Icon: IconCalendar,
    match: (p: string) => p.startsWith('/calendrier'),
  },
  {
    path: '/boxe',
    label: 'Boxe',
    Icon: IconGlove,
    match: (p: string) => p.startsWith('/boxe') || p.startsWith('/timer') || p.startsWith('/shadow'),
  },
  {
    path: '/progression',
    label: 'Progrès',
    Icon: IconChart,
    match: (p: string) => p.startsWith('/progression') || p.startsWith('/historique'),
  },
  {
    path: '/plus',
    label: 'Plus',
    Icon: IconSettings,
    match: (p: string) =>
      ['/plus', '/parametres', '/bibliotheque', '/recuperation', '/objectifs', '/exercice'].some(
        (x) => p.startsWith(x),
      ),
  },
] as const;

export function TabBar() {
  const route = useRoute();
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      {TABS.map(({ path, label, Icon, match }) => {
        const current = match(route.path);
        return (
          <button
            key={path}
            type="button"
            className="tabbar__item"
            aria-current={current ? 'page' : undefined}
            onClick={() => navigate(path)}
          >
            <Icon className="tabbar__icon" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
