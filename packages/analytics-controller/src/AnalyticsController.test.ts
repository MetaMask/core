import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import {
  AnalyticsController,
  AnalyticsPlatformAdapterSetupError,
  analyticsControllerSelectors,
} from '.';
import type {
  AnalyticsControllerMessenger,
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsPlatformAdapter,
  AnalyticsTrackingEvent,
  AnalyticsControllerState,
} from '.';
import { isValidUUIDv4 } from './analyticsControllerStateValidator';

type SetupControllerOptions = {
  state: Partial<AnalyticsControllerState> & { analyticsId: string };
  platformAdapter?: AnalyticsPlatformAdapter;
  isAnonymousEventsFeatureEnabled?: boolean;
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
 * @param options.isAnonymousEventsFeatureEnabled - Optional anonymous events feature flag (default: false)
 * @returns The controller and messenger
 */
async function setupController(
  options: SetupControllerOptions,
): Promise<SetupControllerReturn> {
  const {
    state,
    platformAdapter,
    isAnonymousEventsFeatureEnabled = false,
  } = options;

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
    isAnonymousEventsFeatureEnabled,
  });

  controller.init();

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
    onSetupCompleted: jest.fn(),
  };
}

describe('AnalyticsController', () => {
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
    it('initializes with provided state including analyticsId', async () => {
      const analyticsId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = await setupController({
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

    it('uses default opt-in values when merged with analyticsId', async () => {
      const analyticsId = '6ba7b810-9dad-41d4-80b5-0c4f5a7c1e2d';
      const { controller } = await setupController({
        state: {
          analyticsId,
        },
      });

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.analyticsId).toBe(analyticsId);
    });

    it('preserves provided analyticsId (does not generate new one)', async () => {
      const analyticsId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
      const { controller: controller1 } = await setupController({
        state: {
          analyticsId,
        },
      });
      const { controller: controller2 } = await setupController({
        state: {
          analyticsId,
        },
      });

      expect(controller1.state.analyticsId).toBe(analyticsId);
      expect(controller2.state.analyticsId).toBe(analyticsId);
      expect(controller1.state.analyticsId).toBe(controller2.state.analyticsId);
    });

    it('uses default isAnonymousEventsFeatureEnabled value when not provided', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '11111111-1111-4111-8111-111111111111';

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

      // Create controller without isAnonymousEventsFeatureEnabled to test default value
      const controller = new AnalyticsController({
        messenger,
        platformAdapter: mockAdapter,
        state: {
          analyticsId,
          optedIn: true, // Enable tracking for this test
        },
        // isAnonymousEventsFeatureEnabled not provided - should default to false
      });

      controller.init();

      // Verify default behavior: single event tracked (not split)
      const event = createTestEvent(
        'test_event',
        { prop: 'value' },
        { sensitive_prop: 'sensitive value' },
      );
      controller.trackEvent(event);

      // With default (false), should track single combined event
      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        expect.objectContaining({
          prop: 'value',
          sensitive_prop: 'sensitive value',
          anonymous: true,
        }),
      );
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
        // eslint-disable-next-line no-new
        new AnalyticsController({
          messenger,
          platformAdapter: adapter,
          state: {
            optedIn: false,
          } as AnalyticsControllerState,
          isAnonymousEventsFeatureEnabled: false,
        });
      }).toThrow('Invalid analyticsId');
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
        // eslint-disable-next-line no-new
        new AnalyticsController({
          messenger,
          platformAdapter: adapter,
          state: {
            optedIn: false,
            analyticsId: 'not-a-valid-uuid',
          },
          isAnonymousEventsFeatureEnabled: false,
        });
      }).toThrow('Invalid analyticsId');
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
        // eslint-disable-next-line no-new
        new AnalyticsController({
          messenger,
          platformAdapter: adapter,
          state: {
            optedIn: false,
            analyticsId: '',
          },
          isAnonymousEventsFeatureEnabled: false,
        });
      }).toThrow('Invalid analyticsId');
    });

    it('accepts different valid UUIDv4 values', async () => {
      const analyticsId1 = '11111111-1111-4111-8111-111111111111';
      const analyticsId2 = '22222222-2222-4222-9222-222222222222';

      const { controller: controller1 } = await setupController({
        state: {
          analyticsId: analyticsId1,
        },
      });
      const { controller: controller2 } = await setupController({
        state: {
          analyticsId: analyticsId2,
        },
      });

      expect(controller1.state.analyticsId).toBe(analyticsId1);
      expect(controller2.state.analyticsId).toBe(analyticsId2);
    });
  });

  describe('init', () => {
    it('calls onSetupCompleted lifecycle hook', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '11111111-1111-4111-8111-111111111111';

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

      const controller = new AnalyticsController({
        messenger,
        platformAdapter: mockAdapter,
        state: {
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      const onSetupCompletedSpy = jest.spyOn(mockAdapter, 'onSetupCompleted');
      expect(onSetupCompletedSpy).not.toHaveBeenCalled();

      controller.init();

      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
      expect(onSetupCompletedSpy).toHaveBeenCalledWith(analyticsId);
    });

    it('only calls onSetupCompleted one time even if called multiple times', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '22222222-2222-4222-9222-222222222222';

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

      const controller = new AnalyticsController({
        messenger,
        platformAdapter: mockAdapter,
        state: {
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      const onSetupCompletedSpy = jest.spyOn(mockAdapter, 'onSetupCompleted');

      controller.init();
      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
      expect(onSetupCompletedSpy).toHaveBeenCalledWith(analyticsId);

      // Calling init() again should not throw and should not call onSetupCompleted again
      expect(() => controller.init()).not.toThrow();
      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
    });

    it('calls onSetupCompleted synchronously', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '44444444-4444-4444-8444-444444444444';

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

      const controller = new AnalyticsController({
        messenger,
        platformAdapter: mockAdapter,
        state: {
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      const onSetupCompletedSpy = jest.spyOn(mockAdapter, 'onSetupCompleted');
      expect(onSetupCompletedSpy).not.toHaveBeenCalled();

      controller.init();

      // Verify onSetupCompleted was called synchronously
      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
      expect(controller).toBeDefined();
      expect(controller.state.analyticsId).toBeDefined();
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
      jest.spyOn(mockAdapter, 'onSetupCompleted').mockImplementation(() => {
        throw error;
      });

      const analyticsId = '55555555-5555-4555-9555-555555555555';

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

      const controller = new AnalyticsController({
        messenger,
        platformAdapter: mockAdapter,
        state: {
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      expect(() => controller.init()).not.toThrow();

      expect(controller).toBeDefined();
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
      expect(controller.state.analyticsId).toBeDefined();
    });
  });

  describe('trackEvent', () => {
    it('calls platform adapter to track event when enabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
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

    it('tracks event without properties when event has no properties', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
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

    it('tracks single combined event when isAnonymousEventsFeatureEnabled is disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '99999999-9999-4999-9999-999999999999',
        },
        platformAdapter: mockAdapter,
        isAnonymousEventsFeatureEnabled: false,
      });

      const event = createTestEvent(
        'test_event',
        { prop: 'value' },
        { sensitive_prop: 'sensitive value' },
      );
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        prop: 'value',
        sensitive_prop: 'sensitive value',
        anonymous: true,
      });
    });

    it('tracks single combined event when isAnonymousEventsFeatureEnabled is disabled and only sensitiveProperties are present', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        },
        platformAdapter: mockAdapter,
        isAnonymousEventsFeatureEnabled: false,
      });

      const event = createTestEvent(
        'test_event',
        {},
        { sensitive_prop: 'sensitive value' },
      );
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        sensitive_prop: 'sensitive value',
        anonymous: true,
      });
    });

    it('does not call platform adapter when disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
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

    describe('isAnonymousEventsFeatureEnabled enabled', () => {
      it('tracks regular properties first, then combined event when both regular and sensitive properties are present', async () => {
        const mockAdapter = createMockAdapter();
        const { controller } = await setupController({
          state: {
            optedIn: true,
            analyticsId: '11111111-1111-4111-8111-111111111111',
          },
          platformAdapter: mockAdapter,
          isAnonymousEventsFeatureEnabled: true,
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
          prop: 'value',
          sensitive_prop: 'sensitive value',
          anonymous: true,
        });
      });

      it('tracks regular properties first, then combined event when only sensitive properties are present', async () => {
        const mockAdapter = createMockAdapter();
        const { controller } = await setupController({
          state: {
            optedIn: true,
            analyticsId: '22222222-2222-4222-9222-222222222222',
          },
          platformAdapter: mockAdapter,
          isAnonymousEventsFeatureEnabled: true,
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
          sensitive_prop: 'sensitive value',
          anonymous: true,
        });
      });

      it('tracks only regular properties when no sensitive properties are present', async () => {
        const mockAdapter = createMockAdapter();
        const { controller } = await setupController({
          state: {
            optedIn: true,
            analyticsId: '33333333-3333-4333-a333-333333333333',
          },
          platformAdapter: mockAdapter,
          isAnonymousEventsFeatureEnabled: true,
        });

        const event = createTestEvent('test_event', { prop: 'value' });
        controller.trackEvent(event);

        expect(mockAdapter.track).toHaveBeenCalledTimes(1);
        expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
          prop: 'value',
        });
      });

      it('tracks only regular properties when empty sensitive properties are present', async () => {
        const mockAdapter = createMockAdapter();
        const { controller } = await setupController({
          state: {
            optedIn: true,
            analyticsId: '44444444-4444-4444-8444-444444444444',
          },
          platformAdapter: mockAdapter,
          isAnonymousEventsFeatureEnabled: true,
        });

        const event = createTestEvent('test_event', { prop: 'value' }, {});
        controller.trackEvent(event);

        expect(mockAdapter.track).toHaveBeenCalledTimes(1);
        expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
          prop: 'value',
        });
      });
    });
  });

  describe('identify', () => {
    it('identifies user via platform adapter with traits using current analytics ID', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = 'cccccccc-cccc-4ccc-9ccc-cccccccccccc';
      const { controller } = await setupController({
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

    it('identifies user without traits', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
      const { controller } = await setupController({
        state: {
          analyticsId,
          optedIn: true,
        },
        platformAdapter: mockAdapter,
      });

      controller.identify();

      expect(mockAdapter.identify).toHaveBeenCalledWith(analyticsId, undefined);
    });

    it('does not identify when disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
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
    it('calls platform adapter to track view when enabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
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

    it('does not call platform adapter when disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
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
    it('sets optedIn to true', async () => {
      const { controller } = await setupController({
        state: {
          analyticsId: 'fedcba98-7654-4321-8fed-cba987654321',
        },
      });

      controller.optIn();

      expect(controller.state.optedIn).toBe(true);
    });
  });

  describe('optOut', () => {
    it('sets optedIn to false', async () => {
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '01234567-89ab-4cde-8f01-23456789abcd',
        },
      });

      controller.optOut();

      expect(controller.state.optedIn).toBe(false);
    });
  });
});
