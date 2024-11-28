import { ControllerMessenger } from '@metamask/base-controller';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import {
  RemoteFeatureFlagController,
  controllerName,
  DEFAULT_CACHE_DURATION,
} from './remote-feature-flag-controller';
import type {
  RemoteFeatureFlagControllerActions,
  RemoteFeatureFlagControllerMessenger,
  RemoteFeatureFlagControllerState,
  RemoteFeatureFlagControllerStateChangeEvent,
} from './remote-feature-flag-controller';
import type { FeatureFlags } from './remote-feature-flag-controller-types';

const MOCK_FLAGS: FeatureFlags = [
  { feature1: true },
  { feature2: { chrome: '<109' } },
];
const MOCK_FLAGS_WITH_NAMES = [
  { feature1: true, name: 'feature1' },
  { feature2: { chrome: '<109' }, name: 'feature2' },
];

const MOCK_FLAGS_TWO = [{ different: true }];
const MOCK_FLAGS_TWO_WITH_NAMES = [{ different: true, name: 'different' }];

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
  }> = {},
) {
  return new RemoteFeatureFlagController({
    messenger: getControllerMessenger(),
    state: options.state,
    clientConfigApiService:
      options.clientConfigApiService ?? buildClientConfigApiService(),
    disabled: options.disabled,
  });
}

describe('RemoteFeatureFlagController', () => {
  describe('constructor', () => {
    it('should initialize with default state', () => {
      const controller = createController();

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: [],
        cacheTimestamp: 0,
      });
    });

    it('should initialize controller with default state if the disabled parameter is provided', () => {
      const controller = createController({ disabled: true });

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: [],
        cacheTimestamp: 0,
      });
    });

    it('should initialize controller with custom state', () => {
      const customState = {
        remoteFeatureFlags: MOCK_FLAGS_TWO,
        cacheTimestamp: 123456789,
      };

      const controller = createController({ state: customState });

      expect(controller.state).toStrictEqual(customState);
    });
  });

  describe('getRemoteFeatureFlags', () => {
    it('should return cached data when controller is disabled', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
        },
        clientConfigApiService,
        disabled: true,
      });

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();

      expect(remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
    });

    it('should not make network request to fetch, and should returned cached data, when cache is not expired', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now() - 10,
        },
        clientConfigApiService,
      });
      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();

      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
      expect(remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
    });

    it('should make network request to fetch when cache is expired', async () => {
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
          error: false,
          message: 'Success',
          statusCode: '200',
          statusText: 'OK',
          remoteFeatureFlags: MOCK_FLAGS_TWO,
          cacheTimestamp: Date.now(),
        }));

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();
      expect(remoteFeatureFlags).toStrictEqual(MOCK_FLAGS_TWO_WITH_NAMES);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);
    });

    it('should use previously cached flags when cache is valid', async () => {
      const CACHED_DATA = [{ test: 123 }];
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        state: {
          remoteFeatureFlags: CACHED_DATA,
          cacheTimestamp: Date.now() - 10,
        },
      });

      // First call to set cache
      await controller.getRemoteFeatureFlags();

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockImplementation(() =>
          buildClientConfigApiService({
            remoteFeatureFlags: [{ differentFlag: true }],
          }).fetchRemoteFeatureFlags(),
        );

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();

      expect(remoteFeatureFlags).toStrictEqual(CACHED_DATA);
    });

    it('should handle concurrent flag updates', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({ clientConfigApiService });

      const [result1, result2] = await Promise.all([
        controller.getRemoteFeatureFlags(),
        controller.getRemoteFeatureFlags(),
      ]);

      expect(result1).toStrictEqual(MOCK_FLAGS_WITH_NAMES);
      expect(result2).toStrictEqual(MOCK_FLAGS_WITH_NAMES);
    });

    it('should create a new fetch when called sequentially with awaiting and sufficient delay', async () => {
      jest.useFakeTimers();
      const initialTime = Date.now();
      const fetchSpy = jest
        .fn()
        .mockResolvedValueOnce({
          error: false,
          message: 'Success',
          statusCode: '200',
          statusText: 'OK',
          remoteFeatureFlags: MOCK_FLAGS,
          cacheTimestamp: Date.now(),
        })
        .mockResolvedValueOnce({
          error: false,
          message: 'Success',
          statusCode: '200',
          statusText: 'OK',
          remoteFeatureFlags: MOCK_FLAGS_TWO,
          cacheTimestamp: Date.now(),
        });

      const clientConfigApiService = {
        fetchRemoteFeatureFlags: fetchSpy,
      } as AbstractClientConfigApiService;

      const controller = createController({
        clientConfigApiService,
        state: { remoteFeatureFlags: [], cacheTimestamp: 0 },
      });

      // First call - should fetch new data
      const firstFlags = await controller.getRemoteFeatureFlags();
      expect(firstFlags).toStrictEqual(MOCK_FLAGS_WITH_NAMES);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Advance time past cache duration
      jest.setSystemTime(initialTime + 2 * DEFAULT_CACHE_DURATION);

      // Second call - should fetch new data again
      const secondFlags = await controller.getRemoteFeatureFlags();
      expect(secondFlags).toStrictEqual(MOCK_FLAGS_TWO_WITH_NAMES);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should resolve with empty array when API returns no cached data', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: [],
      });

      const controller = createController({ clientConfigApiService });
      const result = await controller.getRemoteFeatureFlags();

      expect(result).toStrictEqual([]);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);
    });

    it('should handle empty data from API', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        remoteFeatureFlags: [],
      });
      const controller = createController({ clientConfigApiService });

      const result = await controller.getRemoteFeatureFlags();
      expect(result).toStrictEqual([]);
    });

    it('should handle errors during concurrent requests', async () => {
      const clientConfigApiService = buildClientConfigApiService({
        error: new Error('API Error'),
      });

      const controller = createController({
        clientConfigApiService,
        state: {
          remoteFeatureFlags: MOCK_FLAGS,
        },
      });

      const result = await Promise.all([
        controller.getRemoteFeatureFlags(),
        controller.getRemoteFeatureFlags(),
      ]);
      expect(result[0]).toStrictEqual(MOCK_FLAGS);
    });

    it('should preserve cache when API request fails', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        state: { remoteFeatureFlags: MOCK_FLAGS, cacheTimestamp: 0 },
      });

      // Mock API to fail
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockRejectedValue('API Error');

      // Should still return cached data
      const result = await controller.getRemoteFeatureFlags();
      expect(result).toStrictEqual(MOCK_FLAGS);
    });
  });

  describe('enable and disable', () => {
    it('should enable the controller and make network request to fetch', async () => {
      const clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: true,
      });

      controller.enable();
      await controller.getRemoteFeatureFlags();
      expect(clientConfigApiService.fetchRemoteFeatureFlags).toHaveBeenCalled();
    });

    it('should preserve cached flags and return cached data when disabled', async () => {
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
      // cache should be preserved, but getRemoteFeatureFlags should return empty array
      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();
      expect(remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
      expect(controller.state.remoteFeatureFlags).toStrictEqual(MOCK_FLAGS);
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
        error: false,
        message: 'Success',
        statusCode: '200',
        statusText: 'OK',
        remoteFeatureFlags: remoteFeatureFlags ?? MOCK_FLAGS,
        cacheTimestamp: cacheTimestamp ?? Date.now(),
      });
    }),
  };
}
