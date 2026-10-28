import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';

import type { AuthApiRecoveryAuthProviderMessenger } from './auth-api-recovery-provider.js';
import { AuthApiRecoveryAuthProvider } from './auth-api-recovery-provider.js';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AuthApiRecoveryAuthProviderMessenger>,
  MessengerEvents<AuthApiRecoveryAuthProviderMessenger>
>;

type Approval = {
  approval: string;
  expiresIn: number;
  identifiers?: { type: string; namespace: string; value: string }[];
};

const APPROVAL = {
  approval: 'signed-approval',
  expiresIn: 300,
  identifiers: [
    {
      type: 'social',
      namespace: 'https://accounts.google.com',
      value: 'hash',
    },
    {
      type: 'passkey',
      namespace: 'metamask.io',
      value: 'AQID',
      verifier: {
        publicKey: { cose: 'AQID' },
        rpId: 'metamask.io',
        origins: ['https://metamask.io'],
      },
    },
  ],
};

/**
 * Builds a provider whose messenger is backed by mock AuthenticationController
 * actions.
 *
 * @param approval - The approval `requestMfaApproval` resolves with.
 * @returns The provider and the `requestMfaApproval` mock.
 */
function setup(approval: Approval = APPROVAL): {
  provider: AuthApiRecoveryAuthProvider;
  requestMfaApproval: ReturnType<typeof vi.fn>;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: AuthApiRecoveryAuthProviderMessenger = new Messenger({
    namespace: 'AuthApiRecoveryAuthProvider',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:requestMfaApproval',
    ],
    events: [],
    messenger,
  });
  rootMessenger.registerActionHandler(
    'AuthenticationController:getSessionProfile',
    async () => ({
      identifierId: 'srp-identifier',
      profileId: 'srp-profile',
      canonicalProfileId: 'profile-1',
      metaMetricsId: 'metametrics-id',
    }),
  );
  const requestMfaApproval = vi.fn().mockResolvedValue(approval);
  rootMessenger.registerActionHandler(
    'AuthenticationController:requestMfaApproval',
    requestMfaApproval,
  );
  return {
    provider: new AuthApiRecoveryAuthProvider({ messenger }),
    requestMfaApproval,
  };
}

describe('AuthApiRecoveryAuthProvider', () => {
  it('returns the canonical profile id', async () => {
    expect(await setup().provider.getAuthenticatedProfileId()).toBe(
      'profile-1',
    );
  });

  it.each([
    [undefined, false],
    [true, true],
  ])(
    'returns the approval and identifiers (requireTwoFactor: %s)',
    async (requireTwoFactor, requireVerification) => {
      const { provider, requestMfaApproval } = setup();
      expect(
        await provider.authorizeRecoveryRequest({
          requestHash: '0xrequest',
          audiences: ['cubist-audience'],
          requireTwoFactor,
        }),
      ).toStrictEqual({
        approval: APPROVAL.approval,
        identifiers: APPROVAL.identifiers,
      });
      expect(requestMfaApproval).toHaveBeenCalledWith({
        requestHash: '0xrequest',
        audiences: ['cubist-audience'],
        requireVerification,
        reason: { operation: 'mfa_recovery' },
      });
    },
  );

  it('returns no identifiers when Auth omits them', async () => {
    const { provider } = setup({ approval: 'signed-approval', expiresIn: 300 });
    expect(
      await provider.authorizeRecoveryRequest({
        requestHash: '0xrequest',
        audiences: ['cubist-audience'],
      }),
    ).toStrictEqual({ approval: 'signed-approval', identifiers: [] });
  });
});
