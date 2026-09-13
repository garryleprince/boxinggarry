import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { useTimer } from '@/app/useTimer';
import { getExercise } from '@/data/exercises';
import type { PerformedItem, SessionFeedback } from '@/domain/model/workout';
import { RPE_META, type Rpe } from '@/domain/model/workout';
import { RECOVERY_REGIONS, REGION_LABELS, type RecoveryRegion } from '@/domain/model/taxonomy';
import { buildWorkoutPhases, type WorkPhaseMeta } from '@/engines/timer/phases';
import { formatDuration } from '@/engines/training/duration';
import { Button, Card, Sheet } from '@/ui/primitives';
import { Figure } from '@/ui/Figure';
import { TimerRing } from '@/ui/TimerRing';
import { IconClose, IconPause, IconPlay, IconSkip, IconBack } from '@/ui/icons';

/**
 * Training mode.
 *
 * Once a session starts the interface collapses to what matters at arm's
 * length: what to do, how much of it, how long is left, and what comes next.
 * Everything else is one deliberate tap away (cahier des charges §26).
 */
export function Training() {
  const { active, core } = useStore();
  const persistActive = useStore((s) => s.persistActive);
  const finishSession = useStore((s) => s.finishSession);
  const abandonSession = useStore((s) => s.abandonSession);

  // The session is captured once: its workout does not change mid-session, and
  // a stable reference keeps the persistence effects from re-firing on every
  // store update.
  const [session] = useState(() => active?.session ?? null);
  const [snapshotToRestore] = useState(() => active?.timer ?? null);
  /** True when this mount is picking up a session that was left in flight. */
  const resuming = snapshotToRestore?.started === true && snapshotToRestore.done === false;

  const phases = useMemo(
    () => (session ? buildWorkoutPhases(session.workout) : []),
    [session],
  );

  // Work already recorded is carried over, not discarded: reopening the app
  // mid-session must never cost the athlete a set (cahier des charges §62).
  const [performed, setPerformed] = useState<PerformedItem[]>(() => [
    ...(active?.session.performed ?? []),
  ]);
  const [started, setStarted] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  /**
   * Repetition prompts waiting to be answered, oldest first.
   *
   * A queue rather than a single slot: the timer keeps running while the sheet
   * is open, so a second piece of work can finish before the first has been
   * confirmed. With one slot the earlier answer was silently overwritten and
   * that set was lost from the record.
   */
  const [pendingReps, setPendingReps] = useState<
    { key: string; phase: WorkPhaseMeta; prescribed: number }[]
  >([]);
  const [finished, setFinished] = useState(false);
  const elapsedRef = useRef(0);
  const logging = pendingReps[0] ?? null;

  const recordPhase = useCallback(
    (meta: WorkPhaseMeta, achieved: number, skipped: boolean) => {
      setPerformed((current) => [
        ...current,
        {
          exerciseId: meta.exerciseId as PerformedItem['exerciseId'],
          blockId: meta.blockId,
          round: meta.round,
          prescribed: meta.dose,
          achieved,
          measure: meta.measure,
          skipped,
        },
      ]);
    },
    [],
  );

  const timer = useTimer({
    phases,
    settings: core.settings,
    restoreFrom: snapshotToRestore,
    onPhaseEnd: (phase, index, detail) => {
      const meta = phase.meta as WorkPhaseMeta | undefined;
      if (phase.kind !== 'travail' || !meta) return;

      if (meta.measure === 'temps') {
        // Timed work is measured by the clock: a phase that ran its course was
        // done in full, one that was cut short counts only for what elapsed.
        const achieved =
          detail.reason === 'skip'
            ? Math.round(Math.min(meta.dose, detail.completedSec))
            : meta.dose;
        recordPhase(meta, achieved, achieved === 0);
        return;
      }

      // Skipping a repetition set means it was not done; asking afterwards
      // would be a question about work the athlete deliberately passed on.
      if (detail.reason === 'skip' && detail.completedSec < 2) {
        recordPhase(meta, 0, true);
        return;
      }
      setPendingReps((queue) => [
        ...queue,
        { key: `${phase.id}-${index}`, phase: meta, prescribed: meta.dose },
      ]);
    },
    onFinished: () => setFinished(true),
  });

  elapsedRef.current = timer.snapshot.elapsedSec;

  // Persist the moment a result is recorded, rather than only on a timer:
  // work already done must never be lost to an app the system decides to kill
  // three seconds later (cahier des charges §62).
  useEffect(() => {
    if (!session || !started) return;
    void persistActive(
      { ...session, performed, elapsedSec: Math.round(elapsedRef.current) },
      timer.engine.serialise(),
    );
  }, [session, started, performed, persistActive, timer.engine]);

  // And periodically, so elapsed time and timer position stay current even
  // through a long timed block with nothing to record.
  useEffect(() => {
    if (!session || !started) return;
    const save = () =>
      void persistActive(
        { ...session, performed, elapsedSec: Math.round(elapsedRef.current) },
        timer.engine.serialise(),
      );
    const id = window.setInterval(save, 5000);
    // iOS gives no reliable unload event, but it does hide the page first.
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [session, started, performed, persistActive, timer.engine]);

  useEffect(() => {
    if (!session) navigate('/', { replace: true });
  }, [session]);

  if (!session) return null;

  const snap = timer.snapshot;
  const phase = snap.phase;
  const meta = (phase?.meta ?? {}) as Partial<WorkPhaseMeta>;
  const exercise = meta.exerciseId ? getExercise(meta.exerciseId) : null;
  const tone = phaseTone(phase?.kind);

  // The headline names the movement, whether it is being performed or set up;
  // the ring carries the phase. Showing "En position" in both places, or
  // announcing the exercise you are already looking at as what comes next,
  // wastes the only two lines that matter mid-session.
  const headline =
    phase?.kind === 'repos' || phase?.kind === 'repos-round'
      ? 'Repos'
      : (exercise?.name ?? phase?.label ?? '—');

  const upcoming = nextWorkPhase(phases, snap.phaseIndex);
  const upcomingName =
    upcoming?.meta && typeof upcoming.meta['exerciseId'] === 'string'
      ? getExercise(upcoming.meta['exerciseId'] as string).name
      : upcoming?.label;
  const showUpcoming = upcomingName != null && upcomingName !== headline;

  if (!started) {
    const remaining = Math.max(0, snap.totalSec - (snapshotToRestore?.completedSec ?? 0));
    return (
      <div className="train" data-kind="preparation">
        <div className="train__top">
          <button className="btn btn--quiet" onClick={() => navigate('/seance')} aria-label="Retour">
            <IconBack />
          </button>
          <span className="eyebrow">{session.workout.title}</span>
          <span style={{ width: 36 }} />
        </div>
        <div className="train__body">
          <Figure poses={['guard', 'jab', 'guard', 'cross']} size={160} />
          <h1 className="train__exercise">{resuming ? 'On reprend' : 'Prêt ?'}</h1>
          <p className="muted small" style={{ textAlign: 'center', maxWidth: 320 }}>
            {resuming ? (
              <>
                Tu avais arrêté à {formatDuration(snapshotToRestore?.completedSec ?? 0)}. Il reste{' '}
                {formatDuration(remaining)}, et {performed.length} exercice
                {performed.length > 1 ? 's' : ''} déjà enregistré
                {performed.length > 1 ? 's' : ''}.
              </>
            ) : (
              <>
                {formatDuration(snap.totalSec)} de séance. Le son et le maintien de l’écran
                s’activent au démarrage.
              </>
            )}
          </p>
        </div>
        <Button
          variant="primary"
          hero
          onClick={() => {
            setStarted(true);
            void timer.begin();
          }}
        >
          {resuming ? 'Reprendre' : 'Démarrer'}
        </Button>
      </div>
    );
  }

  if (finished) {
    return (
      <SessionComplete
        elapsedSec={snap.elapsedSec}
        performed={performed}
        onFinish={async (feedback) => {
          const outcome = await finishSession(performed, snap.elapsedSec, feedback);
          navigate(
            outcome
              ? `/bilan?id=${encodeURIComponent(String(outcome.session.id))}`
              : '/',
            { replace: true },
          );
        }}
      />
    );
  }

  return (
    <div className="train" data-kind={phase?.kind ?? 'travail'}>
      <div className="train__top">
        <button className="btn btn--quiet" onClick={() => setShowQuit(true)} aria-label="Quitter">
          <IconClose />
        </button>
        <span className="eyebrow">{String(meta.blockTitle ?? session.workout.title)}</span>
        <span className="micro dim num">
          {formatDuration(snap.elapsedSec)} / {formatDuration(snap.totalSec)}
        </span>
      </div>

      <div className="train__progress">
        <div
          className="bar__fill"
          style={{ width: `${(snap.elapsedSec / Math.max(1, snap.totalSec)) * 100}%`, height: '100%' }}
        />
      </div>

      <div className="train__body">
        {exercise ? (
          <div className="train__figure" style={{ opacity: phase?.kind === 'travail' ? 1 : 0.45 }}>
            <Figure
              poses={exercise.poses}
              size="100%"
              cycleSec={2.2}
              still={phase?.kind !== 'travail'}
              label={exercise.name}
            />
          </div>
        ) : null}

        <h1 className="train__exercise">{headline}</h1>

        {phase?.kind === 'travail' && meta.measure === 'reps' ? (
          <div className="train__dose num">
            {meta.dose} répétitions{meta.side ? ` · côté ${meta.side}` : ''}
          </div>
        ) : phase?.kind === 'travail' && meta.side ? (
          <div className="muted small">Côté {meta.side}</div>
        ) : null}

        <TimerRing
          remainingSec={snap.remainingSec}
          progress={snap.phaseProgress}
          tone={tone}
          label={phaseLabel(phase?.kind)}
          sublabel={
            meta.rounds && meta.rounds > 1 ? `Série ${meta.round} / ${meta.rounds}` : undefined
          }
          size={260}
        />

        {showUpcoming ? (
          <p className="train__next">
            Ensuite : <strong style={{ color: 'var(--text-2)' }}>{upcomingName}</strong>
          </p>
        ) : null}
      </div>

      <div className="stack-sm">
        <div className="train__controls">
          <button className="train__round" onClick={timer.previous} aria-label="Phase précédente">
            <IconBack />
          </button>
          <button
            className="train__main"
            data-paused={!snap.running}
            onClick={timer.toggle}
            aria-label={snap.running ? 'Mettre en pause' : 'Reprendre'}
          >
            {snap.running ? <IconPause size={26} /> : <IconPlay size={26} />}
          </button>
          <button className="train__round" onClick={timer.skip} aria-label="Phase suivante">
            <IconSkip />
          </button>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 'var(--s-2)' }}>
          <Button variant="quiet" small onClick={() => timer.adjust(-10)}>
            −10 s
          </Button>
          <Button variant="quiet" small onClick={() => timer.adjust(10)}>
            +10 s
          </Button>
        </div>
      </div>

      {/* ---------------------------------------- saisie des répétitions */}
      <Sheet
        open={logging != null}
        onClose={() => {
          // Dismissing without answering records the prescribed dose: the work
          // was done, only the confirmation was skipped.
          if (logging) recordPhase(logging.phase, logging.prescribed, false);
          setPendingReps((queue) => queue.slice(1));
        }}
        title="Combien de répétitions ?"
      >
        {logging ? (
          <RepLogger
            key={logging.key}
            prescribed={logging.prescribed}
            exerciseName={getExercise(logging.phase.exerciseId).name}
            remaining={pendingReps.length - 1}
            onSubmit={(value) => {
              recordPhase(logging.phase, value, false);
              setPendingReps((queue) => queue.slice(1));
            }}
          />
        ) : null}
      </Sheet>

      {/* --------------------------------------------------- abandon */}
      <Sheet open={showQuit} onClose={() => setShowQuit(false)} title="Quitter la séance ?">
        <p className="muted small" style={{ marginBottom: 'var(--s-4)' }}>
          Ce que tu as déjà fait sera enregistré. Rien n’est perdu.
        </p>
        <div className="stack-sm">
          <Button block onClick={() => setShowQuit(false)}>
            Continuer la séance
          </Button>
          <Button
            block
            variant="ghost"
            onClick={() => {
              timer.pause();
              setFinished(true);
              setShowQuit(false);
            }}
          >
            Terminer ici et enregistrer
          </Button>
          <Button
            block
            variant="danger"
            onClick={async () => {
              await abandonSession(performed, snap.elapsedSec);
              navigate('/', { replace: true });
            }}
          >
            Abandonner
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function RepLogger({
  prescribed,
  exerciseName,
  remaining,
  onSubmit,
}: {
  prescribed: number;
  exerciseName: string;
  remaining: number;
  onSubmit: (value: number) => void;
}) {
  const [value, setValue] = useState(prescribed);
  return (
    <div className="stack">
      <p className="muted small">
        {exerciseName}
        {remaining > 0 ? (
          <span className="dim"> · {remaining} série{remaining > 1 ? 's' : ''} en attente</span>
        ) : null}
      </p>
      <div className="stepper">
        <button
          className="stepper__btn"
          onClick={() => setValue((v) => Math.max(0, v - 1))}
          aria-label="Une répétition de moins"
        >
          −
        </button>
        <div className="stepper__value num">{value}</div>
        <button
          className="stepper__btn"
          onClick={() => setValue((v) => v + 1)}
          aria-label="Une répétition de plus"
        >
          +
        </button>
      </div>
      <p className="micro dim" style={{ textAlign: 'center' }}>
        {value === prescribed
          ? 'Comme prévu.'
          : value > prescribed
            ? `${value - prescribed} de plus que prévu.`
            : `${prescribed - value} de moins que prévu — c’est noté, la suite s’adapte.`}
      </p>
      <Button variant="primary" hero onClick={() => onSubmit(value)}>
        Valider
      </Button>
    </div>
  );
}

/** End-of-session: results, then the honest offer of ten more minutes. */
function SessionComplete({
  elapsedSec,
  performed,
  onFinish,
}: {
  elapsedSec: number;
  performed: readonly PerformedItem[];
  onFinish: (feedback: SessionFeedback) => Promise<void>;
}) {
  const [overall, setOverall] = useState<Rpe | null>(null);
  const [regions, setRegions] = useState<Partial<Record<RecoveryRegion, Rpe>>>({});
  const [detail, setDetail] = useState(false);
  const [busy, setBusy] = useState(false);

  const completed = performed.filter((p) => !p.skipped).length;

  return (
    <div className="train" data-kind="preparation">
      <div className="train__body" style={{ alignContent: 'start', paddingTop: 'var(--s-5)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="eyebrow">Séance terminée</div>
          <div className="mono" style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
            {formatDuration(elapsedSec)}
          </div>
          <p className="muted small">{completed} exercices réalisés</p>
        </div>

        <Card className="stack" style={{ width: '100%' }}>
          <h2 style={{ fontSize: 'var(--t-body)', fontWeight: 700 }}>Comment était la séance ?</h2>
          <div className="rpe-row">
            {([1, 2, 3, 4, 5] as Rpe[]).map((value) => (
              <button
                key={value}
                type="button"
                className="rpe"
                aria-pressed={overall === value}
                onClick={() => setOverall(value)}
              >
                <span className="rpe__emoji">{RPE_META[value].emoji}</span>
                <span className="rpe__label">{RPE_META[value].label}</span>
              </button>
            ))}
          </div>

          <button className="btn btn--quiet btn--sm" onClick={() => setDetail((d) => !d)}>
            {detail ? 'Masquer le détail' : 'Préciser par zone'}
          </button>

          {detail ? (
            <div className="stack-sm">
              {RECOVERY_REGIONS.map((region) => (
                <div key={region}>
                  <div className="micro dim" style={{ marginBottom: 4 }}>
                    {REGION_LABELS[region]}
                  </div>
                  <div className="rpe-row">
                    {([1, 2, 3, 4, 5] as Rpe[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="rpe rpe--compact"
                        aria-pressed={regions[region] === value}
                        onClick={() =>
                          setRegions((r) => ({
                            ...r,
                            [region]: r[region] === value ? undefined : value,
                          }))
                        }
                      >
                        <span className="rpe__emoji">{RPE_META[value].emoji}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      <Button
        variant="primary"
        hero
        disabled={overall == null || busy}
        onClick={async () => {
          if (overall == null) return;
          setBusy(true);
          const cleaned = Object.fromEntries(
            Object.entries(regions).filter(([, v]) => v != null),
          ) as Partial<Record<RecoveryRegion, Rpe>>;
          await onFinish({
            overall,
            ...(Object.keys(cleaned).length > 0 ? { regions: cleaned } : {}),
          });
        }}
      >
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </div>
  );
}

/** The next phase that is actual work, skipping rests and repositioning. */
function nextWorkPhase(
  phases: readonly { kind: string; label: string; meta?: Record<string, unknown> }[],
  from: number,
) {
  for (let i = from + 1; i < phases.length; i++) {
    if (phases[i]!.kind === 'travail') return phases[i]!;
  }
  return undefined;
}

const phaseTone = (kind?: string): string => {
  switch (kind) {
    case 'repos':
    case 'repos-round':
      return 'var(--q-mobilite)';
    case 'transition':
    case 'preparation':
      return 'var(--q-force)';
    default:
      return 'var(--signal)';
  }
};

const phaseLabel = (kind?: string): string => {
  switch (kind) {
    case 'repos':
    case 'repos-round':
      return 'Repos';
    case 'transition':
      return 'En position';
    case 'preparation':
      return 'Préparation';
    default:
      return 'Travail';
  }
};
