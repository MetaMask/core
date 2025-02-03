import type { Eip1193Provider } from 'ethers';

import { Env, Platform } from '../../shared/env';
import { JwtBearerAuth } from '../authentication';
import type {
  AuthSigningOptions,
  AuthStorageOptions,
} from '../authentication-jwt-bearer/types';
import { AuthType } from '../authentication-jwt-bearer/types';
import { SNAP_ORIGIN } from '../utils/messaging-signing-snap-requests';

// Alias mocking variables with ANY to test runtime safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockVariable = any;

// Utility for mocking, the generics will constrain values
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/naming-convention
export const typedMockFn = <Fn extends (...args: any[]) => any>() =>
  jest.fn<ReturnType<Fn>, Parameters<Fn>>();

const mockAuthOptions = () => {
  const mockGetLoginResponse =
    typedMockFn<AuthStorageOptions['getLoginResponse']>();

  const mockSetLoginResponse =
    typedMockFn<AuthStorageOptions['setLoginResponse']>();

  const mockGetIdentifier = typedMockFn<AuthSigningOptions['getIdentifier']>();

  const mockSignMessage = typedMockFn<AuthSigningOptions['signMessage']>();

  return {
    mockGetLoginResponse,
    mockSetLoginResponse,
    mockGetIdentifier,
    mockSignMessage,
  };
};

/**
 * Mock Utility - Arrange Auth
 *
 * @param type - choose SIWE or SRP Auth instance
 * @param mockPublicKey - provide the mock public key
 * @param authOptionsOverride - overrides
 * @param authOptionsOverride.signing - override auth signing
 * @param authOptionsOverride.customProvider - override custom provider
 * @returns Auth instance
 */
export function arrangeAuth(
  type: `${AuthType}`,
  mockPublicKey: string,
  authOptionsOverride?: {
    signing?: AuthSigningOptions;
    customProvider?: Eip1193Provider;
  },
) {
  const authOptionsMock = mockAuthOptions();
  authOptionsMock.mockGetLoginResponse.mockResolvedValue(null);
  authOptionsMock.mockSetLoginResponse.mockResolvedValue();
  authOptionsMock.mockGetIdentifier.mockResolvedValue(mockPublicKey);
  authOptionsMock.mockSignMessage.mockResolvedValue(
    type === 'SRP' ? 'MOCK_SRP_SIGNATURE' : 'MOCK_SIWE_SIGNATURE',
  );

  if (type === 'SRP') {
    const auth = new JwtBearerAuth(
      {
        env: Env.DEV,
        platform: Platform.EXTENSION,
        type: AuthType.SRP,
      },
      {
        customProvider: authOptionsOverride?.customProvider,
        storage: {
          getLoginResponse: authOptionsMock.mockGetLoginResponse,
          setLoginResponse: authOptionsMock.mockSetLoginResponse,
        },
        signing: authOptionsOverride
          ? authOptionsOverride.signing
          : {
              getIdentifier: authOptionsMock.mockGetIdentifier,
              signMessage: authOptionsMock.mockSignMessage,
            },
      },
    );

    return { auth, ...authOptionsMock };
  }

  if (type === 'SiWE') {
    const auth = new JwtBearerAuth(
      {
        env: Env.DEV,
        platform: Platform.EXTENSION,
        type: AuthType.SiWE,
      },
      {
        storage: {
          getLoginResponse: authOptionsMock.mockGetLoginResponse,
          setLoginResponse: authOptionsMock.mockSetLoginResponse,
        },
      },
    );

    return { auth, ...authOptionsMock };
  }

  throw new Error('Unable to arrange auth mock for invalid auth type');
}

/**
 * Mock utility - creates a mock provider
 * @returns mock provider
 */
export const arrangeMockProvider = () => {
  const mockRequest = jest.fn().mockResolvedValue({ [SNAP_ORIGIN]: {} });
  const mockProvider: Eip1193Provider = {
    request: mockRequest,
  };

  return { mockProvider, mockRequest };
};
