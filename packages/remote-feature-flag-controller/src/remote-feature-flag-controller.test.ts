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

const mockFlags = [{ feature1: true }, { feature2: { chrome: '<109' } }];

const mockFlagsTwo = [{ different: true }];

/**
 * Creates a controller instance with default parameters for testing
 */
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
    messenger: options.messenger ?? getControllerMessenger(),
    state: options.state ?? { remoteFeatureFlags: [], cacheTimestamp: 0 },
    clientConfigApiService:
      options.clientConfigApiService ?? buildClientConfigApiService(),
    disabled: options.disabled,
  });
}

describe('RemoteFeatureFlagController', () => {
  let clientConfigApiService: AbstractClientConfigApiService;

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
        remoteFeatureFlags: mockFlagsTwo,
        cacheTimestamp: 123456789,
      };

      const controller = createController({ state: customState });

      expect(controller.state).toStrictEqual(customState);
    });
  });

  describe('getRemoteFeatureFlags', () => {
    it('should return empty object when controller is disabled', async () => {
      clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: true,
      });

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();

      expect(remoteFeatureFlags).toStrictEqual([]);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).not.toHaveBeenCalled();
    });

    it('should make network request to fetch when cache is not expired', async () => {
      clientConfigApiService = buildClientConfigApiService();
      const controller = createController({ clientConfigApiService });
      const flags = await controller.getRemoteFeatureFlags();

      expect(flags).toStrictEqual(mockFlags);
    });

    it('should make network request to fetch when cache is expired', async () => {
      clientConfigApiService = buildClientConfigApiService({
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
          cachedData: mockFlagsTwo,
          cacheTimestamp: Date.now(),
        }));

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();
      expect(remoteFeatureFlags).toStrictEqual(mockFlagsTwo);
      expect(
        clientConfigApiService.fetchRemoteFeatureFlags,
      ).toHaveBeenCalledTimes(1);
    });

    it('should not affect existing cache when toggling disabled state', async () => {
      clientConfigApiService = buildClientConfigApiService();
      const controller = createController({
        clientConfigApiService,
        disabled: false,
      });

      // First, enable and get flags to populate cache
      await controller.getRemoteFeatureFlags();
      expect(controller.state.remoteFeatureFlags).toStrictEqual(mockFlags);

      // Then disable and verify cache remains but is not accessible
      controller.disable();
      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();
      expect(remoteFeatureFlags).toStrictEqual([]);
      expect(controller.state.remoteFeatureFlags).toStrictEqual(mockFlags);
    });

    it('should use previously cached flags when cache is valid', async () => {
      clientConfigApiService = buildClientConfigApiService();
      const controller = createController({ clientConfigApiService });

      // First call to set cache
      await controller.getRemoteFeatureFlags();

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchRemoteFeatureFlags')
        .mockImplementation(async () => ({
          error: false,
          message: 'Success',
          statusCode: '200',
          statusText: 'OK',
          cachedData: [{ differentFlag: true }],
          cacheTimestamp: Date.now(),
        }));

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();

      expect(remoteFeatureFlags).toStrictEqual(mockFlags);
    });

    it('should handle concurrent flag updates', async () => {
      clientConfigApiService = buildClientConfigApiService();
      const controller = createController();

      const [result1, result2] = await Promise.all([
        controller.getRemoteFeatureFlags(),
        controller.getRemoteFeatureFlags(),
      ]);

      expect(result1).toStrictEqual(mockFlags);
      expect(result2).toStrictEqual(mockFlags);
    });

    it('should create a new fetch when called sequentially with awaiting and sufficient delay', async () => {
      const fetchSpy = jest
        .fn()
        .mockResolvedValueOnce({
          error: false,
          message: 'Success',
          statusCode: '200',
          statusText: 'OK',
          cachedData: mockFlags,
          cacheTimestamp: Date.now(),
        })
        .mockResolvedValueOnce({
          error: false,
          message: 'Success',
          statusCode: '200',
          statusText: 'OK',
          cachedData: mockFlagsTwo,
          cacheTimestamp: Date.now(),
        });

      clientConfigApiService = {
        fetchRemoteFeatureFlags: fetchSpy,
      } as AbstractClientConfigApiService;

      const controller = createController({
        clientConfigApiService,
        state: { remoteFeatureFlags: [], cacheTimestamp: 0 },
      });

      // First call - should fetch new data
      const firstFlags = await controller.getRemoteFeatureFlags();
      expect(firstFlags).toStrictEqual(mockFlags);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // Simulate cache expiration
      controller.update((state) => ({
        ...state,
        cacheTimestamp: Date.now() - 2 * DEFAULT_CACHE_DURATION,
      }));

      // Second call - should fetch new data again
      const secondFlags = await controller.getRemoteFeatureFlags();
      expect(secondFlags).toStrictEqual(mockFlagsTwo);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
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
 * @param options0 - The options object
 * @param options0.cacheTimestamp - Optional timestamp to use for the cache
 * @returns A mock client config API service
 */
function buildClientConfigApiService({
  cacheTimestamp,
}: { cacheTimestamp?: number } = {}): AbstractClientConfigApiService {
  return {
    fetchRemoteFeatureFlags: jest.fn().mockResolvedValue({
      error: false,
      message: 'Success',
      statusCode: '200',
      statusText: 'OK',
      cachedData: mockFlags,
      cacheTimestamp: cacheTimestamp ?? Date.now(),
    }),
  };
}
