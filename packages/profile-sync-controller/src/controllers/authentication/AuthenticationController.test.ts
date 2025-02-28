import { Messenger } from '@metamask/base-controller';

import AuthenticationController from './AuthenticationController';
import type {
  AllowedActions,
  AllowedEvents,
  AuthenticationControllerState,
} from './AuthenticationController';
import {
  MOCK_LOGIN_RESPONSE,
  MOCK_OATH_TOKEN_RESPONSE,
} from './mocks/mockResponses';
import { Platform } from '../../sdk';
import { arrangeAuthAPIs } from '../../sdk/__fixtures__/mock-auth';

const mockSignedInState = (): AuthenticationControllerState => ({
  isSignedIn: true,
  sessionData: {
    token: {
      accessToken: MOCK_OATH_TOKEN_RESPONSE.access_token,
      expiresIn: Date.now() + 3600,
      obtainedAt: 0,
    },
    profile: {
      identifierId: MOCK_LOGIN_RESPONSE.profile.identifier_id,
      profileId: MOCK_LOGIN_RESPONSE.profile.profile_id,
      metaMetricsId: MOCK_LOGIN_RESPONSE.profile.metametrics_id,
    },
  },
});

describe('authentication/authentication-controller - constructor() tests', () => {
  it('should initialize with default state', () => {
    const metametrics = createMockAuthMetaMetrics();
    const controller = new AuthenticationController({
      messenger: createMockAuthenticationMessenger().messenger,
      metametrics,
    });

    expect(controller.state.isSignedIn).toBe(false);
    expect(controller.state.sessionData).toBeUndefined();
  });

  it('should initialize with override state', () => {
    const metametrics = createMockAuthMetaMetrics();
    const controller = new AuthenticationController({
      messenger: createMockAuthenticationMessenger().messenger,
      state: mockSignedInState(),
      metametrics,
    });

    expect(controller.state.isSignedIn).toBe(true);
    expect(controller.state.sessionData).toBeDefined();
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

describe('authentication/authentication-controller - performSignIn() tests', () => {
  it('should create access token and update state', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const mockEndpoints = arrangeAuthAPIs();
    const { messenger, mockSnapGetPublicKey, mockSnapSignMessage } =
      createMockAuthenticationMessenger();

    const controller = new AuthenticationController({ messenger, metametrics });

    const result = await controller.performSignIn();
    expect(mockSnapGetPublicKey).toHaveBeenCalled();
    expect(mockSnapSignMessage).toHaveBeenCalled();
    mockEndpoints.mockNonceUrl.done();
    mockEndpoints.mockSrpLoginUrl.done();
    mockEndpoints.mockOAuth2TokenUrl.done();
    expect(result).toBe(MOCK_OATH_TOKEN_RESPONSE.access_token);

    // Assert - state shows user is logged in
    expect(controller.state.isSignedIn).toBe(true);
    expect(controller.state.sessionData).toBeDefined();
  });

  it('leverages the _snapSignMessageCache', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const mockEndpoints = arrangeAuthAPIs();
    const { messenger, mockSnapGetPublicKey, mockSnapSignMessage } =
      createMockAuthenticationMessenger();

    const controller = new AuthenticationController({ messenger, metametrics });

    await controller.performSignIn();
    controller.performSignOut();
    await controller.performSignIn();
    expect(mockSnapGetPublicKey).toHaveBeenCalledTimes(1);
    expect(mockSnapSignMessage).toHaveBeenCalledTimes(1);
    mockEndpoints.mockNonceUrl.done();
    mockEndpoints.mockSrpLoginUrl.done();
    mockEndpoints.mockOAuth2TokenUrl.done();
    expect(controller.state.isSignedIn).toBe(true);
    expect(controller.state.sessionData).toBeDefined();
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

    const controller = new AuthenticationController({ messenger, metametrics });

    baseMessenger.publish('KeyringController:lock');
    await expect(controller.performSignIn()).rejects.toThrow(expect.any(Error));

    baseMessenger.publish('KeyringController:unlock');
    expect(await controller.performSignIn()).toBe(
      MOCK_OATH_TOKEN_RESPONSE.access_token,
    );
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
    const controller = new AuthenticationController({ messenger, metametrics });

    await expect(controller.performSignIn()).rejects.toThrow(expect.any(Error));
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

describe('authentication/authentication-controller - performSignOut() tests', () => {
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
    expect(controller.state.sessionData).toBeUndefined();
  });
});

describe('authentication/authentication-controller - getBearerToken() tests', () => {
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

  it('should return original access token in state', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const { messenger } = createMockAuthenticationMessenger();
    const originalState = mockSignedInState();
    const controller = new AuthenticationController({
      messenger,
      state: originalState,
      metametrics,
    });

    const result = await controller.getBearerToken();
    expect(result).toBeDefined();
    expect(result).toBe(originalState.sessionData?.token.accessToken);
  });

  it('should return new access token if state is invalid', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const { messenger } = createMockAuthenticationMessenger();
    mockAuthenticationFlowEndpoints();
    const originalState = mockSignedInState();
    // eslint-disable-next-line jest/no-conditional-in-test
    if (originalState.sessionData) {
      originalState.sessionData.token.accessToken =
        MOCK_OATH_TOKEN_RESPONSE.access_token;

      const d = new Date();
      d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
      originalState.sessionData.token.expiresIn = d.getTime();
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
    // eslint-disable-next-line jest/no-conditional-in-test
    if (originalState.sessionData) {
      originalState.sessionData.token.accessToken = 'ACCESS_TOKEN_1';

      const d = new Date();
      d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
      originalState.sessionData.token.expiresIn = d.getTime();
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

describe('authentication/authentication-controller - getSessionProfile() tests', () => {
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

  it('should return original access token in state', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const { messenger } = createMockAuthenticationMessenger();
    const originalState = mockSignedInState();
    const controller = new AuthenticationController({
      messenger,
      state: originalState,
      metametrics,
    });

    const result = await controller.getSessionProfile();
    expect(result).toBeDefined();
    expect(result).toStrictEqual(originalState.sessionData?.profile);
  });

  it('should return new access token if state is invalid', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const { messenger } = createMockAuthenticationMessenger();
    mockAuthenticationFlowEndpoints();
    const originalState = mockSignedInState();
    // eslint-disable-next-line jest/no-conditional-in-test
    if (originalState.sessionData) {
      originalState.sessionData.profile.identifierId =
        MOCK_LOGIN_RESPONSE.profile.identifier_id;

      const d = new Date();
      d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
      originalState.sessionData.token.expiresIn = d.getTime();
    }

    const controller = new AuthenticationController({
      messenger,
      state: originalState,
      metametrics,
    });

    const result = await controller.getSessionProfile();
    expect(result).toBeDefined();
    expect(result.identifierId).toBe(MOCK_LOGIN_RESPONSE.profile.identifier_id);
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
    // eslint-disable-next-line jest/no-conditional-in-test
    if (originalState.sessionData) {
      originalState.sessionData.profile.identifierId =
        MOCK_LOGIN_RESPONSE.profile.identifier_id;

      const d = new Date();
      d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
      originalState.sessionData.token.expiresIn = d.getTime();
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

describe('authentication/authentication-controller - isSignedIn() tests', () => {
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

/**
 * Jest Test Utility - create Auth Messenger
 *
 * @returns Auth Messenger
 */
function createAuthenticationMessenger() {
  const baseMessenger = new Messenger<AllowedActions, AllowedEvents>();
  const messenger = baseMessenger.getRestricted({
    name: 'AuthenticationController',
    allowedActions: [
      'KeyringController:getState',
      'SnapController:handleRequest',
    ],
    allowedEvents: ['KeyringController:lock', 'KeyringController:unlock'],
  });

  return { messenger, baseMessenger };
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
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue('MOCK_SIGNED_MESSAGE');

  const mockKeyringControllerGetState = jest
    .fn()
    .mockReturnValue({ isUnlocked: true });

  mockCall.mockImplementation((...args) => {
    const [actionType, params] = args;
    if (actionType === 'SnapController:handleRequest') {
      if (params?.request.method === 'getPublicKey') {
        return mockSnapGetPublicKey();
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
  endpointFail: 'nonce' | 'login' | 'token';
}) {
  const { mockNonceUrl, mockOAuth2TokenUrl, mockSrpLoginUrl } = arrangeAuthAPIs(
    {
      mockNonceUrl:
        params?.endpointFail === 'nonce' ? { status: 500 } : undefined,
      mockSrpLoginUrl:
        params?.endpointFail === 'login' ? { status: 500 } : undefined,
      mockOAuth2TokenUrl:
        params?.endpointFail === 'token' ? { status: 500 } : undefined,
    },
  );

  return {
    mockNonceUrl,
    mockOAuth2TokenUrl,
    mockSrpLoginUrl,
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
