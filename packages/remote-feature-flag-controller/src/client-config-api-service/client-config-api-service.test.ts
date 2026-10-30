import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { BASE_URL } from '../constants.js';
import type {
  ApiDataResponse,
  FeatureFlags,
} from '../remote-feature-flag-controller-types.js';
import {
  ClientType,
  DistributionType,
  EnvironmentType,
} from '../remote-feature-flag-controller-types.js';
import { ClientConfigApiService } from './client-config-api-service.js';
import type { ClientConfigApiServiceMessenger } from './client-config-api-service.js';

const mockServerFeatureFlagsResponse: ApiDataResponse = [
  { feature1: false },
  { feature2: { chrome: '<109' } },
];

const mockFeatureFlags: FeatureFlags = {
  feature1: false,
  feature2: { chrome: '<109' },
};

vi.setConfig({ testTimeout: 8000 });

describe('ClientConfigApiService', () => {
  describe('ClientConfigApiService:fetchRemoteFeatureFlags', () => {
    it('fetches successfully and returns feature flags', async () => {
      const mockFetch = createMockFetch({
        response: createMockResponse(mockServerFeatureFlagsResponse),
      });
      const { rootMessenger } = getService({ options: { fetch: mockFetch } });

      const result = await rootMessenger.call(
        'ClientConfigApiService:fetchRemoteFeatureFlags',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/flags?client=extension&distribution=main&environment=prod`,
        { cache: 'no-cache' },
      );
      expect(result).toStrictEqual({
        remoteFeatureFlags: mockFeatureFlags,
        cacheTimestamp: expect.any(Number),
      });
    });

    it('builds the URL from the configured client, distribution and environment', async () => {
      const mockFetch = createMockFetch({
        response: createMockResponse(mockServerFeatureFlagsResponse),
      });
      const { service } = getService({
        options: {
          fetch: mockFetch,
          config: {
            client: ClientType.Mobile,
            distribution: DistributionType.Flask,
            environment: EnvironmentType.ReleaseCandidate,
          },
        },
      });

      await service.fetchRemoteFeatureFlags();

      expect(mockFetch).toHaveBeenCalledWith(
        `${BASE_URL}/flags?client=mobile&distribution=flask&environment=rc`,
        { cache: 'no-cache' },
      );
    });

    it('merges later flag objects over earlier ones', async () => {
      const { service } = getService({
        options: {
          fetch: createMockFetch({
            response: createMockResponse([{ a: 1, b: 1 }, { b: 2 }]),
          }),
        },
      });

      const result = await service.fetchRemoteFeatureFlags();

      expect(result.remoteFeatureFlags).toStrictEqual({ a: 1, b: 2 });
    });

    it('returns an empty object when the API returns an empty array', async () => {
      const { service } = getService({
        options: {
          fetch: createMockFetch({ response: createMockResponse([]) }),
        },
      });

      const result = await service.fetchRemoteFeatureFlags();

      expect(result.remoteFeatureFlags).toStrictEqual({});
    });

    it('always refetches on sequential calls', async () => {
      const mockFetch = createMockFetch({
        response: createMockResponse(mockServerFeatureFlagsResponse),
      });
      const { service } = getService({ options: { fetch: mockFetch } });

      await service.fetchRemoteFeatureFlags();
      await service.fetchRemoteFeatureFlags();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('shares a single request across concurrent calls', async () => {
      const mockFetch = createMockFetch({
        response: createMockResponse(mockServerFeatureFlagsResponse),
      });
      const { service } = getService({ options: { fetch: mockFetch } });

      const results = await Promise.all([
        service.fetchRemoteFeatureFlags(),
        service.fetchRemoteFeatureFlags(),
        service.fetchRemoteFeatureFlags(),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(results[0].remoteFeatureFlags).toStrictEqual(mockFeatureFlags);
      expect(results[2].remoteFeatureFlags).toStrictEqual(mockFeatureFlags);
    });

    it('throws the network error', async () => {
      const networkError = new Error('Network error');
      const { service } = getService({
        options: {
          fetch: createMockFetch({ error: networkError }),
          policyOptions: { maxRetries: 0 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        networkError,
      );
    });

    it('throws an HttpError when the API returns a non 2xx status', async () => {
      const { service } = getService({
        options: {
          fetch: createMockFetch({ response: createMockResponse({}, 400) }),
          policyOptions: { maxRetries: 0 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'Failed to fetch remote feature flags: 400',
      );
    });

    it('retries a 5xx response', async () => {
      const mockFetch = createMockFetch({
        response: createMockResponse({}, 500),
      });
      const { service } = getService({
        options: {
          fetch: mockFetch,
          policyOptions: { maxRetries: 2, maxConsecutiveFailures: 100 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'Failed to fetch remote feature flags: 500',
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('throws when the API does not return an array', async () => {
      const { service } = getService({
        options: {
          fetch: createMockFetch({
            response: createMockResponse({ invalid: 'response' }),
          }),
          policyOptions: { maxRetries: 0 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'Query function for "ClientConfigApiService:fetchRemoteFeatureFlags" returned an unexpected response',
      );
    });

    it('throws when the array contains something other than flag objects', async () => {
      const { service } = getService({
        options: {
          fetch: createMockFetch({
            response: createMockResponse([{ feature1: true }, 'nope']),
          }),
          policyOptions: { maxRetries: 0 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'returned an unexpected response',
      );
    });

    it('retries the fetch the specified number of times on failure', async () => {
      const mockFetch = createMockFetch({ error: new Error('Network error') });
      const { service } = getService({
        options: {
          fetch: mockFetch,
          policyOptions: { maxRetries: 3, maxConsecutiveFailures: 100 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'Network error',
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('breaks the circuit after too many consecutive failures', async () => {
      const mockFetch = createMockFetch({ error: new Error('Network error') });
      const { service } = getService({
        options: {
          fetch: mockFetch,
          policyOptions: { maxRetries: 0, maxConsecutiveFailures: 1 },
        },
      });

      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'Network error',
      );
      await expect(service.fetchRemoteFeatureFlags()).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache', () => {
    it('registers the invalidateQueries action', async () => {
      const { rootMessenger } = getService();

      expect(
        await rootMessenger.call('ClientConfigApiService:invalidateQueries'),
      ).toBeUndefined();
    });

    it('publishes cacheUpdated after a fetch', async () => {
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.fetchRemoteFeatureFlags();

      expect(publishSpy).toHaveBeenCalledWith(
        'ClientConfigApiService:cacheUpdated',
        expect.objectContaining({ objectType: 'query' }),
      );
    });
  });
});

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ClientConfigApiServiceMessenger>,
  MessengerEvents<ClientConfigApiServiceMessenger>
>;

/**
 * Creates a mock Response-like object.
 *
 * @param body - The JSON body to return.
 * @param status - The HTTP status code.
 * @returns A mock Response object.
 */
function createMockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/**
 * Creates a mock fetch function.
 *
 * @param params - Configuration parameters.
 * @param params.response - The response to resolve with.
 * @param params.error - An error to reject with instead.
 * @returns A mock function.
 */
function createMockFetch({
  response,
  error,
}: {
  response?: Response;
  error?: Error;
}): Mock {
  return vi
    .fn()
    .mockImplementation(async () =>
      error ? Promise.reject(error) : Promise.resolve(response),
    );
}

/**
 * Constructs the service under test with sensible defaults.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All
 * are optional and will be filled in with defaults as needed.
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ClientConfigApiService>[0]>;
} = {}): {
  service: ClientConfigApiService;
  rootMessenger: RootMessenger;
  messenger: ClientConfigApiServiceMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const messenger: ClientConfigApiServiceMessenger = new Messenger({
    namespace: 'ClientConfigApiService',
    parent: rootMessenger,
  });
  const service = new ClientConfigApiService({
    messenger,
    fetch: createMockFetch({
      response: createMockResponse(mockServerFeatureFlagsResponse),
    }),
    config: {
      client: ClientType.Extension,
      distribution: DistributionType.Main,
      environment: EnvironmentType.Production,
    },
    ...options,
  });

  return { service, rootMessenger, messenger };
}
