import { SRPJwtBearerAuth } from './flow-srp';
import type { AuthConfig } from './types';
import { AuthType } from './types';

jest.setTimeout(15000);

// Mock the time utilities to avoid real delays in tests
jest.mock('./utils/time', () => ({
  delay: jest.fn(),
}));

// Import after mocking to get the mocked version
import * as timeUtils from './utils/time';
const mockDelay = timeUtils.delay as jest.MockedFunction<
  typeof timeUtils.delay
>;

// Mock services
const mockGetNonce = jest.fn();
const mockAuthenticate = jest.fn();
const mockAuthorizeOIDC = jest.fn();

jest.mock('./services', () => ({
  authenticate: (...args: any[]) => mockAuthenticate(...args),
  authorizeOIDC: (...args: any[]) => mockAuthorizeOIDC(...args),
  getNonce: (...args: any[]) => mockGetNonce(...args),
  getUserProfileLineage: jest.fn(),
}));

describe('SRPJwtBearerAuth rate limit handling', () => {
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: 'test' as any,
    platform: 'extension' as any,
  };

  // Mock data constants
  const MOCK_PROFILE = {
    profileId: 'p1',
    metametrics_id: 'm1',
    identifier_id: 'i1',
  } as any;

  const MOCK_NONCE_RESPONSE = {
    nonce: 'nonce-1',
    identifier: 'identifier-1',
    expiresIn: 60,
  };

  const MOCK_AUTH_RESPONSE = {
    token: 'jwt-token',
    expiresIn: 60,
    profile: MOCK_PROFILE,
  };

  const MOCK_OIDC_RESPONSE = {
    accessToken: 'access',
    expiresIn: 60,
    obtainedAt: Date.now(),
  };

  // Helper to create a rate limit error
  const createRateLimitError = (retryAfterMs?: number) => {
    const error: any = new Error('rate limited');
    error.name = 'RateLimitedError';
    error.status = 429;
    if (retryAfterMs !== undefined) {
      error.retryAfterMs = retryAfterMs;
    }
    return error;
  };

  const createAuth = (overrides?: { cooldownDefaultMs?: number }) => {
    const store: any = { value: null as any };

    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async () => store.value,
        setLoginResponse: async (val) => {
          store.value = val;
        },
      },
      signing: {
        getIdentifier: async () => 'identifier-1',
        signMessage: async () => 'signature-1',
      },
      rateLimitRetry: overrides,
    });

    return { auth, store };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNonce.mockResolvedValue(MOCK_NONCE_RESPONSE);
    mockAuthenticate.mockResolvedValue(MOCK_AUTH_RESPONSE);
    mockAuthorizeOIDC.mockResolvedValue(MOCK_OIDC_RESPONSE);
  });

  test('coalesces concurrent calls into a single login attempt', async () => {
    const { auth } = createAuth();

    const p1 = auth.getAccessToken();
    const p2 = auth.getAccessToken();
    const p3 = auth.getAccessToken();

    const [t1, t2, t3] = await Promise.all([p1, p2, p3]);

    expect(t1).toBe('access');
    expect(t2).toBe('access');
    expect(t3).toBe('access');

    // single sequence of service calls
    expect(mockGetNonce).toHaveBeenCalledTimes(1);
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    expect(mockAuthorizeOIDC).toHaveBeenCalledTimes(1);
  });

  test('applies cooldown and retries once on 429 with Retry-After', async () => {
    const { auth } = createAuth({ cooldownDefaultMs: 20 });

    let first = true;
    mockAuthenticate.mockImplementation(async () => {
      if (first) {
        first = false;
        throw createRateLimitError(20);
      }
      return MOCK_AUTH_RESPONSE;
    });

    const p1 = auth.getAccessToken();
    const p2 = auth.getAccessToken();

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('access');
    expect(t2).toBe('access');

    // Should retry after rate limit error
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    // Should apply cooldown delay
    expect(mockDelay).toHaveBeenCalledWith(20);
  });

  test('throws 429 after exhausting one retry', async () => {
    const { auth } = createAuth({ cooldownDefaultMs: 20 });

    mockAuthenticate.mockRejectedValue(createRateLimitError(20));

    await expect(auth.getAccessToken()).rejects.toThrow('rate limited');

    // Should attempt initial + one retry = 2 attempts
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    // Should apply cooldown delay once
    expect(mockDelay).toHaveBeenCalledTimes(1);
  });

  test('throws transient errors immediately without retry', async () => {
    const { auth, store } = createAuth();

    // Force a login by clearing session
    store.value = null;

    const transientError = new Error('transient network error');
    mockAuthenticate.mockRejectedValue(transientError);

    await expect(auth.getAccessToken()).rejects.toThrow(
      'transient network error',
    );

    // Should NOT retry on transient errors
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
    // Should NOT apply any delay
    expect(mockDelay).not.toHaveBeenCalled();
  });
});
