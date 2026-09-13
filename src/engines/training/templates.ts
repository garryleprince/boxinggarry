import type { Impact, Measure, Pattern, Quality } from '@/domain/model/taxonomy';
import type { Archetype, BlockFormat, BlockKind } from '@/domain/model/workout';

/**
 * Session templates.
 *
 * A template fixes the *shape* of a session — how the twenty minutes are
 * divided and what job each block does — and nothing else. Which exercises
 * land in each slot, and at what dose, is decided by the generator from the
 * athlete's level, goals, history and recovery. No session is hard-coded
 * (cahier des charges §15).
 */

export type SlotRole =
  | 'mobilite'
  | 'activation'
  | 'force'
  | 'puissance'
  | 'conditioning'
  | 'core'
  | 'boxe'
  | 'retour-au-calme';

export interface SlotSpec {
  readonly role: SlotRole;
  /** Acceptable patterns for this slot. */
  readonly patterns: readonly Pattern[];
  /** Qualities that earn a bonus here. */
  readonly qualities?: readonly Quality[];
  /** Force a measure regardless of the exercise's natural one. */
  readonly measure?: Measure;
  readonly maxImpact?: Impact;
  readonly maxSkill?: number;
  /** Ceiling on `exercise.intensity` for this slot specifically. */
  readonly maxIntensity?: number;
  /** Restrict mobility work to warm-up (dynamic) or cool-down (static) style. */
  readonly stretch?: 'dynamique' | 'statique';
  /** Prefer exercises with an explicit boxing rationale. */
  readonly boxing?: boolean;
}

export interface BlockSpec {
  readonly key: string;
  readonly kind: BlockKind;
  readonly title: string;
  readonly intent: string;
  readonly format: BlockFormat;
  /** Fraction of the usable budget (all shares of a template sum to 1). */
  readonly share: number;
  readonly rounds: number;
  readonly restBetweenRounds: number;
  readonly restBetweenItems: number;
  readonly transition: number;
  readonly slots: readonly SlotSpec[];
}

export interface SessionTemplate {
  readonly archetype: Archetype;
  readonly title: string;
  /** 1…5 planned intensity, before any fatigue adjustment. */
  readonly intensity: 1 | 2 | 3 | 4 | 5;
  readonly budgetSec: number;
  readonly blocks: readonly BlockSpec[];
}

/** Warm-up mobility: dynamic only — static holds belong in the cool-down. */
const MOBILITY_SLOTS: SlotSpec[] = [
  {
    role: 'mobilite',
    patterns: ['mobility'],
    qualities: ['mobilite'],
    measure: 'temps',
    stretch: 'dynamique',
  },
  {
    role: 'mobilite',
    patterns: ['mobility'],
    qualities: ['mobilite'],
    measure: 'temps',
    stretch: 'dynamique',
  },
];

const warmup = (share: number, extra: SlotSpec[] = []): BlockSpec => ({
  key: 'echauffement',
  kind: 'echauffement',
  title: 'Échauffement',
  intent: 'Monter en température et préparer les articulations sollicitées aujourd’hui.',
  format: 'flow',
  share,
  rounds: 1,
  restBetweenRounds: 0,
  restBetweenItems: 5,
  transition: 5,
  slots: [
    ...MOBILITY_SLOTS,
    {
      // Raising the heart rate, not training: a burpee is not a warm-up.
      role: 'activation',
      patterns: ['locomotion'],
      qualities: ['cardio'],
      measure: 'temps',
      maxImpact: 'modere',
      maxSkill: 2,
      maxIntensity: 3,
    },
    ...extra,
  ],
});

const cooldown = (share: number, key = 'cooldown'): BlockSpec => ({
  key,
  kind: 'cooldown',
  title: 'Retour au calme',
  intent: 'Faire redescendre la fréquence cardiaque et relâcher ce qui vient de travailler.',
  format: 'flow',
  share,
  rounds: 1,
  restBetweenRounds: 0,
  restBetweenItems: 5,
  transition: 6,
  slots: [
    {
      role: 'retour-au-calme',
      patterns: ['mobility'],
      qualities: ['mobilite'],
      measure: 'temps',
      stretch: 'statique',
    },
    {
      role: 'retour-au-calme',
      patterns: ['mobility'],
      qualities: ['mobilite'],
      measure: 'temps',
      stretch: 'statique',
    },
  ],
});

export const TEMPLATES: Record<Archetype, SessionTemplate> = {
  /* ------------------------------------------------------ full body boxing */
  'full-body-boxing': {
    archetype: 'full-body-boxing',
    title: 'Full Body Boxing',
    intensity: 4,
    budgetSec: 1200,
    blocks: [
      warmup(0.14),
      {
        key: 'force',
        kind: 'principal',
        title: 'Force',
        intent: 'Construire la solidité qui tient la garde et encaisse les appuis.',
        format: 'series',
        share: 0.25,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 15,
        transition: 6,
        slots: [
          { role: 'force', patterns: ['push-horizontal', 'push-vertical'], qualities: ['force'] },
          { role: 'force', patterns: ['pull', 'hinge'], qualities: ['force'] },
        ],
      },
      {
        key: 'explosivite',
        kind: 'principal',
        title: 'Explosivité',
        intent: 'Transformer cette force en vitesse de déplacement et de frappe.',
        format: 'series',
        share: 0.22,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 15,
        transition: 6,
        slots: [
          {
            role: 'puissance',
            patterns: ['plyo-lower', 'squat', 'lunge'],
            qualities: ['explosivite', 'puissance'],
          },
          {
            role: 'puissance',
            patterns: ['core-rotation', 'plyo-upper', 'shadowbox'],
            qualities: ['puissance', 'vitesse', 'explosivite'],
            boxing: true,
          },
        ],
      },
      {
        key: 'conditioning',
        kind: 'principal',
        title: 'Conditioning',
        intent: 'Répéter l’effort quand la fatigue est déjà installée.',
        format: 'circuit',
        share: 0.26,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 10,
        transition: 6,
        slots: [
          {
            role: 'conditioning',
            patterns: ['locomotion'],
            qualities: ['conditioning', 'cardio'],
            measure: 'temps',
          },
          {
            role: 'boxe',
            patterns: ['shadowbox'],
            qualities: ['cardio', 'coordination'],
            measure: 'temps',
            boxing: true,
          },
          {
            role: 'core',
            patterns: ['core-anti-extension', 'core-anti-rotation', 'core-flexion'],
            qualities: ['core'],
            measure: 'temps',
          },
        ],
      },
      cooldown(0.13),
    ],
  },

  /* ----------------------------------------------------------- explosivité */
  explosivite: {
    archetype: 'explosivite',
    title: 'Explosivité',
    intensity: 4,
    budgetSec: 1200,
    blocks: [
      warmup(0.15),
      {
        key: 'activation',
        kind: 'activation',
        title: 'Activation',
        intent: 'Réveiller le système nerveux avant le travail de puissance.',
        format: 'series',
        share: 0.09,
        rounds: 2,
        restBetweenRounds: 15,
        restBetweenItems: 10,
        transition: 5,
        slots: [
          {
            role: 'activation',
            patterns: ['hinge', 'core-anti-rotation'],
            qualities: ['stabilite'],
            maxIntensity: 3,
          },
        ],
      },
      {
        key: 'puissance-a',
        kind: 'principal',
        title: 'Puissance — jambes',
        intent: 'Produire un maximum de force en un minimum de temps.',
        format: 'series',
        share: 0.28,
        rounds: 4,
        restBetweenRounds: 35,
        restBetweenItems: 20,
        transition: 6,
        slots: [
          {
            role: 'puissance',
            patterns: ['plyo-lower'],
            qualities: ['explosivite', 'puissance'],
          },
        ],
      },
      {
        key: 'puissance-b',
        kind: 'principal',
        title: 'Puissance — haut du corps & rotation',
        intent: 'Étendre l’explosivité à la chaîne qui transmet la frappe.',
        format: 'series',
        share: 0.22,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 15,
        transition: 6,
        slots: [
          {
            role: 'puissance',
            patterns: ['plyo-upper', 'push-horizontal'],
            qualities: ['explosivite', 'puissance', 'vitesse'],
          },
          {
            role: 'puissance',
            patterns: ['core-rotation', 'shadowbox'],
            qualities: ['puissance', 'vitesse'],
            boxing: true,
          },
        ],
      },
      {
        key: 'core',
        kind: 'principal',
        title: 'Core',
        intent: 'Verrouiller le tronc qui transmet toute cette puissance.',
        format: 'series',
        share: 0.13,
        rounds: 2,
        restBetweenRounds: 20,
        restBetweenItems: 10,
        transition: 6,
        slots: [
          {
            role: 'core',
            patterns: ['core-anti-rotation', 'core-anti-extension'],
            qualities: ['core', 'stabilite'],
          },
        ],
      },
      cooldown(0.13),
    ],
  },

  /* ----------------------------------------------------------------- force */
  force: {
    archetype: 'force',
    title: 'Force',
    intensity: 3,
    budgetSec: 1200,
    blocks: [
      warmup(0.14),
      {
        key: 'force-a',
        kind: 'principal',
        title: 'Poussée',
        intent: 'Le travail de poussée du jour, à l’étape exacte de ta progression.',
        format: 'series',
        share: 0.26,
        rounds: 4,
        restBetweenRounds: 35,
        restBetweenItems: 15,
        transition: 6,
        slots: [
          { role: 'force', patterns: ['push-horizontal', 'push-vertical'], qualities: ['force'] },
        ],
      },
      {
        key: 'force-b',
        kind: 'principal',
        title: 'Tirage & chaîne postérieure',
        intent: 'Équilibrer la poussée — sans quoi les épaules se referment.',
        format: 'series',
        share: 0.24,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 15,
        transition: 6,
        slots: [
          { role: 'force', patterns: ['pull'], qualities: ['force'] },
          { role: 'force', patterns: ['hinge'], qualities: ['force', 'stabilite'] },
        ],
      },
      {
        key: 'force-c',
        kind: 'principal',
        title: 'Jambes',
        intent: 'Force unilatérale et contrôle en position basse.',
        format: 'series',
        share: 0.22,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 15,
        transition: 6,
        slots: [
          { role: 'force', patterns: ['squat', 'lunge'], qualities: ['force'] },
          {
            role: 'core',
            patterns: ['core-anti-extension', 'isometric'],
            qualities: ['core', 'stabilite'],
          },
        ],
      },
      cooldown(0.14),
    ],
  },

  /* ---------------------------------------------------------- conditioning */
  conditioning: {
    archetype: 'conditioning',
    title: 'Conditioning',
    intensity: 5,
    budgetSec: 1200,
    blocks: [
      warmup(0.13),
      {
        key: 'circuit-a',
        kind: 'principal',
        title: 'Circuit 1',
        intent: 'Installer une intensité tenable et l’entretenir.',
        format: 'circuit',
        share: 0.31,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 8,
        transition: 6,
        slots: [
          {
            role: 'conditioning',
            patterns: ['locomotion'],
            qualities: ['conditioning', 'cardio'],
            measure: 'temps',
          },
          {
            role: 'conditioning',
            patterns: ['squat', 'lunge', 'plyo-lower'],
            qualities: ['endurance-musculaire', 'conditioning'],
            measure: 'temps',
          },
          {
            role: 'conditioning',
            patterns: ['push-horizontal', 'push-vertical'],
            qualities: ['endurance-musculaire'],
            measure: 'temps',
          },
        ],
      },
      {
        key: 'circuit-b',
        kind: 'principal',
        title: 'Circuit 2',
        intent: 'Reproduire l’effort de fin de round, avec la fatigue déjà là.',
        format: 'circuit',
        share: 0.28,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 8,
        transition: 6,
        slots: [
          {
            role: 'boxe',
            patterns: ['shadowbox'],
            qualities: ['cardio', 'conditioning'],
            measure: 'temps',
            boxing: true,
          },
          {
            role: 'core',
            patterns: ['core-anti-extension', 'core-flexion', 'core-anti-rotation'],
            qualities: ['core'],
            measure: 'temps',
          },
        ],
      },
      {
        key: 'finisher',
        kind: 'finisher',
        title: 'Finisher',
        intent: 'Trente secondes qui décident du round : tu tiens ou tu lâches.',
        format: 'rounds',
        share: 0.15,
        rounds: 2,
        restBetweenRounds: 25,
        restBetweenItems: 8,
        transition: 5,
        slots: [
          {
            role: 'conditioning',
            patterns: ['locomotion', 'shadowbox', 'plyo-lower'],
            qualities: ['conditioning', 'vitesse'],
            measure: 'temps',
          },
        ],
      },
      cooldown(0.13),
    ],
  },

  /* -------------------------------------------------------- core-stabilité */
  'core-stabilite': {
    archetype: 'core-stabilite',
    title: 'Core & Stabilité',
    intensity: 3,
    budgetSec: 1200,
    blocks: [
      warmup(0.14),
      {
        key: 'core-a',
        kind: 'principal',
        title: 'Anti-extension',
        intent: 'Empêcher le bas du dos de céder : la première fonction du tronc.',
        format: 'series',
        share: 0.25,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 12,
        transition: 6,
        slots: [
          {
            role: 'core',
            patterns: ['core-anti-extension'],
            qualities: ['core', 'stabilite'],
          },
          { role: 'core', patterns: ['core-flexion'], qualities: ['core'] },
        ],
      },
      {
        key: 'core-b',
        kind: 'principal',
        title: 'Anti-rotation & obliques',
        intent: 'Résister à la rotation, pour mieux la produire ensuite.',
        format: 'series',
        share: 0.24,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 12,
        transition: 6,
        slots: [
          {
            role: 'core',
            patterns: ['core-anti-rotation'],
            qualities: ['core', 'stabilite'],
            boxing: true,
          },
          { role: 'core', patterns: ['core-rotation'], qualities: ['core'], boxing: true },
        ],
      },
      {
        key: 'core-c',
        kind: 'principal',
        title: 'Équilibre & bassin',
        intent: 'Stabiliser le bassin — la base des appuis et des déplacements.',
        format: 'series',
        share: 0.22,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 12,
        transition: 6,
        slots: [
          {
            role: 'core',
            patterns: ['hinge', 'isometric'],
            qualities: ['equilibre', 'stabilite'],
          },
          {
            role: 'core',
            patterns: ['core-anti-rotation', 'locomotion'],
            qualities: ['stabilite', 'coordination'],
          },
        ],
      },
      cooldown(0.15),
    ],
  },

  /* ----------------------------------------------------------- hybride boxe */
  'hybride-boxe': {
    archetype: 'hybride-boxe',
    title: 'Hybride Boxe',
    intensity: 4,
    budgetSec: 1200,
    blocks: [
      warmup(0.14),
      {
        key: 'rounds-a',
        kind: 'principal',
        title: 'Rounds 1–3',
        intent: 'Alterner frappes et travail physique, comme sur un vrai round.',
        format: 'rounds',
        share: 0.3,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 5,
        transition: 5,
        slots: [
          {
            role: 'boxe',
            patterns: ['shadowbox'],
            qualities: ['cardio', 'coordination'],
            measure: 'temps',
            boxing: true,
          },
          {
            role: 'conditioning',
            patterns: ['squat', 'lunge', 'plyo-lower'],
            qualities: ['conditioning', 'endurance-musculaire'],
            measure: 'temps',
          },
        ],
      },
      {
        key: 'rounds-b',
        kind: 'principal',
        title: 'Rounds 4–6',
        intent: 'Le haut du corps prend le relais, garde haute malgré la fatigue.',
        format: 'rounds',
        share: 0.28,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 5,
        transition: 5,
        slots: [
          {
            role: 'conditioning',
            patterns: ['push-horizontal', 'push-vertical', 'locomotion'],
            qualities: ['endurance-musculaire', 'conditioning'],
            measure: 'temps',
          },
          {
            role: 'boxe',
            patterns: ['shadowbox', 'core-anti-rotation'],
            qualities: ['cardio', 'core'],
            measure: 'temps',
            boxing: true,
          },
        ],
      },
      {
        key: 'finisher',
        kind: 'finisher',
        title: 'Dernier round',
        intent: 'La rafale de fin : fréquence maximale sur un temps court.',
        format: 'rounds',
        share: 0.14,
        rounds: 2,
        restBetweenRounds: 20,
        restBetweenItems: 6,
        transition: 5,
        slots: [
          {
            role: 'boxe',
            patterns: ['shadowbox', 'locomotion'],
            qualities: ['vitesse', 'conditioning'],
            measure: 'temps',
            boxing: true,
          },
        ],
      },
      cooldown(0.14),
    ],
  },

  /* -------------------------------------------------------------- recovery */
  recovery: {
    archetype: 'recovery',
    title: 'Recovery',
    intensity: 1,
    budgetSec: 900,
    blocks: [
      {
        key: 'reveil',
        kind: 'echauffement',
        title: 'Réveil articulaire',
        intent: 'Remettre les articulations en mouvement, sans intensité.',
        format: 'flow',
        share: 0.18,
        rounds: 1,
        restBetweenRounds: 0,
        restBetweenItems: 5,
        transition: 6,
        slots: [
          {
            role: 'mobilite',
            patterns: ['mobility'],
            qualities: ['mobilite'],
            measure: 'temps',
            stretch: 'dynamique',
          },
          {
            role: 'mobilite',
            patterns: ['mobility'],
            qualities: ['mobilite'],
            measure: 'temps',
            stretch: 'dynamique',
          },
        ],
      },
      {
        key: 'mobilite-a',
        kind: 'principal',
        title: 'Mobilité — hanches',
        intent: 'Rendre de l’amplitude aux hanches, ce que le travail intense prend.',
        format: 'flow',
        share: 0.3,
        rounds: 2,
        restBetweenRounds: 10,
        restBetweenItems: 6,
        transition: 6,
        slots: [
          { role: 'mobilite', patterns: ['mobility'], qualities: ['mobilite'], measure: 'temps' },
          { role: 'mobilite', patterns: ['mobility'], qualities: ['mobilite'], measure: 'temps' },
        ],
      },
      {
        key: 'mobilite-b',
        kind: 'principal',
        title: 'Mobilité — buste & épaules',
        intent: 'Ouvrir le haut du dos et les épaules, fermés par la garde.',
        format: 'flow',
        share: 0.28,
        rounds: 2,
        restBetweenRounds: 10,
        restBetweenItems: 6,
        transition: 6,
        slots: [
          { role: 'mobilite', patterns: ['mobility'], qualities: ['mobilite'], measure: 'temps' },
          { role: 'mobilite', patterns: ['mobility', 'pull'], qualities: ['mobilite'], measure: 'temps' },
        ],
      },
      {
        key: 'respiration',
        kind: 'cooldown',
        title: 'Respiration',
        intent: 'Faire redescendre le système nerveux : la récupération se travaille.',
        format: 'flow',
        share: 0.24,
        rounds: 1,
        restBetweenRounds: 0,
        restBetweenItems: 5,
        transition: 6,
        slots: [
          {
            role: 'retour-au-calme',
            patterns: ['mobility'],
            qualities: ['mobilite'],
            measure: 'temps',
            stretch: 'statique',
          },
          {
            role: 'retour-au-calme',
            patterns: ['mobility'],
            qualities: ['mobilite'],
            measure: 'temps',
            stretch: 'statique',
          },
        ],
      },
    ],
  },
};
