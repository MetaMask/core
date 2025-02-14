import { BASE_URL } from '../constants';
import type {
  ApiDataResponse,
  FeatureFlags,
} from '../remote-feature-flag-controller-types';
import {
  ClientType,
  DistributionType,
  EnvironmentType,
} from '../remote-feature-flag-controller-types';
import { ClientConfigApiService } from './client-config-api-service';

const mockServerFeatureFlagsResponse: ApiDataResponse = [
  { feature1: false },
  { feature2: { chrome: '<109' } },
];

const mockFeatureFlags: FeatureFlags = {
  feature1: false,
  feature2: { chrome: '<109' },
};

jest.setTimeout(8000);

describe('ClientConfigApiService', () => {
  const networkError = new Error('Network error');

  describe('onBreak', () => {
    it('should register a listener that is called when the circuit opens', async () => {
      const onBreak = jest.fn();
      const mockFetch = createMockFetch({ error: networkError });

      const clientConfigApiService = new ClientConfigApiService({
        fetch: mockFetch,
        maximumConsecutiveFailures: 1,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      });
      clientConfigApiService.onBreak(onBreak);

      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      expect(onBreak).toHaveBeenCalled();
    });
  });

  describe('onDegraded', () => {
    it('should register a listener that is called when the request is slow', async () => {
      const onDegraded = jest.fn();
      const slowFetchTime = 5500; // Exceed the DEFAULT_DEGRADED_THRESHOLD (5000ms)
      // Mock fetch to take a long time
      const mockSlowFetch = createMockFetch({
        response: {
          ok: true,
          status: 200,
          json: async () => mockServerFeatureFlagsResponse,
        },
        delay: slowFetchTime,
      });

      const clientConfigApiService = new ClientConfigApiService({
        fetch: mockSlowFetch,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      });
      clientConfigApiService.onDegraded(onDegraded);

      await clientConfigApiService.fetchRemoteFeatureFlags();

      // Verify the degraded callback was called
      expect(onDegraded).toHaveBeenCalled();
    }, 7000);
  });

  describe('fetchRemoteFeatureFlags', () => {
    it('fetches successfully and returns feature flags', async () => {
      const mockFetch = createMockFetch({
        response: {
          ok: true,
          status: 200,
          json: async () => mockServerFeatureFlagsResponse,
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

    it('throws an error when the API request fails', async () => {
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

    it('throws an error when the network request returns a non-200 status code', async () => {
      const mockFetch = createMockFetch({ response: { status: 400 } });
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
      ).rejects.toThrow('Failed to fetch remote feature flags');
    });

    it('should handle non-array response by throwing an error', async () => {
      const mockFetch = createMockFetch({
        response: {
          ok: true,
          status: 200,
          json: async () => ({ invalid: 'response' }),
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

      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow('Feature flags api did not return an array');
    });

    it('retries the fetch the specified number of times on failure', async () => {
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

    it('should call the onBreak callback when the circuit opens', async () => {
      const onBreak = jest.fn();
      const mockFetch = createMockFetch({ error: networkError });

      const clientConfigApiService = new ClientConfigApiService({
        fetch: mockFetch,
        maximumConsecutiveFailures: 1,
        onBreak,
        config: {
          client: ClientType.Extension,
          distribution: DistributionType.Main,
          environment: EnvironmentType.Production,
        },
      });

      await expect(
        clientConfigApiService.fetchRemoteFeatureFlags(),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      expect(onBreak).toHaveBeenCalled();
    });

    it('should call the onDegraded callback when the request is slow', async () => {
      const onDegraded = jest.fn();
      const slowFetchTime = 5500; // Exceed the DEFAULT_DEGRADED_THRESHOLD (5000ms)
      // Mock fetch to take a long time
      const mockSlowFetch = createMockFetch({
        response: {
          ok: true,
          status: 200,
          json: async () => mockServerFeatureFlagsResponse,
        },
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
  });
});

/**
 * Creates a mock fetch function with configurable response data and options
 * @template T - The type of data to be returned by the fetch response
 * @param params - Configuration parameters
 * @param params.response - Optional Response properties to override defaults
 * @param params.error - Error to reject with (if provided, mock will reject instead of resolve)
 * @param params.delay - Delay in milliseconds before resolving/rejecting
 * @returns A Jest mock function that resolves with a fetch-like Response object (or rejects with error if provided)
 */
function createMockFetch({
  response,
  error,
  delay = 0,
}: {
  response?: Partial<Response>;
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

  return jest
    .fn()
    .mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve(response), delay)),
    );
}
