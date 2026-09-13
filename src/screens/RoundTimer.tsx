import { useMemo, useState } from 'react';
import { useRoute } from '@/app/router';
import { useStore } from '@/app/store';
import { BUILT_IN_PRESETS, presetDuration } from '@/data/presets';
import type { TimerPreset } from '@/domain/model/boxing';
import { makeCustomPreset } from '@/engines/boxing';
import { buildRoundPhases } from '@/engines/timer/phases';
import { formatDuration } from '@/engines/training/duration';
import { useTimer } from '@/app/useTimer';
import { Button, Card, Field, Sheet, Stepper } from '@/ui/primitives';
import { TimerRing } from '@/ui/TimerRing';
import { Header } from '@/ui/Header';
import { IconClose, IconPause, IconPlay, IconSkip, IconBack } from '@/ui/icons';

/** Boxing round timer (cahier des charges §28, §29). */
export function RoundTimer() {
  const route = useRoute();
  const { core } = useStore();
  const savePreset = useStore((s) => s.saveCustomPreset);
  const deletePreset = useStore((s) => s.deleteCustomPreset);

  const presets = useMemo(
    () => [...BUILT_IN_PRESETS, ...core.customPresets],
    [core.customPresets],
  );
  const initial =
    presets.find((p) => String(p.id) === route.params['preset']) ?? presets[0]!;

  const [preset, setPreset] = useState<TimerPreset>(initial);
  const [running, setRunning] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!running) {
    return (
      <div className="screen">
        <Header eyebrow="Boxe" title="Round timer" backTo="/boxe" />

        <div className="stack-sm" style={{ marginBottom: 'var(--s-5)' }}>
          {presets.map((p) => (
            <button
              key={String(p.id)}
              type="button"
              className="choice"
              aria-pressed={String(p.id) === String(preset.id)}
              onClick={() => setPreset(p)}
            >
              <span style={{ display: 'grid', gap: 2, flex: 1 }}>
                <span className="choice__title">{p.name}</span>
                <span className="choice__sub">
                  {p.rounds} rounds · {formatDuration(p.workSec)} de travail ·{' '}
                  {formatDuration(p.restSec)} de repos
                </span>
              </span>
              <span className="micro dim num">{Math.round(presetDuration(p) / 60)} min</span>
            </button>
          ))}
        </div>

        <div className="btn-row" style={{ marginBottom: 'var(--s-5)' }}>
          <Button onClick={() => setEditing(true)}>Personnalisé</Button>
          {!preset.builtIn ? (
            <Button
              variant="danger"
              onClick={() => {
                void deletePreset(String(preset.id));
                setPreset(BUILT_IN_PRESETS[0]!);
              }}
            >
              Supprimer
            </Button>
          ) : null}
        </div>

        <Card style={{ marginBottom: 'var(--s-5)', textAlign: 'center' }}>
          <div className="eyebrow">Durée totale</div>
          <div className="mono" style={{ fontSize: '2.5rem', fontWeight: 700 }}>
            {formatDuration(presetDuration(preset))}
          </div>
          <p className="micro dim">
            {preset.prepSec} s de préparation, puis {preset.rounds} rounds.
          </p>
        </Card>

        <Button variant="primary" hero onClick={() => setRunning(true)}>
          Lancer
        </Button>

        <p className="micro dim" style={{ marginTop: 'var(--s-4)', textAlign: 'center' }}>
          Garde l’application au premier plan : iOS suspend le JavaScript en arrière-plan, les
          signaux sonores ne se déclencheraient pas. Le temps reste juste à ton retour.
        </p>

        <Sheet open={editing} onClose={() => setEditing(false)} title="Minuteur personnalisé">
          <CustomPresetForm
            onSave={async (custom) => {
              await savePreset(custom);
              setPreset(custom);
              setEditing(false);
            }}
          />
        </Sheet>
      </div>
    );
  }

  return <RunningTimer preset={preset} onExit={() => setRunning(false)} />;
}

function RunningTimer({ preset, onExit }: { preset: TimerPreset; onExit: () => void }) {
  const settings = useStore((s) => s.core.settings);
  const phases = useMemo(() => buildRoundPhases(preset), [preset]);
  const [done, setDone] = useState(false);
  const timer = useTimer({ phases, settings, autoStart: true, onFinished: () => setDone(true) });
  const snap = timer.snapshot;
  const phase = snap.phase;
  const isRest = phase?.kind === 'repos-round';
  const tone = isRest ? 'var(--q-mobilite)' : phase?.kind === 'preparation' ? 'var(--q-force)' : 'var(--signal)';

  if (done) {
    return (
      <div className="train" data-kind="preparation">
        <div className="train__body">
          <h1 className="train__exercise">Terminé</h1>
          <div className="mono" style={{ fontSize: '2.5rem', fontWeight: 700 }}>
            {formatDuration(snap.totalSec)}
          </div>
          <p className="muted small">
            {preset.rounds} rounds · {preset.name}
          </p>
        </div>
        <Button variant="primary" hero onClick={onExit}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="train" data-kind={isRest ? 'repos' : 'travail'}>
      <div className="train__top">
        <button className="btn btn--quiet" onClick={onExit} aria-label="Quitter">
          <IconClose />
        </button>
        <span className="eyebrow">{preset.name}</span>
        <span className="micro dim num">
          {formatDuration(snap.elapsedSec)} / {formatDuration(snap.totalSec)}
        </span>
      </div>

      <div className="train__body">
        <TimerRing
          remainingSec={snap.remainingSec}
          progress={snap.phaseProgress}
          tone={tone}
          label={isRest ? 'Repos' : phase?.kind === 'preparation' ? 'Préparation' : 'Round'}
          sublabel={phase?.label}
          size={300}
        />
      </div>

      <div className="train__controls">
        <button className="train__round" onClick={timer.previous} aria-label="Round précédent">
          <IconBack />
        </button>
        <button
          className="train__main"
          data-paused={!snap.running}
          onClick={timer.toggle}
          aria-label={snap.running ? 'Pause' : 'Reprendre'}
        >
          {snap.running ? <IconPause size={26} /> : <IconPlay size={26} />}
        </button>
        <button className="train__round" onClick={timer.skip} aria-label="Round suivant">
          <IconSkip />
        </button>
      </div>
    </div>
  );
}

function CustomPresetForm({ onSave }: { onSave: (preset: TimerPreset) => void }) {
  const [name, setName] = useState('Mon minuteur');
  const [rounds, setRounds] = useState(6);
  const [work, setWork] = useState(120);
  const [rest, setRest] = useState(45);
  const [prep, setPrep] = useState(10);

  const preview = makeCustomPreset(name, rounds, work, rest, prep);

  return (
    <div className="stack">
      <Field label="Nom" htmlFor="preset-name">
        <input
          id="preset-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Nombre de rounds">
        <Stepper label="Rounds" value={rounds} min={1} max={20} onChange={setRounds} />
      </Field>
      <Field label="Durée d’un round">
        <Stepper
          label="Travail"
          value={work}
          min={10}
          max={600}
          step={10}
          onChange={setWork}
          format={formatDuration}
        />
      </Field>
      <Field label="Repos entre les rounds">
        <Stepper
          label="Repos"
          value={rest}
          min={0}
          max={300}
          step={5}
          onChange={setRest}
          format={formatDuration}
        />
      </Field>
      <Field label="Préparation avant le premier round">
        <Stepper
          label="Préparation"
          value={prep}
          min={0}
          max={60}
          step={5}
          onChange={setPrep}
          format={formatDuration}
        />
      </Field>
      <div className="row-between">
        <span className="muted small">Durée totale</span>
        <span className="num" style={{ fontWeight: 700 }}>
          {formatDuration(presetDuration(preview))}
        </span>
      </div>
      <Button variant="primary" hero onClick={() => onSave(preview)}>
        Enregistrer ce minuteur
      </Button>
    </div>
  );
}
