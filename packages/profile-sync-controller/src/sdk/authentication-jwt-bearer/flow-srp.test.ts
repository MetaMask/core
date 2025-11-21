import { SRPJwtBearerAuth } from './flow-srp';
import {
  AuthType,
  type AuthConfig,
  type LoginResponse,
  type UserProfile,
} from './types';
import * as timeUtils from './utils/time';
import { Env, Platform } from '../../shared/env';
import { RateLimitedError } from '../errors';

jest.setTimeout(15000);

// Mock the time utilities to avoid real delays in tests
jest.mock('./utils/time', () => ({
  delay: jest.fn(),
}));

const mockDelay = timeUtils.delay as jest.MockedFunction<
  typeof timeUtils.delay
>;

// Mock services
const mockGetNonce = jest.fn();
const mockAuthenticate = jest.fn();
const mockAuthorizeOIDC = jest.fn();

jest.mock('./services', () => ({
  authenticate: (...args: unknown[]) => mockAuthenticate(...args),
  authorizeOIDC: (...args: unknown[]) => mockAuthorizeOIDC(...args),
  getNonce: (...args: unknown[]) => mockGetNonce(...args),
  getUserProfileLineage: jest.fn(),
}));

describe('SRPJwtBearerAuth rate limit handling', () => {
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: Env.DEV,
    platform: Platform.EXTENSION,
  };

  // Mock data constants
  const MOCK_PROFILE: UserProfile = {
    profileId: 'p1',
    metaMetricsId: 'm1',
    identifierId: 'i1',
  };

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
  const createRateLimitError = (retryAfterMs?: number) =>
    new RateLimitedError('rate limited', retryAfterMs);

  const createAuth = (overrides?: {
    cooldownDefaultMs?: number;
    maxLoginRetries?: number;
  }) => {
    const store: { value: LoginResponse | null } = { value: null };

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

  it('coalesces concurrent calls into a single login attempt', async () => {
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

  it('applies cooldown and retries once on 429 with Retry-After', async () => {
    const cooldownDefaultMs = 20;
    const maxLoginRetries = 1;
    const { auth } = createAuth({ cooldownDefaultMs, maxLoginRetries });

    mockAuthenticate
      .mockRejectedValueOnce(createRateLimitError(cooldownDefaultMs))
      .mockResolvedValueOnce(MOCK_AUTH_RESPONSE);

    const p1 = auth.getAccessToken();
    const p2 = auth.getAccessToken();

    const [t1, t2] = await Promise.all([p1, p2]);
    expect(t1).toBe('access');
    expect(t2).toBe('access');

    // Should retry after rate limit error
    expect(mockAuthenticate).toHaveBeenCalledTimes(maxLoginRetries + 1);
    // Should apply cooldown delay
    expect(mockDelay).toHaveBeenCalledWith(cooldownDefaultMs);
  });

  it('throws 429 after exhausting all retries', async () => {
    const cooldownDefaultMs = 20;
    const maxLoginRetries = 1;
    const { auth } = createAuth({ cooldownDefaultMs, maxLoginRetries });

    mockAuthenticate.mockRejectedValue(createRateLimitError(cooldownDefaultMs));
    await expect(auth.getAccessToken()).rejects.toThrow('rate limited');

    // Should attempt initial + maxLoginRetries
    expect(mockAuthenticate).toHaveBeenCalledTimes(1 + maxLoginRetries);
    // Should apply cooldown delay
    expect(mockDelay).toHaveBeenCalledTimes(maxLoginRetries);
  });

  it('throws transient errors immediately without retry', async () => {
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
