import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
} from '@metamask/messenger';
import { useFakeTimers } from 'sinon';

import type { AbstractConfigRegistryApiService } from './config-registry-api-service';
import {
  ConfigRegistryController,
  DEFAULT_POLLING_INTERVAL,
} from './ConfigRegistryController';
import type {
  ConfigRegistryMessenger,
  ConfigRegistryState,
  RegistryConfigEntry,
} from './ConfigRegistryController';
import { advanceTime } from '../../../tests/helpers';

const namespace = 'ConfigRegistryController' as const;

type RootMessenger = Messenger<
  MockAnyNamespace,
  { type: 'RemoteFeatureFlagController:getState'; handler: () => unknown },
  never
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
    { type: 'RemoteFeatureFlagController:getState'; handler: () => unknown },
    never
  >({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const configRegistryControllerMessenger = new Messenger<
    typeof namespace,
    never,
    never,
    typeof rootMessenger
  >({
    namespace,
    parent: rootMessenger,
  }) as ConfigRegistryMessenger;

  rootMessenger.delegate({
    messenger: configRegistryControllerMessenger,
    actions: ['RemoteFeatureFlagController:getState'] as never[],
  });

  return { messenger: configRegistryControllerMessenger, rootMessenger };
}

const MOCK_CONFIG_ENTRY: RegistryConfigEntry = {
  key: 'test-key',
  value: { test: 'value' },
  metadata: { source: 'test' },
};

const MOCK_FALLBACK_CONFIG: Record<string, RegistryConfigEntry> = {
  'fallback-key': {
    key: 'fallback-key',
    value: { fallback: true },
  },
};

/**
 * Builds a mock API service.
 *
 * @param overrides - The properties of the API service you want to provide explicitly.
 * @returns The built mock API service.
 */
function buildMockApiService(
  overrides: Partial<AbstractConfigRegistryApiService> = {},
): AbstractConfigRegistryApiService {
  return {
    async fetchConfig() {
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
    ...overrides,
  };
}

describe('ConfigRegistryController', () => {
  let clock: sinon.SinonFakeTimers;
  let messenger: ConfigRegistryMessenger;
  let rootMessenger: RootMessenger;
  let apiService: AbstractConfigRegistryApiService;
  let mockRemoteFeatureFlagGetState: jest.Mock;

  beforeEach(() => {
    clock = useFakeTimers();
    const messengers = getConfigRegistryControllerMessenger();
    messenger = messengers.messenger;
    rootMessenger = messengers.rootMessenger;
    apiService = buildMockApiService();

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
  });

  afterEach(() => {
    clock.restore();
  });

  describe('constructor', () => {
    it('should set default state', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
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
        apiService,
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
        apiService,
        messenger,
        pollingInterval: customInterval,
      });

      expect(controller.getIntervalLength()).toBe(customInterval);
    });

    it('should set fallback config', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      // Fallback config is private, but we can verify it's used when needed
      expect(controller.state.configs).toStrictEqual({ networks: {} });
    });
  });

  describe('getConfig', () => {
    it('should return undefined for non-existent key', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      expect(controller.getConfig('non-existent')).toBeUndefined();
    });

    it('should return config entry for existing key', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        state: {
          configs: {
            networks: {
              'test-key': MOCK_CONFIG_ENTRY,
            },
          },
        },
      });

      expect(controller.getConfig('test-key')).toStrictEqual(MOCK_CONFIG_ENTRY);
    });

    it('should work via messenger action', () => {
      const testController = new ConfigRegistryController({
        apiService,
        messenger,
        state: {
          configs: {
            networks: {
              'test-key': MOCK_CONFIG_ENTRY,
            },
          },
        },
      });

      const result = messenger.call(
        'ConfigRegistryController:getConfig',
        'test-key',
      );
      expect(result).toStrictEqual(MOCK_CONFIG_ENTRY);
      expect(testController.getConfig('test-key')).toStrictEqual(
        MOCK_CONFIG_ENTRY,
      );
    });
  });

  describe('getAllConfigs', () => {
    it('should return empty object when no configs', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      expect(controller.getAllConfigs()).toStrictEqual({});
    });

    it('should return all configs', () => {
      const configs = {
        key1: { key: 'key1', value: 'value1' },
        key2: { key: 'key2', value: 'value2' },
      };

      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        state: { configs: { networks: configs } },
      });

      expect(controller.getAllConfigs()).toStrictEqual(configs);
    });

    it('should return a copy, not a reference', () => {
      const configs = {
        key1: { key: 'key1', value: 'value1' },
      };

      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        state: { configs: { networks: configs } },
      });

      const result = controller.getAllConfigs();
      result.key1 = { key: 'key1', value: 'modified' };

      // Original should not be modified
      expect(controller.state.configs.networks?.key1?.value).toBe('value1');
    });

    it('should work via messenger action', () => {
      const configs = {
        key1: { key: 'key1', value: 'value1' },
      };

      const testController = new ConfigRegistryController({
        messenger,
        apiService,
        state: { configs: { networks: configs } },
      });

      const result = messenger.call('ConfigRegistryController:getAllConfigs');
      expect(result).toStrictEqual(configs);
      expect(testController.getAllConfigs()).toStrictEqual(configs);
    });
  });

  describe('getConfigValue', () => {
    it('should return undefined for non-existent key', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      expect(controller.getConfigValue('non-existent')).toBeUndefined();
    });

    it('should return value for existing key', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        state: {
          configs: {
            networks: {
              'test-key': MOCK_CONFIG_ENTRY,
            },
          },
        },
      });

      expect(controller.getConfigValue('test-key')).toStrictEqual({
        test: 'value',
      });
    });

    it('should return typed value', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        state: {
          configs: {
            networks: {
              'string-key': { key: 'string-key', value: 'string-value' },
              'number-key': { key: 'number-key', value: 42 },
            },
          },
        },
      });

      expect(controller.getConfigValue<string>('string-key')).toBe(
        'string-value',
      );
      expect(controller.getConfigValue<number>('number-key')).toBe(42);
    });
  });

  describe('setConfig', () => {
    it('should set a new config entry', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
      });

      controller.setConfig('new-key', { data: 'value' });

      expect(controller.state.configs.networks?.['new-key']).toStrictEqual({
        key: 'new-key',
        value: { data: 'value' },
        metadata: undefined,
      });
    });

    it('should set config with metadata', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      controller.setConfig('new-key', { data: 'value' }, { source: 'test' });

      expect(controller.state.configs.networks?.['new-key']).toStrictEqual({
        key: 'new-key',
        value: { data: 'value' },
        metadata: { source: 'test' },
      });
    });

    it('should update existing config', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
        state: {
          configs: {
            networks: {
              'existing-key': { key: 'existing-key', value: 'old-value' },
            },
          },
        },
      });

      controller.setConfig('existing-key', 'new-value');

      expect(controller.state.configs.networks?.['existing-key']?.value).toBe(
        'new-value',
      );
    });

    it('should work via messenger action', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
      });

      messenger.call(
        'ConfigRegistryController:setConfig',
        'test-key',
        'test-value',
      );

      expect(controller.getConfig('test-key')?.value).toBe('test-value');
    });
  });

  describe('removeConfig', () => {
    it('should remove existing config', () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        state: {
          configs: {
            networks: {
              key1: { key: 'key1', value: 'value1' },
              key2: { key: 'key2', value: 'value2' },
            },
          },
        },
      });

      controller.removeConfig('key1');

      expect(controller.state.configs.networks?.key1).toBeUndefined();
      expect(controller.state.configs.networks?.key2).toBeDefined();
    });

    it('should not throw when removing non-existent key', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
      });

      expect(() => controller.removeConfig('non-existent')).not.toThrow();
    });
  });

  describe('clearConfigs', () => {
    it('should clear all configs', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
        state: {
          configs: {
            networks: {
              key1: { key: 'key1', value: 'value1' },
              key2: { key: 'key2', value: 'value2' },
            },
          },
        },
      });

      controller.clearConfigs();

      expect(controller.state.configs).toStrictEqual({ networks: {} });
    });
  });

  describe('polling', () => {
    it('should start polling', async () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling({});

      await advanceTime({ clock, duration: 0 });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      controller.stopPolling();
    });

    it('should poll at specified interval', async () => {
      const pollingInterval = 1000;
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
        pollingInterval,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling({});

      await advanceTime({ clock, duration: 0 });
      executePollSpy.mockClear();

      await advanceTime({ clock, duration: pollingInterval });

      expect(executePollSpy).toHaveBeenCalledTimes(1);
      controller.stopPolling();
    });

    it('should stop polling', async () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling({});

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

      const errorApiService = buildMockApiService({
        fetchConfig: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      const controller = new ConfigRegistryController({
        apiService: errorApiService,
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      await controller._executePoll({});

      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe('Network error');
    });

    it('should not use fallback when configs already exist', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {
          configRegistryApiEnabled: true,
        },
        cacheTimestamp: Date.now(),
      });

      const existingConfigs = {
        networks: {
          'existing-key': { key: 'existing-key', value: 'existing-value' },
        },
      };

      const errorApiService = buildMockApiService({
        fetchConfig: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      const controller = new ConfigRegistryController({
        apiService: errorApiService,
        messenger,
        state: { configs: existingConfigs },
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      await controller._executePoll({});

      // Should keep existing configs, not use fallback
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

      const errorApiService = buildMockApiService({
        fetchConfig: jest.fn().mockRejectedValue(new Error('Network error')),
      });

      const controller = new ConfigRegistryController({
        apiService: errorApiService,
        messenger,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      // Call _executePoll directly to test error handling
      await controller._executePoll({});

      // Since we have no configs, it should use fallback
      expect(controller.state.configs).toStrictEqual({
        networks: MOCK_FALLBACK_CONFIG,
      });
      expect(controller.state.fetchError).toBe('Network error');
      expect(mockRemoteFeatureFlagGetState).toHaveBeenCalled();
    });

    it('should work via messenger actions', async () => {
      const controller = new ConfigRegistryController({
        apiService,
        messenger,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');

      const token = messenger.call('ConfigRegistryController:startPolling', {});
      expect(typeof token).toBe('string');

      await advanceTime({ clock, duration: 0 });
      expect(executePollSpy).toHaveBeenCalledTimes(1);

      messenger.call('ConfigRegistryController:stopPolling');
      await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });
      expect(executePollSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('state persistence', () => {
    it('should persist configs', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
      });

      controller.setConfig('persist-key', 'persist-value');

      // Verify state is updated
      expect(controller.state.configs.networks?.['persist-key']).toBeDefined();
    });

    it('should persist version', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
        state: { version: 'v1.0.0' },
      });

      expect(controller.state.version).toBe('v1.0.0');
    });

    it('should persist lastFetched', () => {
      const timestamp = Date.now();
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
        state: { lastFetched: timestamp },
      });

      expect(controller.state.lastFetched).toBe(timestamp);
    });

    it('should persist fetchError', () => {
      const controller = new ConfigRegistryController({
        messenger,
        apiService,
        state: { fetchError: 'Test error' },
      });

      expect(controller.state.fetchError).toBe('Test error');
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
        apiService,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling({});

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

      const mockApiService = buildMockApiService({
        fetchConfig: fetchConfigSpy,
      });

      const controller = new ConfigRegistryController({
        messenger,
        apiService: mockApiService,
      });

      const executePollPromise = controller._executePoll({});
      await executePollPromise;

      expect(fetchConfigSpy).toHaveBeenCalled();
      expect(controller.state.configs.networks?.['0x1']).toBeDefined();
      expect(controller.state.version).toBe('1.0.0');
      expect(controller.state.fetchError).toBeNull();

      controller.stopPolling();
    });

    it('should default to fallback when feature flag is not set', async () => {
      mockRemoteFeatureFlagGetState.mockReturnValue({
        remoteFeatureFlags: {},
        cacheTimestamp: Date.now(),
      });

      const controller = new ConfigRegistryController({
        messenger,
        apiService,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling({});

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
        apiService,
        fallbackConfig: MOCK_FALLBACK_CONFIG,
      });

      const executePollSpy = jest.spyOn(controller, '_executePoll');
      controller.startPolling({});

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
});
