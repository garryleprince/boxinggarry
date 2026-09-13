/**
 * Minimal IndexedDB wrapper.
 *
 * Hand-written rather than pulled from npm: the surface needed here is a
 * key-value store with two object stores, and every kilobyte shipped is a
 * kilobyte the athlete downloads on mobile data.
 */

const DB_NAME = 'boxing-body-coach';
const DB_VERSION = 1;

/** Encrypted application records, keyed by an opaque HMAC-derived name. */
export const STORE_VAULT = 'vault';
/** Unencrypted metadata: salt, KDF parameters, verifier. Never secret. */
export const STORE_META = 'meta';

export class StorageUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      'Le stockage local n’est pas accessible. En navigation privée ou si le stockage du site est bloqué, l’application ne peut pas enregistrer tes séances.',
    );
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageUnavailableError());
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new StorageUnavailableError(error));
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_VAULT)) db.createObjectStore(STORE_VAULT);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(new StorageUnavailableError(request.error));
    request.onblocked = () => reject(new StorageUnavailableError('blocked'));
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  body: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(store, mode);
        } catch (error) {
          reject(new StorageUnavailableError(error));
          return;
        }
        const request = body(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new StorageUnavailableError());
        tx.onabort = () => reject(tx.error ?? new StorageUnavailableError());
      }),
  );
}

export const idbGet = <T>(store: string, key: string): Promise<T | undefined> =>
  run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);

export const idbPut = (store: string, key: string, value: unknown): Promise<unknown> =>
  run(store, 'readwrite', (s) => s.put(value, key) as IDBRequest<unknown>);

export const idbDelete = (store: string, key: string): Promise<unknown> =>
  run(store, 'readwrite', (s) => s.delete(key) as IDBRequest<unknown>);

export const idbKeys = (store: string): Promise<string[]> =>
  run<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map((k) => String(k)),
  );

export const idbClear = (store: string): Promise<unknown> =>
  run(store, 'readwrite', (s) => s.clear() as IDBRequest<unknown>);

/** Wipe both stores. Used by "réinitialiser l’application". */
export async function idbDestroy(): Promise<void> {
  await idbClear(STORE_VAULT);
  await idbClear(STORE_META);
}

/** Close the connection, so tests and reset flows start from a clean slate. */
export async function idbClose(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise.catch(() => null);
  db?.close();
  dbPromise = null;
}

/**
 * Ask the browser to make this origin's storage persistent.
 *
 * On iOS, an installed home-screen web app is not subject to Safari's
 * seven-day script-writable-storage eviction, but data can still be cleared
 * under storage pressure or after long disuse. Requesting persistence is the
 * only lever a web app has; it may be refused, so the export feature is the
 * real safety net and the settings screen says so.
 */
export async function requestPersistence(): Promise<{ granted: boolean; supported: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return { granted: false, supported: false };
  }
  try {
    if (await navigator.storage.persisted?.()) return { granted: true, supported: true };
    return { granted: await navigator.storage.persist(), supported: true };
  } catch {
    return { granted: false, supported: true };
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
