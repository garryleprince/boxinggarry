import { getExercise } from '@/data/exercises';
import type { DateKey } from '@/domain/model/ids';
import { dateKey } from '@/domain/model/ids';
import type { MuscleGroup, RecoveryRegion } from '@/domain/model/taxonomy';
import { MUSCLE_REGION, RECOVERY_REGIONS } from '@/domain/model/taxonomy';
import type { RecoveryState } from '@/domain/model/user';
import type { Rpe, SessionFeedback, Workout } from '@/domain/model/workout';
import { itemWorkSec } from '@/engines/training/duration';
import { clamp } from '@/lib/rng';

/**
 * Recovery engine.
 *
 * Estimates how fatigued each region is, from prescribed volume, exercise
 * intensity and the effort the athlete reported. These are **training
 * estimates used to steer programming** — they are not physiological
 * measurements and never a health assessment (cahier des charges §19, §66).
 *
 * Model: each session adds load, load decays exponentially with a per-region
 * half-life. Legs hold fatigue longest, systemic cardio clears fastest.
 */

/** Half-life of fatigue, in days, per region. */
const HALF_LIFE_DAYS: Record<RecoveryRegion, number> = {
  jambes: 1.7,
  'haut-du-corps': 1.5,
  core: 1.1,
  cardio: 0.9,
};

/**
 * Load units that take a region from fresh to fully fatigued. Calibrated so a
 * demanding 20-minute session focused on one region lands around 0.55–0.7.
 */
const REGION_CAPACITY: Record<RecoveryRegion, number> = {
  jambes: 900,
  'haut-du-corps': 800,
  core: 650,
  cardio: 1100,
};

/** Rolling window used for muscle-balance debt, in days. */
export const BALANCE_WINDOW_DAYS = 14;

/** Reported effort scales the load: what felt brutal cost more than planned. */
const RPE_MULTIPLIER: Record<Rpe, number> = { 1: 1.35, 2: 1.15, 3: 1.0, 4: 0.85, 5: 0.7 };

export function emptyRecovery(at: DateKey, ts = Date.now()): RecoveryState {
  return {
    updatedAt: at,
    updatedTs: ts,
    fatigue: { jambes: 0, 'haut-du-corps': 0, core: 0, cardio: 0 },
    muscleVolume: {},
  };
}

/**
 * Training load of a workout, per region and per muscle group.
 * Primary muscles take the full share of an exercise's load, secondary half.
 */
export function computeWorkoutLoad(workout: Workout): {
  regions: Record<RecoveryRegion, number>;
  muscles: Partial<Record<MuscleGroup, number>>;
} {
  const regions: Record<RecoveryRegion, number> = {
    jambes: 0,
    'haut-du-corps': 0,
    core: 0,
    cardio: 0,
  };
  const muscles: Partial<Record<MuscleGroup, number>> = {};

  for (const block of workout.blocks) {
    for (let round = 0; round < block.rounds; round++) {
      for (const item of block.items) {
        const ex = getExercise(item.exerciseId);
        const work = itemWorkSec(item);
        // Intensity 3 is the neutral reference, so the scale runs 0.33…1.67.
        const unit = work * (ex.intensity / 3);

        const share = (m: MuscleGroup, factor: number) => {
          muscles[m] = (muscles[m] ?? 0) + unit * factor;
          regions[MUSCLE_REGION[m]] += unit * factor;
        };
        const primaryFactor = ex.primary.length > 0 ? 1 / ex.primary.length : 0;
        for (const m of ex.primary) share(m, primaryFactor);
        const secondaryFactor = ex.secondary.length > 0 ? 0.5 / ex.secondary.length : 0;
        for (const m of ex.secondary) share(m, secondaryFactor);

        // Systemic cost: only intensity 3+ work meaningfully taxes the engine.
        regions.cardio += work * Math.max(0, ex.intensity - 2) * 0.55;
      }
    }
  }
  return { regions, muscles };
}

/** Decay an existing state forward to `ts`, without adding any new load. */
export function decayTo(state: RecoveryState, ts: number): RecoveryState {
  const days = Math.max(0, (ts - state.updatedTs) / 86_400_000);
  if (days === 0) return state;

  const fatigue = {} as Record<RecoveryRegion, number>;
  for (const r of RECOVERY_REGIONS) {
    fatigue[r] = (state.fatigue[r] ?? 0) * Math.pow(0.5, days / HALF_LIFE_DAYS[r]);
  }

  // Muscle volume uses a single, slower half-life: it tracks *what was
  // trained recently* for balance purposes, not how tired the tissue is.
  const muscleVolume: Partial<Record<MuscleGroup, number>> = {};
  const volDecay = Math.pow(0.5, days / (BALANCE_WINDOW_DAYS / 2));
  for (const [m, v] of Object.entries(state.muscleVolume)) {
    const next = (v ?? 0) * volDecay;
    if (next > 1) muscleVolume[m as MuscleGroup] = next;
  }

  return { updatedAt: dateKey(new Date(ts)), updatedTs: ts, fatigue, muscleVolume };
}

/** Apply a completed session's load on top of the decayed state. */
export function applyWorkout(
  state: RecoveryState,
  workout: Workout,
  feedback: SessionFeedback | undefined,
  ts = Date.now(),
  /** 0…1 — fraction of the session actually completed. */
  completion = 1,
): RecoveryState {
  const base = decayTo(state, ts);
  const { regions, muscles } = computeWorkoutLoad(workout);
  const overall = feedback ? RPE_MULTIPLIER[feedback.overall] : 1;

  const fatigue = {} as Record<RecoveryRegion, number>;
  for (const r of RECOVERY_REGIONS) {
    const regionRpe = feedback?.regions?.[r];
    const mult = regionRpe ? RPE_MULTIPLIER[regionRpe] : overall;
    const added = (regions[r] * mult * clamp(completion, 0, 1)) / REGION_CAPACITY[r];
    fatigue[r] = clamp(base.fatigue[r] + added, 0, 1);
  }

  const muscleVolume: Partial<Record<MuscleGroup, number>> = { ...base.muscleVolume };
  for (const [m, v] of Object.entries(muscles)) {
    muscleVolume[m as MuscleGroup] =
      (muscleVolume[m as MuscleGroup] ?? 0) + (v ?? 0) * clamp(completion, 0, 1);
  }

  return { updatedAt: dateKey(new Date(ts)), updatedTs: ts, fatigue, muscleVolume };
}

/** Recovery as a percentage, 0…100. 100 = fully recovered. */
export function recoveryPercent(state: RecoveryState): Record<RecoveryRegion, number> {
  const out = {} as Record<RecoveryRegion, number>;
  for (const r of RECOVERY_REGIONS) {
    out[r] = Math.round(clamp(1 - (state.fatigue[r] ?? 0), 0, 1) * 100);
  }
  return out;
}

/** A single readiness figure, weighted toward whichever region is most tired. */
export function readiness(state: RecoveryState): number {
  const values = RECOVERY_REGIONS.map((r) => 1 - (state.fatigue[r] ?? 0));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const worst = Math.min(...values);
  return Math.round(clamp(mean * 0.6 + worst * 0.4, 0, 1) * 100);
}

/**
 * Muscle-balance debt, 0 (trained plenty lately) … 1 (neglected).
 * The generator uses this to stop the same groups being hit every session.
 */
export function balanceDebt(state: RecoveryState): Record<MuscleGroup, number> {
  const volumes = Object.values(state.muscleVolume).filter((v): v is number => v != null);
  const max = volumes.length > 0 ? Math.max(...volumes, 1) : 1;
  const out = {} as Record<MuscleGroup, number>;
  for (const m of Object.keys(MUSCLE_REGION) as MuscleGroup[]) {
    out[m] = clamp(1 - (state.muscleVolume[m] ?? 0) / max, 0, 1);
  }
  return out;
}

/** Plain-language reading of a recovery figure, for the recovery screen. */
export function recoveryLabel(percent: number): string {
  if (percent >= 85) return 'Prêt';
  if (percent >= 65) return 'Disponible';
  if (percent >= 45) return 'Entamé';
  return 'À ménager';
}
