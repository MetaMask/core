import { base64ToBytes, bytesToBase64 } from '@metamask/utils';

import {
  UKYC_LOCAL_USER_SECRET_PATH,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
} from './constants.js';
import type { UkycLocalUserSecretStore } from './localUserSecret.js';
import {
  getOrCreateLocalUserSecret,
  hasLocalUserSecret,
  loadLocalUserSecret,
} from './localUserSecret.js';

const SECRET_BYTES = new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(7);
const SECRET_BASE64 = bytesToBase64(SECRET_BYTES);

/**
 * Builds a stateful in-memory store adapter backed by a single value.
 *
 * @param initial - The initial stored base64 value.
 * @returns The store plus jest spies for `get` / `set`.
 */
function makeStore(initial: string | null = null): {
  store: UkycLocalUserSecretStore;
  get: jest.Mock;
  set: jest.Mock;
} {
  let value = initial;
  const get = jest.fn(async () => value);
  const set = jest.fn(async (_path: string, next: string) => {
    value = next;
  });
  return { store: { get, set }, get, set };
}

describe('UKYC localUserSecret', () => {
  describe('loadLocalUserSecret', () => {
    it('returns null when no local_user_secret is stored', async () => {
      const { store, get } = makeStore(null);

      expect(await loadLocalUserSecret(store)).toBeNull();
      expect(get).toHaveBeenCalledWith(UKYC_LOCAL_USER_SECRET_PATH, undefined);
    });

    it('decodes and returns the stored local_user_secret', async () => {
      const { store } = makeStore(SECRET_BASE64);

      expect(await loadLocalUserSecret(store)).toStrictEqual(SECRET_BYTES);
    });

    it('forwards the entropy source id', async () => {
      const { store, get } = makeStore(SECRET_BASE64);

      await loadLocalUserSecret(store, 'entropy-1');

      expect(get).toHaveBeenCalledWith(
        UKYC_LOCAL_USER_SECRET_PATH,
        'entropy-1',
      );
    });

    it('throws when the stored local_user_secret has an unexpected length', async () => {
      const { store } = makeStore(bytesToBase64(new Uint8Array(16)));

      await expect(loadLocalUserSecret(store)).rejects.toThrow(
        'unexpected length',
      );
    });
  });

  describe('getOrCreateLocalUserSecret', () => {
    it('returns the existing local_user_secret without generating a new one', async () => {
      const { store, set } = makeStore(SECRET_BASE64);

      expect(await getOrCreateLocalUserSecret(store)).toStrictEqual(
        SECRET_BYTES,
      );
      expect(set).not.toHaveBeenCalled();
    });

    it('generates and persists a new local_user_secret on first enrollment', async () => {
      const { store, set } = makeStore(null);

      const result = await getOrCreateLocalUserSecret(store);

      expect(set).toHaveBeenCalledTimes(1);
      const [path, persisted] = set.mock.calls[0];
      expect(path).toBe(UKYC_LOCAL_USER_SECRET_PATH);
      // The persisted value round-trips to the returned bytes.
      expect(result).toStrictEqual(base64ToBytes(persisted));
      expect(result).toHaveLength(UKYC_LOCAL_USER_SECRET_SIZE_BYTES);
    });

    it('converges on a competing value that won the write race', async () => {
      const competing = new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(
        9,
      );
      // First read (existence check) misses; the re-read after our write sees a
      // value another writer landed first.
      const get = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(bytesToBase64(competing));
      const set = jest.fn().mockResolvedValue(undefined);

      const result = await getOrCreateLocalUserSecret({ get, set });

      expect(result).toStrictEqual(competing);
    });

    it('deduplicates concurrent create calls into a single generation', async () => {
      const { store, set } = makeStore(null);

      const [a, b] = await Promise.all([
        getOrCreateLocalUserSecret(store),
        getOrCreateLocalUserSecret(store),
      ]);

      expect(a).toStrictEqual(b);
      expect(set).toHaveBeenCalledTimes(1);
    });

    it('falls back to the generated secret if the re-read returns nothing', async () => {
      // `get` always misses, even after the write, so the helper falls back to
      // the value it just generated.
      const get = jest.fn().mockResolvedValue(null);
      const set = jest.fn().mockResolvedValue(undefined);

      const result = await getOrCreateLocalUserSecret({ get, set });

      expect(result).toHaveLength(UKYC_LOCAL_USER_SECRET_SIZE_BYTES);
    });
  });

  describe('hasLocalUserSecret', () => {
    it('returns true when a local_user_secret exists', async () => {
      const { store } = makeStore(SECRET_BASE64);

      expect(await hasLocalUserSecret(store)).toBe(true);
    });

    it('returns false when no local_user_secret exists', async () => {
      const { store } = makeStore(null);

      expect(await hasLocalUserSecret(store)).toBe(false);
    });
  });
});
