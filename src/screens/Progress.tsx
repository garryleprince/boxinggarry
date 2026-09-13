import { useMemo, useState } from 'react';
import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { findExercise } from '@/data/exercises';
import { addDays, daysBetween, parseDateKey, startOfWeek } from '@/domain/model/ids';
import { computeScore, SCORE_LABELS, chainSnapshot, type ScoreComponent } from '@/engines/scoring';
import { computeStreak, computeTotals, evaluateAchievements } from '@/engines/scoring/achievements';
import { globalLevel } from '@/engines/progression';
import { Banner, Button, Card, Empty, Pill, Sheet, Stat, TapCard } from '@/ui/primitives';
import { BarChart, type Point } from '@/ui/Chart';
import { Header } from '@/ui/Header';
import { IconChart } from '@/ui/icons';

/**
 * Progress (cahier des charges §36, §37, §55).
 *
 * Every figure on this screen can be opened to see what it was computed from.
 * Nothing here is decorative.
 */
export function Progress() {
  const { core, recent, today } = useStore();
  const [openScore, setOpenScore] = useState<ScoreComponent | null>(null);

  const score = useMemo(
    () => computeScore(core.profile, core.progression, core.performances, recent, today),
    [core.profile, core.progression, core.performances, recent, today],
  );
  const totals = useMemo(() => computeTotals(recent), [recent]);
  const streak = useMemo(() => computeStreak(recent, today), [recent, today]);
  const chains = useMemo(() => chainSnapshot(core.progression), [core.progression]);
  const achievements = useMemo(
    () => evaluateAchievements(recent, core.performances, core.achievements, today),
    [recent, core.performances, core.achievements, today],
  );

  /** Minutes trained per week over the last eight weeks. */
  const weekly: Point[] = useMemo(() => {
    const start = startOfWeek(today);
    return Array.from({ length: 8 }, (_, i) => {
      const weekStart = addDays(start, (i - 7) * 7);
      const weekEnd = addDays(weekStart, 6);
      const minutes = core.sessions
        .filter(
          (s) =>
            s.status === 'terminee' &&
            daysBetween(weekStart, s.date) >= 0 &&
            daysBetween(s.date, weekEnd) >= 0,
        )
        .reduce((sum, s) => sum + s.elapsedSec / 60, 0);
      return {
        label: i === 7 ? 'S.' : `${parseDateKey(weekStart).getDate()}`,
        value: Math.round(minutes),
      };
    });
  }, [core.sessions, today]);

  const thisWeek = useMemo(() => {
    const start = startOfWeek(today);
    const list = core.sessions.filter(
      (s) => s.status === 'terminee' && daysBetween(start, s.date) >= 0,
    );
    const mains = list.filter((s) => !s.extensionOf);
    const exts = list.filter((s) => s.extensionOf);
    return {
      sessions: list.length,
      minutes: Math.round(list.reduce((sum, s) => sum + s.elapsedSec / 60, 0)),
      mains: mains.length,
      exts: exts.length,
    };
  }, [core.sessions, today]);

  const records = useMemo(
    () =>
      [...core.performances]
        .filter((p) => findExercise(p.exerciseId))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 8),
    [core.performances],
  );

  return (
    <div className="screen">
      <Header eyebrow="Progression" title="Ton niveau" />

      {/* ------------------------------------------------ score athlétique */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <Card className="stack">
          <div className="row-between">
            <div>
              <div className="eyebrow">Boxing Athlete Score</div>
              <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
                <span className="num" style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>
                  {score.overall ?? '—'}
                </span>
                <span className="muted">/ 100</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="micro dim">Niveau global</div>
              <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {globalLevel(core.progression)}
              </div>
            </div>
          </div>

          {score.basis < 4 ? (
            <Banner>
              Ce score se fiabilise avec les séances. Après {score.basis} séance
              {score.basis > 1 ? 's' : ''}, certaines composantes reposent encore sur peu de données
              — chacune indique sa fiabilité.
            </Banner>
          ) : null}

          <div className="score-list">
            {score.components.map((c) => (
              <button
                key={c.key}
                type="button"
                className="score-row"
                onClick={() => setOpenScore(c)}
                aria-label={`${c.label} : détail du calcul`}
              >
                <div className="row-between">
                  <span className="small muted">{SCORE_LABELS[c.key]}</span>
                  <span className="num small" style={{ fontWeight: 700 }}>
                    {c.value ?? <span className="dim micro">pas de données</span>}
                  </span>
                </div>
                <div className="bar" data-empty={c.value == null}>
                  {c.value != null ? (
                    <div className="bar__fill" style={{ width: `${c.value}%` }} />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
          <p className="micro dim">Touche une ligne pour voir d’où vient le chiffre.</p>
        </Card>
      </section>

      {/* -------------------------------------------------- cette semaine */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Cette semaine</h3>
        <div className="grid-3" style={{ marginBottom: 'var(--s-3)' }}>
          <Stat value={thisWeek.sessions} label="Séances" />
          <Stat value={thisWeek.minutes} label="Minutes" />
          <Stat value={streak.current} label="Série (jours)" />
        </div>
        <Card className="stack-sm">
          <div className="row-between small">
            <span className="dim">Séances standard</span>
            <span className="num">{thisWeek.mains}</span>
          </div>
          <div className="row-between small">
            <span className="dim">Extensions +10 min</span>
            <span className="num">{thisWeek.exts}</span>
          </div>
          <div className="row-between small">
            <span className="dim">Moyenne par séance</span>
            <span className="num">
              {thisWeek.sessions > 0
                ? `${Math.round(thisWeek.minutes / thisWeek.sessions)} min`
                : '—'}
            </span>
          </div>
        </Card>
      </section>

      {/* ----------------------------------------------------- historique */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Minutes par semaine</h3>
        <Card>
          {weekly.some((w) => w.value > 0) ? (
            <BarChart data={weekly} unit=" min" />
          ) : (
            <Empty title="Rien encore" hint="Tes semaines apparaîtront ici après quelques séances." />
          )}
        </Card>
      </section>

      {/* ----------------------------------------------------- les échelles */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Tes échelles de mouvement</h3>
        <div className="stack-sm">
          {chains.map((chain) => (
            <Card key={String(chain.id)}>
              <div className="row-between">
                <span className="small muted">{chain.title}</span>
                <span className="micro dim num">
                  {chain.rank} / {chain.length}
                </span>
              </div>
              <div style={{ fontWeight: 600, margin: '4px 0 8px' }}>{chain.current?.name}</div>
              <div className="bar">
                <div
                  className="bar__fill"
                  style={{
                    width: `${((chain.rank - 1) / Math.max(1, chain.length - 1)) * 100}%`,
                  }}
                />
              </div>
              {chain.next ? (
                <p className="micro dim" style={{ marginTop: 6 }}>
                  Prochaine étape : {chain.next.name}
                </p>
              ) : (
                <p className="micro dim" style={{ marginTop: 6 }}>
                  Dernière marche de cette échelle.
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- records */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Records personnels</h3>
        {records.length === 0 ? (
          <Empty title="Aucun record pour l’instant" hint="Ils se remplissent au fil des séances." />
        ) : (
          <Card className="stack-sm">
            {records.map((p) => (
              <div key={String(p.exerciseId)} className="row-between">
                <span className="small">{findExercise(p.exerciseId)?.name}</span>
                <span className="num small" style={{ fontWeight: 700 }}>
                  {p.best}
                  {p.measure === 'temps' ? ' s' : ' rép.'}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* ------------------------------------------------------- milestones */}
      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Jalons</h3>
        <div className="stack-sm">
          {achievements.map((a) => (
            <Card key={String(a.id)} style={{ opacity: a.unlockedAt ? 1 : 0.72 }}>
              <div className="row-between">
                <span style={{ fontWeight: 600 }}>{a.label}</span>
                {a.unlockedAt ? <Pill tone="signal">Atteint</Pill> : null}
              </div>
              <p className="micro dim" style={{ margin: '2px 0 8px' }}>
                {a.description}
              </p>
              <div className="bar">
                <div
                  className="bar__fill"
                  style={{
                    width: `${(a.progress / a.target) * 100}%`,
                    background: a.unlockedAt ? 'var(--ok)' : 'var(--signal)',
                  }}
                />
              </div>
              <p className="micro dim" style={{ marginTop: 4 }}>
                {a.progress} / {a.target}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <TapCard className="row-between" onClick={() => navigate('/historique')}>
        <span>
          <strong>Historique complet</strong>
          <span className="micro dim" style={{ display: 'block' }}>
            {totals.sessions} séances enregistrées
          </span>
        </span>
        <IconChart size={18} />
      </TapCard>

      <Sheet open={openScore != null} onClose={() => setOpenScore(null)} title={openScore?.label}>
        {openScore ? (
          <div className="stack">
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span className="num" style={{ fontSize: '2.5rem', fontWeight: 700 }}>
                {openScore.value ?? '—'}
              </span>
              <span className="muted">/ 100</span>
              <Pill>Fiabilité {openScore.confidence}</Pill>
            </div>
            <p className="muted small">{openScore.explanation}</p>
            <h3 className="section-title">Calculé à partir de</h3>
            <div className="stack-sm">
              {openScore.inputs.map((input, i) => (
                <div key={i} className="row-between small">
                  <span className="dim">{input.label}</span>
                  <span style={{ textAlign: 'right' }}>{input.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Sheet>

      <Button
        variant="quiet"
        block
        onClick={() => navigate('/objectifs')}
        style={{ marginTop: 'var(--s-4)' }}
      >
        Revoir mes objectifs
      </Button>
    </div>
  );
}
