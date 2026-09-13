import { getExercise } from '@/data/exercises';
import type { Exercise } from '@/domain/model/exercise';
import type { DateKey } from '@/domain/model/ids';
import { daysBetween, workoutId } from '@/domain/model/ids';
import type { Impact, Quality, RecoveryRegion } from '@/domain/model/taxonomy';
import { IMPACT_RANK, MUSCLE_REGION, REGION_LABELS } from '@/domain/model/taxonomy';
import type { ProgressionState, RecoveryState, UserProfile } from '@/domain/model/user';
import { GOAL_META } from '@/domain/model/user';
import type {
  Archetype,
  Workout,
  WorkoutBlock,
  WorkoutItem,
  WorkoutSession,
} from '@/domain/model/workout';
import { ARCHETYPE_META } from '@/domain/model/workout';
import { computeWorkoutLoad, recoveryPercent } from '@/engines/recovery';
import { doseScale, isRampingBack } from '@/engines/progression';
import { createRng, clamp, hashString } from '@/lib/rng';
import { BLOCK_TRANSITION_SEC, computeDuration, itemWorkSec } from './duration';
import type { BlockSpec, SessionTemplate, SlotSpec } from './templates';
import { TEMPLATES } from './templates';
import { selectForSlot, type SelectionContext } from './selection';

/**
 * Training engine.
 *
 * Takes the athlete's state and a session template and produces a workout that
 * is *guaranteed* to fit its time budget. Nothing leaves this module without
 * passing `computeDuration` against the budget — the duration is arithmetic,
 * never an estimate (cahier des charges §64).
 */

/** Bounds for prescriptions, so a fit pass can never produce nonsense. */
const MIN_TIMED_SEC = 15;
const MAX_TIMED_SEC = 60;
const MIN_REST_SEC = 8;
const MAX_ITEM_REST_SEC = 35;
const MAX_ROUND_REST_SEC = 90;
/** Fill at least this fraction of the budget before accepting a session. */
const MIN_FILL = 0.96;

export interface GenerateInput {
  readonly profile: UserProfile;
  readonly progression: ProgressionState;
  readonly recovery: RecoveryState;
  /** Recent sessions, newest first. Only the last ~6 matter for variety. */
  readonly history: readonly WorkoutSession[];
  readonly date: DateKey;
  readonly archetype: Archetype;
  readonly kind?: 'principal' | 'extension';
  /** Overrides the archetype's template — used by the +10 module. */
  readonly template?: SessionTemplate;
  /** Manual nudge from the in-session "Faciliter" / "Intensifier" controls. */
  readonly adjust?: -1 | 0 | 1;
  /** Changes the draw without changing the day, for "propose autre chose". */
  readonly variant?: number;
  /**
   * Exercises to keep out of this session. The +10 module passes the main
   * session's exercises here so the extension complements it rather than
   * replaying it (cahier des charges §8).
   */
  readonly avoid?: readonly string[];
}

/* ------------------------------------------------------------------ context */

function fatigueCaps(
  recovery: RecoveryState,
  adjust: number,
): { maxImpact: Impact; maxIntensity: number; worst: number } {
  const worst = Math.max(
    recovery.fatigue.jambes,
    recovery.fatigue['haut-du-corps'],
    recovery.fatigue.core,
    recovery.fatigue.cardio,
  );
  let impactRank = worst > 0.75 ? 0 : worst > 0.55 ? 1 : 2;
  let maxIntensity = worst > 0.8 ? 3 : worst > 0.6 ? 4 : 5;

  impactRank = clamp(impactRank + adjust, 0, 2);
  maxIntensity = clamp(maxIntensity + adjust, 2, 5);

  const maxImpact = (['faible', 'modere', 'eleve'] as const)[impactRank] ?? 'modere';
  return { maxImpact, maxIntensity, worst };
}

/** Recency weights for variety: 1 for yesterday's exercises, fading over a week. */
function recentMap(history: readonly WorkoutSession[], today: DateKey): Map<string, number> {
  const map = new Map<string, number>();
  for (const session of history.slice(0, 8)) {
    const age = Math.max(0, daysBetween(session.date, today));
    const weight = clamp(1 - age / 7, 0, 1);
    if (weight <= 0) continue;
    for (const block of session.workout.blocks) {
      for (const item of block.items) {
        map.set(item.exerciseId, Math.max(map.get(item.exerciseId) ?? 0, weight));
      }
    }
  }
  return map;
}

function buildContext(input: GenerateInput, seed: number): SelectionContext {
  const adjust = input.adjust ?? 0;
  const { maxImpact, maxIntensity } = fatigueCaps(input.recovery, adjust);
  return {
    profile: input.profile,
    progression: input.progression,
    recovery: input.recovery,
    recent: recentMap(input.history, input.date),
    maxImpact,
    maxIntensity,
    rng: createRng(seed),
  };
}

/* ------------------------------------------------------------- prescription */

const INTENSITY_DENSITY = { progressive: 0.88, equilibree: 1, exigeante: 1.08 } as const;
const ADJUST_DENSITY = { '-1': 0.82, '0': 1, '1': 1.15 } as const;

/** Work-to-rest density: how much of a block's time is actual work. */
function densityFor(input: GenerateInput, worstFatigue: number): number {
  const adjustKey = String(input.adjust ?? 0) as keyof typeof ADJUST_DENSITY;
  const d =
    INTENSITY_DENSITY[input.profile.intensity] *
    (ADJUST_DENSITY[adjustKey] ?? 1) *
    doseScale(input.progression) *
    (1 - 0.18 * worstFatigue);
  return clamp(d, 0.6, 1.2);
}

const round5 = (v: number) => Math.max(5, Math.round(v / 5) * 5);

function repBounds(ex: Exercise): { min: number; max: number } {
  // Demanding work gets a tight ceiling: eighty jump squats is not a power
  // session, it is a conditioning session with worse mechanics. Spare time on
  // those blocks becomes rest instead.
  const ceiling = ex.intensity >= 4 ? 1.25 : 1.7;
  return {
    min: Math.max(3, Math.round(ex.baseDose * 0.4)),
    max: Math.max(4, Math.round(ex.baseDose * ceiling)),
  };
}

function makeItem(
  ex: Exercise,
  slot: SlotSpec,
  targetWorkSec: number,
  restAfter: number,
  transition: number,
): WorkoutItem {
  const measure = slot.measure ?? ex.measure;
  const perSide = ex.unilateral;
  const perSideDivisor = perSide ? 2 : 1;
  const sideTarget = targetWorkSec / perSideDivisor;

  if (measure === 'temps') {
    const dose = clamp(round5(sideTarget), MIN_TIMED_SEC, MAX_TIMED_SEC);
    return { exerciseId: ex.id, dose, measure: 'temps', secondsPerRep: 1, restAfter, transition, perSide };
  }

  const { min, max } = repBounds(ex);
  const dose = clamp(Math.round(sideTarget / ex.secondsPerRep), min, max);
  return {
    exerciseId: ex.id,
    dose,
    measure: 'reps',
    secondsPerRep: ex.secondsPerRep,
    restAfter,
    transition,
    perSide,
  };
}

function itemBounds(item: WorkoutItem): { min: number; max: number } {
  if (item.measure === 'temps') return { min: MIN_TIMED_SEC, max: MAX_TIMED_SEC };
  return repBounds(getExercise(item.exerciseId));
}

/**
 * The dose the exercise was designed around. Spare time is spent bringing
 * prescriptions up to this figure before it is spent on longer rests — a set
 * of five push-ups padded with a minute of rest is not a strength set.
 */
function naturalDose(item: WorkoutItem): number {
  const ex = getExercise(item.exerciseId);
  if (item.measure === 'temps') {
    const natural = ex.measure === 'temps' ? ex.baseDose : ex.baseDose * ex.secondsPerRep;
    return clamp(round5(natural), MIN_TIMED_SEC, MAX_TIMED_SEC);
  }
  const { min, max } = repBounds(ex);
  return clamp(ex.baseDose, min, max);
}

const STEP = (item: WorkoutItem) => (item.measure === 'temps' ? 5 : 1);

/* ---------------------------------------------------------------- blocks */

function buildBlock(
  spec: BlockSpec,
  blockBudget: number,
  ctx: SelectionContext,
  used: Set<string>,
  density: number,
): WorkoutBlock | null {
  const chosen: { ex: Exercise; slot: SlotSpec }[] = [];
  for (const slot of spec.slots) {
    const ex = selectForSlot(slot, ctx, used);
    if (!ex) continue;
    used.add(ex.id);
    chosen.push({ ex, slot });
  }
  if (chosen.length === 0) return null;

  const n = chosen.length;
  let rounds = Math.max(1, spec.rounds);
  const transition = spec.transition;
  const baseRest = spec.restBetweenItems;

  // Shrink the number of rounds until the minimum prescriptions actually fit.
  const minWorkPerRound = chosen.reduce((sum, { ex, slot }) => {
    const measure = slot.measure ?? ex.measure;
    const side = ex.unilateral ? 2 : 1;
    return (
      sum + (measure === 'temps' ? MIN_TIMED_SEC : repBounds(ex).min * ex.secondsPerRep) * side
    );
  }, 0);
  const overheadPerRound = n * transition + (n - 1) * baseRest;

  while (rounds > 1) {
    const perRound = (blockBudget - spec.restBetweenRounds * (rounds - 1)) / rounds;
    if (perRound - overheadPerRound >= minWorkPerRound) break;
    rounds -= 1;
  }

  const perRound = (blockBudget - spec.restBetweenRounds * (rounds - 1)) / rounds;
  const workPerRound = Math.max(minWorkPerRound, perRound - overheadPerRound);
  const targetWorkPerItem = (workPerRound * density) / n;

  const items = chosen.map(({ ex, slot }) =>
    makeItem(ex, slot, targetWorkPerItem, baseRest, transition),
  );

  return {
    id: spec.key,
    kind: spec.kind,
    title: spec.title,
    format: spec.format,
    rounds,
    restBetweenRounds: spec.restBetweenRounds,
    items,
    intent: spec.intent,
  };
}

/* ------------------------------------------------------------ fit to budget */

type MutableBlock = {
  -readonly [K in keyof WorkoutBlock]: K extends 'items' ? WorkoutItem[] : WorkoutBlock[K];
};

const toMutable = (b: WorkoutBlock): MutableBlock => ({ ...b, items: [...b.items] });

/** Every (block, item) pair, so the fit passes can scan prescriptions flatly. */
function allItems(work: MutableBlock[]): { block: MutableBlock; index: number }[] {
  const out: { block: MutableBlock; index: number }[] = [];
  for (const block of work) block.items.forEach((_, index) => out.push({ block, index }));
  return out;
}

/**
 * Force the session inside its budget, then spend any slack.
 *
 * Shrinking takes from the longest piece of work first, then from rests, then
 * from rounds — losing a round costs more than losing two repetitions.
 * Filling brings prescriptions up to their designed dose first, then lengthens
 * rests, and only then pushes doses past their reference figure.
 */
function fitToBudget(blocks: WorkoutBlock[], budgetSec: number): WorkoutBlock[] {
  const work = blocks.map(toMutable);
  const total = () => computeDuration(work as unknown as WorkoutBlock[]);

  /* --- shrink ----------------------------------------------------------- */
  for (let guard = 0; guard < 3000 && total() > budgetSec; guard++) {
    // 1. Trim the longest prescription that is still above its floor.
    let longest: { block: MutableBlock; index: number; sec: number } | null = null;
    for (const { block, index } of allItems(work)) {
      const item = block.items[index]!;
      if (item.dose <= itemBounds(item).min) continue;
      const sec = itemWorkSec(item);
      if (!longest || sec > longest.sec) longest = { block, index, sec };
    }
    if (longest) {
      const item = longest.block.items[longest.index]!;
      longest.block.items[longest.index] = { ...item, dose: item.dose - STEP(item) };
      continue;
    }

    // 2. Every prescription is at its floor: take the time out of rest.
    let restTrimmed = false;
    for (const block of work) {
      if (block.rounds > 1 && block.restBetweenRounds > MIN_REST_SEC) {
        block.restBetweenRounds = Math.max(MIN_REST_SEC, block.restBetweenRounds - 5);
        restTrimmed = true;
      }
      for (let i = 0; i < block.items.length; i++) {
        const item = block.items[i]!;
        if (item.restAfter > MIN_REST_SEC) {
          block.items[i] = { ...item, restAfter: Math.max(MIN_REST_SEC, item.restAfter - 5) };
          restTrimmed = true;
        }
      }
    }
    if (restTrimmed) continue;

    // 3. Last resort: drop a round from the longest block.
    const candidates = work.filter((b) => b.rounds > 1);
    if (candidates.length === 0) break;
    const target = candidates.reduce((a, b) =>
      computeDuration([b as unknown as WorkoutBlock]) >
      computeDuration([a as unknown as WorkoutBlock])
        ? b
        : a,
    );
    target.rounds -= 1;
  }

  /* --- fill ------------------------------------------------------------- */
  const floor = budgetSec * MIN_FILL;

  /** Apply a mutation, reverting it if it would breach the budget. */
  const tryGrow = (apply: () => () => void): boolean => {
    const undo = apply();
    if (total() > budgetSec) {
      undo();
      return false;
    }
    return true;
  };

  /** Items that cannot grow any further without breaching the budget. */
  const frozen = new Set<string>();
  const key = (block: MutableBlock, index: number) => `${block.id}:${index}`;

  const growDose = (block: MutableBlock, index: number): boolean =>
    tryGrow(() => {
      const item = block.items[index]!;
      block.items[index] = { ...item, dose: item.dose + STEP(item) };
      return () => {
        block.items[index] = item;
      };
    });

  // Phase 1 — bring prescriptions up to their designed dose. This runs against
  // the full budget, not merely the fill floor: if the reference dose fits, the
  // athlete gets it rather than a padded-out short set.
  for (let guard = 0; guard < 3000 && total() < budgetSec; guard++) {
    const below = allItems(work)
      .filter(({ block, index }) => !frozen.has(key(block, index)))
      .map(({ block, index }) => {
        const item = block.items[index]!;
        const target = Math.min(naturalDose(item), itemBounds(item).max);
        return { block, index, gap: (target - item.dose) / Math.max(1, target) };
      })
      .filter((c) => c.gap > 0)
      .sort((a, b) => b.gap - a.gap);
    const next = below[0];
    if (!next) break;
    // A single item hitting the ceiling must not stop the smaller ones growing.
    if (!growDose(next.block, next.index)) frozen.add(key(next.block, next.index));
  }
  frozen.clear();

  // Phase 2 — spend what is left on rest, which protects movement quality.
  for (let guard = 0; guard < 3000 && total() < floor; guard++) {
    let grew = false;
    for (const block of work) {
      if (total() >= floor) break;
      if (block.rounds > 1 && block.restBetweenRounds < MAX_ROUND_REST_SEC) {
        if (
          tryGrow(() => {
            block.restBetweenRounds += 5;
            return () => {
              block.restBetweenRounds -= 5;
            };
          })
        ) {
          grew = true;
          continue;
        }
      }
      for (let i = 0; i < block.items.length - 1; i++) {
        const item = block.items[i]!;
        if (item.restAfter >= MAX_ITEM_REST_SEC) continue;
        if (
          tryGrow(() => {
            block.items[i] = { ...item, restAfter: item.restAfter + 5 };
            return () => {
              block.items[i] = item;
            };
          })
        ) {
          grew = true;
          break;
        }
      }
    }
    if (!grew) break;
  }

  // Phase 3 — rests are capped: push doses beyond their reference figure.
  for (let guard = 0; guard < 3000 && total() < floor; guard++) {
    const growable = allItems(work)
      .filter(({ block, index }) => !frozen.has(key(block, index)))
      .map(({ block, index }) => ({ block, index, item: block.items[index]! }))
      .filter((c) => c.item.dose < itemBounds(c.item).max)
      .sort((a, b) => itemWorkSec(a.item) - itemWorkSec(b.item));
    const next = growable[0];
    if (!next) break;
    if (!growDose(next.block, next.index)) frozen.add(key(next.block, next.index));
  }

  return work as unknown as WorkoutBlock[];
}

/* ---------------------------------------------------------------- rationale */

function buildRationale(
  input: GenerateInput,
  blocks: readonly WorkoutBlock[],
  worstFatigue: number,
): string[] {
  const out: string[] = [];
  const meta = ARCHETYPE_META[input.archetype];
  out.push(`${meta.label} : ${meta.blurb.toLowerCase()}.`);

  if (isRampingBack(input.progression)) {
    const pct = Math.round(input.progression.calibration * 100);
    out.push(
      `Reprise après une coupure : la séance est recalibrée à ${pct} % de ton niveau habituel et remontera à chaque séance.`,
    );
  }

  const pcts = recoveryPercent(input.recovery);
  const regions = Object.entries(pcts) as [RecoveryRegion, number][];
  const lowest = regions.slice().sort((a, b) => a[1] - b[1])[0];

  if (input.archetype === 'recovery') {
    out.push(
      lowest && lowest[1] < 70
        ? `${REGION_LABELS[lowest[0]]} à ${lowest[1]} % : c’est exactement le jour pour une séance de récupération.`
        : 'Journée légère : entretenir l’amplitude coûte peu et rend beaucoup.',
    );
  } else if (lowest && lowest[1] < 70) {
    out.push(
      `${REGION_LABELS[lowest[0]]} à ${lowest[1]} % de récupération : le volume qui les concerne est réduit aujourd’hui.`,
    );
  } else if (worstFatigue < 0.25) {
    out.push('Tu es frais sur toutes les zones — la séance peut taper fort.');
  }

  const goals = input.profile.goals.slice(0, 2);
  if (goals.length > 0 && input.archetype !== 'recovery') {
    out.push(
      `Tes objectifs orientent le choix des exercices : ${goals
        .map((g) => GOAL_META[g].label.toLowerCase())
        .join(' et ')}.`,
    );
  }
  void blocks;
  return out;
}

/* ----------------------------------------------------------------- generate */

export class DurationBudgetError extends Error {
  constructor(
    readonly totalSec: number,
    readonly budgetSec: number,
  ) {
    super(`Séance de ${totalSec} s générée pour un budget de ${budgetSec} s`);
    this.name = 'DurationBudgetError';
  }
}

export function generateWorkout(input: GenerateInput): Workout {
  const kind = input.kind ?? 'principal';
  const template = input.template ?? TEMPLATES[input.archetype];
  const seed = hashString(`${input.date}|${input.archetype}|${kind}|${input.variant ?? 0}`);
  const ctx = buildContext(input, seed);
  const { worst } = fatigueCaps(input.recovery, input.adjust ?? 0);
  const density = densityFor(input, worst);

  const budget = template.budgetSec;
  const usable = budget - Math.max(0, template.blocks.length - 1) * BLOCK_TRANSITION_SEC;

  const used = new Set<string>(input.avoid ?? []);
  const built: WorkoutBlock[] = [];
  for (const spec of template.blocks) {
    const block = buildBlock(spec, spec.share * usable, ctx, used, density);
    if (block) built.push(block);
  }

  if (built.length === 0) {
    throw new Error(
      "Aucun exercice ne correspond à tes contraintes. Élargis l'espace disponible ou retire une exclusion dans les paramètres.",
    );
  }

  const blocks = fitToBudget(built, budget);
  const durationSec = computeDuration(blocks);
  if (durationSec > budget) throw new DurationBudgetError(durationSec, budget);

  // What the session *is* comes from its working blocks: the warm-up and the
  // cool-down are infrastructure, and counting them made every session
  // announce itself as mobility work. Each exercise's time is split across the
  // qualities it trains, so listing three of them does not treble its weight.
  const qualitySec = new Map<Quality, number>();
  for (const b of blocks) {
    const counts = b.kind === 'principal' || b.kind === 'finisher' || b.kind === 'activation';
    for (const item of b.items) {
      const ex = getExercise(item.exerciseId);
      if (ex.qualities.length === 0) continue;
      const sec = (itemWorkSec(item) * b.rounds) / ex.qualities.length;
      for (const q of ex.qualities) {
        // Non-working blocks still contribute, but only marginally, so a
        // recovery session is still described as mobility.
        qualitySec.set(q, (qualitySec.get(q) ?? 0) + sec * (counts ? 1 : 0.15));
      }
    }
  }
  const qualities = [...qualitySec.entries()].sort((a, b) => b[1] - a[1]).map(([q]) => q);

  const draft: Workout = {
    id: workoutId(`${input.date}-${input.archetype}-${kind}-${input.variant ?? 0}`),
    kind,
    archetype: input.archetype,
    title: template.title,
    date: input.date,
    blocks,
    qualities,
    intensity: template.intensity,
    durationSec,
    budgetSec: budget,
    load: { jambes: 0, 'haut-du-corps': 0, core: 0, cardio: 0 },
    rationale: buildRationale(input, blocks, worst),
    seed,
  };

  return { ...draft, load: computeWorkoutLoad(draft).regions };
}

/** Which regions this workout actually loads, for the preview screen. */
export function dominantRegions(workout: Workout): RecoveryRegion[] {
  const totals = { ...workout.load };
  return (Object.keys(totals) as RecoveryRegion[])
    .filter((r) => totals[r] > 0)
    .sort((a, b) => totals[b] - totals[a]);
}

/** Muscle groups touched by a workout, for the balance display. */
export function workoutMuscles(workout: Workout): string[] {
  const set = new Set<string>();
  for (const b of workout.blocks) {
    for (const item of b.items) {
      for (const m of getExercise(item.exerciseId).primary) set.add(m);
    }
  }
  return [...set];
}

export { MUSCLE_REGION, IMPACT_RANK };
