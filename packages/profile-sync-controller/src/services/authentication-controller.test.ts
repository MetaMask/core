/* eslint-disable jsdoc/require-returns */
/* eslint-disable jsdoc/require-description */
/* eslint-disable jsdoc/require-jsdoc */
import {
  MOCK_ACCESS_TOKEN,
  MOCK_JWT,
  MOCK_NONCE,
  mockEndpointAccessToken,
  mockEndpointGetNonce,
  mockEndpointLogin,
} from '../../tests/mocks/mockAuthenticationServices';
import {
  createLoginRawMessage,
  getAccessToken,
  getNonce,
  login,
} from './authentication-controller';

const MOCK_METAMETRICS_ID = '0x123';

describe('authentication/services.ts - getNonce() tests', () => {
  it('returns nonce on valid request', async () => {
    const mockNonceEndpoint = mockEndpointGetNonce();
    const response = await getNonce('MOCK_PUBLIC_KEY');

    mockNonceEndpoint.done();
    expect(response).toBe(MOCK_NONCE);
  });

  it('returns null if request is invalid', async () => {
    async function testInvalidResponse(
      status: number,
      body: Record<string, unknown>,
    ) {
      const mockNonceEndpoint = mockEndpointGetNonce({ status, body });
      const response = await getNonce('MOCK_PUBLIC_KEY');

      mockNonceEndpoint.done();
      expect(response).toBeNull();
    }

    await testInvalidResponse(500, { error: 'mock server error' });
    await testInvalidResponse(400, { error: 'mock bad request' });
  });
});

describe('authentication/services.ts - login() tests', () => {
  it('returns single-use jwt if successful login', async () => {
    const mockLoginEndpoint = mockEndpointLogin();
    const response = await login(
      'mock raw message',
      'mock signature',
      MOCK_METAMETRICS_ID,
    );

    mockLoginEndpoint.done();
    expect(response?.token).toBe(MOCK_JWT);
    expect(response?.profile).toBeDefined();
  });

  it('returns null if request is invalid', async () => {
    async function testInvalidResponse(
      status: number,
      body: Record<string, unknown>,
    ) {
      const mockLoginEndpoint = mockEndpointLogin({ status, body });
      const response = await login(
        'mock raw message',
        'mock signature',
        MOCK_METAMETRICS_ID,
      );

      mockLoginEndpoint.done();
      expect(response).toBeNull();
    }

    await testInvalidResponse(500, { error: 'mock server error' });
    await testInvalidResponse(400, { error: 'mock bad request' });
  });
});

describe('authentication/services.ts - getAccessToken() tests', () => {
  it('returns access token jwt if successful OIDC token request', async () => {
    const mockLoginEndpoint = mockEndpointAccessToken();
    const response = await getAccessToken('mock single-use jwt');

    mockLoginEndpoint.done();
    expect(response).toBe(MOCK_ACCESS_TOKEN);
  });

  it('returns null if request is invalid', async () => {
    async function testInvalidResponse(
      status: number,
      body: Record<string, unknown>,
    ) {
      const mockLoginEndpoint = mockEndpointAccessToken({ status, body });
      const response = await getAccessToken('mock single-use jwt');

      mockLoginEndpoint.done();
      expect(response).toBeNull();
    }

    await testInvalidResponse(500, { error: 'mock server error' });
    await testInvalidResponse(400, { error: 'mock bad request' });
  });
});

describe('authentication/services.ts - createLoginRawMessage() tests', () => {
  it('creates the raw message format for login request', () => {
    const message = createLoginRawMessage('NONCE', 'PUBLIC_KEY');
    expect(message).toBe('metamask:NONCE:PUBLIC_KEY');
  });
});
