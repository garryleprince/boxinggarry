import { create } from 'zustand';
import { getExercise } from '@/data/exercises';
import type { TimerPreset } from '@/domain/model/boxing';
import type { DateKey, SessionId } from '@/domain/model/ids';
import { dateKey, sessionId } from '@/domain/model/ids';
import type { AppSettings, Assessment, UserProfile } from '@/domain/model/user';
import type {
  Archetype,
  PerformedItem,
  Performance,
  SessionFeedback,
  Workout,
  WorkoutSession,
} from '@/domain/model/workout';
import { applyLayoff, applySession } from '@/engines/progression';
import { progressionFromAssessment } from '@/engines/progression/assessment';
import { applyWorkout, decayTo, emptyRecovery } from '@/engines/recovery';
import { evaluateAchievements, newlyUnlocked } from '@/engines/scoring/achievements';
import { asSessionTemplate, chooseExtension, type ExtensionChoice } from '@/engines/training/extensions';
import { generateWorkout } from '@/engines/training/generator';
import { findReplacement } from '@/engines/training/selection';
import { computeDuration } from '@/engines/training/duration';
import { resolveToday, type TodayPlan } from '@/engines/training/plan';
import { createRng } from '@/lib/rng';
import type { TimerPersisted } from '@/engines/timer/engine';
import type { VaultKeys } from '@/storage/crypto';
import type { CoreDoc } from '@/storage/schema';
import { summarise } from '@/storage/schema';
import * as vault from '@/storage/vault';
import { forgetDevice, rememberDevice, restoreDevice } from '@/auth/session';

/**
 * Application store.
 *
 * The single place where the engines, the vault and the screens meet. Screens
 * read derived state and call actions; they never touch storage or run an
 * engine themselves.
 */

export type AppStatus =
  | 'chargement'
  | 'aucun-coffre'
  | 'verrouille'
  | 'onboarding'
  | 'evaluation'
  | 'pret';

export interface ActiveSession {
  readonly session: WorkoutSession;
  readonly timer: TimerPersisted | null;
}

export interface FinishOutcome {
  readonly records: readonly { exerciseId: string; name: string; value: number; measure: string }[];
  readonly achievements: readonly { id: string; label: string }[];
  readonly session: WorkoutSession;
}

interface State {
  status: AppStatus;
  keys: VaultKeys | null;
  core: CoreDoc;
  /** Recent full sessions, newest first — variety scoring and history need these. */
  recent: WorkoutSession[];
  active: ActiveSession | null;
  today: DateKey;
  plan: TodayPlan | null;
  workout: Workout | null;
  extension: ExtensionChoice | null;
  extensionWorkout: Workout | null;
  /** Manual difficulty nudge applied to today's session, −1 / 0 / +1. */
  adjust: -1 | 0 | 1;
  /** Bumped when the athlete asks for a different session for the same day. */
  variant: number;
  error: string | null;
  notice: string | null;
  storageWarning: string | null;
}

interface Actions {
  boot(): Promise<void>;
  createVault(passphrase: string, remember: boolean): Promise<void>;
  unlock(passphrase: string, remember: boolean): Promise<void>;
  lock(): Promise<void>;

  saveProfile(profile: UserProfile): Promise<void>;
  saveAssessment(assessment: Assessment): Promise<void>;
  skipAssessment(): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  saveCustomPreset(preset: TimerPreset): Promise<void>;
  deleteCustomPreset(id: string): Promise<void>;

  regenerate(): void;
  setAdjust(value: -1 | 0 | 1): void;
  shuffle(): void;
  replaceExercise(blockId: string, itemIndex: number, direction: 'equivalent' | 'plus-facile' | 'plus-dur'): void;
  chooseArchetype(archetype: Archetype): void;

  startSession(kind: 'principal' | 'extension'): Promise<WorkoutSession | null>;
  persistActive(session: WorkoutSession, timer: TimerPersisted | null): Promise<void>;
  finishSession(
    performed: readonly PerformedItem[],
    elapsedSec: number,
    feedback: SessionFeedback,
  ): Promise<FinishOutcome | null>;
  abandonSession(performed: readonly PerformedItem[], elapsedSec: number): Promise<void>;
  discardActive(): Promise<void>;
  loadSession(id: SessionId): Promise<WorkoutSession | null>;

  exportData(): Promise<string>;
  importData(json: string): Promise<void>;
  resetEverything(): Promise<void>;
  dismissNotice(): void;
  dismissError(): void;
}

export type AppStore = State & Actions;

const initialState: State = {
  status: 'chargement',
  keys: null,
  core: vault.emptyCore(),
  recent: [],
  active: null,
  today: dateKey(new Date()),
  plan: null,
  workout: null,
  extension: null,
  extensionWorkout: null,
  adjust: 0,
  variant: 0,
  error: null,
  notice: null,
  storageWarning: null,
};

/** How many full sessions to keep in memory for variety scoring and history. */
const RECENT_LIMIT = 12;
/** Points kept per exercise for the evolution chart. */
const PERFORMANCE_HISTORY_LIMIT = 40;

function statusFor(core: CoreDoc): AppStatus {
  if (!core.profile) return 'onboarding';
  if (!core.assessment && !core.onboardedAt) return 'evaluation';
  return 'pret';
}

export const useStore = create<AppStore>()((set, get) => {
  /** Recompute today's plan, session and +10 module from current state. */
  function derive(partial?: Partial<State>): Partial<State> {
    const s = { ...get(), ...partial };
    if (!s.core.profile) return { ...partial, plan: null, workout: null, extension: null, extensionWorkout: null };

    const plan = resolveToday(s.core.profile, s.today, s.recent);
    const workout = generateWorkout({
      profile: s.core.profile,
      progression: s.core.progression,
      recovery: s.core.recovery,
      history: s.recent,
      date: s.today,
      archetype: plan.archetype,
      adjust: s.adjust,
      variant: s.variant,
    });

    const extension = chooseExtension(plan.archetype, workout.intensity, s.core.recovery);
    const avoid = workout.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)));
    const extensionWorkout = generateWorkout({
      profile: s.core.profile,
      progression: s.core.progression,
      recovery: s.core.recovery,
      history: s.recent,
      date: s.today,
      archetype: plan.archetype,
      kind: 'extension',
      template: asSessionTemplate(extension.template, plan.archetype),
      variant: s.variant,
      avoid,
    });

    return { ...partial, plan, workout, extension, extensionWorkout };
  }

  async function persistCore(next: CoreDoc): Promise<void> {
    const keys = get().keys;
    if (!keys) return;
    try {
      await vault.writeCore(keys, next);
      if (get().storageWarning) set({ storageWarning: null });
    } catch {
      set({
        storageWarning:
          'Impossible d’écrire sur le stockage de cet appareil. Tes dernières modifications ne sont pas enregistrées — exporte tes données pour ne rien perdre.',
      });
    }
  }

  /** Load core + recent sessions + any session left in flight. */
  async function hydrate(keys: VaultKeys): Promise<void> {
    const { core, schemaAhead, recovered } = await vault.readCore(keys);
    const today = dateKey(new Date());

    const recentIds = [...core.sessions]
      .filter((s) => s.status === 'terminee')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, RECENT_LIMIT)
      .map((s) => s.id);
    const recent = await vault.readSessions(keys, recentIds);
    recent.sort((a, b) => (a.date < b.date ? 1 : -1));

    // Bring fatigue and calibration up to date before anything is generated.
    const lastSession = recent[0]?.date ?? null;
    const adjusted: CoreDoc = {
      ...core,
      recovery: decayTo(core.recovery, Date.now()),
      progression: applyLayoff(core.progression, lastSession, today),
      lastOpenedAt: Date.now(),
    };

    const active = await vault.readActive(keys);

    // `derive` reads the store, so the freshly loaded state must be handed to
    // it explicitly — deriving from `get()` here would plan today's session
    // against the empty state that exists before this `set`, leaving the
    // dashboard blank after every reload.
    set({
      keys,
      core: adjusted,
      recent,
      today,
      active: active ? { session: active.session, timer: active.timer } : null,
      status: statusFor(adjusted),
      notice: schemaAhead
        ? 'Tes données viennent d’une version plus récente de l’application. Mets-la à jour pour éviter toute perte.'
        : recovered
          ? 'Des données enregistrées étaient illisibles et ont été ignorées. Si tu as un export récent, tu peux le réimporter depuis les paramètres.'
          : null,
      ...derive({ core: adjusted, recent, today, adjust: 0, variant: 0 }),
    });
    await persistCore(adjusted);
  }

  return {
    ...initialState,

    /* ----------------------------------------------------------- session */

    async boot() {
      try {
        if (!(await vault.vaultExists())) {
          set({ status: 'aucun-coffre' });
          return;
        }
        const keys = await restoreDevice();
        if (!keys) {
          set({ status: 'verrouille' });
          return;
        }
        await hydrate(keys);
      } catch (error) {
        set({
          status: 'aucun-coffre',
          error:
            error instanceof Error
              ? error.message
              : 'Impossible d’ouvrir le stockage de l’application.',
        });
      }
    },

    async createVault(passphrase, remember) {
      try {
        const keys = await vault.createVault(passphrase);
        if (remember) await rememberDevice(keys);
        await hydrate(keys);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Création impossible.' });
        throw error;
      }
    },

    async unlock(passphrase, remember) {
      const keys = await vault.unlockVault(passphrase);
      if (remember) await rememberDevice(keys);
      else await forgetDevice();
      await hydrate(keys);
    },

    async lock() {
      await forgetDevice();
      set({ ...initialState, status: 'verrouille', today: dateKey(new Date()) });
    },

    /* ----------------------------------------------------------- profil */

    async saveProfile(profile) {
      const core: CoreDoc = { ...get().core, profile };
      set({ core, status: statusFor(core), ...derive({ core }) });
      await persistCore(core);
    },

    async saveAssessment(assessment) {
      const progression = progressionFromAssessment(assessment.entries);
      const core: CoreDoc = {
        ...get().core,
        assessment,
        progression,
        onboardedAt: Date.now(),
      };
      set({ core, status: 'pret', ...derive({ core }) });
      await persistCore(core);
    },

    async skipAssessment() {
      const core: CoreDoc = { ...get().core, onboardedAt: Date.now() };
      set({ core, status: 'pret', ...derive({ core }) });
      await persistCore(core);
    },

    async updateSettings(patch) {
      const core: CoreDoc = { ...get().core, settings: { ...get().core.settings, ...patch } };
      set({ core });
      await persistCore(core);
    },

    async saveCustomPreset(preset) {
      const core: CoreDoc = { ...get().core, customPresets: [...get().core.customPresets, preset] };
      set({ core });
      await persistCore(core);
    },

    async deleteCustomPreset(id) {
      const core: CoreDoc = {
        ...get().core,
        customPresets: get().core.customPresets.filter((p) => String(p.id) !== id),
      };
      set({ core });
      await persistCore(core);
    },

    /* -------------------------------------------------------- génération */

    regenerate() {
      set(derive());
    },

    setAdjust(value) {
      set(derive({ adjust: value }));
    },

    shuffle() {
      set(derive({ variant: get().variant + 1 }));
    },

    chooseArchetype(archetype) {
      const s = get();
      if (!s.core.profile) return;
      const workout = generateWorkout({
        profile: s.core.profile,
        progression: s.core.progression,
        recovery: s.core.recovery,
        history: s.recent,
        date: s.today,
        archetype,
        adjust: s.adjust,
        variant: s.variant,
      });
      const extension = chooseExtension(archetype, workout.intensity, s.core.recovery);
      const avoid = workout.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)));
      const extensionWorkout = generateWorkout({
        profile: s.core.profile,
        progression: s.core.progression,
        recovery: s.core.recovery,
        history: s.recent,
        date: s.today,
        archetype,
        kind: 'extension',
        template: asSessionTemplate(extension.template, archetype),
        variant: s.variant,
        avoid,
      });
      set({
        workout,
        extension,
        extensionWorkout,
        plan: s.plan ? { ...s.plan, archetype, isRestDay: false } : null,
      });
    },

    replaceExercise(blockId, itemIndex, direction) {
      const s = get();
      const workout = s.workout;
      if (!workout || !s.core.profile) return;

      const current = workout.blocks.find((b) => b.id === blockId)?.items[itemIndex];
      if (!current) return;

      const used = new Set(workout.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId))));
      const replacement = findReplacement(
        current.exerciseId,
        {
          profile: s.core.profile,
          progression: s.core.progression,
          recovery: s.core.recovery,
          recent: new Map(),
          maxImpact: 'eleve',
          maxIntensity: 5,
          rng: createRng(workout.seed + itemIndex),
        },
        used,
        direction,
      );
      if (!replacement) {
        set({ notice: 'Aucun exercice équivalent ne correspond à tes contraintes.' });
        return;
      }

      const blocks = workout.blocks.map((b) =>
        b.id !== blockId
          ? b
          : {
              ...b,
              items: b.items.map((item, i) =>
                i !== itemIndex
                  ? item
                  : {
                      ...item,
                      exerciseId: replacement.id,
                      secondsPerRep:
                        item.measure === 'reps' ? replacement.secondsPerRep : item.secondsPerRep,
                      perSide: replacement.unilateral,
                    },
              ),
            },
      );

      // A swap must never push the session past its budget.
      const durationSec = computeDuration(blocks);
      if (durationSec > workout.budgetSec) {
        set({
          notice: 'Ce remplacement ferait dépasser la durée de la séance. L’exercice est conservé.',
        });
        return;
      }
      set({ workout: { ...workout, blocks, durationSec } });
    },

    /* ---------------------------------------------------------- séances */

    async startSession(kind) {
      const s = get();
      const workout = kind === 'extension' ? s.extensionWorkout : s.workout;
      if (!workout || !s.keys) return null;

      const session: WorkoutSession = {
        id: sessionId(`${s.today}-${kind}-${Date.now().toString(36)}`),
        workout,
        date: s.today,
        startedAt: Date.now(),
        elapsedSec: 0,
        performed: [],
        status: 'en-cours',
        ...(kind === 'extension' && s.active?.session.id ? { extensionOf: s.active.session.id } : {}),
      };
      set({ active: { session, timer: null } });
      try {
        await vault.writeActive(s.keys, { session, timer: emptyTimerState(), savedAt: Date.now() });
      } catch {
        set({
          storageWarning:
            'La séance ne peut pas être sauvegardée sur cet appareil. Elle fonctionnera, mais ne sera pas conservée si tu quittes.',
        });
      }
      return session;
    },

    /**
     * Snapshot the session in flight to the vault.
     *
     * Deliberately does **not** write back into the store: the screen owns the
     * live session while it runs, and mirroring every recorded repetition into
     * shared state would re-render the screen, which would persist again, and
     * so on. The store only needs to know that a session exists — it learns
     * the detail back from storage if the app is reopened.
     */
    async persistActive(session, timer) {
      const keys = get().keys;
      if (!keys) return;
      try {
        await vault.writeActive(keys, {
          session,
          timer: timer ?? emptyTimerState(),
          savedAt: Date.now(),
        });
      } catch {
        /* already surfaced by storageWarning; the session continues regardless */
      }
    },

    async finishSession(performed, elapsedSec, feedback) {
      const s = get();
      const active = s.active;
      if (!active || !s.keys) return null;

      const session: WorkoutSession = {
        ...active.session,
        status: 'terminee',
        endedAt: Date.now(),
        elapsedSec: Math.round(elapsedSec),
        performed: [...performed],
        feedback,
      };

      const completion = completionRatio(session);
      const progression = applySession(s.core.progression, performed, feedback);
      const recovery = applyWorkout(
        s.core.recovery,
        session.workout,
        feedback,
        Date.now(),
        completion,
      );
      const { performances, records } = mergePerformances(s.core.performances, session);

      const sessions = [...s.core.sessions.filter((x) => x.id !== session.id), summarise(session)];
      const achievements = evaluateAchievements(
        [...s.recent, session],
        performances,
        s.core.achievements,
        s.today,
      );
      const unlockedNow = newlyUnlocked(achievements, s.core.achievements);
      const achievementMap = { ...s.core.achievements };
      for (const a of achievements) if (a.unlockedAt) achievementMap[a.id] = a.unlockedAt;

      const core: CoreDoc = {
        ...s.core,
        progression,
        recovery,
        performances,
        sessions,
        achievements: achievementMap,
      };

      const recent = [session, ...s.recent].slice(0, RECENT_LIMIT);
      set({ core, recent, active: null, ...derive({ core, recent, adjust: 0 }) });

      try {
        await vault.writeSession(s.keys, session);
        await persistCore(core);
        await vault.clearActive(s.keys);
      } catch {
        set({
          storageWarning:
            'La séance n’a pas pu être enregistrée sur cet appareil. Exporte tes données depuis les paramètres avant de fermer.',
        });
      }

      return {
        session,
        records,
        achievements: unlockedNow.map((a) => ({ id: String(a.id), label: a.label })),
      };
    },

    async abandonSession(performed, elapsedSec) {
      const s = get();
      const active = s.active;
      if (!active || !s.keys) return;

      // Work already done is never thrown away (cahier des charges §62).
      const session: WorkoutSession = {
        ...active.session,
        status: 'abandonnee',
        endedAt: Date.now(),
        elapsedSec: Math.round(elapsedSec),
        performed: [...performed],
      };
      const { performances } = mergePerformances(s.core.performances, session);
      const core: CoreDoc = {
        ...s.core,
        performances,
        sessions: [...s.core.sessions.filter((x) => x.id !== session.id), summarise(session)],
        recovery: applyWorkout(
          s.core.recovery,
          session.workout,
          undefined,
          Date.now(),
          completionRatio(session),
        ),
      };
      set({ core, active: null, ...derive({ core }) });
      try {
        await vault.writeSession(s.keys, session);
        await persistCore(core);
        await vault.clearActive(s.keys);
      } catch {
        /* surfaced via storageWarning */
      }
    },

    async discardActive() {
      const keys = get().keys;
      set({ active: null });
      if (keys) await vault.clearActive(keys).catch(() => undefined);
    },

    async loadSession(id) {
      const s = get();
      const cached = s.recent.find((x) => x.id === id);
      if (cached) return cached;
      if (!s.keys) return null;
      return vault.readSession(s.keys, id);
    },

    /* ------------------------------------------------------------ données */

    async exportData() {
      const keys = get().keys;
      if (!keys) throw new Error('Coffre verrouillé.');
      return JSON.stringify(await vault.exportAll(keys), null, 2);
    },

    async importData(json) {
      const keys = get().keys;
      if (!keys) throw new Error('Coffre verrouillé.');
      const parsed = JSON.parse(json) as unknown;
      await vault.importAll(keys, parsed);
      await hydrate(keys);
      set({ notice: 'Import terminé. Tes données ont été restaurées.' });
    },

    async resetEverything() {
      await vault.destroyVault();
      await forgetDevice();
      set({ ...initialState, status: 'aucun-coffre', today: dateKey(new Date()) });
    },

    dismissNotice() {
      set({ notice: null });
    },

    dismissError() {
      set({ error: null });
    },
  };
});

/* ------------------------------------------------------------- helpers */

const emptyTimerState = (): TimerPersisted => ({
  index: 0,
  deadline: 0,
  frozenRemaining: null,
  started: false,
  done: false,
  completedSec: 0,
});

/** Share of the prescribed work actually completed, 0…1. */
function completionRatio(session: WorkoutSession): number {
  const planned = session.workout.blocks.reduce(
    (sum, b) => sum + b.rounds * b.items.length,
    0,
  );
  if (planned === 0) return 1;
  const done = session.performed.filter((p) => !p.skipped).length;
  return Math.max(0, Math.min(1, done / planned));
}

/** Fold a session's results into the personal-record table. */
function mergePerformances(
  existing: readonly Performance[],
  session: WorkoutSession,
): { performances: Performance[]; records: FinishOutcome['records'] } {
  const byId = new Map(existing.map((p) => [String(p.exerciseId), p]));
  const records: { exerciseId: string; name: string; value: number; measure: string }[] = [];

  // A record is the best single set, so results are grouped per exercise.
  const bestThisSession = new Map<string, { value: number; measure: 'reps' | 'temps' }>();
  const volume = new Map<string, number>();
  for (const p of session.performed) {
    if (p.skipped) continue;
    const id = String(p.substitutedFor ?? p.exerciseId);
    const current = bestThisSession.get(id);
    if (!current || p.achieved > current.value) {
      bestThisSession.set(id, { value: p.achieved, measure: p.measure });
    }
    volume.set(id, (volume.get(id) ?? 0) + p.achieved);
  }

  for (const [id, best] of bestThisSession) {
    const previous = byId.get(id);
    const isRecord = !previous || best.value > previous.best;
    const history = [
      ...(previous?.history ?? []).filter((h) => h.at !== session.date),
      { at: session.date, value: best.value },
    ].slice(-PERFORMANCE_HISTORY_LIMIT);

    const next: Performance = {
      exerciseId: (previous?.exerciseId ?? id) as Performance['exerciseId'],
      best: isRecord ? best.value : previous!.best,
      measure: best.measure,
      at: isRecord ? session.date : previous!.at,
      totalVolume: (previous?.totalVolume ?? 0) + (volume.get(id) ?? 0),
      sessions: (previous?.sessions ?? 0) + 1,
      history,
    };
    byId.set(id, next);
    // Only celebrate a record once there is something to beat.
    if (isRecord && previous) {
      records.push({
        exerciseId: id,
        name: safeName(id),
        value: best.value,
        measure: best.measure,
      });
    }
  }

  return { performances: [...byId.values()], records };
}

function safeName(id: string): string {
  try {
    return getExercise(id).name;
  } catch {
    return id;
  }
}

/** Recovery state helper used when a profile is created before any session. */
export const freshRecoveryFor = (day: DateKey) => emptyRecovery(day);
