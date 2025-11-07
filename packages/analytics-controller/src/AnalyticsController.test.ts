import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
} from '@metamask/messenger';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

import {
  AnalyticsController,
  type AnalyticsControllerMessenger,
  type AnalyticsControllerActions,
  type AnalyticsControllerEvents,
  type AnalyticsPlatformAdapter,
  getDefaultAnalyticsControllerState,
} from '.';
import type { AnalyticsControllerState } from '.';

type SetupControllerOptions = {
  state?: Partial<AnalyticsControllerState>;
  platformAdapter?: AnalyticsPlatformAdapter;
};

type SetupControllerReturn = {
  controller: AnalyticsController;
  messenger: AnalyticsControllerMessenger;
};

/**
 * Sets up an AnalyticsController for testing.
 *
 * @param options - Controller options
 * @returns The controller and messenger
 */
function setupController(
  options: SetupControllerOptions = {},
): SetupControllerReturn {
  const { state = {}, platformAdapter } = options;

  // Create default mock adapter if not provided
  const adapter =
    platformAdapter ??
    ({
      track: jest.fn(),
      identify: jest.fn(),
      view: jest.fn(),
      onSetupCompleted: jest.fn(),
    } satisfies AnalyticsPlatformAdapter);

  const rootMessenger = new Messenger<
    MockAnyNamespace,
    AnalyticsControllerActions,
    AnalyticsControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const analyticsControllerMessenger = new Messenger<
    'AnalyticsController',
    AnalyticsControllerActions,
    AnalyticsControllerEvents,
    typeof rootMessenger
  >({
    namespace: 'AnalyticsController',
    parent: rootMessenger,
  });

  const controller = new AnalyticsController({
    messenger: analyticsControllerMessenger,
    platformAdapter: adapter,
    state,
  });

  return {
    controller,
    messenger: analyticsControllerMessenger,
  };
}

/**
 * Validates that a string is a valid UUIDv4 format.
 *
 * @param value - The string to validate
 * @returns True if the string matches UUIDv4 format
 */
function isValidUUIDv4(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 4;
}

describe('AnalyticsController', () => {
  const createMockAdapter = (): AnalyticsPlatformAdapter => ({
    track: jest.fn(),
    identify: jest.fn(),
    view: jest.fn(),
    onSetupCompleted: jest.fn(),
  });

  describe('constructor', () => {
    it('initializes with default state including auto-generated analyticsId', () => {
      const { controller } = setupController();

      const defaultState = getDefaultAnalyticsControllerState();

      expect(controller.state.enabled).toBe(defaultState.enabled);
      expect(controller.state.optedIn).toBe(defaultState.optedIn);
      expect(isValidUUIDv4(controller.state.analyticsId)).toBe(true);
    });

    it('generates a new UUID when no state is provided (first-time initialization)', () => {
      // Create two controllers without providing state
      const { controller: controller1 } = setupController();
      const { controller: controller2 } = setupController();

      expect(isValidUUIDv4(controller1.state.analyticsId)).toBe(true);
      expect(isValidUUIDv4(controller2.state.analyticsId)).toBe(true);
      expect(controller1.state.analyticsId).not.toBe(
        controller2.state.analyticsId,
      );
    });

    it('initializes with provided state', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          enabled: false,
          optedIn: true,
          analyticsId: customId,
        },
      });

      expect(controller.state.enabled).toBe(false);
      expect(controller.state.optedIn).toBe(true);
      expect(controller.state.analyticsId).toBe(customId);
    });

    it('restores analyticsId from persisted state', () => {
      // First, create a controller (generates UUID)
      const { controller: firstController } = setupController();
      const originalAnalyticsId = firstController.state.analyticsId;

      expect(isValidUUIDv4(originalAnalyticsId)).toBe(true);

      // Simulate restoration: create a new controller with the previous state
      const { controller: restoredController } = setupController({
        state: {
          enabled: firstController.state.enabled,
          optedIn: firstController.state.optedIn,
          analyticsId: firstController.state.analyticsId,
        },
      });

      // The restored controller should have the same state as the original controller
      expect(restoredController.state.analyticsId).toBe(originalAnalyticsId);
      expect(restoredController.state.enabled).toBe(
        firstController.state.enabled,
      );
      expect(restoredController.state.optedIn).toBe(
        firstController.state.optedIn,
      );
    });

    it('initializes with custom enabled/optedIn', () => {
      const { controller } = setupController({
        state: {
          enabled: false,
          optedIn: true,
        },
      });

      expect(controller.state.enabled).toBe(false);
      expect(controller.state.optedIn).toBe(true);
    });

    it('uses default analyticsId when not provided in partial state', () => {
      const { controller } = setupController({
        state: {
          enabled: false,
          optedIn: true,
        },
      });

      expect(isValidUUIDv4(controller.state.analyticsId)).toBe(true);
    });

    it('initializes with default values when options are undefined', () => {
      const mockAdapter = createMockAdapter();
      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const analyticsControllerMessenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerActions,
        AnalyticsControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsController',
        parent: rootMessenger,
      });

      const controller = new AnalyticsController({
        messenger: analyticsControllerMessenger,
        platformAdapter: mockAdapter,
      });

      const defaultState = getDefaultAnalyticsControllerState();
      expect(controller.state.enabled).toBe(defaultState.enabled);
      expect(controller.state.optedIn).toBe(defaultState.optedIn);
      // analyticsId is auto-generated (UUIDv4)
      expect(typeof controller.state.analyticsId).toBe('string');
      expect(isValidUUIDv4(controller.state.analyticsId)).toBe(true);
    });
  });

  describe('onSetupCompleted lifecycle hook', () => {
    it('calls onSetupCompleted after initialization when analyticsId is set', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';

      setupController({
        state: { analyticsId: customId },
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledWith(customId);
    });

    it('calls onSetupCompleted with auto-generated analyticsId when not provided', () => {
      const mockAdapter = createMockAdapter();

      const { controller } = setupController({
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledWith(
        controller.state.analyticsId,
      );
      expect(isValidUUIDv4(controller.state.analyticsId)).toBe(true);
    });

    it('throws error when analyticsId is empty string', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { analyticsId: '' },
          platformAdapter: mockAdapter,
        });
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got ""');

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('throws error when analyticsId is undefined', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { analyticsId: undefined as unknown as string },
          platformAdapter: mockAdapter,
        });
      }).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got undefined',
      );

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('throws error when analyticsId is null', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { analyticsId: null as unknown as string },
          platformAdapter: mockAdapter,
        });
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got null');

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('throws error when analyticsId is not a valid UUIDv4', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { analyticsId: 'not-a-uuid' },
          platformAdapter: mockAdapter,
        });
      }).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got "not-a-uuid"',
      );

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('throws error when analyticsId is a valid UUID but not v4', () => {
      const mockAdapter = createMockAdapter();
      // UUIDv5 example
      const uuidV5 = 'c87ee674-4ddc-5efe-bd81-0b5a0b4d45b6';

      expect(() => {
        setupController({
          state: { analyticsId: uuidV5 },
          platformAdapter: mockAdapter,
        });
      }).toThrow(
        `Invalid analyticsId: expected a valid UUIDv4, but got "${uuidV5}"`,
      );

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('continues controller initialization when onSetupCompleted throws error', () => {
      const mockAdapter = createMockAdapter();
      const error = new Error('Setup failed');
      mockAdapter.onSetupCompleted = jest.fn(() => {
        throw error;
      });

      const projectLoggerSpy = jest
        .spyOn(require('./AnalyticsLogger'), 'projectLogger')
        .mockImplementation();

      const { controller } = setupController({
        state: { analyticsId: '550e8400-e29b-41d4-a716-446655440000' },
        platformAdapter: mockAdapter,
      });

      // Controller should still be initialized
      expect(controller).toBeDefined();
      expect(controller.state.analyticsId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );

      // Error should be logged
      expect(projectLoggerSpy).toHaveBeenCalledWith(
        'Error calling platformAdapter.onSetupCompleted',
        error,
      );

      projectLoggerSpy.mockRestore();
    });

    it('calls onSetupCompleted with analyticsId', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';

      const { controller } = setupController({
        state: { analyticsId: customId },
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledWith(customId);
      expect(controller.state.analyticsId).toBe(customId);
    });
  });

  describe('trackEvent', () => {
    it('tracks event when enabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        prop: 'value',
      });
    });

    it('tracks event with default empty properties when properties not provided', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackEvent('test_event');

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {});
    });

    it('does not track event when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { enabled: false },
        platformAdapter: mockAdapter,
      });

      controller.trackEvent('test_event', { prop: 'value' });

      expect(mockAdapter.track).not.toHaveBeenCalled();
    });
  });

  describe('identify', () => {
    it('identifies user with traits using current analytics ID', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: { analyticsId: customId },
        platformAdapter: mockAdapter,
      });

      const traits = {
        ENABLE_OPENSEA_API: 'ON',
        NFT_AUTODETECTION: 'ON',
      };

      controller.identify(traits);

      expect(controller.state.analyticsId).toBe(customId);
      expect(mockAdapter.identify).toHaveBeenCalledWith(customId, traits);
    });

    it('does not identify when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { enabled: false },
        platformAdapter: mockAdapter,
      });

      const traits = {
        ENABLE_OPENSEA_API: 'ON',
        NFT_AUTODETECTION: 'ON',
      };

      controller.identify(traits);

      expect(mockAdapter.identify).not.toHaveBeenCalled();
    });
  });

  describe('trackView', () => {
    it('tracks view', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackView('home', { referrer: 'test' });

      expect(mockAdapter.view).toHaveBeenCalledWith('home', {
        referrer: 'test',
      });
    });

    it('does not track view when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { enabled: false },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home');

      expect(mockAdapter.view).not.toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('enables analytics tracking', () => {
      const { controller } = setupController({
        state: { enabled: false },
      });

      expect(controller.state.enabled).toBe(false);

      controller.enable();

      expect(controller.state.enabled).toBe(true);
    });
  });

  describe('disable', () => {
    it('disables analytics tracking', () => {
      const { controller } = setupController({
        state: { enabled: true },
      });

      expect(controller.state.enabled).toBe(true);

      controller.disable();

      expect(controller.state.enabled).toBe(false);
    });
  });

  describe('optIn', () => {
    it('opts in to analytics', () => {
      const { controller } = setupController();

      expect(controller.state.optedIn).toBe(false);

      controller.optIn();

      expect(controller.state.optedIn).toBe(true);
    });
  });

  describe('optOut', () => {
    it('opts out of analytics', () => {
      const { controller } = setupController({
        state: { optedIn: true },
      });

      expect(controller.state.optedIn).toBe(true);

      controller.optOut();

      expect(controller.state.optedIn).toBe(false);
    });
  });

  describe('getAnalyticsId', () => {
    it('returns analytics ID', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller, messenger } = setupController({
        state: { analyticsId: customId },
      });

      const analyticsId = messenger.call('AnalyticsController:getAnalyticsId');

      expect(analyticsId).toBe(customId);
      expect(analyticsId).toBe(controller.state.analyticsId);
    });
  });

  describe('isEnabled', () => {
    it('returns enabled status from state', () => {
      const { controller, messenger } = setupController({
        state: { enabled: true },
      });

      const isEnabled = messenger.call('AnalyticsController:isEnabled');

      expect(isEnabled).toBe(true);
      expect(isEnabled).toBe(controller.state.enabled);
    });

    it('returns updated value when state changes', () => {
      const { controller, messenger } = setupController({
        state: { enabled: false },
      });

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(false);

      controller.enable();

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(true);

      controller.disable();

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(false);
    });
  });

  describe('isOptedIn', () => {
    it('returns opted in status from state', () => {
      const { controller, messenger } = setupController({
        state: { optedIn: true },
      });

      const isOptedIn = messenger.call('AnalyticsController:isOptedIn');

      expect(isOptedIn).toBe(true);
      expect(isOptedIn).toBe(controller.state.optedIn);
    });

    it('returns updated value when state changes', () => {
      const { controller, messenger } = setupController({
        state: { optedIn: false },
      });

      expect(messenger.call('AnalyticsController:isOptedIn')).toBe(false);

      controller.optIn();

      expect(messenger.call('AnalyticsController:isOptedIn')).toBe(true);

      controller.optOut();

      expect(messenger.call('AnalyticsController:isOptedIn')).toBe(false);
    });
  });
});
