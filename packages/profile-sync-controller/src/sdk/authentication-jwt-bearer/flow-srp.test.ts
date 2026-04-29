import { Env, Platform } from '../../shared/env';
import { RateLimitedError } from '../errors';
import { SRPJwtBearerAuth } from './flow-srp';
import { AuthType } from './types';
import type { AuthConfig, LoginResponse, UserProfile } from './types';
import * as timeUtils from './utils/time';

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
  authenticate: (...args: unknown[]): unknown => mockAuthenticate(...args),
  authorizeOIDC: (...args: unknown[]): unknown => mockAuthorizeOIDC(...args),
  getNonce: (...args: unknown[]): unknown => mockGetNonce(...args),
  getUserProfileLineage: jest.fn(),
}));

// Mock computeIdentifierId
const MOCK_COMPUTED_IDENTIFIER_ID = 'computed-identifier-hash';
const mockComputeIdentifierId = jest.fn();
jest.mock('./utils/identifier', () => ({
  computeIdentifierId: (...args: unknown[]): unknown =>
    mockComputeIdentifierId(...args),
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
    canonicalProfileId: 'p1',
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
  const createRateLimitError = (retryAfterMs?: number): RateLimitedError =>
    new RateLimitedError('rate limited', retryAfterMs);

  const createAuth = (overrides?: {
    cooldownDefaultMs?: number;
    maxLoginRetries?: number;
  }): { auth: SRPJwtBearerAuth; store: { value: LoginResponse | null } } => {
    const store: { value: LoginResponse | null } = { value: null };

    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async (): Promise<LoginResponse | null> =>
          store.value,
        setLoginResponse: async (val): Promise<void> => {
          store.value = val;
        },
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'identifier-1',
        signMessage: async (): Promise<string> => 'signature-1',
      },
      rateLimitRetry: overrides,
    });

    return { auth, store };
  };

  beforeEach((): void => {
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

  it('triggers a fresh login when the cached JWT exp claim is in the past', async () => {
    const expiredExp = Math.floor(Date.now() / 1000) - 3600;
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ exp: expiredExp }));
    const expiredJwt = `${header}.${payload}.fake-sig`;

    const { auth, store } = createAuth();
    store.value = {
      profile: MOCK_PROFILE,
      token: {
        accessToken: expiredJwt,
        expiresIn: 86400,
        obtainedAt: Date.now(),
      },
    };

    const token = await auth.getAccessToken();
    expect(token).toBe('access');
    expect(mockGetNonce).toHaveBeenCalledTimes(1);
  });

  it('returns the cached token when JWT exp claim is still in the future', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ exp: futureExp }));
    const validJwt = `${header}.${payload}.fake-sig`;

    const { auth, store } = createAuth();
    store.value = {
      profile: MOCK_PROFILE,
      token: {
        accessToken: validJwt,
        expiresIn: 86400,
        obtainedAt: Date.now(),
      },
    };

    const token = await auth.getAccessToken();
    expect(token).toBe(validJwt);
    expect(mockGetNonce).not.toHaveBeenCalled();
  });

  it('forces re-login when cached session is missing canonicalProfileId', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify({ exp: futureExp }));
    const validJwt = `${header}.${payload}.fake-sig`;

    const { auth, store } = createAuth();
    store.value = {
      profile: {
        profileId: 'p1',
        metaMetricsId: 'm1',
        identifierId: 'i1',
        canonicalProfileId: '',
      },
      token: {
        accessToken: validJwt,
        expiresIn: 86400,
        obtainedAt: Date.now(),
      },
    };

    const token = await auth.getAccessToken();
    expect(token).toBe('access');
    expect(mockGetNonce).toHaveBeenCalledTimes(1);
  });
});

describe('SRPJwtBearerAuth profileId resolution', () => {
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: Env.DEV,
    platform: Platform.EXTENSION,
  };

  const MOCK_NONCE_RESPONSE = {
    nonce: 'nonce-1',
    identifier: 'identifier-1',
    expiresIn: 60,
  };

  const MOCK_OIDC_RESPONSE = {
    accessToken: 'access-token',
    expiresIn: 60,
    obtainedAt: Date.now(),
  };

  const createAuth = (): {
    auth: SRPJwtBearerAuth;
    store: { value: LoginResponse | null };
  } => {
    const store: { value: LoginResponse | null } = { value: null };

    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async (): Promise<LoginResponse | null> =>
          store.value,
        setLoginResponse: async (val): Promise<void> => {
          store.value = val;
        },
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'MOCK_PUBLIC_KEY',
        signMessage: async (): Promise<string> => 'signature-1',
      },
    });

    return { auth, store };
  };

  beforeEach((): void => {
    jest.clearAllMocks();
    mockGetNonce.mockResolvedValue(MOCK_NONCE_RESPONSE);
    mockAuthorizeOIDC.mockResolvedValue(MOCK_OIDC_RESPONSE);
    mockComputeIdentifierId.mockReturnValue(MOCK_COMPUTED_IDENTIFIER_ID);
  });

  it('resolves original profileId from aliases when paired', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'canonical-profile-id',
        canonicalProfileId: 'canonical-profile-id',
      },
      profileAliases: [
        {
          aliasProfileId: 'original-profile-id',
          canonicalProfileId: 'canonical-profile-id',
          identifierIds: [{ id: MOCK_COMPUTED_IDENTIFIER_ID, type: 'SRP' }],
        },
        {
          aliasProfileId: 'other-original-id',
          canonicalProfileId: 'canonical-profile-id',
          identifierIds: [{ id: 'other-hash', type: 'SRP' }],
        },
      ],
    });

    const { auth } = createAuth();
    const profile = await auth.getUserProfile();

    expect(profile.profileId).toBe('original-profile-id');
    expect(profile.canonicalProfileId).toBe('canonical-profile-id');
    expect(mockComputeIdentifierId).toHaveBeenCalledWith(
      'MOCK_PUBLIC_KEY',
      Env.DEV,
    );
  });

  it('prefers single-identifier alias over multi-identifier absorbed canonical', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'top-canonical',
        canonicalProfileId: 'top-canonical',
      },
      profileAliases: [
        {
          aliasProfileId: 'absorbed-canonical',
          canonicalProfileId: 'top-canonical',
          identifierIds: [
            { id: 'other-hash', type: 'SRP' },
            { id: MOCK_COMPUTED_IDENTIFIER_ID, type: 'SRP' },
          ],
        },
        {
          aliasProfileId: 'true-original',
          canonicalProfileId: 'top-canonical',
          identifierIds: [{ id: MOCK_COMPUTED_IDENTIFIER_ID, type: 'SRP' }],
        },
      ],
    });

    const { auth } = createAuth();
    const profile = await auth.getUserProfile();

    expect(profile.profileId).toBe('true-original');
    expect(profile.canonicalProfileId).toBe('top-canonical');
  });

  it('falls back to multi-identifier alias when no single-identifier leaf exists', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'top-canonical',
        canonicalProfileId: 'top-canonical',
      },
      profileAliases: [
        {
          aliasProfileId: 'former-canonical-now-alias',
          canonicalProfileId: 'top-canonical',
          identifierIds: [
            { id: MOCK_COMPUTED_IDENTIFIER_ID, type: 'SRP' },
            { id: 'absorbed-hash', type: 'SRP' },
          ],
        },
      ],
    });

    const { auth } = createAuth();
    const profile = await auth.getUserProfile();

    expect(profile.profileId).toBe('former-canonical-now-alias');
    expect(profile.canonicalProfileId).toBe('top-canonical');
  });

  it('keeps canonical as profileId when no alias matches', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'canonical-profile-id',
        canonicalProfileId: 'canonical-profile-id',
      },
      profileAliases: [
        {
          aliasProfileId: 'other-original-id',
          canonicalProfileId: 'canonical-profile-id',
          identifierIds: [{ id: 'non-matching-hash', type: 'SRP' }],
        },
      ],
    });

    const { auth } = createAuth();
    const profile = await auth.getUserProfile();

    expect(profile.profileId).toBe('canonical-profile-id');
    expect(profile.canonicalProfileId).toBe('canonical-profile-id');
  });

  it('stores profileId as-is when no aliases are returned (unpaired)', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'solo-profile-id',
        canonicalProfileId: 'solo-profile-id',
      },
      profileAliases: [],
    });

    const { auth } = createAuth();
    const profile = await auth.getUserProfile();

    expect(profile.profileId).toBe('solo-profile-id');
    expect(profile.canonicalProfileId).toBe('solo-profile-id');
    expect(mockComputeIdentifierId).not.toHaveBeenCalled();
  });

  it('does not call computeIdentifierId when profileAliases is undefined', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'solo-profile-id',
        canonicalProfileId: 'solo-profile-id',
      },
    });

    const { auth } = createAuth();
    const profile = await auth.getUserProfile();

    expect(profile.profileId).toBe('solo-profile-id');
    expect(mockComputeIdentifierId).not.toHaveBeenCalled();
  });

  it('sets canonicalProfileId to the login response profileId', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'canonical-from-server',
        canonicalProfileId: 'canonical-from-server',
      },
      profileAliases: [
        {
          aliasProfileId: 'my-original-id',
          canonicalProfileId: 'canonical-from-server',
          identifierIds: [{ id: MOCK_COMPUTED_IDENTIFIER_ID, type: 'SRP' }],
        },
      ],
    });

    const { auth, store } = createAuth();
    await auth.getUserProfile();

    expect(store.value?.profile.profileId).toBe('my-original-id');
    expect(store.value?.profile.canonicalProfileId).toBe(
      'canonical-from-server',
    );
  });

  it('persists resolved profile to storage', async () => {
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: {
        identifierId: 'id-1',
        metaMetricsId: 'mm-1',
        profileId: 'canonical-id',
        canonicalProfileId: 'canonical-id',
      },
      profileAliases: [
        {
          aliasProfileId: 'original-id',
          canonicalProfileId: 'canonical-id',
          identifierIds: [{ id: MOCK_COMPUTED_IDENTIFIER_ID, type: 'SRP' }],
        },
      ],
    });

    const { auth, store } = createAuth();
    await auth.getAccessToken();

    expect(store.value).not.toBeNull();
    expect(store.value?.profile.profileId).toBe('original-id');
    expect(store.value?.profile.canonicalProfileId).toBe('canonical-id');
    expect(store.value?.token.accessToken).toBe('access-token');
  });
});
