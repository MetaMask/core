/**
 * ApiPlatformClient Tests - Core client functionality.
 *
 * Tests for: constructor, factory function, HTTP headers/errors,
 * cache management, query keys, constants, caching behavior, retry behavior,
 * URL parameter handling, and helper functions.
 *
 * See individual test files for endpoint-specific tests:
 * - api/accounts-client.test.ts
 * - api/prices-client.test.ts
 * - api/token-client.test.ts
 * - api/tokens-client.test.ts
 */

import { QueryClient } from '@tanstack/query-core';

import {
  ApiPlatformClient,
  createApiPlatformClient,
  API_URLS,
  STALE_TIMES,
  GC_TIMES,
  RETRY_CONFIG,
  HttpError,
  shouldRetry,
  calculateRetryDelay,
} from '.';
import {
  mockFetch,
  createMockResponse,
  setupTestEnvironment,
} from './test-utils';

describe('ApiPlatformClient', () => {
  let client: ApiPlatformClient;

  beforeEach(() => {
    ({ client } = setupTestEnvironment());
  });

  // ===========================================================================
  // CONSTRUCTOR TESTS
  // ===========================================================================
  describe('constructor', () => {
    it('creates instance with required options', () => {
      const instance = new ApiPlatformClient({
        clientProduct: 'metamask-extension',
      });
      expect(instance).toBeInstanceOf(ApiPlatformClient);
    });

    it('creates instance with all options', () => {
      const customQueryClient = new QueryClient();
      const getBearerToken = jest.fn().mockResolvedValue('test-token');

      const instance = new ApiPlatformClient({
        clientProduct: 'metamask-extension',
        clientVersion: '11.0.0',
        getBearerToken,
        queryClient: customQueryClient,
      });

      expect(instance).toBeInstanceOf(ApiPlatformClient);
      expect(instance.queryClient).toBe(customQueryClient);
    });

    it('shares the same QueryClient across all sub-clients', () => {
      const instance = new ApiPlatformClient({
        clientProduct: 'test-client',
      });

      // All sub-clients should share the same QueryClient instance
      expect(instance.accounts.queryClient).toBe(instance.queryClient);
      expect(instance.prices.queryClient).toBe(instance.queryClient);
      expect(instance.token.queryClient).toBe(instance.queryClient);
      expect(instance.tokens.queryClient).toBe(instance.queryClient);
    });

    it('shares provided QueryClient across all sub-clients', () => {
      const customQueryClient = new QueryClient();
      const instance = new ApiPlatformClient({
        clientProduct: 'test-client',
        queryClient: customQueryClient,
      });

      // All sub-clients should use the provided QueryClient
      expect(instance.queryClient).toBe(customQueryClient);
      expect(instance.accounts.queryClient).toBe(customQueryClient);
      expect(instance.prices.queryClient).toBe(customQueryClient);
      expect(instance.token.queryClient).toBe(customQueryClient);
      expect(instance.tokens.queryClient).toBe(customQueryClient);
    });

    it('uses default version when not provided', async () => {
      const instance = new ApiPlatformClient({
        clientProduct: 'test-client',
        queryClient: new QueryClient({
          defaultOptions: { queries: { retry: false } },
        }),
      });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ supportedNetworks: [1, 137] }),
      );

      await instance.accounts.fetchV1SupportedNetworks();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Client-Version': '1.0.0',
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // FACTORY FUNCTION TESTS
  // ===========================================================================
  describe('createApiPlatformClient', () => {
    it('creates ApiPlatformClient instance', () => {
      const instance = createApiPlatformClient({
        clientProduct: 'test-client',
      });
      expect(instance).toBeInstanceOf(ApiPlatformClient);
    });
  });

  // ===========================================================================
  // HTTP HEADERS TESTS
  // ===========================================================================
  describe('HTTP headers', () => {
    it('includes required headers in requests', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ supportedNetworks: [1] }),
      );

      await client.accounts.fetchV1SupportedNetworks();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Product': 'test-client',
            'X-Client-Version': '1.0.0',
          },
        }),
      );
    });

    it('includes bearer token when getBearerToken is provided', async () => {
      const getBearerToken = jest.fn().mockResolvedValue('my-auth-token');
      const authClient = new ApiPlatformClient({
        clientProduct: 'test-client',
        getBearerToken,
        queryClient: new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        }),
      });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ supportedNetworks: [1] }),
      );

      await authClient.accounts.fetchV1SupportedNetworks();

      expect(getBearerToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-auth-token',
          }),
        }),
      );
    });

    it('does not include Authorization header when getBearerToken returns undefined', async () => {
      const getBearerToken = jest.fn().mockResolvedValue(undefined);
      const authClient = new ApiPlatformClient({
        clientProduct: 'test-client',
        getBearerToken,
        queryClient: new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        }),
      });

      mockFetch.mockResolvedValueOnce(
        createMockResponse({ supportedNetworks: [1] }),
      );

      await authClient.accounts.fetchV1SupportedNetworks();

      const calledHeaders = mockFetch.mock.calls[0]?.[1]?.headers as Record<
        string,
        string
      >;
      expect(calledHeaders.Authorization).toBeUndefined();
    });
  });

  // ===========================================================================
  // HTTP ERROR HANDLING TESTS
  // ===========================================================================
  describe('HTTP error handling', () => {
    it('throws HttpError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ error: 'Not found' }, 404, 'Not Found'),
      );

      await expect(client.accounts.fetchV1SupportedNetworks()).rejects.toThrow(
        HttpError,
      );
    });

    it('httpError contains correct properties', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { error: 'Server error' },
          500,
          'Internal Server Error',
        ),
      );

      const error = await client.accounts
        .fetchV1SupportedNetworks()
        .catch((caughtError: unknown) => caughtError);

      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({
        status: 500,
        statusText: 'Internal Server Error',
        message: 'HTTP 500: Internal Server Error',
      });
    });
  });

  // ===========================================================================
  // CACHE MANAGEMENT TESTS
  // ===========================================================================
  describe('Cache Management', () => {
    it('gets and sets cached data', () => {
      const queryKey = ['accounts', 'v1SupportedNetworks'];
      const testData = { supportedNetworks: [1, 137] };

      client.setCachedData(queryKey, testData);
      const cachedData = client.getCachedData(queryKey);

      expect(cachedData).toStrictEqual(testData);
    });

    it('returns undefined for uncached data', () => {
      const queryKey = ['accounts', 'v1SupportedNetworks'];
      const cachedData = client.getCachedData(queryKey);

      expect(cachedData).toBeUndefined();
    });

    it('invalidates auth token cache', async () => {
      const queryKey = ['auth', 'bearerToken'];
      client.setCachedData(queryKey, 'test-token');

      await client.invalidateAuthToken();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('invalidates balances cache via accounts client', async () => {
      const queryKey = ['accounts', 'balances', 'v2', { address: '0x123' }];
      client.setCachedData(queryKey, {
        count: 1,
        balances: [],
        unprocessedNetworks: [],
      });

      await client.accounts.invalidateBalances();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('invalidates prices cache via prices client', async () => {
      const queryKey = ['prices', 'v1SupportedNetworks'];
      client.setCachedData(queryKey, {
        fullSupport: [],
        partialSupport: [],
      });

      await client.prices.invalidatePrices();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('invalidates tokens cache via tokens client', async () => {
      const queryKey = ['tokens', 'v1SupportedNetworks'];
      client.setCachedData(queryKey, { fullSupport: [] });

      await client.tokens.invalidateTokens();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('invalidates accounts cache via accounts client', async () => {
      const queryKey = ['accounts', 'v1SupportedNetworks'];
      client.setCachedData(queryKey, { supportedNetworks: [] });

      await client.accounts.invalidateAccounts();

      const queryState = client.queryClient.getQueryState(queryKey);
      expect(queryState?.isInvalidated).toBe(true);
    });

    it('invalidates all caches', async () => {
      const accountsKey = ['accounts', 'v1SupportedNetworks'];
      const pricesKey = ['prices', 'v1SupportedNetworks'];
      const tokensKey = ['tokens', 'v1SupportedNetworks'];

      client.setCachedData(accountsKey, {});
      client.setCachedData(pricesKey, {});
      client.setCachedData(tokensKey, {});

      await client.invalidateAll();

      expect(client.queryClient.getQueryState(accountsKey)?.isInvalidated).toBe(
        true,
      );
      expect(client.queryClient.getQueryState(pricesKey)?.isInvalidated).toBe(
        true,
      );
      expect(client.queryClient.getQueryState(tokensKey)?.isInvalidated).toBe(
        true,
      );
    });

    it('clears all cached data', () => {
      const accountsKey = ['accounts', 'v1SupportedNetworks'];
      const pricesKey = ['prices', 'v1SupportedNetworks'];

      client.setCachedData(accountsKey, {});
      client.setCachedData(pricesKey, {});

      client.clear();

      expect(client.getCachedData(accountsKey)).toBeUndefined();
      expect(client.getCachedData(pricesKey)).toBeUndefined();
    });

    it('checks if query is fetching', () => {
      const queryKey = ['accounts', 'v1SupportedNetworks'];
      expect(client.isFetching(queryKey)).toBe(false);
    });

    it('exposes queryClient for advanced usage', () => {
      expect(client.queryClient).toBeInstanceOf(QueryClient);
    });

    it('shares QueryClient across all sub-clients', () => {
      // All sub-clients should share the same QueryClient
      expect(client.accounts.queryClient).toBe(client.queryClient);
      expect(client.prices.queryClient).toBe(client.queryClient);
      expect(client.token.queryClient).toBe(client.queryClient);
      expect(client.tokens.queryClient).toBe(client.queryClient);
    });
  });

  // ===========================================================================
  // CONSTANTS TESTS
  // ===========================================================================
  describe('Constants', () => {
    it('exports API URLs', () => {
      expect(API_URLS.ACCOUNTS).toBe('https://accounts.api.cx.metamask.io');
      expect(API_URLS.PRICES).toBe('https://price.api.cx.metamask.io');
      expect(API_URLS.TOKEN).toBe('https://token.api.cx.metamask.io');
      expect(API_URLS.TOKENS).toBe('https://tokens.api.cx.metamask.io');
    });

    it('exports stale times', () => {
      expect(STALE_TIMES.PRICES).toBe(30 * 1000);
      expect(STALE_TIMES.BALANCES).toBe(60 * 1000);
      expect(STALE_TIMES.SUPPORTED_NETWORKS).toBe(30 * 60 * 1000);
    });

    it('exports GC times', () => {
      expect(GC_TIMES.DEFAULT).toBe(5 * 60 * 1000);
      expect(GC_TIMES.EXTENDED).toBe(30 * 60 * 1000);
      expect(GC_TIMES.SHORT).toBe(2 * 60 * 1000);
    });
  });

  // ===========================================================================
  // CACHING BEHAVIOR TESTS
  // ===========================================================================
  describe('Caching Behavior', () => {
    it('returns cached data on subsequent calls', async () => {
      const mockResponse = { supportedNetworks: [1, 137] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result1 = await client.accounts.fetchV1SupportedNetworks();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const result2 = await client.accounts.fetchV1SupportedNetworks();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result2).toStrictEqual(result1);
    });

    it('deduplicates concurrent requests', async () => {
      const mockResponse = { supportedNetworks: [1] };
      mockFetch.mockResolvedValue(createMockResponse(mockResponse));

      const promises = [
        client.accounts.fetchV1SupportedNetworks(),
        client.accounts.fetchV1SupportedNetworks(),
        client.accounts.fetchV1SupportedNetworks(),
      ];

      await Promise.all(promises);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // RETRY BEHAVIOR TESTS
  // ===========================================================================
  describe('Retry Behavior', () => {
    it('uses default retry configuration when no custom QueryClient provided', () => {
      const defaultClient = new ApiPlatformClient({
        clientProduct: 'test-client',
      });

      expect(defaultClient.queryClient).toBeInstanceOf(QueryClient);
      const defaultOptions = defaultClient.queryClient.getDefaultOptions();
      expect(defaultOptions.queries?.retry).toBeDefined();
    });

    it('retries on 5xx errors up to MAX_RETRIES using shouldRetry', async () => {
      // Use actual shouldRetry function (not a hardcoded number) to test real behavior
      const retryClient = new ApiPlatformClient({
        clientProduct: 'test-client',
        queryClient: new QueryClient({
          defaultOptions: {
            queries: {
              retry: shouldRetry,
              retryDelay: (): number => 0, // No delay for tests
              gcTime: 0,
              staleTime: 0,
            },
          },
        }),
      });

      // With MAX_RETRIES=3: 1 initial + 3 retries = 4 total attempts
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse({}, 500, 'Internal Server Error'),
        )
        .mockResolvedValueOnce(createMockResponse({}, 502, 'Bad Gateway'))
        .mockResolvedValueOnce(
          createMockResponse({}, 503, 'Service Unavailable'),
        )
        .mockResolvedValueOnce(createMockResponse({ supportedNetworks: [1] }));

      const result = await retryClient.accounts.fetchV1SupportedNetworks();

      expect(result).toStrictEqual({ supportedNetworks: [1] });
      // 4 total attempts = 1 initial + MAX_RETRIES (3) retries
      expect(mockFetch).toHaveBeenCalledTimes(RETRY_CONFIG.MAX_RETRIES + 1);
    });

    it('retries on 429 rate limit errors using shouldRetry', async () => {
      const retryClient = new ApiPlatformClient({
        clientProduct: 'test-client',
        queryClient: new QueryClient({
          defaultOptions: {
            queries: {
              retry: shouldRetry,
              retryDelay: (): number => 0,
              gcTime: 0,
              staleTime: 0,
            },
          },
        }),
      });

      mockFetch
        .mockResolvedValueOnce(createMockResponse({}, 429, 'Too Many Requests'))
        .mockResolvedValueOnce(createMockResponse({ supportedNetworks: [1] }));

      const result = await retryClient.accounts.fetchV1SupportedNetworks();

      expect(result).toStrictEqual({ supportedNetworks: [1] });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 408 timeout errors using shouldRetry', async () => {
      const retryClient = new ApiPlatformClient({
        clientProduct: 'test-client',
        queryClient: new QueryClient({
          defaultOptions: {
            queries: {
              retry: shouldRetry,
              retryDelay: (): number => 0,
              gcTime: 0,
              staleTime: 0,
            },
          },
        }),
      });

      mockFetch
        .mockResolvedValueOnce(createMockResponse({}, 408, 'Request Timeout'))
        .mockResolvedValueOnce(createMockResponse({ supportedNetworks: [1] }));

      const result = await retryClient.accounts.fetchV1SupportedNetworks();

      expect(result).toStrictEqual({ supportedNetworks: [1] });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 4xx errors (except 429/408) using shouldRetry', async () => {
      const retryClient = new ApiPlatformClient({
        clientProduct: 'test-client',
        queryClient: new QueryClient({
          defaultOptions: {
            queries: {
              retry: shouldRetry,
              retryDelay: (): number => 0,
              gcTime: 0,
              staleTime: 0,
            },
          },
        }),
      });

      mockFetch.mockResolvedValueOnce(createMockResponse({}, 404, 'Not Found'));

      await expect(
        retryClient.accounts.fetchV1SupportedNetworks(),
      ).rejects.toThrow(HttpError);
      // Should NOT retry on 404, so only 1 attempt
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // URL PARAMETER HANDLING TESTS
  // ===========================================================================
  describe('URL Parameter Handling', () => {
    it('handles array parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ count: 0, balances: [], unprocessedNetworks: [] }),
      );

      await client.accounts.fetchV5MultiAccountBalances(['id1', 'id2'], {
        networks: ['eip155:1', 'eip155:137'],
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('accountIds=id1%2Cid2');
      expect(calledUrl).toContain('networks=eip155%3A1%2Ceip155%3A137');
    });

    it('handles undefined parameters by not including them', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ count: 0, balances: [], unprocessedNetworks: [] }),
      );

      await client.accounts.fetchV2Balances('0x123', { networks: undefined });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).not.toContain('networks=');
    });

    it('handles boolean parameters correctly', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      await client.token.fetchTokenList(1, {
        includeIconUrl: true,
        includeOccurrences: false,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('includeIconUrl=true');
      expect(calledUrl).toContain('includeOccurrences=false');
    });
  });

  // ===========================================================================
  // HELPER FUNCTIONS TESTS
  // ===========================================================================
  describe('Helper Functions', () => {
    describe('shouldRetry', () => {
      it('allows retries up to MAX_RETRIES (3 retries = 4 total attempts)', () => {
        const error = new Error('test');
        // With MAX_RETRIES=3, we allow retries for failureCount 1, 2, 3
        expect(shouldRetry(1, error)).toBe(true); // 1st retry
        expect(shouldRetry(2, error)).toBe(true); // 2nd retry
        expect(shouldRetry(3, error)).toBe(true); // 3rd retry (MAX_RETRIES)
        expect(shouldRetry(4, error)).toBe(false); // exceeds MAX_RETRIES
        expect(shouldRetry(5, error)).toBe(false);
      });

      it('returns false for 4xx errors except 429 and 408', () => {
        const error400 = Object.assign(new Error('Bad Request'), {
          status: 400,
        });
        const error401 = Object.assign(new Error('Unauthorized'), {
          status: 401,
        });
        const error403 = Object.assign(new Error('Forbidden'), { status: 403 });
        const error404 = Object.assign(new Error('Not Found'), { status: 404 });

        expect(shouldRetry(0, error400)).toBe(false);
        expect(shouldRetry(0, error401)).toBe(false);
        expect(shouldRetry(0, error403)).toBe(false);
        expect(shouldRetry(0, error404)).toBe(false);
      });

      it('returns true for 429 rate limit errors', () => {
        const error429 = Object.assign(new Error('Too Many Requests'), {
          status: 429,
        });
        expect(shouldRetry(0, error429)).toBe(true);
      });

      it('returns true for 408 timeout errors', () => {
        const error408 = Object.assign(new Error('Request Timeout'), {
          status: 408,
        });
        expect(shouldRetry(0, error408)).toBe(true);
      });

      it('returns true for 5xx server errors', () => {
        const error500 = Object.assign(new Error('Internal Server Error'), {
          status: 500,
        });
        const error502 = Object.assign(new Error('Bad Gateway'), {
          status: 502,
        });
        const error503 = Object.assign(new Error('Service Unavailable'), {
          status: 503,
        });

        expect(shouldRetry(0, error500)).toBe(true);
        expect(shouldRetry(0, error502)).toBe(true);
        expect(shouldRetry(0, error503)).toBe(true);
      });

      it('returns true for non-Error objects', () => {
        expect(shouldRetry(0, 'string error')).toBe(true);
        expect(shouldRetry(0, { message: 'object error' })).toBe(true);
        expect(shouldRetry(0, null)).toBe(true);
        expect(shouldRetry(0, undefined)).toBe(true);
      });

      it('returns true for errors without status property', () => {
        const errorWithoutStatus = new Error('Network error');
        expect(shouldRetry(0, errorWithoutStatus)).toBe(true);
      });
    });

    describe('calculateRetryDelay', () => {
      it('returns a value between half and full delay for attempt 0', () => {
        const delay = calculateRetryDelay(0);
        expect(delay).toBeGreaterThanOrEqual(500);
        expect(delay).toBeLessThanOrEqual(1000);
      });

      it('increases delay exponentially with attempt index', () => {
        const delays0: number[] = [];
        const delays1: number[] = [];
        const delays2: number[] = [];

        for (let i = 0; i < 10; i++) {
          delays0.push(calculateRetryDelay(0));
          delays1.push(calculateRetryDelay(1));
          delays2.push(calculateRetryDelay(2));
        }

        const avgDelay0 = delays0.reduce((a, b) => a + b, 0) / delays0.length;
        const avgDelay1 = delays1.reduce((a, b) => a + b, 0) / delays1.length;
        const avgDelay2 = delays2.reduce((a, b) => a + b, 0) / delays2.length;

        expect(avgDelay1).toBeGreaterThan(avgDelay0);
        expect(avgDelay2).toBeGreaterThan(avgDelay1);
      });

      it('caps delay at MAX_DELAY (5000ms)', () => {
        const delay = calculateRetryDelay(20);
        expect(delay).toBeLessThanOrEqual(RETRY_CONFIG.MAX_DELAY);
      });
    });
  });
});
