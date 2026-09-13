import type { ChainId, ExerciseId } from './ids';
import type {
  Equipment,
  Impact,
  Measure,
  MuscleGroup,
  Pattern,
  Quality,
  SpaceNeed,
} from './taxonomy';
import type { PoseKey } from '@/data/poses';

/**
 * An exercise as the generator sees it. Everything the engine needs to decide
 * *whether* to pick it and *how much* of it to prescribe lives here; everything
 * the athlete needs to perform it well lives in `coaching`.
 */
export interface Exercise {
  readonly id: ExerciseId;
  readonly name: string;
  readonly shortName?: string;
  readonly description: string;

  /** 1 (accessible to anyone) … 5 (advanced). */
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly pattern: Pattern;
  readonly primary: readonly MuscleGroup[];
  readonly secondary: readonly MuscleGroup[];
  readonly qualities: readonly Quality[];

  /** Relative metabolic cost, 1 (mobility) … 5 (all-out). Drives cardio load. */
  readonly intensity: 1 | 2 | 3 | 4 | 5;
  readonly impact: Impact;
  readonly equipment: readonly Equipment[];
  readonly space: SpaceNeed;
  /** True when the prescription is per side and the duration must be doubled. */
  readonly unilateral: boolean;
  /** Coordination demand, 1 … 5. Kept low for fatigued or beginner sessions. */
  readonly skill: 1 | 2 | 3 | 4 | 5;
  /**
   * For mobility work: whether it belongs in a warm-up (dynamic) or a
   * cool-down (static). Holding a hamstring stretch before explosive work is
   * exactly the wrong order, so the generator keeps the two apart.
   */
  readonly stretch?: 'dynamique' | 'statique';

  readonly measure: Measure;
  /** Reference dose for a level-matched athlete: reps, or seconds if timed. */
  readonly baseDose: number;
  /** Seconds per repetition at the prescribed tempo. Ignored for timed work. */
  readonly secondsPerRep: number;

  /** Progression chain membership. `rank` is the step inside the chain. */
  readonly chain?: ChainId;
  readonly rank?: number;

  readonly coaching: ExerciseCoaching;
  readonly poses: readonly PoseKey[];
  /**
   * Optional external illustration. When present the UI shows it instead of the
   * built-in vector animation — the swap is a one-field change per exercise.
   */
  readonly media?: { readonly kind: 'image' | 'gif' | 'video'; readonly src: string };
}

export interface ExerciseCoaching {
  readonly cues: readonly string[];
  readonly mistakes: readonly string[];
  readonly breathing: string;
  /** Why a boxer does this. Empty for general-purpose accessory work. */
  readonly boxing?: string;
}

/**
 * A named alternative to an exercise that keeps the same slot in a session:
 * same pattern, same intent, different constraint (easier, harder, quieter…).
 */
export interface ExerciseVariation {
  readonly of: ExerciseId;
  readonly to: ExerciseId;
  readonly kind: 'regression' | 'progression' | 'alternative';
  readonly reason: string;
}

/**
 * An ordered ladder of exercises training the same pattern, from the most
 * accessible to the hardest. Progression means moving along the chain, not
 * only adding repetitions (cahier des charges §22).
 */
export interface ProgressionChain {
  readonly id: ChainId;
  readonly name: string;
  readonly pattern: Pattern;
  /** Exercise ids ordered by rank, index 0 = level 1. */
  readonly steps: readonly ExerciseId[];
}
