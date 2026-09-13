/**
 * Vault cryptography.
 *
 * Everything the athlete records is encrypted on the device with a key derived
 * from a passphrase that is never stored and never transmitted. There is no
 * server, so there is no secret in the frontend to leak and nothing to
 * intercept: discovering the URL gets an attacker an empty application, and
 * getting hold of the phone's storage gets them ciphertext.
 *
 *  - key derivation: PBKDF2-SHA-256, 600 000 iterations, 16-byte random salt
 *  - record encryption: AES-GCM-256, a fresh 12-byte IV per record
 *  - record naming: HMAC-SHA-256 under a separate derived key, so even the
 *    IndexedDB key names reveal nothing about training dates
 */

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
/** Plaintext sealed at setup; decrypting it proves the passphrase is right. */
const VERIFIER_PLAINTEXT = 'boxing-body-coach/v1';

export interface VaultKeys {
  /** AES-GCM key for record contents. Non-extractable. */
  readonly cipher: CryptoKey;
  /** HMAC key used to derive opaque record names. Non-extractable. */
  readonly naming: CryptoKey;
}

export interface VaultMeta {
  readonly version: 1;
  readonly salt: number[];
  readonly iterations: number;
  /** Encrypted verifier, checked on every unlock. */
  readonly verifier: EncryptedBlob;
  readonly createdAt: number;
}

export interface EncryptedBlob {
  readonly iv: number[];
  readonly data: number[];
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    throw new CryptoUnavailableError(
      'Le chiffrement n’est pas disponible dans ce navigateur. Ouvre l’application en HTTPS (ou sur localhost) : Web Crypto y est requis.',
    );
  }
  return c.subtle;
}

export class CryptoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoUnavailableError';
  }
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Phrase secrète incorrecte.');
    this.name = 'WrongPassphraseError';
  }
}

export const randomBytes = (n: number): Uint8Array =>
  globalThis.crypto.getRandomValues(new Uint8Array(n));

/**
 * Derive the cipher and naming keys from a passphrase.
 * Both are non-extractable: once derived, the raw key material cannot be read
 * back out by any script, including this one.
 */
export async function deriveKeys(
  passphrase: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS,
): Promise<VaultKeys> {
  const s = subtle();
  const material = await s.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  // One PBKDF2 pass produces 64 bytes, split into two independent keys.
  const bits = await s.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    512,
  );
  const raw = new Uint8Array(bits);
  const cipher = await s.importKey('raw', raw.slice(0, 32), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
  const naming = await s.importKey(
    'raw',
    raw.slice(32, 64),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  raw.fill(0);
  return { cipher, naming };
}

export async function encryptJson(keys: VaultKeys, value: unknown): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES);
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const data = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    keys.cipher,
    plaintext as BufferSource,
  );
  return { iv: [...iv], data: [...new Uint8Array(data)] };
}

export async function decryptJson<T>(keys: VaultKeys, blob: EncryptedBlob): Promise<T> {
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(blob.iv) as BufferSource },
    keys.cipher,
    new Uint8Array(blob.data) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Deterministic, opaque record name for a logical key. */
export async function recordName(keys: VaultKeys, logicalKey: string): Promise<string> {
  const sig = await subtle().sign(
    'HMAC',
    keys.naming,
    new TextEncoder().encode(logicalKey) as BufferSource,
  );
  return [...new Uint8Array(sig)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Create the metadata stored alongside a brand-new vault. */
export async function createMeta(passphrase: string): Promise<{ meta: VaultMeta; keys: VaultKeys }> {
  const salt = randomBytes(SALT_BYTES);
  const keys = await deriveKeys(passphrase, salt);
  const verifier = await encryptJson(keys, VERIFIER_PLAINTEXT);
  return {
    meta: {
      version: 1,
      salt: [...salt],
      iterations: PBKDF2_ITERATIONS,
      verifier,
      createdAt: Date.now(),
    },
    keys,
  };
}

/** Derive keys and verify the passphrase against the stored verifier. */
export async function unlockWithPassphrase(
  meta: VaultMeta,
  passphrase: string,
): Promise<VaultKeys> {
  const keys = await deriveKeys(passphrase, new Uint8Array(meta.salt), meta.iterations);
  try {
    const value = await decryptJson<string>(keys, meta.verifier);
    if (value !== VERIFIER_PLAINTEXT) throw new WrongPassphraseError();
  } catch (error) {
    if (error instanceof WrongPassphraseError) throw error;
    // AES-GCM authentication failure is exactly what a wrong passphrase looks like.
    throw new WrongPassphraseError();
  }
  return keys;
}

/** Rough passphrase strength, for the setup screen. Never blocks the athlete. */
export function passphraseStrength(value: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  hint: string;
} {
  const length = value.length;
  const classes =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/[0-9]/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));

  if (length === 0) return { score: 0, label: '', hint: '' };
  if (length < 8) {
    return { score: 1, label: 'Trop courte', hint: 'Au moins 8 caractères, idéalement une phrase.' };
  }
  if (length >= 16 && classes >= 2) {
    return { score: 4, label: 'Excellente', hint: 'Une phrase longue est le meilleur choix.' };
  }
  if (length >= 12 && classes >= 2) {
    return { score: 3, label: 'Solide', hint: 'Quelques caractères de plus et c’est parfait.' };
  }
  if (classes >= 3) return { score: 2, label: 'Correcte', hint: 'Allonge-la : la longueur compte plus que les symboles.' };
  return { score: 2, label: 'Correcte', hint: 'Mélange majuscules, chiffres ou ponctuation.' };
}

export const MIN_PASSPHRASE_LENGTH = 8;
