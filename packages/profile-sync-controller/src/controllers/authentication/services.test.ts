import {
  MOCK_ACCESS_TOKEN,
  MOCK_JWT,
  MOCK_NONCE,
} from './__fixtures__/mockResponses';
import {
  mockEndpointAccessToken,
  mockEndpointGetNonce,
  mockEndpointLogin,
} from './__fixtures__/mockServices';
import {
  createLoginRawMessage,
  getAccessToken,
  getNonce,
  login,
} from './services';

const MOCK_METAMETRICS_ID = '0x123';
const clientMetaMetrics = {
  metametricsId: MOCK_METAMETRICS_ID,
  agent: 'extension' as const,
};

describe('authentication/services.ts - getNonce() tests', () => {
  it('returns nonce on valid request', async () => {
    const mockNonceEndpoint = mockEndpointGetNonce();
    const response = await getNonce('MOCK_PUBLIC_KEY');

    mockNonceEndpoint.done();
    expect(response).toBe(MOCK_NONCE);
  });

  it('returns null if request is invalid', async () => {
    const testInvalidResponse = async (
      status: number,
      body: Record<string, unknown>,
    ) => {
      const mockNonceEndpoint = mockEndpointGetNonce({ status, body });
      const response = await getNonce('MOCK_PUBLIC_KEY');

      mockNonceEndpoint.done();
      expect(response).toBeNull();
    };

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
      clientMetaMetrics,
    );

    mockLoginEndpoint.done();
    expect(response?.token).toBe(MOCK_JWT);
    expect(response?.profile).toBeDefined();
  });

  it('returns null if request is invalid', async () => {
    const testInvalidResponse = async (
      status: number,
      body: Record<string, unknown>,
    ) => {
      const mockLoginEndpoint = mockEndpointLogin({ status, body });
      const response = await login(
        'mock raw message',
        'mock signature',
        clientMetaMetrics,
      );

      mockLoginEndpoint.done();
      expect(response).toBeNull();
    };

    await testInvalidResponse(500, { error: 'mock server error' });
    await testInvalidResponse(400, { error: 'mock bad request' });
  });
});

describe('authentication/services.ts - getAccessToken() tests', () => {
  it('returns access token jwt if successful OIDC token request', async () => {
    const mockLoginEndpoint = mockEndpointAccessToken();
    const response = await getAccessToken('mock single-use jwt', 'extension');

    mockLoginEndpoint.done();
    expect(response).toBe(MOCK_ACCESS_TOKEN);
  });

  it('returns null if request is invalid', async () => {
    const testInvalidResponse = async (
      status: number,
      body: Record<string, unknown>,
    ) => {
      const mockLoginEndpoint = mockEndpointAccessToken({ status, body });
      const response = await getAccessToken('mock single-use jwt', 'extension');

      mockLoginEndpoint.done();
      expect(response).toBeNull();
    };

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
