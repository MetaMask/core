import log from 'loglevel';

import { Env, getEnvUrls } from '../../sdk/env';
import encryption from './encryption';
import type {
  UserStoragePathWithFeatureAndKey,
  UserStoragePathWithFeatureOnly,
} from './schema';
import { createEntryPath } from './schema';

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
};

export type UserStorageOptions = UserStorageBaseOptions & {
  path: UserStoragePathWithFeatureAndKey;
};

export type UserStorageAllFeatureEntriesOptions = UserStorageBaseOptions & {
  path: UserStoragePathWithFeatureOnly;
};

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
    const { bearerToken, path, storageKey } = opts;

    const encryptedPath = createEntryPath(path, storageKey);
    const url = new URL(`${USER_STORAGE_ENDPOINT}${encryptedPath}`);

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

    const decryptedData = encryption.decryptString(
      encryptedData,
      opts.storageKey,
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
    const { bearerToken, path } = opts;
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

    const decryptedData = userStorage?.flatMap((entry) => {
      if (!entry.Data) {
        return [];
      }

      return encryption.decryptString(entry.Data, opts.storageKey);
    });

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
  const { bearerToken, path, storageKey } = opts;

  const encryptedData = encryption.encryptString(data, opts.storageKey);
  const encryptedPath = createEntryPath(path, storageKey);
  const url = new URL(`${USER_STORAGE_ENDPOINT}${encryptedPath}`);

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
