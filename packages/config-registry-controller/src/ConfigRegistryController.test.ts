import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import type { RegistryNetworkConfig } from './config-registry-api-service/types';
import type { FetchConfigResult } from './config-registry-api-service/types';
import type { ConfigRegistryControllerMessenger } from './ConfigRegistryController';
import {
  ConfigRegistryController,
  DEFAULT_POLLING_INTERVAL,
} from './ConfigRegistryController';
import { selectFeaturedNetworks, selectNetworks } from './selectors';
import { createMockNetworkConfig } from '../tests/helpers';

const namespace = 'ConfigRegistryController' as const;

type AllActions = MessengerActions<ConfigRegistryControllerMessenger>;

type AllEvents = MessengerEvents<ConfigRegistryControllerMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

/**
 * Constructs a messenger for ConfigRegistryController.
 *
 * @returns A controller messenger and root messenger.
 */
function getConfigRegistryControllerMessenger(): {
  messenger: ConfigRegistryControllerMessenger;
  rootMessenger: RootMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });

  const configRegistryControllerMessenger: ConfigRegistryControllerMessenger =
    new Messenger<
      typeof namespace,
      AllActions,
      AllEvents,
      typeof rootMessenger
    >({
      namespace,
      parent: rootMessenger,
    });

  rootMessenger.delegate({
    messenger: configRegistryControllerMessenger,
    actions: [
      'RemoteFeatureFlagController:getState',
      'ConfigRegistryApiService:fetchConfig',
    ],
    events: [
      'KeyringController:unlock',
      'KeyringController:lock',
      'RemoteFeatureFlagController:stateChange',
    ],
  });

  return { messenger: configRegistryControllerMessenger, rootMessenger };
}

const MOCK_FALLBACK_CONFIG: Record<string, RegistryNetworkConfig> = {
  'fallback-key': createMockNetworkConfig({
    chainId: 'eip155:2',
    name: 'Fallback Network',
  }),
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
          chains: [],
        },
      },
      modified: true,
    };
  };

  return overrides?.fetchConfig ?? defaultFetchConfig;
}

type WithControllerCallback<ReturnValue> = (args: {
  controller: ConfigRegistryController;
  rootMessenger: RootMessenger;
  messenger: ConfigRegistryControllerMessenger;
  mockApiServiceHandler: jest.Mock;
  mockRemoteFeatureFlagGetState: jest.Mock;
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

  jest.useFakeTimers();
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

  const controller = new ConfigRegistryController({
    messenger,
    ...options,
  });

  try {
    return await testFunction({
      controller,
      rootMessenger,
      messenger,
      mockApiServiceHandler,
      mockRemoteFeatureFlagGetState,
    });
  } finally {
    controller.stopAllPolling();
    jest.useRealTimers();
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
          etag: null,
        });
      });
    });

    it('sets initial state when provided', async () => {
      const initialNetworks: Record<string, RegistryNetworkConfig> = {
        'test-key': createMockNetworkConfig({
          chainId: 'eip155:1',
          name: 'Test Network',
        }),
      };
      const initialState = {
        configs: { networks: initialNetworks },
        version: 'v1.0.0',
        lastFetched: 1234567890,
      };

      await withController(
        { options: { state: initialState } },
        ({ controller }) => {
          expect(controller.state.configs.networks).toStrictEqual(
            initialNetworks,
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
  });

  describe('polling', () => {
    it('hits the config registry API when polling is started', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        controller.startPolling(null);
        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
        controller.stopAllPolling();
      });
    });

    it('polls at specified interval', async () => {
      const pollingInterval = 1000;
      await withController(
        { options: { pollingInterval } },
        async ({ controller, mockApiServiceHandler }) => {
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          mockApiServiceHandler.mockClear();
          await jest.advanceTimersByTimeAsync(pollingInterval);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
          controller.stopAllPolling();
        },
      );
    });

    it('does not hit the config registry API periodically when polling is stopped', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        controller.startPolling(null);
        await jest.advanceTimersByTimeAsync(0);
        mockApiServiceHandler.mockClear();
        controller.stopAllPolling();
        await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
        expect(mockApiServiceHandler).not.toHaveBeenCalled();
      });
    });

    it('uses fallback config when no configs exist', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
        },
      );
    });

    it('keeps existing configs when fetch fails and configs already exist', async () => {
      const existingNetworks: Record<string, RegistryNetworkConfig> = {
        'existing-key': createMockNetworkConfig({
          chainId: 'eip155:3',
          name: 'Existing Network',
        }),
      };
      const existingConfigs = { networks: existingNetworks };

      await withController(
        {
          options: {
            state: { configs: existingConfigs },
            fallbackConfig: MOCK_FALLBACK_CONFIG,
          },
        },
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(controller.state.configs.networks).toStrictEqual(
            existingNetworks,
          );
        },
      );
    });

    it('handles errors during polling', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValueOnce({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
          expect(mockRemoteFeatureFlagGetState).toHaveBeenCalled();
        },
      );
    });

    it('handles unmodified response and updates lastFetched and etag', async () => {
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

          mockApiServiceHandler.mockResolvedValue({
            modified: false,
            etag: '"test-etag"',
          });

          const beforeTimestamp = Date.now();
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          const afterTimestamp = Date.now();

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
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          const afterTimestamp = Date.now();

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
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          const afterTimestamp = Date.now();

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
        async ({
          controller,
          rootMessenger,
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
            'Validation error from superstruct',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error from superstruct',
            }),
          );
        },
      );
    });

    it('handles validation error when result.data is missing', async () => {
      await withController(
        async ({
          controller,
          rootMessenger,
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
            'Validation error: data is missing',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error: data is missing',
            }),
          );
        },
      );
    });

    it('handles validation error when result.data.chains is not an array', async () => {
      await withController(
        async ({
          controller,
          rootMessenger,
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
            'Validation error: data.chains is not an array',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error: data.chains is not an array',
            }),
          );
        },
      );
    });

    it('handles validation error when result.data.version is not a string', async () => {
      await withController(
        async ({
          controller,
          rootMessenger,
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
            'Validation error: data.version is not a string',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error: data.version is not a string',
            }),
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
                version: '1.0.0',
                timestamp: Date.now(),
                chains: [
                  createMockNetworkConfig({
                    chainId: 'eip155:1',
                    name: 'Ethereum Mainnet',
                  }),
                ],
              },
            },
            etag: '"test-etag"',
            modified: true,
          });

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

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
                version: '1.0.0',
                timestamp: Date.now(),
                chains: [
                  createMockNetworkConfig({
                    chainId: 'eip155:1',
                    name: 'Ethereum Mainnet',
                  }),
                ],
              },
            },
            etag: '"test-etag"',
            modified: true,
          });

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(mockApiServiceHandler).toHaveBeenCalled();
          expect(controller.state.lastFetched).not.toBe(oldTimestamp);

          jest.restoreAllMocks();
        },
      );
    });

    it('handles non-Error exceptions', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue('String error');

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'String error' }),
          );
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
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
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockRejectedValue(new Error('Network error'));

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Network error' }),
          );
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
        },
      );
    });

    it('works via messenger actions', async () => {
      await withController(async ({ messenger, mockApiServiceHandler }) => {
        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

        messenger.call('ConfigRegistryController:stopPolling');
        await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
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
  });

  describe('startPolling', () => {
    it('returns a polling token string', async () => {
      await withController(({ controller }) => {
        const token = controller.startPolling(null);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      });
    });

    it('returns a polling token string when called without input', async () => {
      await withController(({ controller }) => {
        const token = controller.startPolling(null);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      });
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
        async ({ controller, mockApiServiceHandler }) => {
          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(0);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
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
        async ({ controller, mockApiServiceHandler }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);
          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(1);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
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
        async ({ controller, mockApiServiceHandler }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);
          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(1);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
          jest.restoreAllMocks();
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
        async ({ controller, mockApiServiceHandler }) => {
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          const callsAfterFirst = mockApiServiceHandler.mock.calls.length;

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(callsAfterFirst);

          controller.stopAllPolling();
        },
      );
    });
  });

  describe('feature flag', () => {
    it('uses fallback config when feature flag is disabled', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: false,
            },
            cacheTimestamp: Date.now(),
          });

          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(0);

          expect(mockApiServiceHandler).not.toHaveBeenCalled();
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });

          controller.stopAllPolling();
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

          const mockChains = [
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet',
            }),
          ];

          const fetchConfigSpy = jest.fn().mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                chains: mockChains,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          mockApiServiceHandler.mockImplementation(fetchConfigSpy);

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(fetchConfigSpy).toHaveBeenCalled();
          expect(controller.state.configs.networks['eip155:1']).toBeDefined();
          expect(controller.state.version).toBe('1.0.0');
        },
      );
    });

    it('stores all networks in state; selectFeaturedNetworks filters for default list', async () => {
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

          const mockChains = [
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet',
              config: { isTestnet: false, isFeatured: true, isActive: true },
            }),
            createMockNetworkConfig({
              chainId: 'eip155:5',
              name: 'Goerli',
              config: { isTestnet: true, isFeatured: true, isActive: true },
            }),
            createMockNetworkConfig({
              chainId: 'eip155:10',
              name: 'Optimism',
              config: { isTestnet: false, isFeatured: false, isActive: true },
            }),
            createMockNetworkConfig({
              chainId: 'eip155:137',
              name: 'Polygon',
              config: { isTestnet: false, isFeatured: true, isActive: false },
            }),
          ];

          const fetchConfigSpy = jest.fn().mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                chains: mockChains,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          mockApiServiceHandler.mockImplementation(fetchConfigSpy);

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          // All networks stored in state
          const allNetworks = selectNetworks(controller.state);
          expect(allNetworks['eip155:1']).toBeDefined();
          expect(allNetworks['eip155:5']).toBeDefined();
          expect(allNetworks['eip155:10']).toBeDefined();
          expect(allNetworks['eip155:137']).toBeDefined();
          expect(Object.keys(allNetworks)).toHaveLength(4);

          // selectFeaturedNetworks returns only featured, active, non-testnet
          const featuredNetworks = selectFeaturedNetworks(controller.state);
          expect(featuredNetworks['eip155:1']).toBeDefined();
          expect(featuredNetworks['eip155:5']).toBeUndefined();
          expect(featuredNetworks['eip155:10']).toBeUndefined();
          expect(featuredNetworks['eip155:137']).toBeUndefined();
          expect(Object.keys(featuredNetworks)).toHaveLength(1);
        },
      );
    });

    it('handles duplicate chainIds by keeping highest priority network and logging warning', async () => {
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

          // Mock API response with duplicate chainIds (last occurrence wins)
          const mockChains = [
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet (Low Priority)',
              config: { priority: 10 },
              rpcProviders: {
                default: {
                  url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
                  type: 'infura',
                  networkClientId: 'mainnet',
                },
                fallbacks: [],
              },
            }),
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet (High Priority)',
              config: { priority: 0 },
              rpcProviders: {
                default: {
                  url: 'https://mainnet.alchemy.io/v2/{alchemyApiKey}',
                  type: 'alchemy',
                  networkClientId: 'mainnet-alchemy',
                },
                fallbacks: [],
              },
            }),
            createMockNetworkConfig({
              chainId: 'eip155:137',
              name: 'Polygon',
            }),
          ];

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                chains: mockChains,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          // Last occurrence overwrites (no grouping/priority)
          expect(controller.state.configs.networks['eip155:1']).toBeDefined();
          expect(controller.state.configs.networks['eip155:1']?.name).toBe(
            'Ethereum Mainnet (High Priority)',
          );
          expect(
            controller.state.configs.networks['eip155:1']?.rpcProviders.default
              .type,
          ).toBe('alchemy');

          expect(controller.state.configs.networks['eip155:137']).toBeDefined();
        },
      );
    });

    it('handles duplicate chainIds by keeping last occurrence', async () => {
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

          // Mock API response with duplicate chainIds having same priority
          const mockChains = [
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet (First)',
              config: { priority: 5 },
            }),
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet (Second)',
              config: { priority: 5 },
              rpcProviders: {
                default: {
                  url: 'https://mainnet.alchemy.io/v2/{alchemyApiKey}',
                  type: 'alchemy',
                  networkClientId: 'mainnet-alchemy',
                },
                fallbacks: [],
              },
            }),
          ];

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                chains: mockChains,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          // Last occurrence overwrites
          expect(controller.state.configs.networks['eip155:1']).toBeDefined();
          expect(controller.state.configs.networks['eip155:1']?.name).toBe(
            'Ethereum Mainnet (Second)',
          );
        },
      );
    });

    it('fetches when feature flag is enabled (default mock)', async () => {
      await withController(
        {},
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          const mockChains = [
            createMockNetworkConfig({
              chainId: 'eip155:1',
              name: 'Ethereum Mainnet',
            }),
          ];

          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: { configRegistryApiEnabled: true },
            cacheTimestamp: Date.now(),
          });

          mockApiServiceHandler.mockResolvedValue({
            data: {
              data: {
                version: '1.0.0',
                timestamp: Date.now(),
                chains: mockChains,
              },
            },
            modified: true,
            etag: 'test-etag',
          });

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(mockRemoteFeatureFlagGetState).toHaveBeenCalled();
          expect(mockApiServiceHandler).toHaveBeenCalled();
          expect(controller.state.configs.networks['eip155:1']).toBeDefined();
          expect(controller.state.version).toBe('1.0.0');
        },
      );
    });

    it('skips fetch when feature flag is disabled', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: { configRegistryApiEnabled: false },
            cacheTimestamp: Date.now(),
          });

          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);

          expect(mockRemoteFeatureFlagGetState).toHaveBeenCalled();
          expect(mockApiServiceHandler).not.toHaveBeenCalled();
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });
        },
      );
    });

    it('defaults to fallback when feature flag is not set', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {},
            cacheTimestamp: Date.now(),
          });

          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(0);

          expect(mockApiServiceHandler).not.toHaveBeenCalled();
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });

          controller.stopAllPolling();
        },
      );
    });

    it('defaults to fallback when RemoteFeatureFlagController is unavailable', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({
          controller,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockImplementation(() => {
            throw new Error('RemoteFeatureFlagController not available');
          });

          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(0);

          expect(mockApiServiceHandler).not.toHaveBeenCalled();
          expect(controller.state.configs).toStrictEqual({
            networks: MOCK_FALLBACK_CONFIG,
          });

          controller.stopAllPolling();
        },
      );
    });
  });

  describe('KeyringController event listeners', () => {
    it('starts polling when KeyringController:unlock event is published', async () => {
      await withController(
        async ({ controller, rootMessenger, mockApiServiceHandler }) => {
          rootMessenger.publish('KeyringController:unlock');

          await jest.advanceTimersByTimeAsync(0);

          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
        },
      );
    });

    it('stops polling when KeyringController:lock event is published', async () => {
      await withController(
        async ({ controller, rootMessenger, mockApiServiceHandler }) => {
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          const callsAfterUnlock = mockApiServiceHandler.mock.calls.length;

          rootMessenger.publish('KeyringController:lock');

          await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(callsAfterUnlock);
        },
      );
    });

    it('calls startPolling with default parameter when called without arguments', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        controller.startPolling(null);

        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

        controller.stopAllPolling();
      });
    });
  });

  describe('RemoteFeatureFlagController:stateChange', () => {
    it('starts polling when flag becomes enabled', async () => {
      await withController(
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: { configRegistryApiEnabled: true },
            cacheTimestamp: Date.now(),
          });

          rootMessenger.publish(
            'RemoteFeatureFlagController:stateChange',
            {
              remoteFeatureFlags: { configRegistryApiEnabled: true },
              cacheTimestamp: Date.now(),
            },
            [],
          );

          await jest.advanceTimersByTimeAsync(0);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
        },
      );
    });

    it('stops polling when flag becomes disabled', async () => {
      await withController(
        async ({
          controller,
          rootMessenger,
          mockRemoteFeatureFlagGetState,
          mockApiServiceHandler,
        }) => {
          controller.startPolling(null);
          await jest.advanceTimersByTimeAsync(0);
          const callsAfterStart = mockApiServiceHandler.mock.calls.length;

          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: { configRegistryApiEnabled: false },
            cacheTimestamp: Date.now(),
          });

          rootMessenger.publish(
            'RemoteFeatureFlagController:stateChange',
            {
              remoteFeatureFlags: { configRegistryApiEnabled: false },
              cacheTimestamp: Date.now(),
            },
            [],
          );

          await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(callsAfterStart);
        },
      );
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
        async ({ controller, mockApiServiceHandler }) => {
          controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(0);
          const callsAfterFirstAdvance =
            mockApiServiceHandler.mock.calls.length;

          controller.stopAllPolling();

          await jest.advanceTimersByTimeAsync(pollingInterval);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(
            callsAfterFirstAdvance,
          );
        },
      );
    });

    it('handles clearing timeout when no timeout exists', async () => {
      await withController(({ controller }) => {
        // Should not throw when stopping without a pending timeout
        expect(() => controller.stopAllPolling()).not.toThrow();
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
        async ({ controller, mockApiServiceHandler }) => {
          const token = controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(0);
          const callsAfterFirstAdvance =
            mockApiServiceHandler.mock.calls.length;

          controller.stopPollingByPollingToken(token);

          await jest.advanceTimersByTimeAsync(pollingInterval);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(
            callsAfterFirstAdvance,
          );
        },
      );
    });

    it('stops delayed poll using placeholder token after timeout fires', async () => {
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
        async ({ controller, mockApiServiceHandler }) => {
          const token = controller.startPolling(null);

          await jest.advanceTimersByTimeAsync(pollingInterval);
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(2);
          mockApiServiceHandler.mockClear();

          controller.stopPollingByPollingToken(token);

          await jest.advanceTimersByTimeAsync(pollingInterval);
          expect(mockApiServiceHandler).not.toHaveBeenCalled();
        },
      );
    });

    it('stops all polling when called without token (backward compatible)', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        controller.startPolling(null);
        controller.startPolling(null);

        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
        mockApiServiceHandler.mockClear();

        controller.stopAllPolling();

        await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
        expect(mockApiServiceHandler).not.toHaveBeenCalled();
      });
    });

    it('stops specific polling session when called with token', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        const tokenA = controller.startPolling(null);
        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
        mockApiServiceHandler.mockClear();

        const tokenB = controller.startPolling(null);
        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).not.toHaveBeenCalled();
        mockApiServiceHandler.mockClear();

        controller.stopPollingByPollingToken(tokenA);
        controller.stopPollingByPollingToken(tokenB);

        await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
        expect(mockApiServiceHandler).not.toHaveBeenCalled();
      });
    });

    it('works via messenger action with token', async () => {
      await withController(async ({ messenger, mockApiServiceHandler }) => {
        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
        mockApiServiceHandler.mockClear();

        messenger.call('ConfigRegistryController:stopPolling');
        await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
        expect(mockApiServiceHandler).not.toHaveBeenCalled();
      });
    });

    it('works via messenger action without token (backward compatible)', async () => {
      await withController(async ({ messenger, mockApiServiceHandler }) => {
        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await jest.advanceTimersByTimeAsync(0);
        expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
        mockApiServiceHandler.mockClear();

        messenger.call('ConfigRegistryController:stopPolling');
        await jest.advanceTimersByTimeAsync(DEFAULT_POLLING_INTERVAL);
        expect(mockApiServiceHandler).not.toHaveBeenCalled();
      });
    });
  });
});
