import { useState } from 'react';
import { useStore } from '@/app/store';
import { getExercise } from '@/data/exercises';
import { dateKey } from '@/domain/model/ids';
import type { AssessmentEntry } from '@/domain/model/user';
import {
  ASSESSMENT_TESTS,
  buildAssessment,
  rankFromTest,
  testScore,
} from '@/engines/progression/assessment';
import { chainLength } from '@/data/exercises';
import { Banner, Button, Field } from '@/ui/primitives';
import { Figure } from '@/ui/Figure';
import { TimerEngine } from '@/engines/timer/engine';
import { useEffect, useRef } from 'react';
import { formatDuration } from '@/engines/training/duration';

/**
 * Initial assessment (cahier des charges §12).
 *
 * Six measured tests that set the starting point on the movement ladders. The
 * athlete can skip it — the declared level is then used instead — and can redo
 * it later from the settings screen.
 */
export function Assessment({ onDone }: { onDone?: () => void }) {
  const saveAssessment = useStore((s) => s.saveAssessment);
  const skipAssessment = useStore((s) => s.skipAssessment);
  const [index, setIndex] = useState(-1);
  const [values, setValues] = useState<Record<string, number>>({});

  const test = index >= 0 ? ASSESSMENT_TESTS[index] : null;
  const done = index >= ASSESSMENT_TESTS.length;

  async function finish() {
    const entries: AssessmentEntry[] = ASSESSMENT_TESTS.filter(
      (t) => values[t.id] != null,
    ).map((t) => ({
      exerciseId: t.exerciseId,
      value: values[t.id]!,
      measure: t.measure,
    }));
    await saveAssessment(buildAssessment(dateKey(new Date()), entries));
    onDone?.();
  }

  if (index === -1) {
    return (
      <div className="screen screen--full" style={{ maxWidth: 520 }}>
        <div className="eyebrow">Point de départ</div>
        <h1 className="screen-title" style={{ marginBottom: 'var(--s-4)' }}>
          Évaluation initiale
        </h1>
        <div className="stack">
          <p className="muted">
            Six tests courts, environ huit minutes en tout. Ils servent à placer ton point de départ
            sur chaque échelle de mouvement, pour que la première séance soit déjà au bon niveau.
          </p>
          <Banner>
            Aucun test ne se fait jusqu’à l’échec total. Tu t’arrêtes dès que la technique se
            dégrade : c’est ce chiffre-là qui est utile.
          </Banner>
          <ul className="stack-sm">
            {ASSESSMENT_TESTS.map((t) => (
              <li key={t.id} className="card row" style={{ gap: 'var(--s-4)' }}>
                <div style={{ width: 44, flexShrink: 0 }}>
                  <Figure poses={getExercise(t.exerciseId).poses} still size="100%" />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div className="micro dim">{t.unitLabel}</div>
                </div>
              </li>
            ))}
          </ul>
          <Button variant="primary" hero onClick={() => setIndex(0)}>
            Commencer l’évaluation
          </Button>
          <Button variant="quiet" onClick={() => void skipAssessment().then(() => onDone?.())}>
            Passer pour l’instant
          </Button>
          <p className="micro dim" style={{ textAlign: 'center' }}>
            Si tu passes, ton niveau déclaré sert de point de départ et s’ajuste au fil des séances.
            Tu pourras faire l’évaluation plus tard depuis les paramètres.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    const entries = ASSESSMENT_TESTS.filter((t) => values[t.id] != null);
    return (
      <div className="screen screen--full" style={{ maxWidth: 520 }}>
        <div className="eyebrow">Résultat</div>
        <h1 className="screen-title" style={{ marginBottom: 'var(--s-4)' }}>
          Ton point de départ
        </h1>
        <div className="stack">
          {entries.map((t) => {
            const value = values[t.id]!;
            const rank = rankFromTest(t, value);
            return (
              <div key={t.id} className="card">
                <div className="row-between">
                  <strong>{t.title}</strong>
                  <span className="num" style={{ fontWeight: 700 }}>
                    {t.measure === 'temps' ? formatDuration(value) : value}
                  </span>
                </div>
                <div className="bar" style={{ margin: '10px 0 6px' }}>
                  <div className="bar__fill" style={{ width: `${testScore(t, value)}%` }} />
                </div>
                <div className="micro dim">
                  Niveau {rank} sur {chainLength(t.chain)} de l’échelle correspondante — c’est là que
                  commenceront tes séances.
                </div>
              </div>
            );
          })}
          {entries.length === 0 ? (
            <Banner>Aucun test renseigné. Ton niveau déclaré servira de point de départ.</Banner>
          ) : null}
          <Button variant="primary" hero onClick={finish}>
            C’est parti
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TestRunner
      key={test!.id}
      test={test!}
      index={index}
      total={ASSESSMENT_TESTS.length}
      initial={values[test!.id]}
      onSkip={() => setIndex(index + 1)}
      onSubmit={(value) => {
        setValues((v) => ({ ...v, [test!.id]: value }));
        setIndex(index + 1);
      }}
    />
  );
}

function TestRunner({
  test,
  index,
  total,
  initial,
  onSubmit,
  onSkip,
}: {
  test: (typeof ASSESSMENT_TESTS)[number];
  index: number;
  total: number;
  initial?: number;
  onSubmit: (value: number) => void;
  onSkip: () => void;
}) {
  const exercise = getExercise(test.exerciseId);
  const [value, setValue] = useState<number | ''>(initial ?? '');
  const [remaining, setRemaining] = useState(test.capSec);
  const [running, setRunning] = useState(false);
  const engine = useRef<TimerEngine | null>(null);

  useEffect(() => {
    if (!running || test.capSec === 0) return;
    const t = new TimerEngine([
      { id: 'test', kind: 'travail', durationSec: test.capSec, label: test.title },
    ]);
    engine.current = t;
    t.start();
    const id = window.setInterval(() => {
      const snap = t.tick();
      setRemaining(Math.ceil(snap.remainingSec));
      if (snap.finished) {
        setRunning(false);
        window.clearInterval(id);
      }
    }, 200);
    return () => {
      window.clearInterval(id);
      t.destroy();
    };
  }, [running, test.capSec, test.title]);

  return (
    <div className="screen screen--full" style={{ maxWidth: 520 }}>
      <div className="eyebrow">
        Test {index + 1} sur {total}
      </div>
      <h1 className="screen-title" style={{ marginBottom: 'var(--s-4)' }}>
        {test.title}
      </h1>

      <div className="stack">
        <div className="figure-stage" style={{ height: 190 }}>
          <Figure poses={exercise.poses} label={exercise.name} size={160} />
        </div>
        <p className="muted">{test.instruction}</p>

        {test.capSec > 0 ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: '2.75rem', fontWeight: 700 }}>
              {formatDuration(remaining)}
            </div>
            <Button
              variant={running ? 'ghost' : 'primary'}
              block
              onClick={() => {
                if (running) {
                  setRunning(false);
                } else {
                  setRemaining(test.capSec);
                  setRunning(true);
                }
              }}
              style={{ marginTop: 'var(--s-3)' }}
            >
              {running ? 'Arrêter' : 'Lancer le chrono'}
            </Button>
          </div>
        ) : null}

        <Field label={`Résultat (${test.unitLabel})`} htmlFor="result">
          <input
            id="result"
            className="input"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value ? Number(e.target.value) : '')}
            placeholder="0"
          />
        </Field>

        <Button
          variant="primary"
          hero
          disabled={value === '' || Number(value) < 0}
          onClick={() => onSubmit(Number(value))}
        >
          Valider
        </Button>
        <Button variant="quiet" onClick={onSkip}>
          Passer ce test
        </Button>
      </div>
    </div>
  );
}
