import type { Messenger } from '@metamask/messenger';
import type {
  AuthenticationControllerGetSessionProfileAction,
  AuthenticationControllerRequestMfaApprovalAction,
} from '@metamask/profile-sync-controller/auth';

import type { RecoveryApproval, RecoveryAuthProvider } from './types.js';

export type AuthApiRecoveryAuthProviderMessenger = Messenger<
  'AuthApiRecoveryAuthProvider',
  | AuthenticationControllerGetSessionProfileAction
  | AuthenticationControllerRequestMfaApprovalAction
>;

export type AuthApiRecoveryAuthProviderOptions = {
  messenger: AuthApiRecoveryAuthProviderMessenger;
};

/**
 * Requests Auth API approvals through `AuthenticationController`. A missing or
 * stale MFA verification rejects with its `StepUpRequiredError`.
 */
export class AuthApiRecoveryAuthProvider implements RecoveryAuthProvider {
  readonly #messenger: AuthApiRecoveryAuthProviderMessenger;

  /**
   * @param options - Provider options.
   * @param options.messenger - Messenger with the AuthenticationController
   * actions.
   */
  constructor({ messenger }: AuthApiRecoveryAuthProviderOptions) {
    this.#messenger = messenger;
  }

  /** @returns The canonical profile id, which approvals use as `sub`. */
  async getAuthenticatedProfileId(): Promise<string> {
    const { canonicalProfileId } = await this.#messenger.call(
      'AuthenticationController:getSessionProfile',
    );
    return canonicalProfileId;
  }

  /**
   * @param params - Request hash, audiences, and MFA requirement.
   * @returns The approval and current recovery identifiers.
   */
  async authorizeRecoveryRequest(
    params: Parameters<RecoveryAuthProvider['authorizeRecoveryRequest']>[0],
  ): Promise<RecoveryApproval> {
    const { approval, identifiers = [] } = await this.#messenger.call(
      'AuthenticationController:requestMfaApproval',
      {
        requestHash: params.requestHash,
        audiences: params.audiences,
        requireVerification: params.requireTwoFactor === true,
        reason: { operation: 'mfa_recovery' },
      },
    );
    return { approval, identifiers };
  }
}
