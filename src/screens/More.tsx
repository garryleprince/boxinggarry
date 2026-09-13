import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { EXERCISES } from '@/data/exercises';
import { TapCard } from '@/ui/primitives';
import { Header } from '@/ui/Header';
import { IconHeart, IconLibrary, IconSettings, IconChart, IconToday } from '@/ui/icons';

/** Secondary navigation, so the tab bar stays at five items. */
export function More() {
  const { core } = useStore();
  const entries = [
    {
      path: '/bibliotheque',
      Icon: IconLibrary,
      title: 'Bibliothèque',
      sub: `${EXERCISES.length} exercices avec consignes et progressions`,
    },
    {
      path: '/recuperation',
      Icon: IconHeart,
      title: 'Récupération',
      sub: 'État estimé par zone et équilibre du corps',
    },
    {
      path: '/objectifs',
      Icon: IconToday,
      title: 'Objectifs',
      sub: core.profile?.goals.length
        ? `${core.profile.goals.length} objectif${core.profile.goals.length > 1 ? 's' : ''} actif${core.profile.goals.length > 1 ? 's' : ''}`
        : 'Aucun objectif défini',
    },
    {
      path: '/historique',
      Icon: IconChart,
      title: 'Historique',
      sub: `${core.sessions.length} séance${core.sessions.length > 1 ? 's' : ''} enregistrée${core.sessions.length > 1 ? 's' : ''}`,
    },
    {
      path: '/parametres',
      Icon: IconSettings,
      title: 'Paramètres',
      sub: 'Profil, audio, données, sécurité',
    },
  ];

  return (
    <div className="screen">
      <Header title="Plus" />
      <div className="stack-sm">
        {entries.map(({ path, Icon, title, sub }) => (
          <TapCard key={path} className="row" onClick={() => navigate(path)}>
            <Icon size={20} />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, display: 'block' }}>{title}</span>
              <span className="micro dim">{sub}</span>
            </span>
          </TapCard>
        ))}
      </div>
      <p className="micro dim" style={{ marginTop: 'var(--s-6)', textAlign: 'center' }}>
        Boxing Body Coach — application d’entraînement. Elle ne pose aucun diagnostic et ne remplace
        pas un professionnel de santé.
      </p>
    </div>
  );
}
