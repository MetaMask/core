import { BaseAuth } from './authentication';
import encryption from './encryption';
import { createSHA256Hash } from './encryption'
import { MESSAGE_SIGNING_SNAP } from './messaging-signing-snap';
import { Env, getEnvUrls } from './env';
import { NotFoundError, SignInError, UserStorageError, ValidationError } from './errors';

export type UserStorageConfig = {
    env: Env;
    auth: BaseAuth;
};

export class UserStorage {
    protected storageKey: string | null = null;
    protected envUrls: { userStorageApiUrl: string };

    constructor(protected config: UserStorageConfig) { 
        this.envUrls = getEnvUrls(config.env);
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

    async #getStorageKey(): Promise<string> {
        const userProfile = await this.config.auth.getUserProfile()
        if (!userProfile) {
            throw new SignInError('unable to create storage key: user profile missing');
        }

        // TODO: how can we persist the storage key for the SiWE flow as it cannot be recalculated
        // NOTE: should be indexed per profile id
        if(!this.storageKey){ 
            const storageKeySignature = await this.config.auth.signMessage(`metamask:${userProfile.profileId}`);
            this.storageKey = storageKeySignature;
        }
        return createSHA256Hash(this.storageKey);
    }

    async #upsertUserStorage(feature: string, key: string, data: string): Promise<void> {
        try {
            const storageKey = await this.#getStorageKey();
            const encryptedData = encryption.encryptString(data, storageKey);
            const url = new URL(`${this.envUrls.userStorageApiUrl}/api/v1/userstorage/${this.#getEntryPath(feature, key, storageKey)}`);

            const headers = await this.#getAuthorizationHeader();

            const response = await fetch(url.toString(), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({ data: encryptedData }),
            });

            if (!response.ok) {
                const responseBody = await response.json();
                throw new Error(`HTTP error message: ${responseBody.message}, error: ${responseBody.error}`);
            }
        } catch (error) {
            throw new UserStorageError(`failed to upsert user storage for feature '${feature}' and key '${key}'. ${error}`);
        }
    }

    async #getUserStorage(feature: string, key: string): Promise<string> {
        try {
            const storageKey = await this.#getStorageKey();
            const url = new URL(`${this.envUrls.userStorageApiUrl}/api/v1/userstorage/${this.#getEntryPath(feature, key, storageKey)}`);
            const headers = await this.#getAuthorizationHeader();

            const response = await fetch(url.toString(), {
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
            });

            if (response.status === 404) {
                throw new NotFoundError(`feature/key set not found for feature '${feature}' and key '${key}'.`);
            }

            if (!response.ok) {
                const responseBody = await response.json()
                throw new Error(`HTTP error message: ${responseBody.message}, error: ${responseBody.error}`);
            }

            const { Data: encryptedData } = await response.json();
            return encryption.decryptString(encryptedData, storageKey);
        } catch (error) {
            if (error instanceof NotFoundError) {
                throw error;
            }

            throw new UserStorageError(`failed to get user storage for feature '${feature}' and key '${key}'. ${error}`);
        }
    }

    #getEntryPath(
        feature: string,
        key: string,
        storageKey: string,
      ): string {
        const hashedKey = createSHA256Hash(key + storageKey);
        return `${feature}/${hashedKey}`;
      }

    async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
        const accessToken = await this.config.auth.getAccessToken();
        if (!accessToken) {
            throw new SignInError('Access token is missing, unable to authenticate.');
        }
        return { Authorization: `Bearer ${accessToken.accessToken}` };
    }
}
