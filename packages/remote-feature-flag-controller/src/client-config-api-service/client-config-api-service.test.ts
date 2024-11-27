import { BASE_URL } from '../constants';
import type { FeatureFlags } from '../remote-feature-flag-controller-types';
import {
  ClientType,
  DistributionType,
  EnvironmentType,
} from '../remote-feature-flag-controller-types';
import { ClientConfigApiService } from './client-config-api-service';

describe('ClientConfigApiService', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let consoleErrorSpy: jest.SpyInstance;
  const mockFeatureFlags: FeatureFlags = [
    { feature1: false },
    { feature2: { chrome: '<109' } },
  ];

  const networkError = new Error('Network error');
  Object.assign(networkError, {
    response: {
      status: 503,
      statusText: 'Service Unavailable',
    },
  });

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  it('should successfully fetch and return feature flags', async () => {
    const mockFetch = createMockFetch({
      data: mockFeatureFlags,
    });
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: 0,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    const result = await clientConfigApiService.fetchRemoteFeatureFlag();

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/flags?client=extension&distribution=main&environment=prod`,
      { cache: 'no-cache' },
    );

    expect(result).toStrictEqual({
      error: false,
      message: 'Success',
      statusCode: '200',
      statusText: 'OK',
      remoteFeatureFlag: mockFeatureFlags,
      cacheTimestamp: expect.any(Number),
    });
  });

  it('should return cached data when API request fails and cached data is available', async () => {
    const mockFetch = createMockFetch({ error: networkError });

    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: 0,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    const remoteFeatureFlag = [{ feature3: true }];
    const cacheTimestamp = Date.now();

    const result = await clientConfigApiService.fetchRemoteFeatureFlag({
      remoteFeatureFlag,
      cacheTimestamp,
    });

    expect(result).toStrictEqual({
      error: true,
      message: 'Network error',
      statusCode: '503',
      statusText: 'Service Unavailable',
      remoteFeatureFlag,
      cacheTimestamp,
    });
  });

  it('should return empty object when API request fails and cached data is not available', async () => {
    const mockFetch = createMockFetch({ error: networkError });
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: 0,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    const result = await clientConfigApiService.fetchRemoteFeatureFlag();

    expect(result).toStrictEqual({
      error: true,
      message: 'Network error',
      statusCode: '503',
      statusText: 'Service Unavailable',
      remoteFeatureFlag: [],
      cacheTimestamp: expect.any(Number),
    });
  });

  it('should handle non-200 responses without cache data', async () => {
    const mockFetch = createMockFetch({
      options: {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      },
    });
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: 0,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });
    const result = await clientConfigApiService.fetchRemoteFeatureFlag();
    const currentTime = Date.now();
    expect(result).toStrictEqual({
      error: true,
      message: 'Failed to fetch flags',
      statusCode: '404',
      statusText: 'Not Found',
      remoteFeatureFlag: [],
      cacheTimestamp: currentTime,
    });
  });

  it('should handle non-200 responses with cache data', async () => {
    const mockFetch = createMockFetch({
      options: {
        ok: false,
        status: 404,
        statusText: 'Not Found',
      },
    });
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: 0,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    const remoteFeatureFlag = [{ feature3: true }];
    const cacheTimestamp = Date.now();

    const result = await clientConfigApiService.fetchRemoteFeatureFlag({
      remoteFeatureFlag,
      cacheTimestamp,
    });

    expect(result).toStrictEqual({
      error: true,
      message: 'Failed to fetch flags',
      statusCode: '404',
      statusText: 'Not Found',
      remoteFeatureFlag,
      cacheTimestamp,
    });
  });

  it('should retry the fetch the specified number of times on failure', async () => {
    const mockFetch = createMockFetch({ error: networkError });
    const maxRetries = 3;
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: maxRetries,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    const result = await clientConfigApiService.fetchRemoteFeatureFlag();
    const currentTime = Date.now();
    expect(result).toStrictEqual({
      error: true,
      message: 'Network error',
      statusCode: '503',
      statusText: 'Service Unavailable',
      remoteFeatureFlag: [],
      cacheTimestamp: currentTime,
    });
    // Check that fetch was retried the correct number of times
    expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
  });

  it('should open the circuit breaker after consecutive failures', async () => {
    const mockFetch = createMockFetch({ error: networkError });
    const maxFailures = 3; // Set max consecutive failures for circuit breaker
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      maximumConsecutiveFailures: maxFailures,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    // Trigger fetch attempts
    for (let i = 0; i < maxFailures; i++) {
      await clientConfigApiService.fetchRemoteFeatureFlag();
    }

    const result = await clientConfigApiService.fetchRemoteFeatureFlag();

    expect(result).toStrictEqual({
      error: true,
      message: 'Execution prevented because the circuit breaker is open',
      statusCode: null,
      statusText: null,
      remoteFeatureFlag: [],
      cacheTimestamp: expect.any(Number),
    });

    // Check that fetch was called for each failure before the circuit breaker opened
    expect(mockFetch).toHaveBeenCalledTimes(maxFailures);
  });

  it('should call the onDegraded callback when requests are slow', async () => {
    jest.setTimeout(7000);
    const onDegraded = jest.fn();
    const slowFetchTime = 5500; // Exceed the DEFAULT_DEGRADED_THRESHOLD (5000ms)
    // Mock fetch to take a long time
    const mockSlowFetch = createMockFetch({
      data: mockFeatureFlags,
      delay: slowFetchTime,
    });

    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockSlowFetch,
      onDegraded,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    await clientConfigApiService.fetchRemoteFeatureFlag();

    // Verify the degraded callback was called
    expect(onDegraded).toHaveBeenCalled();
  }, 7000);

  it('should succeed on a subsequent fetch attempt after retries', async () => {
    const maxRetries = 2;
    // Mock fetch to fail initially, then succeed
    const mockFetch = jest
      .fn()
      .mockRejectedValueOnce(networkError) // First attempt fails
      .mockRejectedValueOnce(networkError) // Second attempt fails
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockFeatureFlags, // Third attempt succeeds
      });
    const clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: maxRetries,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    const result = await clientConfigApiService.fetchRemoteFeatureFlag();

    // Verify success on the third attempt
    expect(result).toStrictEqual({
      error: false,
      message: 'Success',
      statusCode: '200',
      statusText: 'OK',
      remoteFeatureFlag: mockFeatureFlags,
      cacheTimestamp: expect.any(Number),
    });

    // Verify fetch was retried the correct number of times
    expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
  });
});

/**
 * Creates a mock fetch function with configurable response data and options
 * @template T - The type of data to be returned by the fetch response
 * @param params - Configuration parameters
 * @param params.data - The data to be returned in the response body
 * @param params.options - Optional Response properties to override defaults
 * @param params.error - Error to reject with (if provided, mock will reject instead of resolve)
 * @param params.delay - Delay in milliseconds before resolving/rejecting
 * @returns A Jest mock function that resolves with a fetch-like Response object (or rejects with error if provided)
 */
function createMockFetch<ResponseData>({
  data,
  options = {},
  error,
  delay = 0,
}: {
  data?: ResponseData;
  options?: Partial<Response>;
  error?: Error;
  delay?: number;
}) {
  if (error) {
    return jest
      .fn()
      .mockImplementation(
        () =>
          new Promise((_, reject) => setTimeout(() => reject(error), delay)),
      );
  }

  return jest.fn().mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              status: 200,
              statusText: 'OK',
              json: async () => data,
              ...options,
            }),
          delay,
        ),
      ),
  );
}
