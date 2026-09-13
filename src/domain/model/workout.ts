import type { DateKey, ExerciseId, SessionId, WorkoutId } from './ids';
import type { Quality, RecoveryRegion } from './taxonomy';

/** The archetypes the weekly plan is built from. */
export const ARCHETYPES = [
  'full-body-boxing',
  'explosivite',
  'force',
  'conditioning',
  'core-stabilite',
  'hybride-boxe',
  'recovery',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const ARCHETYPE_META: Record<
  Archetype,
  { label: string; emoji: string; blurb: string; qualities: readonly Quality[] }
> = {
  'full-body-boxing': {
    label: 'Full Body Boxing',
    emoji: '🔥',
    blurb: 'Corps entier, orienté boxe',
    qualities: ['force', 'conditioning', 'core'],
  },
  explosivite: {
    label: 'Explosivité',
    emoji: '⚡',
    blurb: 'Puissance des jambes et des hanches',
    qualities: ['explosivite', 'puissance', 'vitesse'],
  },
  force: {
    label: 'Force',
    emoji: '💪',
    blurb: 'Tension, contrôle, qualité de mouvement',
    qualities: ['force', 'stabilite'],
  },
  conditioning: {
    label: 'Conditioning',
    emoji: '🥊',
    blurb: 'Capacité à répéter les efforts',
    qualities: ['conditioning', 'cardio', 'endurance-musculaire'],
  },
  'core-stabilite': {
    label: 'Core & Stabilité',
    emoji: '🎯',
    blurb: 'Tronc, rotation, équilibre',
    qualities: ['core', 'stabilite', 'equilibre'],
  },
  'hybride-boxe': {
    label: 'Hybride Boxe',
    emoji: '🥊',
    blurb: 'Rounds mêlant frappes et physique',
    qualities: ['conditioning', 'coordination', 'cardio'],
  },
  recovery: {
    label: 'Recovery',
    emoji: '🧘',
    blurb: 'Mobilité, respiration, récupération active',
    qualities: ['mobilite', 'stabilite'],
  },
};

/** Purpose of a block inside a session. Drives both layout and colour. */
export type BlockKind =
  | 'echauffement'
  | 'activation'
  | 'principal'
  | 'finisher'
  | 'cooldown';

export const BLOCK_LABELS: Record<BlockKind, string> = {
  echauffement: 'Échauffement',
  activation: 'Activation',
  principal: 'Bloc principal',
  finisher: 'Finisher',
  cooldown: 'Retour au calme',
};

/** How the sets of a block are sequenced. */
export type BlockFormat = 'series' | 'circuit' | 'rounds' | 'flow';

/** One prescribed exercise inside a block. */
export interface WorkoutItem {
  readonly exerciseId: ExerciseId;
  /** Repetitions, or seconds of work when `measure` is `temps`. */
  readonly dose: number;
  readonly measure: 'reps' | 'temps';
  /**
   * Seconds per repetition at the prescribed tempo, copied from the exercise so
   * that duration arithmetic needs no database lookup and survives a round-trip
   * through storage. Unused when `measure` is `temps`.
   */
  readonly secondsPerRep: number;
  /** Seconds of rest after this item, inside a set/round. */
  readonly restAfter: number;
  /** Seconds spent changing position before starting. Always counted. */
  readonly transition: number;
  /** Per side: the item is performed twice, once per side. */
  readonly perSide: boolean;
  /** Optional shadowboxing combination to call during this item. */
  readonly combo?: readonly number[];
}

export interface WorkoutBlock {
  readonly id: string;
  readonly kind: BlockKind;
  readonly title: string;
  readonly format: BlockFormat;
  /** Number of passes through `items`. */
  readonly rounds: number;
  /** Seconds of rest after each complete pass (not after the last one). */
  readonly restBetweenRounds: number;
  readonly items: readonly WorkoutItem[];
  /** One line explaining why this block exists in this session. */
  readonly intent: string;
}

/**
 * A generated session. `durationSec` is computed by `computeDuration`, never
 * estimated by eye, and is asserted against the budget before a workout is
 * allowed to leave the generator (cahier des charges §64).
 */
export interface Workout {
  readonly id: WorkoutId;
  readonly kind: 'principal' | 'extension';
  readonly archetype: Archetype;
  readonly title: string;
  readonly date: DateKey;
  readonly blocks: readonly WorkoutBlock[];
  readonly qualities: readonly Quality[];
  /** 1 (très léger) … 5 (très intense). Planned, not measured. */
  readonly intensity: 1 | 2 | 3 | 4 | 5;
  readonly durationSec: number;
  /**
   * The ceiling this session was generated against — 20:00 for a standard
   * session, 10:00 for an extension, 15:00 for a recovery day. Carried here so
   * the preview and the tests audit against the right figure rather than
   * assuming one.
   */
  readonly budgetSec: number;
  /** Estimated training load per region, used by the recovery engine. */
  readonly load: Readonly<Record<RecoveryRegion, number>>;
  /** Human-readable reasons the engine chose this session today. */
  readonly rationale: readonly string[];
  /** Seed used for selection, so a given day always regenerates identically. */
  readonly seed: number;
}

/** What the athlete actually did with one prescribed item. */
export interface PerformedItem {
  readonly exerciseId: ExerciseId;
  readonly blockId: string;
  readonly round: number;
  readonly prescribed: number;
  readonly achieved: number;
  readonly measure: 'reps' | 'temps';
  readonly skipped: boolean;
  /** Exercise actually done, when the athlete swapped it mid-session. */
  readonly substitutedFor?: ExerciseId;
}

export type Rpe = 1 | 2 | 3 | 4 | 5;

export const RPE_META: Record<Rpe, { emoji: string; label: string }> = {
  1: { emoji: '😫', label: 'Très difficile' },
  2: { emoji: '😓', label: 'Difficile' },
  3: { emoji: '🙂', label: 'Correct' },
  4: { emoji: '💪', label: 'Facile' },
  5: { emoji: '🔥', label: 'Trop facile' },
};

export interface SessionFeedback {
  readonly overall: Rpe;
  /** Optional per-region detail. Absent regions fall back to `overall`. */
  readonly regions?: Partial<Record<RecoveryRegion, Rpe>>;
  readonly note?: string;
}

/**
 * A session in flight or completed. Written to storage continuously while the
 * workout runs so that a crash or an accidental close never loses the work
 * already done (cahier des charges §62).
 */
export interface WorkoutSession {
  readonly id: SessionId;
  readonly workout: Workout;
  readonly date: DateKey;
  readonly startedAt: number;
  readonly endedAt?: number;
  /** Seconds of actual work, excluding time spent paused. */
  readonly elapsedSec: number;
  readonly performed: readonly PerformedItem[];
  readonly status: 'en-cours' | 'terminee' | 'abandonnee';
  readonly feedback?: SessionFeedback;
  /** Set on the +10 module, pointing at the main session it extends. */
  readonly extensionOf?: SessionId;
  /** Set on a main session once its extension has been completed. */
  readonly extendedBy?: SessionId;
}

/** A best-ever result for one exercise, used for records and progression. */
export interface Performance {
  readonly exerciseId: ExerciseId;
  readonly best: number;
  readonly measure: 'reps' | 'temps';
  readonly at: DateKey;
  readonly totalVolume: number;
  readonly sessions: number;
  /**
   * Best result per session, oldest first, capped at the most recent entries.
   * Keeping it here means the evolution chart never has to decrypt and scan
   * every past session.
   */
  readonly history: readonly { readonly at: DateKey; readonly value: number }[];
}

/** One day of the plan: what is scheduled, and what actually happened. */
export interface TrainingDay {
  readonly date: DateKey;
  readonly archetype: Archetype;
  readonly plannedMinutes: number;
  readonly status: 'a-venir' | 'aujourdhui' | 'faite' | 'manquee' | 'repos';
  readonly sessionId?: SessionId;
}
