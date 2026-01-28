import type { MockAnyNamespace } from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import { useFakeTimers } from 'sinon';

import type {
  FetchConfigResult,
  RegistryNetworkConfig,
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
 * Creates a mock RegistryNetworkConfig for testing.
 *
 * @param overrides - Optional properties to override in the default RegistryNetworkConfig.
 * @returns A mock RegistryNetworkConfig object.
 */
function createMockNetworkConfig(
  overrides: Partial<RegistryNetworkConfig> = {},
): RegistryNetworkConfig {
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
 * @param overrides - Optional overrides object containing fetchConfig implementation.
 * @param overrides.fetchConfig - Optional fetchConfig function override.
 * @returns A handler function for the fetchConfig action.
 */
function buildMockApiServiceHandler(overrides?: {
  fetchConfig?: (options?: { etag?: string }) => Promise<FetchConfigResult>;
}): (options?: { etag?: string }) => Promise<FetchConfigResult> {
  const defaultFetchConfig = async (): Promise<FetchConfigResult> => {
    return {
      data: {
        data: {
          version: '1',
          timestamp: Date.now(),
          networks: [],
        },
      },
      modified: true,
    };
  };

  return overrides?.fetchConfig ?? defaultFetchConfig;
}

type WithControllerCallback<ReturnValue> = (args: {
  controller: ConfigRegistryController;
  clock: sinon.SinonFakeTimers;
  rootMessenger: RootMessenger;
  messenger: ConfigRegistryMessenger;
  mockApiServiceHandler: jest.Mock;
  mockRemoteFeatureFlagGetState: jest.Mock;
  mockKeyringControllerGetState: jest.Mock;
}) => Promise<ReturnValue> | ReturnValue;

type WithControllerOptions = {
  options?: Partial<ConstructorParameters<typeof ConfigRegistryController>[0]>;
};

async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];

  const clock = useFakeTimers();
  const { messenger, rootMessenger } = getConfigRegistryControllerMessenger();
  const mockApiServiceHandler = jest.fn(buildMockApiServiceHandler());

  rootMessenger.registerActionHandler(
    'ConfigRegistryApiService:fetchConfig',
    mockApiServiceHandler,
  );

  const mockRemoteFeatureFlagGetState = jest.fn().mockReturnValue({
    remoteFeatureFlags: {
      configRegistryApiEnabled: true,
    },
    cacheTimestamp: Date.now(),
  });

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    mockRemoteFeatureFlagGetState,
  );

  const mockKeyringControllerGetState = jest.fn().mockReturnValue({
    isUnlocked: false,
  });

  rootMessenger.registerActionHandler(
    'KeyringController:getState',
    mockKeyringControllerGetState,
  );

  const controller = new ConfigRegistryController({
    messenger,
    ...options,
  });

  // Initialize the controller after creation
  controller.init();

  try {
    return await testFunction({
      controller,
      clock,
      rootMessenger,
      messenger,
      mockApiServiceHandler,
      mockRemoteFeatureFlagGetState,
      mockKeyringControllerGetState,
    });
  } finally {
    controller.stopPolling();
    controller.destroy();
    clock.restore();
    mockApiServiceHandler.mockReset();
  }
}

describe('ConfigRegistryController', () => {
  describe('constructor', () => {
    it('sets default state', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          configs: { networks: {} },
          version: null,
          lastFetched: null,
          fetchError: null,
          etag: null,
        });
      });
    });

    it('sets initial state when provided', async () => {
      const initialState: Partial<ConfigRegistryState> = {
        configs: {
          networks: {
            'test-key': MOCK_CONFIG_ENTRY,
          },
        },
        version: 'v1.0.0',
        lastFetched: 1234567890,
      };

      await withController(
        { options: { state: initialState } },
        ({ controller }) => {
          expect(controller.state.configs.networks).toStrictEqual(
            initialState.configs?.networks,
          );
          expect(controller.state.version).toBe('v1.0.0');
          expect(controller.state.lastFetched).toBe(1234567890);
        },
      );
    });

    it('sets custom polling interval', async () => {
      const customInterval = 5000;
      await withController(
        { options: { pollingInterval: customInterval } },
        ({ controller }) => {
          expect(controller.getIntervalLength()).toBe(customInterval);
        },
      );
    });

    it('sets fallback config', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        ({ controller }) => {
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
        },
      );
    });

    it('works when API service is registered on messenger', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toStrictEqual({
          configs: { networks: {} },
          version: null,
          lastFetched: null,
          fetchError: null,
          etag: null,
        });
      });
    });
  });

  describe('polling', () => {
    it('starts polling', async () => {
      await withController(async ({ controller, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');
        controller.startPolling(null);

        await advanceTime({ clock, duration: 0 });

        expect(executePollSpy).toHaveBeenCalledTimes(1);
        controller.stopPolling();
      });
    });

    it('polls at specified interval', async () => {
      const pollingInterval = 1000;
      await withController(
        { options: { pollingInterval } },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await advanceTime({ clock, duration: 0 });
          executePollSpy.mockClear();

          await advanceTime({ clock, duration: pollingInterval });

          expect(executePollSpy).toHaveBeenCalledTimes(1);
          controller.stopPolling();
        },
      );
    });

    it('stops polling', async () => {
      await withController(async ({ controller, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');
        controller.startPolling(null);

        await advanceTime({ clock, duration: 0 });
        executePollSpy.mockClear();

        controller.stopPolling();

        await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });

        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('uses fallback config when no configs exist', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
            fallbackConfig: MOCK_FALLBACK_CONFIG,
          });

          await testController._executePoll(null);

          expect(captureExceptionSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(testController.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
          expect(testController.state.fetchError).toBe('Network error');
        },
      );
    });

    it('sets fetchError when configs already exist (not use fallback)', async () => {
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

      await withController(
        {
          options: {
            state: { configs: existingConfigs },
            fallbackConfig: MOCK_FALLBACK_CONFIG,
          },
        },
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
            state: { configs: existingConfigs },
            fallbackConfig: MOCK_FALLBACK_CONFIG,
          });

          await testController._executePoll(null);

          expect(captureExceptionSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(testController.state.configs).toStrictEqual(existingConfigs);
          expect(testController.state.fetchError).toBe('Network error');
        },
      );
    });

    it('handles errors during polling', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValueOnce({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
            fallbackConfig: MOCK_FALLBACK_CONFIG,
          });

          await testController._executePoll(null);

          expect(captureExceptionSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(testController.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
          expect(testController.state.fetchError).toBe('Network error');
          expect(mockRemoteFeatureFlagGetState).toHaveBeenCalled();
        },
      );
    });

    it('handles unmodified response and clears fetchError', async () => {
      await withController(
        {
          options: {
            state: {
              fetchError: 'Previous error',
            },
          },
        },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockResolvedValue({
            modified: false,
            etag: '"test-etag"',
          });

          const beforeTimestamp = Date.now();
          await controller._executePoll(null);
          const afterTimestamp = Date.now();

          expect(controller.state.fetchError).toBeNull();
          expect(controller.state.etag).toBe('"test-etag"');
          expect(controller.state.lastFetched).not.toBeNull();
          expect(controller.state.lastFetched).toBeGreaterThanOrEqual(
            beforeTimestamp,
          );
          expect(controller.state.lastFetched).toBeLessThanOrEqual(
            afterTimestamp,
          );
        },
      );
    });

    it('handles unmodified response and preserves existing etag when not provided', async () => {
      await withController(
        {
          options: {
            state: {
              fetchError: 'Previous error',
              etag: '"existing-etag"',
            },
          },
        },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockResolvedValue({
            modified: false,
          });

          const beforeTimestamp = Date.now();
          await controller._executePoll(null);
          const afterTimestamp = Date.now();

          expect(controller.state.fetchError).toBeNull();
          expect(controller.state.etag).toBe('"existing-etag"');
          expect(controller.state.lastFetched).not.toBeNull();
          expect(controller.state.lastFetched).toBeGreaterThanOrEqual(
            beforeTimestamp,
          );
          expect(controller.state.lastFetched).toBeLessThanOrEqual(
            afterTimestamp,
          );
        },
      );
    });

    it('handles unmodified response and sets etag to null when explicitly null', async () => {
      await withController(
        {
          options: {
            state: {
              fetchError: 'Previous error',
              etag: '"existing-etag"',
            },
          },
        },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockResolvedValue({
            modified: false,
            etag: null,
          });

          const beforeTimestamp = Date.now();
          await controller._executePoll(null);
          const afterTimestamp = Date.now();

          expect(controller.state.fetchError).toBeNull();
          expect(controller.state.etag).toBeNull();
          expect(controller.state.lastFetched).not.toBeNull();
          expect(controller.state.lastFetched).toBeGreaterThanOrEqual(
            beforeTimestamp,
          );
          expect(controller.state.lastFetched).toBeLessThanOrEqual(
            afterTimestamp,
          );
        },
      );
    });

    it('handles validation error from service', async () => {
      await withController(
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const validationError = new Error(
            'Validation error from superstruct',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );

          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
          });

          await testController._executePoll(null);

          expect(captureExceptionSpy).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error from superstruct',
            }),
          );
          expect(testController.state.fetchError).toBe(
            'Validation error from superstruct',
          );
        },
      );
    });

    it('handles validation error when result.data.data is missing', async () => {
      await withController(
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const validationError = new Error(
            'Validation error: data.data is missing',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          await controller._executePoll(null);

          expect(controller.state.fetchError).toBe(
            'Validation error: data.data is missing',
          );
        },
      );
    });

    it('handles validation error when result.data.data.networks is not an array', async () => {
      await withController(
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const validationError = new Error(
            'Validation error: data.data.networks is not an array',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          await controller._executePoll(null);

          expect(controller.state.fetchError).toBe(
            'Validation error: data.data.networks is not an array',
          );
        },
      );
    });

    it('handles validation error when result.data.data.version is not a string', async () => {
      await withController(
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const validationError = new Error(
            'Validation error: data.data.version is not a string',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          await controller._executePoll(null);

          expect(controller.state.fetchError).toBe(
            'Validation error: data.data.version is not a string',
          );
        },
      );
    });

    it('skips fetch when lastFetched is within polling interval', async () => {
      const recentTimestamp = Date.now() - 1000;
      await withController(
        {
          options: {
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, messenger, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const fetchConfigSpy = jest.spyOn(
            messenger,
            'call',
          ) as jest.SpyInstance;

          await controller._executePoll(null);

          expect(fetchConfigSpy).not.toHaveBeenCalledWith(
            'ConfigRegistryApiService:fetchConfig',
            expect.anything(),
          );
        },
      );
    });

    it('proceeds with fetch when lastFetched is null', async () => {
      await withController(
        {
          options: {
            state: {
              lastFetched: null,
            },
          },
        },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                networks: [
                  createMockNetworkConfig({
                    chainId: '0x1',
                    name: 'Ethereum Mainnet',
                  }),
                ],
                version: '1.0.0',
              },
            },
            etag: '"test-etag"',
            modified: true,
          });

          await controller._executePoll(null);

          expect(mockApiServiceHandler).toHaveBeenCalled();
          expect(controller.state.lastFetched).not.toBeNull();
        },
      );
    });

    it('proceeds with fetch when enough time has passed since lastFetched', async () => {
      const now = Date.now();
      const oldTimestamp = now - DEFAULT_POLLING_INTERVAL - 1000;
      await withController(
        {
          options: {
            state: {
              lastFetched: oldTimestamp,
            },
          },
        },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);

          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: now,
          });

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                networks: [
                  createMockNetworkConfig({
                    chainId: '0x1',
                    name: 'Ethereum Mainnet',
                  }),
                ],
                version: '1.0.0',
              },
            },
            etag: '"test-etag"',
            modified: true,
          });

          await controller._executePoll(null);

          expect(mockApiServiceHandler).toHaveBeenCalled();
          expect(controller.state.lastFetched).not.toBe(oldTimestamp);

          jest.restoreAllMocks();
        },
      );
    });

    it('uses custom polling interval when checking lastFetched', async () => {
      const customInterval = 5000;
      const recentTimestamp = Date.now() - 3000;
      await withController(
        {
          options: {
            pollingInterval: customInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, messenger, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const fetchConfigSpy = jest.spyOn(
            messenger,
            'call',
          ) as jest.SpyInstance;

          await controller._executePoll(null);

          expect(fetchConfigSpy).not.toHaveBeenCalledWith(
            'ConfigRegistryApiService:fetchConfig',
            expect.anything(),
          );
        },
      );
    });

    it('uses DEFAULT_POLLING_INTERVAL when getIntervalLength returns undefined', async () => {
      const recentTimestamp = Date.now() - 1000;
      await withController(
        {
          options: {
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, messenger, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          jest
            .spyOn(controller, 'getIntervalLength')
            .mockReturnValue(undefined);

          const fetchConfigSpy = jest.spyOn(
            messenger,
            'call',
          ) as jest.SpyInstance;

          await controller._executePoll(null);

          expect(fetchConfigSpy).not.toHaveBeenCalledWith(
            'ConfigRegistryApiService:fetchConfig',
            expect.anything(),
          );
        },
      );
    });

    it('handles non-Error exceptions', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue('String error');

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
            fallbackConfig: MOCK_FALLBACK_CONFIG,
          });

          await testController._executePoll(null);

          expect(captureExceptionSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'String error' }),
          );
          expect(testController.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
          expect(testController.state.fetchError).toBe(
            'Unknown error occurred',
          );
        },
      );
    });

    it('handles error when state.configs is null', async () => {
      await withController(
        {
          options: {
            fallbackConfig: MOCK_FALLBACK_CONFIG,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            state: { configs: null as any },
          },
        },
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
            fallbackConfig: MOCK_FALLBACK_CONFIG,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            state: { configs: null as any },
          });

          await testController._executePoll(null);

          expect(captureExceptionSpy).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(testController.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
          expect(testController.state.fetchError).toBe('Network error');
        },
      );
    });

    it('works via messenger actions', async () => {
      await withController(async ({ controller, messenger, clock }) => {
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
  });

  describe('state persistence', () => {
    it('persists version', async () => {
      await withController(
        { options: { state: { version: 'v1.0.0' } } },
        ({ controller }) => {
          expect(controller.state.version).toBe('v1.0.0');
        },
      );
    });

    it('persists lastFetched', async () => {
      const timestamp = Date.now();
      await withController(
        { options: { state: { lastFetched: timestamp } } },
        ({ controller }) => {
          expect(controller.state.lastFetched).toBe(timestamp);
        },
      );
    });

    it('persists fetchError', async () => {
      await withController(
        { options: { state: { fetchError: 'Test error' } } },
        ({ controller }) => {
          expect(controller.state.fetchError).toBe('Test error');
        },
      );
    });
  });

  describe('startPolling', () => {
    it('returns a polling token string', async () => {
      await withController(({ controller }) => {
        const token = controller.startPolling(null);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        controller.stopPolling();
      });
    });

    it('returns a polling token string when called without input', async () => {
      await withController(({ controller }) => {
        const token = controller.startPolling(null);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        controller.stopPolling();
      });
    });

    it('delays first poll when lastFetched is recent', async () => {
      const pollingInterval = 10000;
      const recentTimestamp = Date.now() - 2000;
      const remainingTime = pollingInterval - 2000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          await advanceTime({ clock, duration: remainingTime + 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopPolling();
        },
      );
    });

    it('proceeds immediately when lastFetched is null', async () => {
      await withController(
        {
          options: {
            state: {
              lastFetched: null,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopPolling();
        },
      );
    });

    it('proceeds immediately when lastFetched is old enough', async () => {
      const pollingInterval = 10000;
      const now = Date.now();
      const oldTimestamp = now - pollingInterval - 1000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: oldTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await advanceTime({ clock, duration: 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopPolling();
          jest.restoreAllMocks();
        },
      );
    });

    it('proceeds immediately when lastFetched is exactly at polling interval', async () => {
      const pollingInterval = 10000;
      const now = Date.now();
      const exactTimestamp = now - pollingInterval - 1;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: exactTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await advanceTime({ clock, duration: 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopPolling();
          jest.restoreAllMocks();
        },
      );
    });

    it('uses DEFAULT_POLLING_INTERVAL when getIntervalLength returns undefined', async () => {
      const recentTimestamp = Date.now() - 1000;
      await withController(
        {
          options: {
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          jest
            .spyOn(controller, 'getIntervalLength')
            .mockReturnValue(undefined);

          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          controller.stopPolling();
        },
      );
    });

    it('clears existing timeout when startPolling is called multiple times', async () => {
      const pollingInterval = 10000;
      const recentTimestamp = Date.now() - 2000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

          // First call sets a timeout
          controller.startPolling(null);
          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          const clearTimeoutCallCountBefore = clearTimeoutSpy.mock.calls.length;

          // Second call should clear the existing timeout (from first call) and set a new one
          // This tests the defensive check that clears any existing timeout
          controller.startPolling(null);
          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          // Verify clearTimeout was called to clear the previous timeout
          expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(
            clearTimeoutCallCountBefore,
          );

          controller.stopPolling();
        },
      );
    });
  });

  describe('feature flag', () => {
    it('uses fallback config when feature flag is disabled', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ controller, clock, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: false,
            },
            cacheTimestamp: Date.now(),
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
        },
      );
    });

    it('uses API when feature flag is enabled', async () => {
      await withController(
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
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
            modified: true,
            etag: 'test-etag',
          });

          mockApiServiceHandler.mockImplementation(fetchConfigSpy);

          await controller._executePoll(null);

          expect(fetchConfigSpy).toHaveBeenCalled();
          expect(controller.state.configs.networks['0x1']).toBeDefined();
          expect(controller.state.version).toBe('1.0.0');
          expect(controller.state.fetchError).toBeNull();
        },
      );
    });

    it('filters networks to only include featured, active, non-testnet networks', async () => {
      await withController(
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
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
            modified: true,
            etag: 'test-etag',
          });

          mockApiServiceHandler.mockImplementation(fetchConfigSpy);

          await controller._executePoll(null);

          expect(controller.state.configs.networks['0x1']).toBeDefined();
          expect(controller.state.configs.networks['0x5']).toBeUndefined();
          expect(controller.state.configs.networks['0xa']).toBeUndefined();
          expect(controller.state.configs.networks['0x89']).toBeUndefined();
          expect(Object.keys(controller.state.configs.networks)).toHaveLength(
            1,
          );
        },
      );
    });

    it('handles duplicate chainIds by keeping highest priority network and logging warning', async () => {
      await withController(
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
          });

          // Mock API response with duplicate chainIds
          const mockNetworks = [
            {
              chainId: '0x1',
              name: 'Ethereum Mainnet (Low Priority)',
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
              priority: 10, // Lower priority (higher number)
              isDeletable: false,
            },
            {
              chainId: '0x1',
              name: 'Ethereum Mainnet (High Priority)',
              nativeCurrency: 'ETH',
              rpcEndpoints: [
                {
                  url: 'https://mainnet.alchemy.io/v2/{alchemyApiKey}',
                  type: 'alchemy',
                  networkClientId: 'mainnet-alchemy',
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
              priority: 0, // Higher priority (lower number)
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
              isActive: true,
              isDefault: false,
              isDeprecated: false,
              priority: 0,
              isDeletable: false,
            },
          ];

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: mockNetworks,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          await testController._executePoll(null);

          // Verify warning was logged
          expect(captureExceptionSpy).toHaveBeenCalled();
          const warningCall = captureExceptionSpy.mock.calls.find((call) =>
            call[0]?.message?.includes('Duplicate chainId 0x1'),
          );
          expect(warningCall).toBeDefined();
          expect(warningCall?.[0]?.message).toContain(
            'Ethereum Mainnet (Low Priority), Ethereum Mainnet (High Priority)',
          );

          // Verify highest priority network was kept
          expect(testController.state.configs.networks['0x1']).toBeDefined();
          expect(testController.state.configs.networks['0x1']?.value.name).toBe(
            'Ethereum Mainnet (High Priority)',
          );
          expect(
            testController.state.configs.networks['0x1']?.value.rpcEndpoints[0]
              .type,
          ).toBe('alchemy');

          // Verify other networks are still present
          expect(testController.state.configs.networks['0x89']).toBeDefined();
        },
      );
    });

    it('handles duplicate chainIds with same priority by keeping first occurrence', async () => {
      await withController(
        async ({ mockRemoteFeatureFlagGetState, mockApiServiceHandler }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          const captureExceptionSpy = jest.fn();
          const testRootMessenger = new Messenger<
            MockAnyNamespace,
            | {
                type: 'RemoteFeatureFlagController:getState';
                handler: () => unknown;
              }
            | {
                type: 'KeyringController:getState';
                handler: () => { isUnlocked: boolean };
              }
            | {
                type: 'ConfigRegistryApiService:fetchConfig';
                handler: (options?: {
                  etag?: string;
                }) => Promise<FetchConfigResult>;
              },
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] }
          >({
            namespace: MOCK_ANY_NAMESPACE,
            captureException: captureExceptionSpy,
          });

          const testMessenger = new Messenger<
            typeof namespace,
            never,
            | { type: 'KeyringController:unlock'; payload: [] }
            | { type: 'KeyringController:lock'; payload: [] },
            typeof testRootMessenger
          >({
            namespace,
            parent: testRootMessenger,
          }) as ConfigRegistryMessenger;

          testRootMessenger.registerActionHandler(
            'ConfigRegistryApiService:fetchConfig',
            mockApiServiceHandler,
          );
          testRootMessenger.registerActionHandler(
            'RemoteFeatureFlagController:getState',
            mockRemoteFeatureFlagGetState,
          );
          testRootMessenger.registerActionHandler(
            'KeyringController:getState',
            jest.fn().mockReturnValue({ isUnlocked: false }),
          );
          testRootMessenger.delegate({
            messenger: testMessenger,
            actions: [
              'RemoteFeatureFlagController:getState',
              'KeyringController:getState',
              'ConfigRegistryApiService:fetchConfig',
            ] as never[],
            events: [
              'KeyringController:unlock',
              'KeyringController:lock',
            ] as never[],
          });

          const testController = new ConfigRegistryController({
            messenger: testMessenger,
          });

          // Mock API response with duplicate chainIds having same priority
          const mockNetworks = [
            {
              chainId: '0x1',
              name: 'Ethereum Mainnet (First)',
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
              priority: 5, // Same priority
              isDeletable: false,
            },
            {
              chainId: '0x1',
              name: 'Ethereum Mainnet (Second)',
              nativeCurrency: 'ETH',
              rpcEndpoints: [
                {
                  url: 'https://mainnet.alchemy.io/v2/{alchemyApiKey}',
                  type: 'alchemy',
                  networkClientId: 'mainnet-alchemy',
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
              priority: 5, // Same priority
              isDeletable: false,
            },
          ];

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: mockNetworks,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          await testController._executePoll(null);

          // Verify warning was logged
          expect(captureExceptionSpy).toHaveBeenCalled();
          const warningCall = captureExceptionSpy.mock.calls.find((call) =>
            call[0]?.message?.includes('Duplicate chainId 0x1'),
          );
          expect(warningCall).toBeDefined();

          // Verify first occurrence was kept (since priorities are equal)
          expect(testController.state.configs.networks['0x1']).toBeDefined();
          expect(testController.state.configs.networks['0x1']?.value.name).toBe(
            'Ethereum Mainnet (First)',
          );
        },
      );
    });

    it('uses custom isConfigRegistryApiEnabled function when provided', async () => {
      const customIsEnabled = jest.fn().mockReturnValue(true);
      await withController(
        {
          options: {
            isConfigRegistryApiEnabled: customIsEnabled,
          },
        },
        async ({ controller, messenger, mockApiServiceHandler }) => {
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

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                networks: mockNetworks,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          await controller._executePoll(null);

          expect(customIsEnabled).toHaveBeenCalledWith(messenger);
          expect(mockApiServiceHandler).toHaveBeenCalled();
          expect(controller.state.configs.networks['0x1']).toBeDefined();
          expect(controller.state.version).toBe('1.0.0');
        },
      );
    });

    it('uses custom isConfigRegistryApiEnabled function returning false', async () => {
      const customIsEnabled = jest.fn().mockReturnValue(false);
      await withController(
        {
          options: {
            fallbackConfig: MOCK_FALLBACK_CONFIG,
            isConfigRegistryApiEnabled: customIsEnabled,
          },
        },
        async ({ controller, messenger, mockApiServiceHandler }) => {
          await controller._executePoll(null);

          expect(customIsEnabled).toHaveBeenCalledWith(messenger);
          expect(mockApiServiceHandler).not.toHaveBeenCalled();
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
          expect(controller.state.fetchError).toBe(
            'Feature flag disabled - using fallback configuration',
          );
        },
      );
    });

    it('defaults to fallback when feature flag is not set', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ controller, clock, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {},
            cacheTimestamp: Date.now(),
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
        },
      );
    });

    it('defaults to fallback when RemoteFeatureFlagController is unavailable', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ controller, clock, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockImplementation(() => {
            throw new Error('RemoteFeatureFlagController not available');
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
        },
      );
    });
  });

  describe('KeyringController event listeners', () => {
    it('starts polling when KeyringController is already unlocked on initialization', async () => {
      await withController(async ({ clock }) => {
        const mockKeyringControllerGetState = jest.fn().mockReturnValue({
          isUnlocked: true,
        });

        const testRootMessenger = new Messenger<
          MockAnyNamespace,
          | {
              type: 'RemoteFeatureFlagController:getState';
              handler: () => unknown;
            }
          | {
              type: 'KeyringController:getState';
              handler: () => { isUnlocked: boolean };
            }
          | {
              type: 'ConfigRegistryApiService:fetchConfig';
              handler: (options?: {
                etag?: string;
              }) => Promise<FetchConfigResult>;
            },
          | { type: 'KeyringController:unlock'; payload: [] }
          | { type: 'KeyringController:lock'; payload: [] }
        >({
          namespace: MOCK_ANY_NAMESPACE,
        });

        const testMessenger = new Messenger<
          typeof namespace,
          never,
          | { type: 'KeyringController:unlock'; payload: [] }
          | { type: 'KeyringController:lock'; payload: [] },
          typeof testRootMessenger
        >({
          namespace,
          parent: testRootMessenger,
        }) as ConfigRegistryMessenger;

        testRootMessenger.registerActionHandler(
          'ConfigRegistryApiService:fetchConfig',
          jest.fn(buildMockApiServiceHandler()),
        );
        testRootMessenger.registerActionHandler(
          'RemoteFeatureFlagController:getState',
          jest.fn().mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          }),
        );
        testRootMessenger.registerActionHandler(
          'KeyringController:getState',
          mockKeyringControllerGetState,
        );
        testRootMessenger.delegate({
          messenger: testMessenger,
          actions: [
            'RemoteFeatureFlagController:getState',
            'KeyringController:getState',
            'ConfigRegistryApiService:fetchConfig',
          ] as never[],
          events: [
            'KeyringController:unlock',
            'KeyringController:lock',
          ] as never[],
        });

        const controller = new ConfigRegistryController({
          messenger: testMessenger,
        });

        // Initialize the controller after creation
        controller.init();

        const executePollSpy = jest.spyOn(controller, '_executePoll');

        await advanceTime({ clock, duration: 100 });

        expect(mockKeyringControllerGetState).toHaveBeenCalled();
        expect(executePollSpy).toHaveBeenCalledTimes(1);

        controller.stopPolling();
      });
    });

    it('handles KeyringController:getState error gracefully when KeyringController is unavailable', async () => {
      await withController(({ controller, mockKeyringControllerGetState }) => {
        mockKeyringControllerGetState.mockImplementation(() => {
          throw new Error('KeyringController not available');
        });

        expect(controller.state.lastFetched).toBeNull();
      });
    });

    it('starts polling when KeyringController:unlock event is published', async () => {
      await withController(async ({ controller, clock, rootMessenger }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');
        const startPollingSpy = jest.spyOn(controller, 'startPolling');

        expect(startPollingSpy).not.toHaveBeenCalled();

        rootMessenger.publish('KeyringController:unlock');

        await advanceTime({ clock, duration: 0 });

        expect(startPollingSpy).toHaveBeenCalledWith(null);
        expect(executePollSpy).toHaveBeenCalledTimes(1);

        controller.stopPolling();
      });
    });

    it('stops polling when KeyringController:lock event is published', async () => {
      await withController(
        async ({
          controller,
          clock,
          rootMessenger,
          mockKeyringControllerGetState,
        }) => {
          mockKeyringControllerGetState.mockReturnValue({
            isUnlocked: true,
          });

          const stopPollingSpy = jest.spyOn(controller, 'stopPolling');

          await advanceTime({ clock, duration: 0 });
          expect(stopPollingSpy).not.toHaveBeenCalled();

          rootMessenger.publish('KeyringController:lock');

          expect(stopPollingSpy).toHaveBeenCalled();
        },
      );
    });

    it('calls startPolling with default parameter when called without arguments', async () => {
      await withController(async ({ controller, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        controller.startPolling();

        await advanceTime({ clock, duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);

        controller.stopPolling();
      });
    });
  });

  describe('stopPolling', () => {
    it('clears pending delayed poll timeout when stopping', async () => {
      const pollingInterval = 10000;
      const recentTimestamp = Date.now() - 2000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          // Verify timeout was set (poll should not execute immediately)
          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          // Stop polling should clear the timeout
          controller.stopPolling();

          // Advance time past when the timeout would have fired
          await advanceTime({ clock, duration: pollingInterval });
          expect(executePollSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('handles clearing timeout when no timeout exists', async () => {
      await withController(({ controller }) => {
        // Should not throw when stopping without a pending timeout
        expect(() => controller.stopPolling()).not.toThrow();
      });
    });

    it('stops delayed poll using placeholder token', async () => {
      const pollingInterval = 10000;
      const recentTimestamp = Date.now() - 2000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          const token = controller.startPolling(null);

          // Verify timeout was set (poll should not execute immediately)
          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          // Stop polling using the placeholder token
          controller.stopPolling(token);

          // Advance time past when the timeout would have fired
          await advanceTime({ clock, duration: pollingInterval });
          expect(executePollSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('stops delayed poll using placeholder token after timeout fires', async () => {
      const pollingInterval = 10000;
      const recentTimestamp = Date.now() - 2000;
      const remainingTime = pollingInterval - 2000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          const token = controller.startPolling(null);

          // Advance time to when the delayed poll starts
          await advanceTime({ clock, duration: remainingTime + 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);
          executePollSpy.mockClear();

          // Stop polling using the placeholder token (should map to actual token)
          controller.stopPolling(token);

          // Advance time to verify polling stopped
          await advanceTime({ clock, duration: pollingInterval });
          expect(executePollSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('stops all polling when called without token (backward compatible)', async () => {
      await withController(async ({ controller, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        // Start polling from multiple consumers
        controller.startPolling(null);
        controller.startPolling(null);

        await advanceTime({ clock, duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Stop without token should stop all polling
        controller.stopPolling();

        await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('stops specific polling session when called with token', async () => {
      await withController(async ({ controller, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        // Start polling from consumer A
        const tokenA = controller.startPolling(null);
        await advanceTime({ clock, duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Start polling from consumer B (should reuse same polling session)
        controller.startPolling(null);
        await advanceTime({ clock, duration: 0 });
        // Since both use same input (null), they share the same polling session
        // So stopping one token should stop the shared session
        expect(executePollSpy).toHaveBeenCalledTimes(0);
        executePollSpy.mockClear();

        // Stop consumer A's polling session
        controller.stopPolling(tokenA);

        // Polling should stop for both since they share the same session
        await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('works via messenger action with token', async () => {
      await withController(async ({ controller, messenger, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await advanceTime({ clock, duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Stop with token via messenger
        messenger.call('ConfigRegistryController:stopPolling', token);
        await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('works via messenger action without token (backward compatible)', async () => {
      await withController(async ({ controller, messenger, clock }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await advanceTime({ clock, duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Stop without token via messenger (backward compatible)
        messenger.call('ConfigRegistryController:stopPolling');
        await advanceTime({ clock, duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('destroy', () => {
    it('cleans up event listeners and action handlers', async () => {
      await withController(({ controller, messenger }) => {
        const unsubscribeSpy = jest.spyOn(messenger, 'unsubscribe');
        const unregisterActionHandlerSpy = jest.spyOn(
          messenger,
          'unregisterActionHandler',
        );
        const stopPollingSpy = jest.spyOn(controller, 'stopPolling');

        controller.destroy();

        expect(stopPollingSpy).toHaveBeenCalled();
        expect(unsubscribeSpy).toHaveBeenCalledWith(
          'KeyringController:unlock',
          expect.any(Function),
        );
        expect(unsubscribeSpy).toHaveBeenCalledWith(
          'KeyringController:lock',
          expect.any(Function),
        );
        expect(unregisterActionHandlerSpy).toHaveBeenCalledWith(
          'ConfigRegistryController:startPolling',
        );
        expect(unregisterActionHandlerSpy).toHaveBeenCalledWith(
          'ConfigRegistryController:stopPolling',
        );
      });
    });

    it('handles unsubscribe errors gracefully', async () => {
      await withController(({ controller, messenger }) => {
        jest.spyOn(messenger, 'unsubscribe').mockImplementation(() => {
          throw new Error('Handler not subscribed');
        });

        // Should not throw even if unsubscribe fails
        expect(() => controller.destroy()).not.toThrow();
      });
    });

    it('clears pending timeout when destroying', async () => {
      const pollingInterval = 10000;
      const recentTimestamp = Date.now() - 2000;
      await withController(
        {
          options: {
            pollingInterval,
            state: {
              lastFetched: recentTimestamp,
            },
          },
        },
        async ({ controller, clock }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          // Verify timeout was set
          await advanceTime({ clock, duration: 0 });
          expect(executePollSpy).not.toHaveBeenCalled();

          // Destroy should clear the timeout
          controller.destroy();

          // Advance time past when the timeout would have fired
          await advanceTime({ clock, duration: pollingInterval });
          expect(executePollSpy).not.toHaveBeenCalled();
        },
      );
    });
  });
});
