import { BASE_URL } from '../constants';
import type { FeatureFlags } from '../remote-feature-flag-controller-types';
import {
  ClientType,
  DistributionType,
  EnvironmentType,
} from '../remote-feature-flag-controller-types';
import { ClientConfigApiService } from './client-config-api-service';

describe('ClientConfigApiService', () => {
  const mockFeatureFlags: FeatureFlags = [
    { feature1: false },
    { feature2: { chrome: '<109' } },
  ];

  const networkError = new Error('Network error');

  describe('fetchRemoteFeatureFlags', () => {
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

      const result = await clientConfigApiService.fetchRemoteFeatureFlags();

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/flags?client=extension&distribution=main&environment=prod`,
        { cache: 'no-cache' },
      );

      expect(result).toStrictEqual({
        remoteFeatureFlags: mockFeatureFlags,
        cacheTimestamp: expect.any(Number),
      });
    });

    it('should throw error when API request fails', async () => {
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

      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow(networkError);
    });

    it('should throw an error when the API does not return an array', async () => {
      const mockFetch = createMockFetch({ data: undefined });
      const clientConfigApiService = new ClientConfigApiService({
        fetch: mockFetch,
        retries: 0,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      });

      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow('Feature flags api did not return an array');
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

      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow(networkError);
      // Check that fetch was retried the correct number of times
      expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1); // Initial + retries
    });
  });

  describe('circuit breaker', () => {
    it('should open the circuit breaker after consecutive failures', async () => {
      const mockFetch = createMockFetch({ error: networkError });
      const maxFailures = 3;
      const clientConfigApiService = new ClientConfigApiService({
        fetch: mockFetch,
        maximumConsecutiveFailures: maxFailures,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      });

      // Attempt requests until circuit breaker opens
      for (let i = 0; i < maxFailures; i++) {
        await expect(
          clientConfigApiService.fetchRemoteFeatureFlags(),
        ).rejects.toThrow(
          /Network error|Execution prevented because the circuit breaker is open/u,
        );
      }

      // Verify the circuit breaker is now open
      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      // Verify fetch was called the expected number of times
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

      await clientConfigApiService.fetchRemoteFeatureFlags();

      // Verify the degraded callback was called
      expect(onDegraded).toHaveBeenCalled();
    }, 7000);

    it('should succeed on a subsequent fetch attempt after retries', async () => {
      const maxRetries = 2;
      // Mock fetch to fail initially, then succeed
      const mockFetch = jest
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => mockFeatureFlags,
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

      const result = await clientConfigApiService.fetchRemoteFeatureFlags();

      expect(result).toStrictEqual({
        remoteFeatureFlags: mockFeatureFlags,
        cacheTimestamp: expect.any(Number),
      });

      expect(mockFetch).toHaveBeenCalledTimes(maxRetries + 1);
    });
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
