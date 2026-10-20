import { integer, is, min, type } from '@metamask/superstruct';

import { MfaRecoveryError } from './errors.js';
import type { RecoveryLockProvider } from './types.js';

const LOCK_RENEWAL_THRESHOLD_MS = 30_000;
const RecoveryLockResponseStruct = type({ expires_in: min(integer(), 1) });

export type RecoveryRegistrationLockProviderOptions = {
  /** Recovery registration service origin. */
  baseUrl: string;
  /** Returns a Hydra bearer for the same profile as the Auth provider. */
  getAccessToken: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
};

/** Acquires and maintains recovery leases through the registration service. */
export class RecoveryRegistrationLockProvider implements RecoveryLockProvider {
  readonly #options: RecoveryRegistrationLockProviderOptions;

  readonly #fetch: typeof globalThis.fetch;

  #lease: { lockId: string; expiresAt: number } | null = null;

  /** @param options - Registration URL and Hydra token source. */
  constructor(options: RecoveryRegistrationLockProviderOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** @param lockId - Persisted operation ID; reuse it when retrying acquisition. */
  async acquire(lockId: string): Promise<void> {
    await this.#request('POST', lockId);
  }

  /** @param lockId - Existing lease to renew; expired leases are not recreated. */
  async renew(lockId: string): Promise<void> {
    if (
      this.#lease?.lockId === lockId &&
      this.#lease.expiresAt - Date.now() > LOCK_RENEWAL_THRESHOLD_MS
    ) {
      return;
    }
    await this.#request('PUT', lockId);
  }

  /** @param lockId - Lease to release after confirmed completion. */
  async release(lockId: string): Promise<void> {
    await this.#request('DELETE', lockId);
  }

  async #request(
    method: 'POST' | 'PUT' | 'DELETE',
    lockId: string,
  ): Promise<void> {
    const startedAt = Date.now();
    // Late responses must not restore a released or replaced lease.
    const lease = { lockId, expiresAt: 0 };
    this.#lease = method === 'DELETE' ? null : lease;
    const token = await this.#options.getAccessToken();
    const path = method === 'POST' ? '' : `/${encodeURIComponent(lockId)}`;
    const response = await this.#fetch(
      `${this.#options.baseUrl.replace(/\/$/u, '')}/recovery/lock${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(method === 'POST'
          ? { body: JSON.stringify({ lock_id: lockId }) }
          : {}),
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
    if (method !== 'DELETE') {
      const result: unknown = await response.json();
      if (!is(result, RecoveryLockResponseStruct)) {
        throw new MfaRecoveryError(
          'Invalid recovery lock response',
          'recovery_lock_unavailable',
        );
      }
      lease.expiresAt = startedAt + result.expires_in * 1000;
    }
  }
}
