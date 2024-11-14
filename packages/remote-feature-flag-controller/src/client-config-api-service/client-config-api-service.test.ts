import type { FeatureFlags } from '../remote-feature-flag-controller-types';
import {
  ClientType,
  DistributionType,
  EnvironmentType,
} from '../remote-feature-flag-controller-types';
import { ClientConfigApiService } from './client-config-api-service';

const BASE_URL = 'https://client-config.api.cx.metamask.io/v1';

// eslint-disable-next-line jest/prefer-spy-on
console.error = jest.fn();

describe('ClientConfigApiService', () => {
  let clientConfigApiService: ClientConfigApiService;
  let mockFetch: jest.Mock;

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
    mockFetch = jest.fn();
    clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: 0,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully fetch and return feature flags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => mockFeatureFlags,
    });

    const result = await clientConfigApiService.fetchFlags();

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/flags?client=extension&distribution=main&environment=prod`,
      { cache: 'no-cache' },
    );

    expect(result).toStrictEqual({
      error: false,
      message: 'Success',
      statusCode: '200',
      statusText: 'OK',
      cachedData: mockFeatureFlags,
      cacheTimestamp: expect.any(Number),
    });
  });

  it('should return cached data when API request fails and cached data is available', async () => {
    const cachedData = [{ feature3: true }];
    const cacheTimestamp = Date.now();

    mockFetch.mockRejectedValueOnce(networkError);

    const result = await clientConfigApiService.fetchFlags(
      cachedData,
      cacheTimestamp,
    );

    expect(result).toStrictEqual({
      error: true,
      message: 'Network error',
      statusCode: '503',
      statusText: 'Service Unavailable',
      cachedData,
      cacheTimestamp,
    });
  });

  it('should return empty object when API request fails and cached data is not available', async () => {
    mockFetch.mockRejectedValueOnce(networkError);
    const result = await clientConfigApiService.fetchFlags();

    expect(result).toStrictEqual({
      error: true,
      message: 'Network error',
      statusCode: '503',
      statusText: 'Service Unavailable',
      cachedData: [],
      cacheTimestamp: expect.any(Number),
    });
  });

  it('should handle non-200 responses without cache data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await clientConfigApiService.fetchFlags();
    const currentTime = Date.now();
    expect(result).toStrictEqual({
      error: true,
      message: 'Failed to fetch flags',
      statusCode: '404',
      statusText: 'Not Found',
      cachedData: [],
      cacheTimestamp: currentTime,
    });
  });

  it('should handle non-200 responses with cache data', async () => {
    const cachedData = [{ feature3: true }];
    const cacheTimestamp = Date.now();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const result = await clientConfigApiService.fetchFlags(
      cachedData,
      cacheTimestamp,
    );

    expect(result).toStrictEqual({
      error: true,
      message: 'Failed to fetch flags',
      statusCode: '404',
      statusText: 'Not Found',
      cachedData,
      cacheTimestamp,
    });
  });

  it('should retry the fetch the specified number of times on failure', async () => {
    const maxRetries = 3;
    clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: maxRetries,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    // Mock fetch to fail every time
    mockFetch.mockRejectedValue(networkError);

    const result = await clientConfigApiService.fetchFlags();
    const currentTime = Date.now();
    expect(result).toStrictEqual({
      error: true,
      message: 'Network error',
      statusCode: '503',
      statusText: 'Service Unavailable',
      cachedData: [],
      cacheTimestamp: currentTime,
    });
    // Check that fetch was retried the correct number of times
    expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
  });

  it('should open the circuit breaker after consecutive failures', async () => {
    const maxFailures = 3; // Set max consecutive failures for circuit breaker
    clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      maximumConsecutiveFailures: maxFailures,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    // Mock fetch to fail every time
    mockFetch.mockRejectedValue(networkError);

    // Trigger fetch attempts
    for (let i = 0; i < maxFailures; i++) {
      await clientConfigApiService.fetchFlags();
    }

    const result = await clientConfigApiService.fetchFlags();

    expect(result).toStrictEqual({
      error: true,
      message: 'Execution prevented because the circuit breaker is open',
      statusCode: null,
      statusText: null,
      cachedData: [],
      cacheTimestamp: expect.any(Number),
    });

    // Check that fetch was called for each failure before the circuit breaker opened
    expect(mockFetch).toHaveBeenCalledTimes(maxFailures);
  });

  it('should call the onDegraded callback when requests are slow', async () => {
    const onDegraded = jest.fn();
    const slowFetchTime = 5500; // Exceed the DEFAULT_DEGRADED_THRESHOLD (5000ms)

    clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      onDegraded,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    // Mock fetch to take a long time
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => mockFeatureFlags,
              }),
            slowFetchTime,
          ),
        ),
    );

    await clientConfigApiService.fetchFlags();

    // Verify the degraded callback was called
    expect(onDegraded).toHaveBeenCalled();
  });

  it('should succeed on a subsequent fetch attempt after retries', async () => {
    const maxRetries = 2;
    clientConfigApiService = new ClientConfigApiService({
      fetch: mockFetch,
      retries: maxRetries,
      config: {
        client: ClientType.Extension,
        distribution: DistributionType.Main,
        environment: EnvironmentType.Production,
      },
    });

    // Mock fetch to fail initially, then succeed
    mockFetch
      .mockRejectedValueOnce(networkError) // First attempt fails
      .mockRejectedValueOnce(networkError) // Second attempt fails
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockFeatureFlags, // Third attempt succeeds
      });

    const result = await clientConfigApiService.fetchFlags();

    // Verify success on the third attempt
    expect(result).toStrictEqual({
      error: false,
      message: 'Success',
      statusCode: '200',
      statusText: 'OK',
      cachedData: mockFeatureFlags,
      cacheTimestamp: expect.any(Number),
    });

    // Verify fetch was retried the correct number of times
    expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
  });
});
