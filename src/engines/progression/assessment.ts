import { CHAIN_IDS, chainLength } from '@/data/exercises';
import type { DateKey, ExerciseId } from '@/domain/model/ids';
import { exerciseId } from '@/domain/model/ids';
import type { Assessment, AssessmentEntry, ProgressionState } from '@/domain/model/user';
import { clamp } from '@/lib/rng';

/**
 * Initial assessment (cahier des charges §12).
 *
 * Six short tests that map directly onto the progression chains, so the first
 * generated session already sits at the right level instead of guessing from a
 * self-declared label. Every number shown to the athlete afterwards traces back
 * to one of these measured values — there is no decorative score.
 */

export interface AssessmentTest {
  readonly id: string;
  readonly exerciseId: ExerciseId;
  readonly title: string;
  readonly instruction: string;
  readonly measure: 'reps' | 'temps';
  /** Seconds allowed, for timed-cap tests. 0 = go until form breaks. */
  readonly capSec: number;
  /** Chain this test calibrates, and the thresholds for each rank. */
  readonly chain: string;
  /** thresholds[i] = minimum value to reach rank i+2 (rank 1 needs nothing). */
  readonly thresholds: readonly number[];
  readonly unitLabel: string;
}

export const ASSESSMENT_TESTS: readonly AssessmentTest[] = [
  {
    id: 'pompes',
    exerciseId: exerciseId('pompes'),
    title: 'Pompes',
    instruction:
      'Fais le maximum de pompes complètes, sans pause, en gardant le corps aligné. Arrête-toi dès que la forme se dégrade.',
    measure: 'reps',
    capSec: 0,
    chain: 'poussee',
    thresholds: [1, 5, 12, 20, 30, 40, 50],
    unitLabel: 'répétitions',
  },
  {
    id: 'squats',
    exerciseId: exerciseId('squat'),
    title: 'Squats en 60 secondes',
    instruction:
      'Un maximum de squats en 60 secondes, cuisses au moins parallèles au sol à chaque répétition.',
    measure: 'reps',
    capSec: 60,
    chain: 'squat',
    thresholds: [15, 28, 40, 52],
    unitLabel: 'répétitions',
  },
  {
    id: 'gainage',
    exerciseId: exerciseId('gainage'),
    title: 'Gainage ventral',
    instruction:
      'Tiens la planche sur les avant-bras le plus longtemps possible. Arrête dès que le bassin tombe.',
    measure: 'temps',
    capSec: 240,
    chain: 'gainage',
    thresholds: [25, 50, 80, 120],
    unitLabel: 'secondes',
  },
  {
    id: 'burpees',
    exerciseId: exerciseId('burpees'),
    title: 'Burpees en 60 secondes',
    instruction: 'Un maximum de burpees en 60 secondes, à un rythme que tu peux tenir.',
    measure: 'reps',
    capSec: 60,
    chain: 'burpee',
    thresholds: [8, 14, 20],
    unitLabel: 'répétitions',
  },
  {
    id: 'fentes',
    exerciseId: exerciseId('fentes'),
    title: 'Fentes alternées',
    instruction: 'Un maximum de fentes alternées contrôlées, sans perdre l’équilibre.',
    measure: 'reps',
    capSec: 0,
    chain: 'fente',
    thresholds: [10, 20, 32, 44],
    unitLabel: 'répétitions',
  },
  {
    id: 'montees-genoux',
    exerciseId: exerciseId('montees-genoux'),
    title: 'Montées de genoux — 45 secondes',
    instruction:
      'Genoux à hauteur de bassin pendant 45 secondes. Note le nombre d’appuis de la jambe droite.',
    measure: 'reps',
    capSec: 45,
    chain: 'pliometrie',
    thresholds: [35, 55, 75],
    unitLabel: 'appuis',
  },
];

/** Rank a single result against its thresholds. */
export function rankFromTest(test: AssessmentTest, value: number): number {
  let rank = 1;
  for (const threshold of test.thresholds) {
    if (value >= threshold) rank += 1;
    else break;
  }
  return clamp(rank, 1, Math.max(1, chainLength(test.chain)));
}

/**
 * Build progression state from assessment results.
 * Chains with no direct test inherit the mean of the measured ones, so the
 * athlete never starts a pull or hinge at an absurd level.
 */
export function progressionFromAssessment(entries: readonly AssessmentEntry[]): ProgressionState {
  const byExercise = new Map(entries.map((e) => [String(e.exerciseId), e.value]));
  const measured: Record<string, number> = {};
  const normalised: number[] = [];

  for (const test of ASSESSMENT_TESTS) {
    const value = byExercise.get(String(test.exerciseId));
    if (value == null) continue;
    const rank = rankFromTest(test, value);
    measured[test.chain] = rank;
    const max = Math.max(2, chainLength(test.chain));
    normalised.push((rank - 1) / (max - 1));
  }

  const meanNorm =
    normalised.length > 0 ? normalised.reduce((a, b) => a + b, 0) / normalised.length : 0.25;

  const chains: Record<string, { rank: number; credit: number }> = {};
  for (const id of CHAIN_IDS) {
    const max = Math.max(1, chainLength(id));
    const rank = measured[id] ?? clamp(Math.round(1 + meanNorm * (max - 1)), 1, max);
    chains[id] = { rank, credit: 0 };
  }
  return { chains, rampSessions: 99, calibration: 1 };
}

export function buildAssessment(at: DateKey, entries: readonly AssessmentEntry[]): Assessment {
  const state = progressionFromAssessment(entries);
  const chainLevels: Record<string, number> = {};
  for (const [id, v] of Object.entries(state.chains)) chainLevels[id] = v.rank;
  return { at, entries, chainLevels };
}

/**
 * A 0–100 figure for one test, expressed as progress through its own ladder.
 * Always displayed next to the raw measured value so it is never a black box.
 */
export function testScore(test: AssessmentTest, value: number): number {
  const top = test.thresholds[test.thresholds.length - 1] ?? 1;
  return Math.round(clamp(value / top, 0, 1) * 100);
}
