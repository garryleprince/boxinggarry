import type { Exercise, ExerciseCoaching } from '@/domain/model/exercise';
import { exerciseId, chainId } from '@/domain/model/ids';
import type {
  Equipment,
  Impact,
  Measure,
  MuscleGroup,
  Pattern,
  Quality,
  SpaceNeed,
} from '@/domain/model/taxonomy';
import type { PoseKey } from '@/data/poses';

/**
 * Authoring shape for an exercise. Everything with a sensible default is
 * optional so that each entry reads as the handful of facts that make it
 * different from its neighbours.
 */
export interface ExerciseDef {
  id: string;
  name: string;
  shortName?: string;
  description: string;
  level: 1 | 2 | 3 | 4 | 5;
  pattern: Pattern;
  primary: MuscleGroup[];
  secondary?: MuscleGroup[];
  qualities: Quality[];
  intensity: 1 | 2 | 3 | 4 | 5;
  impact?: Impact;
  equipment?: Equipment[];
  space?: SpaceNeed;
  unilateral?: boolean;
  skill?: 1 | 2 | 3 | 4 | 5;
  stretch?: 'dynamique' | 'statique';
  measure: Measure;
  baseDose: number;
  secondsPerRep?: number;
  chain?: string;
  rank?: number;
  poses: PoseKey[];
  cues: string[];
  mistakes: string[];
  breathing: string;
  boxing?: string;
}

export function defineExercise(d: ExerciseDef): Exercise {
  const coaching: ExerciseCoaching = {
    cues: d.cues,
    mistakes: d.mistakes,
    breathing: d.breathing,
    ...(d.boxing ? { boxing: d.boxing } : {}),
  };
  return {
    id: exerciseId(d.id),
    name: d.name,
    ...(d.shortName ? { shortName: d.shortName } : {}),
    description: d.description,
    level: d.level,
    pattern: d.pattern,
    primary: d.primary,
    secondary: d.secondary ?? [],
    qualities: d.qualities,
    intensity: d.intensity,
    impact: d.impact ?? 'faible',
    equipment: d.equipment ?? ['aucun'],
    space: d.space ?? 'tapis',
    unilateral: d.unilateral ?? false,
    skill: d.skill ?? 2,
    ...(d.stretch ? { stretch: d.stretch } : {}),
    measure: d.measure,
    baseDose: d.baseDose,
    secondsPerRep: d.secondsPerRep ?? (d.measure === 'temps' ? 1 : 3),
    ...(d.chain ? { chain: chainId(d.chain), rank: d.rank ?? 1 } : {}),
    coaching,
    poses: d.poses,
  };
}

export const defineAll = (defs: ExerciseDef[]): Exercise[] => defs.map(defineExercise);
