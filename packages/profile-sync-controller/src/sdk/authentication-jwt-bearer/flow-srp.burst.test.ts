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

describe('SRPJwtBearerAuth burst protection', () => {
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: 'test' as any,
    platform: 'extension' as any,
  };

  const createAuth = (overrides?: {
    minIntervalMs?: number;
    cooldownDefaultMs?: number;
    maxRetries?: number;
  }) => {
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
    });

    return { auth, store };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNonce.mockResolvedValue({
      nonce: 'nonce-1',
      identifier: 'identifier-1',
      expiresIn: 60,
    });
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        profileId: 'p1',
        metametrics_id: 'm1',
        identifier_id: 'i1',
      } as any,
    });
    mockAuthorizeOIDC.mockResolvedValue({
      accessToken: 'access',
      expiresIn: 60,
      obtainedAt: Date.now(),
    });
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

  test('throttles sequential login attempts within min interval', async () => {
    const { auth, store } = createAuth();

    await auth.getAccessToken();

    // Clear the store to force a new login
    store.value = null;

    await auth.getAccessToken();

    expect(mockGetNonce).toHaveBeenCalledTimes(2);
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);

    // Verify that throttling delay was applied
    expect(mockDelay).toHaveBeenCalled();
  });
  test('applies cooldown and retries once on 429 with Retry-After', async () => {
    const { auth } = createAuth();

    let first = true;
    mockAuthenticate.mockImplementation(async () => {
      if (first) {
        first = false;
        const e: any = new Error('rate limited');
        e.name = 'RateLimitedError';
        e.status = 429;
        e.retryAfterMs = 20;
        throw e;
      }
      return {
        token: 'jwt-token',
        expiresIn: 60,
        profile: {
          profileId: 'p1',
          metametrics_id: 'm1',
          identifier_id: 'i1',
        } as any,
      };
    });

    const p1 = auth.getAccessToken();
    const p2 = auth.getAccessToken();

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('access');
    expect(t2).toBe('access');

    // Should retry after rate limit error
    expect(mockAuthenticate).toHaveBeenCalledTimes(2);
    // Should apply cooldown delay
    expect(mockDelay).toHaveBeenCalled();
  });

  test('throws transient errors immediately without retry', async () => {
    const { auth, store } = createAuth({
      maxRetries: 1,
      minIntervalMs: 10,
    });

    // Force a login by clearing session
    store.value = null;

    const transientError = new Error('transient network error');
    mockAuthenticate.mockRejectedValue(transientError);

    await expect(auth.getAccessToken()).rejects.toThrow(
      'transient network error',
    );

    // Should NOT retry on transient errors
    expect(mockAuthenticate).toHaveBeenCalledTimes(1);
  });
});
