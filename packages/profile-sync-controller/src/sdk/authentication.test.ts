import {
  MOCK_ACCESS_JWT,
  MOCK_SRP_LOGIN_RESPONSE,
  arrangeAuthAPIs,
} from './__fixtures__/mock-auth';
import type { MockVariable } from './__fixtures__/test-utils';
import { arrangeAuth } from './__fixtures__/test-utils';
import {
  NonceRetrievalError,
  SignInError,
  UnsupportedAuthTypeError,
  ValidationError,
} from './errors';
import * as Eip6963MetamaskProvider from './utils/eip-6963-metamask-provider';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('Authentication - constructor()', () => {
  it('errors on invalid auth type', async () => {
    expect(() => {
      arrangeAuth('FakeType' as MockVariable, MOCK_SRP);
    }).toThrow(UnsupportedAuthTypeError);
  });
});

describe('Authentication - SRP Flow - getAccessToken() & getUserProfile()', () => {
  it('the SRP signIn success', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const { mockNonceUrl, mockSrpLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs();

    // Token
    const tokenResponse = await auth.getAccessToken();
    expect(tokenResponse.accessToken).toBe(MOCK_ACCESS_JWT);

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

  it('uses authenticates a new token if current token is out of date', async () => {
    const { auth, mockGetLoginResponse } = arrangeAuth('SRP', MOCK_SRP);

    const prevDate = new Date();
    prevDate.setDate(prevDate.getDate() - 1); // token is 1 day old (should have expired)
    mockGetLoginResponse.mockResolvedValue({
      token: {
        accessToken: MOCK_SRP_LOGIN_RESPONSE.token,
        expiresIn: MOCK_SRP_LOGIN_RESPONSE.expires_in,
        obtainedAt: prevDate.getTime(),
      },
      profile: {
        identifierId: MOCK_SRP_LOGIN_RESPONSE.profile.identifier_id,
        profileId: MOCK_SRP_LOGIN_RESPONSE.profile.profile_id,
        metaMetricsId: MOCK_SRP_LOGIN_RESPONSE.profile.metametrics_id,
      },
    });

    arrangeAuthAPIs();

    const result = await auth.getAccessToken();
    expect(result.obtainedAt > prevDate.getTime()).toBe(true);
  });

  it('uses current token if in date', async () => {
    const { auth, mockGetLoginResponse } = arrangeAuth('SRP', MOCK_SRP);

    const currentTokenDate = Date.now();

    mockGetLoginResponse.mockResolvedValue({
      token: {
        accessToken: MOCK_SRP_LOGIN_RESPONSE.token,
        expiresIn: MOCK_SRP_LOGIN_RESPONSE.expires_in,
        obtainedAt: currentTokenDate,
      },
      profile: {
        identifierId: MOCK_SRP_LOGIN_RESPONSE.profile.identifier_id,
        profileId: MOCK_SRP_LOGIN_RESPONSE.profile.profile_id,
        metaMetricsId: MOCK_SRP_LOGIN_RESPONSE.profile.metametrics_id,
      },
    });

    arrangeAuthAPIs();

    const result = await auth.getAccessToken();
    expect(result).toBeDefined();
    expect(result.obtainedAt).toBe(currentTokenDate);
  });
});

describe('Authentication - SIWE Flow - getAccessToken(), getUserProfile(), signMessage()', () => {
  it('the SiWE signIn success', async () => {
    const { auth } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs();

    auth.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
      domain: 'https://metamask.io',
    });

    // Token
    const tokenResponse = await auth.getAccessToken();
    expect(tokenResponse.accessToken).toBe(MOCK_ACCESS_JWT);

    // User Profile
    const userProfile = await auth.getUserProfile();
    expect(userProfile).toBeDefined();

    // API
    expect(mockNonceUrl.isDone()).toBe(true);
    expect(mockSiweLoginUrl.isDone()).toBe(true);
    expect(mockOAuth2TokenUrl.isDone()).toBe(true);
  });

  it('the SIWE signIn failed: nonce error', async () => {
    const { auth } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockNonceUrl: {
          status: 400,
          body: { message: 'invalid identifier', error: 'validation-error' },
        },
      });

    auth.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
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
    const { auth } = arrangeAuth('SiWE', MOCK_ADDRESS);

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

    auth.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
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
    const { auth } = arrangeAuth('SiWE', MOCK_ADDRESS);

    const { mockNonceUrl, mockSiweLoginUrl, mockOAuth2TokenUrl } =
      arrangeAuthAPIs({
        mockOAuth2TokenUrl: {
          status: 400,
          body: {
            error_description: 'invalid JWT token',
            error: 'invalid_request',
          },
        },
      });

    auth.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
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
