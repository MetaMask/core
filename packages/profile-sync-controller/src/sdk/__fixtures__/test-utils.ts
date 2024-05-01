import type {
  AuthSigningOptions,
  AuthStorageOptions,
  AuthType,
} from '../authentication';
import { JwtBearerAuth } from '../authentication';
import { Env } from '../env';

// Alias mocking variables with ANY to test runtime safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MockVariable = any;

// Utility for mocking, the generics will constrain values
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
 * @returns Auth instance
 */
export function arrangeAuth(
  type: `${AuthType}`,
  mockPublicKey: string,
  authOptionsOverride?: {
    signing?: AuthSigningOptions;
  },
) {
  const authOptionsMock = mockAuthOptions();
  authOptionsMock.mockGetLoginResponse.mockResolvedValue(null);
  authOptionsMock.mockSetLoginResponse.mockResolvedValue();
  authOptionsMock.mockGetIdentifier.mockResolvedValue(mockPublicKey);
  authOptionsMock.mockSignMessage.mockResolvedValue(
    type === 'SRP' ? 'MOCK_SRP_SIGNATURE' : 'MOCK_SIWE_SIGNATURE',
  );

  const auth = new JwtBearerAuth(
    {
      env: Env.DEV,
      type: type as AuthType,
    },
    {
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

  return {
    auth,
    ...authOptionsMock,
  };
}
