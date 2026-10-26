import { base64ToBytes, bytesToBase64 } from '@metamask/utils';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  UKYC_LOCAL_USER_SECRET_PATH,
  UKYC_LOCAL_USER_SECRET_SIZE_BYTES,
} from './constants.js';
import {
  getOrCreateLocalUserSecret,
  hasLocalUserSecret,
  loadLocalUserSecret,
  UkycLocalUserSecretStore,
} from './localUserSecret.js';

const SECRET_BYTES = new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(7);
const SECRET_BASE64 = bytesToBase64(SECRET_BYTES);

/**
 * Builds a stateful in-memory store adapter backed by a single value.
 *
 * @param initial - The initial stored base64 value.
 * @returns The store plus mock functions for `get` / `set`.
 */
function makeStore(initial: string | null = null): {
  store: UkycLocalUserSecretStore;
  get: Mock;
  set: Mock;
} {
  let value = initial;
  const get = vi.fn(async () => value);
  const set = vi.fn(async (_path: string, next: string) => {
    value = next;
  });
  return { store: { get, set }, get, set };
}

describe('UKYC localUserSecret', () => {
  describe('UkycLocalUserSecretStore', () => {
    it('delegates get and set to User Storage messenger actions', async () => {
      const call = vi
        .fn()
        .mockResolvedValueOnce('stored')
        .mockResolvedValueOnce(undefined);
      const store = new UkycLocalUserSecretStore({ call });

      expect(await store.get(UKYC_LOCAL_USER_SECRET_PATH, 'entropy-1')).toBe(
        'stored',
      );
      await store.set(UKYC_LOCAL_USER_SECRET_PATH, SECRET_BASE64, 'entropy-1');

      expect(call).toHaveBeenNthCalledWith(
        1,
        'UserStorageController:performGetStorage',
        UKYC_LOCAL_USER_SECRET_PATH,
        'entropy-1',
      );
      expect(call).toHaveBeenNthCalledWith(
        2,
        'UserStorageController:performSetStorage',
        UKYC_LOCAL_USER_SECRET_PATH,
        SECRET_BASE64,
        'entropy-1',
      );
    });
  });

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
      const { store, get, set } = makeStore(null);

      const result = await getOrCreateLocalUserSecret(store);

      expect(get).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
      const [path, persisted] = set.mock.calls[0] as [string, string];
      expect(path).toBe(UKYC_LOCAL_USER_SECRET_PATH);
      // The persisted value round-trips to the returned bytes.
      expect(result).toStrictEqual(base64ToBytes(persisted));
      expect(result).toHaveLength(UKYC_LOCAL_USER_SECRET_SIZE_BYTES);
    });

    it('returns the persisted secret without reading storage again', async () => {
      const competing = bytesToBase64(
        new Uint8Array(UKYC_LOCAL_USER_SECRET_SIZE_BYTES).fill(9),
      );
      // A second read would observe a different value. Creation must not
      // perform that read.
      const get = vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(competing);
      const set = vi.fn().mockResolvedValue(undefined);

      const result = await getOrCreateLocalUserSecret({ get, set });

      expect(get).toHaveBeenCalledTimes(1);
      const [, persisted] = set.mock.calls[0] as [string, string];
      expect(result).toStrictEqual(base64ToBytes(persisted));
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
