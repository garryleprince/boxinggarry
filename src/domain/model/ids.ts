/**
 * Branded identifier types.
 *
 * These are compile-time-only brands: at runtime every id is a plain string.
 * They exist so that an `ExerciseId` can never be silently passed where a
 * `SessionId` is expected, which is easy to do once the engines start passing
 * ids around between modules.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type ExerciseId = Brand<string, 'ExerciseId'>;
export type ChainId = Brand<string, 'ChainId'>;
export type WorkoutId = Brand<string, 'WorkoutId'>;
export type SessionId = Brand<string, 'SessionId'>;
export type AchievementId = Brand<string, 'AchievementId'>;
export type PresetId = Brand<string, 'PresetId'>;

export const exerciseId = (v: string) => v as ExerciseId;
export const chainId = (v: string) => v as ChainId;
export const workoutId = (v: string) => v as WorkoutId;
export const sessionId = (v: string) => v as SessionId;
export const achievementId = (v: string) => v as AchievementId;
export const presetId = (v: string) => v as PresetId;

/** Calendar day in local time, `YYYY-MM-DD`. Never a timestamp. */
export type DateKey = Brand<string, 'DateKey'>;

export function dateKey(d: Date): DateKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` as DateKey;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Whole days between two calendar days, ignoring time of day and DST. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  a.setHours(12, 0, 0, 0);
  b.setHours(12, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(key: DateKey): number {
  const wd = parseDateKey(key).getDay();
  return wd === 0 ? 7 : wd;
}

/** The Monday of the week containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -(isoWeekday(key) - 1));
}
