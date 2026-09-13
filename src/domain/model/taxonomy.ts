/**
 * The vocabulary the whole product is built on: muscles, movement patterns,
 * physical qualities, equipment. Every exercise, every block template and every
 * balance rule speaks in these terms, so they are defined exactly once.
 */

/** The 14 muscle groups the programme is required to keep in balance. */
export const MUSCLE_GROUPS = [
  'pectoraux',
  'dos',
  'epaules',
  'bras',
  'avant-bras',
  'abdominaux',
  'obliques',
  'lombaires',
  'fessiers',
  'quadriceps',
  'ischio-jambiers',
  'mollets',
  'adducteurs',
  'abducteurs',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pectoraux: 'Pectoraux',
  dos: 'Dos',
  epaules: 'Épaules',
  bras: 'Bras',
  'avant-bras': 'Avant-bras',
  abdominaux: 'Abdominaux',
  obliques: 'Obliques',
  lombaires: 'Lombaires',
  fessiers: 'Fessiers',
  quadriceps: 'Quadriceps',
  'ischio-jambiers': 'Ischio-jambiers',
  mollets: 'Mollets',
  adducteurs: 'Adducteurs',
  abducteurs: 'Abducteurs',
};

/**
 * Coarse recovery regions. Muscle groups are too granular to estimate recovery
 * on with any honesty from bodyweight training alone, so fatigue is tracked on
 * these four plus the systemic `cardio` channel.
 */
export const RECOVERY_REGIONS = ['jambes', 'haut-du-corps', 'core', 'cardio'] as const;
export type RecoveryRegion = (typeof RECOVERY_REGIONS)[number];

export const REGION_LABELS: Record<RecoveryRegion, string> = {
  jambes: 'Jambes',
  'haut-du-corps': 'Haut du corps',
  core: 'Core',
  cardio: 'Cardio',
};

/** Which recovery region each muscle group loads. */
export const MUSCLE_REGION: Record<MuscleGroup, RecoveryRegion> = {
  pectoraux: 'haut-du-corps',
  dos: 'haut-du-corps',
  epaules: 'haut-du-corps',
  bras: 'haut-du-corps',
  'avant-bras': 'haut-du-corps',
  abdominaux: 'core',
  obliques: 'core',
  lombaires: 'core',
  fessiers: 'jambes',
  quadriceps: 'jambes',
  'ischio-jambiers': 'jambes',
  mollets: 'jambes',
  adducteurs: 'jambes',
  abducteurs: 'jambes',
};

/**
 * Movement patterns. The generator balances *patterns* rather than muscles when
 * selecting exercises — picking two different horizontal pushes is a worse
 * session than one push and one pull, even though the muscle lists differ.
 */
export const PATTERNS = [
  'push-horizontal',
  'push-vertical',
  'pull',
  'squat',
  'hinge',
  'lunge',
  'core-anti-extension',
  'core-anti-rotation',
  'core-flexion',
  'core-rotation',
  'plyo-lower',
  'plyo-upper',
  'locomotion',
  'shadowbox',
  'mobility',
  'isometric',
] as const;
export type Pattern = (typeof PATTERNS)[number];

export const PATTERN_LABELS: Record<Pattern, string> = {
  'push-horizontal': 'Poussée horizontale',
  'push-vertical': 'Poussée verticale',
  pull: 'Tirage',
  squat: 'Squat',
  hinge: 'Charnière de hanche',
  lunge: 'Fente',
  'core-anti-extension': 'Anti-extension',
  'core-anti-rotation': 'Anti-rotation',
  'core-flexion': 'Flexion du tronc',
  'core-rotation': 'Rotation',
  'plyo-lower': 'Pliométrie basse',
  'plyo-upper': 'Pliométrie haute',
  locomotion: 'Locomotion',
  shadowbox: 'Shadowboxing',
  mobility: 'Mobilité',
  isometric: 'Isométrie',
};

/** Physical qualities the programme develops (cahier des charges §2). */
export const QUALITIES = [
  'force',
  'endurance-musculaire',
  'explosivite',
  'puissance',
  'conditioning',
  'cardio',
  'vitesse',
  'coordination',
  'equilibre',
  'mobilite',
  'stabilite',
  'core',
] as const;
export type Quality = (typeof QUALITIES)[number];

export const QUALITY_LABELS: Record<Quality, string> = {
  force: 'Force',
  'endurance-musculaire': 'Endurance musculaire',
  explosivite: 'Explosivité',
  puissance: 'Puissance',
  conditioning: 'Conditioning',
  cardio: 'Cardio',
  vitesse: 'Vitesse',
  coordination: 'Coordination',
  equilibre: 'Équilibre',
  mobilite: 'Mobilité',
  stabilite: 'Stabilité',
  core: 'Core',
};

/**
 * Equipment. `aucun` covers the entire mandatory programme; everything else is
 * opt-in and only ever *adds* candidates to the exercise pool.
 *
 * A wall is deliberately absent: if you are indoors you have one, so treating
 * it as equipment would break the promise that the programme works with
 * nothing at all (cahier des charges §3).
 */
export const EQUIPMENT = [
  'aucun',
  'barre-traction',
  'elastiques',
  'corde-a-sauter',
  'medecine-ball',
  'chaise',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  aucun: 'Aucun matériel',
  'barre-traction': 'Barre de traction',
  elastiques: 'Élastiques',
  'corde-a-sauter': 'Corde à sauter',
  'medecine-ball': 'Médecine-ball',
  chaise: 'Chaise / banc',
};

/** How much floor the exercise needs. Filters the pool when space is tight. */
export const SPACE_NEEDS = ['tapis', 'piece', 'large'] as const;
export type SpaceNeed = (typeof SPACE_NEEDS)[number];

export const SPACE_LABELS: Record<SpaceNeed, string> = {
  tapis: "La taille d'un tapis",
  piece: 'Une pièce normale',
  large: 'Un grand espace',
};

export const SPACE_RANK: Record<SpaceNeed, number> = { tapis: 0, piece: 1, large: 2 };

/**
 * Joint impact. Used to keep plyometrics away from fatigued legs and to build
 * genuinely low-impact recovery sessions — not a medical judgement.
 */
export type Impact = 'faible' | 'modere' | 'eleve';
export const IMPACT_RANK: Record<Impact, number> = { faible: 0, modere: 1, eleve: 2 };

/** Whether a prescription is counted in repetitions or in seconds. */
export type Measure = 'reps' | 'temps';
