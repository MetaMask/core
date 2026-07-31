import { base64ToBytes, bytesToBase64 } from '@metamask/utils';
import { randomBytes } from '@noble/hashes/utils';

import {
  UKYC_LOCAL_USER_SECRET_PATH,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
} from './constants.js';

/**
 * Orchestrates creation and loading of the UKYC `local_user_secret`.
 *
 * The `local_user_secret` is the root secret for all UKYC client-derived
 * material. It is generated once, on first enrollment, and persisted to
 * MetaMask Encrypted User Storage. It is never transmitted off the device, not
 * even to the idOS Relay. Every subsequent value (`storage_id`,
 * `data_encryption_key`, `signing_key`, `relay_tunnel_key`) is derived from it
 * via HKDF — see `deriveClientMaterial`.
 *
 * This module is platform-agnostic: the Encrypted User Storage backing is
 * injected as a {@link UkycLocalUserSecretStore} so the controller (which owns
 * the messenger) supplies the concrete `UserStorageController` calls.
 */

/**
 * The Encrypted User Storage operations this module needs. On MetaMask clients
 * these are backed by `UserStorageController:performGetStorage` /
 * `performSetStorage`.
 */
export type UkycLocalUserSecretStore = {
  /**
   * Reads the base64 string stored at `path`, or `null` if none exists.
   */
  get: (path: string, entropySourceId?: string) => Promise<string | null>;
  /**
   * Writes the base64 string `value` at `path`.
   */
  set: (path: string, value: string, entropySourceId?: string) => Promise<void>;
};

/**
 * In-flight `getOrCreateLocalUserSecret` calls, keyed by entropy source.
 * Deduplicates concurrent enrollments in a single client session so we never
 * generate and persist two competing `local_user_secret`s for the same source.
 */
const inFlightCreations = new Map<string, Promise<Uint8Array>>();

/**
 * Loads the persisted `local_user_secret` from Encrypted User Storage, if one
 * exists.
 *
 * @param store - The Encrypted User Storage adapter.
 * @param entropySourceId - Optional HD keyring entropy source id, used to scope
 * the secret to a specific SRP in multi-SRP wallets. Defaults to the primary SRP.
 * @returns The decoded `local_user_secret` bytes, or `null` if none has been
 * enrolled.
 */
export async function loadLocalUserSecret(
  store: UkycLocalUserSecretStore,
  entropySourceId?: string,
): Promise<Uint8Array | null> {
  const stored = await store.get(UKYC_LOCAL_USER_SECRET_PATH, entropySourceId);

  if (!stored) {
    return null;
  }

  const localUserSecret = base64ToBytes(stored);

  if (localUserSecret.length !== UKYC_LOCAL_USER_SECRET_SIZE_BYTES) {
    throw new Error(
      `UKYC: stored local_user_secret has unexpected length ${localUserSecret.length}, expected ${UKYC_LOCAL_USER_SECRET_SIZE_BYTES}.`,
    );
  }

  return localUserSecret;
}

/**
 * Persists a freshly generated `local_user_secret` to Encrypted User Storage.
 *
 * @param store - The Encrypted User Storage adapter.
 * @param localUserSecret - The `local_user_secret` bytes to persist.
 * @param entropySourceId - Optional HD keyring entropy source id.
 */
async function persistLocalUserSecret(
  store: UkycLocalUserSecretStore,
  localUserSecret: Uint8Array,
  entropySourceId?: string,
): Promise<void> {
  await store.set(
    UKYC_LOCAL_USER_SECRET_PATH,
    bytesToBase64(localUserSecret),
    entropySourceId,
  );
}

/**
 * Creates the UKYC `local_user_secret` if it does not already exist, otherwise
 * loads the existing one. This is the single entry point used on UKYC
 * enrollment.
 *
 * The operation is idempotent and safe against concurrent callers in the same
 * session: repeated or parallel calls resolve to the same `local_user_secret`
 * and never generate more than one secret for a given entropy source.
 *
 * @param store - The Encrypted User Storage adapter.
 * @param entropySourceId - Optional HD keyring entropy source id, used to scope
 * the secret to a specific SRP in multi-SRP wallets. Defaults to the primary SRP.
 * @returns The `local_user_secret` bytes (existing or newly created).
 */
export async function getOrCreateLocalUserSecret(
  store: UkycLocalUserSecretStore,
  entropySourceId?: string,
): Promise<Uint8Array> {
  const cacheKey = entropySourceId ?? '';

  const pending = inFlightCreations.get(cacheKey);
  if (pending) {
    return pending;
  }

  const creation = (async (): Promise<Uint8Array> => {
    const existing = await loadLocalUserSecret(store, entropySourceId);
    if (existing) {
      return existing;
    }

    const localUserSecret = randomBytes(UKYC_LOCAL_USER_SECRET_SIZE_BYTES);
    await persistLocalUserSecret(store, localUserSecret, entropySourceId);

    // Re-read after persisting so that all callers converge on whatever value
    // actually landed in storage (defends against a competing write that may
    // have won the race, e.g. from another device syncing the same feature).
    return (
      (await loadLocalUserSecret(store, entropySourceId)) ?? localUserSecret
    );
  })();

  inFlightCreations.set(cacheKey, creation);

  try {
    return await creation;
  } finally {
    inFlightCreations.delete(cacheKey);
  }
}

/**
 * Whether a `local_user_secret` has already been enrolled for the given entropy
 * source.
 *
 * @param store - The Encrypted User Storage adapter.
 * @param entropySourceId - Optional HD keyring entropy source id.
 * @returns `true` if a `local_user_secret` exists in Encrypted User Storage.
 */
export async function hasLocalUserSecret(
  store: UkycLocalUserSecretStore,
  entropySourceId?: string,
): Promise<boolean> {
  return (await loadLocalUserSecret(store, entropySourceId)) !== null;
}
