import {
  MOCK_ACCESS_JWT,
  MOCK_SRP_LOGIN_RESPONSE,
  arrangeAuthAPIs,
} from './__fixtures__/mock-auth';
import type { MockVariable } from './__fixtures__/test-utils';
import { arrangeAuth } from './__fixtures__/test-utils';
import { JwtBearerAuth } from './authentication';
import type { LoginResponse, Pair } from './authentication-jwt-bearer/types';
import { Env, Platform } from './env';
import {
  NonceRetrievalError,
  PairError,
  SignInError,
  UnsupportedAuthTypeError,
  ValidationError,
} from './errors';
import * as Eip6963MetamaskProvider from './utils/eip-6963-metamask-provider';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('Identifier Pairing', () => {
  it('should pair identifiers', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SRP', MOCK_SRP);
    const { mockNonceUrl, mockPairIdentifiersUrl, mockSrpLoginUrl } =
      arrangeAuthAPIs();

    const pairing: Pair[] = [
      {
        encryptedStorageKey: 'encrypted<original-storage-key>',
        identifier:
          '0xc89a614e873c2c1f08fc8d72590e13c961ea856cc7a9cd08af4bf3d3fca53046',
        identifierType: 'SRP',
        signMessage: mockSignMessage,
      },
    ];
    await auth.pairIdentifiers(pairing);

    // API
    expect(mockSrpLoginUrl.isDone()).toBe(true);
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockPairIdentifiersUrl.isDone()).toBe(true);
  });

  it('should handle pair identifiers API errors', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SRP', MOCK_SRP);
    const { mockNonceUrl, mockPairIdentifiersUrl, mockSrpLoginUrl } =
      arrangeAuthAPIs({
        mockPairIdentifiers: {
          status: 401,
          body: {
            message: 'invalid pair signature',
            error: 'invalid-pair-request',
          },
        },
      });

    const pairing: Pair[] = [
      {
        encryptedStorageKey: 'encrypted<original-storage-key>',
        identifier:
          '0xc89a614e873c2c1f08fc8d72590e13c961ea856cc7a9cd08af4bf3d3fca11111',
        identifierType: 'SRP',
        signMessage: mockSignMessage,
      },
    ];

    await expect(auth.pairIdentifiers(pairing)).rejects.toThrow(PairError);

    // API
    expect(mockSrpLoginUrl.isDone()).toBe(true);
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockPairIdentifiersUrl.isDone()).toBe(true);
  });

  it('should handle sign message errors', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);
    const { mockNonceUrl, mockPairIdentifiersUrl, mockSrpLoginUrl } =
      arrangeAuthAPIs();

    const pairing: Pair[] = [
      {
        encryptedStorageKey: 'encrypted<original-storage-key>',
        identifier:
          '0xc89a614e873c2c1f08fc8d72590e13c961ea856cc7a9cd08af4bf3d3fca11111',
        identifierType: 'SRP',
        signMessage: async (message: string): Promise<string> => {
          return new Promise((_, reject) => {
            reject(new Error(`unable to sign message: ${message}`));
          });
        },
      },
    ];

    await expect(auth.pairIdentifiers(pairing)).rejects.toThrow(PairError);

    // API
    expect(mockSrpLoginUrl.isDone()).toBe(true);
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockPairIdentifiersUrl.isDone()).toBe(false);
  });

  it('should handle nonce errors', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SRP', MOCK_SRP);

    const { mockNonceUrl, mockPairIdentifiersUrl } = arrangeAuthAPIs({
      mockNonceUrl: {
        status: 400,
        body: { message: 'invalid identifier', error: 'validation-error' },
      },
    });

    const pairing: Pair[] = [
      {
        encryptedStorageKey: 'encrypted<original-storage-key>',
        identifier: '0x12345',
        identifierType: 'SRP',
        signMessage: mockSignMessage,
      },
    ];

    await expect(auth.pairIdentifiers(pairing)).rejects.toThrow(
      NonceRetrievalError,
    );

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockPairIdentifiersUrl.isDone()).toBe(false);
  });
});

describe('Authentication - constructor()', () => {
  it('errors on invalid auth type', async () => {
    expect(() => {
      new JwtBearerAuth(
        {
          env: Env.PRD,
          platform: Platform.EXTENSION,
          type: 'some fake type' as MockVariable,
        },
        {} as MockVariable,
      );
    }).toThrow(UnsupportedAuthTypeError);
  });
});

describe('Authentication - SRP Flow - getAccessToken() & getUserProfile()', () => {
  it('the SRP signIn success', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const { mockNonceUrl, mockSrpLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs();

    // Token
    const accessToken = await auth.getAccessToken();
    expect(accessToken).toBe(MOCK_ACCESS_JWT);

    // User Profile
    const profileResponse = await auth.getUserProfile();
    expect(profileResponse).toBeDefined();

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSrpLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(true);
  });

  it('the SRP signIn failed: nonce error', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const { mockNonceUrl, mockSrpLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockNonceUrl: {
          status: 400,
          body: { message: 'invalid identifier', error: 'validation-error' },
        },
      });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(NonceRetrievalError);

    // User Profile
    await expect(auth.getUserProfile()).rejects.toThrow(NonceRetrievalError);

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSrpLoginUrl.isDone()).toBe(false);
    expect(mockOAuth2TokenUrl.isDone()).toBe(false);
  });

  it('the SRP signIn failed: auth error', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const { mockNonceUrl, mockSrpLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockSrpLoginUrl: {
          status: 401,
          body: {
            message: 'invalid message signature',
            error: 'invalid-auth-request',
          },
        },
      });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);

    // User Profile
    await expect(auth.getUserProfile()).rejects.toThrow(SignInError);

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSrpLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(false);
  });

  it('the SRP signIn failed: oauth2 error', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const { mockNonceUrl, mockSrpLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockOAuth2TokenUrl: {
          status: 400,
          body: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            error_description: 'invalid JWT token',
            error: 'invalid_request',
          },
        },
      });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);

    // User Profile
    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSrpLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(true);
  });

  it('authenticates a new token if current token is out of date', async () => {
    const { auth, mockGetLoginResponse, mockSetLoginResponse } = arrangeAuth(
      'SRP',
      MOCK_SRP,
    );

    const prevDate = new Date();
    prevDate.setDate(prevDate.getDate() - 1); // token is 1 day old (should have expired)
    const mockStoredLogin = createMockStoredProfile();
    mockStoredLogin.token.obtainedAt = prevDate.getTime();
    mockGetLoginResponse.mockResolvedValue(mockStoredLogin);

    arrangeAuthAPIs();

    const result = await auth.getAccessToken();
    expect(result).toBeDefined();

    // Check that the newly stored session is different
    expect(mockSetLoginResponse).toHaveBeenCalled();
    const newlyStoredSession = mockSetLoginResponse.mock.calls[0][0];
    expect(newlyStoredSession.token.obtainedAt > prevDate.getTime()).toBe(true);
  });

  it('getAccessToken() uses stored access token', async () => {
    const { auth, mockGetLoginResponse, mockSetLoginResponse } = arrangeAuth(
      'SRP',
      MOCK_SRP,
    );
    arrangeAuthAPIs();

    const mockStoredLogin = createMockStoredProfile();
    mockGetLoginResponse.mockResolvedValue(mockStoredLogin);

    const result = await auth.getAccessToken();
    expect(result).toBeDefined();

    // Not calling new session, so should not be called
    expect(mockSetLoginResponse).not.toHaveBeenCalled();
  });

  it('getUserProfile() uses stored profile', async () => {
    const { auth, mockGetLoginResponse, mockSetLoginResponse } = arrangeAuth(
      'SRP',
      MOCK_SRP,
    );
    arrangeAuthAPIs();

    const mockStoredLogin = createMockStoredProfile();
    mockGetLoginResponse.mockResolvedValue(mockStoredLogin);

    const result = await auth.getUserProfile();
    expect(result).toBeDefined();

    // Not calling new session, so should not be called
    expect(mockSetLoginResponse).not.toHaveBeenCalled();
  });
});

describe('Authentication - SIWE Flow - getAccessToken(), getUserProfile(), signMessage()', () => {
  it('the SiWE signIn success', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs();

    auth.prepare({
      address: MOCK_ADDRESS,
      chainId: 1,
      signMessage: mockSignMessage,
      domain: 'https://metamask.io',
    });

    // Token
    const accessToken = await auth.getAccessToken();
    expect(accessToken).toBe(MOCK_ACCESS_JWT);

    // User Profile
    const userProfile = await auth.getUserProfile();
    expect(userProfile).toBeDefined();

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSiweLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(true);
  });

  it('the SIWE signIn failed: nonce error', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockNonceUrl: {
          status: 400,
          body: { message: 'invalid identifier', error: 'validation-error' },
        },
      });

    auth.prepare({
      address: MOCK_ADDRESS,
      chainId: 1,
      signMessage: mockSignMessage,
      domain: 'https://metamask.io',
    });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(NonceRetrievalError);

    // User Profile
    await expect(auth.getUserProfile()).rejects.toThrow(NonceRetrievalError);

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSiweLoginUrl.isDone()).toBe(false);
    expect(mockOAuth2TokenUrl.isDone()).toBe(false);
  });

  it('the SIWE signIn failed: auth error', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockSiweLoginUrl: {
          status: 401,
          body: {
            message: 'invalid message signature',
            error: 'invalid-auth-request',
          },
        },
      });

    auth.prepare({
      address: MOCK_ADDRESS,
      chainId: 1,
      signMessage: mockSignMessage,
      domain: 'https://metamask.io',
    });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);

    // User Profile
    await expect(auth.getUserProfile()).rejects.toThrow(SignInError);

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSiweLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(false);
  });

  it('the SIWE signIn failed: oauth2 error', async () => {
    const { auth, mockSignMessage } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockOAuth2TokenUrl: {
          status: 400,
          body: {
            // TODO: Either fix this lint violation or explain why it's necessary to ignore.
            // eslint-disable-next-line @typescript-eslint/naming-convention
            error_description: 'invalid JWT token',
            error: 'invalid_request',
          },
        },
      });

    auth.prepare({
      address: MOCK_ADDRESS,
      chainId: 1,
      signMessage: mockSignMessage,
      domain: 'https://metamask.io',
    });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);

    // User Profile
    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSiweLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(true);
  });

  it('errors when using SIWE flow without using any signers', async () => {
    const { auth } = arrangeAuth('SiWE', MOCK_ADDRESS, { signing: undefined });

    // Token
    await expect(auth.getAccessToken()).rejects.toThrow(ValidationError);

    // User Profile
    await expect(auth.getUserProfile()).rejects.toThrow(ValidationError);

    // Signing
    await expect(auth.signMessage('metamask:test message')).rejects.toThrow(
      ValidationError,
    );
  });

  it('authenticates a new token if current token is out of date', async () => {
    const {
      auth,
      mockGetLoginResponse,
      mockSetLoginResponse,
      mockSignMessage,
    } = arrangeAuth('SiWE', MOCK_ADDRESS);

    auth.prepare({
      address: MOCK_ADDRESS,
      chainId: 1,
      signMessage: mockSignMessage,
      domain: 'https://metamask.io',
    });

    const prevDate = new Date();
    prevDate.setDate(prevDate.getDate() - 1); // token is 1 day old (should have expired)
    const mockStoredLogin = createMockStoredProfile();
    mockStoredLogin.token.obtainedAt = prevDate.getTime();
    mockGetLoginResponse.mockResolvedValue(mockStoredLogin);

    arrangeAuthAPIs();

    const result = await auth.getAccessToken();
    expect(result).toBeDefined();

    // Check that the newly stored session is different
    expect(mockSetLoginResponse).toHaveBeenCalled();
    const newlyStoredSession = mockSetLoginResponse.mock.calls[0][0];
    expect(newlyStoredSession.token.obtainedAt > prevDate.getTime()).toBe(true);
  });

  it('getAccessToken() uses stored access token', async () => {
    const { auth, mockGetLoginResponse, mockSetLoginResponse } = arrangeAuth(
      'SiWE',
      MOCK_ADDRESS,
    );
    arrangeAuthAPIs();

    const mockStoredLogin = createMockStoredProfile();
    mockGetLoginResponse.mockResolvedValue(mockStoredLogin);

    const result = await auth.getAccessToken();
    expect(result).toBeDefined();

    // Not calling new session, so should not be called
    expect(mockSetLoginResponse).not.toHaveBeenCalled();
  });

  it('getUserProfile() uses stored profile', async () => {
    const { auth, mockGetLoginResponse, mockSetLoginResponse } = arrangeAuth(
      'SiWE',
      MOCK_ADDRESS,
    );
    arrangeAuthAPIs();

    const mockStoredLogin = createMockStoredProfile();
    mockGetLoginResponse.mockResolvedValue(mockStoredLogin);

    const result = await auth.getUserProfile();
    expect(result).toBeDefined();

    // Not calling new session, so should not be called
    expect(mockSetLoginResponse).not.toHaveBeenCalled();
  });
});

describe('Authentication - SRP Default Flow - signMessage() & getIdentifier()', () => {
  const arrangeProvider = () => {
    const mockRequest = jest.fn().mockImplementation((arg) => {
      if (arg.params.request.method === 'getPublicKey') {
        return MOCK_SRP;
      }

      if (arg.params.request.method === 'signMessage') {
        return 'MOCK_SRP_SIGNATURE';
      }

      throw new Error('MOCK - unsupported mock implementation');
    });

    const mockGetProvider = jest
      .spyOn(Eip6963MetamaskProvider, 'getMetaMaskProviderEIP6963')
      .mockResolvedValue({
        request: mockRequest,
      });

    return { mockRequest, mockGetProvider };
  };

  it('errors if unable to get provider', async () => {
    arrangeAuthAPIs();
    const { auth } = arrangeAuth('SRP', MOCK_SRP, { signing: undefined });
    const { mockGetProvider } = arrangeProvider();
    mockGetProvider.mockResolvedValue(null);

    // Sign Message
    await expect(auth.signMessage('metamask:test message')).rejects.toThrow(
      ValidationError,
    );

    // Get Identifier
    await expect(auth.getIdentifier()).rejects.toThrow(ValidationError);
  });

  it('fails to sign a bad message format', async () => {
    arrangeAuthAPIs();
    const { auth } = arrangeAuth('SRP', MOCK_SRP, { signing: undefined });
    arrangeProvider();

    // Sign Message
    await expect(auth.signMessage('not formatted message')).rejects.toThrow(
      ValidationError,
    );
  });

  it('successfully uses default SRP flow', async () => {
    arrangeAuthAPIs();
    const { auth } = arrangeAuth('SRP', MOCK_SRP, { signing: undefined });
    arrangeProvider();

    const accessToken = await auth.getAccessToken();
    expect(accessToken).toBeDefined();

    const profile = await auth.getUserProfile();
    expect(profile).toBeDefined();

    const message = await auth.signMessage('metamask:test message');
    expect(message).toBeDefined();
  });
});

/**
 * Mock Utility to create a mock stored profile
 *
 * @returns mock Login Response
 */
function createMockStoredProfile(): LoginResponse {
  return {
    token: {
      accessToken: MOCK_SRP_LOGIN_RESPONSE.token,
      expiresIn: MOCK_SRP_LOGIN_RESPONSE.expires_in,
      obtainedAt: Date.now(),
    },
    profile: {
      identifierId: MOCK_SRP_LOGIN_RESPONSE.profile.identifier_id,
      profileId: MOCK_SRP_LOGIN_RESPONSE.profile.profile_id,
      metaMetricsId: MOCK_SRP_LOGIN_RESPONSE.profile.metametrics_id,
    },
  };
}
