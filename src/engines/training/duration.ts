import type { Workout, WorkoutBlock, WorkoutItem } from '@/domain/model/workout';

/**
 * Duration arithmetic.
 *
 * Every second of a session is accounted for here: work, rest, and the seconds
 * spent getting from one position to the next. The generator, the audit screen
 * and the tests all call the same functions, so a session can never *look*
 * like 20 minutes while actually being longer (cahier des charges §64).
 */

/** Hard ceiling for a standard session: 20:00, warm-up and cool-down included. */
export const MAIN_BUDGET_SEC = 20 * 60;
/** Hard ceiling for the optional +10 module. */
export const EXTENSION_BUDGET_SEC = 10 * 60;
/** Hard ceiling for a session plus its extension. */
export const COMBINED_BUDGET_SEC = MAIN_BUDGET_SEC + EXTENSION_BUDGET_SEC;

/** Seconds allowed to move between two blocks (read the next block, reposition). */
export const BLOCK_TRANSITION_SEC = 8;

export const DEFAULT_SECONDS_PER_REP = 3;

/** Seconds of work for one item, counting both sides of a unilateral exercise. */
export function itemWorkSec(item: WorkoutItem): number {
  const tempo = item.secondsPerRep > 0 ? item.secondsPerRep : DEFAULT_SECONDS_PER_REP;
  const oneSide = item.measure === 'temps' ? item.dose : item.dose * tempo;
  return item.perSide ? oneSide * 2 : oneSide;
}

/** Total seconds of one block, including its internal rests and transitions. */
export function computeBlockDuration(block: WorkoutBlock): number {
  if (block.items.length === 0) return 0;
  let total = 0;
  for (let round = 0; round < block.rounds; round++) {
    for (let i = 0; i < block.items.length; i++) {
      const item = block.items[i]!;
      total += item.transition + itemWorkSec(item);
      // Rest inside a round; the last item is followed by the round rest instead.
      if (i < block.items.length - 1) total += item.restAfter;
    }
    if (round < block.rounds - 1) total += block.restBetweenRounds;
  }
  return total;
}

/** Total seconds of a workout, including the pauses between blocks. */
export function computeDuration(blocks: readonly WorkoutBlock[]): number {
  const nonEmpty = blocks.filter((b) => b.items.length > 0);
  const blockTime = nonEmpty.reduce((sum, b) => sum + computeBlockDuration(b), 0);
  return blockTime + Math.max(0, nonEmpty.length - 1) * BLOCK_TRANSITION_SEC;
}

export interface DurationAudit {
  readonly totalSec: number;
  readonly budgetSec: number;
  readonly withinBudget: boolean;
  readonly blocks: readonly { readonly id: string; readonly title: string; readonly sec: number }[];
  readonly transitionsSec: number;
}

/** A per-block breakdown, shown in the session preview and used by the tests. */
export function auditDuration(
  blocks: readonly WorkoutBlock[],
  budgetSec: number,
): DurationAudit {
  const nonEmpty = blocks.filter((b) => b.items.length > 0);
  const perBlock = nonEmpty.map((b) => ({
    id: b.id,
    title: b.title,
    sec: computeBlockDuration(b),
  }));
  const transitionsSec = Math.max(0, nonEmpty.length - 1) * BLOCK_TRANSITION_SEC;
  const totalSec = perBlock.reduce((s, b) => s + b.sec, 0) + transitionsSec;
  return { totalSec, budgetSec, withinBudget: totalSec <= budgetSec, blocks: perBlock, transitionsSec };
}

/** Budget for a workout of this kind. */
export const budgetFor = (kind: Workout['kind']): number =>
  kind === 'extension' ? EXTENSION_BUDGET_SEC : MAIN_BUDGET_SEC;

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "20 min", "12 min 30" — for headlines rather than timers. */
export function formatMinutes(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m} min` : `${m} min ${rem}`;
}
