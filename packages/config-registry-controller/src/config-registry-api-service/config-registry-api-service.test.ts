import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll as nockCleanAll } from 'nock';
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import type { ConfigRegistryApiServiceMessenger } from './config-registry-api-service';
import { ConfigRegistryApiService } from './config-registry-api-service';

const BASE_URL = 'https://client-config.api.cx.metamask.io';

/**
 * Creates a valid network config for testing.
 *
 * @param overrides - Optional overrides for the network config.
 * @returns A valid network config object.
 */
function createValidNetworkConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    chainId: '0x1',
    name: 'Ethereum Mainnet',
    nativeCurrency: 'ETH',
    rpcEndpoints: {
      url: 'https://mainnet.infura.io/v3/test',
      type: 'infura',
      networkClientId: 'mainnet',
      failoverUrls: ['https://eth.llamarpc.com'],
    },
    blockExplorerUrls: ['https://etherscan.io'],
    defaultRpcEndpointIndex: 0,
    defaultBlockExplorerUrlIndex: 0,
    isActive: true,
    isTestnet: false,
    isDefault: true,
    isFeatured: true,
    isDeprecated: false,
    priority: 1,
    isDeletable: false,
    ...overrides,
  };
}

/**
 * Creates a valid API response for testing.
 *
 * @param networks - The networks to include in the response.
 * @returns A valid API response object.
 */
function createValidResponse(networks = [createValidNetworkConfig()]): {
  data: {
    version: string;
    timestamp: number;
    networks: Record<string, unknown>[];
  };
} {
  return {
    data: {
      version: '1.0.0',
      timestamp: Date.now(),
      networks,
    },
  };
}

describe('ConfigRegistryApiService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    nockCleanAll();
  });

  describe('fetchConfig', () => {
    it('returns the network configuration from the API', async () => {
      const response = createValidResponse();
      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      const result = await rootMessenger.call(
        'ConfigRegistryApiService:fetchConfig',
      );

      expect(result.data).toStrictEqual(response.data);
      expect(result.cached).toBe(false);
    });

    it('constructs the correct URL based on env', async () => {
      const devBaseUrl = 'https://client-config.dev-api.cx.metamask.io';
      const response = createValidResponse();
      nock(devBaseUrl).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService({ options: { env: 'dev-api' } });

      const result = await rootMessenger.call(
        'ConfigRegistryApiService:fetchConfig',
      );

      expect(result.data).toStrictEqual(response.data);
    });

    it('returns cached data with etag on 304 response', async () => {
      const response = createValidResponse();
      // First request returns data with ETag
      nock(BASE_URL)
        .get('/v1/config/networks')
        .reply(200, response, { ETag: '"abc123"' });
      // Second request returns 304
      nock(BASE_URL)
        .get('/v1/config/networks')
        .matchHeader('If-None-Match', '"abc123"')
        .reply(304);

      const { rootMessenger } = getService();

      // First call populates cache
      const firstResult = await rootMessenger.call(
        'ConfigRegistryApiService:fetchConfig',
      );
      expect(firstResult.cached).toBe(false);
      expect(firstResult.etag).toBe('"abc123"');

      // Second call should use cache
      const secondResult = await rootMessenger.call(
        'ConfigRegistryApiService:fetchConfig',
      );
      expect(secondResult.cached).toBe(true);
      expect(secondResult.data).toStrictEqual(response.data);
      expect(secondResult.etag).toBe('"abc123"');
    });

    it.each([
      'not an object',
      { missing: 'data' },
      { data: 'not an object' },
      { data: { missing: 'version', timestamp: 123, networks: [] } },
      { data: { version: '1.0', missing: 'timestamp', networks: [] } },
      { data: { version: '1.0', timestamp: 123, missing: 'networks' } },
      { data: { version: '1.0', timestamp: 123, networks: 'not an array' } },
      {
        data: {
          version: '1.0',
          timestamp: 123,
          networks: [{ missing: 'chainId' }],
        },
      },
    ])(
      'throws if the API returns a malformed response %o',
      async (malformedResponse) => {
        nock(BASE_URL)
          .get('/v1/config/networks')
          .reply(200, JSON.stringify(malformedResponse));
        const { rootMessenger } = getService();

        await expect(
          rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
        ).rejects.toThrow(
          'Malformed response received from config registry API',
        );
      },
    );

    it('throws if a required network field is missing', async () => {
      const invalidNetwork = createValidNetworkConfig();
      // Remove a required field
      delete invalidNetwork.isActive;

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if rpcEndpoints is missing required fields', async () => {
      const invalidNetwork = createValidNetworkConfig({
        rpcEndpoints: {
          url: 'https://example.com',
          // missing type, networkClientId, failoverUrls
        },
      });

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if network is not a plain object', async () => {
      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: ['not an object'],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if priority is not a number', async () => {
      const invalidNetwork = createValidNetworkConfig();
      invalidNetwork.priority = 'not a number';

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if defaultRpcEndpointIndex is not a number', async () => {
      const invalidNetwork = createValidNetworkConfig();
      invalidNetwork.defaultRpcEndpointIndex = 'not a number';

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if defaultBlockExplorerUrlIndex is not a number', async () => {
      const invalidNetwork = createValidNetworkConfig();
      invalidNetwork.defaultBlockExplorerUrlIndex = 'not a number';

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if blockExplorerUrls is not an array', async () => {
      const invalidNetwork = createValidNetworkConfig();
      invalidNetwork.blockExplorerUrls = 'not an array';

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if rpcEndpoints is not an object', async () => {
      const invalidNetwork = createValidNetworkConfig();
      invalidNetwork.rpcEndpoints = 'not an object';

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('throws if rpcEndpoints.failoverUrls is not an array', async () => {
      const invalidNetwork = createValidNetworkConfig({
        rpcEndpoints: {
          url: 'https://example.com',
          type: 'infura',
          networkClientId: 'mainnet',
          failoverUrls: 'not an array' as unknown as string[],
        },
      });

      const response = {
        data: {
          version: '1.0.0',
          timestamp: Date.now(),
          networks: [invalidNetwork],
        },
      };

      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow('Malformed response received from config registry API');
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      const response = createValidResponse();
      nock(BASE_URL)
        .get('/v1/config/networks')
        .reply(200, () => {
          clock.tick(6000);
          return response;
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call('ConfigRegistryApiService:fetchConfig');

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock(BASE_URL).get('/v1/config/networks').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        clock.nextAsync().catch(console.error);
      });

      await expect(
        rootMessenger.call('ConfigRegistryApiService:fetchConfig'),
      ).rejects.toThrow(
        `Fetching '${BASE_URL}/v1/config/networks' failed with status '500'`,
      );
    });
  });

  describe('fetchConfig (direct method)', () => {
    it('does the same thing as the messenger action', async () => {
      const response = createValidResponse();
      nock(BASE_URL).get('/v1/config/networks').reply(200, response);
      const { service } = getService();

      const result = await service.fetchConfig();

      expect(result.data).toStrictEqual(response.data);
      expect(result.cached).toBe(false);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ConfigRegistryApiServiceMessenger>,
  MessengerEvents<ConfigRegistryApiServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ConfigRegistryApiServiceMessenger {
  return new Messenger({
    namespace: 'ConfigRegistryApiService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes.
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ConfigRegistryApiService>[0]>;
} = {}): {
  service: ConfigRegistryApiService;
  rootMessenger: RootMessenger;
  messenger: ConfigRegistryApiServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new ConfigRegistryApiService({
    fetch,
    messenger,
    env: 'api',
    ...options,
  });

  return { service, rootMessenger, messenger };
}
