import { CHAIN_IDS, chainLength, getExercise } from '@/data/exercises';
import type { ChainId, DateKey } from '@/domain/model/ids';
import { daysBetween } from '@/domain/model/ids';
import type { ProgressionState, SportLevel } from '@/domain/model/user';
import type { PerformedItem, SessionFeedback } from '@/domain/model/workout';
import { clamp } from '@/lib/rng';

/**
 * Progression engine.
 *
 * Progress is a move along a movement chain — wall push-up → incline → knees →
 * full → tempo → diamond → explosive → clapping — not merely more repetitions
 * (cahier des charges §22). Each chain carries a rank and a credit counter;
 * credit accumulates from sessions that went well and drains from sessions
 * that did not.
 */

/** Credit needed to move up one rank. */
export const RANK_UP_THRESHOLD = 3;
/** Credit (negative) at which a rank is given back. */
export const RANK_DOWN_THRESHOLD = -2;

/** Days of inactivity tolerated before the engine starts recalibrating. */
export const LAYOFF_GRACE_DAYS = 5;
/** Floor on the calibration factor, however long the break. */
export const MIN_CALIBRATION = 0.55;
/** Calibration regained per completed session during the ramp back. */
export const RAMP_RECOVERY = 0.12;

/** Where each declared level starts, as a fraction along every chain. */
const START_FRACTION: Record<SportLevel, number> = {
  debutant: 0.15,
  intermediaire: 0.45,
  avance: 0.7,
};

export function initialProgression(level: SportLevel): ProgressionState {
  const fraction = START_FRACTION[level];
  const chains: Record<string, { rank: number; credit: number }> = {};
  for (const id of CHAIN_IDS) {
    const max = Math.max(1, chainLength(id));
    // Proportional, not absolute: rank 3 of an eight-step push ladder is knee
    // push-ups, which is not where an advanced athlete belongs.
    chains[id] = { rank: clamp(Math.round(1 + fraction * (max - 1)), 1, max), credit: 0 };
  }
  return { chains, rampSessions: 99, calibration: 1 };
}

export const rankOf = (state: ProgressionState, chain: ChainId | string): number =>
  state.chains[chain]?.rank ?? 1;

/**
 * The rank actually used for programming. After a layoff this sits below the
 * stored rank and climbs back as sessions are completed, so the first session
 * back is never the one that was due before the break (cahier des charges §23).
 */
export function effectiveRank(state: ProgressionState, chain: ChainId | string): number {
  const rank = rankOf(state, chain);
  const drop = Math.round((1 - state.calibration) * 6);
  return clamp(rank - drop, 1, Math.max(1, chainLength(chain)));
}

/** Volume multiplier applied to every prescription while ramping back. */
export const doseScale = (state: ProgressionState): number =>
  clamp(0.75 + state.calibration * 0.25, 0.75, 1);

/**
 * Recalibrate after time away. Called on app open, before any session is
 * generated, so the plan reflects the break immediately.
 */
export function applyLayoff(
  state: ProgressionState,
  lastSessionDate: DateKey | null,
  today: DateKey,
): ProgressionState {
  if (!lastSessionDate) return state;
  const gap = daysBetween(lastSessionDate, today);
  if (gap <= LAYOFF_GRACE_DAYS) return state;

  // Detraining is gradual, not a cliff: about 3.5 % per day past the grace period.
  const calibration = clamp(1 - (gap - LAYOFF_GRACE_DAYS) * 0.035, MIN_CALIBRATION, 1);
  if (calibration >= state.calibration) return state;
  return { ...state, calibration, rampSessions: 0 };
}

function creditFor(feedbackScore: number, ratio: number): number {
  // `ratio` is achieved / prescribed across the chain's exercises this session.
  let credit: number;
  if (feedbackScore >= 5) credit = 1.5;
  else if (feedbackScore === 4) credit = 1;
  else if (feedbackScore === 3) credit = 0.5;
  else if (feedbackScore === 2) credit = 0.1;
  else credit = -0.75;

  if (ratio < 0.7) credit = Math.min(credit, -0.5);
  else if (ratio < 0.9 && credit > 0) credit *= 0.5;
  return credit;
}

/** Update chain ranks from one completed session. */
export function applySession(
  state: ProgressionState,
  performed: readonly PerformedItem[],
  feedback: SessionFeedback | undefined,
): ProgressionState {
  const score = feedback?.overall ?? 3;

  // Aggregate prescribed vs achieved per chain.
  const perChain = new Map<string, { prescribed: number; achieved: number }>();
  for (const p of performed) {
    const ex = getExercise(p.substitutedFor ?? p.exerciseId);
    if (!ex.chain) continue;
    const agg = perChain.get(ex.chain) ?? { prescribed: 0, achieved: 0 };
    agg.prescribed += p.prescribed;
    agg.achieved += p.skipped ? 0 : p.achieved;
    perChain.set(ex.chain, agg);
  }

  const chains = { ...state.chains };
  for (const [id, agg] of perChain) {
    const current = chains[id] ?? { rank: 1, credit: 0 };
    const ratio = agg.prescribed > 0 ? agg.achieved / agg.prescribed : 1;
    let credit = current.credit + creditFor(score, ratio);
    let rank = current.rank;
    const max = Math.max(1, chainLength(id));

    if (credit >= RANK_UP_THRESHOLD && rank < max) {
      rank += 1;
      credit = 0.5; // carry a little momentum into the new rank
    } else if (credit >= RANK_UP_THRESHOLD) {
      credit = RANK_UP_THRESHOLD; // already at the top of the chain
    } else if (credit <= RANK_DOWN_THRESHOLD && rank > 1) {
      rank -= 1;
      credit = 0;
    } else if (credit <= RANK_DOWN_THRESHOLD) {
      credit = RANK_DOWN_THRESHOLD;
    }
    chains[id] = { rank, credit };
  }

  const rampSessions = state.rampSessions + 1;
  const calibration =
    state.calibration >= 1 ? 1 : clamp(state.calibration + RAMP_RECOVERY, MIN_CALIBRATION, 1);

  return { chains, rampSessions, calibration };
}

/** Mean progress along the chains, 0 (start of every ladder) … 1 (top). */
export function chainProgress(state: ProgressionState): number {
  const ids = CHAIN_IDS.filter((id) => chainLength(id) > 1);
  if (ids.length === 0) return 0;
  const normalised = ids.map(
    (id) => (rankOf(state, id) - 1) / Math.max(1, chainLength(id) - 1),
  );
  return normalised.reduce((a, b) => a + b, 0) / normalised.length;
}

/** Overall training level, 1…5, averaged across the chains. Shown in progress. */
export function globalLevel(state: ProgressionState): number {
  return Math.round((1 + chainProgress(state) * 4) * 10) / 10;
}

export function isRampingBack(state: ProgressionState): boolean {
  return state.calibration < 1;
}
