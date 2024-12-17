import { ControllerMessenger } from '@metamask/base-controller';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import {
  RemoteFeatureFlagController,
  controllerName,
  DEFAULT_CACHE_DURATION,
  getDefaultRemoteFeatureFlagControllerState,
} from './remote-feature-flag-controller';
import type {
  RemoteFeatureFlagControllerActions,
  RemoteFeatureFlagControllerMessenger,
  RemoteFeatureFlagControllerState,
  RemoteFeatureFlagControllerStateChangeEvent,
} from './remote-feature-flag-controller';
import type { FeatureFlags } from './remote-feature-flag-controller-types';
import * as userSegmentationUtils from './utils/user-segmentation-utils';

const MOCK_FLAGS: FeatureFlags = {
  feature1: true,
  feature2: { chrome: '<109' },
  feature3: [1, 2, 3],
};

const MOCK_FLAGS_TWO = { different: true };

const MOCK_FLAGS_WITH_THRESHOLD = {
  ...MOCK_FLAGS,
  testFlagForThreshold: [
    {
      name: 'groupA',
      scope: { type: 'threshold', value: 0.3 },
      value: 'valueA',
    },
    {
      name: 'groupB',
      scope: { type: 'threshold', value: 0.5 },
      value: 'valueB',
    },
    { name: 'groupC', scope: { type: 'threshold', value: 1 }, value: 'valueC' },
  ],
};

const MOCK_METRICS_ID = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
const MOCK_METRICS_ID_2 = '987fcdeb-51a2-4c4b-9876-543210fedcba';

/**
 * Creates a controller instance with default parameters for testing
 * @param options - The controller configuration options
 * @param options.messenger - The controller messenger instance
 * @param options.state - The initial controller state
 * @param options.clientConfigApiService - The client config API service instance
 * @param options.disabled - Whether the controller should start disabled
 * @returns A configured RemoteFeatureFlagController instance
 */
function createController(
  options: Partial<{
    messenger: RemoteFeatureFlagControllerMessenger;
    state: Partial<RemoteFeatureFlagControllerState>;
    clientConfigApiService: AbstractClientConfigApiService;
    disabled: boolean;
    getMetaMetricsId: Promise<string | undefined>;
  }> = {},
) {
  return new RemoteFeatureFlagController({
    messenger: getControllerMessenger(),
    state: options.state,
    clientConfigApiService:
      options.clientConfigApiService ?? buildClientConfigApiService(),
    disabled: options.disabled,
    getMetaMetricsId: options.getMetaMetricsId,
  });
}

describe('RemoteFeatureFlagController', () => {
  describe('constructor', () => {
    it('initializes with default state', () => {
      const controller = createController();

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });

    it('initializes with default state if the disabled parameter is provided', () => {
      const controller = createController({ disabled: true });

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });

    it('initializes with custom state', () => {
      const customState = {
        remoteFeatureFlags: MOCK_FLAGS_TWO,
        cacheTimestamp: 123456789,
      };

      const controller = createController({ state: customState });

      expect(controller.state).toStrictEqual(customState);
    });
  });

  describe('updateRemoteFeatureFlags', () => {
    it('does not make a network request and does not modify state if disabled is true', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
        },
        clientConfigApiService,
        disabled: true,
      });

      await controller.updateRemoteFeatureFlags();

      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
    });

    it('does not make a network request and does not modify state when cache is not expired', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now() - 10,
        },
        clientConfigApiService,
      });
      await controller.updateRemoteFeatureFlags();

      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('makes a network request to fetch when cache is expired, and then updates the cache', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        cacheTimestamp: Date.now() - 10000,
      });
      const controller = createController({
        clientConfigApiService,
        disabled: false,
      });

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockImplementation(async () => ({
          remoteFeatureFlags: MOCK_FLAGS_TWO,
          cacheTimestamp: Date.now(),
        }));

      await controller.updateRemoteFeatureFlags();
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS_TWO);
    });

    it('uses previously cached flags when cache is valid', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now() - 10,
        },
      });

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockImplementation(() =>
          buildClientConfigApiService({
            remoteFeatureFlags: { differentFlag: true },
          }).fetchRemoteFeatureFlags(),
        );

      await controller.updateRemoteFeatureFlags();

      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('makes one network request, and only one state update, when there are concurrent calls', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({ clientConfigApiService });

      await Promise.all([
        controller.updateRemoteFeatureFlags(),
        controller.updateRemoteFeatureFlags(),
      ]);

      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);

      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('creates a new fetch, and correctly updates state, when called sequentially with awaiting and sufficient delay', async () => {
      jest.useFakeTimers();
      const initialTime = Date.now();
      const fetchSpy = jest
        .fn()
        .mockResolvedValueOnce({
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now(),
        })
        .mockResolvedValueOnce({
          remoteFeatureFlags: MOCK_FLAGS_TWO,
          cacheTimestamp: Date.now(),
        });

      const clientConfigApiService = {
        fetchRemoteFeatureFlags: fetchSpy,
      } as AbstractClientConfigApiService;

      const controller = createController({
        clientConfigApiService,
        state: { remoteFeatureFlags: {}, cacheTimestamp: 0 },
      });

      let currentState;

      // First call - should fetch new data
      await controller.updateRemoteFeatureFlags();
      currentState = controller.state;
      expect(currentState.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance time past cache duration
      jest.setSystemTime(initialTime + 2 * DEFAULT_CACHE_DURATION);

      // Second call - should fetch new data again
      await controller.updateRemoteFeatureFlags();
      currentState = controller.state;
      expect(currentState.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS_TWO);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws an API error to the caller, while leaving cached state unchanged', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        error: new Error('API Error'),
      });

      const controller = createController({
        clientConfigApiService,
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
        },
      });

      await expect(
        async () => await controller.updateRemoteFeatureFlags(),
      ).rejects.toThrow('API Error');
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });
  });

  describe('threshold feature flags', () => {
    it('processes threshold feature flags based on provided metaMetricsId', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
      });
      const controller = createController({
        clientConfigApiService,
        getMetaMetricsId: Promise.resolve(MOCK_METRICS_ID),
      });
      await controller.updateRemoteFeatureFlags();

      expect(
        controller.state.remoteFeatureFlags.testFlagForThreshold,
      ).toStrictEqual({
        name: 'groupC',
        value: 'valueC',
      });
    });

    it('preserves non-threshold feature flags unchanged', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
      });
      const controller = createController({
        clientConfigApiService,
        getMetaMetricsId: Promise.resolve(MOCK_METRICS_ID),
      });
      await controller.updateRemoteFeatureFlags();

      const { testFlagForThreshold, ...nonThresholdFlags } =
        controller.state.remoteFeatureFlags;
      expect(nonThresholdFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('uses a fallback metaMetricsId if none is provided', async () => {
      jest
        .spyOn(userSegmentationUtils, 'generateFallbackMetaMetricsId')
        .mockReturnValue(MOCK_METRICS_ID_2);
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: MOCK_FLAGS_WITH_THRESHOLD,
      });
      const controller = createController({
        clientConfigApiService,
      });
      await controller.updateRemoteFeatureFlags();

      expect(
        controller.state.remoteFeatureFlags.testFlagForThreshold,
      ).toStrictEqual({
        name: 'groupA',
        value: 'valueA',
      });
    });
  });

  describe('enable and disable', () => {
    it('enables the controller and makes a network request to fetch', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: true,
      });

      controller.enable();
      await controller.updateRemoteFeatureFlags();
      expect(clientConfigApiService.fetchRemoteFeatureFlags).toHaveBeenCalled();
    });

    it('preserves cached flags and returns cached data when disabled', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: false,
        state: { remoteFeatureFlags: MOCK_FLAGS, cacheTimestamp: 0 },
      });

      // Verify cache is preserved
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);

      // Disable the controller
      controller.disable();

      // Verify disabled behavior,
      // cache should be preserved, but updateRemoteFeatureFlags should return empty array
      await controller.updateRemoteFeatureFlags();
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });
  });

  describe('getDefaultRemoteFeatureFlagControllerState', () => {
    it('should return default state', () => {
      expect(getDefaultRemoteFeatureFlagControllerState()).toStrictEqual({
        remoteFeatureFlags: {},
        cacheTimestamp: 0,
      });
    });
  });
});

type RootAction = RemoteFeatureFlagControllerActions;
type RootEvent = RemoteFeatureFlagControllerStateChangeEvent;

/**
 * Creates and returns a root controller messenger for testing
 * @returns A controller messenger instance
 */
function getRootControllerMessenger(): ControllerMessenger<
  RootAction,
  RootEvent
> {
  return new ControllerMessenger<RootAction, RootEvent>();
}

/**
 * Creates a restricted controller messenger for testing
 * @param rootMessenger - The root messenger to restrict
 * @returns A restricted controller messenger instance
 */
function getControllerMessenger(
  rootMessenger = getRootControllerMessenger(),
): RemoteFeatureFlagControllerMessenger {
  return rootMessenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: [],
  });
}

/**
 * Builds a mock client config API service for testing
 * @param options - The options object
 * @param options.remoteFeatureFlags - Optional feature flags data to return
 * @param options.cacheTimestamp - Optional timestamp to use for the cache
 * @param options.error - Optional error to simulate API failure
 * @returns A mock client config API service
 */
function buildClientConfigApiService({
  remoteFeatureFlags,
  cacheTimestamp,
  error,
}: {
  remoteFeatureFlags?: FeatureFlags;
  cacheTimestamp?: number;
  error?: Error;
} = {}): AbstractClientConfigApiService {
  return {
    fetchRemoteFeatureFlags: jest.fn().mockImplementation(() => {
      if (error) {
        return Promise.reject(error);
      }
      return Promise.resolve({
        remoteFeatureFlags: remoteFeatureFlags ?? MOCK_FLAGS,
        cacheTimestamp: cacheTimestamp ?? Date.now(),
      });
    }),
  };
}
