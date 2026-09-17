import { Env, Platform } from '../../shared/env.js';
import { RateLimitedError } from '../errors.js';
import { PAIR_DEDUPE_TTL_MS, SRPJwtBearerAuth } from './flow-srp.js';
import { AuthType } from './types.js';
import type { AuthConfig, LoginResponse, UserProfile } from './types.js';
import * as timeUtils from './utils/time.js';

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
const mockPairProfiles = jest.fn();
const mockGetCustomerServiceToken = jest.fn();
const mockGetPartnerIdentityToken = jest.fn();
const mockMfaEnroll = jest.fn();
const mockMfaEnrollComplete = jest.fn();
const mockMfaVerify = jest.fn();
const mockMfaVerifyComplete = jest.fn();
const mockGetMfaCredentials = jest.fn();

jest.mock('./services', () => ({
  authenticate: (...args: unknown[]): unknown => mockAuthenticate(...args),
  authorizeOIDC: (...args: unknown[]): unknown => mockAuthorizeOIDC(...args),
  getNonce: (...args: unknown[]): unknown => mockGetNonce(...args),
  getUserProfileLineage: jest.fn(),
  getCustomerServiceToken: (...args: unknown[]): unknown =>
    mockGetCustomerServiceToken(...args),
  getPartnerIdentityToken: (...args: unknown[]): unknown =>
    mockGetPartnerIdentityToken(...args),
  pairProfiles: (...args: unknown[]): unknown => mockPairProfiles(...args),
}));

jest.mock('./mfa/services', () => ({
  mfaEnroll: (...args: unknown[]): unknown => mockMfaEnroll(...args),
  mfaEnrollComplete: (...args: unknown[]): unknown =>
    mockMfaEnrollComplete(...args),
  mfaVerify: (...args: unknown[]): unknown => mockMfaVerify(...args),
  mfaVerifyComplete: (...args: unknown[]): unknown =>
    mockMfaVerifyComplete(...args),
  getMfaCredentials: (...args: unknown[]): unknown =>
    mockGetMfaCredentials(...args),
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

  it('getCustomerServiceToken exchanges the access token via the service', async () => {
    const { auth } = createAuth();
    mockGetCustomerServiceToken.mockResolvedValue('cs-access-token');

    const result = await auth.getCustomerServiceToken();

    expect(result).toBe('cs-access-token');
    // Logs in to obtain the OIDC access token, then exchanges it.
    expect(mockAuthorizeOIDC).toHaveBeenCalledTimes(1);
    expect(mockGetCustomerServiceToken).toHaveBeenCalledWith(
      config.env,
      'access',
    );
  });

  it('getPartnerIdentityToken exchanges the access token via the service', async () => {
    const { auth } = createAuth();
    mockGetPartnerIdentityToken.mockResolvedValue('partner-access-token');

    const result = await auth.getPartnerIdentityToken(['email'], 'kyc');

    expect(result).toBe('partner-access-token');
    expect(mockAuthorizeOIDC).toHaveBeenCalledTimes(1);
    expect(mockGetPartnerIdentityToken).toHaveBeenCalledWith(
      config.env,
      'access',
      ['email'],
      'kyc',
    );
  });
});

describe('SRP MFA methods', () => {
  const accessToken = 'eyJhbGciOiJub25lIn0.eyJleHAiOjQxMDI0NDQ4MDB9.signature';
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: Env.DEV,
    platform: Platform.MOBILE,
  };

  function createAuth(): SRPJwtBearerAuth {
    return new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async (): Promise<LoginResponse> => ({
          token: {
            accessToken,
            expiresIn: 3600,
            obtainedAt: Date.now(),
          },
          profile: {
            profileId: 'profile-id',
            canonicalProfileId: 'profile-id',
            metaMetricsId: 'metametrics-id',
            identifierId: 'identifier-id',
          },
        }),
        setLoginResponse: async (): Promise<void> => undefined,
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'identifier',
        signMessage: async (): Promise<string> => 'signature',
      },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('begins passkey and email enrollment with the access token', async () => {
    const auth = createAuth();
    mockMfaEnroll
      .mockResolvedValueOnce({
        flowId: 'passkey-flow',
        expiresAt: 1000,
        publicKey: { challenge: 'challenge' },
      })
      .mockResolvedValueOnce({
        flowId: 'email-flow',
        expiresAt: 2000,
      });

    expect(await auth.beginMfaEnrollment('passkey')).toMatchObject({
      type: 'passkey',
      flowId: 'passkey-flow',
    });
    expect(
      await auth.beginMfaEnrollment('email_otp', {
        email: 'user@example.com',
      }),
    ).toStrictEqual({
      type: 'email_otp',
      flowId: 'email-flow',
      expiresAt: 2000,
    });
    expect(mockMfaEnroll).toHaveBeenLastCalledWith(Env.DEV, accessToken, {
      credential_type: 'email_otp',
      identifier: 'user@example.com',
    });
  });

  it('does not conflate email with entropySourceId', async () => {
    const getLoginResponse = jest.fn(
      async (): Promise<LoginResponse> => ({
        token: { accessToken, expiresIn: 3600, obtainedAt: Date.now() },
        profile: {
          profileId: 'profile-id',
          canonicalProfileId: 'profile-id',
          metaMetricsId: 'metametrics-id',
          identifierId: 'identifier-id',
        },
      }),
    );
    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse,
        setLoginResponse: async (): Promise<void> => undefined,
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'identifier',
        signMessage: async (): Promise<string> => 'signature',
      },
    });
    mockMfaEnroll.mockResolvedValueOnce({ flowId: 'flow-id', expiresAt: 1000 });

    await auth.beginMfaEnrollment('email_otp', {
      email: 'user@example.com',
      entropySourceId: 'secondary-source',
    });

    expect(getLoginResponse).toHaveBeenCalledWith('secondary-source');
    expect(mockMfaEnroll).toHaveBeenCalledWith(Env.DEV, accessToken, {
      credential_type: 'email_otp',
      identifier: 'user@example.com',
    });
  });

  it('rejects a passkey enrollment without creation data', async () => {
    const auth = createAuth();
    mockMfaEnroll.mockResolvedValue({
      flowId: 'flow-id',
      expiresAt: 1000,
    });

    await expect(auth.beginMfaEnrollment('passkey')).rejects.toMatchObject({
      mfaCode: 'invalid_response',
    });
  });

  it('completes both enrollment proof types', async () => {
    const auth = createAuth();
    mockMfaEnrollComplete.mockResolvedValue(undefined);
    const attestation = {
      id: 'id',
      rawId: 'raw-id',
      type: 'public-key',
      response: {
        attestationObject: 'attestation',
        clientDataJSON: 'client-data',
      },
    } as const;

    await auth.completeMfaEnrollment('passkey', 'flow-id', {
      type: 'passkey',
      attestation,
    });
    await auth.completeMfaEnrollment('email_otp', 'flow-id', {
      type: 'email_otp',
      code: '123456',
    });

    expect(mockMfaEnrollComplete).toHaveBeenNthCalledWith(
      1,
      Env.DEV,
      accessToken,
      {
        credential_type: 'passkey',
        flow_id: 'flow-id',
        passkey_attestation: attestation,
      },
    );
    expect(mockMfaEnrollComplete).toHaveBeenNthCalledWith(
      2,
      Env.DEV,
      accessToken,
      {
        credential_type: 'email_otp',
        flow_id: 'flow-id',
        otp_code: '123456',
      },
    );
  });

  it('begins passkey and email verification', async () => {
    const auth = createAuth();
    mockMfaVerify
      .mockResolvedValueOnce({
        flowId: 'passkey-flow',
        expiresAt: 1000,
        publicKey: { challenge: 'challenge' },
      })
      .mockResolvedValueOnce({
        flowId: 'email-flow',
        expiresAt: 2000,
      });

    expect(await auth.beginMfaVerification('passkey')).toMatchObject({
      type: 'passkey',
      flowId: 'passkey-flow',
    });
    expect(await auth.beginMfaVerification('email_otp')).toStrictEqual({
      type: 'email_otp',
      flowId: 'email-flow',
      expiresAt: 2000,
    });
  });

  it('rejects passkey verification without request data', async () => {
    const auth = createAuth();
    mockMfaVerify.mockResolvedValue({
      flowId: 'flow-id',
      expiresAt: 1000,
    });

    await expect(auth.beginMfaVerification('passkey')).rejects.toMatchObject({
      mfaCode: 'invalid_response',
    });
  });

  it('completes verification and lists credentials', async () => {
    const auth = createAuth();
    const completion = { token: 'assertion' };
    mockMfaVerifyComplete.mockResolvedValue(completion);
    mockGetMfaCredentials.mockResolvedValue([
      { type: 'passkey', status: 'active' },
    ]);

    expect(
      await auth.completeMfaVerification('email_otp', 'flow-id', {
        type: 'email_otp',
        code: '123456',
      }),
    ).toBe(completion);
    expect(await auth.getMfaCredentials()).toStrictEqual([
      { type: 'passkey', status: 'active' },
    ]);
  });

  it('forwards a passkey assertion and exchanges the resulting JWT', async () => {
    const auth = createAuth();
    const assertion = {
      id: 'id',
      rawId: 'raw-id',
      type: 'public-key',
      response: {
        authenticatorData: 'authenticator-data',
        clientDataJSON: 'client-data',
        signature: 'signature',
      },
    } as const;
    mockMfaVerifyComplete.mockResolvedValue({ token: 'assertion-jwt' });
    mockAuthorizeOIDC.mockResolvedValue({
      accessToken: 'elevated-token',
      expiresIn: 900,
      obtainedAt: 1000,
    });

    await auth.completeMfaVerification('passkey', 'flow-id', {
      type: 'passkey',
      assertion,
    });
    expect(await auth.exchangeMfaAssertion('assertion-jwt')).toMatchObject({
      accessToken: 'elevated-token',
    });
    expect(mockMfaVerifyComplete).toHaveBeenCalledWith(Env.DEV, accessToken, {
      credential_type: 'passkey',
      flow_id: 'flow-id',
      passkey_assertion: assertion,
    });
    expect(mockAuthorizeOIDC).toHaveBeenCalledWith(
      'assertion-jwt',
      Env.DEV,
      Platform.MOBILE,
    );
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

describe('SRPJwtBearerAuth pairSrpProfiles deduplication', () => {
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: Env.DEV,
    platform: Platform.EXTENSION,
  };

  const MOCK_PAIR_RESPONSE = {
    profile: {
      profileId: 'p1',
      canonicalProfileId: 'p1',
      metaMetricsId: 'm1',
      identifierId: 'i1',
    },
    profileAliases: [],
  };

  const createAuth = (): { auth: SRPJwtBearerAuth } => {
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
    });
    return { auth };
  };

  beforeEach((): void => {
    jest.clearAllMocks();
    mockPairProfiles.mockResolvedValue(MOCK_PAIR_RESPONSE);
  });

  it('coalesces concurrent calls with the same payload into one request', async () => {
    const { auth } = createAuth();

    const [r1, r2, r3] = await Promise.all([
      auth.pairSrpProfiles(['a', 'b', 'c'], 'a'),
      auth.pairSrpProfiles(['a', 'b', 'c'], 'a'),
      auth.pairSrpProfiles(['a', 'b', 'c'], 'a'),
    ]);

    expect(r1).toStrictEqual(MOCK_PAIR_RESPONSE);
    expect(r2).toStrictEqual(MOCK_PAIR_RESPONSE);
    expect(r3).toStrictEqual(MOCK_PAIR_RESPONSE);
    expect(mockPairProfiles).toHaveBeenCalledTimes(1);
  });

  it('dedupes the same token set provided in a different order', async () => {
    const { auth } = createAuth();

    await auth.pairSrpProfiles(['a', 'b', 'c'], 'a');
    await auth.pairSrpProfiles(['c', 'a', 'b'], 'c');

    expect(mockPairProfiles).toHaveBeenCalledTimes(1);
  });

  it('serves sequential identical calls from cache within the TTL', async () => {
    const { auth } = createAuth();

    await auth.pairSrpProfiles(['a', 'b'], 'a');
    await auth.pairSrpProfiles(['a', 'b'], 'a');

    expect(mockPairProfiles).toHaveBeenCalledTimes(1);
  });

  it('re-pairs once the cache TTL has expired', async () => {
    jest.useFakeTimers();
    try {
      const { auth } = createAuth();

      await auth.pairSrpProfiles(['a', 'b'], 'a');
      // Advance just beyond the dedupe window.
      jest.setSystemTime(Date.now() + PAIR_DEDUPE_TTL_MS + 1);
      await auth.pairSrpProfiles(['a', 'b'], 'a');

      expect(mockPairProfiles).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not cache failures so retries re-hit the endpoint', async () => {
    const { auth } = createAuth();
    mockPairProfiles
      .mockRejectedValueOnce(new Error('pair failed'))
      .mockResolvedValueOnce(MOCK_PAIR_RESPONSE);

    await expect(auth.pairSrpProfiles(['a', 'b'], 'a')).rejects.toThrow(
      'pair failed',
    );
    const result = await auth.pairSrpProfiles(['a', 'b'], 'a');

    expect(result).toStrictEqual(MOCK_PAIR_RESPONSE);
    expect(mockPairProfiles).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe different token sets', async () => {
    const { auth } = createAuth();

    await auth.pairSrpProfiles(['a', 'b'], 'a');
    await auth.pairSrpProfiles(['a', 'c'], 'a');

    expect(mockPairProfiles).toHaveBeenCalledTimes(2);
  });
});

describe('SRPJwtBearerAuth login tag', () => {
  const config: AuthConfig & { type: AuthType.SRP } = {
    type: AuthType.SRP,
    env: Env.DEV,
    platform: Platform.EXTENSION,
  };

  const MOCK_PROFILE: UserProfile = {
    profileId: 'p1',
    canonicalProfileId: 'p1',
    metaMetricsId: 'm1',
    identifierId: 'i1',
  };

  beforeEach((): void => {
    jest.clearAllMocks();
    mockGetNonce.mockResolvedValue({
      nonce: 'nonce-1',
      identifier: 'identifier-1',
      expiresIn: 60,
    });
    mockAuthenticate.mockResolvedValue({
      token: 'jwt-token',
      expiresIn: 60,
      profile: MOCK_PROFILE,
    });
    mockAuthorizeOIDC.mockResolvedValue({
      accessToken: 'access',
      expiresIn: 60,
      obtainedAt: Date.now(),
    });
  });

  it('leaves raw_message untagged when getLoginTag is omitted', async () => {
    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async (): Promise<LoginResponse | null> => null,
        setLoginResponse: async (): Promise<void> => undefined,
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'pubkey-1',
        signMessage: async (): Promise<string> => 'signature-1',
      },
    });

    await auth.getAccessToken();

    expect(mockAuthenticate).toHaveBeenCalledWith(
      'metamask:nonce-1:pubkey-1',
      'signature-1',
      AuthType.SRP,
      Env.DEV,
      undefined,
      'SRP',
    );
  });

  it('appends the tag returned by getLoginTag', async () => {
    const getLoginTag = jest.fn().mockResolvedValue('secondary');
    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async (): Promise<LoginResponse | null> => null,
        setLoginResponse: async (): Promise<void> => undefined,
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'pubkey-1',
        signMessage: async (): Promise<string> => 'signature-1',
      },
      getLoginTag,
    });

    await auth.getAccessToken('entropy-secondary');

    expect(getLoginTag).toHaveBeenCalledWith('entropy-secondary');
    expect(mockAuthenticate).toHaveBeenCalledWith(
      'metamask:nonce-1:pubkey-1:secondary',
      'signature-1',
      AuthType.SRP,
      Env.DEV,
      undefined,
      'SRP',
    );
  });

  it('forwards getLoginIdentifierType without tagging when getLoginTag is omitted', async () => {
    const getLoginIdentifierType = jest.fn().mockResolvedValue('GOOGLE');
    const auth = new SRPJwtBearerAuth(config, {
      storage: {
        getLoginResponse: async (): Promise<LoginResponse | null> => null,
        setLoginResponse: async (): Promise<void> => undefined,
      },
      signing: {
        getIdentifier: async (): Promise<string> => 'pubkey-1',
        signMessage: async (): Promise<string> => 'signature-1',
      },
      getLoginIdentifierType,
    });

    await auth.getAccessToken('entropy-primary');

    expect(getLoginIdentifierType).toHaveBeenCalledWith('entropy-primary');
    expect(mockAuthenticate).toHaveBeenCalledWith(
      'metamask:nonce-1:pubkey-1',
      'signature-1',
      AuthType.SRP,
      Env.DEV,
      undefined,
      'GOOGLE',
    );
  });
});
