import {
  MOCK_ACCESS_JWT,
  handleMockNonce,
  handleMockOAuth2Token,
  handleMockSiweLogin,
  handleMockSrpLogin,
} from './__fixtures__/mock-auth';
import { arrangeAuth } from './__fixtures__/test-utils';
import { NonceRetrievalError, SignInError } from './errors';

const MOCK_SRP = '0x6265617665726275696c642e6f7267';
const MOCK_ADDRESS = '0x68757d15a4d8d1421c17003512AFce15D3f3FaDa';

describe('Authentication', () => {
  it('the SRP signIn success', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const mockMockNonceUrl = handleMockNonce();
    const mockMockSrpLoginUrl = handleMockSrpLogin();
    const mockMockOAuth2TokenUrl = handleMockOAuth2Token();

    const tokenResponse = await auth.getAccessToken();
    expect(mockMockNonceUrl.isDone()).toBe(true);
    expect(mockMockSrpLoginUrl.isDone()).toBe(true);
    expect(mockMockOAuth2TokenUrl.isDone()).toBe(true);

    expect(tokenResponse.accessToken).toBe(MOCK_ACCESS_JWT);
    expect(tokenResponse.expiresIn).toBe(3600);
  });

  it('the SRP signIn failed: nonce error', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const mockMockNonceUrl = handleMockNonce({
      status: 400,
      body: { message: 'invalid identifier', error: 'validation-error' },
    });
    const mockMockSrpLoginUrl = handleMockSrpLogin();
    const mockMockOAuth2TokenUrl = handleMockOAuth2Token();

    await expect(auth.getAccessToken()).rejects.toThrow(NonceRetrievalError);
    expect(mockMockNonceUrl.isDone()).toBe(true);
    expect(mockMockSrpLoginUrl.isDone()).toBe(false);
    expect(mockMockOAuth2TokenUrl.isDone()).toBe(false);
  });

  it('the SRP signIn failed: auth error', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const mockMockNonceUrl = handleMockNonce();
    const mockMockSrpLoginUrl = handleMockSrpLogin({
      status: 401,
      body: {
        message: 'invalid message signature',
        error: 'invalid-auth-request',
      },
    });
    const mockMockOAuth2TokenUrl = handleMockOAuth2Token();

    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);
    expect(mockMockNonceUrl.isDone()).toBe(true);
    expect(mockMockSrpLoginUrl.isDone()).toBe(true);
    expect(mockMockOAuth2TokenUrl.isDone()).toBe(false);
  });

  it('the SRP signIn failed: oauth2 error', async () => {
    const { auth } = arrangeAuth('SRP', MOCK_SRP);

    const mockMockNonceUrl = handleMockNonce();
    const mockMockSrpLoginUrl = handleMockSrpLogin();
    const mockMockOAuth2TokenUrl = handleMockOAuth2Token({
      status: 400,
      body: {
        error_description: 'invalid JWT token',
        error: 'invalid_request',
      },
    });

    await expect(auth.getAccessToken()).rejects.toThrow(SignInError);
    expect(mockMockNonceUrl.isDone()).toBe(true);
    expect(mockMockSrpLoginUrl.isDone()).toBe(true);
    expect(mockMockOAuth2TokenUrl.isDone()).toBe(true);
  });

  it('the SiWE signIn success', async () => {
    const { auth } = arrangeAuth('SIWE', MOCK_ADDRESS);

    const mockMockNonceUrl = handleMockNonce();
    const mockMockSiweLoginUrl = handleMockSiweLogin();
    const mockMockOAuth2TokenUrl = handleMockOAuth2Token();

    auth.initialize({
      address: MOCK_ADDRESS,
      chainId: 1,
      domain: 'https://metamask.io',
    });
    const tokenResponse = await auth.getAccessToken();
    expect(mockMockNonceUrl.isDone()).toBe(true);
    expect(mockMockSiweLoginUrl.isDone()).toBe(true);
    expect(mockMockOAuth2TokenUrl.isDone()).toBe(true);

    expect(tokenResponse.accessToken).toBe(MOCK_ACCESS_JWT);
    expect(tokenResponse.expiresIn).toBe(3600);
  });
});
