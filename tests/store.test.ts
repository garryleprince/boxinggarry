import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const { useStore } = await import('@/app/store');
const { idbClose, idbDestroy } = await import('@/storage/idb');
const { profile } = await import('./fixtures');

const PASSPHRASE = 'garde-haute-2026';

/**
 * Store-level tests.
 *
 * These cover the seam where the engines, the vault and the screens meet —
 * the place where a bug looks like "the dashboard is empty" rather than like a
 * failing unit.
 */

beforeEach(async () => {
  await idbDestroy();
  await idbClose();
  useStore.setState({
    status: 'chargement',
    keys: null,
    recent: [],
    active: null,
    plan: null,
    workout: null,
    extension: null,
    extensionWorkout: null,
    adjust: 0,
    variant: 0,
    error: null,
    notice: null,
    storageWarning: null,
  });
});

describe('cycle de vie du store', () => {
  it('conduit un nouvel utilisateur jusqu’à une séance prête', async () => {
    const store = useStore.getState();
    await store.boot();
    expect(useStore.getState().status).toBe('aucun-coffre');

    await useStore.getState().createVault(PASSPHRASE, true);
    expect(useStore.getState().status).toBe('onboarding');

    await useStore.getState().saveProfile(profile());
    const ready = useStore.getState();
    expect(ready.status).toBe('evaluation');
    expect(ready.workout).not.toBeNull();
    expect(ready.plan).not.toBeNull();
  });

  it('retrouve un tableau de bord complet après un rechargement', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().skipAssessment();
    const before = useStore.getState().workout?.id;
    expect(before).toBeTruthy();

    // Simulate closing and reopening the application.
    await idbClose();
    useStore.setState({
      status: 'chargement',
      keys: null,
      workout: null,
      plan: null,
      extension: null,
      extensionWorkout: null,
      recent: [],
      core: (await import('@/storage/vault')).emptyCore(),
    });
    await useStore.getState().boot();

    const after = useStore.getState();
    expect(after.status).toBe('pret');
    expect(after.core.profile).not.toBeNull();
    // The regression this guards: deriving from stale state left these null,
    // so the dashboard rendered nothing after every reload.
    expect(after.workout, 'la séance du jour doit être régénérée au démarrage').not.toBeNull();
    expect(after.plan).not.toBeNull();
    expect(after.extensionWorkout).not.toBeNull();
    expect(after.workout?.id).toBe(before);
  });

  it('enregistre une séance terminée et met à jour progression et récupération', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().skipAssessment();

    const workout = useStore.getState().workout!;
    const session = await useStore.getState().startSession('principal');
    expect(session).not.toBeNull();
    expect(useStore.getState().active).not.toBeNull();

    const performed = workout.blocks.flatMap((b) =>
      b.items.map((item) => ({
        exerciseId: item.exerciseId,
        blockId: b.id,
        round: 1,
        prescribed: item.dose,
        achieved: item.dose,
        measure: item.measure,
        skipped: false,
      })),
    );

    const fatigueBefore = useStore.getState().core.recovery.fatigue;
    const outcome = await useStore.getState().finishSession(performed, 1200, { overall: 3 });

    expect(outcome).not.toBeNull();
    const after = useStore.getState();
    expect(after.active).toBeNull();
    expect(after.core.sessions).toHaveLength(1);
    expect(after.recent).toHaveLength(1);
    expect(after.core.performances.length).toBeGreaterThan(0);
    expect(after.core.recovery.fatigue.jambes).toBeGreaterThan(fatigueBefore.jambes);
    // A new session is planned immediately, so the dashboard is never blank.
    expect(after.workout).not.toBeNull();
  });

  it('enregistre le travail déjà fait quand une séance est abandonnée', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().skipAssessment();

    const workout = useStore.getState().workout!;
    await useStore.getState().startSession('principal');
    const first = workout.blocks[1]!.items[0]!;
    await useStore.getState().abandonSession(
      [
        {
          exerciseId: first.exerciseId,
          blockId: workout.blocks[1]!.id,
          round: 1,
          prescribed: first.dose,
          achieved: first.dose,
          measure: first.measure,
          skipped: false,
        },
      ],
      240,
    );

    const after = useStore.getState();
    expect(after.core.sessions).toHaveLength(1);
    expect(after.core.sessions[0]?.status).toBe('abandonnee');
    expect(after.core.performances.length).toBeGreaterThan(0);
    expect(after.active).toBeNull();
  });

  it('reprend une séance laissée en cours après réouverture', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().skipAssessment();
    const session = (await useStore.getState().startSession('principal'))!;
    await useStore.getState().persistActive({ ...session, elapsedSec: 180 }, {
      index: 7,
      deadline: 0,
      frozenRemaining: 22,
      started: true,
      done: false,
      completedSec: 180,
    });

    await idbClose();
    useStore.setState({ status: 'chargement', keys: null, active: null });
    await useStore.getState().boot();

    const active = useStore.getState().active;
    expect(active).not.toBeNull();
    expect(active?.timer?.index).toBe(7);
    expect(active?.timer?.completedSec).toBe(180);
    expect(active?.session.elapsedSec).toBe(180);
  });

  it('verrouille et redemande la phrase secrète', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().lock();
    expect(useStore.getState().status).toBe('verrouille');
    expect(useStore.getState().keys).toBeNull();
    expect(useStore.getState().workout).toBeNull();

    await useStore.getState().unlock(PASSPHRASE, false);
    expect(useStore.getState().core.profile).not.toBeNull();
    expect(useStore.getState().workout).not.toBeNull();
  });

  it('exporte puis réimporte sans rien perdre', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile({ goals: ['explosivite'] }));
    await useStore.getState().skipAssessment();
    const json = await useStore.getState().exportData();
    expect(json).toContain('boxing-body-coach/export');

    await useStore.getState().importData(json);
    expect(useStore.getState().core.profile?.goals).toEqual(['explosivite']);
    expect(useStore.getState().workout).not.toBeNull();
  });

  it('ajuste la difficulté sans sortir du budget', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().skipAssessment();

    for (const adjust of [-1, 0, 1] as const) {
      useStore.getState().setAdjust(adjust);
      const workout = useStore.getState().workout!;
      expect(workout.durationSec).toBeLessThanOrEqual(workout.budgetSec);
    }
  });

  it('propose une séance différente à la demande', async () => {
    await useStore.getState().boot();
    await useStore.getState().createVault(PASSPHRASE, true);
    await useStore.getState().saveProfile(profile());
    await useStore.getState().skipAssessment();
    const first = useStore
      .getState()
      .workout!.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)));
    useStore.getState().shuffle();
    const second = useStore
      .getState()
      .workout!.blocks.flatMap((b) => b.items.map((i) => String(i.exerciseId)));
    expect(second.join()).not.toBe(first.join());
    expect(useStore.getState().workout!.durationSec).toBeLessThanOrEqual(1200);
  });
});
