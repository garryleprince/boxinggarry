import { useEffect, useMemo, useState } from 'react';
import { navigate, useRoute } from '@/app/router';
import { useStore } from '@/app/store';
import { getExercise } from '@/data/exercises';
import type { SessionId } from '@/domain/model/ids';
import type { WorkoutSession } from '@/domain/model/workout';
import { RPE_META } from '@/domain/model/workout';
import { REGION_LABELS, RECOVERY_REGIONS } from '@/domain/model/taxonomy';
import { formatDuration } from '@/engines/training/duration';
import { recoveryPercent } from '@/engines/recovery';
import { Banner, Button, Card, Pill } from '@/ui/primitives';
import { Header } from '@/ui/Header';

/**
 * End of session (cahier des charges §54).
 *
 * What was done, what it changed, and then — never before — the optional
 * ten extra minutes.
 */
export function SessionSummary() {
  const route = useRoute();
  const id = route.params['id'] as SessionId | undefined;
  const { core, recent, extension, extensionWorkout, today } = useStore();
  const loadSession = useStore((s) => s.loadSession);
  const [session, setSession] = useState<WorkoutSession | null>(null);

  useEffect(() => {
    if (!id) return;
    void loadSession(id).then(setSession);
  }, [id, loadSession]);

  const recovery = useMemo(() => recoveryPercent(core.recovery), [core.recovery]);
  const extensionDone = recent.some((s) => s.date === today && s.extensionOf);

  if (!session) {
    return (
      <div className="screen">
        <Header title="Bilan" backTo="/" />
        <p className="muted">Séance introuvable.</p>
      </div>
    );
  }

  const isExtension = session.workout.kind === 'extension';
  const byExercise = new Map<string, { prescribed: number; achieved: number; measure: string }>();
  for (const p of session.performed) {
    const key = String(p.substitutedFor ?? p.exerciseId);
    const agg = byExercise.get(key) ?? { prescribed: 0, achieved: 0, measure: p.measure };
    agg.prescribed += p.prescribed;
    agg.achieved += p.skipped ? 0 : p.achieved;
    byExercise.set(key, agg);
  }

  return (
    <div className="screen">
      <Header eyebrow="Bilan" title="Séance terminée" backTo="/" />

      <Card style={{ textAlign: 'center', marginBottom: 'var(--s-5)' }}>
        <div className="eyebrow">{session.workout.title}</div>
        <div className="mono" style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
          {formatDuration(session.elapsedSec)}
        </div>
        {session.feedback ? (
          <Pill tone="signal">
            {RPE_META[session.feedback.overall].emoji} {RPE_META[session.feedback.overall].label}
          </Pill>
        ) : null}
        {session.status === 'abandonnee' ? (
          <p className="micro dim" style={{ marginTop: 8 }}>
            Séance interrompue — le travail réalisé a bien été enregistré.
          </p>
        ) : null}
      </Card>

      {byExercise.size > 0 ? (
        <section style={{ marginBottom: 'var(--s-5)' }}>
          <h3 className="section-title">Ce que tu as fait</h3>
          <Card className="stack-sm">
            {[...byExercise.entries()].map(([exerciseId, agg]) => {
              const ex = safeExercise(exerciseId);
              const ratio = agg.prescribed > 0 ? agg.achieved / agg.prescribed : 1;
              return (
                <div key={exerciseId} className="row-between">
                  <span className="small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ex}
                  </span>
                  <span className="num small" style={{ color: ratio >= 1 ? 'var(--ok)' : 'var(--text-2)' }}>
                    {agg.achieved}
                    {agg.measure === 'temps' ? ' s' : ''}
                    <span className="dim"> / {agg.prescribed}</span>
                  </span>
                </div>
              );
            })}
          </Card>
        </section>
      ) : null}

      <section style={{ marginBottom: 'var(--s-5)' }}>
        <h3 className="section-title">Récupération estimée après cette séance</h3>
        <Card className="grid-2">
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
        </Card>
        <p className="micro dim" style={{ marginTop: 'var(--s-2)' }}>
          Estimations d’entraînement destinées à orienter les prochaines séances. Ce ne sont pas des
          mesures physiologiques.
        </p>
      </section>

      {!isExtension && !extensionDone && extension && extensionWorkout ? (
        <section style={{ marginBottom: 'var(--s-5)' }}>
          <h3 className="section-title">Envie de continuer ?</h3>
          <Card className="stack">
            <div className="row-between">
              <strong>
                {extension.template.emoji} {extension.template.title}
              </strong>
              <span className="num muted">
                +{Math.round(extensionWorkout.durationSec / 60)} min
              </span>
            </div>
            <p className="small muted">{extension.template.blurb}</p>
            <p className="micro dim">{extension.reason}</p>
            <Button variant="primary" block onClick={() => navigate('/seance?extension=1')}>
              +10 min
            </Button>
          </Card>
        </section>
      ) : null}

      {isExtension ? (
        <Banner>
          Extension terminée. Elle est comptabilisée séparément de la séance de 20 minutes dans tes
          statistiques.
        </Banner>
      ) : null}

      <Button variant="ghost" block onClick={() => navigate('/')} style={{ marginTop: 'var(--s-4)' }}>
        Terminer
      </Button>
    </div>
  );
}

function safeExercise(id: string): string {
  try {
    return getExercise(id).name;
  } catch {
    return id;
  }
}
