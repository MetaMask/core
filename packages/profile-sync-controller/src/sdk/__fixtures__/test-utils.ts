import type { AuthSigningOptions, AuthStorageOptions } from '../authentication';
import { AuthType, JwtBearerAuth } from '../authentication';
import { Env } from '../env';

// Utility for mocking, the generics will constrain values
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const typedMockFn = <Fn extends (...args: any[]) => any>() =>
  jest.fn<ReturnType<Fn>, Parameters<Fn>>();

/**
 * Mock Utility - Arrange Auth
 *
 * @param type - choose SIWE or SRP Auth instance
 * @param mockPublicKey - provide the mock public key
 * @returns Auth instance
 */
export function arrangeAuth(type: 'SIWE' | 'SRP', mockPublicKey: string) {
  const mockGetLoginResponse =
    typedMockFn<AuthStorageOptions['getLoginResponse']>().mockResolvedValue(
      null,
    );

  const mockSetLoginResponse =
    typedMockFn<AuthStorageOptions['setLoginResponse']>().mockResolvedValue();

  const mockGetIdentifier =
    typedMockFn<AuthSigningOptions['getIdentifier']>().mockResolvedValue(
      mockPublicKey,
    );

  const mockSignMessage = typedMockFn<
    AuthSigningOptions['signMessage']
  >().mockResolvedValue(
    type === 'SRP' ? 'MOCK_SRP_SIGNATURE' : 'MOCK_SIWE_SIGNATURE',
  );

  const auth = new JwtBearerAuth(
    {
      env: Env.DEV,
      type: type === 'SRP' ? AuthType.SRP : AuthType.SiWE,
    },
    {
      storage: {
        getLoginResponse: mockGetLoginResponse,
        setLoginResponse: mockSetLoginResponse,
      },
      signing: {
        getIdentifier: mockGetIdentifier,
        signMessage: mockSignMessage,
      },
    },
  );

  return {
    auth,
    mockGetLoginResponse,
    mockSetLoginResponse,
    mockGetIdentifier,
    mockSignMessage,
  };
}
