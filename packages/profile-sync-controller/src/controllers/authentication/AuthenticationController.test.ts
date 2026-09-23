import { deriveStateFromMetadata } from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { KeyringTypes } from '@metamask/keyring-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { cleanAll as cleanAllNock } from 'nock';

import { arrangeAuthAPIs } from '../../sdk/__fixtures__/auth.js';
import type { LoginResponse } from '../../sdk/index.js';
import { EmailRequiredError, Platform } from '../../sdk/index.js';
import {
  MOCK_ACCESS_JWT,
  MOCK_MFA_CREDENTIALS_RESPONSE,
  MOCK_ELEVATED_ACCESS_TOKEN_RESPONSE,
  MOCK_MFA_ENROLL_EMAIL_RESPONSE,
  MOCK_MFA_VERIFY_COMPLETE_RESPONSE,
  MOCK_USER_PROFILE_LINEAGE_RESPONSE,
} from '../../sdk/mocks/auth.js';
import {
  getMessageSigningPublicKey,
  signMessageWithMessageSigningKey,
} from '../../shared/utils/message-signing.js';
import {
  mockEndpointMfaCredentials,
  mockEndpointMfaEnroll,
  mockEndpointMfaEnrollComplete,
  mockEndpointMfaVerify,
  mockEndpointMfaVerifyComplete,
  mockEndpointAccessToken,
} from './__fixtures__/mockServices.js';
import {
  AuthenticationController,
  defaultState,
  STEP_UP_SESSION_TTL_MS,
} from './AuthenticationController.js';
import type {
  AuthenticationControllerMessenger,
  AuthenticationControllerState,
  ProfileSignInInfo,
} from './AuthenticationController.js';
import {
  MOCK_LOGIN_RESPONSE,
  MOCK_OATH_TOKEN_RESPONSE,
  MOCK_PAIR_SOCIAL_IDENTIFIER_RESPONSE,
} from './mocks/mockResponses.js';

jest.mock('../../shared/utils/message-signing.js', () => ({
  MESSAGE_SIGNING_SNAP_ID: 'npm:@metamask/message-signing-snap',
  getMessageSigningPublicKey: jest.fn(async () => 'MOCK_PUBLIC_KEY'),
  signMessageWithMessageSigningKey: jest.fn(async () => 'MOCK_SIGNED_MESSAGE'),
  deriveMessageSigningPrivateKey: jest.fn(),
  deriveSip6PrivateKey: jest.fn(),
}));

const MOCK_HD_SEED = new Uint8Array(64).fill(1);

const MOCK_ENTROPY_SOURCE_IDS = [
  'MOCK_ENTROPY_SOURCE_ID',
  'MOCK_ENTROPY_SOURCE_ID2',
];

const MOCK_HD_KEYRINGS = MOCK_ENTROPY_SOURCE_IDS.map((id) => ({
  type: KeyringTypes.hd,
  accounts: [] as string[],
  metadata: { id, name: '' },
}));

const mockHdKeyrings = (
  ...ids: string[]
): {
  type: typeof KeyringTypes.hd;
  accounts: string[];
  metadata: { id: string; name: string };
}[] =>
  ids.map((id) => ({
    type: KeyringTypes.hd,
    accounts: [],
    metadata: { id, name: '' },
  }));

type SrpLoginRequestBody = {
  metametrics?: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- API field
    identifier_type?: string;
  };
  // eslint-disable-next-line @typescript-eslint/naming-convention -- API field
  raw_message?: string;
};

/**
 * Return mock state for the scenario where a user is signed in.
 *
 * @param options - Options.
 * @param options.expiresIn - The `expiresIn` token property.
 * @param options.needsProfilePairing - Whether SRP profile pairing is still
 * needed. Defaults to `false` (post-pair steady state).
 * @param options.needsSocialPairing - Whether social identifier pairing is
 * still needed. Defaults to `false` (post-pair steady state).
 * @returns Mock AuthenticationController state reflecting a signed in user.
 */
const mockSignedInState = ({
  expiresIn = Date.now() + 3600,
  needsProfilePairing = false,
  needsSocialPairing = false,
}: {
  expiresIn?: number;
  needsProfilePairing?: boolean;
  needsSocialPairing?: boolean;
} = {}): AuthenticationControllerState => {
  const srpSessionData = {} as Record<string, LoginResponse>;

  MOCK_ENTROPY_SOURCE_IDS.forEach((id) => {
    srpSessionData[id] = {
      token: {
        accessToken: MOCK_OATH_TOKEN_RESPONSE.access_token,
        expiresIn,
        obtainedAt: 0,
      },
      profile: {
        identifierId: MOCK_LOGIN_RESPONSE.profile.identifier_id,
        profileId: MOCK_LOGIN_RESPONSE.profile.profile_id,
        canonicalProfileId: MOCK_LOGIN_RESPONSE.profile.profile_id,
        metaMetricsId: MOCK_LOGIN_RESPONSE.profile.metametrics_id,
      },
    };
  });

  return {
    isSignedIn: true,
    enrolledCredentials: [],
    needsProfilePairing,
    needsSocialPairing,
    srpSessionData,
  };
};

const SOCIAL_PAIRING_ENABLED: { isSocialPairingEnabled: () => boolean } = {
  isSocialPairingEnabled: () => true,
};

const MOCK_SOCIAL_JWT = 'MOCK_SOCIAL_JWT';
const MOCK_SOCIAL_EMAIL = 'user@example.com';

type PairSocialIdentifierRequestBody = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- API field
  identifier_type?: string;
  // eslint-disable-next-line @typescript-eslint/naming-convention -- API field
  social_jwt?: string;
  email?: string;
};

describe('AuthenticationController', () => {
  describe('constructor', () => {
    it('should initialize with default state', () => {
      const metametrics = createMockAuthMetaMetrics();
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        metametrics,
      });

      expect(controller.state.isSignedIn).toBe(false);
      expect(controller.state.srpSessionData).toBeUndefined();
      expect(controller.state.needsProfilePairing).toBe(true);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('should initialize with override state', () => {
      const metametrics = createMockAuthMetaMetrics();
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        state: mockSignedInState(),
        metametrics,
      });

      expect(controller.state.isSignedIn).toBe(true);
      expect(controller.state.srpSessionData).toBeDefined();
    });

    it('should throw an error if metametrics is not provided', () => {
      expect(() => {
        // @ts-expect-error - testing invalid params
        new AuthenticationController({
          messenger: createMockAuthenticationMessenger().messenger,
        });
      }).toThrow('`metametrics` field is required');
    });
  });

  describe('performSignIn', () => {
    it('should create access token(s) and update state', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const { messenger, mockGetPublicKey, mockSignMessage } =
        createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      const result = await controller.performSignIn();
      // SRP enumeration uses KeyringController; native SIP-6 is used for
      // getPublicKey / signMessage during cold login.
      expect(mockGetPublicKey).toHaveBeenCalledTimes(2);
      // Primary and secondary tags produce distinct messages, so both are signed.
      expect(mockSignMessage).toHaveBeenCalledTimes(2);
      mockEndpoints.mockNonceUrl.done();
      mockEndpoints.mockSrpLoginUrl.done();
      mockEndpoints.mockOAuth2TokenUrl.done();
      expect(result).toStrictEqual([
        MOCK_OATH_TOKEN_RESPONSE.access_token,
        MOCK_OATH_TOKEN_RESPONSE.access_token,
      ]);

      expect(controller.state.isSignedIn).toBe(true);
      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        expect(controller.state.srpSessionData?.[id]).toBeDefined();
      }
    });

    it('leverages the signMessage cache', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const { messenger, mockSignMessage } =
        createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();
      controller.performSignOut();
      await controller.performSignIn();
      // Both tagged login messages are cached across sign-out / sign-in.
      expect(mockSignMessage).toHaveBeenCalledTimes(2);
      mockEndpoints.mockNonceUrl.done();
      mockEndpoints.mockSrpLoginUrl.done();
      mockEndpoints.mockOAuth2TokenUrl.done();
      expect(controller.state.isSignedIn).toBe(true);
      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        expect(controller.state.srpSessionData?.[id]).toBeDefined();
      }
    });

    it('signs primary and secondary login tags for multi-SRP wallets', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs();
      const { messenger, mockSignMessage } =
        createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      const signedMessages = mockSignMessage.mock.calls.map(
        (call) => call[0] as string,
      );
      expect(signedMessages).toStrictEqual(
        expect.arrayContaining([
          expect.stringMatching(/^metamask:[^:]+:[^:]+:primary$/u),
          expect.stringMatching(/^metamask:[^:]+:[^:]+:secondary$/u),
        ]),
      );
    });

    it('signs primary tag for the primary SRP even when a seedless vault exists', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs();
      const {
        messenger,
        mockSignMessage,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(mockSignMessage).toHaveBeenCalledWith(
        expect.stringMatching(/^metamask:[^:]+:[^:]+:primary$/u),
        MOCK_HD_SEED,
      );
    });

    it('sends GOOGLE identifier_type for primary SRP on a social vault', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const loginBodies: SrpLoginRequestBody[] = [];
      arrangeAuthAPIs({
        onSrpLoginBody: (body) => {
          loginBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as SrpLoginRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(loginBodies).toHaveLength(1);
      expect(loginBodies[0]?.metametrics?.identifier_type).toBe('GOOGLE');
      expect(loginBodies[0]?.raw_message).toMatch(
        /^metamask:[^:]+:[^:]+:primary$/u,
      );
    });

    it('sends SRP identifier_type for secondary SRPs in a social vault', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const loginBodies: SrpLoginRequestBody[] = [];
      arrangeAuthAPIs({
        onSrpLoginBody: (body) => {
          loginBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as SrpLoginRequestBody,
          );
        },
      });
      const { messenger, mockSeedlessOnboardingGetState } =
        createMockAuthenticationMessenger();
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'telegram',
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(loginBodies).toHaveLength(2);
      const byTag = Object.fromEntries(
        loginBodies.map((body) => {
          const tag = body.raw_message?.split(':').at(-1);
          return [tag, body.metametrics?.identifier_type];
        }),
      );
      expect(byTag).toStrictEqual({
        primary: 'TELEGRAM',
        secondary: 'SRP',
      });
    });

    it.each([
      {
        name: 'APPLE for apple social vault',
        seedlessState: { vault: 'encrypted', authConnection: 'apple' },
        expectedIdentifierType: 'APPLE',
      },
      {
        name: 'SRP when social vault has unrecognized authConnection',
        seedlessState: { vault: 'encrypted', authConnection: 'unknown' },
        expectedIdentifierType: 'SRP',
      },
      {
        name: 'SRP when seedless vault is absent',
        seedlessState: { vault: undefined, authConnection: 'google' },
        expectedIdentifierType: 'SRP',
      },
    ])('sends $name', async ({ seedlessState, expectedIdentifierType }) => {
      const metametrics = createMockAuthMetaMetrics();
      const loginBodies: SrpLoginRequestBody[] = [];
      arrangeAuthAPIs({
        onSrpLoginBody: (body) => {
          loginBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as SrpLoginRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue(seedlessState);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(loginBodies).toHaveLength(1);
      expect(loginBodies[0]?.metametrics?.identifier_type).toBe(
        expectedIdentifierType,
      );
    });

    it('sends SRP identifier_type when SeedlessOnboarding getState fails', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const loginBodies: SrpLoginRequestBody[] = [];
      arrangeAuthAPIs({
        onSrpLoginBody: (body) => {
          loginBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as SrpLoginRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockImplementation(() => {
        throw new Error('SeedlessOnboardingController unavailable');
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(loginBodies).toHaveLength(1);
      expect(loginBodies[0]?.metametrics?.identifier_type).toBe('SRP');
    });

    it('should error when nonce endpoint fails', async () => {
      expect(true).toBe(true);
      await testAndAssertFailingEndpoints('nonce');
    });

    it('should error when login endpoint fails', async () => {
      expect(true).toBe(true);
      await testAndAssertFailingEndpoints('login');
    });

    it('should error when tokens endpoint fails', async () => {
      expect(true).toBe(true);
      await testAndAssertFailingEndpoints('token');
    });

    // When the wallet is locked, we are unable to call the snap
    it('should error when wallet is locked', async () => {
      const { messenger, baseMessenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      arrangeAuthAPIs();
      const metametrics = createMockAuthMetaMetrics();

      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: MOCK_HD_KEYRINGS,
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      baseMessenger.publish('KeyringController:lock');
      await expect(controller.performSignIn()).rejects.toThrow(
        expect.any(Error),
      );

      baseMessenger.publish('KeyringController:unlock');
      expect(await controller.performSignIn()).toStrictEqual([
        MOCK_OATH_TOKEN_RESPONSE.access_token,
        MOCK_OATH_TOKEN_RESPONSE.access_token,
      ]);
    });

    /**
     * Jest Test & Assert Utility - for testing and asserting endpoint failures
     *
     * @param endpointFail - example endpoints to fail
     */
    async function testAndAssertFailingEndpoints(
      endpointFail: 'nonce' | 'login' | 'token',
    ): Promise<void> {
      const mockEndpoints = mockAuthenticationFlowEndpoints({
        endpointFail,
      });
      const { messenger } = createMockAuthenticationMessenger();
      const metametrics = createMockAuthMetaMetrics();
      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await expect(controller.performSignIn()).rejects.toThrow(
        expect.any(Error),
      );
      expect(controller.state.isSignedIn).toBe(false);

      const endpointsCalled = [
        mockEndpoints.mockNonceUrl.isDone(),
        mockEndpoints.mockSrpLoginUrl.isDone(),
        mockEndpoints.mockOAuth2TokenUrl.isDone(),
      ];
      if (endpointFail === 'nonce') {
        expect(endpointsCalled).toStrictEqual([true, false, false]);
      }

      if (endpointFail === 'login') {
        expect(endpointsCalled).toStrictEqual([true, true, false]);
      }

      if (endpointFail === 'token') {
        expect(endpointsCalled).toStrictEqual([true, true, true]);
      }
    }
  });

  describe('pairing (within performSignIn)', () => {
    it('does NOT call pairProfiles when only 1 SRP exists, but clears needsProfilePairing', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings('SINGLE_ENTROPY_SOURCE_ID'),
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairProfilesUrl.isDone()).toBe(false);
      // Clear the gate so the client `useAutoSignIn` hook doesn't loop.
      expect(controller.state.needsProfilePairing).toBe(false);
    });

    it('pairs and clears needsProfilePairing when 2+ SRPs exist', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const { messenger } = createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairProfilesUrl.isDone()).toBe(true);
      expect(controller.state.needsProfilePairing).toBe(false);
    });

    it('does NOT throw out of performSignIn when pairProfiles fails, leaves needsProfilePairing=true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairProfiles: { status: 500 },
      });
      const { messenger } = createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      expect(await controller.performSignIn()).toBeDefined();
      // Flag stays `true` so the next gate fire retries the pair.
      expect(controller.state.needsProfilePairing).toBe(true);
    });

    it('propagates the canonical profile ID to all srpSessionData entries', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairProfiles: {
          status: 200,
          body: {
            profile: {
              identifier_id: 'id-1',
              metametrics_id: 'mm-1',
              profile_id: 'new-canonical',
            },
            profile_aliases: [
              {
                alias_profile_id: 'p1',
                canonical_profile_id: 'new-canonical',
                identifier_ids: [{ id: 'h1', type: 'SRP' }],
              },
              {
                alias_profile_id: 'p2',
                canonical_profile_id: 'new-canonical',
                identifier_ids: [{ id: 'h2', type: 'SRP' }],
              },
            ],
          },
        },
      });
      const { messenger } = createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      await controller.performSignIn();

      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        expect(
          controller.state.srpSessionData?.[id]?.profile.canonicalProfileId,
        ).toBe('new-canonical');
      }
    });

    it('emits profileSignIn when the canonical profile ID changes after pairing', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairProfiles: {
          status: 200,
          body: {
            profile: {
              identifier_id: 'id-1',
              metametrics_id: 'mm-1',
              // Intentionally different from the pre-seeded canonical.
              profile_id: 'new-canonical-after-pairing',
            },
            profile_aliases: [
              {
                alias_profile_id: 'p1',
                canonical_profile_id: 'new-canonical-after-pairing',
                identifier_ids: [{ id: 'h1', type: 'SRP' }],
              },
            ],
          },
        },
      });
      const { messenger, baseMessenger } = createMockAuthenticationMessenger();

      const eventPayloads: ProfileSignInInfo[] = [];
      baseMessenger.subscribe(
        'AuthenticationController:profileSignIn',
        (info: ProfileSignInInfo) => {
          eventPayloads.push(info);
        },
      );

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      await controller.performSignIn();

      expect(eventPayloads).toHaveLength(1);
      expect(eventPayloads[0].profileId).toBe('new-canonical-after-pairing');
      expect(eventPayloads[0].profileIdChanged).toBe(true);
    });

    it('emits profileSignIn with profileIdChanged=false when canonical is unchanged but aliases are returned', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairProfiles: {
          status: 200,
          body: {
            profile: {
              identifier_id: 'id-1',
              metametrics_id: 'mm-1',
              profile_id: MOCK_LOGIN_RESPONSE.profile.profile_id,
            },
            profile_aliases: [
              {
                alias_profile_id: 'p1',
                canonical_profile_id: MOCK_LOGIN_RESPONSE.profile.profile_id,
                identifier_ids: [{ id: 'h1', type: 'SRP' }],
              },
            ],
          },
        },
      });
      const { messenger, baseMessenger } = createMockAuthenticationMessenger();

      const eventPayloads: ProfileSignInInfo[] = [];
      baseMessenger.subscribe(
        'AuthenticationController:profileSignIn',
        (info: ProfileSignInInfo) => {
          eventPayloads.push(info);
        },
      );

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      await controller.performSignIn();

      expect(eventPayloads).toHaveLength(1);
      expect(eventPayloads[0].profileIdChanged).toBe(false);
      expect(eventPayloads[0].profileAliases).toHaveLength(1);
    });

    it('does not emit profileSignIn when canonical is unchanged and no aliases are returned', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairProfiles: {
          status: 200,
          body: {
            profile: {
              identifier_id: 'id-1',
              metametrics_id: 'mm-1',
              profile_id: MOCK_LOGIN_RESPONSE.profile.profile_id,
            },
            profile_aliases: [],
          },
        },
      });
      const { messenger, baseMessenger } = createMockAuthenticationMessenger();

      const eventPayloads: ProfileSignInInfo[] = [];
      baseMessenger.subscribe(
        'AuthenticationController:profileSignIn',
        (info: ProfileSignInInfo) => {
          eventPayloads.push(info);
        },
      );

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      await controller.performSignIn();

      expect(eventPayloads).toHaveLength(0);
    });

    it('preserves the original per-SRP profileId after pairing', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairProfiles: {
          status: 200,
          body: {
            profile: {
              identifier_id: 'id-1',
              metametrics_id: 'mm-1',
              profile_id: 'canonical-id',
            },
            profile_aliases: [
              {
                alias_profile_id: 'original-1',
                canonical_profile_id: 'canonical-id',
                identifier_ids: [{ id: 'h1', type: 'SRP' }],
              },
              {
                alias_profile_id: 'original-2',
                canonical_profile_id: 'canonical-id',
                identifier_ids: [{ id: 'h2', type: 'SRP' }],
              },
            ],
          },
        },
      });
      const { messenger } = createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      await controller.performSignIn();

      // Pairing only updates `canonicalProfileId`; `profileId` is preserved.
      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        expect(controller.state.srpSessionData?.[id]?.profile.profileId).toBe(
          MOCK_LOGIN_RESPONSE.profile.profile_id,
        );
      }
    });

    it('stores paired identifiers from the pair response on the primary SRP session only', async () => {
      const pairedIdentifierIds = [
        { id: 'h1', type: 'SRP' },
        { id: 'id-1', type: 'SRP' },
      ];
      arrangeAuthAPIs({
        mockPairProfiles: {
          status: 200,
          body: {
            profile: {
              identifier_id: 'id-1',
              metametrics_id: 'mm-1',
              profile_id: MOCK_LOGIN_RESPONSE.profile.profile_id,
              paired_identifier_ids: pairedIdentifierIds,
            },
            profile_aliases: [],
          },
        },
      });
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics: createMockAuthMetaMetrics(),
      });

      await controller.performSignIn();

      const [primaryId, secondaryId] = MOCK_ENTROPY_SOURCE_IDS;
      expect(
        controller.state.srpSessionData?.[primaryId]?.profile
          .pairedIdentifierIds,
      ).toStrictEqual(pairedIdentifierIds);
      expect(
        controller.state.srpSessionData?.[secondaryId]?.profile,
      ).not.toHaveProperty('pairedIdentifierIds');
    });

    it('stores paired identifiers returned by login on the SRP session', async () => {
      const pairedIdentifierIds = [
        { id: 'id-google', type: 'GOOGLE' },
        { id: MOCK_LOGIN_RESPONSE.profile.identifier_id, type: 'SRP' },
      ];
      arrangeAuthAPIs({
        mockSrpLoginUrl: {
          status: 200,
          body: {
            ...MOCK_LOGIN_RESPONSE,
            profile: {
              ...MOCK_LOGIN_RESPONSE.profile,
              paired_identifier_ids: pairedIdentifierIds,
            },
          },
        },
      });
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      const controller = new AuthenticationController({
        messenger,
        metametrics: createMockAuthMetaMetrics(),
      });

      await controller.performSignIn();

      expect(
        controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]]?.profile
          .pairedIdentifierIds,
      ).toStrictEqual(pairedIdentifierIds);
    });

    it('epoch check: a concurrent requestProfilePairing during multi-SRP performSignIn keeps the gate set', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs();
      const { messenger } = createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      // `performSignIn` snapshots `#profilePairingRequestEpoch` synchronously
      // before its first await. Calling `requestProfilePairing()` right after
      // (still in the same tick, but after the snapshot) bumps the epoch — so
      // the post-pair gate clear must be skipped and the flag must stay true.
      const performSignInPromise = controller.performSignIn();
      controller.requestProfilePairing();
      await performSignInPromise;

      expect(controller.state.needsProfilePairing).toBe(true);
    });

    it('epoch check: a concurrent requestProfilePairing during single-SRP performSignIn keeps the gate set', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings('SINGLE_ENTROPY_SOURCE_ID'),
      });

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      const performSignInPromise = controller.performSignIn();
      controller.requestProfilePairing();
      await performSignInPromise;

      expect(controller.state.needsProfilePairing).toBe(true);
    });

    it('epoch check: a requestProfilePairing fired from inside #doPair (during primary entropy ID resolve) keeps the gate set', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      // Keyring reads during this performSignIn:
      //  1. SRP enumeration at the start of `performSignIn`
      //  2. `#doPair` → `#getCanonicalProfileId` → `#getPrimaryEntropySourceId`
      // Fire the rearm on (2) so we cover the in-#doPair race window
      // (e.g. user adds an SRP while pairing is in flight), not enumeration.
      let keyringReads = 0;
      mockKeyringControllerGetState.mockImplementation(() => {
        keyringReads += 1;
        if (keyringReads === 2) {
          controller.requestProfilePairing();
        }
        return { isUnlocked: true, keyrings: MOCK_HD_KEYRINGS };
      });

      await controller.performSignIn();

      expect(keyringReads).toBeGreaterThanOrEqual(2);
      expect(controller.state.needsProfilePairing).toBe(true);
    });
  });

  describe('social pairing', () => {
    it('does not call pair/identifier when isSocialPairingEnabled is false, and leaves needsSocialPairing true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('does not call pair/identifier when needsSocialPairing is already false', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
        state: mockSignedInState({ needsSocialPairing: false }),
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('pairs a Google vault with the correct body, then clears needsSocialPairing', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const pairBodies: PairSocialIdentifierRequestBody[] = [];
      const mockEndpoints = arrangeAuthAPIs({
        onPairSocialIdentifierBody: (body) => {
          pairBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as PairSocialIdentifierRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      const accessTokens = await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(true);
      expect(pairBodies).toHaveLength(1);
      expect(pairBodies[0]).toStrictEqual({
        identifier_type: 'GOOGLE',
        social_jwt: MOCK_SOCIAL_JWT,
        email: MOCK_SOCIAL_EMAIL,
      });
      expect(controller.state.needsSocialPairing).toBe(false);
      expect(accessTokens[0]).toBe(MOCK_OATH_TOKEN_RESPONSE.access_token);
    });

    it('stores paired identifiers from the pair/identifier response on the primary SRP session', async () => {
      const pairedIdentifierIds = [
        { id: 'id-google', type: 'GOOGLE' },
        { id: MOCK_LOGIN_RESPONSE.profile.identifier_id, type: 'SRP' },
      ];
      arrangeAuthAPIs({
        mockPairSocialIdentifier: {
          status: 200,
          body: {
            ...MOCK_PAIR_SOCIAL_IDENTIFIER_RESPONSE,
            profile: {
              ...MOCK_PAIR_SOCIAL_IDENTIFIER_RESPONSE.profile,
              paired_identifier_ids: pairedIdentifierIds,
            },
          },
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics: createMockAuthMetaMetrics(),
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(
        controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]]?.profile
          .pairedIdentifierIds,
      ).toStrictEqual(pairedIdentifierIds);
    });

    it('treats undefined needsSocialPairing as still needed', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
        state: { ...mockSignedInState(), needsSocialPairing: undefined },
      });

      expect(controller.state.needsSocialPairing).toBeUndefined();
      await controller.performSignIn();
      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(true);
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('omits email from the body for Apple when socialLoginEmail is missing', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const pairBodies: PairSocialIdentifierRequestBody[] = [];
      arrangeAuthAPIs({
        onPairSocialIdentifierBody: (body) => {
          pairBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as PairSocialIdentifierRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'apple',
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(pairBodies).toHaveLength(1);
      expect(pairBodies[0]).toStrictEqual({
        identifier_type: 'APPLE',
        social_jwt: MOCK_SOCIAL_JWT,
      });
      expect(pairBodies[0]).not.toHaveProperty('email');
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('includes email in the body for Apple when socialLoginEmail is present', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const pairBodies: PairSocialIdentifierRequestBody[] = [];
      arrangeAuthAPIs({
        onPairSocialIdentifierBody: (body) => {
          pairBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as PairSocialIdentifierRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'apple',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(pairBodies[0]).toStrictEqual({
        identifier_type: 'APPLE',
        social_jwt: MOCK_SOCIAL_JWT,
        email: MOCK_SOCIAL_EMAIL,
      });
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('skips Google pairing when email is missing and leaves needsSocialPairing true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(mockSeedlessOnboardingGetAccessToken).not.toHaveBeenCalled();
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('clears needsSocialPairing without calling pair/identifier when the user never logged in with a social provider', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(mockSeedlessOnboardingGetAccessToken).not.toHaveBeenCalled();
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('does not clear needsSocialPairing when authConnection is set but the vault is not written yet', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: undefined,
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(mockSeedlessOnboardingGetAccessToken).not.toHaveBeenCalled();
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('pairs Telegram without email even when socialLoginEmail is a display name', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const pairBodies: PairSocialIdentifierRequestBody[] = [];
      const mockEndpoints = arrangeAuthAPIs({
        onPairSocialIdentifierBody: (body) => {
          pairBodies.push(
            (typeof body === 'string'
              ? JSON.parse(body)
              : body) as PairSocialIdentifierRequestBody,
          );
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'telegram',
        socialLoginEmail: 'Telegram 12345',
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(true);
      expect(pairBodies).toHaveLength(1);
      expect(pairBodies[0]).toStrictEqual({
        identifier_type: 'TELEGRAM',
        social_jwt: MOCK_SOCIAL_JWT,
      });
      expect(pairBodies[0]).not.toHaveProperty('email');
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it.each([500, 429])(
      'does not throw out of performSignIn when pair/identifier returns %s, and leaves needsSocialPairing true',
      async (status) => {
        const metametrics = createMockAuthMetaMetrics();
        arrangeAuthAPIs({
          mockPairSocialIdentifier: { status },
        });
        const {
          messenger,
          mockKeyringControllerGetState,
          mockSeedlessOnboardingGetState,
          mockSeedlessOnboardingGetAccessToken,
        } = createMockAuthenticationMessenger();
        mockKeyringControllerGetState.mockReturnValue({
          isUnlocked: true,
          keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
        });
        mockSeedlessOnboardingGetState.mockReturnValue({
          vault: 'encrypted',
          authConnection: 'google',
          socialLoginEmail: MOCK_SOCIAL_EMAIL,
        });
        mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

        const controller = new AuthenticationController({
          messenger,
          metametrics,
          config: SOCIAL_PAIRING_ENABLED,
        });

        expect(await controller.performSignIn()).toBeDefined();
        expect(controller.state.needsSocialPairing).toBe(true);
        expect(controller.state.isSignedIn).toBe(true);
      },
    );

    it('pairs on a later performSignIn after isSocialPairingEnabled flips from false to true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      let isEnabled = false;
      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: { isSocialPairingEnabled: (): boolean => isEnabled },
      });

      await controller.performSignIn();
      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);

      isEnabled = true;
      await controller.performSignIn();
      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(true);
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('clears needsSocialPairing on 409 Conflict', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPairSocialIdentifier: {
          status: 409,
          body: {
            message: 'Identifier already belongs to another profile',
            error: 'conflict',
          },
        },
      });
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'apple',
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      expect(await controller.performSignIn()).toBeDefined();
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('swallows getAccessToken throwing and leaves needsSocialPairing true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockRejectedValue(
        new Error('token refresh failed'),
      );

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      expect(await controller.performSignIn()).toBeDefined();
      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('skips pairing when getAccessToken returns an empty string and leaves needsSocialPairing true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'apple',
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue('');

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('skips pairing when there is no primary access token and leaves needsSocialPairing true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: [],
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      const accessTokens = await controller.performSignIn();

      expect(accessTokens).toStrictEqual([]);
      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('skips pairing when getAccessToken returns undefined and leaves needsSocialPairing true', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'apple',
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(undefined);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('leaves needsSocialPairing true when SeedlessOnboarding getState throws', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockImplementation(() => {
        throw new Error('SeedlessOnboardingController unavailable');
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(true);
    });

    it('still pairs the social identifier after a failed SRP profile pair', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs({
        mockPairProfiles: { status: 500 },
      });
      const {
        messenger,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
      });

      await controller.performSignIn();

      expect(mockEndpoints.mockPairProfilesUrl.isDone()).toBe(true);
      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(true);
      expect(controller.state.needsProfilePairing).toBe(true);
      expect(controller.state.needsSocialPairing).toBe(false);
    });
  });

  describe('requestProfilePairing', () => {
    it('flips needsProfilePairing from false to true', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: false }),
        metametrics,
      });

      expect(controller.state.needsProfilePairing).toBe(false);
      controller.requestProfilePairing();
      expect(controller.state.needsProfilePairing).toBe(true);
    });

    it('keeps needsProfilePairing true when already true (no-op)', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      const stateBefore = controller.state;
      controller.requestProfilePairing();
      expect(controller.state.needsProfilePairing).toBe(true);
      // Identity preserved: the early-return skips `update` (no Immer alloc).
      expect(controller.state).toBe(stateBefore);
    });

    it('is exposed via the messenger registry', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, baseMessenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: false }),
        metametrics,
      });

      baseMessenger.call('AuthenticationController:requestProfilePairing');
      expect(controller.state.needsProfilePairing).toBe(true);
    });
  });

  describe('performSignOut', () => {
    it('should remove signed in user and any access tokens', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState(),
        metametrics,
      });

      controller.performSignOut();
      expect(controller.state.isSignedIn).toBe(false);
      expect(controller.state.srpSessionData).toBeUndefined();
      // Sign-out is not a wallet reset: pairing gates stay cleared.
      expect(controller.state.needsProfilePairing).toBe(false);
      expect(controller.state.needsSocialPairing).toBe(false);
    });
  });

  describe('clearState', () => {
    it('resets a fully populated state to defaultState', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const populatedState = mockSignedInState({
        needsProfilePairing: false,
        needsSocialPairing: false,
      });
      const controller = new AuthenticationController({
        messenger,
        state: populatedState,
        metametrics,
      });

      expect(controller.state).toStrictEqual(populatedState);

      controller.clearState();

      expect(controller.state).toStrictEqual(defaultState);
      expect(populatedState).not.toStrictEqual(defaultState);
    });

    it('is exposed via the messenger registry', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, baseMessenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({
          needsProfilePairing: false,
          needsSocialPairing: false,
        }),
        metametrics,
      });

      baseMessenger.call('AuthenticationController:clearState');
      expect(controller.state).toStrictEqual(defaultState);
    });

    it('re-arms social pairing so the next performSignIn calls pair/identifier', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const {
        messenger,
        mockKeyringControllerGetState,
        mockSeedlessOnboardingGetState,
        mockSeedlessOnboardingGetAccessToken,
      } = createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings(MOCK_ENTROPY_SOURCE_IDS[0]),
      });
      mockSeedlessOnboardingGetState.mockReturnValue({
        vault: 'encrypted',
        authConnection: 'google',
        socialLoginEmail: MOCK_SOCIAL_EMAIL,
      });
      mockSeedlessOnboardingGetAccessToken.mockResolvedValue(MOCK_SOCIAL_JWT);

      const controller = new AuthenticationController({
        messenger,
        metametrics,
        config: SOCIAL_PAIRING_ENABLED,
        state: mockSignedInState({
          needsProfilePairing: false,
          needsSocialPairing: false,
        }),
      });

      expect(controller.state.needsSocialPairing).toBe(false);

      controller.clearState();
      expect(controller.state).toStrictEqual(defaultState);

      await controller.performSignIn();

      expect(mockEndpoints.mockPairSocialIdentifierUrl.isDone()).toBe(true);
      expect(controller.state.needsSocialPairing).toBe(false);
    });

    it('keeps needsProfilePairing true when clearState lands during an in-flight /pair', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({ mockPairProfilesDelayMs: 50 });
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState({ needsProfilePairing: true }),
        metametrics,
      });

      const performSignInPromise = controller.performSignIn();
      controller.clearState();
      await performSignInPromise;

      expect(controller.state.needsProfilePairing).toBe(true);
    });
  });

  describe('getBearerToken', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      await expect(controller.getBearerToken()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('should return original access token(s) in state', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const resultWithoutEntropySourceId = await controller.getBearerToken();
      expect(resultWithoutEntropySourceId).toBeDefined();
      expect(resultWithoutEntropySourceId).toBe(
        originalState.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]]?.token
          .accessToken,
      );

      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        const resultWithEntropySourceId = await controller.getBearerToken(id);
        expect(resultWithEntropySourceId).toBeDefined();
        expect(resultWithEntropySourceId).toBe(
          originalState.srpSessionData?.[id]?.token.accessToken,
        );
      }
    });

    it('should return new access token if state is invalid', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      mockAuthenticationFlowEndpoints();
      const originalState = mockSignedInState();
      if (originalState.srpSessionData) {
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].token.accessToken = MOCK_OATH_TOKEN_RESPONSE.access_token;

        const d = new Date();
        d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].token.expiresIn = d.getTime();
      }

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const result = await controller.getBearerToken();
      expect(result).toBeDefined();
      expect(result).toBe(MOCK_OATH_TOKEN_RESPONSE.access_token);
    });

    // If the state is invalid, we need to re-login.
    // But as wallet is locked, we will not be able to call the snap
    it('should throw error if wallet is locked', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      mockAuthenticationFlowEndpoints();

      // Invalid/old state
      const originalState = mockSignedInState();
      if (originalState.srpSessionData) {
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].token.accessToken = 'ACCESS_TOKEN_1';

        const d = new Date();
        d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].token.expiresIn = d.getTime();
      }

      // Mock wallet is locked
      mockKeyringControllerGetState.mockReturnValue({ isUnlocked: false });

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(controller.getBearerToken()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('resolves undefined entropySourceId to primary and stores token', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      arrangeAuthAPIs();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      const result = await controller.getBearerToken();
      expect(result).toBe(MOCK_OATH_TOKEN_RESPONSE.access_token);

      expect(mockKeyringControllerGetState).toHaveBeenCalled();
      expect(controller.state.isSignedIn).toBe(true);
      expect(
        controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]],
      ).toBeDefined();
    });

    it('returns the same token for undefined and explicit primary entropySourceId', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const resultUndefined = await controller.getBearerToken();
      const resultExplicit = await controller.getBearerToken(
        MOCK_ENTROPY_SOURCE_IDS[0],
      );
      expect(resultUndefined).toBe(resultExplicit);
    });

    it('resolves primary entropySourceId from the HD keyring without signing', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockGetPublicKey, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await controller.getBearerToken();
      await controller.getBearerToken();
      await controller.getBearerToken();

      // Cached session: no identify/sign; only keyring for primary ID.
      expect(mockGetPublicKey).not.toHaveBeenCalled();
      expect(mockKeyringControllerGetState).toHaveBeenCalled();
    });

    it('throws when no HD keyring is available', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: [],
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await expect(controller.getBearerToken()).rejects.toThrow(
        'no HD keyring available',
      );
    });
  });

  describe('getSessionProfile', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      await expect(controller.getSessionProfile()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('should return original user profile(s) in state', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const resultWithoutEntropySourceId = await controller.getSessionProfile();
      expect(resultWithoutEntropySourceId).toBeDefined();
      expect(resultWithoutEntropySourceId).toStrictEqual(
        originalState.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]]?.profile,
      );

      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        const resultWithEntropySourceId =
          await controller.getSessionProfile(id);
        expect(resultWithEntropySourceId).toBeDefined();
        expect(resultWithEntropySourceId).toStrictEqual(
          originalState.srpSessionData?.[id]?.profile,
        );
      }
    });

    it('should return new user profile if state is invalid', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      mockAuthenticationFlowEndpoints();
      const originalState = mockSignedInState();
      if (originalState.srpSessionData) {
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].profile.identifierId = MOCK_LOGIN_RESPONSE.profile.identifier_id;

        const d = new Date();
        d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].token.expiresIn = d.getTime();
      }

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const result = await controller.getSessionProfile();
      expect(result).toBeDefined();
      expect(result.identifierId).toBe(
        MOCK_LOGIN_RESPONSE.profile.identifier_id,
      );
      expect(result.profileId).toBe(MOCK_LOGIN_RESPONSE.profile.profile_id);
    });

    // If the state is invalid, we need to re-login.
    // But as wallet is locked, we will not be able to call the snap
    it('should throw error if wallet is locked', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();
      mockAuthenticationFlowEndpoints();

      // Invalid/old state
      const originalState = mockSignedInState();
      if (originalState.srpSessionData) {
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].profile.identifierId = MOCK_LOGIN_RESPONSE.profile.identifier_id;

        const d = new Date();
        d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
        originalState.srpSessionData[
          MOCK_ENTROPY_SOURCE_IDS[0]
        ].token.expiresIn = d.getTime();
      }

      // Mock wallet is locked
      mockKeyringControllerGetState.mockReturnValue({ isUnlocked: false });

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(controller.getSessionProfile()).rejects.toThrow(
        expect.any(Error),
      );
    });
  });

  describe('refreshCanonicalProfileId', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      await expect(controller.refreshCanonicalProfileId()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('should re-login primary SRP and return fresh canonical regardless of SRP count', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: mockHdKeyrings('SINGLE_ENTROPY_SOURCE_ID'),
      });

      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const canonical = await controller.refreshCanonicalProfileId();
      expect(canonical).toBe(MOCK_LOGIN_RESPONSE.profile.profile_id);
      expect(
        controller.state.srpSessionData?.SINGLE_ENTROPY_SOURCE_ID,
      ).toBeDefined();
    });

    it('should throw if no HD keyring is available', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
        keyrings: [],
      });

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await expect(controller.refreshCanonicalProfileId()).rejects.toThrow(
        'no HD keyring available',
      );
    });
  });

  describe('getUserProfileMetaMetrics', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      await expect(controller.getUserProfileLineage()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('should return the profile MetaMetrics data', async () => {
      const metametrics = createMockAuthMetaMetrics();
      mockAuthenticationFlowEndpoints();

      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const result = await controller.getUserProfileLineage();
      expect(result).toBeDefined();
      expect(result).toStrictEqual(MOCK_USER_PROFILE_LINEAGE_RESPONSE);
    });

    it('should throw error if wallet is locked', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      // Invalid/old state
      const originalState = mockSignedInState();

      // Mock wallet is locked
      mockKeyringControllerGetState.mockReturnValue({ isUnlocked: false });

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(controller.getUserProfileLineage()).rejects.toThrow(
        expect.any(Error),
      );
    });
  });

  describe('getCustomerServiceToken', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      await expect(controller.getCustomerServiceToken()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('should return the customer service token', async () => {
      const metametrics = createMockAuthMetaMetrics();
      mockAuthenticationFlowEndpoints();

      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const result = await controller.getCustomerServiceToken();
      expect(result).toBe(MOCK_ACCESS_JWT);
    });

    it('should throw if the customer service token request fails', async () => {
      const metametrics = createMockAuthMetaMetrics();
      mockAuthenticationFlowEndpoints({ endpointFail: 'customerService' });

      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(controller.getCustomerServiceToken()).rejects.toThrow(
        expect.any(Error),
      );
    });

    it('should throw error if wallet is locked', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      const originalState = mockSignedInState();

      mockKeyringControllerGetState.mockReturnValue({ isUnlocked: false });

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(controller.getCustomerServiceToken()).rejects.toThrow(
        expect.any(Error),
      );
    });
  });

  describe('getPartnerIdentityToken', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      await expect(
        controller.getPartnerIdentityToken(['email'], 'kyc'),
      ).rejects.toThrow(expect.any(Error));
    });

    it('should return the partner identity token', async () => {
      const metametrics = createMockAuthMetaMetrics();
      mockAuthenticationFlowEndpoints();

      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      const result = await controller.getPartnerIdentityToken(['email'], 'kyc');
      expect(result).toBe(MOCK_ACCESS_JWT);
    });

    it('should throw if the partner identity token request fails', async () => {
      const metametrics = createMockAuthMetaMetrics();
      mockAuthenticationFlowEndpoints({
        endpointFail: 'partnerIdentityToken',
      });

      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(
        controller.getPartnerIdentityToken(['email'], 'kyc'),
      ).rejects.toThrow(expect.any(Error));
    });

    it('should throw EmailRequiredError on 422', async () => {
      const metametrics = createMockAuthMetaMetrics();
      arrangeAuthAPIs({
        mockPartnerIdentityTokenUrl: {
          status: 422,
          body: { message: 'email_required', error: 'email_required' },
        },
      });

      const { messenger } = createMockAuthenticationMessenger();
      const originalState = mockSignedInState();
      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(
        controller.getPartnerIdentityToken(['email'], 'kyc'),
      ).rejects.toThrow(EmailRequiredError);
    });

    it('should throw error if wallet is locked', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger, mockKeyringControllerGetState } =
        createMockAuthenticationMessenger();

      const originalState = mockSignedInState();

      mockKeyringControllerGetState.mockReturnValue({ isUnlocked: false });

      const controller = new AuthenticationController({
        messenger,
        state: originalState,
        metametrics,
      });

      await expect(
        controller.getPartnerIdentityToken(['email'], 'kyc'),
      ).rejects.toThrow(expect.any(Error));
    });
  });

  describe('isSignedIn', () => {
    it('should return false if not logged in', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false, needsProfilePairing: true },
        metametrics,
      });

      expect(controller.isSignedIn()).toBe(false);
    });

    it('should return true if logged in', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: mockSignedInState(),
        metametrics,
      });

      expect(controller.isSignedIn()).toBe(true);
    });
  });
});

describe('MFA credential enrollment', () => {
  function createController(options?: {
    state?: AuthenticationControllerState;
    trace?: TraceCallback;
  }): {
    controller: AuthenticationController;
    baseMessenger: RootMessenger;
  } {
    const { messenger, baseMessenger } = createMockAuthenticationMessenger();
    return {
      controller: new AuthenticationController({
        messenger,
        metametrics: createMockAuthMetaMetrics(),
        state: options?.state ?? mockSignedInState(),
        trace: options?.trace,
      }),
      baseMessenger,
    };
  }

  it('starts with an empty memory-only credential cache', () => {
    const { controller } = createController({
      state: { ...defaultState },
    });
    expect(controller.state.enrolledCredentials).toStrictEqual([]);
  });

  it('refreshes credentials and writes state only when data changes', async () => {
    mockEndpointMfaCredentials();
    const { controller, baseMessenger } = createController();
    const listener = jest.fn();
    baseMessenger.subscribe('AuthenticationController:stateChange', listener);

    expect(await controller.refreshEnrolledCredentials()).toHaveLength(2);
    expect(controller.state.enrolledCredentials).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);

    await controller.refreshEnrolledCredentials();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('invalidates the cached SRP session when authentication is rejected', async () => {
    mockEndpointMfaCredentials({
      status: 401,
      body: { message: 'Access token expired' },
    });
    const { controller } = createController();

    await expect(controller.refreshEnrolledCredentials()).rejects.toMatchObject(
      { mfaCode: 'authentication_required' },
    );
    expect(
      controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]].profile
        .canonicalProfileId,
    ).toBe('');
  });

  it('begins passkey enrollment with validated tracing tags', async () => {
    mockEndpointMfaEnroll();
    const setAttribute = jest.fn();
    const trace = jest.fn(
      (
        _request: unknown,
        fn?: (context?: unknown) => unknown,
      ): Promise<unknown> => Promise.resolve(fn?.({ setAttribute })),
    ) as unknown as TraceCallback;
    const { controller } = createController({ trace });

    expect(
      await controller.beginCredentialEnrollment({
        type: 'passkey',
        reason: { operation: 'settings.addPasskey' },
      }),
    ).toMatchObject({
      type: 'passkey',
      flowId: 'enroll-passkey-flow-id',
      publicKey: expect.objectContaining({ challenge: expect.any(String) }),
    });
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MFA Enroll Begin',
        tags: {
          operation: 'settings.addPasskey',
          credentialType: 'passkey',
        },
      }),
      expect.any(Function),
    );
    expect(setAttribute).toHaveBeenCalledWith('outcome', 'success');
  });

  it('begins email enrollment and rejects invalid boundary input', async () => {
    mockEndpointMfaEnroll({
      status: 200,
      body: MOCK_MFA_ENROLL_EMAIL_RESPONSE,
    });
    const { controller } = createController();

    expect(
      await controller.beginCredentialEnrollment({
        type: 'email_otp',
        email: 'user@example.com',
        reason: { operation: 'settings.addEmail' },
      }),
    ).toStrictEqual({
      type: 'email_otp',
      flowId: 'enroll-email-flow-id',
      expiresAt: Date.parse('2099-09-07T14:30:00Z'),
    });
    await expect(
      controller.beginCredentialEnrollment({
        type: 'email_otp',
        reason: { operation: 'invalid operation' },
      }),
    ).rejects.toMatchObject({ mfaCode: 'invalid_request' });
    await expect(
      controller.beginCredentialEnrollment({
        type: 'passkey',
        email: 'user@example.com',
        reason: { operation: 'settings.addPasskey' },
      }),
    ).rejects.toMatchObject({ mfaCode: 'invalid_request' });
  });

  it('completes passkey enrollment, refreshes the cache and traces the caller operation', async () => {
    mockEndpointMfaEnrollComplete();
    mockEndpointMfaCredentials();
    const trace = jest.fn(
      (_request: unknown, fn?: () => unknown): Promise<unknown> =>
        Promise.resolve(fn?.()),
    ) as unknown as TraceCallback;
    const { controller } = createController({ trace });

    const credentials = await controller.completeCredentialEnrollment({
      flowId: 'flow-id',
      proof: {
        type: 'passkey',
        attestation: {
          id: 'credential-id',
          rawId: 'credential-id',
          type: 'public-key',
          response: {
            attestationObject: 'attestation',
            clientDataJSON: 'client-data',
          },
        },
      },
      reason: { operation: 'settings.addPasskey' },
    });

    expect(credentials).toHaveLength(
      MOCK_MFA_CREDENTIALS_RESPONSE.credentials.length,
    );
    expect(controller.state.enrolledCredentials).toStrictEqual(credentials);
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'MFA Enroll Complete',
        tags: {
          operation: 'settings.addPasskey',
          credentialType: 'passkey',
        },
      }),
      expect.any(Function),
    );
    // The primary SRP session is untouched: passkeys add no token claims.
    expect(
      controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]].profile
        .canonicalProfileId,
    ).not.toBe('');
  });

  it('invalidates the primary SRP session after email enrollment', async () => {
    mockEndpointMfaEnrollComplete();
    const credentialsScope = mockEndpointMfaCredentials();
    const { controller } = createController();

    await controller.completeCredentialEnrollment({
      flowId: 'flow-id',
      proof: { type: 'email_otp', code: '123456' },
      reason: { operation: 'settings.addEmail' },
    });

    expect(credentialsScope.isDone()).toBe(true);
    expect(
      controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]].profile
        .canonicalProfileId,
    ).toBe('');
  });

  it('does not restore credentials if the wallet locks during refresh', async () => {
    let release!: (value: Awaited<ReturnType<typeof fetch>>) => void;
    let requestStartedResolve: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => {
      requestStartedResolve = resolve;
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      async (): ReturnType<typeof fetch> =>
        await new Promise((resolve) => {
          release = resolve;
          requestStartedResolve?.();
        }),
    );
    const { controller, baseMessenger } = createController({
      state: {
        ...mockSignedInState(),
        enrolledCredentials: [],
      },
    });
    try {
      const refresh = controller.refreshEnrolledCredentials();
      await requestStarted;
      baseMessenger.publish('KeyringController:lock');
      release(
        new globalThis.Response(JSON.stringify(MOCK_MFA_CREDENTIALS_RESPONSE), {
          status: 200,
        }),
      );

      await expect(refresh).rejects.toThrow('the authenticated session ended');
      expect(controller.state.enrolledCredentials).toStrictEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([
    [
      'sign-out',
      (controller: AuthenticationController): void =>
        controller.performSignOut(),
    ],
    [
      'wallet reset',
      (controller: AuthenticationController): void => controller.clearState(),
    ],
  ])(
    'does not restore the previous profile credentials if %s happens during refresh',
    async (_name, endSession) => {
      let release!: (value: Awaited<ReturnType<typeof fetch>>) => void;
      let requestStartedResolve: (() => void) | undefined;
      const requestStarted = new Promise<void>((resolve) => {
        requestStartedResolve = resolve;
      });
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
        async (): ReturnType<typeof fetch> =>
          await new Promise((resolve) => {
            release = resolve;
            requestStartedResolve?.();
          }),
      );
      const { controller } = createController();
      try {
        const refresh = controller.refreshEnrolledCredentials();
        await requestStarted;
        endSession(controller);
        release(
          new globalThis.Response(
            JSON.stringify(MOCK_MFA_CREDENTIALS_RESPONSE),
            { status: 200 },
          ),
        );

        await expect(refresh).rejects.toThrow(
          'the authenticated session ended',
        );
        expect(controller.state.enrolledCredentials).toStrictEqual([]);
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );

  it('still invalidates the SRP session when the wallet locks while email enrollment completes', async () => {
    let release!: (value: Awaited<ReturnType<typeof fetch>>) => void;
    let requestStartedResolve: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => {
      requestStartedResolve = resolve;
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      async (): ReturnType<typeof fetch> =>
        await new Promise((resolve) => {
          release = resolve;
          requestStartedResolve?.();
        }),
    );
    const { controller, baseMessenger } = createController();
    try {
      const completion = controller.completeCredentialEnrollment({
        flowId: 'flow-id',
        proof: { type: 'email_otp', code: '123456' },
        reason: { operation: 'settings.addEmail' },
      });
      await requestStarted;
      baseMessenger.publish('KeyringController:lock');
      release(
        new globalThis.Response(JSON.stringify({ status: 'enrolled' }), {
          status: 200,
        }),
      );

      await expect(completion).rejects.toThrow(
        'the authenticated session ended',
      );
      // No credentials refresh was attempted after the session ended.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.enrolledCredentials).toStrictEqual([]);
      // The enrollment succeeded server-side, so the token cached across the
      // lock must not be reused without the new email claim.
      expect(
        controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]].profile
          .canonicalProfileId,
      ).toBe('');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps the existing cache when post-enrollment refresh fails', async () => {
    mockEndpointMfaEnrollComplete();
    mockEndpointMfaCredentials({
      status: 502,
      body: { code: 'kratos_unavailable', message: 'Unavailable' },
    });
    const existing = [
      {
        type: 'passkey',
        status: 'active',
        displayName: 'Existing passkey',
      },
    ] as const;
    const { controller } = createController({
      state: {
        ...mockSignedInState(),
        enrolledCredentials: [...existing],
      },
    });

    expect(
      await controller.completeCredentialEnrollment({
        flowId: 'flow-id',
        proof: { type: 'email_otp', code: '123456' },
        reason: { operation: 'settings.addEmail' },
      }),
    ).toStrictEqual(existing);
    // The SRP session is still invalidated so the next token carries the claim.
    expect(
      controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]].profile
        .canonicalProfileId,
    ).toBe('');
  });

  it.each([
    [
      'sign-out',
      (controller: AuthenticationController): void =>
        controller.performSignOut(),
    ],
    [
      'wallet reset',
      (controller: AuthenticationController): void => controller.clearState(),
    ],
  ])('clears cached credentials on %s', (_name, act) => {
    const { controller } = createController({
      state: {
        ...mockSignedInState(),
        enrolledCredentials: [
          {
            type: 'email_otp',
            status: 'active',
            email: 'user@example.com',
            verified: true,
          },
        ],
      },
    });

    act(controller);

    expect(controller.state.enrolledCredentials).toStrictEqual([]);
  });

  it('does not update state if the wallet locks during enrollment completion', async () => {
    let resolveCompletion:
      | ((response: Awaited<ReturnType<typeof fetch>>) => void)
      | undefined;
    let requestStartedResolve: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => {
      requestStartedResolve = resolve;
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      async (): ReturnType<typeof fetch> =>
        await new Promise((resolve) => {
          resolveCompletion = resolve;
          requestStartedResolve?.();
        }),
    );
    const { controller, baseMessenger } = createController();
    try {
      const completion = controller.completeCredentialEnrollment({
        flowId: 'flow-id',
        proof: { type: 'email_otp', code: '123456' },
        reason: { operation: 'settings.addEmail' },
      });
      await requestStarted;
      baseMessenger.publish('KeyringController:lock');
      resolveCompletion?.(
        new globalThis.Response(JSON.stringify({ status: 'enrolled' }), {
          status: 200,
        }),
      );

      await expect(completion).rejects.toThrow(
        'the authenticated session ended',
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.enrolledCredentials).toStrictEqual([]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rejects MFA calls while the wallet is locked', async () => {
    const { controller, baseMessenger } = createController();
    baseMessenger.publish('KeyringController:lock');

    await expect(controller.refreshEnrolledCredentials()).rejects.toThrow(
      'wallet is locked',
    );
    await expect(
      controller.beginCredentialEnrollment({
        type: 'passkey',
        reason: { operation: 'settings.addPasskey' },
      }),
    ).rejects.toThrow('wallet is locked');
  });

  it('discards a stale refresh that lands after a newer, faster refresh from enrollment', async () => {
    const deferred = <Value>(): {
      promise: Promise<Value>;
      resolve: (value: Value) => void;
    } => {
      let resolveDeferred!: (value: Value) => void;
      const promise = new Promise<Value>((resolve) => {
        resolveDeferred = resolve;
      });
      return { promise, resolve: resolveDeferred };
    };

    const slow = deferred<Awaited<ReturnType<typeof fetch>>>();
    const enrollComplete = deferred<Awaited<ReturnType<typeof fetch>>>();
    const enrollmentCredentials = deferred<Awaited<ReturnType<typeof fetch>>>();

    const slowStarted = deferred<void>();
    const enrollCompleteStarted = deferred<void>();
    const enrollmentCredentialsStarted = deferred<void>();

    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    fetchSpy
      .mockImplementationOnce(async (): ReturnType<typeof fetch> => {
        slowStarted.resolve();
        return slow.promise;
      })
      .mockImplementationOnce(async (): ReturnType<typeof fetch> => {
        enrollCompleteStarted.resolve();
        return enrollComplete.promise;
      })
      .mockImplementationOnce(async (): ReturnType<typeof fetch> => {
        enrollmentCredentialsStarted.resolve();
        return enrollmentCredentials.promise;
      });

    const { controller } = createController();

    try {
      // 1. Slow refresh starts first but doesn't resolve yet.
      const slowRefresh = controller.refreshEnrolledCredentials();
      await slowStarted.promise;

      // 2. Enrollment completes while the slow refresh is in flight.
      const enrollmentCompletion = controller.completeCredentialEnrollment({
        flowId: 'flow-id',
        proof: { type: 'email_otp', code: '123456' },
        reason: { operation: 'settings.addEmail' },
      });

      // 3. Let the enroll-complete POST resolve, then its internal refresh GET.
      await enrollCompleteStarted.promise;
      enrollComplete.resolve(
        new globalThis.Response(JSON.stringify({ status: 'enrolled' }), {
          status: 200,
        }),
      );

      await enrollmentCredentialsStarted.promise;
      enrollmentCredentials.resolve(
        new globalThis.Response(JSON.stringify(MOCK_MFA_CREDENTIALS_RESPONSE), {
          status: 200,
        }),
      );
      await enrollmentCompletion;

      const freshCredentials = controller.state.enrolledCredentials;
      expect(freshCredentials).toHaveLength(
        MOCK_MFA_CREDENTIALS_RESPONSE.credentials.length,
      );

      // 4. The stale response lands late, with different data.
      slow.resolve(
        new globalThis.Response(JSON.stringify({ credentials: [] }), {
          status: 200,
        }),
      );
      await slowRefresh;

      // 5. Must NOT be overwritten by the stale response.
      expect(controller.state.enrolledCredentials).toStrictEqual(
        freshCredentials,
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('MFA step-up verification', () => {
  const passkeyProof = {
    type: 'passkey',
    assertion: {
      id: 'credential-id',
      rawId: 'credential-id',
      type: 'public-key',
      response: {
        authenticatorData: 'authenticator-data',
        clientDataJSON: 'client-data',
        signature: 'signature',
      },
    },
  } as const;

  function createController(options?: { trace?: TraceCallback }): {
    controller: AuthenticationController;
    baseMessenger: RootMessenger;
  } {
    const { messenger, baseMessenger } = createMockAuthenticationMessenger();
    return {
      controller: new AuthenticationController({
        messenger,
        metametrics: createMockAuthMetaMetrics(),
        state: mockSignedInState(),
        trace: options?.trace,
      }),
      baseMessenger,
    };
  }

  function mockSuccessfulCompletion(): void {
    mockEndpointMfaVerifyComplete();
    mockEndpointAccessToken({
      status: 200,
      body: MOCK_ELEVATED_ACCESS_TOKEN_RESPONSE,
    });
  }

  async function completeStepUp(
    controller: AuthenticationController,
  ): Promise<void> {
    await controller.completeStepUp({
      flowId: 'flow-id',
      proof: passkeyProof,
      reason: { operation: 'money.signTransaction' },
    });
  }

  it('begins passkey and email verification without consulting the cache', async () => {
    mockEndpointMfaVerify();
    const { controller } = createController();

    expect(
      await controller.beginStepUp({
        type: 'passkey',
        reason: { operation: 'money.signTransaction' },
      }),
    ).toMatchObject({
      type: 'passkey',
      flowId: 'verify-passkey-flow-id',
      publicKey: expect.objectContaining({ challenge: expect.any(String) }),
    });

    cleanAllNock();
    mockEndpointMfaVerify({
      status: 200,
      body: {
        flow_id: 'verify-email-flow-id',
        expires_at: '2099-09-07T14:30:00Z',
      },
    });
    expect(
      await controller.beginStepUp({
        type: 'email_otp',
        reason: { operation: 'kalshi.deposit' },
      }),
    ).toStrictEqual({
      type: 'email_otp',
      flowId: 'verify-email-flow-id',
      expiresAt: Date.parse('2099-09-07T14:30:00Z'),
    });
  });

  it('maps a missing server credential to a stable error code', async () => {
    mockEndpointMfaVerify({
      status: 409,
      body: {
        code: 'credential_not_enrolled',
        message: 'Credential is not enrolled',
      },
    });
    const { controller } = createController();

    await expect(
      controller.beginStepUp({
        type: 'passkey',
        reason: { operation: 'money.signTransaction' },
      }),
    ).rejects.toMatchObject({ mfaCode: 'credential_not_enrolled' });
  });

  it('opens and exposes an elevated session after AAL2 exchange', async () => {
    mockSuccessfulCompletion();
    const { controller, baseMessenger } = createController();
    const listener = jest.fn();
    baseMessenger.subscribe('AuthenticationController:stateChange', listener);

    const token = await controller.completeStepUp({
      flowId: 'flow-id',
      proof: passkeyProof,
      reason: { operation: 'money.signTransaction' },
    });

    expect(token.accessToken).toBe(
      MOCK_ELEVATED_ACCESS_TOKEN_RESPONSE.access_token,
    );
    expect(token.claims).toStrictEqual({
      sub: 'f88227bd-b615-41a3-b0be-467dd781a4ad',
      aal: 2,
      amr: ['passkey'],
      exp: 4102444800,
    });
    expect(controller.getElevatedProfileToken()).toBe(token);
    expect(controller.state.stepUpSessionExpiresAt).toBe(
      token.obtainedAt + 60_000,
    );
    // Exactly one state write, and the token itself never enters state.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(controller.state)).not.toContain(token.accessToken);
  });

  it('clears the session idempotently without spurious state writes', async () => {
    mockSuccessfulCompletion();
    const { controller, baseMessenger } = createController();
    await completeStepUp(controller);
    const listener = jest.fn();
    baseMessenger.subscribe('AuthenticationController:stateChange', listener);

    controller.clearStepUpSession();
    controller.clearStepUpSession();

    expect(controller.state.stepUpSessionExpiresAt).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not write state when clearing a session that does not exist', () => {
    const { controller, baseMessenger } = createController();
    const listener = jest.fn();
    baseMessenger.subscribe('AuthenticationController:stateChange', listener);

    controller.clearStepUpSession();
    baseMessenger.publish('KeyringController:lock');

    expect(listener).not.toHaveBeenCalled();
  });

  it('traces every verification network step with final outcomes', async () => {
    mockEndpointMfaVerify();
    mockSuccessfulCompletion();
    const requests: { name?: string }[] = [];
    const setAttribute = jest.fn();
    const trace = jest.fn(
      (
        request: { name?: string },
        fn?: (context?: unknown) => unknown,
      ): Promise<unknown> => {
        requests.push(request);
        return Promise.resolve(fn?.({ setAttribute }));
      },
    ) as unknown as TraceCallback;
    const { controller } = createController({ trace });

    await controller.beginStepUp({
      type: 'passkey',
      reason: { operation: 'money.signTransaction' },
    });
    await completeStepUp(controller);

    expect(requests.map(({ name }) => name)).toStrictEqual([
      'MFA Step-Up Begin',
      'MFA Step-Up Complete',
      'MFA Token Exchange',
    ]);
    expect(requests).toStrictEqual(
      requests.map(() =>
        expect.objectContaining({
          tags: {
            operation: 'money.signTransaction',
            credentialType: 'passkey',
          },
        }),
      ),
    );
    expect(setAttribute).toHaveBeenCalledTimes(3);
    expect(setAttribute).toHaveBeenNthCalledWith(1, 'outcome', 'success');
    expect(setAttribute).toHaveBeenNthCalledWith(2, 'outcome', 'success');
    expect(setAttribute).toHaveBeenNthCalledWith(3, 'outcome', 'success');
  });

  it('honors caller freshness requirements without clearing the session', async () => {
    mockSuccessfulCompletion();
    const { controller } = createController();
    await completeStepUp(controller);

    expect(
      controller.getElevatedProfileToken({ maxSessionAgeMs: 0 }),
    ).toBeNull();
    expect(controller.getElevatedProfileToken()).not.toBeNull();
    expect(
      controller.getElevatedProfileToken({ maxSessionAgeMs: 600_000 }),
    ).not.toBeNull();
    expect(() =>
      controller.getElevatedProfileToken({ maxSessionAgeMs: -1 }),
    ).toThrow(/MFA\[invalid_request\]/u);
    // An invalid request is rejected before the session is touched.
    expect(controller.getElevatedProfileToken()).not.toBeNull();
    expect(controller.state.stepUpSessionExpiresAt).toBeDefined();
  });

  it('hard-clears the session at the session TTL', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify(MOCK_MFA_VERIFY_COMPLETE_RESPONSE),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify(MOCK_ELEVATED_ACCESS_TOKEN_RESPONSE),
          { status: 200 },
        ),
      );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-09-16T10:00:00Z'));
    try {
      const { controller } = createController();
      await completeStepUp(controller);

      expect(controller.getElevatedProfileToken()).not.toBeNull();
      jest.advanceTimersByTime(STEP_UP_SESSION_TTL_MS);
      expect(controller.getElevatedProfileToken()).toBeNull();
      expect(controller.state.stepUpSessionExpiresAt).toBeUndefined();
    } finally {
      jest.useRealTimers();
      fetchSpy.mockRestore();
    }
  });

  it('hard-clears the session when the elevated token expires first', async () => {
    const now = new Date('2026-09-16T10:00:00Z');
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = btoa(
      JSON.stringify({
        sub: 'profile-id',
        aal: 2,
        amr: 'passkey',
        exp: Math.floor(now.getTime() / 1000) + 1,
      }),
    );
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify(MOCK_MFA_VERIFY_COMPLETE_RESPONSE),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify({
            access_token: `${header}.${payload}.signature`,
            expires_in: 900,
          }),
          { status: 200 },
        ),
      );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(now);
    try {
      const { controller } = createController();
      await completeStepUp(controller);

      expect(controller.state.stepUpSessionExpiresAt).toBe(
        now.getTime() + 1_000,
      );
      jest.advanceTimersByTime(1_000);
      expect(controller.getElevatedProfileToken()).toBeNull();
    } finally {
      jest.useRealTimers();
      fetchSpy.mockRestore();
    }
  });

  it('clears stale state when the clock passes expiration before the timer runs', async () => {
    const now = new Date('2026-09-16T10:00:00Z');
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify(MOCK_MFA_VERIFY_COMPLETE_RESPONSE),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new globalThis.Response(
          JSON.stringify(MOCK_ELEVATED_ACCESS_TOKEN_RESPONSE),
          { status: 200 },
        ),
      );
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(now);
    try {
      const { controller } = createController();
      await completeStepUp(controller);

      jest.setSystemTime(now.getTime() + STEP_UP_SESSION_TTL_MS + 1_000);
      expect(controller.getElevatedProfileToken()).toBeNull();
      expect(controller.state.stepUpSessionExpiresAt).toBeUndefined();
    } finally {
      jest.useRealTimers();
      fetchSpy.mockRestore();
    }
  });

  /**
   * Starts `completeStepUp`, ends the authenticated session while the
   * verification request is still in flight, then lets the request succeed.
   *
   * @param endSession - Ends the session mid-flight.
   * @returns The controller, once the completion has been rejected.
   */
  async function arrangeSessionEndDuringCompletion(
    endSession: (
      controller: AuthenticationController,
      baseMessenger: RootMessenger,
    ) => void,
  ): Promise<AuthenticationController> {
    let resolveVerification:
      | ((response: Awaited<ReturnType<typeof fetch>>) => void)
      | undefined;
    let requestStartedResolve: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => {
      requestStartedResolve = resolve;
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      async (): ReturnType<typeof fetch> =>
        await new Promise((resolve) => {
          resolveVerification = resolve;
          requestStartedResolve?.();
        }),
    );
    const { controller, baseMessenger } = createController();
    try {
      const completion = controller.completeStepUp({
        flowId: 'flow-id',
        proof: passkeyProof,
        reason: { operation: 'money.signTransaction' },
      });
      await requestStarted;
      endSession(controller, baseMessenger);
      resolveVerification?.(
        new globalThis.Response(
          JSON.stringify(MOCK_MFA_VERIFY_COMPLETE_RESPONSE),
          { status: 200 },
        ),
      );

      await expect(completion).rejects.toThrow(
        'the authenticated session ended',
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.stepUpSessionExpiresAt).toBeUndefined();
      return controller;
    } finally {
      fetchSpy.mockRestore();
    }
  }

  it('cannot reopen an elevated session if the wallet locks during completion', async () => {
    const controller = await arrangeSessionEndDuringCompletion(
      (_controller, baseMessenger) =>
        baseMessenger.publish('KeyringController:lock'),
    );

    expect(() => controller.getElevatedProfileToken()).toThrow(
      'wallet is locked',
    );
  });

  it.each([
    [
      'sign-out',
      (controller: AuthenticationController): void =>
        controller.performSignOut(),
    ],
    [
      'wallet reset',
      (controller: AuthenticationController): void => controller.clearState(),
    ],
  ])(
    'leaves no elevated token retrievable when %s happens during completion',
    async (_name, endSession) => {
      const controller = await arrangeSessionEndDuringCompletion(endSession);

      expect(controller.getElevatedProfileToken()).toBeNull();
    },
  );

  it.each([MOCK_ACCESS_JWT, 'not-a-jwt'])(
    'rejects an exchanged token without valid AAL2 claims',
    async (accessToken) => {
      mockEndpointMfaVerifyComplete();
      mockEndpointAccessToken({
        status: 200,
        body: {
          access_token: accessToken,
          expires_in: 900,
        },
      });
      const { controller } = createController();

      await expect(
        controller.completeStepUp({
          flowId: 'flow-id',
          proof: passkeyProof,
          reason: { operation: 'money.signTransaction' },
        }),
      ).rejects.toMatchObject({ mfaCode: 'elevated_token_invalid' });
      expect(controller.state.stepUpSessionExpiresAt).toBeUndefined();
    },
  );

  it('clears the elevated session on lock, sign-out, and wallet reset', async () => {
    mockSuccessfulCompletion();
    const first = createController();
    await completeStepUp(first.controller);
    first.baseMessenger.publish('KeyringController:lock');
    expect(first.controller.state.stepUpSessionExpiresAt).toBeUndefined();

    cleanAllNock();
    mockSuccessfulCompletion();
    const second = createController();
    await completeStepUp(second.controller);
    second.controller.performSignOut();
    expect(second.controller.getElevatedProfileToken()).toBeNull();

    cleanAllNock();
    mockSuccessfulCompletion();
    const third = createController();
    await completeStepUp(third.controller);
    third.controller.clearState();
    expect(third.controller.getElevatedProfileToken()).toBeNull();
  });

  it('clears the elevated session when authentication is rejected', async () => {
    mockSuccessfulCompletion();
    const { controller } = createController();
    await completeStepUp(controller);
    expect(controller.getElevatedProfileToken()).not.toBeNull();

    mockEndpointMfaCredentials({
      status: 401,
      body: { message: 'Access token expired' },
    });
    await expect(controller.refreshEnrolledCredentials()).rejects.toMatchObject(
      { mfaCode: 'authentication_required' },
    );

    expect(controller.getElevatedProfileToken()).toBeNull();
    expect(controller.state.stepUpSessionExpiresAt).toBeUndefined();
  });

  it('sends the elevated token when beginning enrollment while a session is live', async () => {
    mockSuccessfulCompletion();
    const { controller } = createController();
    await completeStepUp(controller);
    const elevated = controller.getElevatedProfileToken()?.accessToken;
    expect(elevated).toBeDefined();

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify(MOCK_MFA_ENROLL_EMAIL_RESPONSE), {
        status: 200,
      }),
    );
    try {
      await controller.beginCredentialEnrollment({
        type: 'email_otp',
        email: 'user@example.com',
        reason: { operation: 'settings.addEmail' },
      });

      expect(
        new globalThis.Headers(fetchSpy.mock.calls[0][1]?.headers).get(
          'Authorization',
        ),
      ).toBe(`Bearer ${elevated}`);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('sends the base token on enrollment calls without a live session', async () => {
    const { controller } = createController();
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new globalThis.Response(JSON.stringify(MOCK_MFA_ENROLL_EMAIL_RESPONSE), {
        status: 200,
      }),
    );
    try {
      await controller.beginCredentialEnrollment({
        type: 'email_otp',
        email: 'user@example.com',
        reason: { operation: 'settings.addEmail' },
      });

      const base =
        controller.state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]].token
          .accessToken;
      expect(
        new globalThis.Headers(fetchSpy.mock.calls[0][1]?.headers).get(
          'Authorization',
        ),
      ).toBe(`Bearer ${base}`);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('surfaces aal2_required from enrollment', async () => {
    mockEndpointMfaEnroll({
      status: 403,
      body: { code: 'aal2_required', message: 'Elevated session required' },
    });
    const { controller } = createController();

    await expect(
      controller.beginCredentialEnrollment({
        type: 'passkey',
        reason: { operation: 'settings.addPasskey' },
      }),
    ).rejects.toMatchObject({ mfaCode: 'aal2_required', status: 403 });
  });

  it('clears an elevated session after successful enrollment', async () => {
    mockSuccessfulCompletion();
    mockEndpointMfaEnrollComplete();
    mockEndpointMfaCredentials();
    const { controller } = createController();
    await completeStepUp(controller);

    await controller.completeCredentialEnrollment({
      flowId: 'enrollment-flow',
      proof: { type: 'email_otp', code: '123456' },
      reason: { operation: 'settings.addEmail' },
    });

    expect(controller.getElevatedProfileToken()).toBeNull();
  });
});

describe('metadata', () => {
  it('includes expected state in debug snapshots', () => {
    const controller = new AuthenticationController({
      messenger: createMockAuthenticationMessenger().messenger,
      metametrics: createMockAuthMetaMetrics(),
      // Set `expiresIn` to an arbitrary number so that it stays consistent between test runs
      state: mockSignedInState({ expiresIn: 1_000 }),
    });

    expect(
      deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'includeInDebugSnapshot',
      ),
    ).toMatchInlineSnapshot(`
      {
        "isSignedIn": true,
        "needsProfilePairing": false,
        "needsSocialPairing": false,
      }
    `);
  });

  describe('includeInStateLogs', () => {
    it('keeps only non-PII credential fields', () => {
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        metametrics: createMockAuthMetaMetrics(),
        state: {
          ...mockSignedInState(),
          enrolledCredentials: [
            {
              type: 'passkey',
              status: 'active',
              enrolledAt: 1_000,
              displayName: 'My iPhone',
            },
            {
              type: 'email_otp',
              status: 'pending',
              enrolledAt: 2_000,
              email: 'jane@example.com',
              verified: false,
            },
          ],
        },
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ).enrolledCredentials,
      ).toStrictEqual([
        { type: 'passkey', status: 'active', enrolledAt: 1_000 },
        { type: 'email_otp', status: 'pending', enrolledAt: 2_000 },
      ]);
    });

    it('strips paired identifiers out of state logs', () => {
      const state = mockSignedInState();
      const primaryEntry = state.srpSessionData?.[MOCK_ENTROPY_SOURCE_IDS[0]];
      if (primaryEntry) {
        primaryEntry.profile.pairedIdentifierIds = [
          { id: 'hashed-google-sub', type: 'GOOGLE' },
        ];
      }
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        metametrics: createMockAuthMetaMetrics(),
        state,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).not.toHaveProperty([
        'srpSessionData',
        MOCK_ENTROPY_SOURCE_IDS[0],
        'profile',
        'pairedIdentifierIds',
      ]);
    });

    it('includes expected state in state logs, with access token stripped out', () => {
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        metametrics: createMockAuthMetaMetrics(),
        // Set `expiresIn` to an arbitrary number so that it stays consistent between test runs
        state: mockSignedInState({ expiresIn: 1_000 }),
      });

      const derivedState = deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'includeInStateLogs',
      );

      expect(derivedState).toMatchInlineSnapshot(`
        {
          "enrolledCredentials": [],
          "isSignedIn": true,
          "needsProfilePairing": false,
          "needsSocialPairing": false,
          "srpSessionData": {
            "MOCK_ENTROPY_SOURCE_ID": {
              "profile": {
                "canonicalProfileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
                "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
                "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
                "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
              },
              "token": {
                "expiresIn": 1000,
                "obtainedAt": 0,
              },
            },
            "MOCK_ENTROPY_SOURCE_ID2": {
              "profile": {
                "canonicalProfileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
                "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
                "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
                "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
              },
              "token": {
                "expiresIn": 1000,
                "obtainedAt": 0,
              },
            },
          },
        }
      `);
    });

    it('returns expected state in state logs when srpSessionData is unset', () => {
      const controller = new AuthenticationController({
        messenger: createMockAuthenticationMessenger().messenger,
        metametrics: createMockAuthMetaMetrics(),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "enrolledCredentials": [],
          "isSignedIn": false,
          "needsProfilePairing": true,
          "needsSocialPairing": true,
        }
      `);
    });
  });

  it('persists expected state', () => {
    const controller = new AuthenticationController({
      messenger: createMockAuthenticationMessenger().messenger,
      metametrics: createMockAuthMetaMetrics(),
      // Set `expiresIn` to an arbitrary number so that it stays consistent between test runs
      state: mockSignedInState({ expiresIn: 1_000 }),
    });

    expect(
      deriveStateFromMetadata(controller.state, controller.metadata, 'persist'),
    ).toMatchInlineSnapshot(`
      {
        "isSignedIn": true,
        "needsProfilePairing": false,
        "needsSocialPairing": false,
        "srpSessionData": {
          "MOCK_ENTROPY_SOURCE_ID": {
            "profile": {
              "canonicalProfileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjQxMDI0NDQ4MDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
              "expiresIn": 1000,
              "obtainedAt": 0,
            },
          },
          "MOCK_ENTROPY_SOURCE_ID2": {
            "profile": {
              "canonicalProfileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjQxMDI0NDQ4MDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
              "expiresIn": 1000,
              "obtainedAt": 0,
            },
          },
        },
      }
    `);
  });

  it('exposes expected state to UI', () => {
    const controller = new AuthenticationController({
      messenger: createMockAuthenticationMessenger().messenger,
      metametrics: createMockAuthMetaMetrics(),
      // Set `expiresIn` to an arbitrary number so that it stays consistent between test runs
      state: mockSignedInState({ expiresIn: 1_000 }),
    });

    expect(
      deriveStateFromMetadata(
        controller.state,
        controller.metadata,
        'usedInUi',
      ),
    ).toMatchInlineSnapshot(`
      {
        "enrolledCredentials": [],
        "isSignedIn": true,
        "needsProfilePairing": false,
        "needsSocialPairing": false,
        "srpSessionData": {
          "MOCK_ENTROPY_SOURCE_ID": {
            "profile": {
              "canonicalProfileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjQxMDI0NDQ4MDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
              "expiresIn": 1000,
              "obtainedAt": 0,
            },
          },
          "MOCK_ENTROPY_SOURCE_ID2": {
            "profile": {
              "canonicalProfileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjQxMDI0NDQ4MDB9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
              "expiresIn": 1000,
              "obtainedAt": 0,
            },
          },
        },
      }
    `);
  });
});

type AllAuthenticationControllerActions =
  MessengerActions<AuthenticationControllerMessenger>;

type AllAuthenticationControllerEvents =
  MessengerEvents<AuthenticationControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllAuthenticationControllerActions,
  AllAuthenticationControllerEvents
>;

/**
 * Constructs the root messenger.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

const controllerName = 'AuthenticationController';

/**
 * Jest Test Utility - create Auth Messenger
 *
 * @returns Auth Messenger
 */
function createAuthenticationMessenger(): {
  messenger: AuthenticationControllerMessenger;
  baseMessenger: RootMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = new Messenger<
    typeof controllerName,
    AllAuthenticationControllerActions,
    AllAuthenticationControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'KeyringController:getState',
      'KeyringController:withKeyringV2Unsafe',
      'SeedlessOnboardingController:getState',
      'SeedlessOnboardingController:getAccessToken',
    ],
    events: ['KeyringController:lock', 'KeyringController:unlock'],
  });

  return { messenger, baseMessenger: rootMessenger };
}

/**
 * Jest Test Utility - create Mock Auth Messenger
 *
 * @returns Mock Auth Messenger
 */
function createMockAuthenticationMessenger(): {
  messenger: AuthenticationControllerMessenger;
  baseMessenger: RootMessenger;
  mockGetPublicKey: jest.Mock;
  mockSignMessage: jest.Mock;
  mockKeyringControllerGetState: jest.Mock;
  mockWithKeyringV2Unsafe: jest.Mock;
  mockSeedlessOnboardingGetState: jest.Mock;
  mockSeedlessOnboardingGetAccessToken: jest.Mock;
} {
  const { baseMessenger, messenger } = createAuthenticationMessenger();

  const mockCall = jest.spyOn(messenger, 'call');
  const mockGetPublicKey = jest.mocked(getMessageSigningPublicKey);
  const mockSignMessage = jest.mocked(signMessageWithMessageSigningKey);
  mockGetPublicKey.mockReset().mockResolvedValue('MOCK_PUBLIC_KEY');
  mockSignMessage.mockReset().mockResolvedValue('MOCK_SIGNED_MESSAGE');

  const mockKeyringControllerGetState = jest.fn().mockReturnValue({
    isUnlocked: true,
    keyrings: MOCK_HD_KEYRINGS,
  });

  const mockWithKeyringV2Unsafe = jest
    .fn()
    .mockImplementation(
      async (
        _selector: { id: string },
        operation: (context: {
          keyring: { type: string; seed?: Uint8Array };
          metadata: { id: string; name: string };
        }) => Promise<unknown>,
      ) => {
        return operation({
          keyring: { type: 'hd', seed: MOCK_HD_SEED },
          metadata: { id: 'mock', name: '' },
        });
      },
    );

  const mockSeedlessOnboardingGetState = jest
    .fn()
    .mockReturnValue({ vault: null });

  const mockSeedlessOnboardingGetAccessToken = jest
    .fn()
    .mockResolvedValue(undefined);

  mockCall.mockImplementation((...args: unknown[]) => {
    const [actionType] = args;
    if (actionType === 'KeyringController:withKeyringV2Unsafe') {
      const [, selector, operation] = args as [
        typeof actionType,
        { id: string },
        (context: {
          keyring: { type: string; seed?: Uint8Array };
          metadata: { id: string; name: string };
        }) => Promise<unknown>,
      ];
      return mockWithKeyringV2Unsafe(selector, operation);
    }

    if (actionType === 'KeyringController:getState') {
      return mockKeyringControllerGetState();
    }

    if (actionType === 'SeedlessOnboardingController:getState') {
      return mockSeedlessOnboardingGetState();
    }

    if (actionType === 'SeedlessOnboardingController:getAccessToken') {
      return mockSeedlessOnboardingGetAccessToken();
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    messenger,
    baseMessenger,
    mockGetPublicKey,
    mockSignMessage,
    mockKeyringControllerGetState,
    mockWithKeyringV2Unsafe,
    mockSeedlessOnboardingGetState,
    mockSeedlessOnboardingGetAccessToken,
  };
}

/**
 * Jest Test Utility - mock auth endpoints
 *
 * @param params - params if want to fail auth
 * @param params.endpointFail - option to cause an endpoint to fail
 * @returns mock auth endpoints
 */
function mockAuthenticationFlowEndpoints(params?: {
  endpointFail:
    | 'nonce'
    | 'login'
    | 'token'
    | 'lineage'
    | 'customerService'
    | 'partnerIdentityToken';
}): ReturnType<typeof arrangeAuthAPIs> {
  return arrangeAuthAPIs({
    mockNonceUrl:
      params?.endpointFail === 'nonce' ? { status: 500 } : undefined,
    mockSrpLoginUrl:
      params?.endpointFail === 'login' ? { status: 500 } : undefined,
    mockOAuth2TokenUrl:
      params?.endpointFail === 'token' ? { status: 500 } : undefined,
    mockUserProfileLineageUrl:
      params?.endpointFail === 'lineage' ? { status: 500 } : undefined,
    mockCustomerServiceTokenUrl:
      params?.endpointFail === 'customerService' ? { status: 500 } : undefined,
    mockPartnerIdentityTokenUrl:
      params?.endpointFail === 'partnerIdentityToken'
        ? { status: 500 }
        : undefined,
  });
}

/**
 * Jest Test Utility - mock auth metametrics
 *
 * @returns mock metametrics method
 */
function createMockAuthMetaMetrics(): {
  getMetaMetricsId: jest.Mock;
  agent: typeof Platform.EXTENSION;
} {
  const getMetaMetricsId = jest
    .fn()
    .mockReturnValue(MOCK_LOGIN_RESPONSE.profile.metametrics_id);

  return { getMetaMetricsId, agent: Platform.EXTENSION as const };
}
