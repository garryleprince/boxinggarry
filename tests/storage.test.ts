import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

// The vault requires Web Crypto; Node exposes it under a different global.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const { PBKDF2_ITERATIONS, WrongPassphraseError, createMeta, deriveKeys, decryptJson, encryptJson, recordName, unlockWithPassphrase, passphraseStrength } =
  await import('@/storage/crypto');
const vault = await import('@/storage/vault');
const { idbClose, idbDestroy, idbGet, idbKeys, STORE_VAULT } = await import('@/storage/idb');
const { rememberDevice, restoreDevice, forgetDevice, isDeviceRemembered } = await import(
  '@/auth/session'
);
const { sessionId, dateKey } = await import('@/domain/model/ids');
const { generateWorkout } = await import('@/engines/training/generator');
const { profile, progressionFor, freshRecovery, TODAY } = await import('./fixtures');

const PASSPHRASE = 'garde-haute-2026';

function makeSession() {
  const p = profile();
  const workout = generateWorkout({
    profile: p,
    progression: progressionFor(p),
    recovery: freshRecovery(),
    history: [],
    date: TODAY,
    archetype: 'full-body-boxing',
  });
  return {
    id: sessionId('s-1'),
    workout,
    date: TODAY,
    startedAt: Date.now(),
    endedAt: Date.now() + 1200_000,
    elapsedSec: 1200,
    performed: [],
    status: 'terminee' as const,
    feedback: { overall: 3 as const },
  };
}

beforeEach(async () => {
  await idbDestroy();
  await idbClose();
});

describe('chiffrement', () => {
  it('chiffre et déchiffre une valeur quelconque', async () => {
    const { keys } = await createMeta(PASSPHRASE);
    const blob = await encryptJson(keys, { a: 1, b: ['x', 'y'] });
    expect(await decryptJson(keys, blob)).toEqual({ a: 1, b: ['x', 'y'] });
  });

  it('ne produit jamais deux fois le même chiffré pour la même donnée', async () => {
    const { keys } = await createMeta(PASSPHRASE);
    const a = await encryptJson(keys, 'même valeur');
    const b = await encryptJson(keys, 'même valeur');
    expect(a.data).not.toEqual(b.data);
    expect(a.iv).not.toEqual(b.iv);
  });

  it('refuse une phrase secrète incorrecte', async () => {
    const { meta } = await createMeta(PASSPHRASE);
    await expect(unlockWithPassphrase(meta, 'mauvaise-phrase')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await expect(unlockWithPassphrase(meta, PASSPHRASE)).resolves.toBeTruthy();
  });

  it('utilise une dérivation coûteuse et un sel aléatoire', async () => {
    const a = await createMeta(PASSPHRASE);
    const b = await createMeta(PASSPHRASE);
    expect(a.meta.iterations).toBe(PBKDF2_ITERATIONS);
    expect(a.meta.iterations).toBeGreaterThanOrEqual(600_000);
    expect(a.meta.salt).not.toEqual(b.meta.salt);
  });

  it('donne des noms d’enregistrement opaques et stables', async () => {
    const salt = new Uint8Array(16).fill(7);
    const k1 = await deriveKeys(PASSPHRASE, salt);
    const k2 = await deriveKeys(PASSPHRASE, salt);
    const k3 = await deriveKeys('autre-phrase', salt);
    const name = await recordName(k1, 'session:2026-09-14');
    expect(await recordName(k2, 'session:2026-09-14')).toBe(name);
    expect(await recordName(k3, 'session:2026-09-14')).not.toBe(name);
    expect(name).not.toContain('2026');
    expect(name).toMatch(/^[0-9a-f]{32}$/);
  });

  it('évalue la robustesse d’une phrase secrète', () => {
    expect(passphraseStrength('abc').score).toBe(1);
    expect(passphraseStrength('garde-haute-2026-ring').score).toBe(4);
  });
});

describe('coffre', () => {
  it('crée un coffre, écrit et relit les données', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    const core = vault.emptyCore();
    await vault.writeCore(keys, { ...core, onboardedAt: 123 });
    const read = await vault.readCore(keys);
    expect(read.core.onboardedAt).toBe(123);
    expect(read.recovered).toBe(false);
  });

  it('refuse de créer un second coffre par-dessus le premier', async () => {
    await vault.createVault(PASSPHRASE);
    await expect(vault.createVault('autre')).rejects.toThrow();
  });

  it('n’écrit jamais de données lisibles dans IndexedDB', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    const session = makeSession();
    await vault.writeSession(keys, session);
    await vault.writeCore(keys, {
      ...vault.emptyCore(),
      profile: { ...profile(), name: 'Secret Boxeur' },
      sessions: [vault.summarise(session)],
    });

    const names = await idbKeys(STORE_VAULT);
    const dump: string[] = [names.join('|')];
    for (const name of names) dump.push(JSON.stringify(await idbGet(STORE_VAULT, name)));
    const everything = dump.join('|');

    expect(everything).not.toContain('Secret Boxeur');
    expect(everything).not.toContain('full-body-boxing');
    expect(everything).not.toContain(String(TODAY));
    expect(everything).not.toContain('pompes');
  });

  it('une mauvaise phrase secrète ne donne accès à rien', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await vault.writeCore(keys, { ...vault.emptyCore(), onboardedAt: 999 });
    await expect(vault.unlockVault('phrase-inventee')).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    // A different passphrase derives different keys and therefore reads nothing.
    const attacker = await deriveKeys('phrase-inventee', new Uint8Array(16));
    const read = await vault.readCore(attacker);
    expect(read.core.onboardedAt).toBeUndefined();
  });

  it('rouvre le coffre avec la bonne phrase après fermeture', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await vault.writeCore(keys, { ...vault.emptyCore(), onboardedAt: 42 });
    await idbClose();
    const reopened = await vault.unlockVault(PASSPHRASE);
    expect((await vault.readCore(reopened)).core.onboardedAt).toBe(42);
  });

  it('enregistre et relit une séance complète', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    const session = makeSession();
    await vault.writeSession(keys, session);
    const read = await vault.readSession(keys, session.id);
    expect(read?.workout.durationSec).toBe(session.workout.durationSec);
    expect(read?.workout.blocks.length).toBe(session.workout.blocks.length);
  });

  it('conserve la séance en cours pour la reprendre après une fermeture', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    const session = { ...makeSession(), status: 'en-cours' as const };
    await vault.writeActive(keys, {
      session,
      timer: { index: 4, deadline: 1000, frozenRemaining: null, started: true, done: false, completedSec: 120 },
      savedAt: Date.now(),
    });
    const active = await vault.readActive(keys);
    expect(active?.timer.index).toBe(4);
    expect(active?.session.status).toBe('en-cours');
    await vault.clearActive(keys);
    expect(await vault.readActive(keys)).toBeNull();
  });

  it('repart sur des valeurs par défaut si un enregistrement est corrompu', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    const name = await recordName(keys, 'core');
    const { idbPut } = await import('@/storage/idb');
    await idbPut(STORE_VAULT, name, { iv: [1, 2, 3], data: [9, 9, 9] });
    const read = await vault.readCore(keys);
    expect(read.recovered).toBe(true);
    expect(read.core.profile).toBeNull();
  });
});

describe('export et import', () => {
  it('exporte tout en JSON lisible puis le réimporte à l’identique', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    const session = makeSession();
    await vault.writeSession(keys, session);
    await vault.writeCore(keys, {
      ...vault.emptyCore(),
      profile: profile(),
      sessions: [vault.summarise(session)],
      onboardedAt: 7,
    });

    const bundle = await vault.exportAll(keys);
    expect(bundle.format).toBe('boxing-body-coach/export');
    expect(bundle.sessions).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(bundle))).toEqual(bundle);

    await vault.destroyVault();
    const fresh = await vault.createVault('nouvelle-phrase-secrete');
    const restored = await vault.importAll(fresh, JSON.parse(JSON.stringify(bundle)));
    expect(restored.onboardedAt).toBe(7);
    expect(restored.sessions).toHaveLength(1);
    expect((await vault.readSession(fresh, session.id))?.elapsedSec).toBe(1200);
  });

  it('rejette un fichier qui n’est pas un export de l’application', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await expect(vault.importAll(keys, { hello: 'world' })).rejects.toThrow(
      /pas un export/i,
    );
  });
});

describe('session d’authentification', () => {
  it('ne conserve rien par défaut', async () => {
    await vault.createVault(PASSPHRASE);
    expect(await isDeviceRemembered()).toBe(false);
    expect(await restoreDevice()).toBeNull();
  });

  it('restaure une session mémorisée sans redemander la phrase', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await vault.writeCore(keys, { ...vault.emptyCore(), onboardedAt: 5 });
    await rememberDevice(keys);
    const restored = await restoreDevice();
    expect(restored).not.toBeNull();
    expect((await vault.readCore(restored!)).core.onboardedAt).toBe(5);
  });

  it('verrouille après le délai d’inactivité choisi', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await rememberDevice(keys, 30);
    const { STORE_META, idbGet: get, idbPut: put } = await import('@/storage/idb');
    const record = await get<Record<string, unknown>>(STORE_META, 'device-session');
    await put(STORE_META, 'device-session', {
      ...record,
      savedAt: Date.now() - 31 * 60_000,
    });
    expect(await restoreDevice()).toBeNull();
    expect(await isDeviceRemembered()).toBe(false);
  });

  it('oublie l’appareil à la déconnexion', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await rememberDevice(keys);
    await forgetDevice();
    expect(await restoreDevice()).toBeNull();
  });
});

describe('réinitialisation', () => {
  it('efface tout, y compris les métadonnées du coffre', async () => {
    const keys = await vault.createVault(PASSPHRASE);
    await vault.writeSession(keys, makeSession());
    await vault.destroyVault();
    expect(await vault.vaultExists()).toBe(false);
    expect(await idbKeys(STORE_VAULT)).toHaveLength(0);
    void dateKey;
  });
});

describe('migrations de schéma', () => {
  it('convertit l’ancien booléen d’animations en réglage à trois états', async () => {
    const { migrateCore, SCHEMA_VERSION } = await import('@/storage/schema');
    const legacy = {
      ...vault.emptyCore(),
      schemaVersion: 1,
      settings: { ...vault.emptyCore().settings, reduceMotion: true },
    } as never;

    const { doc, migrated, ahead } = migrateCore(legacy);
    expect(migrated).toBe(true);
    expect(ahead).toBe(false);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(doc.settings.animations).toBe('jamais');
    expect('reduceMotion' in doc.settings).toBe(false);
  });

  it('laisse les animations sur « systeme » quand rien n’était réduit', async () => {
    const { migrateCore } = await import('@/storage/schema');
    const legacy = {
      ...vault.emptyCore(),
      schemaVersion: 1,
      settings: { ...vault.emptyCore().settings, reduceMotion: false },
    } as never;
    expect(migrateCore(legacy).doc.settings.animations).toBe('systeme');
  });

  it('refuse un document venu d’une version plus récente', async () => {
    const { migrateCore } = await import('@/storage/schema');
    const future = { ...vault.emptyCore(), schemaVersion: 99 };
    const { ahead, migrated } = migrateCore(future);
    expect(ahead).toBe(true);
    expect(migrated).toBe(false);
  });

  it('un coffre de la version courante n’est pas migré inutilement', async () => {
    const { migrateCore } = await import('@/storage/schema');
    const { migrated, ahead } = migrateCore(vault.emptyCore());
    expect(migrated).toBe(false);
    expect(ahead).toBe(false);
  });
});
