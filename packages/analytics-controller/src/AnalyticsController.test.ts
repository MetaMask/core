import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';

import { AnalyticsController, getDefaultAnalyticsControllerState } from '.';
import type {
  AnalyticsControllerMessenger,
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsPlatformAdapter,
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
      trackEvent: jest.fn(),
      identify: jest.fn(),
      trackPage: jest.fn(),
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
    trackEvent: jest.fn(),
    identify: jest.fn(),
    trackPage: jest.fn(),
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

  describe('trackEvent', () => {
    it('tracks event when enabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' });

      expect(mockAdapter.trackEvent).toHaveBeenCalledWith('test_event', {
        prop: 'value',
      });
    });

    it('tracks event with default empty properties when properties not provided', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackEvent('test_event');

      expect(mockAdapter.trackEvent).toHaveBeenCalledWith('test_event', {});
    });

    it('does not track event when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { enabled: false },
        platformAdapter: mockAdapter,
      });

      controller.trackEvent('test_event', { prop: 'value' });

      expect(mockAdapter.trackEvent).not.toHaveBeenCalled();
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

  describe('trackPage', () => {
    it('tracks page view', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({ platformAdapter: mockAdapter });

      controller.trackPage('home', { referrer: 'test' });

      expect(mockAdapter.trackPage).toHaveBeenCalledWith('home', {
        referrer: 'test',
      });
    });

    it('does not track page when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { enabled: false },
        platformAdapter: mockAdapter,
      });

      controller.trackPage('home');

      expect(mockAdapter.trackPage).not.toHaveBeenCalled();
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

      expect(mockAdapter.trackEvent).toHaveBeenCalled();
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

    it('handles trackPage action', () => {
      const mockAdapter = createMockAdapter();
      const { messenger } = setupController({ platformAdapter: mockAdapter });

      messenger.call('AnalyticsController:trackPage', 'home', {});

      expect(mockAdapter.trackPage).toHaveBeenCalled();
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
