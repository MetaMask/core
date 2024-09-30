import log from 'loglevel';

import encryption, { createSHA256Hash } from '../../shared/encryption';
import { inspectCache } from '../../shared/encryption/cache';
import { Env, getEnvUrls } from '../../shared/env';
import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
  UserStoragePathWithKeyOnly,
} from '../../shared/storage-schema';
import { createEntryPath } from '../../shared/storage-schema';
import type { NativeScrypt } from '../../shared/types/encryption';

const ENV_URLS = getEnvUrls(Env.PRD);

export const USER_STORAGE_API: string = ENV_URLS.userStorageApiUrl;
export const USER_STORAGE_ENDPOINT = `${USER_STORAGE_API}/api/v1/userstorage`;

/**
 * This is the Server Response shape for a feature entry.
 */
export type GetUserStorageResponse = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  HashedKey: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Data: string;
};

export type GetUserStorageAllFeatureEntriesResponse = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  HashedKey: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  Data: string;
}[];

export type UserStorageBaseOptions = {
  bearerToken: string;
  storageKey: string;
  nativeScryptCrypto?: NativeScrypt;
};

export type UserStorageOptions = UserStorageBaseOptions & {
  path: UserStoragePathWithFeatureAndKey;
};

export type UserStorageAllFeatureEntriesOptions = UserStorageBaseOptions & {
  path: UserStoragePathWithFeatureOnly;
};

export type UserStorageBatchUpsertOptions = UserStorageAllFeatureEntriesOptions;

/**
 * User Storage Service - Get Storage Entry.
 *
 * @param opts - User Storage Options
 * @returns The storage entry, or null if fails to find entry
 */
export async function getUserStorage(
  opts: UserStorageOptions,
): Promise<string | null> {
  try {
    const { bearerToken, path, storageKey, nativeScryptCrypto } = opts;

    const encryptedPath = createEntryPath(path, storageKey);
    const url = new URL(`${USER_STORAGE_ENDPOINT}/${encryptedPath}`);

    const userStorageResponse = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    // Acceptable error - since indicates entry does not exist.
    if (userStorageResponse.status === 404) {
      return null;
    }

    if (userStorageResponse.status !== 200) {
      throw new Error('Unable to get User Storage');
    }

    const userStorage: GetUserStorageResponse | null =
      await userStorageResponse.json();
    const encryptedData = userStorage?.Data ?? null;

    if (!encryptedData) {
      return null;
    }

    const decryptedData = await encryption.decryptString(
      encryptedData,
      opts.storageKey,
      nativeScryptCrypto,
    );

    return decryptedData;
  } catch (e) {
    log.error('Failed to get user storage', e);
    return null;
  }
}

/**
 * User Storage Service - Get all storage entries for a specific feature.
 *
 * @param opts - User Storage Options
 * @returns The storage entry, or null if fails to find entry
 */
export async function getUserStorageAllFeatureEntries(
  opts: UserStorageAllFeatureEntriesOptions,
): Promise<string[] | null> {
  try {
    const { bearerToken, path, nativeScryptCrypto } = opts;
    const url = new URL(`${USER_STORAGE_ENDPOINT}/${path}`);

    const userStorageResponse = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
    });

    // Acceptable error - since indicates feature does not exist.
    if (userStorageResponse.status === 404) {
      return null;
    }

    if (userStorageResponse.status !== 200) {
      throw new Error('Unable to get User Storage');
    }

    const userStorage: GetUserStorageAllFeatureEntriesResponse | null =
      await userStorageResponse.json();

    if (!Array.isArray(userStorage)) {
      return null;
    }

    const decryptedData: (string | undefined)[] = [];

    for (const entry of userStorage) {
      if (!entry.Data) {
        continue;
      }

      try {
        decryptedData.push(
          await encryption.decryptString(
            entry.Data,
            opts.storageKey,
            nativeScryptCrypto,
          ),
        );
      } catch (e) {
        // Do nothing, failed to decrypt
      }
    }

    return decryptedData.filter((d): d is string => d !== undefined);
  } catch (e) {
    log.error('Failed to get user storage', e);
    return null;
  }
}

/**
 * User Storage Service - Set Storage Entry.
 *
 * @param data - data to store
 * @param opts - storage options
 */
export async function upsertUserStorage(
  data: string,
  opts: UserStorageOptions,
): Promise<void> {
  const { bearerToken, path, storageKey, nativeScryptCrypto } = opts;

  const encryptedData = await encryption.encryptString(
    data,
    opts.storageKey,
    nativeScryptCrypto,
  );
  const encryptedPath = createEntryPath(path, storageKey);
  const url = new URL(`${USER_STORAGE_ENDPOINT}/${encryptedPath}`);

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({ data: encryptedData }),
  });

  if (!res.ok) {
    throw new Error('user-storage - unable to upsert data');
  }
}

/**
 * User Storage Service - Set multiple storage entries for one specific feature.
 * You cannot use this method to set multiple features at once.
 *
 * @param data - data to store, in the form of an array of [entryKey, entryValue] pairs
 * @param opts - storage options
 */
export async function batchUpsertUserStorage(
  data: [UserStoragePathWithKeyOnly, string][],
  opts: UserStorageBatchUpsertOptions,
): Promise<void> {
  if (!data.length) {
    return;
  }

  const { bearerToken, path, storageKey, nativeScryptCrypto } = opts;

  const encryptedData: string[][] = [];

  for (const d of data) {
    encryptedData.push([
      createSHA256Hash(d[0] + storageKey),
      await encryption.encryptString(d[1], opts.storageKey, nativeScryptCrypto),
    ]);
  }
  const url = new URL(`${USER_STORAGE_ENDPOINT}/${path}`);

  const formattedData = Object.fromEntries(encryptedData);

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    body: JSON.stringify({ data: formattedData }),
  });

  if (!res.ok) {
    throw new Error('user-storage - unable to batch upsert data');
  }
}

const testBatchEncrypt = async (
  data: [UserStoragePathWithKeyOnly, string][],
  opts: UserStorageBatchUpsertOptions,
) => {
  const encryptedData: string[][] = [];
  const { storageKey, nativeScryptCrypto } = opts;
  for (const d of data) {
    encryptedData.push([
      createSHA256Hash(d[0] + storageKey),
      await encryption.encryptString(d[1], opts.storageKey, nativeScryptCrypto),
    ]);
  }

  console.log({ cachedKeys: inspectCache() });

  return encryptedData;
};

const testBatchDecrypt = async (
  data: string[][],
  opts: UserStorageBatchUpsertOptions,
) => {
  const decryptedData: string[] = [];
  const { nativeScryptCrypto } = opts;
  for (const d of data) {
    decryptedData.push(
      await encryption.decryptString(d[1], opts.storageKey, nativeScryptCrypto),
    );
  }

  console.log('done', decryptedData);

  return decryptedData;
};

const test = async () => {
  console.log('called');
  const opts = {
    path: 'test',
    bearerToken: '',
    storageKey: 'password',
  } as const;

  const encryptedEntries = await testBatchEncrypt(
    [
      ['test1', JSON.stringify({ a: 1 })],
      ['test2', JSON.stringify({ a: 1 })],
      ['test3', JSON.stringify({ a: 1 })],
      ['test4', JSON.stringify({ a: 1 })],
      ['test5', JSON.stringify({ a: 1 })],
    ],
    opts,
  );

  await testBatchDecrypt(encryptedEntries, opts);

  console.log('called again');
  const encryptedEntries2 = await testBatchEncrypt(
    [
      ['test1', JSON.stringify({ a: 1 })],
      ['test2', JSON.stringify({ a: 1 })],
      ['test3', JSON.stringify({ a: 1 })],
      ['test4', JSON.stringify({ a: 1 })],
      ['test5', JSON.stringify({ a: 1 })],
    ],
    opts,
  );

  await testBatchDecrypt(encryptedEntries2, opts);
};

// eslint-disable-next-line @typescript-eslint/no-floating-promises
test();
