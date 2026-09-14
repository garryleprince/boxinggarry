import type { AchievementId, ChainId, DateKey, ExerciseId } from './ids';
import type { Equipment, MuscleGroup, RecoveryRegion, SpaceNeed } from './taxonomy';

export const GOALS = [
  'cardio',
  'endurance-boxe',
  'explosivite',
  'force',
  'endurance-musculaire',
  'perte-de-gras',
  'masse-musculaire',
  'jambes',
  'core',
  'mobilite',
  'condition-generale',
] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_META: Record<Goal, { label: string; blurb: string }> = {
  cardio: { label: 'Améliorer le cardio', blurb: 'Tenir plus longtemps, récupérer plus vite' },
  'endurance-boxe': {
    label: 'Endurance spécifique boxe',
    blurb: 'Garder les bras hauts au dernier round',
  },
  explosivite: { label: 'Devenir plus explosif', blurb: 'Jambes et hanches plus vives' },
  force: { label: 'Développer la force', blurb: 'Plus solide sur les appuis et les impacts' },
  'endurance-musculaire': {
    label: 'Endurance musculaire',
    blurb: 'Répéter l’effort sans perdre en qualité',
  },
  'perte-de-gras': { label: 'Perdre du gras', blurb: 'Densité de travail et dépense élevées' },
  'masse-musculaire': { label: 'Développer la masse', blurb: 'Volume et tension mécanique' },
  jambes: { label: 'Améliorer les jambes', blurb: 'Appuis, déplacements, puissance basse' },
  core: { label: 'Renforcer le core', blurb: 'Transmettre la force du sol aux poings' },
  mobilite: { label: 'Améliorer la mobilité', blurb: 'Amplitude des hanches et des épaules' },
  'condition-generale': { label: 'Condition générale', blurb: 'Un athlète complet et équilibré' },
};

export type SportLevel = 'debutant' | 'intermediaire' | 'avance';
export type BoxingLevel = 'aucun' | 'loisir' | 'competiteur';
export type LiftingExperience = 'aucune' | 'occasionnelle' | 'reguliere';
export type IntensityPreference = 'progressive' | 'equilibree' | 'exigeante';

export const SPORT_LEVEL_LABELS: Record<SportLevel, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
};

/** Onboarding answers plus everything the engines read about the athlete. */
export interface UserProfile {
  readonly createdAt: number;
  readonly name?: string;
  readonly birthYear?: number;
  readonly heightCm?: number;
  readonly weightKg?: number;

  readonly sportLevel: SportLevel;
  readonly boxingLevel: BoxingLevel;
  readonly lifting: LiftingExperience;
  /** Target sessions per week, 2 … 6. */
  readonly weeklyFrequency: number;
  readonly goals: readonly Goal[];
  readonly intensity: IntensityPreference;

  readonly space: SpaceNeed;
  readonly equipment: readonly Equipment[];

  /** Exercises the athlete is confident with — biases selection upward. */
  readonly mastered: readonly ExerciseId[];
  /** Exercises that feel hard — biases selection downward, never excluded. */
  readonly difficult: readonly ExerciseId[];
  /** Hard exclusions. These exercises are never prescribed. */
  readonly excluded: readonly ExerciseId[];
  /** Patterns to avoid entirely, e.g. after declaring a shoulder limitation. */
  readonly avoidPatterns: readonly string[];
  /** Free-text limitations the athlete declared during onboarding. */
  readonly limitations?: string;
}

/** Result of one movement in the initial assessment. */
export interface AssessmentEntry {
  readonly exerciseId: ExerciseId;
  readonly value: number;
  readonly measure: 'reps' | 'temps';
}

export interface Assessment {
  readonly at: DateKey;
  readonly entries: readonly AssessmentEntry[];
  /** Derived starting level per chain, 1-indexed rank into the chain. */
  readonly chainLevels: Readonly<Record<string, number>>;
}

/** Where the athlete currently sits on each progression chain. */
export interface ProgressionState {
  /** chainId → { rank, credit } — `credit` accumulates toward the next rank. */
  readonly chains: Readonly<Record<string, { rank: number; credit: number }>>;
  /** Sessions completed since the last layoff recalibration. */
  readonly rampSessions: number;
  /** 0 … 1. 1 = fully calibrated, < 1 after a layoff. */
  readonly calibration: number;
}

/**
 * Estimated training fatigue per region, 0 (fresh) … 1 (fully fatigued).
 * These are training estimates derived from prescribed volume and reported
 * effort. They are not physiological measurements and never medical advice.
 */
export interface RecoveryState {
  readonly updatedAt: DateKey;
  /** Millisecond timestamp of the last update, so decay is hour-accurate. */
  readonly updatedTs: number;
  readonly fatigue: Readonly<Record<RecoveryRegion, number>>;
  /** Rolling muscle-group volume over the balance window, for debt scoring. */
  readonly muscleVolume: Readonly<Partial<Record<MuscleGroup, number>>>;
}

export interface Achievement {
  readonly id: AchievementId;
  readonly label: string;
  readonly description: string;
  readonly unlockedAt?: DateKey;
  /** Current value toward `target`, for progress display. */
  readonly progress: number;
  readonly target: number;
}

export type AudioMode = 'audio-vibration' | 'audio' | 'vibration' | 'silence';

export interface AppSettings {
  readonly audioMode: AudioMode;
  readonly voiceCallouts: boolean;
  /** 'fr' calls "un — deux", 'en' calls "one — two". */
  readonly voiceLang: 'fr' | 'en';
  readonly countdownBeeps: boolean;
  readonly keepScreenAwake: boolean;
  readonly units: 'metric' | 'imperial';
  readonly theme: 'sombre' | 'clair' | 'systeme';
  /**
   * Démonstrations animées des exercices.
   *
   * `systeme` suit « Réduire les animations » d'iOS. C'est le bon défaut, mais
   * pas toujours le bon choix : sur une fiche d'exercice le mouvement *est*
   * l'information, et quelqu'un qui réduit les animations à l'échelle du
   * système peut vouloir les garder ici. D'où l'option explicite.
   */
  readonly animations: 'systeme' | 'toujours' | 'jamais';
  /** Ask before ending a session that still has work left. */
  readonly confirmQuit: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  audioMode: 'audio-vibration',
  voiceCallouts: true,
  voiceLang: 'fr',
  countdownBeeps: true,
  keepScreenAwake: true,
  units: 'metric',
  theme: 'sombre',
  animations: 'systeme',
  confirmQuit: true,
};

/** Everything persisted for the single athlete, as one versioned document. */
export interface AppState {
  readonly schemaVersion: number;
  readonly profile: UserProfile | null;
  readonly assessment: Assessment | null;
  readonly progression: ProgressionState;
  readonly recovery: RecoveryState;
  readonly settings: AppSettings;
  readonly sessions: readonly string[];
  readonly achievements: Readonly<Record<string, DateKey>>;
  readonly onboardedAt?: number;
}

export type ChainLevels = Readonly<Record<ChainId, number>>;
