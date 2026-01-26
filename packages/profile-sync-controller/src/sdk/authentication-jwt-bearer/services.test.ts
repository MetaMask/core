import {
  getNonce,
  authenticate,
  authorizeOIDC,
  pairIdentifiers,
  getUserProfileLineage,
  NONCE_URL,
  OIDC_TOKEN_URL,
  SRP_LOGIN_URL,
  SIWE_LOGIN_URL,
  PAIR_IDENTIFIERS,
  PROFILE_LINEAGE_URL,
} from './services';
import { AuthType } from './types';
import { Env, Platform } from '../../shared/env';
import {
  NonceRetrievalError,
  SignInError,
  PairError,
  RateLimitedError,
} from '../errors';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Store original Response
const OriginalResponse = global.Response;

// Create mock responses that pass instanceof checks
const createMockResponse = (
  body: unknown,
  options: {
    ok?: boolean;
    status?: number;
    headers?: Record<string, string>;
    jsonShouldFail?: boolean;
    textShouldFail?: boolean;
  } = {},
): Response => {
  const {
    ok = true,
    status = 200,
    headers = {},
    jsonShouldFail = false,
    textShouldFail = false,
  } = options;

  const textValue = typeof body === 'string' ? body : JSON.stringify(body);

  const mockResponse = {
    ok,
    status,
    headers: new Headers(headers),
    json: async () => {
      if (jsonShouldFail) {
        throw new SyntaxError('Unexpected token');
      }
      return body;
    },
    text: async () => {
      if (textShouldFail) {
        throw new Error('Text read error');
      }
      return textValue;
    },
    clone: function (): Response {
      return createMockResponse(body, options);
    },
  };

  // Make it pass instanceof Response check
  Object.setPrototypeOf(mockResponse, OriginalResponse.prototype);
  return mockResponse as Response;
};

describe('services', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('URL builders', () => {
    it('should build correct NONCE_URL', () => {
      expect(NONCE_URL(Env.DEV)).toBe(
        'https://authentication.dev-api.cx.metamask.io/api/v2/nonce',
      );
    });

    it('should build correct OIDC_TOKEN_URL', () => {
      expect(OIDC_TOKEN_URL(Env.DEV)).toBe(
        'https://oidc.dev-api.cx.metamask.io/oauth2/token',
      );
    });

    it('should build correct SRP_LOGIN_URL', () => {
      expect(SRP_LOGIN_URL(Env.DEV)).toBe(
        'https://authentication.dev-api.cx.metamask.io/api/v2/srp/login',
      );
    });

    it('should build correct SIWE_LOGIN_URL', () => {
      expect(SIWE_LOGIN_URL(Env.DEV)).toBe(
        'https://authentication.dev-api.cx.metamask.io/api/v2/siwe/login',
      );
    });

    it('should build correct PAIR_IDENTIFIERS', () => {
      expect(PAIR_IDENTIFIERS(Env.DEV)).toBe(
        'https://authentication.dev-api.cx.metamask.io/api/v2/identifiers/pair',
      );
    });

    it('should build correct PROFILE_LINEAGE_URL', () => {
      expect(PROFILE_LINEAGE_URL(Env.DEV)).toBe(
        'https://authentication.dev-api.cx.metamask.io/api/v2/profile/lineage',
      );
    });
  });

  describe('getNonce', () => {
    it('should return nonce data on success', async () => {
      const mockResponse = createMockResponse({
        nonce: 'test-nonce',
        identifier: 'test-identifier',
        expires_in: 3600,
      });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await getNonce('test-id', Env.DEV);

      expect(result).toEqual({
        nonce: 'test-nonce',
        identifier: 'test-identifier',
        expiresIn: 3600,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('identifier=test-id'),
      );
    });

    it('should throw NonceRetrievalError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: Network error',
      );
    });

    it('should throw NonceRetrievalError with HTTP status on error response with JSON body', async () => {
      const mockResponse = createMockResponse(
        { message: 'Invalid identifier', error: 'invalid_request' },
        { ok: false, status: 400 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: HTTP 400 - Invalid identifier (error: invalid_request)',
      );
    });

    it('should throw NonceRetrievalError with text body when JSON parsing fails', async () => {
      const mockResponse = createMockResponse('Bad Gateway Error', {
        ok: false,
        status: 502,
        jsonShouldFail: true,
      });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: HTTP 502 - Bad Gateway Error (error: non_json_response)',
      );
    });

    it('should throw NonceRetrievalError with fallback message when response is unparseable', async () => {
      const mockResponse = createMockResponse('', {
        ok: false,
        status: 500,
        jsonShouldFail: true,
        textShouldFail: true,
      });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: HTTP 500 - Unable to parse error response (error: unparseable_response)',
      );
    });

    it('should throw RateLimitedError on 429 response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Too many requests', error: 'rate_limited' },
        { ok: false, status: 429, headers: { 'Retry-After': '60' } },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        RateLimitedError,
      );
      const error = await getNonce('test-id', Env.DEV).catch((e) => e);
      expect(error.retryAfterMs).toBe(60000);
    });

    it('should throw RateLimitedError with HTTP-date Retry-After header', async () => {
      const futureDate = new Date(Date.now() + 30000).toUTCString();
      const mockResponse = createMockResponse(
        { message: 'Too many requests', error: 'rate_limited' },
        { ok: false, status: 429, headers: { 'Retry-After': futureDate } },
      );
      mockFetch.mockResolvedValue(mockResponse);

      const error = await getNonce('test-id', Env.DEV).catch((e) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBeGreaterThan(0);
      expect(error.retryAfterMs).toBeLessThanOrEqual(30000);
    });

    it('should throw RateLimitedError without retryAfterMs when header is missing', async () => {
      const mockResponse = createMockResponse(
        { message: 'Too many requests', error: 'rate_limited' },
        { ok: false, status: 429 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      const error = await getNonce('test-id', Env.DEV).catch((e) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBeUndefined();
    });

    it('should throw NonceRetrievalError when success response has invalid JSON', async () => {
      const mockResponse = createMockResponse(
        {},
        {
          ok: true,
          status: 200,
          jsonShouldFail: true,
        },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: Unexpected token',
      );
    });

    it('should handle error_description format in error response', async () => {
      const mockResponse = createMockResponse(
        {
          error_description: 'The identifier is invalid',
          error: 'invalid_identifier',
        },
        { ok: false, status: 400 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: HTTP 400 - The identifier is invalid (error: invalid_identifier)',
      );
    });

    it('should truncate long text responses', async () => {
      const longText = 'A'.repeat(200);
      const mockResponse = createMockResponse(longText, {
        ok: false,
        status: 500,
        jsonShouldFail: true,
      });
      mockFetch.mockResolvedValue(mockResponse);

      const error = await getNonce('test-id', Env.DEV).catch((e) => e);
      expect(error.message).toContain('A'.repeat(150));
      expect(error.message.length).toBeLessThan(250);
    });
  });

  describe('authenticate', () => {
    const mockAuthResponse = {
      token: 'jwt-token',
      expires_in: 3600,
      profile: {
        identifier_id: 'id-1',
        metametrics_id: 'mm-1',
        profile_id: 'profile-1',
      },
    };

    it('should return authentication data on success with SRP', async () => {
      const mockResponse = createMockResponse(mockAuthResponse);
      mockFetch.mockResolvedValue(mockResponse);

      const result = await authenticate(
        'raw-message',
        'signature',
        AuthType.SRP,
        Env.DEV,
      );

      expect(result).toEqual({
        token: 'jwt-token',
        expiresIn: 3600,
        profile: {
          identifierId: 'id-1',
          metaMetricsId: 'mm-1',
          profileId: 'profile-1',
        },
      });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/srp/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            signature: 'signature',
            raw_message: 'raw-message',
          }),
        }),
      );
    });

    it('should return authentication data on success with SiWE', async () => {
      const mockResponse = createMockResponse(mockAuthResponse);
      mockFetch.mockResolvedValue(mockResponse);

      await authenticate('raw-message', 'signature', AuthType.SiWE, Env.DEV);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/siwe/login'),
        expect.any(Object),
      );
    });

    it('should include metametrics when provided', async () => {
      const mockResponse = createMockResponse(mockAuthResponse);
      mockFetch.mockResolvedValue(mockResponse);

      const mockMetametrics = {
        getMetaMetricsId: jest.fn().mockResolvedValue('mm-id'),
        agent: Platform.EXTENSION as Platform.EXTENSION,
      };

      await authenticate(
        'raw-message',
        'signature',
        AuthType.SRP,
        Env.DEV,
        mockMetametrics,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            signature: 'signature',
            raw_message: 'raw-message',
            metametrics: {
              metametrics_id: 'mm-id',
              agent: Platform.EXTENSION,
            },
          }),
        }),
      );
    });

    it('should throw SignInError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await expect(
        authenticate('raw-message', 'signature', AuthType.SRP, Env.DEV),
      ).rejects.toThrow(SignInError);
      await expect(
        authenticate('raw-message', 'signature', AuthType.SRP, Env.DEV),
      ).rejects.toThrow('SRP login failed: Connection refused');
    });

    it('should throw SignInError on error response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Invalid signature', error: 'auth_failed' },
        { ok: false, status: 401 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        authenticate('raw-message', 'signature', AuthType.SRP, Env.DEV),
      ).rejects.toThrow(SignInError);
      await expect(
        authenticate('raw-message', 'signature', AuthType.SRP, Env.DEV),
      ).rejects.toThrow(
        'SRP login failed: HTTP 401 - Invalid signature (error: auth_failed)',
      );
    });

    it('should throw RateLimitedError on 429 response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Rate limited', error: 'too_many_requests' },
        { ok: false, status: 429, headers: { 'Retry-After': '120' } },
      );
      mockFetch.mockResolvedValue(mockResponse);

      const error = await authenticate(
        'raw-message',
        'signature',
        AuthType.SRP,
        Env.DEV,
      ).catch((e) => e);

      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBe(120000);
    });
  });

  describe('authorizeOIDC', () => {
    const mockOIDCResponse = {
      access_token: 'access-token-123',
      expires_in: 7200,
    };

    it('should return access token on success', async () => {
      const mockResponse = createMockResponse(mockOIDCResponse);
      mockFetch.mockResolvedValue(mockResponse);

      const before = Date.now();
      const result = await authorizeOIDC(
        'jwt-token',
        Env.DEV,
        Platform.EXTENSION,
      );
      const after = Date.now();

      expect(result.accessToken).toBe('access-token-123');
      expect(result.expiresIn).toBe(7200);
      expect(result.obtainedAt).toBeGreaterThanOrEqual(before);
      expect(result.obtainedAt).toBeLessThanOrEqual(after);
    });

    it('should send correct request body', async () => {
      const mockResponse = createMockResponse(mockOIDCResponse);
      mockFetch.mockResolvedValue(mockResponse);

      await authorizeOIDC('jwt-token', Env.DEV, Platform.EXTENSION);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth2/token'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers),
        }),
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = callArgs[1].body;
      expect(body).toContain(
        'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer',
      );
      expect(body).toContain('assertion=jwt-token');
    });

    it('should throw SignInError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('CORS error'));

      await expect(
        authorizeOIDC('jwt-token', Env.DEV, Platform.EXTENSION),
      ).rejects.toThrow(SignInError);
      await expect(
        authorizeOIDC('jwt-token', Env.DEV, Platform.EXTENSION),
      ).rejects.toThrow('Unable to get access token: CORS error');
    });

    it('should throw SignInError on error response', async () => {
      const mockResponse = createMockResponse(
        { error_description: 'Invalid assertion', error: 'invalid_grant' },
        { ok: false, status: 400 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        authorizeOIDC('jwt-token', Env.DEV, Platform.EXTENSION),
      ).rejects.toThrow(SignInError);
      await expect(
        authorizeOIDC('jwt-token', Env.DEV, Platform.EXTENSION),
      ).rejects.toThrow(
        'Unable to get access token: HTTP 400 - Invalid assertion (error: invalid_grant)',
      );
    });

    it('should throw RateLimitedError on 429 response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Rate limited', error: 'too_many_requests' },
        { ok: false, status: 429 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        authorizeOIDC('jwt-token', Env.DEV, Platform.EXTENSION),
      ).rejects.toThrow(RateLimitedError);
    });
  });

  describe('pairIdentifiers', () => {
    const mockLogins = [
      {
        signature: 'sig-1',
        raw_message: 'msg-1',
        encrypted_storage_key: 'key-1',
        identifier_type: 'SRP' as const,
      },
    ];

    it('should complete successfully on 200 response', async () => {
      const mockResponse = createMockResponse({}, { ok: true, status: 200 });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        pairIdentifiers('nonce-123', mockLogins, 'access-token', Env.DEV),
      ).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer access-token',
          },
          body: JSON.stringify({
            nonce: 'nonce-123',
            logins: mockLogins,
          }),
        }),
      );
    });

    it('should throw PairError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect(
        pairIdentifiers('nonce-123', mockLogins, 'access-token', Env.DEV),
      ).rejects.toThrow(PairError);
      await expect(
        pairIdentifiers('nonce-123', mockLogins, 'access-token', Env.DEV),
      ).rejects.toThrow('Unable to pair identifiers: Network timeout');
    });

    it('should throw PairError on error response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Invalid nonce', error: 'invalid_request' },
        { ok: false, status: 400 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        pairIdentifiers('nonce-123', mockLogins, 'access-token', Env.DEV),
      ).rejects.toThrow(PairError);
      await expect(
        pairIdentifiers('nonce-123', mockLogins, 'access-token', Env.DEV),
      ).rejects.toThrow(
        'Unable to pair identifiers: HTTP 400 - Invalid nonce (error: invalid_request)',
      );
    });

    it('should throw RateLimitedError on 429 response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Rate limited', error: 'too_many_requests' },
        { ok: false, status: 429, headers: { 'Retry-After': '30' } },
      );
      mockFetch.mockResolvedValue(mockResponse);

      const error = await pairIdentifiers(
        'nonce-123',
        mockLogins,
        'access-token',
        Env.DEV,
      ).catch((e) => e);

      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBe(30000);
    });
  });

  describe('getUserProfileLineage', () => {
    const mockLineageResponse = {
      profile_id: 'profile-123',
      created_at: '2024-01-01T00:00:00Z',
      lineage: [
        {
          metametrics_id: 'mm-1',
          agent: Platform.EXTENSION,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          counter: 5,
        },
      ],
    };

    it('should return profile lineage on success', async () => {
      const mockResponse = createMockResponse(mockLineageResponse);
      mockFetch.mockResolvedValue(mockResponse);

      const result = await getUserProfileLineage(Env.DEV, 'access-token');

      expect(result).toEqual(mockLineageResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: 'Bearer access-token',
          },
        }),
      );
    });

    it('should throw SignInError on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('DNS resolution failed'));

      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow(SignInError);
      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow('Failed to get profile lineage: DNS resolution failed');
    });

    it('should throw SignInError on error response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Unauthorized', error: 'invalid_token' },
        { ok: false, status: 401 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow(SignInError);
      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow(
        'Failed to get profile lineage: HTTP 401 - Unauthorized (error: invalid_token)',
      );
    });

    it('should throw RateLimitedError on 429 response', async () => {
      const mockResponse = createMockResponse(
        { message: 'Rate limited', error: 'too_many_requests' },
        { ok: false, status: 429 },
      );
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow(RateLimitedError);
    });

    it('should handle non-JSON error response', async () => {
      const mockResponse = createMockResponse('Service Unavailable', {
        ok: false,
        status: 503,
        jsonShouldFail: true,
      });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow(SignInError);
      await expect(
        getUserProfileLineage(Env.DEV, 'access-token'),
      ).rejects.toThrow(
        'Failed to get profile lineage: HTTP 503 - Service Unavailable (error: non_json_response)',
      );
    });
  });

  describe('parseRetryAfter edge cases', () => {
    it('should handle past HTTP-date by returning null (no delay)', async () => {
      const pastDate = new Date(Date.now() - 10000).toUTCString();
      const mockResponse = createMockResponse(
        { message: 'Rate limited', error: 'rate_limited' },
        { ok: false, status: 429, headers: { 'Retry-After': pastDate } },
      );
      mockFetch.mockResolvedValue(mockResponse);

      const error = await getNonce('test-id', Env.DEV).catch((e) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBeUndefined();
    });

    it('should handle invalid Retry-After header', async () => {
      const mockResponse = createMockResponse(
        { message: 'Rate limited', error: 'rate_limited' },
        { ok: false, status: 429, headers: { 'Retry-After': 'invalid-value' } },
      );
      mockFetch.mockResolvedValue(mockResponse);

      const error = await getNonce('test-id', Env.DEV).catch((e) => e);
      expect(error).toBeInstanceOf(RateLimitedError);
      expect(error.retryAfterMs).toBeUndefined();
    });
  });

  describe('handleServiceError edge cases', () => {
    it('should handle non-Error thrown values', async () => {
      mockFetch.mockRejectedValue('string error');

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: string error',
      );
    });

    it('should handle null thrown values', async () => {
      mockFetch.mockRejectedValue(null);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: null',
      );
    });

    it('should handle undefined thrown values', async () => {
      mockFetch.mockRejectedValue(undefined);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        NonceRetrievalError,
      );
      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: undefined',
      );
    });

    it('should handle empty text response', async () => {
      const mockResponse = createMockResponse('', {
        ok: false,
        status: 500,
        jsonShouldFail: true,
      });
      mockFetch.mockResolvedValue(mockResponse);

      await expect(getNonce('test-id', Env.DEV)).rejects.toThrow(
        'Failed to get nonce: HTTP 500 - Non-JSON error response (error: non_json_response)',
      );
    });
  });
});
