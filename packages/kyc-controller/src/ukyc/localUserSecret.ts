import { base64ToBytes, bytesToBase64 } from '@metamask/utils';
import { randomBytes } from '@noble/hashes/utils';

import type { KycControllerMessenger } from '../KycController.js';
import {
  UKYC_LOCAL_USER_SECRET_PATH,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
} from './constants.js';

/**
 * Logs elapsed milliseconds for a named `getOrCreateLocalUserSecret` stage.
 *
 * @param label - Stage name.
 * @param startedAt - `performance.now()` captured at the start of the stage.
 */
function logUkycTiming(label: string, startedAt: number): void {
  console.log(
    `[KycController] ${label}: ${(performance.now() - startedAt).toFixed(2)}ms`,
  );
}

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
 * Persistence is performed through {@link UkycLocalUserSecretStore}, which
 * calls `UserStorageController` over the injected messenger.
 */

/**
 * Messenger used by {@link UkycLocalUserSecretStore} to reach Encrypted User
 * Storage.
 */
export type UkycLocalUserSecretStoreMessenger = Pick<
  KycControllerMessenger,
  'call'
>;

/**
 * Encrypted User Storage adapter for the UKYC `local_user_secret`.
 */
export class UkycLocalUserSecretStore {
  readonly #messenger: UkycLocalUserSecretStoreMessenger;

  /**
   * @param messenger - Messenger that can call User Storage get/set actions.
   */
  constructor(messenger: UkycLocalUserSecretStoreMessenger) {
    this.#messenger = messenger;
  }

  /**
   * Reads the base64 string stored at `path`, or `null` if none exists.
   *
   * @param path - User-storage feature path.
   * @param entropySourceId - Optional HD keyring entropy source id.
   * @returns The stored value, or `null`.
   */
  async get(path: string, entropySourceId?: string): Promise<string | null> {
    return this.#messenger.call(
      'UserStorageController:performGetStorage',
      path as `${string}.${string}`,
      entropySourceId,
    );
  }

  /**
   * Writes the base64 string `value` at `path`.
   *
   * @param path - User-storage feature path.
   * @param value - Base64-encoded secret.
   * @param entropySourceId - Optional HD keyring entropy source id.
   */
  async set(
    path: string,
    value: string,
    entropySourceId?: string,
  ): Promise<void> {
    await this.#messenger.call(
      'UserStorageController:performSetStorage',
      path as `${string}.${string}`,
      value,
      entropySourceId,
    );
  }
}

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
  const totalStartedAt = performance.now();
  const cacheKey = entropySourceId ?? '';

  const pending = inFlightCreations.get(cacheKey);
  if (pending) {
    try {
      return await pending;
    } finally {
      logUkycTiming(
        '#getOrCreateLocalUserSecret awaitInFlight',
        totalStartedAt,
      );
      logUkycTiming('#getOrCreateLocalUserSecret total', totalStartedAt);
    }
  }

  const creation = (async (): Promise<Uint8Array> => {
    let stageStartedAt = performance.now();
    const existing = await loadLocalUserSecret(store, entropySourceId);
    logUkycTiming('#getOrCreateLocalUserSecret loadExisting', stageStartedAt);
    if (existing) {
      return existing;
    }

    stageStartedAt = performance.now();
    const localUserSecret = randomBytes(UKYC_LOCAL_USER_SECRET_SIZE_BYTES);
    logUkycTiming('#getOrCreateLocalUserSecret generate', stageStartedAt);

    stageStartedAt = performance.now();
    await persistLocalUserSecret(store, localUserSecret, entropySourceId);
    logUkycTiming('#getOrCreateLocalUserSecret persist', stageStartedAt);

    // Re-read after persisting so that all callers converge on whatever value
    // actually landed in storage (defends against a competing write that may
    // have won the race, e.g. from another device syncing the same feature).
    stageStartedAt = performance.now();
    const reloaded = await loadLocalUserSecret(store, entropySourceId);
    logUkycTiming(
      '#getOrCreateLocalUserSecret reloadAfterPersist',
      stageStartedAt,
    );
    return reloaded ?? localUserSecret;
  })();

  inFlightCreations.set(cacheKey, creation);

  try {
    return await creation;
  } finally {
    inFlightCreations.delete(cacheKey);
    logUkycTiming('#getOrCreateLocalUserSecret total', totalStartedAt);
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
