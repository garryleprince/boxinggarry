import { useMemo } from 'react';
import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { ARCHETYPE_META, RPE_META } from '@/domain/model/workout';
import { QUALITY_LABELS, REGION_LABELS, RECOVERY_REGIONS } from '@/domain/model/taxonomy';
import { recoveryPercent, readiness } from '@/engines/recovery';
import { computeStreak, computeTotals } from '@/engines/scoring/achievements';
import { nextTrainingDay } from '@/engines/training/plan';
import { Banner, Button, Card, Pill, Stat, TapCard } from '@/ui/primitives';
import { IconFlame, IconPlus } from '@/ui/icons';
import { Figure } from '@/ui/Figure';
import { QUALITY_COLOUR } from '@/ui/colours';

/**
 * The dashboard answers one question before anything else:
 * *what do I do today?* — name, duration, one button. Everything below it is
 * context, not competition for attention (cahier des charges §14, §53).
 */
export function Dashboard() {
  const { core, plan, workout, extension, extensionWorkout, recent, active, today } = useStore();
  const setAdjust = useStore((s) => s.setAdjust);
  const adjust = useStore((s) => s.adjust);

  const streak = useMemo(() => computeStreak(recent, today), [recent, today]);
  const totals = useMemo(() => computeTotals(recent), [recent]);
  const recovery = useMemo(() => recoveryPercent(core.recovery), [core.recovery]);
  const ready = useMemo(() => readiness(core.recovery), [core.recovery]);
  const next = useMemo(
    () => (core.profile ? nextTrainingDay(core.profile, today, recent) : undefined),
    [core.profile, today, recent],
  );

  const doneToday = recent.some((s) => s.date === today && s.status === 'terminee' && !s.extensionOf);
  const extensionDoneToday = recent.some((s) => s.date === today && s.extensionOf);

  if (!workout || !plan) return null;
  const meta = ARCHETYPE_META[workout.archetype];
  const greeting = core.profile?.name ? `Salut ${core.profile.name}` : 'Aujourd’hui';

  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <div className="eyebrow">{formatToday(today)}</div>
          <h1 className="screen-title">{greeting}</h1>
        </div>
        {streak.current > 0 ? (
          <span className="pill pill--signal">
            <IconFlame size={14} />
            {streak.current} j
          </span>
        ) : null}
      </header>

      {active ? (
        <Card className="stack" style={{ marginBottom: 'var(--s-4)' }}>
          <div>
            <div className="eyebrow">Séance en cours</div>
            <strong>{active.session.workout.title}</strong>
          </div>
          <Button variant="primary" block onClick={() => navigate('/entrainement')}>
            Reprendre la séance
          </Button>
        </Card>
      ) : null}

      {/* ------------------------------------------------ la séance du jour */}
      <section className="hero" aria-labelledby="today-title">
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{plan.isRecoveryDay ? 'Récupération' : 'Séance du jour'}</div>
            <h2 id="today-title" className="hero__name">
              {meta.emoji} {workout.title}
            </h2>
          </div>
          <div style={{ width: 62, flexShrink: 0, opacity: 0.9 }}>
            <Figure poses={heroPoses(workout.archetype)} cycleSec={2.8} size="100%" />
          </div>
        </div>

        <div className="row" style={{ alignItems: 'baseline', marginTop: 'var(--s-4)', gap: 10 }}>
          <span className="hero__duration num">{Math.round(workout.durationSec / 60)}</span>
          <span className="muted" style={{ fontWeight: 600, letterSpacing: '0.08em' }}>
            MIN
          </span>
        </div>

        <div className="pill-row" style={{ marginTop: 'var(--s-3)' }}>
          {meta.qualities.map((q) => (
            <Pill key={q} color={QUALITY_COLOUR[q]}>
              {QUALITY_LABELS[q]}
            </Pill>
          ))}
          <Pill>Intensité {workout.intensity}/5</Pill>
        </div>

        {plan.note ? (
          <p className="small muted" style={{ marginTop: 'var(--s-4)' }}>
            {plan.note}
          </p>
        ) : null}

        <div style={{ marginTop: 'var(--s-5)' }}>
          {doneToday ? (
            <>
              <Banner>
                Séance du jour terminée. {extensionDoneToday ? 'Extension incluse.' : ''} Repose-toi
                — ou refais-en une si tu en as vraiment envie.
              </Banner>
              <div className="btn-row" style={{ marginTop: 'var(--s-3)' }}>
                <Button variant="ghost" onClick={() => navigate('/seance')}>
                  Voir le détail
                </Button>
                {!extensionDoneToday && extensionWorkout ? (
                  <Button variant="primary" onClick={() => navigate('/seance?extension=1')}>
                    +10 min
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <Button variant="primary" hero onClick={() => navigate('/seance')}>
                Commencer
              </Button>
              <div className="row" style={{ justifyContent: 'center', marginTop: 'var(--s-3)', gap: 'var(--s-2)' }}>
                <Button
                  variant="quiet"
                  small
                  aria-pressed={adjust === -1}
                  onClick={() => setAdjust(adjust === -1 ? 0 : -1)}
                >
                  {adjust === -1 ? '✓ Allégée' : 'Trop difficile ?'}
                </Button>
                <span className="dim">·</span>
                <Button
                  variant="quiet"
                  small
                  aria-pressed={adjust === 1}
                  onClick={() => setAdjust(adjust === 1 ? 0 : 1)}
                >
                  {adjust === 1 ? '✓ Intensifiée' : 'Trop facile ?'}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ le +10 min */}
      {!doneToday && extension && extensionWorkout ? (
        <TapCard
          className="stack-sm"
          style={{ marginTop: 'var(--s-4)' }}
          onClick={() => navigate('/seance?extension=1')}
        >
          <div className="row-between">
            <span className="eyebrow">Envie d’en faire plus ?</span>
            <IconPlus size={18} />
          </div>
          <div className="row-between">
            <strong>
              {extension.template.emoji} {extension.template.title}
            </strong>
            <span className="num muted">
              +{Math.round(extensionWorkout.durationSec / 60)} min
            </span>
          </div>
          <span className="micro dim">{extension.reason}</span>
        </TapCard>
      ) : null}

      {/* ---------------------------------------------------- pourquoi ça */}
      <section style={{ marginTop: 'var(--s-6)' }}>
        <h3 className="section-title">Pourquoi cette séance</h3>
        <Card className="stack-sm">
          {workout.rationale.map((line, i) => (
            <p key={i} className="small muted">
              {line}
            </p>
          ))}
        </Card>
      </section>

      {/* ------------------------------------------------------ état du jour */}
      <section style={{ marginTop: 'var(--s-6)' }}>
        <div className="row-between" style={{ marginBottom: 'var(--s-3)' }}>
          <h3 className="section-title" style={{ marginBottom: 0 }}>
            Récupération estimée
          </h3>
          <button className="btn btn--quiet btn--sm" onClick={() => navigate('/recuperation')}>
            Détail
          </button>
        </div>
        <Card>
          <div className="row-between" style={{ marginBottom: 'var(--s-3)' }}>
            <span className="muted small">Disponibilité globale</span>
            <span className="num" style={{ fontWeight: 700, fontSize: '1.25rem' }}>
              {ready}%
            </span>
          </div>
          <div className="grid-2">
            {RECOVERY_REGIONS.map((region) => (
              <div key={region} className="stack-sm" style={{ gap: 4 }}>
                <div className="row-between micro">
                  <span className="dim">{REGION_LABELS[region]}</span>
                  <span className="num">{recovery[region]}%</span>
                </div>
                <div className="bar">
                  <div
                    className="bar__fill"
                    style={{
                      width: `${recovery[region]}%`,
                      background:
                        recovery[region] > 70
                          ? 'var(--ok)'
                          : recovery[region] > 45
                            ? 'var(--warn)'
                            : 'var(--danger)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ------------------------------------------------------ statistiques */}
      <section style={{ marginTop: 'var(--s-6)' }}>
        <h3 className="section-title">Ton activité</h3>
        <div className="grid-3">
          <Stat value={totals.sessions} label="Séances" />
          <Stat value={`${Math.round(totals.totalSec / 60)}`} label="Minutes" />
          <Stat value={streak.best} label="Meilleure série" />
        </div>
      </section>

      {/* ------------------------------------------------------------ demain */}
      {next ? (
        <section style={{ marginTop: 'var(--s-6)' }}>
          <h3 className="section-title">Ensuite</h3>
          <TapCard className="row-between" onClick={() => navigate('/calendrier')}>
            <span>
              <span style={{ fontWeight: 600 }}>
                {ARCHETYPE_META[next.archetype].emoji} {ARCHETYPE_META[next.archetype].label}
              </span>
              <span className="micro dim" style={{ display: 'block' }}>
                {formatRelative(today, next.date)}
              </span>
            </span>
            <span className="num muted">{next.plannedMinutes} min</span>
          </TapCard>
        </section>
      ) : null}

      {recent[0]?.feedback ? (
        <p className="micro dim" style={{ marginTop: 'var(--s-5)', textAlign: 'center' }}>
          Dernière séance ressentie {RPE_META[recent[0].feedback.overall].emoji}{' '}
          {RPE_META[recent[0].feedback.overall].label.toLowerCase()} — c’est pris en compte
          aujourd’hui.
        </p>
      ) : null}
    </div>
  );
}

function heroPoses(archetype: string) {
  switch (archetype) {
    case 'explosivite':
      return ['squatBottom', 'jumpAir'] as const;
    case 'force':
      return ['pushTop', 'pushBottom'] as const;
    case 'conditioning':
      return ['burpeeStand', 'burpeeCrouch', 'burpeePlank'] as const;
    case 'core-stabilite':
      return ['plank', 'plankTapA'] as const;
    case 'recovery':
      return ['cat', 'cow'] as const;
    default:
      return ['guard', 'jab', 'guard', 'cross'] as const;
  }
}

function formatToday(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    .toUpperCase();
}

function formatRelative(today: string, target: string): string {
  const [ty, tm, td] = today.split('-').map(Number);
  const [ay, am, ad] = target.split('-').map(Number);
  const a = new Date(ty!, (tm ?? 1) - 1, td ?? 1);
  const b = new Date(ay!, (am ?? 1) - 1, ad ?? 1);
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (diff === 1) return 'Demain';
  if (diff <= 6) return b.toLocaleDateString('fr-FR', { weekday: 'long' });
  return b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
