import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { NetworkConfig } from './config-registry-api-service/config-registry-api-service';
import { ConfigRegistryController } from './config-registry-controller';
import type { ConfigRegistryControllerMessenger } from './config-registry-controller';

/**
 * Creates a valid network config for testing.
 *
 * @param overrides - Optional overrides for the network config.
 * @returns A valid network config object.
 */
function createValidNetworkConfig(
  overrides: Partial<NetworkConfig> = {},
): NetworkConfig {
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

describe('ConfigRegistryController', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-02'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {
        configs: {
          networks: {
            '0x1': {
              key: '0x1',
              value: createValidNetworkConfig(),
            },
          },
        },
        version: '1.0.0',
        lastFetched: 123456789,
        fetchError: null,
        etag: '"abc123"',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          Object {
            "configs": Object {
              "networks": Object {},
            },
            "etag": null,
            "fetchError": null,
            "lastFetched": null,
            "version": null,
          }
        `);
      });
    });
  });

  describe('updateConfigs', () => {
    it('fetches and persists network configs from the service', async () => {
      await withController(
        {
          options: {},
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          const network = createValidNetworkConfig();
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => ({
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: [network],
              },
              cached: false,
              etag: '"abc123"',
            }),
          );

          await controller.updateConfigs();

          expect(controller.state).toStrictEqual({
            configs: {
              networks: {
                '0x1': {
                  key: '0x1',
                  value: network,
                },
              },
            },
            version: '1.0.0',
            lastFetched: Date.now(),
            fetchError: null,
            etag: '"abc123"',
          });
        },
      );
    });

    it('filters out testnet networks', async () => {
      await withController(
        {
          options: {},
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          const mainnet = createValidNetworkConfig({ chainId: '0x1' });
          const testnet = createValidNetworkConfig({
            chainId: '0x5',
            isTestnet: true,
          });
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => ({
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: [mainnet, testnet],
              },
              cached: false,
              etag: null,
            }),
          );

          await controller.updateConfigs();

          expect(Object.keys(controller.state.configs.networks)).toStrictEqual([
            '0x1',
          ]);
        },
      );
    });

    it('keeps networks that are featured or active', async () => {
      await withController(
        {
          options: {},
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          const featured = createValidNetworkConfig({
            chainId: '0x1',
            isFeatured: true,
            isActive: false,
          });
          const active = createValidNetworkConfig({
            chainId: '0x2',
            isFeatured: false,
            isActive: true,
          });
          const neither = createValidNetworkConfig({
            chainId: '0x3',
            isFeatured: false,
            isActive: false,
          });
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => ({
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: [featured, active, neither],
              },
              cached: false,
              etag: null,
            }),
          );

          await controller.updateConfigs();

          expect(
            Object.keys(controller.state.configs.networks).sort(),
          ).toStrictEqual(['0x1', '0x2']);
        },
      );
    });

    it('handles duplicate chain IDs by keeping the one with highest priority', async () => {
      await withController(
        {
          options: {},
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          const lowPriority = createValidNetworkConfig({
            chainId: '0x1',
            name: 'Low Priority',
            priority: 1,
          });
          const highPriority = createValidNetworkConfig({
            chainId: '0x1',
            name: 'High Priority',
            priority: 10,
          });
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => ({
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: [lowPriority, highPriority],
              },
              cached: false,
              etag: null,
            }),
          );

          await controller.updateConfigs();

          expect(controller.state.configs.networks['0x1'].value.name).toBe(
            'High Priority',
          );
        },
      );
    });

    it('only updates lastFetched and clears error when response is cached', async () => {
      await withController(
        {
          options: {
            state: {
              configs: {
                networks: {
                  '0x1': {
                    key: '0x1',
                    value: createValidNetworkConfig(),
                  },
                },
              },
              version: '1.0.0',
              lastFetched: 1000,
              fetchError: 'previous error',
              etag: '"old"',
            },
          },
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => ({
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: [],
              },
              cached: true,
              etag: '"new"',
            }),
          );

          await controller.updateConfigs();

          // Networks should be unchanged since response was cached
          expect(Object.keys(controller.state.configs.networks)).toStrictEqual([
            '0x1',
          ]);
          // lastFetched should be updated
          expect(controller.state.lastFetched).toBe(Date.now());
          // Error should be cleared
          expect(controller.state.fetchError).toBeNull();
          // etag should be updated
          expect(controller.state.etag).toBe('"new"');
          // Version should remain unchanged
          expect(controller.state.version).toBe('1.0.0');
        },
      );
    });

    it('captures error in fetchError but still updates lastFetched', async () => {
      await withController(
        {
          options: {},
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => {
              throw new Error('Network error');
            },
          );

          await controller.updateConfigs();

          expect(controller.state.fetchError).toBe('Network error');
          expect(controller.state.lastFetched).toBe(Date.now());
        },
      );
    });

    it('returns early without doing anything if feature flag is disabled', async () => {
      await withController(
        {
          options: {
            isFeatureFlagEnabled: () => false,
          },
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          const fetchConfig = jest.fn();
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            fetchConfig,
          );

          await controller.updateConfigs();

          expect(fetchConfig).not.toHaveBeenCalled();
          expect(controller.state.lastFetched).toBeNull();
        },
      );
    });
  });

  describe('ConfigRegistryController:updateConfigs', () => {
    it('does the same thing as the direct method', async () => {
      await withController(
        {
          options: {},
          keyringState: { isUnlocked: false },
        },
        async ({ controller, rootMessenger }) => {
          const network = createValidNetworkConfig();
          rootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            async () => ({
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: [network],
              },
              cached: false,
              etag: '"abc123"',
            }),
          );

          await rootMessenger.call('ConfigRegistryController:updateConfigs');

          expect(controller.state.configs.networks['0x1']).toBeDefined();
        },
      );
    });
  });

  describe('metadata', () => {
    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "configs": Object {
              "networks": Object {},
            },
            "etag": null,
            "lastFetched": null,
            "version": null,
          }
        `);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ConfigRegistryControllerMessenger>,
  MessengerEvents<ConfigRegistryControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: ConfigRegistryController;
  rootMessenger: RootMessenger;
  messenger: ConfigRegistryControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof ConfigRegistryController>[0]>;
  keyringState?: { isUnlocked: boolean };
  fetchConfigHandler?: jest.Mock;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ConfigRegistryControllerMessenger {
  const messenger: ConfigRegistryControllerMessenger = new Messenger({
    namespace: 'ConfigRegistryController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'KeyringController:getState',
      'ConfigRegistryApiService:fetchConfig',
    ],
    events: ['KeyringController:lock', 'KeyringController:unlock'],
    messenger,
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [
    {
      options = {},
      keyringState = { isUnlocked: false },
      fetchConfigHandler = undefined,
    },
    testFunction,
  ] = args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();

  // Register keyring state handler on root messenger
  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    () =>
      ({
        ...keyringState,
        keyrings: [],
      }) as ReturnType<
        Parameters<
          typeof rootMessenger.registerActionHandler<'KeyringController:getState'>
        >[1]
      >,
  );

  // Register fetchConfig handler if provided (needs to be registered before controller creation)
  if (fetchConfigHandler) {
    rootMessenger.registerActionHandler(
      'ConfigRegistryApiService:fetchConfig',
      fetchConfigHandler as () => Promise<{
        data: { version: string; timestamp: number; networks: NetworkConfig[] };
        cached: boolean;
        etag: string | null;
      }>,
    );
  }

  const messenger = getMessenger(rootMessenger);
  const controller = new ConfigRegistryController({
    messenger,
    ...options,
  });
  try {
    return await testFunction({ controller, rootMessenger, messenger });
  } finally {
    controller.stopAllPolling();
  }
}
