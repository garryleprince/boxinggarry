import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/app/store';
import { BUILT_IN_PRESETS } from '@/data/presets';
import type { CalloutDensity, TimerPreset } from '@/domain/model/boxing';
import { DENSITY_INTERVAL } from '@/domain/model/boxing';
import { buildShadowPlan, scheduleCallouts, type Callout } from '@/engines/boxing';
import { buildRoundPhases } from '@/engines/timer/phases';
import { formatDuration } from '@/engines/training/duration';
import { useTimer } from '@/app/useTimer';
import { Button, Card, Choice, Pill, Stepper } from '@/ui/primitives';
import { TimerRing } from '@/ui/TimerRing';
import { Figure } from '@/ui/Figure';
import { Header } from '@/ui/Header';
import { IconClose, IconPause, IconPlay, IconSkip } from '@/ui/icons';

/**
 * Shadowboxing (cahier des charges §31, §33).
 *
 * Guided rounds with called combinations. The notation is always on screen in
 * large type — the voice is an addition, never the only channel, because iOS
 * speech can be unavailable or muted.
 */
export function Shadowboxing() {
  const { core } = useStore();
  const [rounds, setRounds] = useState(5);
  const [roundSec, setRoundSec] = useState(120);
  const [restSec, setRestSec] = useState(45);
  const [density, setDensity] = useState<CalloutDensity>('normale');
  const [running, setRunning] = useState(false);

  const plan = useMemo(
    () =>
      buildShadowPlan({
        boxingLevel: core.profile?.boxingLevel ?? 'loisir',
        rounds,
        density,
        seed: `${rounds}-${density}`,
      }),
    [core.profile?.boxingLevel, rounds, density],
  );

  const preset: TimerPreset = useMemo(
    () => ({
      id: 'shadow' as TimerPreset['id'],
      name: 'Shadowboxing',
      rounds,
      workSec: roundSec,
      restSec,
      prepSec: 10,
      builtIn: false,
    }),
    [rounds, roundSec, restSec],
  );

  if (running) {
    return (
      <ShadowSession
        preset={preset}
        plan={plan}
        lang={core.profile ? core.settings.voiceLang : 'fr'}
        onExit={() => setRunning(false)}
      />
    );
  }

  const total = 10 + rounds * roundSec + Math.max(0, rounds - 1) * restSec;

  return (
    <div className="screen">
      <Header eyebrow="Boxe" title="Shadowboxing" backTo="/boxe" />

      <Card className="stack" style={{ marginBottom: 'var(--s-5)' }}>
        <div className="row-between">
          <div>
            <div className="eyebrow">Durée totale</div>
            <div className="mono" style={{ fontSize: '2.25rem', fontWeight: 700 }}>
              {formatDuration(total)}
            </div>
          </div>
          <div style={{ width: 58 }}>
            <Figure poses={['guard', 'jab', 'guard', 'cross']} size="100%" cycleSec={2} cadence="vif" />
          </div>
        </div>
      </Card>

      <div className="stack" style={{ marginBottom: 'var(--s-5)' }}>
        <div className="field">
          <span className="field__label">Rounds</span>
          <Stepper label="Rounds" value={rounds} min={1} max={12} onChange={setRounds} />
        </div>
        <div className="field">
          <span className="field__label">Durée d’un round</span>
          <Stepper
            label="Round"
            value={roundSec}
            min={30}
            max={300}
            step={15}
            onChange={setRoundSec}
            format={formatDuration}
          />
        </div>
        <div className="field">
          <span className="field__label">Repos</span>
          <Stepper
            label="Repos"
            value={restSec}
            min={0}
            max={180}
            step={5}
            onChange={setRestSec}
            format={formatDuration}
          />
        </div>
      </div>

      <section style={{ marginBottom: 'var(--s-5)' }}>
        <h3 className="section-title">Densité des appels</h3>
        <div className="stack-sm">
          {(['legere', 'normale', 'dense'] as CalloutDensity[]).map((d) => (
            <Choice
              key={d}
              title={d === 'legere' ? 'Légère' : d === 'normale' ? 'Normale' : 'Dense'}
              sub={`Une combinaison toutes les ${DENSITY_INTERVAL[d]} secondes environ`}
              selected={density === d}
              onSelect={() => setDensity(d)}
            />
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 'var(--s-6)' }}>
        <h3 className="section-title">Programme des rounds</h3>
        <div className="stack-sm">
          {plan.map((round) => (
            <Card key={round.index}>
              <div className="row-between">
                <strong>
                  Round {round.index} — {round.title}
                </strong>
              </div>
              <p className="micro dim" style={{ margin: '4px 0 8px' }}>
                {round.instruction}
              </p>
              <div className="pill-row">
                {round.combos.slice(0, 4).map((combo) => (
                  <Pill key={combo.id}>{combo.tokens.join(' — ')}</Pill>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Button variant="primary" hero onClick={() => setRunning(true)}>
        Lancer les rounds
      </Button>
    </div>
  );
}

function ShadowSession({
  preset,
  plan,
  lang,
  onExit,
}: {
  preset: TimerPreset;
  plan: ReturnType<typeof buildShadowPlan>;
  lang: 'fr' | 'en';
  onExit: () => void;
}) {
  const settings = useStore((s) => s.core.settings);
  const labels = plan.map((r) => `${r.title} — ${r.instruction}`);
  const phases = useMemo(() => buildRoundPhases(preset, labels), [preset, labels.join('|')]);
  const [done, setDone] = useState(false);
  const [callout, setCallout] = useState<Callout | null>(null);
  const spoken = useRef(new Set<string>());

  const timer = useTimer({
    phases,
    settings,
    autoStart: true,
    onPhaseStart: () => {
      spoken.current.clear();
      setCallout(null);
    },
    onFinished: () => setDone(true),
  });

  const snap = timer.snapshot;
  const phase = snap.phase;
  const roundIndex = typeof phase?.meta?.['round'] === 'number' ? (phase.meta['round'] as number) : 0;
  const round = plan[roundIndex - 1];
  const isWork = phase?.kind === 'travail' && roundIndex > 0;

  const callouts = useMemo(
    () => (round ? scheduleCallouts(round, preset.workSec, lang, roundIndex) : []),
    [round, preset.workSec, lang, roundIndex],
  );

  // Fire the combination whose scheduled moment has just passed.
  useEffect(() => {
    if (!isWork || callouts.length === 0) return;
    const elapsedInRound = preset.workSec - snap.remainingSec;
    const due = callouts.filter((c) => c.atSec <= elapsedInRound);
    const latest = due[due.length - 1];
    if (!latest) return;
    const key = `${roundIndex}:${latest.atSec}`;
    if (spoken.current.has(key)) return;
    spoken.current.add(key);
    setCallout(latest);
    timer.audio.speak(latest.speech);
  }, [isWork, callouts, snap.remainingSec, preset.workSec, roundIndex, timer.audio]);

  if (done) {
    return (
      <div className="train" data-kind="preparation">
        <div className="train__body">
          <h1 className="train__exercise">Rounds terminés</h1>
          <div className="mono" style={{ fontSize: '2.5rem', fontWeight: 700 }}>
            {formatDuration(snap.totalSec)}
          </div>
        </div>
        <Button variant="primary" hero onClick={onExit}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="train" data-kind={isWork ? 'travail' : 'repos'}>
      <div className="train__top">
        <button className="btn btn--quiet" onClick={onExit} aria-label="Quitter">
          <IconClose />
        </button>
        <span className="eyebrow">{round ? round.title : 'Shadowboxing'}</span>
        <span className="micro dim num">
          {formatDuration(snap.elapsedSec)} / {formatDuration(snap.totalSec)}
        </span>
      </div>

      <div className="train__body">
        {isWork && callout ? (
          <div className="combo-callout" key={`${roundIndex}-${callout.atSec}`} aria-live="polite">
            {callout.notation}
          </div>
        ) : (
          <div className="train__figure">
            <Figure poses={['guard', 'jab', 'guard', 'cross']} size="100%" cycleSec={1.8} cadence="vif" />
          </div>
        )}

        <TimerRing
          remainingSec={snap.remainingSec}
          progress={snap.phaseProgress}
          tone={isWork ? 'var(--signal)' : 'var(--q-mobilite)'}
          label={isWork ? `Round ${roundIndex} / ${preset.rounds}` : 'Repos'}
          {...(callout ? { sublabel: callout.speech } : {})}
          size={240}
        />

        {isWork && round ? (
          <p className="train__next" style={{ maxWidth: 320 }}>
            {round.instruction}
          </p>
        ) : null}
      </div>

      <div className="train__controls">
        <span />
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

export { BUILT_IN_PRESETS };
