import log from 'loglevel';

import { USER_STORAGE_ENDPOINT } from '../constants';
import encryption from '../encryption';
import type { UserStorageEntryKeys } from '../schema';
import { createEntryPath } from '../schema';

export type GetUserStorageResponse = {
  HashedKey: string;
  Data: string;
};

export type UserStorageOptions = {
  bearerToken: string;
  entryKey: UserStorageEntryKeys;
  storageKey: string;
};

/**
 * Retrieves the user storage data for the given options.
 *
 * @param opts - The options for retrieving the user storage data.
 * @param opts.bearerToken - The bearer token for authentication.
 * @param opts.entryKey - The key of the user storage entry.
 * @param opts.storageKey - The key used for encryption and decryption of the user storage data.
 * @returns The decrypted user storage data, or null if the entry does not exist or an error occurs.
 */
export async function getUserStorage(
  opts: UserStorageOptions,
): Promise<string | null> {
  try {
    const path = createEntryPath(opts.entryKey, opts.storageKey);
    const url = new URL(`${USER_STORAGE_ENDPOINT}${path}`);

    const userStorageResponse = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.bearerToken}`,
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
 * Upserts user storage data.
 *
 * @param data - The data to be encrypted and stored.
 * @param opts - The options for storing the data.
 * @param opts.storageKey - The key used for encryption and decryption.
 * @param opts.bearerToken - The bearer token for authentication.
 * @param opts.entryKey - The key of the user storage entry.
 * @returns A promise that resolves when the data is successfully stored.
 * @throws {Error} If the data cannot be upserted.
 */
export async function upsertUserStorage(
  data: string,
  opts: UserStorageOptions,
): Promise<void> {
  const encryptedData = encryption.encryptString(data, opts.storageKey);
  const path = createEntryPath(opts.entryKey, opts.storageKey);
  const url = new URL(`${USER_STORAGE_ENDPOINT}${path}`);

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ data: encryptedData }),
  });

  if (!res.ok) {
    throw new Error('user-storage - unable to upsert data');
  }
}
