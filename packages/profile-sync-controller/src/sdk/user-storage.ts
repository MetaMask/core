import type { IBaseAuth } from './authentication-jwt-bearer/types';
import { NotFoundError, UserStorageError } from './errors';
import encryption, { createSHA256Hash } from '../shared/encryption';
import { SHARED_SALT } from '../shared/encryption/constants';
import type { Env } from '../shared/env';
import { getEnvUrls } from '../shared/env';
import type {
  UserStorageGenericFeatureKey,
  UserStorageGenericFeatureName,
  UserStorageGenericPathWithFeatureAndKey,
  UserStorageGenericPathWithFeatureOnly,
} from '../shared/storage-schema';
import { createEntryPath } from '../shared/storage-schema';
import type { NativeScrypt } from '../shared/types/encryption';

export const STORAGE_URL = (env: Env, encryptedPath: string) =>
  `${getEnvUrls(env).userStorageApiUrl}/api/v1/userstorage/${encryptedPath}`;

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
  entropySourceId?: string;
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

  async getStorageKey(entropySourceId?: string): Promise<string> {
    const userProfile = await this.config.auth.getUserProfile(entropySourceId);
    const message = `metamask:${userProfile.profileId}` as const;

    const storageKey = await this.options.storage?.getStorageKey(message);
    if (storageKey) {
      return storageKey;
    }

    const storageKeySignature = await this.config.auth.signMessage(
      message,
      entropySourceId,
    );
    const hashedStorageKeySignature = createSHA256Hash(storageKeySignature);
    await this.options.storage?.setStorageKey(
      message,
      hashedStorageKeySignature,
    );
    return hashedStorageKeySignature;
  }

  async #upsertUserStorage(
    path: UserStorageGenericPathWithFeatureAndKey,
    data: string,
    options?: UserStorageMethodOptions,
  ): Promise<void> {
    const entropySourceId = options?.entropySourceId;
    try {
      const headers = await this.#getAuthorizationHeader(entropySourceId);
      const storageKey = await this.getStorageKey(entropySourceId);
      const encryptedData = await encryption.encryptString(
        data,
        storageKey,
        options?.nativeScryptCrypto,
      );
      const encryptedPath = createEntryPath(path, storageKey, {
        validateAgainstSchema: Boolean(options?.validateAgainstSchema),
      });

      const url = new URL(STORAGE_URL(this.env, encryptedPath));

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
    const entropySourceId = options?.entropySourceId;
    try {
      if (!data.length) {
        return;
      }

      const headers = await this.#getAuthorizationHeader(entropySourceId);
      const storageKey = await this.getStorageKey(entropySourceId);

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

  async #batchUpsertUserStorageWithAlreadyHashedAndEncryptedEntries(
    path: UserStorageGenericPathWithFeatureOnly,
    encryptedData: [string, string][],
    entropySourceId?: string,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader(entropySourceId);

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
    const entropySourceId = options?.entropySourceId;
    try {
      const headers = await this.#getAuthorizationHeader(entropySourceId);
      const storageKey = await this.getStorageKey(entropySourceId);
      const encryptedPath = createEntryPath(path, storageKey, {
        validateAgainstSchema: Boolean(options?.validateAgainstSchema),
      });

      const url = new URL(STORAGE_URL(this.env, encryptedPath));

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
      const encryptedData = userStorage?.Data ?? null;

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
    const entropySourceId = options?.entropySourceId;
    try {
      const headers = await this.#getAuthorizationHeader(entropySourceId);
      const storageKey = await this.getStorageKey(entropySourceId);

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
          entropySourceId,
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
    const entropySourceId = options?.entropySourceId;
    try {
      const headers = await this.#getAuthorizationHeader(entropySourceId);
      const storageKey = await this.getStorageKey(entropySourceId);
      const encryptedPath = createEntryPath(path, storageKey, {
        validateAgainstSchema: Boolean(options?.validateAgainstSchema),
      });

      const url = new URL(STORAGE_URL(this.env, encryptedPath));

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
    entropySourceId?: string,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader(entropySourceId);

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
    keysToDelete: string[],
    entropySourceId?: string,
  ): Promise<void> {
    try {
      if (!keysToDelete.length) {
        return;
      }

      const headers = await this.#getAuthorizationHeader(entropySourceId);
      const storageKey = await this.getStorageKey(entropySourceId);

      const rawEntryKeys = keysToDelete.map((d) =>
        this.#createEntryKey(d, storageKey),
      );

      const url = new URL(STORAGE_URL(this.env, path));

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },

        body: JSON.stringify({ batch_delete: rawEntryKeys }),
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
    return createSHA256Hash(key + storageKey);
  }

  async #getAuthorizationHeader(
    entropySourceId?: string,
  ): Promise<{ Authorization: string }> {
    const accessToken = await this.config.auth.getAccessToken(entropySourceId);
    return { Authorization: `Bearer ${accessToken}` };
  }
}
