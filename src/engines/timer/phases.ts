import { getExercise } from '@/data/exercises';
import type { TimerPreset } from '@/domain/model/boxing';
import type { Workout, WorkoutBlock, WorkoutItem } from '@/domain/model/workout';
import { BLOCK_TRANSITION_SEC, itemWorkSec } from '@/engines/training/duration';
import type { TimerPhase } from './engine';

/**
 * Turns a workout into the exact sequence of phases the timer plays.
 *
 * The sum of the phase durations equals `computeDuration` for the same
 * workout — the same arithmetic drives the promise on the dashboard and the
 * clock during the session, so they can never disagree.
 */

export interface WorkPhaseMeta extends Record<string, unknown> {
  readonly exerciseId: string;
  readonly blockId: string;
  readonly blockTitle: string;
  readonly round: number;
  readonly rounds: number;
  readonly itemIndex: number;
  readonly itemCount: number;
  readonly dose: number;
  readonly measure: 'reps' | 'temps';
  readonly side?: 'droit' | 'gauche';
  readonly combo?: readonly number[];
}

const sideLabel = (side: 'droit' | 'gauche') => (side === 'droit' ? 'Côté droit' : 'Côté gauche');

function workPhases(
  block: WorkoutBlock,
  item: WorkoutItem,
  itemIndex: number,
  round: number,
): TimerPhase[] {
  const ex = getExercise(item.exerciseId);
  const perSideSec = itemWorkSec(item) / (item.perSide ? 2 : 1);
  const base: Omit<WorkPhaseMeta, 'side'> = {
    exerciseId: String(item.exerciseId),
    blockId: block.id,
    blockTitle: block.title,
    round: round + 1,
    rounds: block.rounds,
    itemIndex,
    itemCount: block.items.length,
    dose: item.dose,
    measure: item.measure,
    ...(item.combo ? { combo: item.combo } : {}),
  };

  const sides: ('droit' | 'gauche')[] = item.perSide ? ['droit', 'gauche'] : [];
  if (sides.length === 0) {
    return [
      {
        id: `${block.id}-r${round}-i${itemIndex}`,
        kind: 'travail',
        durationSec: perSideSec,
        label: ex.shortName ?? ex.name,
        sublabel: item.measure === 'temps' ? `${item.dose} s` : `${item.dose} répétitions`,
        meta: base,
      },
    ];
  }

  return sides.map((side) => ({
    id: `${block.id}-r${round}-i${itemIndex}-${side}`,
    kind: 'travail' as const,
    durationSec: perSideSec,
    label: ex.shortName ?? ex.name,
    sublabel: `${sideLabel(side)} · ${
      item.measure === 'temps' ? `${item.dose} s` : `${item.dose} répétitions`
    }`,
    meta: { ...base, side },
  }));
}

export function buildWorkoutPhases(workout: Workout): TimerPhase[] {
  const phases: TimerPhase[] = [];
  const blocks = workout.blocks.filter((b) => b.items.length > 0);

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) {
      phases.push({
        id: `${block.id}-entree`,
        kind: 'transition',
        durationSec: BLOCK_TRANSITION_SEC,
        label: block.title,
        sublabel: block.intent,
        meta: { blockId: block.id, blockTitle: block.title },
      });
    }

    for (let round = 0; round < block.rounds; round++) {
      block.items.forEach((item, itemIndex) => {
        const ex = getExercise(item.exerciseId);
        phases.push({
          id: `${block.id}-r${round}-i${itemIndex}-prep`,
          kind: 'transition',
          durationSec: item.transition,
          label: 'En position',
          sublabel: ex.shortName ?? ex.name,
          meta: {
            exerciseId: String(item.exerciseId),
            blockId: block.id,
            blockTitle: block.title,
            round: round + 1,
            rounds: block.rounds,
            itemIndex,
            itemCount: block.items.length,
            dose: item.dose,
            measure: item.measure,
          },
        });
        phases.push(...workPhases(block, item, itemIndex, round));

        if (itemIndex < block.items.length - 1 && item.restAfter > 0) {
          const next = block.items[itemIndex + 1]!;
          phases.push({
            id: `${block.id}-r${round}-i${itemIndex}-rest`,
            kind: 'repos',
            durationSec: item.restAfter,
            label: 'Repos',
            sublabel: `Ensuite : ${getExercise(next.exerciseId).shortName ?? getExercise(next.exerciseId).name}`,
            meta: { blockId: block.id, nextExerciseId: String(next.exerciseId) },
          });
        }
      });

      if (round < block.rounds - 1 && block.restBetweenRounds > 0) {
        const first = block.items[0]!;
        phases.push({
          id: `${block.id}-r${round}-round-rest`,
          kind: 'repos-round',
          durationSec: block.restBetweenRounds,
          label: 'Repos',
          sublabel: `Série ${round + 2} / ${block.rounds}`,
          meta: { blockId: block.id, nextExerciseId: String(first.exerciseId) },
        });
      }
    }
  });

  return phases;
}

/** Phases for the standalone boxing round timer. */
export function buildRoundPhases(preset: TimerPreset, roundLabels?: readonly string[]): TimerPhase[] {
  const phases: TimerPhase[] = [];
  if (preset.prepSec > 0) {
    phases.push({
      id: 'prep',
      kind: 'preparation',
      durationSec: preset.prepSec,
      label: 'Préparation',
      sublabel: `${preset.rounds} rounds · ${preset.name}`,
      meta: { round: 0 },
    });
  }
  for (let r = 0; r < preset.rounds; r++) {
    phases.push({
      id: `round-${r}`,
      kind: 'travail',
      durationSec: preset.workSec,
      label: `Round ${r + 1} / ${preset.rounds}`,
      ...(roundLabels?.[r] ? { sublabel: roundLabels[r]! } : {}),
      meta: { round: r + 1, rounds: preset.rounds },
    });
    if (r < preset.rounds - 1 && preset.restSec > 0) {
      phases.push({
        id: `rest-${r}`,
        kind: 'repos-round',
        durationSec: preset.restSec,
        label: 'Repos',
        sublabel: `Round ${r + 2} ensuite`,
        meta: { round: r + 1, rounds: preset.rounds },
      });
    }
  }
  return phases;
}

export const phasesDuration = (phases: readonly TimerPhase[]): number =>
  phases.reduce((s, p) => s + p.durationSec, 0);
