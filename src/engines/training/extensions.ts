import type { Archetype } from '@/domain/model/workout';
import type { RecoveryState } from '@/domain/model/user';
import type { BlockSpec, SessionTemplate } from './templates';

/**
 * The +10 module (cahier des charges §7, §8).
 *
 * Always optional — the plan progresses perfectly well without it — and never
 * a repeat of what has just been done. The chooser reads what the main session
 * loaded and picks a module that *completes* it: after a brutal plyometric
 * session the extension is core and mobility, after a light session it can be
 * the harder option.
 */

export type ExtensionKey =
  | 'core'
  | 'conditioning'
  | 'explosivite'
  | 'shadowboxing'
  | 'mobilite'
  | 'full-body'
  | 'endurance'
  | 'finisher';

export interface ExtensionTemplate {
  readonly key: ExtensionKey;
  readonly title: string;
  readonly blurb: string;
  readonly emoji: string;
  readonly intensity: 1 | 2 | 3 | 4 | 5;
  readonly budgetSec: number;
  readonly blocks: readonly BlockSpec[];
}

const EXTENSION_BUDGET = 600;

const shortCooldown = (share: number): BlockSpec => ({
  key: 'ext-cooldown',
  kind: 'cooldown',
  title: 'Relâchement',
  intent: 'Deux mouvements pour finir propre.',
  format: 'flow',
  share,
  rounds: 1,
  restBetweenRounds: 0,
  restBetweenItems: 5,
  transition: 5,
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

export const EXTENSIONS: Record<ExtensionKey, ExtensionTemplate> = {
  core: {
    key: 'core',
    title: 'Core',
    blurb: 'Tronc complet : anti-extension, anti-rotation, obliques.',
    emoji: '🎯',
    intensity: 3,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-core-a',
        kind: 'principal',
        title: 'Circuit core',
        intent: 'Les quatre fonctions du tronc en un circuit court.',
        format: 'circuit',
        share: 0.82,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 8,
        transition: 5,
        slots: [
          { role: 'core', patterns: ['core-anti-extension'], qualities: ['core'], measure: 'temps' },
          {
            role: 'core',
            patterns: ['core-anti-rotation'],
            qualities: ['core', 'stabilite'],
            measure: 'temps',
          },
          {
            role: 'core',
            patterns: ['core-flexion', 'core-rotation'],
            qualities: ['core'],
            measure: 'temps',
          },
        ],
      },
      shortCooldown(0.18),
    ],
  },

  conditioning: {
    key: 'conditioning',
    title: 'Conditioning',
    blurb: 'Circuit cardio court, intensité élevée.',
    emoji: '🔥',
    intensity: 5,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-cond',
        kind: 'principal',
        title: 'Circuit',
        intent: 'Dix minutes pour pousser la filière cardio au-delà de la séance.',
        format: 'circuit',
        share: 0.82,
        rounds: 4,
        restBetweenRounds: 25,
        restBetweenItems: 6,
        transition: 5,
        slots: [
          {
            role: 'conditioning',
            patterns: ['locomotion'],
            qualities: ['conditioning', 'cardio'],
            measure: 'temps',
          },
          {
            role: 'conditioning',
            patterns: ['squat', 'lunge', 'core-anti-extension'],
            qualities: ['conditioning', 'endurance-musculaire'],
            measure: 'temps',
          },
        ],
      },
      shortCooldown(0.18),
    ],
  },

  explosivite: {
    key: 'explosivite',
    title: 'Explosivité',
    blurb: 'Séries courtes de puissance, récupération longue.',
    emoji: '⚡',
    intensity: 4,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-explo',
        kind: 'principal',
        title: 'Puissance',
        intent: 'Peu de répétitions, qualité maximale sur chacune.',
        format: 'series',
        share: 0.82,
        rounds: 4,
        restBetweenRounds: 35,
        restBetweenItems: 15,
        transition: 5,
        slots: [
          {
            role: 'puissance',
            patterns: ['plyo-lower', 'plyo-upper'],
            qualities: ['explosivite', 'puissance'],
          },
        ],
      },
      shortCooldown(0.18),
    ],
  },

  shadowboxing: {
    key: 'shadowboxing',
    title: 'Shadowboxing',
    blurb: 'Trois rounds de frappes et de déplacements.',
    emoji: '🥊',
    intensity: 3,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-shadow',
        kind: 'principal',
        title: 'Rounds',
        intent: 'Coordination et respiration, sans charge articulaire supplémentaire.',
        format: 'rounds',
        share: 0.84,
        rounds: 3,
        restBetweenRounds: 40,
        restBetweenItems: 6,
        transition: 5,
        slots: [
          {
            role: 'boxe',
            patterns: ['shadowbox'],
            qualities: ['coordination', 'cardio'],
            measure: 'temps',
            boxing: true,
          },
        ],
      },
      shortCooldown(0.16),
    ],
  },

  mobilite: {
    key: 'mobilite',
    title: 'Mobilité',
    blurb: 'Dix minutes de récupération active et de respiration.',
    emoji: '🧘',
    intensity: 1,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-mob',
        kind: 'principal',
        title: 'Flow mobilité',
        intent: 'Rendre de l’amplitude à ce qui vient de travailler.',
        format: 'flow',
        share: 1,
        rounds: 2,
        restBetweenRounds: 10,
        restBetweenItems: 6,
        transition: 6,
        slots: [
          { role: 'mobilite', patterns: ['mobility'], qualities: ['mobilite'], measure: 'temps' },
          { role: 'mobilite', patterns: ['mobility'], qualities: ['mobilite'], measure: 'temps' },
          { role: 'mobilite', patterns: ['mobility'], qualities: ['mobilite'], measure: 'temps' },
        ],
      },
    ],
  },

  'full-body': {
    key: 'full-body',
    title: 'Circuit full body',
    blurb: 'Un tour complet du corps en quatre mouvements.',
    emoji: '💪',
    intensity: 4,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-fb',
        kind: 'principal',
        title: 'Circuit complet',
        intent: 'Pousser, tirer, fléchir, gainer — rien n’est oublié.',
        format: 'circuit',
        share: 0.82,
        rounds: 3,
        restBetweenRounds: 25,
        restBetweenItems: 6,
        transition: 5,
        slots: [
          {
            role: 'conditioning',
            patterns: ['push-horizontal', 'push-vertical'],
            qualities: ['endurance-musculaire'],
            measure: 'temps',
          },
          { role: 'conditioning', patterns: ['pull'], qualities: ['force'], measure: 'temps' },
          {
            role: 'conditioning',
            patterns: ['squat', 'lunge', 'hinge'],
            qualities: ['endurance-musculaire'],
            measure: 'temps',
          },
          {
            role: 'core',
            patterns: ['core-anti-extension', 'core-flexion'],
            qualities: ['core'],
            measure: 'temps',
          },
        ],
      },
      shortCooldown(0.18),
    ],
  },

  endurance: {
    key: 'endurance',
    title: 'Endurance musculaire',
    blurb: 'Séries longues, repos courts, tension continue.',
    emoji: '⏱️',
    intensity: 4,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-endu',
        kind: 'principal',
        title: 'Séries longues',
        intent: 'Tenir la qualité de mouvement quand le muscle brûle.',
        format: 'series',
        share: 0.82,
        rounds: 3,
        restBetweenRounds: 30,
        restBetweenItems: 10,
        transition: 5,
        slots: [
          {
            role: 'conditioning',
            patterns: ['push-horizontal', 'push-vertical', 'pull'],
            qualities: ['endurance-musculaire'],
            measure: 'temps',
          },
          {
            role: 'conditioning',
            patterns: ['squat', 'lunge', 'isometric'],
            qualities: ['endurance-musculaire'],
            measure: 'temps',
          },
        ],
      },
      shortCooldown(0.18),
    ],
  },

  finisher: {
    key: 'finisher',
    title: 'Finisher',
    blurb: 'Court, dense, sans négociation.',
    emoji: '💥',
    intensity: 5,
    budgetSec: EXTENSION_BUDGET,
    blocks: [
      {
        key: 'ext-fin',
        kind: 'finisher',
        title: 'Finisher',
        intent: 'Ce qui reste dans le réservoir, tu le mets là.',
        format: 'rounds',
        share: 0.8,
        rounds: 5,
        restBetweenRounds: 25,
        restBetweenItems: 6,
        transition: 5,
        slots: [
          {
            role: 'conditioning',
            patterns: ['locomotion', 'plyo-lower', 'shadowbox'],
            qualities: ['conditioning', 'vitesse'],
            measure: 'temps',
          },
        ],
      },
      shortCooldown(0.2),
    ],
  },
};

/**
 * Candidates after a demanding session: low joint cost, but still training.
 * Pure mobility comes last here — the main session already ended with a
 * cool-down, so offering more of it as the reward for wanting extra work is
 * anticlimactic.
 */
const GENTLE: readonly ExtensionKey[] = ['core', 'shadowboxing', 'mobilite'];
/** Candidates when the athlete is genuinely spent: mobility first. */
const RECOVERING: readonly ExtensionKey[] = ['mobilite', 'shadowboxing', 'core'];
/** Candidates when there is room to push. */
const DEMANDING: readonly ExtensionKey[] = ['conditioning', 'full-body', 'finisher'];

/** What each archetype already covered — avoid offering more of the same. */
const ALREADY_COVERED: Record<Archetype, readonly ExtensionKey[]> = {
  'full-body-boxing': ['full-body', 'conditioning'],
  explosivite: ['explosivite', 'finisher'],
  force: ['endurance', 'full-body'],
  conditioning: ['conditioning', 'finisher', 'full-body'],
  'core-stabilite': ['core'],
  'hybride-boxe': ['shadowboxing', 'conditioning', 'finisher'],
  recovery: ['mobilite'],
};

/**
 * What genuinely complements each archetype, in preference order.
 *
 * These are consulted first, so the offer differs by session instead of
 * defaulting to the same module every day: after a full-body session the
 * useful addition is skill and rhythm work, after a power session it is the
 * trunk that has to transmit that power, after a strength session it is the
 * metabolic side that tension work leaves untouched.
 */
const COMPLEMENT: Record<Archetype, readonly ExtensionKey[]> = {
  'full-body-boxing': ['shadowboxing', 'core', 'mobilite'],
  explosivite: ['core', 'mobilite', 'shadowboxing'],
  force: ['conditioning', 'shadowboxing', 'core'],
  conditioning: ['core', 'shadowboxing', 'mobilite'],
  'core-stabilite': ['conditioning', 'explosivite', 'shadowboxing'],
  'hybride-boxe': ['endurance', 'core', 'mobilite'],
  recovery: ['shadowboxing', 'core', 'mobilite'],
};

/** Intensity ceiling for the module, given how the main session went. */
function intensityCeiling(tired: boolean, preferGentle: boolean): number {
  if (tired) return 1;
  return preferGentle ? 3 : 5;
}

export interface ExtensionChoice {
  readonly template: ExtensionTemplate;
  /** Why this module, in one sentence the athlete can read. */
  readonly reason: string;
}

/**
 * Choose the +10 module that best completes a main session.
 * `mainIntensity` is the *planned* intensity, `recovery` the state after it.
 */
export function chooseExtension(
  mainArchetype: Archetype,
  mainIntensity: number,
  recovery: RecoveryState,
): ExtensionChoice {
  const covered = new Set(ALREADY_COVERED[mainArchetype]);
  const tired =
    Math.max(recovery.fatigue.jambes, recovery.fatigue['haut-du-corps'], recovery.fatigue.cardio) >
    0.7;
  // A recovery day stays a recovery day: the +10 never turns it into a hard
  // session, whatever the fatigue figures say (cahier des charges §35).
  const preferGentle = mainIntensity >= 4 || tired || mainArchetype === 'recovery';
  const preferred = tired ? RECOVERING : preferGentle ? GENTLE : DEMANDING;
  const ceiling = intensityCeiling(tired, preferGentle);

  // Archetype-specific complements first, then the intensity-appropriate list.
  const ordered = [...COMPLEMENT[mainArchetype], ...preferred];
  const pick =
    ordered.find((k) => !covered.has(k) && EXTENSIONS[k].intensity <= ceiling) ??
    ordered.find((k) => EXTENSIONS[k].intensity <= ceiling) ??
    'mobilite';
  const template = EXTENSIONS[pick];

  const reason =
    mainArchetype === 'recovery'
      ? 'Journée de récupération : ces 10 minutes restent légères.'
      : tired
        ? 'Tes zones les plus sollicitées sont entamées — ces 10 minutes récupèrent au lieu d’en rajouter.'
        : preferGentle
          ? 'La séance a déjà été exigeante — ces 10 minutes complètent sans charger davantage les articulations.'
          : 'La séance était abordable — ces 10 minutes vont chercher ce qu’elle n’a pas travaillé.';

  return { template, reason };
}

/** Adapt an extension template into the shape the generator consumes. */
export const asSessionTemplate = (
  ext: ExtensionTemplate,
  archetype: Archetype,
): SessionTemplate => ({
  archetype,
  title: ext.title,
  intensity: ext.intensity,
  budgetSec: ext.budgetSec,
  blocks: ext.blocks,
});
