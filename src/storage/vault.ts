import type { SessionId } from '@/domain/model/ids';
import { dateKey } from '@/domain/model/ids';
import type { WorkoutSession } from '@/domain/model/workout';
import { DEFAULT_SETTINGS } from '@/domain/model/user';
import { emptyRecovery } from '@/engines/recovery';
import { initialProgression } from '@/engines/progression';
import {
  createMeta,
  decryptJson,
  encryptJson,
  recordName,
  unlockWithPassphrase,
  type VaultKeys,
  type VaultMeta,
} from './crypto';
import {
  STORE_META,
  STORE_VAULT,
  idbDelete,
  idbDestroy,
  idbGet,
  idbPut,
  idbKeys,
} from './idb';
import {
  ACTIVE_KEY,
  CORE_KEY,
  SCHEMA_VERSION,
  migrateCore,
  sessionKey,
  summarise,
  type ActiveDoc,
  type CoreDoc,
} from './schema';

/**
 * The vault: the only module that touches persisted data.
 *
 * Reads and writes go through the derived keys held for the session, so every
 * byte at rest is ciphertext and every record name is an HMAC. Nothing here
 * knows about React, and nothing above here knows about IndexedDB.
 */

const META_KEY = 'vault-meta';

export const loadMeta = (): Promise<VaultMeta | undefined> =>
  idbGet<VaultMeta>(STORE_META, META_KEY);

export const vaultExists = async (): Promise<boolean> => (await loadMeta()) != null;

export function emptyCore(): CoreDoc {
  const today = dateKey(new Date());
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: null,
    assessment: null,
    progression: initialProgression('debutant'),
    recovery: emptyRecovery(today),
    settings: DEFAULT_SETTINGS,
    performances: [],
    customPresets: [],
    sessions: [],
    achievements: {},
  };
}

/** Create a brand-new vault. Refuses to overwrite an existing one. */
export async function createVault(passphrase: string): Promise<VaultKeys> {
  if (await vaultExists()) {
    throw new Error('Un coffre existe déjà sur cet appareil.');
  }
  const { meta, keys } = await createMeta(passphrase);
  await idbPut(STORE_META, META_KEY, meta);
  await writeCore(keys, emptyCore());
  return keys;
}

export async function unlockVault(passphrase: string): Promise<VaultKeys> {
  const meta = await loadMeta();
  if (!meta) throw new Error('Aucun coffre sur cet appareil.');
  return unlockWithPassphrase(meta, passphrase);
}

/* ------------------------------------------------------------------- core */

export class CorruptedVaultError extends Error {
  constructor(readonly key: string, cause?: unknown) {
    super(
      'Une donnée enregistrée est illisible. Elle a été ignorée pour ne pas bloquer l’application.',
    );
    this.name = 'CorruptedVaultError';
    this.cause = cause;
  }
}

export interface CoreLoad {
  readonly core: CoreDoc;
  /** True when the stored document came from a newer build of the app. */
  readonly schemaAhead: boolean;
  /** True when the stored document was unreadable and defaults were used. */
  readonly recovered: boolean;
}

export async function readCore(keys: VaultKeys): Promise<CoreLoad> {
  const name = await recordName(keys, CORE_KEY);
  const blob = await idbGet<Parameters<typeof decryptJson>[1]>(STORE_VAULT, name);
  if (!blob) return { core: emptyCore(), schemaAhead: false, recovered: false };
  try {
    const raw = await decryptJson<CoreDoc>(keys, blob);
    const { doc, ahead } = migrateCore(raw);
    return { core: doc, schemaAhead: ahead, recovered: false };
  } catch {
    // Never take the athlete down with the data: start from defaults and let
    // the UI offer an import (cahier des charges §62).
    return { core: emptyCore(), schemaAhead: false, recovered: true };
  }
}

export async function writeCore(keys: VaultKeys, core: CoreDoc): Promise<void> {
  const name = await recordName(keys, CORE_KEY);
  await idbPut(STORE_VAULT, name, await encryptJson(keys, core));
}

/* --------------------------------------------------------------- sessions */

export async function writeSession(keys: VaultKeys, session: WorkoutSession): Promise<void> {
  const name = await recordName(keys, sessionKey(session.id));
  await idbPut(STORE_VAULT, name, await encryptJson(keys, session));
}

export async function readSession(
  keys: VaultKeys,
  id: SessionId,
): Promise<WorkoutSession | null> {
  const name = await recordName(keys, sessionKey(id));
  const blob = await idbGet<Parameters<typeof decryptJson>[1]>(STORE_VAULT, name);
  if (!blob) return null;
  try {
    return await decryptJson<WorkoutSession>(keys, blob);
  } catch {
    return null;
  }
}

export async function deleteSession(keys: VaultKeys, id: SessionId): Promise<void> {
  await idbDelete(STORE_VAULT, await recordName(keys, sessionKey(id)));
}

/** Load full sessions for the given ids, skipping any that fail to decrypt. */
export async function readSessions(
  keys: VaultKeys,
  ids: readonly SessionId[],
): Promise<WorkoutSession[]> {
  const loaded = await Promise.all(ids.map((id) => readSession(keys, id)));
  return loaded.filter((s): s is WorkoutSession => s != null);
}

/* ----------------------------------------------------------- live session */

export async function writeActive(keys: VaultKeys, doc: ActiveDoc): Promise<void> {
  const name = await recordName(keys, ACTIVE_KEY);
  await idbPut(STORE_VAULT, name, await encryptJson(keys, doc));
}

export async function readActive(keys: VaultKeys): Promise<ActiveDoc | null> {
  const name = await recordName(keys, ACTIVE_KEY);
  const blob = await idbGet<Parameters<typeof decryptJson>[1]>(STORE_VAULT, name);
  if (!blob) return null;
  try {
    return await decryptJson<ActiveDoc>(keys, blob);
  } catch {
    return null;
  }
}

export async function clearActive(keys: VaultKeys): Promise<void> {
  await idbDelete(STORE_VAULT, await recordName(keys, ACTIVE_KEY));
}

/* ------------------------------------------------------------ export data */

export interface ExportBundle {
  readonly format: 'boxing-body-coach/export';
  readonly version: number;
  readonly exportedAt: string;
  readonly core: CoreDoc;
  readonly sessions: readonly WorkoutSession[];
}

/**
 * Everything, in clear JSON, so the athlete is never locked in
 * (cahier des charges §57). The export is plaintext by design: it is meant to
 * be readable elsewhere, and the UI warns before it is shared.
 */
export async function exportAll(keys: VaultKeys): Promise<ExportBundle> {
  const { core } = await readCore(keys);
  const sessions = await readSessions(
    keys,
    core.sessions.map((s) => s.id),
  );
  return {
    format: 'boxing-body-coach/export',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    core,
    sessions,
  };
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Replace the vault contents with an exported bundle. */
export async function importAll(keys: VaultKeys, raw: unknown): Promise<CoreDoc> {
  const bundle = raw as Partial<ExportBundle>;
  if (!bundle || bundle.format !== 'boxing-body-coach/export' || !bundle.core) {
    throw new ImportError('Ce fichier n’est pas un export Boxing Body Coach.');
  }
  const { doc, ahead } = migrateCore(bundle.core as CoreDoc);
  if (ahead) {
    throw new ImportError(
      'Cet export vient d’une version plus récente de l’application. Mets-la à jour avant d’importer.',
    );
  }

  // Drop existing records first so an import never leaves orphans behind.
  for (const key of await idbKeys(STORE_VAULT)) await idbDelete(STORE_VAULT, key);

  for (const session of bundle.sessions ?? []) await writeSession(keys, session);
  const known = new Set((bundle.sessions ?? []).map((s) => String(s.id)));
  const core: CoreDoc = {
    ...doc,
    // Keep only summaries whose full session actually made it into the bundle.
    sessions: doc.sessions.filter((s) => known.has(String(s.id))),
  };
  await writeCore(keys, core);
  return core;
}

export { summarise };

/** Remove everything, including the vault metadata. Irreversible. */
export async function destroyVault(): Promise<void> {
  await idbDestroy();
}
