import log from 'loglevel';

import encryption, { createSHA256Hash } from '../../shared/encryption';
import { SHARED_SALT } from '../../shared/encryption/constants';
import { Env, getEnvUrls } from '../../shared/env';
import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
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
      throw new Error(
        `Unable to get User Storage - HTTP ${userStorageResponse.status}`,
      );
    }

    const userStorage: GetUserStorageResponse | null =
      await userStorageResponse.json();
    const encryptedData = userStorage?.Data ?? null;

    /* istanbul ignore if - this is an edge case where our endpoint returns invalid JSON payload */
    if (!encryptedData) {
      return null;
    }

    const decryptedData = await encryption.decryptString(
      encryptedData,
      opts.storageKey,
      nativeScryptCrypto,
    );

    // Re-encrypt and re-upload the entry if the salt is random
    const salt = encryption.getSalt(encryptedData);
    if (salt.toString() !== SHARED_SALT.toString()) {
      await upsertUserStorage(decryptedData, opts);
    }

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
      throw new Error(
        `Unable to get User Storage - HTTP ${userStorageResponse.status}`,
      );
    }

    const userStorage: GetUserStorageAllFeatureEntriesResponse | null =
      await userStorageResponse.json();

    if (!Array.isArray(userStorage)) {
      return null;
    }

    const decryptedData: string[] = [];
    const reEncryptedEntries: [string, string][] = [];

    for (const entry of userStorage) {
      /* istanbul ignore if - unreachable if statement, but kept as edge case */
      if (!entry.Data) {
        continue;
      }

      try {
        const data = await encryption.decryptString(
          entry.Data,
          opts.storageKey,
          nativeScryptCrypto,
        );
        decryptedData.push(data);

        // Re-encrypt the entry if the salt is different from the shared one
        const salt = encryption.getSalt(entry.Data);
        if (salt.toString() !== SHARED_SALT.toString()) {
          reEncryptedEntries.push([
            entry.HashedKey,
            await encryption.encryptString(
              data,
              opts.storageKey,
              nativeScryptCrypto,
            ),
          ]);
        }
      } catch {
        // do nothing
      }
    }

    // Re-upload the re-encrypted entries
    if (reEncryptedEntries.length) {
      await batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries(
        reEncryptedEntries,
        opts,
      );
    }

    return decryptedData;
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
    throw new Error(
      `user-storage - unable to upsert data - HTTP ${res.status}`,
    );
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
  data: [string, string][],
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
    throw new Error(
      `user-storage - unable to batch upsert data - HTTP ${res.status}`,
    );
  }
}

/**
 * User Storage Service - Set multiple storage entries for one specific feature.
 * You cannot use this method to set multiple features at once.
 *
 * @param encryptedData - data to store, in the form of an array of [hashedKey, encryptedData] pairs
 * @param opts - storage options
 */
export async function batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries(
  encryptedData: [string, string][],
  opts: UserStorageBatchUpsertOptions,
): Promise<void> {
  if (!encryptedData.length) {
    return;
  }

  const { bearerToken, path } = opts;

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
    throw new Error(
      `user-storage - unable to batch upsert data - HTTP ${res.status}`,
    );
  }
}

/**
 * User Storage Service - Delete Storage Entry.
 *
 * @param opts - User Storage Options
 */
export async function deleteUserStorage(
  opts: UserStorageOptions,
): Promise<void> {
  const { bearerToken, path, storageKey } = opts;
  const encryptedPath = createEntryPath(path, storageKey);
  const url = new URL(`${USER_STORAGE_ENDPOINT}/${encryptedPath}`);

  const userStorageResponse = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (userStorageResponse.status === 404) {
    throw new Error(
      `user-storage - feature/entry not found - HTTP ${userStorageResponse.status}`,
    );
  }

  if (!userStorageResponse.ok) {
    throw new Error(
      `user-storage - unable to delete data - HTTP ${userStorageResponse.status}`,
    );
  }
}

/**
 * User Storage Service - Delete multiple storage entries for one specific feature.
 * You cannot use this method to delete multiple features at once.
 *
 * @param data - data to delete, in the form of an array entryKey[]
 * @param opts - storage options
 */
export async function batchDeleteUserStorage(
  data: string[],
  opts: UserStorageBatchUpsertOptions,
): Promise<void> {
  if (!data.length) {
    return;
  }

  const { bearerToken, path, storageKey } = opts;

  const encryptedData: string[] = [];

  for (const d of data) {
    encryptedData.push(createSHA256Hash(d + storageKey));
  }

  const url = new URL(`${USER_STORAGE_ENDPOINT}/${path}`);

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    body: JSON.stringify({ batch_delete: encryptedData }),
  });

  if (!res.ok) {
    throw new Error(
      `user-storage - unable to batch delete data - HTTP ${res.status}`,
    );
  }
}

/**
 * User Storage Service - Delete all storage entries for a specific feature.
 *
 * @param opts - User Storage Options
 */
export async function deleteUserStorageAllFeatureEntries(
  opts: UserStorageAllFeatureEntriesOptions,
): Promise<void> {
  const { bearerToken, path } = opts;
  const url = new URL(`${USER_STORAGE_ENDPOINT}/${path}`);

  const userStorageResponse = await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken}`,
    },
  });

  if (userStorageResponse.status === 404) {
    throw new Error(
      `user-storage - feature not found - HTTP ${userStorageResponse.status}`,
    );
  }

  if (!userStorageResponse.ok) {
    throw new Error(
      `user-storage - unable to delete data - HTTP ${userStorageResponse.status}`,
    );
  }
}
