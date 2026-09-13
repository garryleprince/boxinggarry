import { EXERCISES, chainLength, exerciseAtRank, getExercise } from '@/data/exercises';
import type { Exercise } from '@/domain/model/exercise';
import type { ExerciseId } from '@/domain/model/ids';
import type { Goal, ProgressionState, RecoveryState, UserProfile } from '@/domain/model/user';
import type { Impact, MuscleGroup, Quality } from '@/domain/model/taxonomy';
import { IMPACT_RANK, MUSCLE_REGION, SPACE_RANK } from '@/domain/model/taxonomy';
import { balanceDebt } from '@/engines/recovery';
import { chainProgress, effectiveRank } from '@/engines/progression';
import { clamp, weightedPick, type Rng } from '@/lib/rng';
import type { SlotSpec } from './templates';

/**
 * Exercise selection.
 *
 * Hard constraints (equipment, space, exclusions, joint impact) filter the
 * pool; everything else is a weighted score. The engine then picks from the
 * best candidates with the session's seeded generator, which keeps sessions
 * varied without ever picking something inappropriate.
 */

/** How much each goal pulls on each physical quality. */
const GOAL_QUALITY_WEIGHTS: Record<Goal, Partial<Record<Quality, number>>> = {
  cardio: { cardio: 1, conditioning: 0.8, 'endurance-musculaire': 0.4 },
  'endurance-boxe': {
    conditioning: 1,
    'endurance-musculaire': 0.9,
    cardio: 0.7,
    coordination: 0.5,
  },
  explosivite: { explosivite: 1, puissance: 0.9, vitesse: 0.7 },
  force: { force: 1, stabilite: 0.4 },
  'endurance-musculaire': { 'endurance-musculaire': 1, conditioning: 0.6, force: 0.3 },
  'perte-de-gras': { conditioning: 1, cardio: 0.9, 'endurance-musculaire': 0.5 },
  'masse-musculaire': { force: 1, 'endurance-musculaire': 0.7 },
  jambes: { force: 0.6, explosivite: 0.6, equilibre: 0.4 },
  core: { core: 1, stabilite: 0.8 },
  mobilite: { mobilite: 1, stabilite: 0.4, equilibre: 0.4 },
  'condition-generale': {
    force: 0.6,
    conditioning: 0.6,
    cardio: 0.6,
    core: 0.6,
    mobilite: 0.5,
    explosivite: 0.5,
  },
};

export interface SelectionContext {
  readonly profile: UserProfile;
  readonly progression: ProgressionState;
  readonly recovery: RecoveryState;
  /** Exercise ids used recently, mapped to a 0…1 recency weight (1 = today). */
  readonly recent: ReadonlyMap<string, number>;
  readonly maxImpact: Impact;
  /** Ceiling on exercise.intensity, lowered when the athlete is fatigued. */
  readonly maxIntensity: number;
  readonly rng: Rng;
}

/** Quality weights derived from the athlete's goals, normalised to a 0…1 peak. */
export function goalWeights(goals: readonly Goal[]): Partial<Record<Quality, number>> {
  const out: Partial<Record<Quality, number>> = {};
  for (const g of goals) {
    for (const [q, w] of Object.entries(GOAL_QUALITY_WEIGHTS[g] ?? {})) {
      out[q as Quality] = (out[q as Quality] ?? 0) + (w ?? 0);
    }
  }
  const max = Math.max(1, ...Object.values(out).map((v) => v ?? 0));
  for (const k of Object.keys(out) as Quality[]) out[k] = (out[k] ?? 0) / max;
  return out;
}

function equipmentAvailable(ex: Exercise, profile: UserProfile): boolean {
  // An exercise lists the equipment options that make it possible; any one is enough.
  return ex.equipment.some((e) => e === 'aucun' || profile.equipment.includes(e));
}

/** Hard constraints. An exercise failing any of these is never prescribed. */
export function isEligible(ex: Exercise, slot: SlotSpec, ctx: SelectionContext): boolean {
  const { profile } = ctx;
  if (profile.excluded.includes(ex.id)) return false;
  if (profile.avoidPatterns.includes(ex.pattern)) return false;
  if (!slot.patterns.includes(ex.pattern)) return false;
  if (!equipmentAvailable(ex, profile)) return false;
  if (SPACE_RANK[ex.space] > SPACE_RANK[profile.space]) return false;

  // A slot's ceiling narrows the fatigue-driven cap; it must never raise it,
  // or a tired athlete gets plyometrics because a template allowed them.
  const impactCap = Math.min(
    IMPACT_RANK[ctx.maxImpact],
    slot.maxImpact ? IMPACT_RANK[slot.maxImpact] : IMPACT_RANK[ctx.maxImpact],
  );
  if (IMPACT_RANK[ex.impact] > impactCap) return false;

  const skillCap = slot.maxSkill ?? 5;
  if (ex.skill > skillCap) return false;

  if (slot.stretch && ex.stretch && ex.stretch !== slot.stretch) return false;

  // Mobility and cool-down work is never capped by fatigue — it is the remedy.
  const intensityCap = Math.min(ctx.maxIntensity, slot.maxIntensity ?? 5);
  if (ex.pattern !== 'mobility' && ex.intensity > intensityCap) return false;

  // Exercises outside a progression chain get no rank to sit at, so they are
  // capped by the athlete's overall level instead. Without this a beginner is
  // handed level-3 movements simply because they scored well on goal fit.
  if (!ex.chain && ex.pattern !== 'mobility' && ex.level > unchainedLevelCap(ctx)) return false;
  return true;
}

/**
 * Level ceiling for exercises that belong to no chain: one step above where the
 * athlete currently trains, so there is headroom without absurd jumps.
 */
export function unchainedLevelCap(ctx: SelectionContext): number {
  return Math.round(1 + globalRankNorm(ctx) * 4 * ctx.progression.calibration) + 1;
}

/**
 * Candidate pool for a slot. Exercises belonging to a progression chain are
 * represented only by the rank the athlete has actually reached (and the one
 * just below, so a tired day can step down), which is what makes progression
 * a movement ladder rather than a rep count.
 */
export function candidatesFor(slot: SlotSpec, ctx: SelectionContext): Exercise[] {
  const chainPicks = new Map<string, Set<string>>();
  for (const ex of EXERCISES) {
    if (!ex.chain || chainPicks.has(ex.chain)) continue;
    const rank = effectiveRank(ctx.progression, ex.chain);
    const allowed = new Set<string>();

    // Take the current step and the one below it — but if either is ineligible
    // (equipment the athlete does not own, an excluded movement), keep walking
    // down the ladder. A missing chair must never empty a whole block.
    for (let r = rank; r >= 1 && allowed.size < 2; r--) {
      const pick = exerciseAtRank(ex.chain, r);
      if (pick && isEligible(pick, slot, ctx)) allowed.add(pick.id);
    }
    // Nothing below works either: look upward before giving up on the chain.
    for (let r = rank + 1; allowed.size === 0 && r <= chainLength(ex.chain); r++) {
      const pick = exerciseAtRank(ex.chain, r);
      if (pick && isEligible(pick, slot, ctx)) allowed.add(pick.id);
    }
    chainPicks.set(ex.chain, allowed);
  }

  return EXERCISES.filter((ex) => {
    if (ex.chain && !chainPicks.get(ex.chain)?.has(ex.id)) return false;
    return isEligible(ex, slot, ctx);
  });
}

export interface ScoreBreakdown {
  readonly total: number;
  readonly goal: number;
  readonly level: number;
  readonly recovery: number;
  readonly balance: number;
  readonly variety: number;
  readonly boxing: number;
  readonly preference: number;
  readonly slotFit: number;
}

const WEIGHTS = {
  goal: 2.2,
  level: 1.6,
  recovery: 1.4,
  balance: 1.2,
  variety: 1.5,
  boxing: 0.9,
  preference: 0.8,
  slotFit: 0.6,
} as const;

export function scoreExercise(
  ex: Exercise,
  slot: SlotSpec,
  ctx: SelectionContext,
  weights: Partial<Record<Quality, number>>,
  debt: Record<MuscleGroup, number>,
): ScoreBreakdown {
  // Goal fit: how much of what this exercise trains is what the athlete wants.
  const goal =
    ex.qualities.length > 0
      ? ex.qualities.reduce((s, q) => s + (weights[q] ?? 0), 0) / ex.qualities.length
      : 0;

  // Level fit: chain members at the current rank are the target; the fallback
  // rank below scores lower unless the athlete is tired.
  let level = 1;
  if (ex.chain) {
    const target = effectiveRank(ctx.progression, ex.chain);
    level = (ex.rank ?? target) === target ? 1 : 0.65;
  } else {
    const reference = 1 + ctx.progression.calibration * 4 * globalRankNorm(ctx);
    level = clamp(1 - Math.abs(ex.level - reference) / 4, 0, 1);
  }

  // Recovery fit: prefer what is fresh.
  const regions = new Set([...ex.primary, ...ex.secondary].map((m) => MUSCLE_REGION[m]));
  const fatigues = [...regions].map((r) => ctx.recovery.fatigue[r] ?? 0);
  const worst = fatigues.length > 0 ? Math.max(...fatigues) : 0;
  const recovery = clamp(1 - worst, 0, 1);

  // Balance debt: prefer what has been trained least over the rolling window.
  const balance =
    ex.primary.length > 0
      ? ex.primary.reduce((s, m) => s + (debt[m] ?? 1), 0) / ex.primary.length
      : 0.5;

  // Variety: heavy penalty for what was done in the last day or two.
  const variety = clamp(1 - (ctx.recent.get(ex.id) ?? 0), 0, 1);

  // Boxing specificity.
  const boxing = ex.coaching.boxing ? 1 : slot.boxing ? 0 : 0.5;

  // Declared preferences: mastered up, difficult down, never excluded here.
  let preference = 0.5;
  if (ctx.profile.mastered.includes(ex.id)) preference = 1;
  if (ctx.profile.difficult.includes(ex.id)) preference = worst > 0.5 ? 0 : 0.25;

  // Slot's own quality request.
  const slotFit = slot.qualities
    ? slot.qualities.some((q) => ex.qualities.includes(q))
      ? 1
      : 0.2
    : 0.6;

  const total =
    WEIGHTS.goal * goal +
    WEIGHTS.level * level +
    WEIGHTS.recovery * recovery +
    WEIGHTS.balance * balance +
    WEIGHTS.variety * variety +
    WEIGHTS.boxing * boxing +
    WEIGHTS.preference * preference +
    WEIGHTS.slotFit * slotFit;

  return { total, goal, level, recovery, balance, variety, boxing, preference, slotFit };
}

/** Mean chain progress, 0…1 — used as the level reference for unchained work. */
function globalRankNorm(ctx: SelectionContext): number {
  return clamp(chainProgress(ctx.progression), 0, 1);
}

/** Pick one exercise for a slot, excluding anything already used today. */
export function selectForSlot(
  slot: SlotSpec,
  ctx: SelectionContext,
  used: ReadonlySet<string>,
): Exercise | undefined {
  const weights = goalWeights(ctx.profile.goals);
  const debt = balanceDebt(ctx.recovery);

  let pool = candidatesFor(slot, ctx).filter((e) => !used.has(e.id));
  if (pool.length === 0) {
    // Relax the "already used today" rule before relaxing anything that matters.
    pool = candidatesFor(slot, ctx);
    if (pool.length === 0) return undefined;
  }

  const scored = pool
    .map((ex) => ({ ex, score: scoreExercise(ex, slot, ctx, weights, debt).total }))
    .sort((a, b) => b.score - a.score);

  // Draw from the strongest handful, weighted by score, so the same profile
  // gets good-but-different sessions day to day.
  const shortlist = scored.slice(0, Math.min(5, scored.length));
  const best = shortlist[0]?.score ?? 1;
  const picked = weightedPick(
    shortlist,
    (c) => Math.pow(Math.max(0.01, c.score / best), 6),
    ctx.rng,
  );
  return picked?.ex;
}

/**
 * A replacement for an exercise that keeps the slot's job intact: same
 * pattern, comparable level, different movement (cahier des charges §21).
 */
export function findReplacement(
  current: ExerciseId,
  ctx: SelectionContext,
  used: ReadonlySet<string>,
  direction: 'equivalent' | 'plus-facile' | 'plus-dur' = 'equivalent',
): Exercise | undefined {
  const ex = getExercise(current);
  const slot: SlotSpec = { role: 'force', patterns: [ex.pattern], qualities: ex.qualities };

  const pool = EXERCISES.filter((c) => {
    if (c.id === ex.id) return false;
    if (used.has(c.id)) return false;
    if (ctx.profile.excluded.includes(c.id)) return false;
    if (!equipmentAvailable(c, ctx.profile)) return false;
    if (SPACE_RANK[c.space] > SPACE_RANK[ctx.profile.space]) return false;
    if (c.pattern !== ex.pattern) return false;
    if (direction === 'plus-facile' && c.level >= ex.level) return false;
    if (direction === 'plus-dur' && c.level <= ex.level) return false;
    if (direction === 'equivalent' && Math.abs(c.level - ex.level) > 1) return false;
    if (IMPACT_RANK[c.impact] > IMPACT_RANK[ctx.maxImpact]) return false;
    return true;
  });

  if (pool.length === 0) return undefined;

  const weights = goalWeights(ctx.profile.goals);
  const debt = balanceDebt(ctx.recovery);
  const scored = pool
    .map((c) => ({ c, score: scoreExercise(c, slot, ctx, weights, debt).total }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c;
}
