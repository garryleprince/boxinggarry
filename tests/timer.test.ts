import { describe, expect, it, vi } from 'vitest';
import { TimerEngine, type TimerEvent, type TimerPhase } from '@/engines/timer/engine';
import { buildRoundPhases, buildWorkoutPhases, phasesDuration } from '@/engines/timer/phases';
import { BUILT_IN_PRESETS, presetDuration } from '@/data/presets';
import { computeDuration } from '@/engines/training/duration';
import { generateWorkout } from '@/engines/training/generator';
import { ARCHETYPES } from '@/domain/model/workout';
import { freshRecovery, profile, progressionFor, TODAY } from './fixtures';

/** A controllable clock, so the timer can be tested without waiting. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

const phases = (...spec: [string, number][]): TimerPhase[] =>
  spec.map(([label, durationSec]) => ({
    id: label,
    kind: 'travail' as const,
    durationSec,
    label,
  }));

describe('moteur de timer', () => {
  it('décompte à partir d’horodatages, pas d’un compteur décrémenté', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 30]), { clock: clock.now });
    t.start();
    expect(t.snapshot().remainingSec).toBe(30);
    clock.advance(10_000);
    expect(t.tick().remainingSec).toBe(20);
    // No ticks at all for the next ten seconds: the timer is still correct.
    clock.advance(10_000);
    expect(t.tick().remainingSec).toBe(10);
  });

  it('reste juste après une suspension longue de JavaScript', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 20], ['b', 20], ['c', 20]), { clock: clock.now });
    t.start();
    // The tab is frozen for 50 s: two phases elapsed while nothing ran.
    clock.advance(50_000);
    const snap = t.tick();
    expect(snap.phase?.label).toBe('c');
    expect(snap.remainingSec).toBe(10);
    expect(snap.elapsedSec).toBe(50);
  });

  it('ferme toutes les phases traversées, dans l’ordre', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 5], ['b', 5], ['c', 5]), { clock: clock.now });
    const seen: string[] = [];
    t.subscribe((e: TimerEvent) => {
      if (e.type === 'phase-start') seen.push(`start:${e.phase.label}`);
      if (e.type === 'phase-end') seen.push(`end:${e.phase.label}`);
    });
    t.start();
    clock.advance(12_000);
    t.tick();
    expect(seen).toEqual([
      'start:a',
      'end:a',
      'start:b',
      'end:b',
      'start:c',
    ]);
  });

  it('met en pause et reprend sans perdre une seconde', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 60]), { clock: clock.now });
    t.start();
    clock.advance(20_000);
    t.tick();
    t.pause();
    expect(t.isRunning).toBe(false);
    // Ten minutes paused must not consume the phase.
    clock.advance(600_000);
    expect(t.tick().remainingSec).toBe(40);
    t.resume();
    clock.advance(10_000);
    expect(t.tick().remainingSec).toBe(30);
  });

  it('le temps écoulé exclut le temps en pause', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 60]), { clock: clock.now });
    t.start();
    clock.advance(15_000);
    t.tick();
    t.pause();
    clock.advance(300_000);
    t.resume();
    clock.advance(5_000);
    expect(t.tick().elapsedSec).toBe(20);
  });

  it('passe à la phase suivante et comptabilise le temps réellement passé', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 60], ['b', 30]), { clock: clock.now });
    t.start();
    clock.advance(10_000);
    t.tick();
    t.skip();
    expect(t.currentPhase?.label).toBe('b');
    expect(t.snapshot().elapsedSec).toBe(10);
  });

  it('revient à la phase précédente', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 20], ['b', 20]), { clock: clock.now });
    t.start();
    clock.advance(25_000);
    t.tick();
    expect(t.currentPhase?.label).toBe('b');
    t.previous();
    expect(t.currentPhase?.label).toBe('a');
    expect(t.snapshot().remainingSec).toBe(20);
  });

  it('émet le compte à rebours une seule fois par seconde marquée', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 10]), { clock: clock.now });
    const counts: number[] = [];
    t.subscribe((e) => {
      if (e.type === 'countdown') counts.push(e.secondsLeft);
    });
    t.start();
    for (let i = 0; i < 100; i++) {
      clock.advance(100);
      t.tick();
    }
    expect(counts).toEqual([3, 2, 1]);
  });

  it('termine proprement et signale la fin une seule fois', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 5]), { clock: clock.now });
    const finished = vi.fn();
    t.subscribe((e) => {
      if (e.type === 'finished') finished();
    });
    t.start();
    clock.advance(10_000);
    t.tick();
    t.tick();
    t.tick();
    expect(t.isFinished).toBe(true);
    expect(t.snapshot().remainingSec).toBe(0);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('ajoute ou retire du temps à la phase en cours', () => {
    const clock = fakeClock();
    const t = new TimerEngine(phases(['a', 30]), { clock: clock.now });
    t.start();
    t.adjust(15);
    expect(t.tick().remainingSec).toBe(45);
    t.adjust(-30);
    expect(t.tick().remainingSec).toBe(15);
  });

  it('se restaure après un rechargement de l’application en pleine séance', () => {
    const clock = fakeClock();
    const spec = phases(['a', 30], ['b', 30]);
    const first = new TimerEngine(spec, { clock: clock.now });
    first.start();
    clock.advance(40_000);
    first.tick();
    const saved = first.serialise();

    const restored = new TimerEngine(spec, { clock: clock.now });
    restored.restore(saved);
    const snap = restored.tick();
    expect(snap.phase?.label).toBe('b');
    expect(Math.round(snap.remainingSec)).toBe(20);
  });

  it('ne bloque pas sur une liste de phases vide', () => {
    const t = new TimerEngine([], { clock: () => 0 });
    t.start();
    expect(t.isFinished).toBe(true);
    expect(t.tick().remainingSec).toBe(0);
  });
});

describe('phases d’une séance', () => {
  it('la somme des phases est exactement la durée calculée de la séance', () => {
    const p = profile();
    for (const archetype of ARCHETYPES) {
      const w = generateWorkout({
        profile: p,
        progression: progressionFor(p),
        recovery: freshRecovery(),
        history: [],
        date: TODAY,
        archetype,
      });
      expect(phasesDuration(buildWorkoutPhases(w)), archetype).toBe(computeDuration(w.blocks));
      expect(phasesDuration(buildWorkoutPhases(w))).toBe(w.durationSec);
    }
  });

  it('découpe les exercices unilatéraux en deux phases, une par côté', () => {
    const p = profile();
    const w = generateWorkout({
      profile: p,
      progression: progressionFor(p),
      recovery: freshRecovery(),
      history: [],
      date: TODAY,
      archetype: 'core-stabilite',
    });
    const unilateral = w.blocks.flatMap((b) => b.items).filter((i) => i.perSide);
    const built = buildWorkoutPhases(w);
    for (const item of unilateral) {
      const sides = built.filter(
        (ph) => ph.kind === 'travail' && ph.meta?.['exerciseId'] === String(item.exerciseId),
      );
      expect(sides.length % 2).toBe(0);
      expect(sides.some((ph) => ph.meta?.['side'] === 'droit')).toBe(true);
      expect(sides.some((ph) => ph.meta?.['side'] === 'gauche')).toBe(true);
    }
  });

  it('annonce toujours l’exercice suivant pendant un repos', () => {
    const p = profile();
    const w = generateWorkout({
      profile: p,
      progression: progressionFor(p),
      recovery: freshRecovery(),
      history: [],
      date: TODAY,
      archetype: 'conditioning',
    });
    const rests = buildWorkoutPhases(w).filter((ph) => ph.kind === 'repos' || ph.kind === 'repos-round');
    expect(rests.length).toBeGreaterThan(0);
    for (const rest of rests) expect(rest.sublabel).toBeTruthy();
  });
});

describe('round timer de boxe', () => {
  it('chaque preset a la structure et la durée annoncées', () => {
    for (const preset of BUILT_IN_PRESETS) {
      const built = buildRoundPhases(preset);
      expect(phasesDuration(built)).toBe(presetDuration(preset));
      expect(built.filter((p) => p.kind === 'travail')).toHaveLength(preset.rounds);
      // No rest after the final round.
      expect(built[built.length - 1]?.kind).toBe('travail');
      expect(built.filter((p) => p.kind === 'repos-round')).toHaveLength(preset.rounds - 1);
    }
  });

  it('joue les rounds dans l’ordre avec le repos entre chaque', () => {
    const clock = fakeClock();
    const preset = BUILT_IN_PRESETS.find((p) => p.name === 'Tabata')!;
    const t = new TimerEngine(buildRoundPhases(preset), { clock: clock.now });
    const order: string[] = [];
    t.subscribe((e) => {
      if (e.type === 'phase-start') order.push(e.phase.kind);
    });
    t.start();
    clock.advance(presetDuration(preset) * 1000 + 1000);
    t.tick();
    expect(t.isFinished).toBe(true);
    expect(order[0]).toBe('preparation');
    expect(order.filter((k) => k === 'travail')).toHaveLength(preset.rounds);
  });
});
