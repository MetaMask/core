import { ControllerMessenger } from '@metamask/base-controller';

import {
  MOCK_ACCESS_TOKEN,
  MOCK_LOGIN_RESPONSE,
} from './__fixtures__/mockResponses';
import {
  mockEndpointAccessToken,
  mockEndpointGetNonce,
  mockEndpointLogin,
} from './__fixtures__/mockServices';
import type {
  AllowedActions,
  AuthenticationControllerState,
} from './AuthenticationController';
import AuthenticationController from './AuthenticationController';

const mockSignedInState = (): AuthenticationControllerState => ({
  isSignedIn: true,
  sessionData: {
    accessToken: 'MOCK_ACCESS_TOKEN',
    expiresIn: new Date().toString(),
    profile: {
      identifierId: MOCK_LOGIN_RESPONSE.profile.identifier_id,
      profileId: MOCK_LOGIN_RESPONSE.profile.profile_id,
    },
  },
});

describe('authentication/authentication-controller - constructor() tests', () => {
  it('should initialize with default state', () => {
    const metametrics = createMockAuthMetaMetrics();
    const controller = new AuthenticationController({
      messenger: createAuthenticationMessenger(),
      metametrics,
    });

    expect(controller.state.isSignedIn).toBe(false);
    expect(controller.state.sessionData).toBeUndefined();
  });

  it('should initialize with override state', () => {
    const metametrics = createMockAuthMetaMetrics();
    const controller = new AuthenticationController({
      messenger: createAuthenticationMessenger(),
      state: mockSignedInState(),
      metametrics,
    });

    expect(controller.state.isSignedIn).toBe(true);
    expect(controller.state.sessionData).toBeDefined();
  });
});

describe('authentication/authentication-controller - performSignIn() tests', () => {
  it('should create access token and update state', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const mockEndpoints = mockAuthenticationFlowEndpoints();
    const { messenger, mockSnapGetPublicKey, mockSnapSignMessage } =
      createMockAuthenticationMessenger();

    const controller = new AuthenticationController({ messenger, metametrics });

    const result = await controller.performSignIn();
    expect(mockSnapGetPublicKey).toHaveBeenCalled();
    expect(mockSnapSignMessage).toHaveBeenCalled();
    mockEndpoints.mockGetNonceEndpoint.done();
    mockEndpoints.mockLoginEndpoint.done();
    mockEndpoints.mockAccessTokenEndpoint.done();
    expect(result).toBe(MOCK_ACCESS_TOKEN);

    // Assert - state shows user is logged in
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
      mockEndpoints.mockGetNonceEndpoint.isDone(),
      mockEndpoints.mockLoginEndpoint.isDone(),
      mockEndpoints.mockAccessTokenEndpoint.isDone(),
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

  it('should throw error if attempting to sign out when user is not logged in', () => {
    const metametrics = createMockAuthMetaMetrics();
    const { messenger } = createMockAuthenticationMessenger();
    const controller = new AuthenticationController({
      messenger,
      state: { isSignedIn: false },
      metametrics,
    });

    expect(() => controller.performSignOut()).toThrow(expect.any(Error));
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
    expect(result).toBe(originalState.sessionData?.accessToken);
  });

  it('should return new access token if state is invalid', async () => {
    const metametrics = createMockAuthMetaMetrics();
    const { messenger } = createMockAuthenticationMessenger();
    mockAuthenticationFlowEndpoints();
    const originalState = mockSignedInState();
    if (originalState.sessionData) {
      originalState.sessionData.accessToken = 'ACCESS_TOKEN_1';

      const d = new Date();
      d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
      originalState.sessionData.expiresIn = d.toString();
    }

    const controller = new AuthenticationController({
      messenger,
      state: originalState,
      metametrics,
    });

    const result = await controller.getBearerToken();
    expect(result).toBeDefined();
    expect(result).toBe(MOCK_ACCESS_TOKEN);
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
    if (originalState.sessionData) {
      originalState.sessionData.profile.identifierId = 'ID_1';

      const d = new Date();
      d.setMinutes(d.getMinutes() - 31); // expires at 30 mins
      originalState.sessionData.expiresIn = d.toString();
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
});

/**
 * Jest Test Utility - create Auth Messenger
 *
 * @returns Auth Messenger
 */
function createAuthenticationMessenger() {
  const messenger = new ControllerMessenger<AllowedActions, never>();
  return messenger.getRestricted({
    name: 'AuthenticationController',
    allowedActions: [`SnapController:handleRequest`],
    allowedEvents: [],
  });
}

/**
 * Jest Test Utility - create Mock Auth Messenger
 *
 * @returns Mock Auth Messenger
 */
function createMockAuthenticationMessenger() {
  const messenger = createAuthenticationMessenger();
  const mockCall = jest.spyOn(messenger, 'call');
  const mockSnapGetPublicKey = jest.fn().mockResolvedValue('MOCK_PUBLIC_KEY');
  const mockSnapSignMessage = jest
    .fn()
    .mockResolvedValue('MOCK_SIGNED_MESSAGE');

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

    const exhaustedMessengerMocks = (action: never) => {
      throw new Error(
        `MOCK_FAIL - unsupported messenger call: ${action as string}`,
      );
    };

    return exhaustedMessengerMocks(actionType);
  });

  return { messenger, mockSnapGetPublicKey, mockSnapSignMessage };
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
  const mockGetNonceEndpoint = mockEndpointGetNonce(
    params?.endpointFail === 'nonce' ? { status: 500 } : undefined,
  );
  const mockLoginEndpoint = mockEndpointLogin(
    params?.endpointFail === 'login' ? { status: 500 } : undefined,
  );
  const mockAccessTokenEndpoint = mockEndpointAccessToken(
    params?.endpointFail === 'token' ? { status: 500 } : undefined,
  );

  return {
    mockGetNonceEndpoint,
    mockLoginEndpoint,
    mockAccessTokenEndpoint,
  };
}

/**
 * Jest Test Utility - mock auth metametrics
 *
 * @returns mock metametrics method
 */
function createMockAuthMetaMetrics() {
  const getMetaMetricsId = jest.fn().mockReturnValue('MOCK_METAMETRICS_ID');

  return { getMetaMetricsId, agent: 'extension' as const };
}
