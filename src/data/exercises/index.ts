import type { Exercise, ProgressionChain } from '@/domain/model/exercise';
import type { ExerciseId, ChainId } from '@/domain/model/ids';
import { chainId } from '@/domain/model/ids';
import type { Pattern } from '@/domain/model/taxonomy';

import { PUSH_EXERCISES } from './push';
import { PULL_EXERCISES } from './pull';
import { LEG_EXERCISES } from './legs';
import { CORE_EXERCISES } from './core';
import { CONDITIONING_EXERCISES } from './conditioning';
import { BOXING_EXERCISES } from './boxing';
import { MOBILITY_EXERCISES } from './mobility';

export const EXERCISES: readonly Exercise[] = [
  ...PUSH_EXERCISES,
  ...PULL_EXERCISES,
  ...LEG_EXERCISES,
  ...CORE_EXERCISES,
  ...CONDITIONING_EXERCISES,
  ...BOXING_EXERCISES,
  ...MOBILITY_EXERCISES,
];

const byId = new Map<string, Exercise>();
for (const e of EXERCISES) {
  if (byId.has(e.id)) throw new Error(`Identifiant d'exercice dupliqué : ${e.id}`);
  byId.set(e.id, e);
}

/** Look up an exercise, or `undefined` if the id is unknown (e.g. stale data). */
export const findExercise = (id: ExerciseId | string): Exercise | undefined => byId.get(id);

/** Look up an exercise, throwing when it must exist (engine-internal calls). */
export function getExercise(id: ExerciseId | string): Exercise {
  const e = byId.get(id);
  if (!e) throw new Error(`Exercice inconnu : ${id}`);
  return e;
}

const CHAIN_NAMES: Record<string, { name: string; pattern: Pattern }> = {
  poussee: { name: 'Poussée horizontale', pattern: 'push-horizontal' },
  'poussee-verticale': { name: 'Poussée verticale', pattern: 'push-vertical' },
  tirage: { name: 'Tirage', pattern: 'pull' },
  squat: { name: 'Squat', pattern: 'squat' },
  fente: { name: 'Fente', pattern: 'lunge' },
  charniere: { name: 'Charnière de hanche', pattern: 'hinge' },
  gainage: { name: 'Gainage', pattern: 'core-anti-extension' },
  pliometrie: { name: 'Pliométrie basse', pattern: 'plyo-lower' },
  'pliometrie-haut': { name: 'Pliométrie haute', pattern: 'plyo-upper' },
  burpee: { name: 'Burpee', pattern: 'locomotion' },
};

/** Progression chains, assembled from the `chain`/`rank` fields and sorted. */
export const CHAINS: readonly ProgressionChain[] = Object.entries(CHAIN_NAMES).map(
  ([id, meta]) => {
    const steps = EXERCISES.filter((e) => e.chain === id)
      .slice()
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));

    const ranks = steps.map((s) => s.rank ?? 0);
    const expected = ranks.map((_, i) => i + 1);
    if (ranks.join(',') !== expected.join(',')) {
      throw new Error(
        `Chaîne « ${id} » : les rangs doivent être 1..${steps.length}, reçu ${ranks.join(',')}`,
      );
    }
    return {
      id: chainId(id),
      name: meta.name,
      pattern: meta.pattern,
      steps: steps.map((s) => s.id),
    };
  },
);

const chainById = new Map<string, ProgressionChain>(CHAINS.map((c) => [c.id, c]));

export const getChain = (id: ChainId | string): ProgressionChain | undefined => chainById.get(id);

/** All chain ids, used to seed and iterate progression state. */
export const CHAIN_IDS: readonly ChainId[] = CHAINS.map((c) => c.id);

/** Exercise at `rank` (1-indexed) in a chain, clamped to the chain's bounds. */
export function exerciseAtRank(id: ChainId | string, rank: number): Exercise | undefined {
  const chain = chainById.get(id);
  if (!chain || chain.steps.length === 0) return undefined;
  const i = Math.min(Math.max(Math.round(rank), 1), chain.steps.length) - 1;
  return byId.get(chain.steps[i]!);
}

export const chainLength = (id: ChainId | string): number => chainById.get(id)?.steps.length ?? 0;
