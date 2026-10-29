import type { Messenger } from '@metamask/messenger';
import type {
  AuthenticationControllerGetBearerTokenAction,
  AuthenticationControllerRefreshCanonicalProfileIdAction,
} from '@metamask/profile-sync-controller/auth';

import { MfaRecoveryError } from './errors.js';
import type { RecoveryLockProvider } from './types.js';

export type RecoveryRegistrationLockProviderMessenger = Messenger<
  'RecoveryRegistrationLockProvider',
  | AuthenticationControllerGetBearerTokenAction
  | AuthenticationControllerRefreshCanonicalProfileIdAction
>;

export type RecoveryRegistrationLockProviderOptions = {
  /** Recovery registration service origin. */
  baseUrl: string;
  messenger: RecoveryRegistrationLockProviderMessenger;
  fetch: typeof globalThis.fetch;
};

/**
 * Holds the recovery lease in the registration service, which keys it by the
 * bearer token's `sub`.
 */
export class RecoveryRegistrationLockProvider implements RecoveryLockProvider {
  readonly #baseUrl: string;

  readonly #messenger: RecoveryRegistrationLockProviderMessenger;

  readonly #fetch: typeof globalThis.fetch;

  /**
   * @param options - Provider options.
   * @param options.baseUrl - Recovery registration service origin.
   * @param options.messenger - Messenger with the AuthenticationController
   * actions.
   * @param options.fetch - Fetch implementation.
   */
  constructor(options: RecoveryRegistrationLockProviderOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/u, '');
    this.#messenger = options.messenger;
    this.#fetch = options.fetch;
  }

  /** @param lockId - Persisted lease ID; reuse it when retrying. */
  async acquire(lockId: string): Promise<void> {
    // Re-login so the bearer `sub` is the current canonical profile.
    await this.#messenger.call(
      'AuthenticationController:refreshCanonicalProfileId',
    );
    await this.#request('POST', '', { lock_id: lockId });
  }

  /** @param lockId - Held lease; an expired one is not recreated. */
  async renew(lockId: string): Promise<void> {
    await this.#request('PUT', `/${encodeURIComponent(lockId)}`);
  }

  /** @param lockId - Held lease. */
  async release(lockId: string): Promise<void> {
    await this.#request('DELETE', `/${encodeURIComponent(lockId)}`);
  }

  async #request(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: { lock_id: string },
  ): Promise<void> {
    const token = await this.#messenger.call(
      'AuthenticationController:getBearerToken',
    );
    const response = await this.#fetch(
      `${this.#baseUrl}/recovery/lock${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (!response.ok) {
      throw new MfaRecoveryError(
        `Recovery lock returned ${response.status}`,
        response.status === 409
          ? 'recovery_lock_conflict'
          : 'recovery_lock_unavailable',
      );
    }
  }
}
