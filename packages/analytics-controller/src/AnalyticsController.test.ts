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

    it('preserves provided analyticsId and does not auto-generate', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          analyticsId: customId,
        },
      });

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

    it('uses provided analyticsId when passed in state at initialization', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          analyticsId: customId,
        },
      });

      expect(controller.state.analyticsId).toBe(customId);
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
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got undefined');

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
      // UUIDv1 example
      const uuidV1 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

      expect(() => {
        setupController({
          state: { analyticsId: uuidV1 },
          platformAdapter: mockAdapter,
        });
      }).toThrow(
        `Invalid analyticsId: expected a valid UUIDv4, but got "${uuidV1}"`,
      );

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('handles errors in onSetupCompleted without breaking controller initialization', () => {
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

    it('calls onSetupCompleted with the correct analyticsId from state', () => {
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
    it('identifies user and updates state', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.identify('user-123', { email: 'test@example.com' });

      expect(controller.state.analyticsId).toBe('user-123');
      expect(mockAdapter.identify).toHaveBeenCalledWith('user-123', {
        email: 'test@example.com',
      });
    });

    it('does not identify when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { enabled: false },
        platformAdapter: mockAdapter,
      });

      controller.identify('user-123');

      expect(mockAdapter.identify).not.toHaveBeenCalled();
    });
  });

  describe('trackView', () => {
    it('tracks page view', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackView('home', { referrer: 'test' });

      expect(mockAdapter.view).toHaveBeenCalledWith('home', {
        referrer: 'test',
      });
    });

    it('does not track page when disabled', () => {
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

  describe('messenger actions', () => {
    it('handles trackEvent action', () => {
      const mockAdapter = createMockAdapter();
      const { messenger } = setupController({
        platformAdapter: mockAdapter,
      });

      messenger.call('AnalyticsController:trackEvent', 'test_event', {
        prop: 'value',
      });

      expect(mockAdapter.track).toHaveBeenCalled();
    });

    it('handles identify action', () => {
      const mockAdapter = createMockAdapter();
      const { controller, messenger } = setupController({
        platformAdapter: mockAdapter,
      });

      messenger.call('AnalyticsController:identify', 'user-123', {
        email: 'test',
      });

      expect(mockAdapter.identify).toHaveBeenCalled();
      expect(controller.state.analyticsId).toBe('user-123');
    });

    it('handles trackView action', () => {
      const mockAdapter = createMockAdapter();
      const { messenger } = setupController({ platformAdapter: mockAdapter });

      messenger.call('AnalyticsController:trackView', 'home', {});

      expect(mockAdapter.view).toHaveBeenCalled();
    });

    it('handles enable action', () => {
      const { controller, messenger } = setupController({
        state: { enabled: false },
      });

      expect(controller.state.enabled).toBe(false);

      messenger.call('AnalyticsController:enable');

      expect(controller.state.enabled).toBe(true);
    });

    it('handles disable action', () => {
      const { controller, messenger } = setupController({
        state: { enabled: true },
      });

      expect(controller.state.enabled).toBe(true);

      messenger.call('AnalyticsController:disable');

      expect(controller.state.enabled).toBe(false);
    });

    it('handles optIn action', () => {
      const { controller, messenger } = setupController();

      expect(controller.state.optedIn).toBe(false);

      messenger.call('AnalyticsController:optIn');

      expect(controller.state.optedIn).toBe(true);
    });

    it('handles optOut action', () => {
      const { controller, messenger } = setupController({
        state: { optedIn: true },
      });

      expect(controller.state.optedIn).toBe(true);

      messenger.call('AnalyticsController:optOut');

      expect(controller.state.optedIn).toBe(false);
    });
  });
});
