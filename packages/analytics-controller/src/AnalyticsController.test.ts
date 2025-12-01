import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
} from '@metamask/messenger';

import {
  AnalyticsController,
  getDefaultAnalyticsControllerState,
  type AnalyticsControllerMessenger,
  type AnalyticsControllerActions,
  type AnalyticsControllerEvents,
  type AnalyticsPlatformAdapter,
  AnalyticsPlatformAdapterSetupError,
  type AnalyticsTrackingEvent,
  analyticsControllerSelectors,
} from '.';
import type { AnalyticsControllerState } from '.';
import { isValidUUIDv4 } from './analyticsControllerStateValidator';

type SetupControllerOptions = {
  state: AnalyticsControllerState;
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
 * @param options.state - Controller state (analyticsId required)
 * @param options.platformAdapter - Optional platform adapter
 * @returns The controller and messenger
 */
function setupController(
  options: SetupControllerOptions,
): SetupControllerReturn {
  const { state, platformAdapter } = options;

  const adapter =
    platformAdapter ??
    ({
      track: jest.fn(),
      identify: jest.fn(),
      view: jest.fn(),
      onSetupCompleted: jest.fn().mockResolvedValue(undefined),
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

  return {
    name,
    properties: properties as AnalyticsTrackingEvent['properties'],
    sensitiveProperties:
      sensitiveProperties as AnalyticsTrackingEvent['sensitiveProperties'],
    saveDataRecording,
    hasProperties: hasProps,
  };
}

/**
 * Creates a mock platform adapter for testing.
 *
 * @returns A mock AnalyticsPlatformAdapter
 */
function createMockAdapter(): AnalyticsPlatformAdapter {
  return {
    track: jest.fn(),
    identify: jest.fn(),
    view: jest.fn(),
    onSetupCompleted: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AnalyticsController', () => {
  describe('getDefaultAnalyticsControllerState', () => {
    it('returns default opt-in preferences without analyticsId', () => {
      const defaults = getDefaultAnalyticsControllerState();

      expect(defaults).toStrictEqual({
        optedIn: false,
      });
      expect('analyticsId' in defaults).toBe(false);
    });

    it('returns the same values on each call (deterministic)', () => {
      const defaults1 = getDefaultAnalyticsControllerState();
      const defaults2 = getDefaultAnalyticsControllerState();

      expect(defaults1).toStrictEqual(defaults2);
    });
  });

  describe('isValidUUIDv4', () => {
    it('returns true for valid UUIDv4', () => {
      expect(isValidUUIDv4('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUIDv4('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
      expect(isValidUUIDv4('00000000-0000-4000-8000-000000000000')).toBe(true);
    });

    it('returns false for invalid UUIDs', () => {
      expect(isValidUUIDv4('')).toBe(false);
      // Wrong version (not 4)
      expect(isValidUUIDv4('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
      // Wrong variant (not 8/9/a/b)
      expect(isValidUUIDv4('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
      // Too short
      expect(isValidUUIDv4('550e8400-e29b-41d4-a716-44665544000')).toBe(false);
      // Invalid characters
      expect(isValidUUIDv4('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
      // Wrong format
      expect(isValidUUIDv4('not-a-uuid')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isValidUUIDv4('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(isValidUUIDv4('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });
  });

  describe('constructor', () => {
    it('initializes with provided state including analyticsId', () => {
      const analyticsId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId,
        },
      });

      expect(analyticsControllerSelectors.selectEnabled(controller.state)).toBe(
        true,
      );
      expect(controller.state.optedIn).toBe(true);
      expect(controller.state.analyticsId).toBe(analyticsId);
    });

    it('uses default opt-in values when merged with analyticsId', () => {
      const analyticsId = '6ba7b810-9dad-41d4-80b5-0c4f5a7c1e2d';
      const { controller } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
      });

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.analyticsId).toBe(analyticsId);
    });

    it('preserves provided analyticsId (does not generate new one)', () => {
      const analyticsId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      const { controller: controller1 } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
      });
      const { controller: controller2 } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
      });

      expect(controller1.state.analyticsId).toBe(analyticsId);
      expect(controller2.state.analyticsId).toBe(analyticsId);
      expect(controller1.state.analyticsId).toBe(controller2.state.analyticsId);
    });

    it('throws error when analyticsId is missing', () => {
      const adapter = createMockAdapter();

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerActions,
        AnalyticsControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsController',
        parent: rootMessenger,
      });

      expect(() => {
        new AnalyticsController({
          messenger,
          platformAdapter: adapter,
          state: {
            optedIn: false,
          } as AnalyticsControllerState,
        });
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got');
    });

    it('throws error when analyticsId is invalid format', () => {
      const adapter = createMockAdapter();

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerActions,
        AnalyticsControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsController',
        parent: rootMessenger,
      });

      expect(() => {
        new AnalyticsController({
          messenger,
          platformAdapter: adapter,
          state: {
            optedIn: false,
            analyticsId: 'not-a-valid-uuid',
          },
        });
      }).toThrow(
        'Invalid analyticsId: expected a valid UUIDv4, but got "not-a-valid-uuid"',
      );
    });

    it('throws error when analyticsId is empty string', () => {
      const adapter = createMockAdapter();

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerActions,
        AnalyticsControllerEvents,
        typeof rootMessenger
      >({
        namespace: 'AnalyticsController',
        parent: rootMessenger,
      });

      expect(() => {
        new AnalyticsController({
          messenger,
          platformAdapter: adapter,
          state: {
            optedIn: false,
            analyticsId: '',
          },
        });
      }).toThrow('Invalid analyticsId: expected a valid UUIDv4, but got ""');
    });

    it('accepts different valid UUIDv4 values', () => {
      const analyticsId1 = '11111111-1111-4111-8111-111111111111';
      const analyticsId2 = '22222222-2222-4222-9222-222222222222';

      const { controller: controller1 } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: analyticsId1,
        },
      });
      const { controller: controller2 } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: analyticsId2,
        },
      });

      expect(controller1.state.analyticsId).toBe(analyticsId1);
      expect(controller2.state.analyticsId).toBe(analyticsId2);
    });
  });

  describe('onSetupCompleted lifecycle hook', () => {
    it('calls onSetupCompleted with analyticsId after initialization', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '33333333-3333-4333-a333-333333333333';

      const { controller } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledWith(
        controller.state.analyticsId,
      );

      const mockFn = mockAdapter.onSetupCompleted as jest.MockedFunction<
        (analyticsId: string) => Promise<void>
      >;
      const promise = mockFn.mock.results[0]?.value;
      expect(await promise).toBeUndefined();
    });

    it('waits for onSetupCompleted promise to resolve', async () => {
      let resolvePromise: (() => void) | undefined;
      const promise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      const mockAdapter = createMockAdapter();
      jest.spyOn(mockAdapter, 'onSetupCompleted').mockReturnValue(promise);

      const analyticsId = '44444444-4444-4444-8444-444444444444';
      const { controller } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
        platformAdapter: mockAdapter,
      });

      expect(controller).toBeDefined();
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
      expect(controller.state.analyticsId).toBeDefined();

      if (resolvePromise) {
        resolvePromise();
      }
      await promise;
    });

    it('ignores errors thrown by onSetupCompleted', async () => {
      const mockAdapter = createMockAdapter();
      const cause = new Error(
        'MetaMetricsPrivacySegmentPlugin configure failed',
      );
      const error = new AnalyticsPlatformAdapterSetupError(
        'Failed to add privacy plugin to Segment client',
        cause,
      );
      const rejectedPromise = Promise.reject(error);
      jest
        .spyOn(mockAdapter, 'onSetupCompleted')
        .mockReturnValue(rejectedPromise);

      const analyticsId = '55555555-5555-4555-9555-555555555555';
      const { controller } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
        platformAdapter: mockAdapter,
      });

      expect(controller).toBeDefined();
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);

      await expect(rejectedPromise).rejects.toThrow(error);

      expect(controller.state.analyticsId).toBeDefined();
    });
  });

  describe('trackEvent', () => {
    it('calls platform adapter to track event when enabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId: '66666666-6666-4666-a666-666666666666',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        prop: 'value',
      });
    });

    it('tracks event without properties when event has no properties', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId: '88888888-8888-4888-8888-888888888888',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', {}, {}, true);
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event');
    });

    it('tracks sensitive event when both regular and sensitiveProperties are present', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId: '99999999-9999-4999-9999-999999999999',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent(
        'test_event',
        { prop: 'value' },
        { sensitive_prop: 'sensitive value' },
      );
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledTimes(2);
      expect(mockAdapter.track).toHaveBeenNthCalledWith(1, 'test_event', {
        prop: 'value',
      });
      expect(mockAdapter.track).toHaveBeenNthCalledWith(2, 'test_event', {
        isSensitive: true,
        prop: 'value',
        sensitive_prop: 'sensitive value',
      });
    });

    it('tracks two events when only sensitiveProperties are present: one with empty props (user ID) and one with sensitive props (anonymous ID)', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent(
        'test_event',
        {},
        { sensitive_prop: 'sensitive value' },
      );
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledTimes(2);
      expect(mockAdapter.track).toHaveBeenNthCalledWith(1, 'test_event', {});
      expect(mockAdapter.track).toHaveBeenNthCalledWith(2, 'test_event', {
        isSensitive: true,
        sensitive_prop: 'sensitive value',
      });
    });

    it('does not call platform adapter when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: false,
          analyticsId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      controller.trackEvent(event);

      expect(mockAdapter.track).not.toHaveBeenCalled();
    });
  });

  describe('identify', () => {
    it('identifies user via platform adapter with traits using current analytics ID', () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = 'cccccccc-cccc-4ccc-9ccc-cccccccccccc';
      const { controller } = setupController({
        state: {
          analyticsId,
          optedIn: true,
        },
        platformAdapter: mockAdapter,
      });

      const traits = {
        ENABLE_OPENSEA_API: 'ON',
        NFT_AUTODETECTION: 'ON',
      };

      controller.identify(traits);

      expect(controller.state.analyticsId).toBe(analyticsId);
      expect(mockAdapter.identify).toHaveBeenCalledWith(analyticsId, traits);
    });

    it('identifies user without traits', () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
      const { controller } = setupController({
        state: {
          analyticsId,
          optedIn: true,
        },
        platformAdapter: mockAdapter,
      });

      controller.identify();

      expect(mockAdapter.identify).toHaveBeenCalledWith(analyticsId, undefined);
    });

    it('does not identify when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: false,
          analyticsId: 'eeeeeeee-eeee-4eee-beee-eeeeeeeeeeee',
        },
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
    it('calls platform adapter to track view when enabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home', { referrer: 'test' });

      expect(mockAdapter.view).toHaveBeenCalledWith('home', {
        referrer: 'test',
      });
    });

    it('does not call platform adapter when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedIn: false,
          analyticsId: 'abcdef01-2345-4678-9abc-def012345678',
        },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home');

      expect(mockAdapter.view).not.toHaveBeenCalled();
    });
  });

  describe('optIn', () => {
    it('sets optedIn to true', () => {
      const { controller } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: 'fedcba98-7654-4321-8fed-cba987654321',
        },
      });

      controller.optIn();

      expect(controller.state.optedIn).toBe(true);
    });
  });

  describe('optOut', () => {
    it('sets optedIn to false', () => {
      const { controller } = setupController({
        state: {
          optedIn: true,
          analyticsId: '01234567-89ab-4cde-8f01-23456789abcd',
        },
      });

      controller.optOut();

      expect(controller.state.optedIn).toBe(false);
    });
  });

  describe('stateChange event', () => {
    it('emits stateChange event when opt-in changes', () => {
      const analyticsId = 'cafebabe-dead-4bef-8bad-cafebabebeef';
      const { controller, messenger } = setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
      });

      const listener = jest.fn();
      messenger.subscribe('AnalyticsController:stateChange', listener);

      controller.optIn();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          optedIn: true,
          analyticsId,
        }),
        expect.any(Array),
      );
    });
  });
});
