import type { Archetype, Performance, SessionFeedback, WorkoutSession } from '@/domain/model/workout';
import type { TimerPreset } from '@/domain/model/boxing';
import type { DateKey, SessionId } from '@/domain/model/ids';
import type {
  AppSettings,
  Assessment,
  ProgressionState,
  RecoveryState,
  UserProfile,
} from '@/domain/model/user';
import type { TimerPersisted } from '@/engines/timer/engine';

/** Bump whenever the persisted shape changes, and add a migration below. */
export const SCHEMA_VERSION = 2;

/**
 * Lightweight record of a past session, held in the core document so the
 * calendar, the streak and the statistics render without decrypting hundreds
 * of full sessions.
 */
export interface SessionSummary {
  readonly id: SessionId;
  readonly date: DateKey;
  readonly archetype: Archetype;
  readonly title: string;
  readonly kind: 'principal' | 'extension';
  readonly plannedSec: number;
  readonly elapsedSec: number;
  readonly status: WorkoutSession['status'];
  readonly rpe?: SessionFeedback['overall'];
  readonly extensionOf?: SessionId;
}

/** The single document holding everything except full session detail. */
export interface CoreDoc {
  readonly schemaVersion: number;
  readonly profile: UserProfile | null;
  readonly assessment: Assessment | null;
  readonly progression: ProgressionState;
  readonly recovery: RecoveryState;
  readonly settings: AppSettings;
  readonly performances: readonly Performance[];
  readonly customPresets: readonly TimerPreset[];
  readonly sessions: readonly SessionSummary[];
  readonly achievements: Readonly<Record<string, DateKey>>;
  readonly onboardedAt?: number;
  readonly lastOpenedAt?: number;
}

/** A session in flight, saved continuously so nothing is ever lost. */
export interface ActiveDoc {
  readonly session: WorkoutSession;
  readonly timer: TimerPersisted;
  readonly savedAt: number;
}

export const CORE_KEY = 'core';
export const ACTIVE_KEY = 'active';
export const sessionKey = (id: SessionId | string) => `session:${id}`;

export const summarise = (s: WorkoutSession): SessionSummary => ({
  id: s.id,
  date: s.date,
  archetype: s.workout.archetype,
  title: s.workout.title,
  kind: s.workout.kind,
  plannedSec: s.workout.durationSec,
  elapsedSec: s.elapsedSec,
  status: s.status,
  ...(s.feedback ? { rpe: s.feedback.overall } : {}),
  ...(s.extensionOf ? { extensionOf: s.extensionOf } : {}),
});

/**
 * Bring a stored document up to the current schema.
 * Unknown future versions are left untouched and reported, rather than being
 * silently mangled by an older build of the app.
 */
export function migrateCore(doc: CoreDoc): { doc: CoreDoc; migrated: boolean; ahead: boolean } {
  if (doc.schemaVersion > SCHEMA_VERSION) return { doc, migrated: false, ahead: true };
  if (doc.schemaVersion === SCHEMA_VERSION) return { doc, migrated: false, ahead: false };

  let current = doc;

  // 1 → 2 : le booléen `reduceMotion`, jamais lu par l'application, devient un
  // réglage à trois états qui permet de forcer ou d'interdire les animations
  // indépendamment de la préférence système.
  if (current.schemaVersion < 2) {
    const legacy = current.settings as { reduceMotion?: boolean };
    const { reduceMotion, ...settings } = current.settings as AppSettings & {
      reduceMotion?: boolean;
    };
    void reduceMotion;
    current = {
      ...current,
      schemaVersion: 2,
      settings: {
        ...settings,
        animations: legacy.reduceMotion === true ? 'jamais' : 'systeme',
      },
    };
  }

  return { doc: { ...current, schemaVersion: SCHEMA_VERSION }, migrated: true, ahead: false };
}
