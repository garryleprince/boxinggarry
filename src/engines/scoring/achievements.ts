import type { AchievementId, DateKey } from '@/domain/model/ids';
import { achievementId, daysBetween } from '@/domain/model/ids';
import type { Achievement } from '@/domain/model/user';
import type { Performance, WorkoutSession } from '@/domain/model/workout';

/**
 * Milestones (cahier des charges §38).
 *
 * Sober and adult: counts of work actually done and records actually set.
 * Nothing here nags, and nothing is lost by ignoring it entirely.
 */

export interface Streak {
  readonly current: number;
  readonly best: number;
  /** Days since the last completed session; 0 when one was done today. */
  readonly sinceLast: number | null;
}

/**
 * Training streak in consecutive *days with a session*.
 * Rest days do not break it as long as the gap stays within two days — a
 * programme with four sessions a week should not punish its own rest days.
 */
export function computeStreak(sessions: readonly WorkoutSession[], today: DateKey): Streak {
  const dates = [
    ...new Set(sessions.filter((s) => s.status === 'terminee').map((s) => s.date)),
  ].sort();
  if (dates.length === 0) return { current: 0, best: 0, sinceLast: null };

  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const gap = daysBetween(dates[i - 1]!, dates[i]!);
    if (gap <= 2) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }

  const last = dates[dates.length - 1]!;
  const sinceLast = daysBetween(last, today);
  // A streak stays alive while the gap is within the programme's rest window.
  const current = sinceLast <= 2 ? run : 0;
  return { current, best, sinceLast };
}

export interface Totals {
  readonly sessions: number;
  readonly mainSessions: number;
  readonly extensions: number;
  readonly totalSec: number;
  readonly mainSec: number;
  readonly extensionSec: number;
  readonly reps: Record<string, number>;
}

export function computeTotals(sessions: readonly WorkoutSession[]): Totals {
  const done = sessions.filter((s) => s.status === 'terminee');
  const reps: Record<string, number> = {};
  for (const s of done) {
    for (const p of s.performed) {
      if (p.measure !== 'reps' || p.skipped) continue;
      const id = String(p.substitutedFor ?? p.exerciseId);
      reps[id] = (reps[id] ?? 0) + p.achieved;
    }
  }
  const extensions = done.filter((s) => s.extensionOf);
  const mains = done.filter((s) => !s.extensionOf);
  return {
    sessions: done.length,
    mainSessions: mains.length,
    extensions: extensions.length,
    totalSec: done.reduce((s, x) => s + x.elapsedSec, 0),
    mainSec: mains.reduce((s, x) => s + x.elapsedSec, 0),
    extensionSec: extensions.reduce((s, x) => s + x.elapsedSec, 0),
    reps,
  };
}

interface Definition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly target: number;
  readonly progress: (ctx: { totals: Totals; streak: Streak; records: number }) => number;
}

const DEFINITIONS: readonly Definition[] = [
  {
    id: 'seances-10',
    label: '10 séances',
    description: 'Dix séances terminées. La régularité commence ici.',
    target: 10,
    progress: (c) => c.totals.sessions,
  },
  {
    id: 'seances-50',
    label: '50 séances',
    description: 'Cinquante séances au compteur.',
    target: 50,
    progress: (c) => c.totals.sessions,
  },
  {
    id: 'seances-100',
    label: '100 séances',
    description: 'Cent séances. Ce n’est plus une habitude, c’est une pratique.',
    target: 100,
    progress: (c) => c.totals.sessions,
  },
  {
    id: 'streak-7',
    label: '7 jours d’affilée',
    description: 'Une semaine complète sans casser le rythme.',
    target: 7,
    progress: (c) => c.streak.best,
  },
  {
    id: 'streak-30',
    label: '30 jours d’affilée',
    description: 'Un mois de régularité ininterrompue.',
    target: 30,
    progress: (c) => c.streak.best,
  },
  {
    id: 'burpees-100',
    label: '100 burpees',
    description: 'Cent burpees cumulés, toutes variantes confondues.',
    target: 100,
    progress: (c) =>
      ['burpees', 'burpees-sans-saut', 'burpee-marche', 'burpee-pompe'].reduce(
        (s, id) => s + (c.totals.reps[id] ?? 0),
        0,
      ),
  },
  {
    id: 'pompes-500',
    label: '500 pompes',
    description: 'Cinq cents pompes cumulées, toutes variantes confondues.',
    target: 500,
    progress: (c) =>
      Object.entries(c.totals.reps)
        .filter(([id]) => id.startsWith('pompes'))
        .reduce((s, [, v]) => s + v, 0),
  },
  {
    id: 'squats-1000',
    label: '1 000 squats',
    description: 'Mille squats cumulés, toutes variantes confondues.',
    target: 1000,
    progress: (c) =>
      Object.entries(c.totals.reps)
        .filter(([id]) => id.includes('squat') || id.includes('fente'))
        .reduce((s, [, v]) => s + v, 0),
  },
  {
    id: 'temps-10h',
    label: '10 heures d’entraînement',
    description: 'Dix heures cumulées, en séances de vingt minutes.',
    target: 36_000,
    progress: (c) => c.totals.totalSec,
  },
  {
    id: 'extensions-10',
    label: '10 × +10 min',
    description: 'Dix extensions faites en plus du programme.',
    target: 10,
    progress: (c) => c.totals.extensions,
  },
  {
    id: 'records-10',
    label: '10 records',
    description: 'Dix records personnels établis.',
    target: 10,
    progress: (c) => c.records,
  },
];

/**
 * Evaluate every milestone. `unlocked` carries the dates already recorded, so
 * an achievement keeps the day it was first reached.
 */
export function evaluateAchievements(
  sessions: readonly WorkoutSession[],
  performances: readonly Performance[],
  unlocked: Readonly<Record<string, DateKey>>,
  today: DateKey,
): Achievement[] {
  const ctx = {
    totals: computeTotals(sessions),
    streak: computeStreak(sessions, today),
    records: performances.length,
  };

  return DEFINITIONS.map((def) => {
    const progress = Math.max(0, Math.round(def.progress(ctx)));
    const already = unlocked[def.id];
    const reached = progress >= def.target;
    return {
      id: achievementId(def.id) as AchievementId,
      label: def.label,
      description: def.description,
      progress: Math.min(progress, def.target),
      target: def.target,
      ...(already ? { unlockedAt: already } : reached ? { unlockedAt: today } : {}),
    };
  });
}

/** Ids newly reached in this evaluation, for the end-of-session screen. */
export function newlyUnlocked(
  achievements: readonly Achievement[],
  previous: Readonly<Record<string, DateKey>>,
): Achievement[] {
  return achievements.filter((a) => a.unlockedAt != null && !previous[a.id]);
}
