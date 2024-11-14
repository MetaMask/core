import { ControllerMessenger } from '@metamask/base-controller';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import {
  RemoteFeatureFlagController,
  controllerName,
} from './remote-feature-flag-controller';
import type {
  RemoteFeatureFlagControllerActions,
  RemoteFeatureFlagControllerMessenger,
  RemoteFeatureFlagControllerState,
  RemoteFeatureFlagControllerStateChangeEvent,
} from './remote-feature-flag-controller';

const mockFlags = [{ feature1: true }, { feature2: { chrome: '<109' } }];

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

  beforeEach(() => {
    clientConfigApiService = buildClientConfigApiService();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const controller = createController();

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: [],
        cacheTimestamp: 0,
      });
    });

    it('should initialize with disabled parameter', () => {
      const controller = createController({ disabled: true });

      expect(controller.state).toStrictEqual({
        remoteFeatureFlags: [],
        cacheTimestamp: 0,
      });
    });
  });

  describe('getRemoteFeatureFlags', () => {
    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should get feature flags from API when cache is invalid', async () => {
      const controller = createController({ clientConfigApiService });

      const flags = await controller.getRemoteFeatureFlags();

      expect(flags).toStrictEqual(mockFlags);
    });

    it('should return empty object when disabled', async () => {
      const controller = createController({
        clientConfigApiService,
        disabled: true,
      });

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();

      expect(remoteFeatureFlags).toStrictEqual([]);
      expect(clientConfigApiService.fetchFlags).not.toHaveBeenCalled();
    });

    it('should properly enable controller and make network request', async () => {
      const controller = createController({
        clientConfigApiService,
        disabled: true,
      });

      controller.enable();

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();
      expect(remoteFeatureFlags).toStrictEqual(mockFlags);
      expect(clientConfigApiService.fetchFlags).toHaveBeenCalledTimes(1);
    });

    it('should properly disable controller and not make network request', async () => {
      const controller = createController({
        clientConfigApiService,
        disabled: false,
      });

      controller.disable();

      const remoteFeatureFlags = await controller.getRemoteFeatureFlags();
      expect(remoteFeatureFlags).toStrictEqual([]);
      expect(clientConfigApiService.fetchFlags).not.toHaveBeenCalled();
    });

    it('should not affect existing cache when toggling disabled state', async () => {
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

    it('should use cached flags when cache is valid', async () => {
      const controller = createController({ clientConfigApiService });

      // First call to set cache
      await controller.getRemoteFeatureFlags();

      // Mock different response
      jest
        .spyOn(clientConfigApiService, 'fetchFlags')
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
      const controller = createController();

      const [result1, result2] = await Promise.all([
        controller.getRemoteFeatureFlags(),
        controller.getRemoteFeatureFlags(),
      ]);

      expect(result1).toStrictEqual(mockFlags);
      expect(result2).toStrictEqual(mockFlags);
    });

    it('should emit state change when updating cache', async () => {
      const rootMessenger = getRootControllerMessenger();
      const stateChangeSpy = jest.fn();
      rootMessenger.subscribe(`${controllerName}:stateChange`, stateChangeSpy);

      const controller = createController({
        messenger: getControllerMessenger(rootMessenger),
      });

      await controller.getRemoteFeatureFlags();

      expect(stateChangeSpy).toHaveBeenCalled();
      expect(controller.state.remoteFeatureFlags).toStrictEqual(mockFlags);
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
 * @returns A mock client config API service
 */
function buildClientConfigApiService(): AbstractClientConfigApiService {
  return {
    fetchFlags: jest.fn().mockResolvedValue({
      error: false,
      message: 'Success',
      statusCode: '200',
      statusText: 'OK',
      cachedData: mockFlags,
      cacheTimestamp: Date.now(),
    }),
  };
}
