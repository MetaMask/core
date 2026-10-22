import { array, is, size, string, type } from '@metamask/superstruct';

import { MfaRecoveryError } from './errors.js';
import type { RecoveryApproval, RecoveryAuthProvider } from './types.js';

const RecoveryApprovalStruct = type({
  approval: size(string(), 1, Infinity),
  identifiers: array(
    type({ type: string(), namespace: string(), value: string() }),
  ),
});

export type AuthApiRecoveryAuthProviderOptions = {
  /** Auth API origin, without /api/v2. */
  baseUrl: string;
  /** Profile id for the authenticated session. */
  profileId: string;
  /** Returns a Hydra bearer; true requires recent MFA. */
  getAccessToken: (requireTwoFactor: boolean) => Promise<string>;
  fetch?: typeof globalThis.fetch;
};

/** Requests Auth API approvals using an authenticated Hydra session. */
export class AuthApiRecoveryAuthProvider implements RecoveryAuthProvider {
  readonly #options: AuthApiRecoveryAuthProviderOptions;

  readonly #fetch: typeof globalThis.fetch;

  /**
   * @param options - Auth API URL, profile, and Hydra token source.
   */
  constructor(options: AuthApiRecoveryAuthProviderOptions) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** @returns The authenticated profile id. */
  async getAuthenticatedProfileId(): Promise<string> {
    return this.#options.profileId;
  }

  /**
   * @param params - Request hash, audiences, and MFA requirement.
   * @returns The approval and current recovery identifiers.
   */
  async authorizeRecoveryRequest(
    params: Parameters<RecoveryAuthProvider['authorizeRecoveryRequest']>[0],
  ): Promise<RecoveryApproval> {
    const token = await this.#options.getAccessToken(
      params.requireTwoFactor === true,
    );
    const response = await this.#fetch(
      `${this.#options.baseUrl.replace(/\/$/u, '')}/api/v2/mfa/approvals`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_hash: params.requestHash,
          audiences: params.audiences,
        }),
      },
    );
    if (!response.ok) {
      throw new MfaRecoveryError(
        `Authentication API returned ${response.status}`,
        'auth_api_error',
      );
    }
    const result: unknown = await response.json();
    if (!is(result, RecoveryApprovalStruct)) {
      throw new MfaRecoveryError(
        'Invalid Auth approval',
        'auth_api_response_invalid',
      );
    }
    return { approval: result.approval, identifiers: result.identifiers };
  }
}
