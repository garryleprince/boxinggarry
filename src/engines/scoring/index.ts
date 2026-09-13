import { CHAIN_IDS, chainLength, exerciseAtRank, getExercise } from '@/data/exercises';
import type { DateKey } from '@/domain/model/ids';
import { daysBetween } from '@/domain/model/ids';
import type { Performance, WorkoutSession } from '@/domain/model/workout';
import type { ProgressionState, UserProfile } from '@/domain/model/user';
import { rankOf } from '@/engines/progression';
import { itemWorkSec } from '@/engines/training/duration';
import { clamp } from '@/lib/rng';

/**
 * Boxing Athlete Score.
 *
 * Every sub-score is a documented function of data the app actually measures:
 * the step reached on each movement ladder, personal records, and the work
 * volume and reported effort recorded during sessions. Each one carries the
 * inputs it was computed from, and the UI shows them — there is no decorative
 * figure anywhere in this module (cahier des charges §36).
 *
 * Where a quality cannot honestly be measured with a phone and no equipment,
 * the sub-score says what it *does* measure instead of implying otherwise.
 */

export const SCORE_KEYS = [
  'force',
  'puissance',
  'conditioning',
  'endurance',
  'core',
  'vitesse',
  'mobilite',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_LABELS: Record<ScoreKey, string> = {
  force: 'Force',
  puissance: 'Puissance',
  conditioning: 'Conditioning',
  endurance: 'Endurance',
  core: 'Core',
  vitesse: 'Vitesse',
  mobilite: 'Mobilité',
};

/** Weights in the overall score, chosen for what matters to a boxer. */
const WEIGHTS: Record<ScoreKey, number> = {
  force: 0.18,
  puissance: 0.18,
  conditioning: 0.2,
  endurance: 0.15,
  core: 0.14,
  vitesse: 0.07,
  mobilite: 0.08,
};

export interface ScoreInput {
  readonly label: string;
  readonly value: string;
}

export interface ScoreComponent {
  readonly key: ScoreKey;
  readonly label: string;
  /** 0…100, or null when there is not yet enough data to say anything. */
  readonly value: number | null;
  /** What this number is, in one sentence. Shown next to the figure. */
  readonly explanation: string;
  readonly inputs: readonly ScoreInput[];
  readonly confidence: 'aucune' | 'faible' | 'moyenne' | 'bonne';
}

export interface AthleteScore {
  /** 0…100, or null before any data exists. */
  readonly overall: number | null;
  readonly components: readonly ScoreComponent[];
  /** Number of completed sessions the score is based on. */
  readonly basis: number;
}

/** Reference values a well-conditioned amateur boxer can hold. */
const BENCHMARKS = {
  gainageSec: 120,
  pompesReps: 40,
  squatReps: 60,
  burpees60: 22,
  /** Mobility seconds over the 28-day window that counts as "maintained". */
  mobilite28j: 1500,
  /** Seconds of speed-quality work over 28 days that counts as "developed". */
  vitesse28j: 900,
} as const;

const WINDOW_DAYS = 28;

const normaliseChain = (state: ProgressionState, id: string): number | null => {
  const max = chainLength(id);
  if (max <= 1) return null;
  return clamp((rankOf(state, id) - 1) / (max - 1), 0, 1);
};

const stepName = (state: ProgressionState, id: string): string =>
  exerciseAtRank(id, rankOf(state, id))?.name ?? '—';

function confidenceFrom(sessions: number): ScoreComponent['confidence'] {
  if (sessions === 0) return 'aucune';
  if (sessions < 4) return 'faible';
  if (sessions < 12) return 'moyenne';
  return 'bonne';
}

interface Window {
  readonly sessions: readonly WorkoutSession[];
  /** Seconds of work per quality over the window. */
  readonly qualitySec: Record<string, number>;
  readonly mobilitySec: number;
  readonly conditioningSessions: readonly WorkoutSession[];
}

function buildWindow(sessions: readonly WorkoutSession[], today: DateKey): Window {
  const recent = sessions.filter(
    (s) => s.status === 'terminee' && daysBetween(s.date, today) <= WINDOW_DAYS,
  );
  const qualitySec: Record<string, number> = {};
  let mobilitySec = 0;

  for (const session of recent) {
    for (const block of session.workout.blocks) {
      for (let round = 0; round < block.rounds; round++) {
        for (const item of block.items) {
          const ex = getExercise(item.exerciseId);
          const sec = itemWorkSec(item);
          for (const q of ex.qualities) qualitySec[q] = (qualitySec[q] ?? 0) + sec;
          if (ex.pattern === 'mobility') mobilitySec += sec;
        }
      }
    }
  }

  const conditioningSessions = recent.filter(
    (s) => s.workout.archetype === 'conditioning' || s.workout.archetype === 'hybride-boxe',
  );
  return { sessions: recent, qualitySec, mobilitySec, conditioningSessions };
}

function bestOf(performances: readonly Performance[], exerciseId: string): number | null {
  const p = performances.find((x) => String(x.exerciseId) === exerciseId);
  return p ? p.best : null;
}

export function computeScore(
  profile: UserProfile | null,
  progression: ProgressionState,
  performances: readonly Performance[],
  sessions: readonly WorkoutSession[],
  today: DateKey,
): AthleteScore {
  const win = buildWindow(sessions, today);
  const completed = sessions.filter((s) => s.status === 'terminee').length;
  const target = Math.max(2, profile?.weeklyFrequency ?? 4) * 4; // sessions per window
  const components: ScoreComponent[] = [];

  /* ------------------------------------------------------------------ force */
  {
    const ids = ['poussee', 'poussee-verticale', 'tirage', 'squat', 'charniere'];
    const values = ids.map((id) => normaliseChain(progression, id)).filter((v): v is number => v != null);
    const value = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) : null;
    components.push({
      key: 'force',
      label: SCORE_LABELS.force,
      value,
      explanation:
        'Position moyenne sur les cinq échelles de force (poussée, poussée verticale, tirage, squat, charnière). 100 = dernière marche de chaque échelle.',
      inputs: ids.map((id) => ({ label: chainTitle(id), value: stepName(progression, id) })),
      confidence: confidenceFrom(completed),
    });
  }

  /* -------------------------------------------------------------- puissance */
  {
    const ids = ['pliometrie', 'pliometrie-haut'];
    const values = ids.map((id) => normaliseChain(progression, id)).filter((v): v is number => v != null);
    const value = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) : null;
    components.push({
      key: 'puissance',
      label: SCORE_LABELS.puissance,
      value,
      explanation:
        'Position moyenne sur les deux échelles de pliométrie (basse et haute). 100 = sauts en longueur et pompes claquées.',
      inputs: ids.map((id) => ({ label: chainTitle(id), value: stepName(progression, id) })),
      confidence: confidenceFrom(completed),
    });
  }

  /* ----------------------------------------------------------- conditioning */
  {
    // Two measured signals: how much work was actually done in the window,
    // and whether comparable sessions are being reported as less difficult.
    const volume = clamp(win.sessions.length / target, 0, 1);
    const rpes = win.conditioningSessions
      .map((s) => s.feedback?.overall)
      .filter((r): r is 1 | 2 | 3 | 4 | 5 => r != null);
    const meanRpe = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
    // RPE 1 (brutal) → 0, RPE 5 (too easy) → 1.
    const ease = meanRpe != null ? clamp((meanRpe - 1) / 4, 0, 1) : null;

    const value =
      win.sessions.length === 0
        ? null
        : Math.round((ease != null ? volume * 0.6 + ease * 0.4 : volume) * 100);

    components.push({
      key: 'conditioning',
      label: SCORE_LABELS.conditioning,
      value,
      explanation:
        'Volume réellement réalisé sur 28 jours (60 %) et difficulté ressentie sur les séances de conditioning (40 %) : les mêmes séances vécues comme plus faciles, c’est du conditioning gagné.',
      inputs: [
        { label: 'Séances sur 28 jours', value: `${win.sessions.length} / ${target}` },
        {
          label: 'Difficulté ressentie (conditioning)',
          value: meanRpe != null ? `${meanRpe.toFixed(1)} / 5` : 'pas encore de retour',
        },
      ],
      confidence: confidenceFrom(win.sessions.length),
    });
  }

  /* ---------------------------------------------------------------- endurance */
  {
    const parts: { label: string; value: string; ratio: number }[] = [];
    const plank = bestOf(performances, 'gainage');
    if (plank != null) {
      parts.push({
        label: 'Record gainage',
        value: `${Math.round(plank)} s`,
        ratio: clamp(plank / BENCHMARKS.gainageSec, 0, 1),
      });
    }
    const pushups = bestOf(performances, 'pompes');
    if (pushups != null) {
      parts.push({
        label: 'Record pompes',
        value: `${Math.round(pushups)} reps`,
        ratio: clamp(pushups / BENCHMARKS.pompesReps, 0, 1),
      });
    }
    const squats = bestOf(performances, 'squat');
    if (squats != null) {
      parts.push({
        label: 'Record squats',
        value: `${Math.round(squats)} reps`,
        ratio: clamp(squats / BENCHMARKS.squatReps, 0, 1),
      });
    }
    const value =
      parts.length > 0
        ? Math.round((parts.reduce((s, p) => s + p.ratio, 0) / parts.length) * 100)
        : null;
    components.push({
      key: 'endurance',
      label: SCORE_LABELS.endurance,
      value,
      explanation: `Tes records comparés à des repères d’amateur bien préparé : ${BENCHMARKS.gainageSec} s de gainage, ${BENCHMARKS.pompesReps} pompes, ${BENCHMARKS.squatReps} squats.`,
      inputs:
        parts.length > 0
          ? parts.map((p) => ({ label: p.label, value: p.value }))
          : [{ label: 'Records', value: 'aucun enregistré pour le moment' }],
      confidence: confidenceFrom(parts.length * 4),
    });
  }

  /* -------------------------------------------------------------------- core */
  {
    const chain = normaliseChain(progression, 'gainage');
    const plank = bestOf(performances, 'gainage');
    const record = plank != null ? clamp(plank / BENCHMARKS.gainageSec, 0, 1) : null;
    const value =
      chain == null && record == null
        ? null
        : Math.round(
            ((chain ?? record ?? 0) * (record == null ? 1 : 0.5) +
              (record ?? 0) * (chain == null ? 1 : 0.5)) *
              100,
          );
    components.push({
      key: 'core',
      label: SCORE_LABELS.core,
      value,
      explanation:
        'Moitié échelle de gainage atteinte, moitié record de gainage ventral comparé au repère de 120 s.',
      inputs: [
        { label: 'Échelle de gainage', value: stepName(progression, 'gainage') },
        { label: 'Record gainage', value: plank != null ? `${Math.round(plank)} s` : '—' },
      ],
      confidence: confidenceFrom(completed),
    });
  }

  /* ----------------------------------------------------------------- vitesse */
  {
    const sec = win.qualitySec['vitesse'] ?? 0;
    const value = win.sessions.length === 0 ? null : Math.round(clamp(sec / BENCHMARKS.vitesse28j, 0, 1) * 100);
    components.push({
      key: 'vitesse',
      label: SCORE_LABELS.vitesse,
      value,
      explanation:
        'Cette application ne peut pas mesurer ta vitesse réelle : elle mesure ton exposition au travail de vitesse (frappes rapides, pliométrie) sur 28 jours, rapportée à un repère de 15 minutes.',
      inputs: [
        {
          label: 'Travail de vitesse sur 28 jours',
          value: `${Math.round(sec / 60)} min / ${Math.round(BENCHMARKS.vitesse28j / 60)} min`,
        },
      ],
      confidence: confidenceFrom(win.sessions.length),
    });
  }

  /* ---------------------------------------------------------------- mobilité */
  {
    const value =
      win.sessions.length === 0
        ? null
        : Math.round(clamp(win.mobilitySec / BENCHMARKS.mobilite28j, 0, 1) * 100);
    components.push({
      key: 'mobilite',
      label: SCORE_LABELS.mobilite,
      value,
      explanation:
        'Volume de mobilité réellement réalisé sur 28 jours, rapporté à un repère de 25 minutes. C’est une mesure d’entretien, pas une mesure d’amplitude articulaire.',
      inputs: [
        {
          label: 'Mobilité sur 28 jours',
          value: `${Math.round(win.mobilitySec / 60)} min / ${Math.round(BENCHMARKS.mobilite28j / 60)} min`,
        },
      ],
      confidence: confidenceFrom(win.sessions.length),
    });
  }

  const scored = components.filter((c) => c.value != null);
  const totalWeight = scored.reduce((s, c) => s + WEIGHTS[c.key], 0);
  const overall =
    scored.length === 0 || totalWeight === 0
      ? null
      : Math.round(scored.reduce((s, c) => s + (c.value ?? 0) * WEIGHTS[c.key], 0) / totalWeight);

  return { overall, components, basis: completed };
}

function chainTitle(id: string): string {
  const titles: Record<string, string> = {
    poussee: 'Poussée',
    'poussee-verticale': 'Poussée verticale',
    tirage: 'Tirage',
    squat: 'Squat',
    charniere: 'Charnière',
    fente: 'Fente',
    gainage: 'Gainage',
    pliometrie: 'Pliométrie basse',
    'pliometrie-haut': 'Pliométrie haute',
    burpee: 'Burpee',
  };
  return titles[id] ?? id;
}

/** All chains with their current step, for the progression screen. */
export function chainSnapshot(progression: ProgressionState) {
  return CHAIN_IDS.map((id) => ({
    id,
    title: chainTitle(id),
    rank: rankOf(progression, id),
    length: chainLength(id),
    current: exerciseAtRank(id, rankOf(progression, id)),
    next: exerciseAtRank(id, rankOf(progression, id) + 1),
    credit: progression.chains[id]?.credit ?? 0,
  }));
}
