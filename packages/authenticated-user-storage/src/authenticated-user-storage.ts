import type { Env } from './env';
import { getEnvUrls } from './env';
import { AuthenticatedUserStorageError } from './errors';
import type {
  AuthenticatedUserStorageConfig,
  ClientType,
  DelegationResponse,
  DelegationSubmission,
  NotificationPreferences,
} from './types';

export function authenticatedStorageUrl(env: Env): string {
  return `${getEnvUrls(env).userStorageApiUrl}/api/v1`;
}

type ErrorMessage = {
  message: string;
  error: string;
};

export class AuthenticatedUserStorage {
  readonly #env: Env;

  readonly #getAccessToken: () => Promise<string>;

  /**
   * Domain accessor for delegation operations.
   *
   * Delegations are immutable signed records scoped to the authenticated user.
   * Once a delegation is stored it cannot be modified -- it can only be revoked.
   */
  public readonly delegations: {
    /**
     * Returns all delegation records belonging to the authenticated user.
     *
     * @returns An array of delegation records, or an empty array if none exist.
     * @throws {AuthenticatedUserStorageError} If the request fails.
     */
    list: () => Promise<DelegationResponse[]>;
    /**
     * Stores a signed delegation record for the authenticated user.
     * Delegations are immutable; once stored they cannot be modified or replaced.
     *
     * @param submission - The signed delegation and its metadata.
     * @param submission.signedDelegation - The EIP-712 signed delegation object.
     * @param submission.metadata - Metadata including the delegation hash, chain, token, and type.
     * @param clientType - Optional client type header (`'extension'`, `'mobile'`, or `'portfolio'`).
     * @throws {AuthenticatedUserStorageError} If the request fails. A 409 status indicates the delegation already exists.
     */
    create: (
      submission: DelegationSubmission,
      clientType?: ClientType,
    ) => Promise<void>;
    /**
     * Revokes (deletes) a delegation record. The caller must own the delegation.
     *
     * @param delegationHash - The unique hash identifying the delegation (hex string, 0x-prefixed).
     * @throws {AuthenticatedUserStorageError} If the request fails or the delegation is not found (404).
     */
    revoke: (delegationHash: string) => Promise<void>;
  };

  /**
   * Domain accessor for user preference operations.
   *
   * Preferences are mutable structured records scoped to the authenticated user.
   */
  public readonly preferences: {
    /**
     * Returns the notification preferences for the authenticated user.
     *
     * @returns The notification preferences object, or `null` if none have been set.
     * @throws {AuthenticatedUserStorageError} If the request fails.
     */
    getNotifications: () => Promise<NotificationPreferences | null>;
    /**
     * Creates or updates the notification preferences for the authenticated user.
     * On first call the record is created; subsequent calls update it.
     *
     * @param prefs - The full notification preferences object.
     * @param clientType - Optional client type header (`'extension'`, `'mobile'`, or `'portfolio'`).
     * @throws {AuthenticatedUserStorageError} If the request fails.
     */
    putNotifications: (
      prefs: NotificationPreferences,
      clientType?: ClientType,
    ) => Promise<void>;
  };

  constructor(config: AuthenticatedUserStorageConfig) {
    this.#env = config.env;
    this.#getAccessToken = config.getAccessToken;

    this.delegations = {
      list: this.#listDelegations.bind(this),
      create: this.#createDelegation.bind(this),
      revoke: this.#revokeDelegation.bind(this),
    };

    this.preferences = {
      getNotifications: this.#getNotificationPreferences.bind(this),
      putNotifications: this.#putNotificationPreferences.bind(this),
    };
  }

  async #listDelegations(): Promise<DelegationResponse[]> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = `${authenticatedStorageUrl(this.#env)}/delegations`;

      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...headers },
      });

      if (!response.ok) {
        throw await this.#buildHttpError(response);
      }

      return (await response.json()) as DelegationResponse[];
    } catch (error) {
      throw this.#wrapError('list delegations', error);
    }
  }

  async #createDelegation(
    submission: DelegationSubmission,
    clientType?: ClientType,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = `${authenticatedStorageUrl(this.#env)}/delegations`;

      const optionalHeaders: Record<string, string> = {};
      if (clientType) {
        optionalHeaders['X-Client-Type'] = clientType;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...optionalHeaders,
        },
        body: JSON.stringify(submission),
      });

      if (!response.ok) {
        throw await this.#buildHttpError(response);
      }
    } catch (error) {
      throw this.#wrapError('create delegation', error);
    }
  }

  async #revokeDelegation(delegationHash: string): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = `${authenticatedStorageUrl(this.#env)}/delegations/${encodeURIComponent(delegationHash)}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...headers },
      });

      if (!response.ok) {
        throw await this.#buildHttpError(response);
      }
    } catch (error) {
      throw this.#wrapError('revoke delegation', error);
    }
  }

  async #getNotificationPreferences(): Promise<NotificationPreferences | null> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = `${authenticatedStorageUrl(this.#env)}/preferences/notifications`;

      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...headers },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw await this.#buildHttpError(response);
      }

      return (await response.json()) as NotificationPreferences;
    } catch (error) {
      throw this.#wrapError('get notification preferences', error);
    }
  }

  async #putNotificationPreferences(
    prefs: NotificationPreferences,
    clientType?: ClientType,
  ): Promise<void> {
    try {
      const headers = await this.#getAuthorizationHeader();
      const url = `${authenticatedStorageUrl(this.#env)}/preferences/notifications`;

      const optionalHeaders: Record<string, string> = {};
      if (clientType) {
        optionalHeaders['X-Client-Type'] = clientType;
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...optionalHeaders,
        },
        body: JSON.stringify(prefs),
      });

      if (!response.ok) {
        throw await this.#buildHttpError(response);
      }
    } catch (error) {
      throw this.#wrapError('put notification preferences', error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  async #getAuthorizationHeader(): Promise<{ Authorization: string }> {
    const accessToken = await this.#getAccessToken();
    return { Authorization: `Bearer ${accessToken}` };
  }

  async #buildHttpError(response: Response): Promise<Error> {
    const body: ErrorMessage = await response.json().catch(() => ({
      message: 'unknown',
      error: 'unknown',
    }));
    return new Error(
      `HTTP ${response.status} message: ${body.message}, error: ${body.error}`,
    );
  }

  #wrapError(
    operation: string,
    thrown: unknown,
  ): AuthenticatedUserStorageError {
    if (thrown instanceof AuthenticatedUserStorageError) {
      return thrown;
    }
    const message =
      thrown instanceof Error ? thrown.message : JSON.stringify(thrown ?? '');
    return new AuthenticatedUserStorageError(
      `failed to ${operation}. ${message}`,
    );
  }
}
