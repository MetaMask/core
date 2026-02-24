import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import { AuthenticationController } from './AuthenticationController';
import type {
  AuthenticationControllerMessenger,
  AuthenticationControllerState,
} from './AuthenticationController';
import {
  MOCK_LOGIN_RESPONSE,
  MOCK_OATH_TOKEN_RESPONSE,
} from './mocks/mockResponses';
import type { LoginResponse } from '../../sdk';
import { Platform } from '../../sdk';
import { arrangeAuthAPIs } from '../../sdk/__fixtures__/auth';
import { MOCK_USER_PROFILE_LINEAGE_RESPONSE } from '../../sdk/mocks/auth';

const MOCK_ENTROPY_SOURCE_IDS = [
  'MOCK_ENTROPY_SOURCE_ID',
  'MOCK_ENTROPY_SOURCE_ID2',
];

/**
 * Return mock state for the scenario where a user is signed in.
 *
 * @param options - Options.
 * @param options.expiresIn - The timestamp to use for the `expiresIn` token property.
 * @returns Mock AuthenticationController state reflecting a signed in user.
 */
const mockSignedInState = ({
  expiresIn = Date.now() + 3600,
}: { expiresIn?: number } = {}): AuthenticationControllerState => {
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
        metaMetricsId: MOCK_LOGIN_RESPONSE.profile.metametrics_id,
      },
    };
  });

  return {
    isSignedIn: true,
    srpSessionData,
  };
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
      const {
        messenger,
        mockSnapGetPublicKey,
        mockSnapGetAllPublicKeys,
        mockSnapSignMessage,
      } = createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      const result = await controller.performSignIn();
      expect(mockSnapGetAllPublicKeys).toHaveBeenCalledTimes(1);
      expect(mockSnapGetPublicKey).toHaveBeenCalledTimes(2);
      expect(mockSnapSignMessage).toHaveBeenCalledTimes(1);
      mockEndpoints.mockNonceUrl.done();
      mockEndpoints.mockSrpLoginUrl.done();
      mockEndpoints.mockOAuth2TokenUrl.done();
      expect(result).toStrictEqual([
        MOCK_OATH_TOKEN_RESPONSE.access_token,
        MOCK_OATH_TOKEN_RESPONSE.access_token,
      ]);

      // Assert - state shows user is logged in
      expect(controller.state.isSignedIn).toBe(true);
      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        expect(controller.state.srpSessionData?.[id]).toBeDefined();
      }
    });

    it('leverages the _snapSignMessageCache', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const mockEndpoints = arrangeAuthAPIs();
      const { messenger, mockSnapSignMessage } =
        createMockAuthenticationMessenger();

      const controller = new AuthenticationController({
        messenger,
        metametrics,
      });

      await controller.performSignIn();
      controller.performSignOut();
      await controller.performSignIn();
      expect(mockSnapSignMessage).toHaveBeenCalledTimes(1);
      mockEndpoints.mockNonceUrl.done();
      mockEndpoints.mockSrpLoginUrl.done();
      mockEndpoints.mockOAuth2TokenUrl.done();
      expect(controller.state.isSignedIn).toBe(true);
      for (const id of MOCK_ENTROPY_SOURCE_IDS) {
        expect(controller.state.srpSessionData?.[id]).toBeDefined();
      }
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

      mockKeyringControllerGetState.mockReturnValue({ isUnlocked: true });

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
    ) {
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
    });
  });

  describe('getBearerToken', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false },
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
  });

  describe('getSessionProfile', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false },
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

  describe('getUserProfileMetaMetrics', () => {
    it('should throw error if not logged in', async () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false },
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

  describe('isSignedIn', () => {
    it('should return false if not logged in', () => {
      const metametrics = createMockAuthMetaMetrics();
      const { messenger } = createMockAuthenticationMessenger();
      const controller = new AuthenticationController({
        messenger,
        state: { isSignedIn: false },
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
      }
    `);
  });

  describe('includeInStateLogs', () => {
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
          "isSignedIn": true,
          "srpSessionData": {
            "MOCK_ENTROPY_SOURCE_ID": {
              "profile": {
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
          "isSignedIn": false,
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
        "srpSessionData": {
          "MOCK_ENTROPY_SOURCE_ID": {
            "profile": {
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
              "expiresIn": 1000,
              "obtainedAt": 0,
            },
          },
          "MOCK_ENTROPY_SOURCE_ID2": {
            "profile": {
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
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
        "isSignedIn": true,
        "srpSessionData": {
          "MOCK_ENTROPY_SOURCE_ID": {
            "profile": {
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
              "expiresIn": 1000,
              "obtainedAt": 0,
            },
          },
          "MOCK_ENTROPY_SOURCE_ID2": {
            "profile": {
              "identifierId": "da9a9fc7b09edde9cc23cec9b7e11a71fb0ab4d2ddd8af8af905306f3e1456fb",
              "metaMetricsId": "561ec651-a844-4b36-a451-04d6eac35740",
              "profileId": "f88227bd-b615-41a3-b0be-467dd781a4ad",
            },
            "token": {
              "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
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
function createAuthenticationMessenger() {
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
    actions: ['KeyringController:getState', 'SnapController:handleRequest'],
    events: ['KeyringController:lock', 'KeyringController:unlock'],
  });

  return { messenger, baseMessenger: rootMessenger };
}

/**
 * Jest Test Utility - create Mock Auth Messenger
 *
 * @returns Mock Auth Messenger
 */
function createMockAuthenticationMessenger() {
  const { baseMessenger, messenger } = createAuthenticationMessenger();

  const mockCall = jest.spyOn(messenger, 'call');
  const mockSnapGetPublicKey = jest.fn().mockResolvedValue('MOCK_PUBLIC_KEY');
  const mockSnapGetAllPublicKeys = jest
    .fn()
    .mockResolvedValue(
      MOCK_ENTROPY_SOURCE_IDS.map((id) => [id, 'MOCK_PUBLIC_KEY']),
    );
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue('MOCK_SIGNED_MESSAGE');

  const mockKeyringControllerGetState = jest
    .fn()
    .mockReturnValue({ isUnlocked: true });

  mockCall.mockImplementation((...args) => {
    const [actionType, params] = args;
    if (actionType === 'SnapController:handleRequest') {
      if (typeof params === 'string') {
        throw new Error(
          `MOCK_FAIL - unsupported SnapController:handleRequest call: ${params}`,
        );
      }

      if (params?.request.method === 'getPublicKey') {
        return mockSnapGetPublicKey();
      }

      if (params?.request.method === 'getAllPublicKeys') {
        return mockSnapGetAllPublicKeys();
      }

      if (params?.request.method === 'signMessage') {
        return mockSnapSignMessage();
      }

      throw new Error(
        `MOCK_FAIL - unsupported SnapController:handleRequest call: ${
          params?.request.method as string
        }`,
      );
    }

    if (actionType === 'KeyringController:getState') {
      return mockKeyringControllerGetState();
    }

    throw new Error(
      `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
    );
  });

  return {
    messenger,
    baseMessenger,
    mockSnapGetPublicKey,
    mockSnapGetAllPublicKeys,
    mockSnapSignMessage,
    mockKeyringControllerGetState,
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
  endpointFail: 'nonce' | 'login' | 'token' | 'lineage';
}) {
  const {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
    mockUserProfileLineageUrl,
  } = arrangeAuthAPIs({
    mockNonceUrl:
      params?.endpointFail === 'nonce' ? { status: 500 } : undefined,
    mockSrpLoginUrl:
      params?.endpointFail === 'login' ? { status: 500 } : undefined,
    mockOAuth2TokenUrl:
      params?.endpointFail === 'token' ? { status: 500 } : undefined,
    mockUserProfileLineageUrl:
      params?.endpointFail === 'lineage' ? { status: 500 } : undefined,
  });

  return {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
    mockUserProfileLineageUrl,
  };
}

/**
 * Jest Test Utility - mock auth metametrics
 *
 * @returns mock metametrics method
 */
function createMockAuthMetaMetrics() {
  const getMetaMetricsId = jest
    .fn()
    .mockReturnValue(MOCK_LOGIN_RESPONSE.profile.metametrics_id);

  return { getMetaMetricsId, agent: Platform.EXTENSION as const };
}
