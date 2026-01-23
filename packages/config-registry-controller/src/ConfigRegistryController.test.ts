import type { MockAnyNamespace } from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import { useFakeTimers } from 'sinon';

import type {
  AbstractConfigRegistryApiService,
  FetchConfigResult,
  NetworkConfig,
} from './config-registry-api-service';
import {
  ConfigRegistryController,
  DEFAULT_POLLING_INTERVAL,
} from './ConfigRegistryController';
import type {
  ConfigRegistryMessenger,
  ConfigRegistryState,
  NetworkConfigEntry,
} from './ConfigRegistryController';
import { advanceTime } from '../../../tests/helpers';

const namespace = 'ConfigRegistryController' as const;

type RootMessenger = Messenger<
  MockAnyNamespace,
  | { type: 'RemoteFeatureFlagController:getState'; handler: () => unknown }
  | {
      type: 'KeyringController:getState';
      handler: () => { isUnlocked: boolean };
    }
  | {
      type: 'ConfigRegistryApiService:fetchConfig';
      handler: (options?: { etag?: string }) => Promise<FetchConfigResult>;
    },
  | { type: 'KeyringController:unlock'; payload: [] }
  | { type: 'KeyringController:lock'; payload: [] }
>;

/**
 * Constructs a messenger for ConfigRegistryController.
 *
 * @returns A controller messenger and root messenger.
 */
function getConfigRegistryControllerMessenger(): {
  messenger: ConfigRegistryMessenger;
  rootMessenger: RootMessenger;
} {
  const rootMessenger = new Messenger<
    MockAnyNamespace,
    | { type: 'RemoteFeatureFlagController:getState'; handler: () => unknown }
    | {
        type: 'KeyringController:getState';
        handler: () => { isUnlocked: boolean };
      }
    | {
        type: 'ConfigRegistryApiService:fetchConfig';
        handler: (options?: { etag?: string }) => Promise<FetchConfigResult>;
      },
    | { type: 'KeyringController:unlock'; payload: [] }
    | { type: 'KeyringController:lock'; payload: [] }
  >({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const configRegistryControllerMessenger = new Messenger<
    typeof namespace,
    never,
    | { type: 'KeyringController:unlock'; payload: [] }
    | { type: 'KeyringController:lock'; payload: [] },
    typeof rootMessenger
  >({
    namespace,
    parent: rootMessenger,
  }) as ConfigRegistryMessenger;

  rootMessenger.delegate({
    messenger: configRegistryControllerMessenger,
    actions: [
      'RemoteFeatureFlagController:getState',
      'KeyringController:getState',
      'ConfigRegistryApiService:fetchConfig',
    ] as never[],
    events: ['KeyringController:unlock', 'KeyringController:lock'] as never[],
  });

  return { messenger: configRegistryControllerMessenger, rootMessenger };
}

/**
 * Creates a mock NetworkConfig for testing.
 *
 * @param overrides - Optional properties to override in the default NetworkConfig.
 * @returns A mock NetworkConfig object.
 */
function createMockNetworkConfig(
  overrides: Partial<NetworkConfig> = {},
): NetworkConfig {
  return {
    chainId: '0x1',
    name: 'Ethereum Mainnet',
    nativeCurrency: 'ETH',
    rpcEndpoints: [
      {
        url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
        type: 'infura',
        networkClientId: 'mainnet',
        failoverUrls: [],
      },
    ],
    blockExplorerUrls: ['https://etherscan.io'],
    defaultRpcEndpointIndex: 0,
    defaultBlockExplorerUrlIndex: 0,
    isActive: true,
    isTestnet: false,
    isDefault: true,
    isFeatured: true,
    isDeprecated: false,
    priority: 0,
    isDeletable: false,
    ...overrides,
  };
}

const MOCK_CONFIG_ENTRY: NetworkConfigEntry = {
  key: 'test-key',
  value: createMockNetworkConfig({ chainId: '0x1', name: 'Test Network' }),
  metadata: { source: 'test' },
};

const MOCK_FALLBACK_CONFIG: Record<string, NetworkConfigEntry> = {
  'fallback-key': {
    key: 'fallback-key',
    value: createMockNetworkConfig({
      chainId: '0x2',
      name: 'Fallback Network',
    }),
  },
};

/**
 * Builds a mock API service fetch handler.
 *
 * @param overrides - The properties of the API service you want to provide explicitly.
 * @returns A handler function for the fetchConfig action.
 */
function buildMockApiServiceHandler(
  overrides: Partial<AbstractConfigRegistryApiService> = {},
): (options?: { etag?: string }) => Promise<FetchConfigResult> {
  const defaultService: AbstractConfigRegistryApiService = {
    async fetchConfig(): Promise<FetchConfigResult> {
      return {
        data: {
          data: {
            version: '1',
            timestamp: Date.now(),
            networks: [],
          },
        },
        notModified: false,
      };
    },
    onBreak: jest.fn(),
    onDegraded: jest.fn(),
  };

  const service = { ...defaultService, ...overrides };
  return (options?: { etag?: string }) => service.fetchConfig(options);
}

describe('ConfigRegistryController', () => {
  let clock: sinon.SinonFakeTimers;
  let messenger: ConfigRegistryMessenger;
  let rootMessenger: RootMessenger;
  let mockApiServiceHandler: jest.Mock;
  let mockRemoteFeatureFlagGetState: jest.Mock;
  let mockKeyringControllerGetState: jest.Mock;

  beforeEach(() => {
    clock = useFakeTimers();
    const messengers = getConfigRegistryControllerMessenger();
    messenger = messengers.messenger;
    rootMessenger = messengers.rootMessenger;
    mockApiServiceHandler = jest.fn(buildMockApiServiceHandler());

    rootMessenger.registerActionHandler(
      'ConfigRegistryApiService:fetchConfig',
      mockApiServiceHandler,
    );

    mockRemoteFeatureFlagGetState = jest.fn().mockReturnValue({
      remoteFeatureFlags: {
        configRegistryApiEnabled: true,
      },
      cacheTimestamp: Date.now(),
    });

    rootMessenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      mockRemoteFeatureFlagGetState,
    );

    mockKeyringControllerGetState = jest.fn().mockReturnValue({
      isUnlocked: false,
    });

    rootMessenger.registerActionHandler(
      'KeyringController:getState',
      mockKeyringControllerGetState,
    );
  });

  afterEach(() => {
    clock.restore();
    mockApiServiceHandler.mockReset();
  });

  describe('constructor', () => {
    it('should set default state', () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      expect(controller.state).toStrictEqual({
        configs: { networks: {} },
        version: null,
        lastFetched: null,
        fetchError: null,
        etag: null,
      });
    });

    it('should set initial state when provided', () => {
      const initialState: Partial<ConfigRegistryState> = {
        configs: {
          networks: {
            'test-key': MOCK_CONFIG_ENTRY,
          },
        },
        version: 'v1.0.0',
        lastFetched: 1234567890,
      };

      const controller = new ConfigRegistryController({
        messenger,
        state: initialState,
      });

      expect(controller.state.configs.networks).toStrictEqual(
        initialState.configs?.networks,
      );
      expect(controller.state.version).toBe('v1.0.0');
      expect(controller.state.lastFetched).toBe(1234567890);
    });

    it('should set custom polling interval', () => {
      const customInterval = 5000;
      const controller = new ConfigRegistryController({
        messenger,
        pollingInterval: customInterval,
      });

      expect(controller.getIntervalLength()).toBe(customInterval);
    });

    it('should set fallback config', () => {
      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      expect(controller.state.configs).toStrictEqual({ networks: {} });
    });

    it('should work when API service is registered on messenger', () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      expect(controller.state).toStrictEqual({
        configs: { networks: {} },
        version: null,
        lastFetched: null,
        fetchError: null,
        etag: null,
      });
    });
  });

  describe('polling', () => {
    it('should start polling', async () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling(null);

      await advanceTime({ clock, duration: 0 });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      controller.stopPolling();
    });

    it('should poll at specified interval', async () => {
      const pollingInterval = 1000;
      const controller = new ConfigRegistryController({
        messenger,
        pollingInterval,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling(null);

      await advanceTime({ clock, duration: 0 });
      executePollSpy.mockClear();

      await advanceTime({ clock, duration: pollingInterval });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      controller.stopPolling();
    });

    it('should stop polling', async () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling(null);

      await advanceTime({ clock, duration: 0 });
      executePollSpy.mockClear();

      controller.stopPolling();

      await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });

      expect(executePollSpy).not.toHaveBeenCalled();
    });

    it('should use fallback config when no configs exist', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      await expect(controller._executePoll(null)).rejects.toThrow(
        'Network error',
      );

      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe('Network error');
    });

    it('should set fetchError when configs already exist (not use fallback)', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      const existingConfigs = {
        networks: {
          'existing-key': {
            key: 'existing-key',
            value: createMockNetworkConfig({
              chainId: '0x3',
              name: 'Existing Network',
            }),
          },
        },
      };

      mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

      const controller = new ConfigRegistryController({
        messenger,
        state: { configs: existingConfigs },
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      await expect(controller._executePoll(null)).rejects.toThrow(
        'Network error',
      );

      expect(controller.state.configs).toStrictEqual(existingConfigs);
      expect(controller.state.fetchError).toBe('Network error');
    });

    it('should handle errors during polling', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValueOnce({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      await expect(controller._executePoll(null)).rejects.toThrow(
        'Network error',
      );

      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe('Network error');
      expect(mockRemoteFeatureFlagGetState).toHaveBeenCalled();
    });

    it('should handle notModified response and clear fetchError', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      mockApiServiceHandler.mockResolvedValue({
        notModified: true,
        etag: '"test-etag"',
      });

      const controller = new ConfigRegistryController({
        messenger,
        state: {
          fetchError: 'Previous error',
        },
      });

      await controller._executePoll(null);

      expect(controller.state.fetchError).toBeNull();
      expect(controller.state.etag).toBeNull();
    });

    it('should handle non-Error exceptions', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      mockApiServiceHandler.mockRejectedValue('String error'); // Not an Error instance

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      await expect(controller._executePoll(null)).rejects.toBe('String error');

      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe('Unknown error occurred');
    });

    it('should handle error when state.configs is null', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        state: { configs: null as any },
      });

      await expect(controller._executePoll(null)).rejects.toThrow(
        'Network error',
      );

      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe('Network error');
    });

    it('should work via messenger actions', async () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');

      const token = messenger.call(
        'ConfigRegistryController:startPolling',
        null,
      );
      expect(typeof token).toBe('string');

      await advanceTime({ clock, duration: 0 });
      expect(executePollSpy).toHaveBeenCalledTimes(1);

      messenger.call('ConfigRegistryController:stopPolling');
      await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });
      expect(executePollSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('state persistence', () => {
    it('should persist version', () => {
      const controller = new ConfigRegistryController({
        messenger,
        state: { version: 'v1.0.0' },
      });

      expect(controller.state.version).toBe('v1.0.0');
    });

    it('should persist lastFetched', () => {
      const timestamp = Date.now();
      const controller = new ConfigRegistryController({
        messenger,
        state: { lastFetched: timestamp },
      });

      expect(controller.state.lastFetched).toBe(timestamp);
    });

    it('should persist fetchError', () => {
      const controller = new ConfigRegistryController({
        messenger,
        state: { fetchError: 'Test error' },
      });

      expect(controller.state.fetchError).toBe('Test error');
    });

    it('should use default error message when useFallbackConfig is called without errorMessage', () => {
      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller as any).useFallbackConfig();

      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe(
        'Using fallback configuration - API unavailable',
      );
      expect(controller.state.etag).toBeNull();
    });
  });

  describe('startPolling', () => {
    it('should return a polling token string', () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const token = controller.startPolling(null);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      controller.stopPolling();
    });

    it('should return a polling token string when called without input', () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const token = controller.startPolling(null);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      controller.stopPolling();
    });
  });

  describe('feature flag', () => {
    it('should use fallback config when feature flag is disabled', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: false,
        },
        cacheTimestamp: Date.now(),
      });

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling(null);

      await advanceTime({ clock, duration: 0 });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe(
        'Feature flag disabled - using fallback configuration',
      );

      controller.stopPolling();
    });

    it('should use API when feature flag is enabled', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      const mockNetworks = [
        {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [
            {
              url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
              type: 'infura',
              networkClientId: 'mainnet',
              failoverUrls: [],
            },
          ],
          blockExplorerUrls: ['https://etherscan.io'],
          defaultRpcEndpointIndex: 0,
          defaultBlockExplorerUrlIndex: 0,
          isTestnet: false,
          isFeatured: true,
          isActive: true,
          isDefault: false,
          isDeprecated: false,
          priority: 0,
          isDeletable: false,
        },
      ];

      const fetchConfigSpy = jest.fn().mockResolvedValue({
        data: {
          data: {
            version: '1.0.0',
            timestamp: Date.now(),
            networks: mockNetworks,
          },
        },
        notModified: false,
        etag: 'test-etag',
      });

      mockApiServiceHandler.mockImplementation(fetchConfigSpy);

      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollPromise = controller._executePoll(null);
      await executePollPromise;

      expect(fetchConfigSpy).toHaveBeenCalled();
      expect(controller.state.configs.networks?.['0x1']).toBeDefined();
      expect(controller.state.version).toBe('1.0.0');
      expect(controller.state.fetchError).toBeNull();

      controller.stopPolling();
    });

    it('should filter networks to only include featured, active, non-testnet networks', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      const mockNetworks = [
        {
          chainId: '0x1',
          name: 'Ethereum Mainnet',
          nativeCurrency: 'ETH',
          rpcEndpoints: [
            {
              url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
              type: 'infura',
              networkClientId: 'mainnet',
              failoverUrls: [],
            },
          ],
          blockExplorerUrls: ['https://etherscan.io'],
          defaultRpcEndpointIndex: 0,
          defaultBlockExplorerUrlIndex: 0,
          isTestnet: false,
          isFeatured: true,
          isActive: true,
          isDefault: false,
          isDeprecated: false,
          priority: 0,
          isDeletable: false,
        },
        {
          chainId: '0x5',
          name: 'Goerli',
          nativeCurrency: 'ETH',
          rpcEndpoints: [
            {
              url: 'https://goerli.infura.io/v3/{infuraProjectId}',
              type: 'infura',
              networkClientId: 'goerli',
              failoverUrls: [],
            },
          ],
          blockExplorerUrls: ['https://goerli.etherscan.io'],
          defaultRpcEndpointIndex: 0,
          defaultBlockExplorerUrlIndex: 0,
          isTestnet: true,
          isFeatured: true,
          isActive: true,
          isDefault: false,
          isDeprecated: false,
          priority: 0,
          isDeletable: false,
        },
        {
          chainId: '0xa',
          name: 'Optimism',
          nativeCurrency: 'ETH',
          rpcEndpoints: [
            {
              url: 'https://optimism.infura.io/v3/{infuraProjectId}',
              type: 'infura',
              networkClientId: 'optimism',
              failoverUrls: [],
            },
          ],
          blockExplorerUrls: ['https://optimistic.etherscan.io'],
          defaultRpcEndpointIndex: 0,
          defaultBlockExplorerUrlIndex: 0,
          isTestnet: false,
          isFeatured: false,
          isActive: true,
          isDefault: false,
          isDeprecated: false,
          priority: 0,
          isDeletable: false,
        },
        {
          chainId: '0x89',
          name: 'Polygon',
          nativeCurrency: 'MATIC',
          rpcEndpoints: [
            {
              url: 'https://polygon.infura.io/v3/{infuraProjectId}',
              type: 'infura',
              networkClientId: 'polygon',
              failoverUrls: [],
            },
          ],
          blockExplorerUrls: ['https://polygonscan.com'],
          defaultRpcEndpointIndex: 0,
          defaultBlockExplorerUrlIndex: 0,
          isTestnet: false,
          isFeatured: true,
          isActive: false,
          isDefault: false,
          isDeprecated: false,
          priority: 0,
          isDeletable: false,
        },
      ];

      const fetchConfigSpy = jest.fn().mockResolvedValue({
        data: {
          data: {
            version: '1.0.0',
            timestamp: Date.now(),
            networks: mockNetworks,
          },
        },
        notModified: false,
        etag: 'test-etag',
      });

      mockApiServiceHandler.mockImplementation(fetchConfigSpy);

      const controller = new ConfigRegistryController({
        messenger,
      });

      await controller._executePoll(null);

      expect(controller.state.configs.networks?.['0x1']).toBeDefined();
      expect(controller.state.configs.networks?.['0x5']).toBeUndefined();
      expect(controller.state.configs.networks?.['0xa']).toBeUndefined();
      expect(controller.state.configs.networks?.['0x89']).toBeUndefined();
      expect(Object.keys(controller.state.configs.networks ?? {})).toHaveLength(
        1,
      );
    });

    it('should default to fallback when feature flag is not set', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {},
        cacheTimestamp: Date.now(),
      });

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling(null);

      await advanceTime({ clock, duration: 0 });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe(
        'Feature flag disabled - using fallback configuration',
      );

      controller.stopPolling();
    });

    it('should default to fallback when RemoteFeatureFlagController is unavailable', async () => {
      mockRemoteFeatureFlagGetState.mockImplementation(() => {
        throw new Error('RemoteFeatureFlagController not available');
      });

      const controller = new ConfigRegistryController({
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling(null);

      await advanceTime({ clock, duration: 0 });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe(
        'Feature flag disabled - using fallback configuration',
      );

      controller.stopPolling();
    });
  });

  describe('KeyringController event listeners', () => {
    it('should start polling when KeyringController is already unlocked on initialization', async () => {
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
      });

      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');

      await advanceTime({ clock, duration: 0 });

      expect(mockKeyringControllerGetState).toHaveBeenCalled();
      // Verify polling started by checking if _executePoll was called
      expect(executePollSpy).toHaveBeenCalledTimes(1);

      controller.stopPolling();
    });

    it('should handle KeyringController:getState error gracefully when KeyringController is unavailable', () => {
      mockKeyringControllerGetState.mockImplementation(() => {
        throw new Error('KeyringController not available');
      });

      const controller = new ConfigRegistryController({
        messenger,
      });

      // Should not have started polling
      expect(controller.state.lastFetched).toBeNull();
    });

    it('should start polling when KeyringController:unlock event is published', async () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      const startPollingSpy = jest.spyOn(controller, 'startPolling');

      // Initially locked, so polling should not have started
      expect(startPollingSpy).not.toHaveBeenCalled();

      // Publish unlock event on root messenger
      rootMessenger.publish('KeyringController:unlock');

      await advanceTime({ clock, duration: 0 });

      expect(startPollingSpy).toHaveBeenCalledWith(null);
      expect(executePollSpy).toHaveBeenCalledTimes(1);

      controller.stopPolling();
    });

    it('should stop polling when KeyringController:lock event is published', async () => {
      mockKeyringControllerGetState.mockReturnValue({
        isUnlocked: true,
      });

      const controller = new ConfigRegistryController({
        messenger,
      });

      const stopPollingSpy = jest.spyOn(controller, 'stopPolling');

      // Polling should have started
      await advanceTime({ clock, duration: 0 });
      expect(stopPollingSpy).not.toHaveBeenCalled();

      // Publish lock event on root messenger
      rootMessenger.publish('KeyringController:lock');

      expect(stopPollingSpy).toHaveBeenCalled();
    });

    it('should call startPolling with default parameter when called without arguments', async () => {
      const controller = new ConfigRegistryController({
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');

      // Call startPolling without arguments to test default parameter
      controller.startPolling();

      // Verify polling started by checking if _executePoll is called
      await advanceTime({ clock, duration: 0 });
      expect(executePollSpy).toHaveBeenCalledTimes(1);

      controller.stopPolling();
    });
  });
});
