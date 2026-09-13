import type { DateKey } from '@/domain/model/ids';
import { addDays, dateKey, daysBetween, isoWeekday, startOfWeek } from '@/domain/model/ids';
import type { Goal, UserProfile } from '@/domain/model/user';
import type { Archetype, TrainingDay, WorkoutSession } from '@/domain/model/workout';
import { ARCHETYPE_META, ARCHETYPES } from '@/domain/model/workout';
import { hashString, createRng } from '@/lib/rng';
import { TEMPLATES } from './templates';

/**
 * Weekly planning.
 *
 * Lays out a microcycle from the athlete's target frequency and goals, keeps
 * high-nervous-system days apart, and re-prioritises when a session is missed
 * rather than marching through a fixed calendar (cahier des charges §13, §39).
 */

/** Which weekdays are training days, by weekly frequency. ISO: 1 = Monday. */
const FREQUENCY_DAYS: Record<number, readonly number[]> = {
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

/** Archetypes offered in the rotation. `recovery` is placed separately. */
const ROTATION: readonly Archetype[] = ARCHETYPES.filter((a) => a !== 'recovery');

/** How well each archetype serves each goal, 0…1. */
const GOAL_ARCHETYPE_FIT: Record<Goal, Partial<Record<Archetype, number>>> = {
  cardio: { conditioning: 1, 'hybride-boxe': 0.9, 'full-body-boxing': 0.6 },
  'endurance-boxe': { 'hybride-boxe': 1, conditioning: 0.9, 'full-body-boxing': 0.7 },
  explosivite: { explosivite: 1, 'full-body-boxing': 0.6 },
  force: { force: 1, 'full-body-boxing': 0.6 },
  'endurance-musculaire': { conditioning: 0.9, force: 0.6, 'full-body-boxing': 0.7 },
  'perte-de-gras': { conditioning: 1, 'hybride-boxe': 0.9, 'full-body-boxing': 0.7 },
  'masse-musculaire': { force: 1, 'full-body-boxing': 0.6 },
  jambes: { explosivite: 0.9, force: 0.8, 'full-body-boxing': 0.6 },
  core: { 'core-stabilite': 1, 'full-body-boxing': 0.5 },
  mobilite: { 'core-stabilite': 0.7 },
  'condition-generale': {
    'full-body-boxing': 1,
    conditioning: 0.7,
    force: 0.7,
    explosivite: 0.7,
    'core-stabilite': 0.7,
    'hybride-boxe': 0.7,
  },
};

/** Primary systemic cost of each archetype, used to keep hard days apart. */
const LOAD_AXIS: Record<Archetype, 'jambes' | 'haut' | 'systemique' | 'leger'> = {
  'full-body-boxing': 'systemique',
  explosivite: 'jambes',
  force: 'haut',
  conditioning: 'systemique',
  'core-stabilite': 'leger',
  'hybride-boxe': 'systemique',
  recovery: 'leger',
};

export function archetypeScores(goals: readonly Goal[]): Record<Archetype, number> {
  const out = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) out[a] = 0.25; // every archetype keeps a floor
  for (const g of goals) {
    for (const [a, w] of Object.entries(GOAL_ARCHETYPE_FIT[g] ?? {})) {
      out[a as Archetype] += w ?? 0;
    }
  }
  return out;
}

export const trainingWeekdays = (frequency: number): readonly number[] =>
  FREQUENCY_DAYS[Math.min(6, Math.max(2, Math.round(frequency)))] ?? FREQUENCY_DAYS[3]!;

/**
 * Ordered archetypes for one week.
 * Picks the best-fitting archetypes for the goals, then reorders so that two
 * consecutive sessions never load the same axis.
 */
export function weekArchetypes(profile: UserProfile, weekStart: DateKey): Archetype[] {
  const days = trainingWeekdays(profile.weeklyFrequency);
  const scores = archetypeScores(profile.goals);
  const rng = createRng(hashString(`${weekStart}|${profile.weeklyFrequency}|${profile.goals.join()}`));

  // Rank archetypes by goal fit, breaking ties with the week's own seed so the
  // programme does not calcify into the same week forever.
  const ranked = [...ROTATION].sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0) + (rng() - 0.5) * 0.2,
  );

  const plan: Archetype[] = [];
  let cursor = 0;
  for (let i = 0; i < days.length; i++) {
    let pick: Archetype | undefined;
    // Walk the ranked list until we find one that does not repeat the previous
    // day's load axis and was not used earlier this week.
    for (let attempt = 0; attempt < ranked.length * 2; attempt++) {
      const candidate = ranked[(cursor + attempt) % ranked.length]!;
      const clashesAxis = plan.length > 0 && LOAD_AXIS[candidate] === LOAD_AXIS[plan[plan.length - 1]!];
      const alreadyUsed = plan.includes(candidate);
      if (!clashesAxis && !alreadyUsed) {
        pick = candidate;
        cursor = (cursor + attempt + 1) % ranked.length;
        break;
      }
    }
    // With five or six sessions a week, repeats are unavoidable — allow the
    // best remaining option rather than leaving a hole.
    if (!pick) {
      pick =
        ranked.find(
          (c) => plan.length === 0 || LOAD_AXIS[c] !== LOAD_AXIS[plan[plan.length - 1]!],
        ) ?? ranked[0]!;
    }
    plan.push(pick);
  }
  return plan;
}

export interface PlannedWeek {
  readonly weekStart: DateKey;
  readonly days: readonly TrainingDay[];
}

/** Build one week of the calendar, merged with what actually happened. */
export function planWeek(
  profile: UserProfile,
  weekStart: DateKey,
  today: DateKey,
  sessions: readonly WorkoutSession[],
): PlannedWeek {
  const weekdays = trainingWeekdays(profile.weeklyFrequency);
  const archetypes = weekArchetypes(profile, weekStart);

  // Place one recovery day on the first non-training day following a session.
  const restDays = [1, 2, 3, 4, 5, 6, 7].filter((d) => !weekdays.includes(d));
  const recoveryDay = restDays.find((d) => weekdays.includes(d - 1)) ?? restDays[0];

  const completed = new Map<string, WorkoutSession>();
  for (const s of sessions) {
    if (s.status === 'terminee' && !s.extensionOf) completed.set(s.date, s);
  }

  const days: TrainingDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const weekday = isoWeekday(date);
    const slot = weekdays.indexOf(weekday);
    const done = completed.get(date);

    let archetype: Archetype;
    let plannedMinutes: number;
    if (slot >= 0) {
      archetype = archetypes[slot] ?? 'full-body-boxing';
      plannedMinutes = Math.round(TEMPLATES[archetype].budgetSec / 60);
    } else if (weekday === recoveryDay) {
      archetype = 'recovery';
      plannedMinutes = Math.round(TEMPLATES.recovery.budgetSec / 60);
    } else {
      archetype = 'recovery';
      plannedMinutes = 0;
    }

    const isRestDay = slot < 0 && weekday !== recoveryDay;
    const delta = daysBetween(today, date);

    let status: TrainingDay['status'];
    if (done) status = 'faite';
    else if (isRestDay) status = 'repos';
    else if (delta === 0) status = 'aujourdhui';
    else if (delta < 0) status = slot >= 0 ? 'manquee' : 'repos';
    else status = 'a-venir';

    days.push({
      date,
      archetype: done ? done.workout.archetype : archetype,
      plannedMinutes: done ? Math.round(done.elapsedSec / 60) : plannedMinutes,
      status,
      ...(done ? { sessionId: done.id } : {}),
    });
  }

  return { weekStart, days };
}

export interface TodayPlan {
  readonly date: DateKey;
  readonly archetype: Archetype;
  readonly isRestDay: boolean;
  readonly isRecoveryDay: boolean;
  /** Set when the plan was changed because sessions were missed this week. */
  readonly reshuffled: boolean;
  readonly note?: string;
}

/**
 * What to train today.
 *
 * If sessions were missed earlier in the week, the engine does not simply
 * carry on down the calendar: it promotes whichever planned archetype serves
 * the athlete's goals best among those not yet done. Nothing scolds the
 * athlete for the miss (cahier des charges §67).
 */
export function resolveToday(
  profile: UserProfile,
  today: DateKey,
  sessions: readonly WorkoutSession[],
): TodayPlan {
  const weekStart = startOfWeek(today);
  const week = planWeek(profile, weekStart, today, sessions);
  const todayEntry = week.days.find((d) => d.date === today);

  if (!todayEntry || todayEntry.status === 'repos') {
    return {
      date: today,
      archetype: 'recovery',
      isRestDay: true,
      isRecoveryDay: false,
      reshuffled: false,
      note: 'Jour de repos. Si tu veux bouger, une séance de récupération active de 15 minutes est disponible.',
    };
  }

  const scheduled = todayEntry.archetype;
  if (scheduled === 'recovery') {
    return {
      date: today,
      archetype: 'recovery',
      isRestDay: false,
      isRecoveryDay: true,
      reshuffled: false,
      note: 'Journée de récupération active : mobilité, respiration, rien de traumatisant.',
    };
  }

  // Which archetypes were planned earlier this week but never done?
  const doneThisWeek = new Set(
    week.days.filter((d) => d.status === 'faite').map((d) => d.archetype),
  );
  const missed = week.days
    .filter((d) => d.status === 'manquee')
    .map((d) => d.archetype)
    .filter((a) => !doneThisWeek.has(a) && a !== scheduled);

  if (missed.length > 0 && !doneThisWeek.has(scheduled)) {
    const scores = archetypeScores(profile.goals);
    const best = [...missed, scheduled].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0]!;
    if (best !== scheduled) {
      return {
        date: today,
        archetype: best,
        isRestDay: false,
        isRecoveryDay: false,
        reshuffled: true,
        note: `La semaine a été bousculée : on fait passer ${ARCHETYPE_META[best].label} en priorité, c’est ce qui sert le plus tes objectifs.`,
      };
    }
  }

  return {
    date: today,
    archetype: scheduled,
    isRestDay: false,
    isRecoveryDay: false,
    reshuffled: false,
  };
}

/** Next planned training day strictly after `today`. */
export function nextTrainingDay(
  profile: UserProfile,
  today: DateKey,
  sessions: readonly WorkoutSession[],
): TrainingDay | undefined {
  for (let offset = 1; offset <= 8; offset++) {
    const date = addDays(today, offset);
    const week = planWeek(profile, startOfWeek(date), today, sessions);
    const entry = week.days.find((d) => d.date === date);
    if (entry && entry.status !== 'repos') return entry;
  }
  return undefined;
}

/** Calendar month grid, Monday-first, for the calendar screen. */
export function monthGrid(month: Date): DateKey[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(dateKey(first));
  const out: DateKey[] = [];
  for (let i = 0; i < 42; i++) out.push(addDays(start, i));
  return out;
}
