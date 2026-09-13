import { useEffect, useMemo, useState } from 'react';
import { useRoute, navigate } from '@/app/router';
import { useStore } from '@/app/store';
import { findExercise } from '@/data/exercises';
import type { SessionId } from '@/domain/model/ids';
import { parseDateKey } from '@/domain/model/ids';
import { ARCHETYPE_META, RPE_META } from '@/domain/model/workout';
import type { WorkoutSession } from '@/domain/model/workout';
import { formatDuration } from '@/engines/training/duration';
import { Card, Empty, Pill, Sheet } from '@/ui/primitives';
import { LineChart, type Point } from '@/ui/Chart';
import { Header } from '@/ui/Header';
import { ARCHETYPE_COLOUR } from '@/ui/colours';

/**
 * History (cahier des charges §39).
 *
 * Every session that was planned or performed, with what was actually done,
 * how long it really took, how it felt, and whether the +10 was added.
 */
export function History() {
  const route = useRoute();
  const { core } = useStore();
  const loadSession = useStore((s) => s.loadSession);
  const [open, setOpen] = useState<WorkoutSession | null>(null);
  const [exercise, setExercise] = useState<string | null>(null);

  const sessions = useMemo(
    () => [...core.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [core.sessions],
  );

  useEffect(() => {
    const id = route.params['id'] as SessionId | undefined;
    if (id) void loadSession(id).then(setOpen);
  }, [route.params, loadSession]);

  /** Best result per session for one exercise, oldest first. */
  const selected = exercise ? core.performances.find((p) => String(p.exerciseId) === exercise) : undefined;
  const series: Point[] = useMemo(
    () =>
      (selected?.history ?? []).map((h) => ({
        label: parseDateKey(h.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        value: h.value,
      })),
    [selected],
  );

  if (sessions.length === 0) {
    return (
      <div className="screen">
        <Header eyebrow="Historique" title="Tes séances" backTo="/progression" />
        <Empty
          title="Aucune séance pour le moment"
          hint="Ta première séance apparaîtra ici dès qu’elle sera terminée."
        />
      </div>
    );
  }

  const byMonth = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const label = parseDateKey(s.date).toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    });
    byMonth.set(label, [...(byMonth.get(label) ?? []), s]);
  }

  return (
    <div className="screen">
      <Header eyebrow="Historique" title="Tes séances" backTo="/progression" />

      <div className="stack">
        {[...byMonth.entries()].map(([month, list]) => (
          <section key={month}>
            <h3 className="section-title" style={{ textTransform: 'capitalize' }}>
              {month}
            </h3>
            <div className="stack-sm">
              {list.map((s) => {
                const meta = ARCHETYPE_META[s.archetype];
                return (
                  <button
                    key={String(s.id)}
                    type="button"
                    className="card card--tap row-between"
                    onClick={() => void loadSession(s.id).then(setOpen)}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 600, display: 'block' }}>
                        {meta.emoji} {s.title}
                        {s.extensionOf ? ' · +10' : ''}
                      </span>
                      <span className="micro dim">
                        {parseDateKey(s.date).toLocaleDateString('fr-FR', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
                        {' · '}
                        {formatDuration(s.elapsedSec)}
                        {s.status === 'abandonnee' ? ' · interrompue' : ''}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 6, flexShrink: 0 }}>
                      {s.rpe ? <span>{RPE_META[s.rpe].emoji}</span> : null}
                      <span
                        className="day__mark"
                        style={{ background: ARCHETYPE_COLOUR[s.archetype] }}
                        aria-hidden
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Sheet open={open != null} onClose={() => setOpen(null)} title={open?.workout.title}>
        {open ? <SessionDetail session={open} onExercise={setExercise} /> : null}
      </Sheet>

      <Sheet open={exercise != null} onClose={() => setExercise(null)} title={
        exercise ? (findExercise(exercise)?.name ?? exercise) : undefined
      }>
        {series.length >= 2 ? (
          <div className="stack">
            <LineChart data={series} unit={selected?.measure === 'temps' ? ' s' : ' rép.'} />
            <div className="row-between small">
              <span className="dim">Record</span>
              <span className="num" style={{ fontWeight: 700 }}>
                {selected?.best}
                {selected?.measure === 'temps' ? ' s' : ' rép.'}
              </span>
            </div>
            <div className="row-between small">
              <span className="dim">Volume cumulé</span>
              <span className="num">{Math.round(selected?.totalVolume ?? 0)}</span>
            </div>
            <div className="row-between small">
              <span className="dim">Séances avec cet exercice</span>
              <span className="num">{selected?.sessions ?? 0}</span>
            </div>
          </div>
        ) : (
          <Empty
            title="Pas encore assez de données"
            hint="L’évolution apparaît après plusieurs séances contenant cet exercice."
          />
        )}
      </Sheet>
    </div>
  );
}

function SessionDetail({
  session,
  onExercise,
}: {
  session: WorkoutSession;
  onExercise: (id: string) => void;
}) {
  const byExercise = new Map<string, { prescribed: number; achieved: number; measure: string }>();
  for (const p of session.performed) {
    const key = String(p.substitutedFor ?? p.exerciseId);
    const agg = byExercise.get(key) ?? { prescribed: 0, achieved: 0, measure: p.measure };
    agg.prescribed += p.prescribed;
    agg.achieved += p.skipped ? 0 : p.achieved;
    byExercise.set(key, agg);
  }

  return (
    <div className="stack">
      <div className="row-between">
        <span className="muted small">
          {parseDateKey(session.date).toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </span>
        <span className="num" style={{ fontWeight: 700 }}>
          {formatDuration(session.elapsedSec)}
        </span>
      </div>

      <div className="pill-row">
        <Pill>{session.workout.kind === 'extension' ? 'Extension +10' : 'Séance 20 min'}</Pill>
        {session.feedback ? (
          <Pill tone="signal">
            {RPE_META[session.feedback.overall].emoji} {RPE_META[session.feedback.overall].label}
          </Pill>
        ) : null}
        <Pill>Prévu {formatDuration(session.workout.durationSec)}</Pill>
      </div>

      {byExercise.size === 0 ? (
        <Empty title="Aucune performance enregistrée pour cette séance." />
      ) : (
        <>
          <h3 className="section-title">Performances</h3>
          <div className="stack-sm">
            {[...byExercise.entries()].map(([id, agg]) => (
              <button
                key={id}
                type="button"
                className="row-between"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => onExercise(id)}
              >
                <span className="small">{findExercise(id)?.name ?? id}</span>
                <span className="num small">
                  {agg.achieved}
                  {agg.measure === 'temps' ? ' s' : ''}
                  <span className="dim"> / {agg.prescribed}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">Programme prévu</h3>
      <div className="stack-sm">
        {session.workout.blocks.map((b) => (
          <Card key={b.id}>
            <div style={{ fontWeight: 600 }}>{b.title}</div>
            <p className="micro dim">
              {b.items
                .map((i) => findExercise(i.exerciseId)?.name ?? String(i.exerciseId))
                .join(' · ')}
            </p>
          </Card>
        ))}
      </div>

      {session.workout.kind === 'principal' ? (
        <button
          type="button"
          className="btn btn--quiet btn--block"
          onClick={() => navigate('/calendrier')}
        >
          Voir le calendrier
        </button>
      ) : null}
    </div>
  );
}
