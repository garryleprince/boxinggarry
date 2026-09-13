import type { VaultKeys } from '@/storage/crypto';
import { STORE_META, idbDelete, idbGet, idbPut } from '@/storage/idb';

/**
 * Session persistence.
 *
 * By default the derived keys live only in memory: closing the app locks the
 * vault, and the passphrase is required again. Because the keys are
 * non-extractable `CryptoKey` objects, they can be handed to IndexedDB for an
 * opt-in "keep me signed in on this device" without any script — including
 * this one — ever being able to read the raw key material back out.
 *
 * The trade-off is stated plainly in the settings screen: remembering the
 * device means anyone who can unlock the phone can open the application.
 */

const DEVICE_KEY = 'device-session';

interface StoredSession {
  readonly cipher: CryptoKey;
  readonly naming: CryptoKey;
  readonly savedAt: number;
  /** Minutes of inactivity after which the vault locks itself. 0 = never. */
  readonly autoLockMinutes: number;
}

export async function rememberDevice(keys: VaultKeys, autoLockMinutes = 0): Promise<boolean> {
  try {
    const record: StoredSession = {
      cipher: keys.cipher,
      naming: keys.naming,
      savedAt: Date.now(),
      autoLockMinutes,
    };
    await idbPut(STORE_META, DEVICE_KEY, record);
    return true;
  } catch {
    // Some browsers refuse to structured-clone CryptoKey; sign-in simply does
    // not persist there, which is a degradation and not a failure.
    return false;
  }
}

export async function forgetDevice(): Promise<void> {
  try {
    await idbDelete(STORE_META, DEVICE_KEY);
  } catch {
    /* nothing stored */
  }
}

export async function isDeviceRemembered(): Promise<boolean> {
  try {
    return (await idbGet<StoredSession>(STORE_META, DEVICE_KEY)) != null;
  } catch {
    return false;
  }
}

/** Restore a remembered session, honouring its auto-lock window. */
export async function restoreDevice(): Promise<VaultKeys | null> {
  let record: StoredSession | undefined;
  try {
    record = await idbGet<StoredSession>(STORE_META, DEVICE_KEY);
  } catch {
    return null;
  }
  if (!record?.cipher || !record.naming) return null;

  if (record.autoLockMinutes > 0) {
    const elapsedMinutes = (Date.now() - record.savedAt) / 60_000;
    if (elapsedMinutes > record.autoLockMinutes) {
      await forgetDevice();
      return null;
    }
  }
  // Slide the window forward on every successful restore.
  await idbPut(STORE_META, DEVICE_KEY, { ...record, savedAt: Date.now() });
  return { cipher: record.cipher, naming: record.naming };
}

export async function autoLockMinutes(): Promise<number> {
  try {
    return (await idbGet<StoredSession>(STORE_META, DEVICE_KEY))?.autoLockMinutes ?? 0;
  } catch {
    return 0;
  }
}
