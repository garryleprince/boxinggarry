import { exerciseId, dateKey } from '@/domain/model/ids';
import type { DateKey } from '@/domain/model/ids';
import type { ProgressionState, UserProfile } from '@/domain/model/user';
import { initialProgression } from '@/engines/progression';
import { emptyRecovery } from '@/engines/recovery';
import type { RecoveryState } from '@/domain/model/user';

export const TODAY = dateKey(new Date(2026, 8, 14)); // lundi 14 septembre 2026

export function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    createdAt: Date.now(),
    sportLevel: 'intermediaire',
    boxingLevel: 'loisir',
    lifting: 'occasionnelle',
    weeklyFrequency: 4,
    goals: ['condition-generale'],
    intensity: 'equilibree',
    space: 'piece',
    equipment: ['aucun'],
    mastered: [],
    difficult: [],
    excluded: [],
    avoidPatterns: [],
    ...over,
  };
}

export const beginner = () =>
  profile({ sportLevel: 'debutant', weeklyFrequency: 3, intensity: 'progressive' });

export const advanced = () =>
  profile({
    sportLevel: 'avance',
    weeklyFrequency: 6,
    intensity: 'exigeante',
    goals: ['explosivite', 'endurance-boxe'],
    equipment: ['aucun', 'barre-traction', 'chaise', 'corde-a-sauter'],
    space: 'large',
  });

export const progressionFor = (p: UserProfile): ProgressionState =>
  initialProgression(p.sportLevel);

export const freshRecovery = (at: DateKey = TODAY): RecoveryState => emptyRecovery(at);

export function tiredRecovery(at: DateKey = TODAY): RecoveryState {
  return {
    ...emptyRecovery(at),
    fatigue: { jambes: 0.85, 'haut-du-corps': 0.7, core: 0.6, cardio: 0.8 },
  };
}

export const EX = exerciseId;
