import { findExercise, getChain, exerciseAtRank } from '@/data/exercises';
import { MUSCLE_LABELS, PATTERN_LABELS, QUALITY_LABELS, EQUIPMENT_LABELS } from '@/domain/model/taxonomy';
import { Pill, Sheet } from '@/ui/primitives';
import { FigureSequence } from '@/ui/Figure';
import { QUALITY_COLOUR } from '@/ui/colours';

/**
 * Exercise detail.
 *
 * The whole coaching record: how it is performed, what usually goes wrong,
 * how to breathe, why a boxer does it, and where it sits on its ladder.
 */
export function ExerciseSheet({
  exerciseId,
  onClose,
}: {
  exerciseId: string | null;
  onClose: () => void;
}) {
  const ex = exerciseId ? findExercise(exerciseId) : undefined;
  return (
    <Sheet open={ex != null} onClose={onClose} title={ex?.name}>
      {ex ? <ExerciseDetail id={ex.id} /> : null}
    </Sheet>
  );
}

export function ExerciseDetail({ id }: { id: string }) {
  const ex = findExercise(id);
  if (!ex) return null;
  const chain = ex.chain ? getChain(ex.chain) : undefined;
  const rank = ex.rank ?? 1;

  return (
    <div className="stack">
      {ex.media ? (
        <div className="figure-stage">
          {ex.media.kind === 'video' ? (
            <video src={ex.media.src} autoPlay loop muted playsInline style={{ width: '100%' }} />
          ) : (
            <img src={ex.media.src} alt={ex.name} style={{ width: '100%' }} />
          )}
        </div>
      ) : (
        <FigureSequence poses={ex.poses} label={`Décomposition : ${ex.name}`} />
      )}

      <p className="muted">{ex.description}</p>

      <div className="pill-row">
        <Pill>Niveau {ex.level}/5</Pill>
        <Pill>{PATTERN_LABELS[ex.pattern]}</Pill>
        {ex.qualities.slice(0, 3).map((q) => (
          <Pill key={q} color={QUALITY_COLOUR[q]}>
            {QUALITY_LABELS[q]}
          </Pill>
        ))}
        {ex.unilateral ? <Pill>Unilatéral</Pill> : null}
        <Pill>Impact {ex.impact}</Pill>
      </div>

      <section>
        <h3 className="section-title">Consignes</h3>
        <ul className="bullets">
          {ex.coaching.cues.map((cue, i) => (
            <li key={i}>{cue}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="section-title">Erreurs fréquentes</h3>
        <ul className="bullets bullets--warn">
          {ex.coaching.mistakes.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="section-title">Respiration</h3>
        <p className="small muted">{ex.coaching.breathing}</p>
      </section>

      {ex.coaching.boxing ? (
        <section>
          <h3 className="section-title">Pour la boxe</h3>
          <p className="small muted">{ex.coaching.boxing}</p>
        </section>
      ) : null}

      <section>
        <h3 className="section-title">Muscles</h3>
        <div className="pill-row">
          {ex.primary.map((m) => (
            <Pill key={m} tone="signal">
              {MUSCLE_LABELS[m]}
            </Pill>
          ))}
          {ex.secondary.map((m) => (
            <Pill key={m}>{MUSCLE_LABELS[m]}</Pill>
          ))}
        </div>
      </section>

      {chain ? (
        <section>
          <h3 className="section-title">{chain.name} — progression</h3>
          <ol className="ladder">
            {chain.steps.map((stepId, i) => {
              const step = findExercise(stepId);
              const current = i + 1 === rank;
              return (
                <li key={stepId} className="ladder__step" data-current={current}>
                  <span className="ladder__rank num">{i + 1}</span>
                  <span style={{ fontWeight: current ? 700 : 400 }}>{step?.name ?? stepId}</span>
                </li>
              );
            })}
          </ol>
          {exerciseAtRank(chain.id, rank + 1) ? (
            <p className="micro dim" style={{ marginTop: 'var(--s-2)' }}>
              Étape suivante : {exerciseAtRank(chain.id, rank + 1)?.name}. Elle arrive
              automatiquement quand tes séances montrent que c’est le moment.
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h3 className="section-title">Matériel</h3>
        <p className="small muted">
          {ex.equipment.map((e) => EQUIPMENT_LABELS[e]).join(' ou ')}
        </p>
      </section>
    </div>
  );
}
