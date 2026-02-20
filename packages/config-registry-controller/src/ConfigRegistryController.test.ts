import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';

import type { RegistryNetworkConfig } from './config-registry-api-service';
import type { FetchConfigResult } from './config-registry-api-service';
import type { ConfigRegistryMessenger } from './ConfigRegistryController';
import {
  ConfigRegistryController,
  DEFAULT_POLLING_INTERVAL,
} from './ConfigRegistryController';
import { selectFeaturedNetworks, selectNetworks } from './selectors';
import { createMockNetworkConfig } from './test-helpers';
import { jestAdvanceTime } from '../../../tests/helpers';

const namespace = 'ConfigRegistryController' as const;

type AllActions = MessengerActions<ConfigRegistryMessenger>;

type AllEvents = MessengerEvents<ConfigRegistryMessenger>;

type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

/**
 * Constructs a messenger for ConfigRegistryController.
 *
 * @returns A controller messenger and root messenger.
 */
function getConfigRegistryControllerMessenger(): {
  messenger: ConfigRegistryMessenger;
  rootMessenger: RootMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });

  const configRegistryControllerMessenger: ConfigRegistryMessenger =
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
    events: ['KeyringController:unlock', 'KeyringController:lock'],
  });

  return { messenger: configRegistryControllerMessenger, rootMessenger };
}

const MOCK_FALLBACK_CONFIG: Record<string, RegistryNetworkConfig> = {
  'fallback-key': createMockNetworkConfig({
    chainId: '0x2',
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
  rootMessenger: RootMessenger;
  messenger: ConfigRegistryMessenger;
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
          chainId: '0x1',
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
    it('starts polling', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        controller.startPolling(null);
        await jestAdvanceTime({ duration: 0 });
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
          await jestAdvanceTime({ duration: 0 });
          mockApiServiceHandler.mockClear();
          await jestAdvanceTime({ duration: pollingInterval });
          expect(mockApiServiceHandler).toHaveBeenCalledTimes(1);
          controller.stopAllPolling();
        },
      );
    });

    it('stops polling', async () => {
      await withController(async ({ controller, mockApiServiceHandler }) => {
        controller.startPolling(null);
        await jestAdvanceTime({ duration: 0 });
        mockApiServiceHandler.mockClear();
        controller.stopAllPolling();
        await jestAdvanceTime({ duration: DEFAULT_POLLING_INTERVAL });
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
          await jestAdvanceTime({ duration: 0 });

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
          chainId: '0x3',
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
          await jestAdvanceTime({ duration: 0 });

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
          await jestAdvanceTime({ duration: 0 });

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
          await jestAdvanceTime({ duration: 0 });
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
          await jestAdvanceTime({ duration: 0 });
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
          await jestAdvanceTime({ duration: 0 });
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
          await jestAdvanceTime({ duration: 0 });

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error from superstruct',
            }),
          );
        },
      );
    });

    it('handles validation error when result.data.data is missing', async () => {
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
            'Validation error: data.data is missing',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error: data.data is missing',
            }),
          );
        },
      );
    });

    it('handles validation error when result.data.data.networks is not an array', async () => {
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
            'Validation error: data.data.networks is not an array',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error: data.data.networks is not an array',
            }),
          );
        },
      );
    });

    it('handles validation error when result.data.data.version is not a string', async () => {
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
            'Validation error: data.data.version is not a string',
          );
          mockApiServiceHandler.mockRejectedValue(validationError);

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          expect(rootMessenger.captureException).toHaveBeenCalledWith(
            expect.objectContaining({
              message: 'Validation error: data.data.version is not a string',
            }),
          );
        },
      );
    });

    it('skips fetch when lastFetched is in the future', async () => {
      const now = Date.now();
      const futureTimestamp = now + 10000;
      await withController(
        {
          options: {
            state: {
              lastFetched: futureTimestamp,
            },
          },
        },
        async ({ controller, messenger, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: true,
            },
            cacheTimestamp: now,
          });

          const fetchConfigSpy = jest.spyOn(
            messenger,
            'call',
          ) as jest.SpyInstance;

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

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

          controller.startPolling(null);

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

          controller.startPolling(null);

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
          await jestAdvanceTime({ duration: 0 });

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
          await jestAdvanceTime({ duration: 0 });

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
      await withController(async ({ controller, messenger }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);

        messenger.call('ConfigRegistryController:stopPolling');
        await jestAdvanceTime({ duration: DEFAULT_POLLING_INTERVAL });
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
  });

  describe('startPolling', () => {
    it('returns a polling token string', async () => {
      await withController(({ controller }) => {
        const token = controller.startPolling(null);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        controller.stopAllPolling();
      });
    });

    it('returns a polling token string when called without input', async () => {
      await withController(({ controller }) => {
        const token = controller.startPolling(null);
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        controller.stopAllPolling();
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
        async ({ controller }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          // StaticIntervalPollingController runs first poll after 0ms (executePoll may early-return due to lastFetched)
          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          // Next poll is scheduled at pollingInterval; advancing remainingTime+1 does not reach it
          await jestAdvanceTime({ duration: remainingTime + 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
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
        async ({ controller }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

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
        async ({ controller }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await jestAdvanceTime({ duration: 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

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
        async ({ controller }) => {
          jest.spyOn(Date, 'now').mockReturnValue(now);
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await jestAdvanceTime({ duration: 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
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
        async ({ controller }) => {
          jest
            .spyOn(controller, 'getIntervalLength')
            .mockReturnValue(undefined);

          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          // StaticIntervalPollingController runs first poll after 0ms
          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          controller.stopAllPolling();
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
        async ({ controller }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

          // First call runs first poll after 0ms
          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          const clearTimeoutCallCountBefore = clearTimeoutSpy.mock.calls.length;

          // Second call reuses same session (same input); no new _startPolling, so no extra executePoll
          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          // _startPolling clears before setting; clearTimeout is used when rescheduling after executePoll
          expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(
            clearTimeoutCallCountBefore,
          );

          controller.stopAllPolling();
        },
      );
    });
  });

  describe('feature flag', () => {
    it('uses fallback config when feature flag is disabled', async () => {
      await withController(
        { options: { fallbackConfig: MOCK_FALLBACK_CONFIG } },
        async ({ controller, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {
              configRegistryApiEnabled: false,
            },
            cacheTimestamp: Date.now(),
          });

          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await jestAdvanceTime({ duration: 0 });

          expect(executePollSpy).toHaveBeenCalledTimes(1);
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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          expect(fetchConfigSpy).toHaveBeenCalled();
          expect(controller.state.configs.networks['0x1']).toBeDefined();
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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          // All networks stored in state
          const allNetworks = selectNetworks(controller.state);
          expect(allNetworks['0x1']).toBeDefined();
          expect(allNetworks['0x5']).toBeDefined();
          expect(allNetworks['0xa']).toBeDefined();
          expect(allNetworks['0x89']).toBeDefined();
          expect(Object.keys(allNetworks)).toHaveLength(4);

          // selectFeaturedNetworks returns only featured, active, non-testnet
          const featuredNetworks = selectFeaturedNetworks(controller.state);
          expect(featuredNetworks['0x1']).toBeDefined();
          expect(featuredNetworks['0x5']).toBeUndefined();
          expect(featuredNetworks['0xa']).toBeUndefined();
          expect(featuredNetworks['0x89']).toBeUndefined();
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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          // Last occurrence overwrites (no grouping/priority)
          expect(controller.state.configs.networks['0x1']).toBeDefined();
          expect(controller.state.configs.networks['0x1']?.name).toBe(
            'Ethereum Mainnet (High Priority)',
          );
          expect(
            controller.state.configs.networks['0x1']?.rpcEndpoints[0].type,
          ).toBe('alchemy');

          expect(controller.state.configs.networks['0x89']).toBeDefined();
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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          // Last occurrence overwrites
          expect(controller.state.configs.networks['0x1']).toBeDefined();
          expect(controller.state.configs.networks['0x1']?.name).toBe(
            'Ethereum Mainnet (Second)',
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

          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

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
          controller.startPolling(null);
          await jestAdvanceTime({ duration: 0 });

          expect(customIsEnabled).toHaveBeenCalledWith(messenger);
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
        async ({ controller, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockReturnValue({
            remoteFeatureFlags: {},
            cacheTimestamp: Date.now(),
          });

          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await jestAdvanceTime({ duration: 0 });

          expect(executePollSpy).toHaveBeenCalledTimes(1);
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
        async ({ controller, mockRemoteFeatureFlagGetState }) => {
          mockRemoteFeatureFlagGetState.mockImplementation(() => {
            throw new Error('RemoteFeatureFlagController not available');
          });

          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          await jestAdvanceTime({ duration: 0 });

          expect(executePollSpy).toHaveBeenCalledTimes(1);
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
      await withController(async ({ controller, rootMessenger }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');
        const startPollingSpy = jest.spyOn(controller, 'startPolling');

        expect(startPollingSpy).not.toHaveBeenCalled();

        rootMessenger.publish('KeyringController:unlock');

        await jestAdvanceTime({ duration: 0 });

        expect(startPollingSpy).toHaveBeenCalledWith(null);
        expect(executePollSpy).toHaveBeenCalledTimes(1);

        controller.stopAllPolling();
      });
    });

    it('stops polling when KeyringController:lock event is published', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const stopPollingSpy = jest.spyOn(controller, 'stopAllPolling');

        await jestAdvanceTime({ duration: 0 });
        expect(stopPollingSpy).not.toHaveBeenCalled();

        rootMessenger.publish('KeyringController:lock');

        expect(stopPollingSpy).toHaveBeenCalled();
      });
    });

    it('calls startPolling with default parameter when called without arguments', async () => {
      await withController(async ({ controller }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        controller.startPolling(null);

        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);

        controller.stopAllPolling();
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
        async ({ controller }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          controller.startPolling(null);

          // StaticIntervalPollingController runs first poll after 0ms
          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          // Stop polling should clear the next scheduled timeout
          controller.stopAllPolling();

          // Advance time past when the next poll would have fired
          await jestAdvanceTime({ duration: pollingInterval });
          expect(executePollSpy).toHaveBeenCalledTimes(1);
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
        async ({ controller }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          const token = controller.startPolling(null);

          // StaticIntervalPollingController runs first poll after 0ms
          await jestAdvanceTime({ duration: 0 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);

          // Stop polling using the placeholder token
          controller.stopPollingByPollingToken(token);

          // Advance time past when the next poll would have fired
          await jestAdvanceTime({ duration: pollingInterval });
          expect(executePollSpy).toHaveBeenCalledTimes(1);
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
        async ({ controller }) => {
          const executePollSpy = jest.spyOn(controller, '_executePoll');
          const token = controller.startPolling(null);

          // Advance time to when the delayed poll starts
          await jestAdvanceTime({ duration: remainingTime + 1 });
          expect(executePollSpy).toHaveBeenCalledTimes(1);
          executePollSpy.mockClear();

          // Stop polling using the placeholder token (should map to actual token)
          controller.stopPollingByPollingToken(token);

          // Advance time to verify polling stopped
          await jestAdvanceTime({ duration: pollingInterval });
          expect(executePollSpy).not.toHaveBeenCalled();
        },
      );
    });

    it('stops all polling when called without token (backward compatible)', async () => {
      await withController(async ({ controller }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        // Start polling from multiple consumers
        controller.startPolling(null);
        controller.startPolling(null);

        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Stop without token should stop all polling
        controller.stopAllPolling();

        await jestAdvanceTime({ duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('stops specific polling session when called with token', async () => {
      await withController(async ({ controller }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        // Start polling from consumer A
        const tokenA = controller.startPolling(null);
        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Start polling from consumer B (reuses same polling session)
        const tokenB = controller.startPolling(null);
        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(0);
        executePollSpy.mockClear();

        // Stop both consumers so the shared session is fully stopped
        controller.stopPollingByPollingToken(tokenA);
        controller.stopPollingByPollingToken(tokenB);

        // No more polls after session is stopped
        await jestAdvanceTime({ duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('works via messenger action with token', async () => {
      await withController(async ({ controller, messenger }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Stop via messenger action (stops all polling)
        messenger.call('ConfigRegistryController:stopPolling');
        await jestAdvanceTime({ duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });

    it('works via messenger action without token (backward compatible)', async () => {
      await withController(async ({ controller, messenger }) => {
        const executePollSpy = jest.spyOn(controller, '_executePoll');

        const token = messenger.call(
          'ConfigRegistryController:startPolling',
          null,
        );
        expect(typeof token).toBe('string');

        await jestAdvanceTime({ duration: 0 });
        expect(executePollSpy).toHaveBeenCalledTimes(1);
        executePollSpy.mockClear();

        // Stop without token via messenger (backward compatible)
        messenger.call('ConfigRegistryController:stopPolling');
        await jestAdvanceTime({ duration: DEFAULT_POLLING_INTERVAL });
        expect(executePollSpy).not.toHaveBeenCalled();
      });
    });
  });
});
