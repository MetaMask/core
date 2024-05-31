import type { IBaseAuth } from './authentication-jwt-bearer/types';
import encryption, { createSHA256Hash } from './encryption';
import type { Env } from './env';
import { getEnvUrls } from './env';
import { NotFoundError, UserStorageError, ValidationError } from './errors';

export const STORAGE_URL = (env: Env, feature: string, entry: string) =>
  `${getEnvUrls(env).userStorageApiUrl}/api/v1/userstorage/${feature}/${entry}`;

export type UserStorageConfig = {
  env: Env;
  auth: Pick<IBaseAuth, 'getAccessToken' | 'getUserProfile' | 'signMessage'>;
};

export type StorageOptions = {
  getStorageKey: () => Promise<string | null>;
  setStorageKey: (val: string) => Promise<void>;
};

export type UserStorageOptions = {
  storage?: StorageOptions;
};

type ErrorMessage = {
  message: string;
  error: string;
};

export class UserStorage {
  protected config: UserStorageConfig;

  protected options: UserStorageOptions;

  protected env: Env;

  constructor(config: UserStorageConfig, options: UserStorageOptions) {
    this.env = config.env;
    this.config = config;
    this.options = options;
  }

  async setItem(feature: string, key: string, value: string): Promise<void> {
    if (!feature.trim() || !key.trim()) {
      throw new ValidationError('feature or key cannot be empty strings');
    }
    await this.#upsertUserStorage(feature, key, value);
  }

  async getItem(feature: string, key: string): Promise<string> {
    if (!feature.trim() || !key.trim()) {
      throw new ValidationError('feature or key cannot be empty strings');
    }
    return this.#getUserStorage(feature, key);
  }

  async getStorageKey(): Promise<string> {
    const storageKey = await this.options.storage?.getStorageKey();
    if (storageKey) {
      return storageKey;
    }

    const userProfile = await this.config.auth.getUserProfile();
    const storageKeySignature = await this.config.auth.signMessage(
      `metamask:${userProfile.profileId}`,
    );
    const hashedStorageKeySignature = createSHA256Hash(storageKeySignature);
    await this.options.storage?.setStorageKey(hashedStorageKeySignature);
    return hashedStorageKeySignature;
  }

  async #upsertUserStorage(
    feature: string,
    key: string,
    data: string,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const storageKey = await this.getStorageKey();
      const encryptedData = encryption.encryptString(data, storageKey);
      const url = new URL(
        STORAGE_URL(this.env, feature, this.#createEntryKey(key, storageKey)),
      );

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
        `failed to upsert user storage for feature '${feature}' and key '${key}'. ${errorMessage}`,
      );
    }
  }

  async #getUserStorage(feature: string, key: string): Promise<string> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const storageKey = await this.getStorageKey();
      const url = new URL(
        STORAGE_URL(this.env, feature, this.#createEntryKey(key, storageKey)),
      );

      const response = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });

      if (response.status === 404) {
        throw new NotFoundError(
          `feature/key set not found for feature '${feature}' and key '${key}'.`,
        );
      }

      if (!response.ok) {
        const responseBody = (await response.json()) as ErrorMessage;
        throw new Error(
          `HTTP error message: ${responseBody.message}, error: ${responseBody.error}`,
        );
      }

      const { Data: encryptedData } = await response.json();
      return encryption.decryptString(encryptedData, storageKey);
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw e;
      }

      /* istanbul ignore next */
      const errorMessage =
        e instanceof Error ? e.message : JSON.stringify(e ?? '');

      throw new UserStorageError(
        `failed to get user storage for feature '${feature}' and key '${key}'. ${errorMessage}`,
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
