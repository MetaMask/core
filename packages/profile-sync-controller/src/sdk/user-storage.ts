import type { IBaseAuth } from './authentication-jwt-bearer/types';
import { NotFoundError, UserStorageError } from './errors';
import encryption, { createSHA256Hash } from '../shared/encryption';
import {
  SHARED_SALT,
  SRP_SPECIFIC_MESSAGE,
} from '../shared/encryption/constants';
import type { Env } from '../shared/env';
import { getEnvUrls } from '../shared/env';
import type {
  UserStorageGenericFeatureKey,
  UserStorageGenericFeatureName,
  UserStorageGenericPathWithFeatureAndKey,
  UserStorageGenericPathWithFeatureOnly,
} from '../shared/storage-schema';
import {
  PROFILE_STORAGE_KEY,
  USER_STORAGE_FEATURE_NAMES,
} from '../shared/storage-schema';
import { createEntryPath } from '../shared/storage-schema';
import type { NativeScrypt } from '../shared/types/encryption';

export const STORAGE_URL = (env: Env, entryPath: string) =>
  `${getEnvUrls(env).userStorageApiUrl}/api/v1/userstorage/${entryPath}`;

export type UserStorageConfig = {
  env: Env;
  auth: Pick<IBaseAuth, 'getAccessToken' | 'getUserProfile' | 'signMessage'>;
};

export type StorageOptions = {
  getStorageKey: (message: `metamask:${string}`) => Promise<string | null>;
  setStorageKey: (message: `metamask:${string}`, val: string) => Promise<void>;
};

export type UserStorageOptions = {
  storage?: StorageOptions;
};

export type GetUserStorageAllFeatureEntriesResponse = {
  HashedKey: string;

  Data: string;
}[];

export type UserStorageMethodOptions = {
  validateAgainstSchema?: boolean;
  nativeScryptCrypto?: NativeScrypt;
};

type ErrorMessage = {
  message: string;
  error: string;
};

export class UserStorage {
  protected config: UserStorageConfig;

  public options: UserStorageOptions;

  protected env: Env;

  constructor(config: UserStorageConfig, options: UserStorageOptions) {
    this.env = config.env;
    this.config = config;
    this.options = options;
  }

  async setItem(
    path: UserStorageGenericPathWithFeatureAndKey,
    value: string,
    options?: UserStorageMethodOptions,
  ): Promise<void> {
    await this.#upsertUserStorage(path, value, options);
  }

  async batchSetItems(
    path: UserStorageGenericFeatureName,
    values: [UserStorageGenericFeatureKey, string][],
    options?: UserStorageMethodOptions,
  ) {
    await this.#batchUpsertUserStorage(path, values, options);
  }

  async getItem(
    path: UserStorageGenericPathWithFeatureAndKey,
    options?: UserStorageMethodOptions,
  ): Promise<string | null> {
    return this.#getUserStorage(path, options);
  }

  async getAllFeatureItems(
    path: UserStorageGenericFeatureName,
    options?: UserStorageMethodOptions,
  ): Promise<string[] | null> {
    return this.#getUserStorageAllFeatureEntries(path, options);
  }

  async deleteItem(
    path: UserStorageGenericPathWithFeatureAndKey,
    options?: UserStorageMethodOptions,
  ): Promise<void> {
    return this.#deleteUserStorage(path, options);
  }

  async deleteAllFeatureItems(
    path: UserStorageGenericFeatureName,
  ): Promise<void> {
    return this.#deleteUserStorageAllFeatureEntries(path);
  }

  async batchDeleteItems(
    path: UserStorageGenericFeatureName,
    values: UserStorageGenericFeatureKey[],
  ) {
    return this.#batchDeleteUserStorage(path, values);
  }


  /**
   * Generates a storage_key specific to this SRP/identifier.
   * This will be used to encrypt/decrypt other auth related data or keys from user-storage, without dependence on auth
   * or profile IDs.
   *
   * @returns a storage_key specific to this SRP/identifier, encoded as a 64 character hex string without 0x prefix.
   */
  async getSRPStorageKey(): Promise<string> {
    const message = SRP_SPECIFIC_MESSAGE;

    let storageKey = await this.options.storage?.getStorageKey(message);
    if (storageKey) {
      return storageKey;
    }

    const storageKeySignature = await this.config.auth.signMessage(message);
    storageKey = createSHA256Hash(storageKeySignature);

    await this.options.storage?.setStorageKey(message, storageKey);
    return storageKey;
  }

  async getStorageKey(): Promise<string> {
    const userProfile = await this.config.auth.getUserProfile();
    const message = `metamask:${userProfile.profileId}` as const;

    // check cache
    let storageKey = await this.options.storage?.getStorageKey(message);
    if (storageKey) {
      return storageKey;
    }
    // if no cache, fetch raw entry and decrypt using SRP storage key
    const srpKey = await this.getSRPStorageKey();
    const profileStorageKeyPath = createEntryPath(
      `${USER_STORAGE_FEATURE_NAMES.keys}.${PROFILE_STORAGE_KEY}`,
      srpKey,
      { validateAgainstSchema: false },
    );
    const rawEntry = await this.#getRawEntry(profileStorageKeyPath);
    if (rawEntry) {
      try {
        storageKey = await encryption.decryptString(rawEntry, srpKey);
        await this.options.storage?.setStorageKey(message, storageKey);
        return storageKey;
      } catch {
        // nop. if decryption fails, proceed to generating a new storage key
      }
    }

    // if no raw entry, generate storage key and cache it
    // TBD: Don't derive storage keys, rather generate them randomly and then encrypt with the `getSRPStorageKey()`
    const storageKeySignature = await this.config.auth.signMessage(message);
    storageKey = createSHA256Hash(storageKeySignature);

    await this.options.storage?.setStorageKey(message, storageKey);

    try {
      await this.#upsertRawEntry(
        profileStorageKeyPath,
        await encryption.encryptString(storageKey, srpKey),
      );
    } catch {
      // nop. if upsert fails, the storage key will be derived again on next access
    }

    return storageKey;
  }

  async #upsertUserStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    data: string,
    options?: UserStorageMethodOptions,
  ): Promise<void> {
    try {
      const storageKey = await this.getStorageKey();
      const encryptedData = await encryption.encryptString(
        data,
        storageKey,
        options?.nativeScryptCrypto,
      );
      const entryPath = createEntryPath(path, storageKey, {
        validateAgainstSchema: Boolean(options?.validateAgainstSchema),
      });

      await this.#upsertRawEntry(entryPath, encryptedData);
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new UserStorageError(
        `failed to upsert user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #batchUpsertUserStorage(
    path: UserStorageGenericPathWithFeatureOnly,
    data: [string, string][],
    options?: UserStorageMethodOptions,
  ): Promise<void> {
    try {
      if (!data.length) {
        return;
      }

      const headers = await this.#getAuthorizationHeader();
      const storageKey = await this.getStorageKey();

      const encryptedData = await Promise.all(
        data.map(async (d) => {
          return [
            this.#createEntryKey(d[0], storageKey),
            await encryption.encryptString(
              d[1],
              storageKey,
              options?.nativeScryptCrypto,
            ),
          ];
        }),
      );

      const url = new URL(STORAGE_URL(this.env, path));

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ data: Object.fromEntries(encryptedData) }),
      });

      if (!response.ok) {
        const responseBody: ErrorMessage = await response.json().catch(() => ({
          message: 'unknown',
          error: 'unknown',
        }));
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new UserStorageError(
        `failed to batch upsert user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #getRawEntry(entryPath: `${string}/${string}`): Promise<string | null> {
    const headers = await this.#getAuthorizationHeader();
    const url = new URL(STORAGE_URL(this.env, entryPath));
    const response = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const responseBody = (await response.json()) as ErrorMessage;
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
      );
    }

    const userStorage = await response.json();
    return userStorage?.Data ?? null;
  }

  async #upsertRawEntry(
    entryPath: `${string}/${string}`,
    encryptedData: string,
  ) {
    const headers = await this.#getAuthorizationHeader();
    const url = new URL(STORAGE_URL(this.env, entryPath));

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ data: encryptedData }),
    });

    if (!response.ok) {
      const responseBody: ErrorMessage = await response.json().catch(() => ({
        message: 'unknown',
        error: 'unknown',
      }));
      throw new Error(
        `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
      );
    }
  }

  async #batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries(
    path: UserStorageGenericPathWithFeatureOnly,
    encryptedData: [string, string][],
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();

      const url = new URL(STORAGE_URL(this.env, path));

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ data: Object.fromEntries(encryptedData) }),
      });

      // istanbul ignore next
      if (!response.ok) {
        const responseBody: ErrorMessage = await response.json().catch(() => ({
          message: 'unknown',
          error: 'unknown',
        }));
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      // istanbul ignore next
      throw new UserStorageError(
        `failed to batch upsert user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #getUserStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    options?: UserStorageMethodOptions,
  ): Promise<string | null> {
    try {
      const storageKey = await this.getStorageKey();
      const entryPath = createEntryPath(path, storageKey, {
        validateAgainstSchema: Boolean(options?.validateAgainstSchema),
      });

      const encryptedData = await this.#getRawEntry(entryPath);

      if (!encryptedData) {
        return null;
      }

      const decryptedData = await encryption.decryptString(
        encryptedData,
        storageKey,
        options?.nativeScryptCrypto,
      );

      // Re-encrypt the entry if it was encrypted with a random salt
      const salt = encryption.getSalt(encryptedData);
      if (salt.toString() !== SHARED_SALT.toString()) {
        await this.#upsertUserStorage(path, decryptedData, options);
      }

      return decryptedData;
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new UserStorageError(
        `failed to get user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #getUserStorageAllFeatureEntries(
    path: UserStorageGenericPathWithFeatureOnly,
    options?: UserStorageMethodOptions,
  ): Promise<string[] | null> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const storageKey = await this.getStorageKey();

      const url = new URL(STORAGE_URL(this.env, path));

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }

      const userStorage: GetUserStorageAllFeatureEntriesResponse | null =
        await response.json();

      if (!Array.isArray(userStorage)) {
        return null;
      }

      const decryptedData: string[] = [];
      const reEncryptedEntries: [string, string][] = [];

      for (const entry of userStorage) {
        if (!entry.Data) {
          continue;
        }

        try {
          const data = await encryption.decryptString(
            entry.Data,
            storageKey,
            options?.nativeScryptCrypto,
          );
          decryptedData.push(data);

          // Re-encrypt the entry was encrypted with a random salt
          const salt = encryption.getSalt(entry.Data);
          if (salt.toString() !== SHARED_SALT.toString()) {
            reEncryptedEntries.push([
              entry.HashedKey,
              await encryption.encryptString(
                data,
                storageKey,
                options?.nativeScryptCrypto,
              ),
            ]);
          }
        } catch {
          // do nothing
        }
      }

      // Re-upload the re-encrypted entries
      if (reEncryptedEntries.length) {
        await this.#batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries(
          path,
          reEncryptedEntries,
        );
      }

      return decryptedData;
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new UserStorageError(
        `failed to get user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #deleteUserStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    options?: UserStorageMethodOptions,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const storageKey = await this.getStorageKey();
      const entryPath = createEntryPath(path, storageKey, {
        validateAgainstSchema: Boolean(options?.validateAgainstSchema),
      });

      const url = new URL(STORAGE_URL(this.env, entryPath));

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (response.status === 404) {
        throw new NotFoundError(
          `feature/key set not found for path '${path}'.`,
        );
      }

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw e;
      }

      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new UserStorageError(
        `failed to delete user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #deleteUserStorageAllFeatureEntries(
    path: UserStorageGenericPathWithFeatureOnly,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();

      const url = new URL(STORAGE_URL(this.env, path));

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (response.status === 404) {
        throw new NotFoundError(`feature not found for path '${path}'.`);
      }

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw e;
      }

      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new UserStorageError(
        `failed to delete user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  async #batchDeleteUserStorage(
    path: UserStorageGenericPathWithFeatureOnly,
    data: string[],
  ): Promise<void> {
    try {
      if (!data.length) {
        return;
      }

      const headers = await this.#getAuthorizationHeader();
      const storageKey = await this.getStorageKey();

      const encryptedData = await Promise.all(
        data.map(async (d) => this.#createEntryKey(d, storageKey)),
      );

      const url = new URL(STORAGE_URL(this.env, path));

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },

        body: JSON.stringify({ batch_delete: encryptedData }),
      });

      if (!response.ok) {
        const responseBody: ErrorMessage = await response.json().catch(() => ({
          message: 'unknown',
          error: 'unknown',
        }));
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }
    } catch (e) {
      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');
      throw new UserStorageError(
        `failed to batch delete user storage for path '${path}'. ${errorMessage}`,
      );
    }
  }

  #createEntryKey(key: string, storageKey: string): string {
    const hashedKey = createSHA256Hash(key + storageKey);
    return hashedKey;
  }

  async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
    const accessToken = await this.config.auth.getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }
}
