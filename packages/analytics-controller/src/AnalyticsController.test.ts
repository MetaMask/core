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
  AnalyticsPlatformAdapterSetupError,
  getDefaultAnalyticsControllerState,
  type AnalyticsTrackingEvent,
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

/**
 * Creates a test analytics tracking event.
 *
 * @param name - Event name
 * @param properties - Event properties
 * @param sensitiveProperties - Sensitive properties
 * @param saveDataRecording - Whether to save data recording flag
 * @returns A test tracking event
 */
function createTestEvent(
  name: string,
  properties: Record<string, unknown> = {},
  sensitiveProperties: Record<string, unknown> = {},
  saveDataRecording = true,
): AnalyticsTrackingEvent {
  const hasProps =
    Object.keys(properties).length > 0 ||
    Object.keys(sensitiveProperties).length > 0;
  const isAnon = Object.keys(sensitiveProperties).length > 0;

  return {
    name,
    properties: properties as AnalyticsTrackingEvent['properties'],
    sensitiveProperties: sensitiveProperties as AnalyticsTrackingEvent['sensitiveProperties'],
    saveDataRecording,
    isAnonymous: isAnon,
    hasProperties: hasProps,
  };
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

      expect(controller.isEnabled()).toBe(false);
      expect(controller.state.user_optedIn).toBe(defaultState.user_optedIn);
      expect(controller.state.user_socialOptedIn).toBe(
        defaultState.user_socialOptedIn,
      );
      expect(isValidUUIDv4(controller.state.user_analyticsId)).toBe(true);
    });

    it('generates a new UUID when no state is provided (first-time initialization)', () => {
      // Create two controllers without providing state
      const { controller: controller1 } = setupController();
      const { controller: controller2 } = setupController();

      expect(isValidUUIDv4(controller1.state.user_analyticsId)).toBe(true);
      expect(isValidUUIDv4(controller2.state.user_analyticsId)).toBe(true);
      expect(controller1.state.user_analyticsId).not.toBe(
        controller2.state.user_analyticsId,
      );
    });

    it('initializes with provided state', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          user_optedIn: true,
          user_socialOptedIn: false,
          user_analyticsId: customId,
        },
      });

      expect(controller.isEnabled()).toBe(true);
      expect(controller.state.user_optedIn).toBe(true);
      expect(controller.state.user_socialOptedIn).toBe(false);
      expect(controller.state.user_analyticsId).toBe(customId);
    });

    it('restores analyticsId from persisted state', () => {
      // First, create a controller (generates UUID)
      const { controller: firstController } = setupController();
      const originalAnalyticsId = firstController.state.user_analyticsId;

      expect(isValidUUIDv4(originalAnalyticsId)).toBe(true);

      // Simulate restoration: create a new controller with the previous state
      const { controller: restoredController } = setupController({
        state: {
          user_optedIn: firstController.state.user_optedIn,
          user_socialOptedIn: firstController.state.user_socialOptedIn,
          user_analyticsId: firstController.state.user_analyticsId,
        },
      });

      // The restored controller should have the same state as the original controller
      expect(restoredController.state.user_analyticsId).toBe(originalAnalyticsId);
      expect(restoredController.isEnabled()).toBe(firstController.isEnabled());
      expect(restoredController.state.user_optedIn).toBe(
        firstController.state.user_optedIn,
      );
    });

    it('initializes with custom optedIn', () => {
      const { controller } = setupController({
        state: {
          user_optedIn: true,
          user_socialOptedIn: false,
        },
      });

      expect(controller.isEnabled()).toBe(true);
      expect(controller.state.user_optedIn).toBe(true);
      expect(controller.state.user_socialOptedIn).toBe(false);
    });

    it('uses default analyticsId when not provided in partial state', () => {
      const { controller } = setupController({
        state: {
          user_optedIn: true,
          user_socialOptedIn: false,
        },
      });

      expect(isValidUUIDv4(controller.state.user_analyticsId)).toBe(true);
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
      expect(controller.isEnabled()).toBe(false);
      expect(controller.state.user_optedIn).toBe(defaultState.user_optedIn);
      expect(controller.state.user_socialOptedIn).toBe(
        defaultState.user_socialOptedIn,
      );
      // analyticsId is auto-generated (UUIDv4)
      expect(typeof controller.state.user_analyticsId).toBe('string');
      expect(isValidUUIDv4(controller.state.user_analyticsId)).toBe(true);
    });
  });

  describe('onSetupCompleted lifecycle hook', () => {
    it('calls onSetupCompleted after initialization when analyticsId is set', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';

      setupController({
        state: { user_analyticsId: customId },
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
        controller.state.user_analyticsId,
      );
      expect(isValidUUIDv4(controller.state.user_analyticsId)).toBe(true);
    });

    it('throws error when analyticsId is empty string', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { user_analyticsId: '' },
          platformAdapter: mockAdapter,
        });
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got ""');

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('throws error when analyticsId is undefined', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { user_analyticsId: undefined as unknown as string },
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
          state: { user_analyticsId: null as unknown as string },
          platformAdapter: mockAdapter,
        });
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got null');

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('throws error when analyticsId is not a valid UUIDv4', () => {
      const mockAdapter = createMockAdapter();

      expect(() => {
        setupController({
          state: { user_analyticsId: 'not-a-uuid' },
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
          state: { user_analyticsId: uuidV5 },
          platformAdapter: mockAdapter,
        });
      }).toThrow(
        `Invalid analyticsId: expected a valid UUIDv4, but got "${uuidV5}"`,
      );

      expect(mockAdapter.onSetupCompleted).not.toHaveBeenCalled();
    });

    it('continues controller initialization when onSetupCompleted throws error', () => {
      const mockAdapter = createMockAdapter();
      // Simulate a fake Segment SDK plugin configuration error
      const cause = new Error(
        'MetaMetricsPrivacySegmentPlugin configure failed',
      );
      const error = new AnalyticsPlatformAdapterSetupError(
        'Failed to add privacy plugin to Segment client',
        cause,
      );
      jest.spyOn(mockAdapter, 'onSetupCompleted').mockImplementation(() => {
        throw error;
      });

      // Controller should initialize successfully despite the error
      const { controller } = setupController({
        state: { user_analyticsId: '550e8400-e29b-41d4-a716-446655440000' },
        platformAdapter: mockAdapter,
      });

      // Controller should still be initialized with correct state
      expect(controller).toBeDefined();
      expect(controller.state.user_analyticsId).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
      expect(controller.isEnabled()).toBe(false);
      expect(controller.state.user_optedIn).toBe(false);
      expect(controller.state.user_socialOptedIn).toBe(false);
    });

    it('calls onSetupCompleted with analyticsId', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';

      const { controller } = setupController({
        state: { user_analyticsId: customId },
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledWith(customId);
      expect(controller.state.user_analyticsId).toBe(customId);
    });
  });

  describe('trackEvent', () => {
    it('tracks event when enabled via regular opt-in', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        anonymous: false,
        prop: 'value',
      });
    });

    it('tracks event when enabled via social opt-in', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: true },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        anonymous: false,
        prop: 'value',
      });
    });

    it('tracks event with no properties when hasProperties is false', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', {}, {}, true);
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        anonymous: false,
      });
    });

    it('tracks anonymous event when isAnonymous is true', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent(
        'test_event',
        { prop: 'value' },
        { sensitive: 'data' },
      );
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledTimes(2);
      expect(mockAdapter.track).toHaveBeenNthCalledWith(1, 'test_event', {
        anonymous: false,
        prop: 'value',
      });
      expect(mockAdapter.track).toHaveBeenNthCalledWith(2, 'test_event', {
        anonymous: true,
        prop: 'value',
        sensitive: 'data',
      });
    });

    it('does not track event when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: false },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      controller.trackEvent(event);

      expect(mockAdapter.track).not.toHaveBeenCalled();
    });
  });

  describe('identify', () => {
    it('identifies user with traits using current analytics ID', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          user_analyticsId: customId,
          user_optedIn: true,
          user_socialOptedIn: false,
        },
        platformAdapter: mockAdapter,
      });

      const traits = {
        ENABLE_OPENSEA_API: 'ON',
        NFT_AUTODETECTION: 'ON',
      };

      controller.identify(traits);

      expect(controller.state.user_analyticsId).toBe(customId);
      expect(mockAdapter.identify).toHaveBeenCalledWith(customId, traits);
    });

    it('does not identify when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: false },
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
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home', { referrer: 'test' });

      expect(mockAdapter.view).toHaveBeenCalledWith('home', {
        referrer: 'test',
      });
    });

    it('does not track view when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: false },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home');

      expect(mockAdapter.view).not.toHaveBeenCalled();
    });
  });

  describe('optIn', () => {
    it('opts in to analytics and enables tracking', () => {
      const { controller } = setupController();

      expect(controller.state.user_optedIn).toBe(false);
      expect(controller.isEnabled()).toBe(false);

      controller.optIn();

      expect(controller.state.user_optedIn).toBe(true);
      expect(controller.isEnabled()).toBe(true);
    });
  });

  describe('optOut', () => {
    it('opts out of analytics and disables tracking when social opt-in is false', () => {
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
      });

      expect(controller.state.user_optedIn).toBe(true);
      expect(controller.isEnabled()).toBe(true);

      controller.optOut();

      expect(controller.state.user_optedIn).toBe(false);
      expect(controller.isEnabled()).toBe(false);
    });

    it('opts out of analytics but keeps tracking enabled when social opt-in is true', () => {
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: true },
      });

      expect(controller.state.user_optedIn).toBe(true);
      expect(controller.isEnabled()).toBe(true);

      controller.optOut();

      expect(controller.state.user_optedIn).toBe(false);
      expect(controller.isEnabled()).toBe(true);
    });
  });

  describe('socialOptIn', () => {
    it('opts in to analytics through social account and enables tracking', () => {
      const { controller } = setupController();

      expect(controller.state.user_socialOptedIn).toBe(false);
      expect(controller.isEnabled()).toBe(false);

      controller.socialOptIn();

      expect(controller.state.user_socialOptedIn).toBe(true);
      expect(controller.isEnabled()).toBe(true);
    });
  });

  describe('socialOptOut', () => {
    it('opts out of analytics through social account and disables tracking when regular opt-in is false', () => {
      const { controller } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: true },
      });

      expect(controller.state.user_socialOptedIn).toBe(true);
      expect(controller.isEnabled()).toBe(true);

      controller.socialOptOut();

      expect(controller.state.user_socialOptedIn).toBe(false);
      expect(controller.isEnabled()).toBe(false);
    });

    it('opts out of analytics through social account but keeps tracking enabled when regular opt-in is true', () => {
      const { controller } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: true },
      });

      expect(controller.state.user_socialOptedIn).toBe(true);
      expect(controller.isEnabled()).toBe(true);

      controller.socialOptOut();

      expect(controller.state.user_socialOptedIn).toBe(false);
      expect(controller.isEnabled()).toBe(true);
    });
  });

  describe('getAnalyticsId', () => {
    it('returns analytics ID', () => {
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller, messenger } = setupController({
        state: { user_analyticsId: customId },
      });

      const analyticsId = messenger.call('AnalyticsController:getAnalyticsId');

      expect(analyticsId).toBe(customId);
      expect(analyticsId).toBe(controller.state.user_analyticsId);
    });
  });

  describe('isEnabled', () => {
    it('returns enabled status computed from user state', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
      });

      const isEnabled = messenger.call('AnalyticsController:isEnabled');

      expect(isEnabled).toBe(true);
      expect(isEnabled).toBe(controller.isEnabled());
    });

    it('returns true when only social opt-in is true', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: true },
      });

      const isEnabled = messenger.call('AnalyticsController:isEnabled');

      expect(isEnabled).toBe(true);
      expect(isEnabled).toBe(controller.isEnabled());
    });

    it('returns updated value when user state changes', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: false },
      });

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(false);

      controller.optIn();

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(true);

      controller.optOut();

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(false);

      controller.socialOptIn();

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(true);

      controller.socialOptOut();

      expect(messenger.call('AnalyticsController:isEnabled')).toBe(false);
    });
  });

  describe('isOptedIn', () => {
    it('returns opted in status from state', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: true, user_socialOptedIn: false },
      });

      const isOptedIn = messenger.call('AnalyticsController:isOptedIn');

      expect(isOptedIn).toBe(true);
      expect(isOptedIn).toBe(controller.state.user_optedIn);
    });

    it('returns updated value when state changes', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: false },
      });

      expect(messenger.call('AnalyticsController:isOptedIn')).toBe(false);

      controller.optIn();

      expect(messenger.call('AnalyticsController:isOptedIn')).toBe(true);

      controller.optOut();

      expect(messenger.call('AnalyticsController:isOptedIn')).toBe(false);
    });
  });

  describe('isSocialOptedIn', () => {
    it('returns social opted in status from state', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: true },
      });

      const isSocialOptedIn = messenger.call(
        'AnalyticsController:isSocialOptedIn',
      );

      expect(isSocialOptedIn).toBe(true);
      expect(isSocialOptedIn).toBe(controller.state.user_socialOptedIn);
    });

    it('returns updated value when state changes', () => {
      const { controller, messenger } = setupController({
        state: { user_optedIn: false, user_socialOptedIn: false },
      });

      expect(messenger.call('AnalyticsController:isSocialOptedIn')).toBe(
        false,
      );

      controller.socialOptIn();

      expect(messenger.call('AnalyticsController:isSocialOptedIn')).toBe(true);

      controller.socialOptOut();

      expect(messenger.call('AnalyticsController:isSocialOptedIn')).toBe(
        false,
      );
    });
  });
});
