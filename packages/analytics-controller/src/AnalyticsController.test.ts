import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  GeolocationControllerGetGeolocationDataAction,
  GeolocationData,
} from '@metamask/geolocation-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

import { isValidUUIDv4 } from './analyticsControllerStateValidator.js';
import {
  AnalyticsController,
  AnalyticsPlatformAdapterSetupError,
  getDefaultAnalyticsControllerState,
  analyticsControllerSelectors,
} from './index.js';
import type {
  AnalyticsControllerMessenger,
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsPlatformAdapter,
  AnalyticsDeliveryOptions,
  AnalyticsTrackingEvent,
  AnalyticsControllerState,
  AnalyticsContext,
  AnalyticsEventFragment,
} from './index.js';

/**
 * The full set of actions the controller's messenger deals with, including the
 * geolocation action the controller calls on other messengers.
 */
type AnalyticsControllerTestActions =
  | AnalyticsControllerActions
  | GeolocationControllerGetGeolocationDataAction;

type SetupControllerOptions = {
  state: AnalyticsControllerState;
  platformAdapter?: AnalyticsPlatformAdapter;
  isAnonymousEventsFeatureEnabled?: boolean;
  isEventQueuePersistenceEnabled?: boolean;
  isPreConsentQueueEnabled?: boolean;
  isGeolocationEnabled?: boolean;
  isEventFragmentsEnabled?: boolean;
  /**
   * Geolocation returned by the mocked `GeolocationController` action.
   * Defaults to unknown geolocation so that events are not enriched.
   */
  geolocation?: Partial<GeolocationData>;
  /**
   * Handler for the mocked `GeolocationController` action. Takes precedence
   * over `geolocation`.
   */
  geolocationHandler?: () => Promise<GeolocationData>;
  /**
   * When true, the `GeolocationController` action is not registered, mimicking
   * a client that has not wired up geolocation.
   */
  omitGeolocationAction?: boolean;
};

type SetupControllerReturn = {
  controller: AnalyticsController;
  messenger: AnalyticsControllerMessenger;
};

/**
 * Builds complete geolocation data from a partial fixture.
 *
 * @param data - The known geolocation fields.
 * @returns The geolocation data with unknown fields set to null.
 */
function buildGeolocationData(
  data: Partial<GeolocationData> = {},
): GeolocationData {
  return { country: null, region: null, timezone: null, ...data };
}

type MockAnalyticsPlatformAdapter = AnalyticsPlatformAdapter & {
  track: jest.Mock;
  identify: jest.Mock;
  view: jest.Mock;
  onSetupCompleted: jest.Mock;
};

/**
 * Sets up an AnalyticsController for testing.
 *
 * @param options - Controller options
 * @param options.state - Controller state (analyticsId required)
 * @param options.platformAdapter - Optional platform adapter
 * @param options.isAnonymousEventsFeatureEnabled - Optional anonymous events feature flag (default: false)
 * @param options.isEventQueuePersistenceEnabled - Optional event queue persistence flag (default: false)
 * @param options.isPreConsentQueueEnabled - Optional pre-consent queue flag (default: false)
 * @param options.isGeolocationEnabled - Optional geolocation enrichment flag (default: true)
 * @param options.isEventFragmentsEnabled - Optional event fragments flag (default: false)
 * @param options.geolocation - Optional geolocation returned by the mocked geolocation action
 * @param options.geolocationHandler - Optional handler for the mocked geolocation action
 * @param options.omitGeolocationAction - When true, the geolocation action is not registered
 * @returns The controller and messenger
 */
async function setupController(
  options: SetupControllerOptions,
): Promise<SetupControllerReturn> {
  const {
    state,
    platformAdapter,
    isAnonymousEventsFeatureEnabled = false,
    isEventQueuePersistenceEnabled = false,
    isPreConsentQueueEnabled = false,
    isGeolocationEnabled = true,
    isEventFragmentsEnabled = false,
    geolocation,
    geolocationHandler,
    omitGeolocationAction = false,
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
    AnalyticsControllerTestActions,
    AnalyticsControllerEvents
  >({ namespace: MOCK_ANY_NAMESPACE });

  const analyticsControllerMessenger = new Messenger<
    'AnalyticsController',
    AnalyticsControllerTestActions,
    AnalyticsControllerEvents,
    typeof rootMessenger
  >({
    namespace: 'AnalyticsController',
    parent: rootMessenger,
  });

  if (!omitGeolocationAction) {
    rootMessenger.registerActionHandler(
      'GeolocationController:getGeolocationData',
      geolocationHandler ??
        ((): Promise<GeolocationData> =>
          Promise.resolve(buildGeolocationData(geolocation))),
    );
    rootMessenger.delegate({
      actions: ['GeolocationController:getGeolocationData'],
      messenger: analyticsControllerMessenger,
    });
  }

  const controller = new AnalyticsController({
    messenger: analyticsControllerMessenger,
    platformAdapter: adapter,
    state,
    isAnonymousEventsFeatureEnabled,
    isEventQueuePersistenceEnabled,
    isPreConsentQueueEnabled,
    isGeolocationEnabled,
    isEventFragmentsEnabled,
  });

  await controller.init();

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
function createMockAdapter(): MockAnalyticsPlatformAdapter {
  return {
    track: jest.fn(),
    identify: jest.fn(),
    view: jest.fn(),
    onSetupCompleted: jest.fn(),
  };
}

/**
 * Gets delivery options from a mock adapter call.
 *
 * @param mock - The mock adapter method.
 * @param callIndex - The call index.
 * @returns Delivery options from the call.
 */
function getDeliveryOptions(
  mock: jest.Mock,
  callIndex = 0,
): AnalyticsDeliveryOptions {
  return mock.mock.calls[callIndex][3] as AnalyticsDeliveryOptions;
}

describe('AnalyticsController', () => {
  describe('getDefaultAnalyticsControllerState', () => {
    it('returns default opt-in preferences without analyticsId', () => {
      const defaults = getDefaultAnalyticsControllerState();

      expect(defaults).toStrictEqual({
        optedIn: false,
        consentDecisionMade: false,
      });
      expect('analyticsId' in defaults).toBe(false);
    });

    it('returns the same values on each call (deterministic)', () => {
      const defaults1 = getDefaultAnalyticsControllerState();
      const defaults2 = getDefaultAnalyticsControllerState();

      expect(defaults1).toStrictEqual(defaults2);
    });
  });

  describe('metadata', () => {
    const metadataFixtureState: AnalyticsControllerState = {
      optedIn: true,
      consentDecisionMade: true,
      analyticsId: '6ba7b810-9dad-41d4-80b5-0c4f5a7c1e2d',
    };

    it('includes expected state in debug snapshots', async () => {
      const { controller } = await setupController({
        state: metadataFixtureState,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        {
          "analyticsId": "6ba7b810-9dad-41d4-80b5-0c4f5a7c1e2d",
          "consentDecisionMade": true,
          "optedIn": true,
        }
      `);
    });

    it('includes expected state in state logs', async () => {
      const { controller } = await setupController({
        state: metadataFixtureState,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`
        {
          "analyticsId": "6ba7b810-9dad-41d4-80b5-0c4f5a7c1e2d",
          "consentDecisionMade": true,
          "optedIn": true,
        }
      `);
    });

    it('persists expected state', async () => {
      const { controller } = await setupController({
        state: metadataFixtureState,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`
        {
          "analyticsId": "6ba7b810-9dad-41d4-80b5-0c4f5a7c1e2d",
          "consentDecisionMade": true,
          "optedIn": true,
        }
      `);
    });

    it('persists eventQueue but excludes it from logs, snapshots, and UI', async () => {
      const state: AnalyticsControllerState = {
        ...metadataFixtureState,
        eventQueue: {
          'message-id-1': {
            type: 'track',
            eventName: 'test_event',
            messageId: 'message-id-1',
            timestamp: '2026-01-01T00:00:00.000Z',
            properties: {
              sensitive_prop: 'sensitive value',
            },
          },
        },
      };
      const { controller } = await setupController({ state });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).not.toHaveProperty('eventQueue');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).not.toHaveProperty('eventQueue');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).not.toHaveProperty('eventQueue');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toHaveProperty('eventQueue', state.eventQueue);
    });

    it('persists preConsentEventQueue but excludes it from logs, snapshots, and UI', async () => {
      // Undecided + queue enabled, so init() leaves the queue untouched.
      const state: AnalyticsControllerState = {
        ...metadataFixtureState,
        optedIn: false,
        consentDecisionMade: false,
        preConsentEventQueue: {
          'message-id-1': {
            type: 'track',
            eventName: 'test_event',
            messageId: 'message-id-1',
            timestamp: '2026-01-01T00:00:00.000Z',
            properties: {
              sensitive_prop: 'sensitive value',
            },
          },
        },
      };
      const { controller } = await setupController({
        state,
        isPreConsentQueueEnabled: true,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).not.toHaveProperty('preConsentEventQueue');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).not.toHaveProperty('preConsentEventQueue');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).not.toHaveProperty('preConsentEventQueue');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toHaveProperty('preConsentEventQueue', state.preConsentEventQueue);
    });

    it('persists eventFragments but excludes them from logs, snapshots, and UI', async () => {
      const state: AnalyticsControllerState = {
        ...metadataFixtureState,
        eventFragments: {
          'signature-1': {
            id: 'signature-1',
            properties: { signature_type: 'personal_sign' },
            sensitiveProperties: { eip712_primary_type: 'Permit' },
            successEvent: 'Signature Approved',
            persist: true,
            createdAt: 1700000000000,
            lastUpdated: 1700000000000,
          },
        },
      };
      const { controller } = await setupController({
        state,
        isEventFragmentsEnabled: true,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).not.toHaveProperty('eventFragments');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).not.toHaveProperty('eventFragments');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).not.toHaveProperty('eventFragments');
      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toHaveProperty('eventFragments', state.eventFragments);
    });

    it('exposes expected state to UI', async () => {
      const { controller } = await setupController({
        state: metadataFixtureState,
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "consentDecisionMade": true,
          "optedIn": true,
        }
      `);
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
          ...getDefaultAnalyticsControllerState(),
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
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
      });
      const { controller: controller2 } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
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
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
          optedIn: true, // Enable tracking for this test
        },
        // isAnonymousEventsFeatureEnabled not provided - should default to false
      });

      await controller.init();

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
        undefined,
      );
    });

    it('throws error when analyticsId is missing', () => {
      const adapter = createMockAdapter();

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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

    it('accepts non-UUID analyticsId when adapter skipUUIDv4Check is true', async () => {
      const analyticsId = 'not-a-uuid';
      const platformAdapter = {
        ...createMockAdapter(),
        skipUUIDv4Check: true,
      };
      const { controller } = await setupController({
        state: {
          optedIn: false,
          analyticsId,
        },
        platformAdapter,
      });

      expect(controller.state.analyticsId).toBe(analyticsId);
      expect(platformAdapter.onSetupCompleted).toHaveBeenCalledWith(
        analyticsId,
      );
    });

    it('accepts different valid UUIDv4 values', async () => {
      const analyticsId1 = '11111111-1111-4111-8111-111111111111';
      const analyticsId2 = '22222222-2222-4222-9222-222222222222';

      const { controller: controller1 } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: analyticsId1,
        },
      });
      const { controller: controller2 } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
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
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      const onSetupCompletedSpy = jest.spyOn(mockAdapter, 'onSetupCompleted');
      expect(onSetupCompletedSpy).not.toHaveBeenCalled();

      await controller.init();

      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
      expect(onSetupCompletedSpy).toHaveBeenCalledWith(analyticsId);
    });

    it('only calls onSetupCompleted one time even if called multiple times', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '22222222-2222-4222-9222-222222222222';

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      const onSetupCompletedSpy = jest.spyOn(mockAdapter, 'onSetupCompleted');

      await controller.init();
      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
      expect(onSetupCompletedSpy).toHaveBeenCalledWith(analyticsId);

      // Calling init() again should not throw and should not call onSetupCompleted again
      await expect(controller.init()).toBeFulfilled();
      expect(onSetupCompletedSpy).toHaveBeenCalledTimes(1);
    });

    it('shares a single in-flight initialization across overlapping init calls', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '33333333-3333-4333-8333-333333333333';

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
      });

      // Call init() twice before the first resolves.
      const first = controller.init();
      const second = controller.init();

      // Overlapping callers share the same in-flight promise, so the second
      // caller cannot observe a premature completion.
      expect(second).toBe(first);

      await Promise.all([first, second]);
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
    });

    it('completes setup when the geolocation action is not registered', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '44444444-4444-4444-8444-444444444444';

      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
          optedIn: true,
        },
        platformAdapter: mockAdapter,
        omitGeolocationAction: true,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);

      controller.trackEvent(createTestEvent('test_event', { prop: 'value' }));

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        expect.any(Object),
        undefined,
      );
    });

    it('resolves geolocation before calling onSetupCompleted', async () => {
      const mockAdapter = createMockAdapter();
      const callOrder: string[] = [];

      mockAdapter.onSetupCompleted.mockImplementation(() => {
        callOrder.push('onSetupCompleted');
      });

      await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: '44444444-4444-4444-8444-444444444444',
          optedIn: true,
        },
        platformAdapter: mockAdapter,
        geolocationHandler: async () => {
          callOrder.push('getGeolocationData');
          return buildGeolocationData({ country: 'US' });
        },
      });

      expect(callOrder).toStrictEqual([
        'getGeolocationData',
        'onSetupCompleted',
      ]);
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
        AnalyticsControllerTestActions,
        AnalyticsControllerEvents
      >({ namespace: MOCK_ANY_NAMESPACE });

      const messenger = new Messenger<
        'AnalyticsController',
        AnalyticsControllerTestActions,
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
          ...getDefaultAnalyticsControllerState(),
          analyticsId,
        },
        isAnonymousEventsFeatureEnabled: false,
      });

      await expect(controller.init()).toBeFulfilled();

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

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        undefined,
      );
    });

    it('forwards context to the platform adapter', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '77777777-7777-4777-b777-777777777777',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      const context: AnalyticsContext = {
        page: { title: 'Unit test' },
      };

      controller.trackEvent(event, context);

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        context,
      );
    });

    it('forwards context when tracking an event without properties', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '77777777-7777-4777-9777-777777777777',
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', {}, {}, true);
      const context: AnalyticsContext = {
        page: { path: '/background-process' },
      };

      controller.trackEvent(event, context);

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        undefined,
        context,
      );
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

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        undefined,
        undefined,
      );
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
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        {
          prop: 'value',
          sensitive_prop: 'sensitive value',
          anonymous: true,
        },
        undefined,
      );
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
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        {
          sensitive_prop: 'sensitive value',
          anonymous: true,
        },
        undefined,
      );
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
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          1,
          'test_event',
          { prop: 'value' },
          undefined,
        );
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          2,
          'test_event',
          {
            prop: 'value',
            sensitive_prop: 'sensitive value',
            anonymous: true,
          },
          undefined,
        );
      });

      it('forwards context to both events when splitting sensitive events', async () => {
        const mockAdapter = createMockAdapter();
        const { controller } = await setupController({
          state: {
            optedIn: true,
            analyticsId: '11111111-1111-4111-9111-111111111111',
          },
          platformAdapter: mockAdapter,
          isAnonymousEventsFeatureEnabled: true,
        });

        const event = createTestEvent(
          'test_event',
          { prop: 'value' },
          { sensitive_prop: 'sensitive value' },
        );
        const context: AnalyticsContext = {
          app: { name: 'MetaMask' },
        };

        controller.trackEvent(event, context);

        expect(mockAdapter.track).toHaveBeenCalledTimes(2);
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          1,
          'test_event',
          { prop: 'value' },
          context,
        );
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          2,
          'test_event',
          {
            prop: 'value',
            sensitive_prop: 'sensitive value',
            anonymous: true,
          },
          context,
        );
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
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          1,
          'test_event',
          {},
          undefined,
        );
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          2,
          'test_event',
          {
            sensitive_prop: 'sensitive value',
            anonymous: true,
          },
          undefined,
        );
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
        expect(mockAdapter.track).toHaveBeenCalledWith(
          'test_event',
          { prop: 'value' },
          undefined,
        );
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
        expect(mockAdapter.track).toHaveBeenCalledWith(
          'test_event',
          { prop: 'value' },
          undefined,
        );
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
      expect(mockAdapter.identify).toHaveBeenCalledWith(
        analyticsId,
        traits,
        undefined,
      );
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

      expect(mockAdapter.identify).toHaveBeenCalledWith(
        analyticsId,
        undefined,
        undefined,
      );
    });

    it('forwards context to the platform adapter', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = 'dddddddd-dddd-4ddd-9ddd-dddddddddddd';
      const { controller } = await setupController({
        state: {
          analyticsId,
          optedIn: true,
        },
        platformAdapter: mockAdapter,
      });

      const traits = { PLAN: 'pro' };
      const context: AnalyticsContext = {
        locale: 'en',
      };

      controller.identify(traits, context);

      expect(mockAdapter.identify).toHaveBeenCalledWith(
        analyticsId,
        traits,
        context,
      );
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

      expect(mockAdapter.view).toHaveBeenCalledWith(
        'home',
        { referrer: 'test' },
        undefined,
      );
    });

    it('forwards context to the platform adapter', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: 'ffffffff-ffff-4fff-afff-ffffffffffff',
        },
        platformAdapter: mockAdapter,
      });

      const context: AnalyticsContext = {
        page: { title: 'Settings' },
      };

      controller.trackView('settings', { section: 'security' }, context);

      expect(mockAdapter.view).toHaveBeenCalledWith(
        'settings',
        { section: 'security' },
        context,
      );
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

  describe('geolocation enrichment', () => {
    const analyticsId = '99999999-9999-4999-8999-999999999999';
    const enabledState: AnalyticsControllerState = {
      optedIn: true,
      consentDecisionMade: true,
      analyticsId,
    };
    const fullGeolocation = {
      country: 'US',
      region: 'WA',
      timezone: 'America/Los_Angeles',
    };
    const fullLocationContext = {
      country_code: 'US',
      region: 'WA',
      timezone: 'America/Los_Angeles',
    };

    it('adds country, region, and timezone to the track event context', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event', { prop: 'value' }));

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        { location: fullLocationContext },
      );
    });

    it('adds location to events without properties', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'));

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        location: fullLocationContext,
      });
    });

    it('adds location to identify events', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.identify({ trait: 'value' });

      expect(mockAdapter.identify).toHaveBeenCalledWith(
        analyticsId,
        { trait: 'value' },
        { location: fullLocationContext },
      );
    });

    it('adds location to view events', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackView('home');

      expect(mockAdapter.view).toHaveBeenCalledWith('home', undefined, {
        location: fullLocationContext,
      });
    });

    it('preserves unrelated caller context', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'), {
        app: { name: 'MetaMask' },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        app: { name: 'MetaMask' },
        location: fullLocationContext,
      });
    });

    it('preserves caller location fields the controller does not resolve', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'), {
        location: { city: 'Seattle' },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        location: { city: 'Seattle', ...fullLocationContext },
      });
    });

    it('overrides caller location fields the controller resolves', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'), {
        location: { country_code: 'FR' },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        location: fullLocationContext,
      });
    });

    it('replaces a non-record caller location', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'), {
        location: 'Seattle',
      });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        location: fullLocationContext,
      });
    });

    it('omits fields the geolocation API could not determine', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: { country: 'FR' },
      });

      controller.trackEvent(createTestEvent('test_event'));

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        location: { country_code: 'FR' },
      });
    });

    it('leaves the context untouched when the geolocation is unknown', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
      });

      controller.trackEvent(createTestEvent('test_event'), {
        app: { name: 'MetaMask' },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        app: { name: 'MetaMask' },
      });
    });

    it('leaves the context untouched when the geolocation lookup fails', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocationHandler: () =>
          Promise.reject(new Error('Geolocation fetch failed: 500')),
      });

      controller.trackEvent(createTestEvent('test_event'));

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        undefined,
        undefined,
      );
    });

    it('does not resolve geolocation when geolocation enrichment is disabled', async () => {
      const geolocationHandler = jest.fn(() =>
        Promise.resolve(buildGeolocationData(fullGeolocation)),
      );
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        isGeolocationEnabled: false,
        geolocationHandler,
      });

      controller.trackEvent(createTestEvent('test_event'));

      expect(geolocationHandler).not.toHaveBeenCalled();
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        undefined,
        undefined,
      );
    });

    it('preserves caller context when geolocation enrichment is disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        isGeolocationEnabled: false,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'), {
        location: { city: 'Seattle' },
      });

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', undefined, {
        location: { city: 'Seattle' },
      });
    });

    it('omits location from the anonymous payload when the anonymous events feature is enabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        isAnonymousEventsFeatureEnabled: true,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(
        createTestEvent(
          'test_event',
          { prop: 'value' },
          { sensitive_prop: 'sensitive value' },
        ),
      );

      expect(mockAdapter.track).toHaveBeenCalledTimes(2);
      expect(mockAdapter.track).toHaveBeenNthCalledWith(
        1,
        'test_event',
        { prop: 'value' },
        { location: fullLocationContext },
      );
      expect(mockAdapter.track).toHaveBeenNthCalledWith(
        2,
        'test_event',
        {
          prop: 'value',
          sensitive_prop: 'sensitive value',
          anonymous: true,
        },
        undefined,
      );
    });

    it('adds location to the combined payload when the anonymous events feature is disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(
        createTestEvent(
          'test_event',
          { prop: 'value' },
          { sensitive_prop: 'sensitive value' },
        ),
      );

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        {
          prop: 'value',
          sensitive_prop: 'sensitive value',
          anonymous: true,
        },
        { location: fullLocationContext },
      );
    });

    it('persists location context through the event queue', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: enabledState,
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(createTestEvent('test_event'));

      const [queuedEvent] = Object.values(
        controller.state.eventQueue as Record<string, Json>,
      ) as { context?: AnalyticsContext }[];

      expect(queuedEvent.context).toStrictEqual({
        location: fullLocationContext,
      });
    });

    it('defers geolocation to opt-in, then enriches replayed pre-consent events and later events', async () => {
      const geolocationHandler = jest.fn(() =>
        Promise.resolve(buildGeolocationData(fullGeolocation)),
      );
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: false,
          analyticsId,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
        isGeolocationEnabled: true,
        geolocationHandler,
      });

      // While undecided, the event is queued and geolocation is not requested.
      controller.trackEvent(createTestEvent('preconsent_event'));
      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(geolocationHandler).not.toHaveBeenCalled();

      // optIn resolves geolocation (awaited) before replaying the queue.
      await controller.optIn();
      expect(geolocationHandler).toHaveBeenCalledTimes(1);

      // The replayed pre-consent event is enriched with the location resolved
      // on opt-in.
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'preconsent_event',
        undefined,
        { location: fullLocationContext },
        expect.any(Object),
      );

      // Events tracked after opt-in are enriched too.
      controller.trackEvent(createTestEvent('postconsent_event'));
      expect(mockAdapter.track).toHaveBeenLastCalledWith(
        'postconsent_event',
        undefined,
        { location: fullLocationContext },
      );
    });

    it('does not enrich an anonymous pre-consent payload on replay', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: false,
          analyticsId,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
        isAnonymousEventsFeatureEnabled: true,
        isGeolocationEnabled: true,
        geolocation: fullGeolocation,
      });

      controller.trackEvent(
        createTestEvent(
          'test_event',
          { prop: 'value' },
          { sensitive_prop: 'sensitive value' },
        ),
      );

      await controller.optIn();

      // The identified payload is enriched...
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        { location: fullLocationContext },
        expect.any(Object),
      );
      // ...but the anonymous payload carries no location.
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        {
          prop: 'value',
          sensitive_prop: 'sensitive value',
          anonymous: true,
        },
        undefined,
        expect.any(Object),
      );
    });

    it('does not resolve geolocation at init when the user is not opted in', async () => {
      const geolocationHandler = jest.fn(() =>
        Promise.resolve(buildGeolocationData(fullGeolocation)),
      );
      const mockAdapter = createMockAdapter();
      await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: true,
          analyticsId,
        },
        platformAdapter: mockAdapter,
        isGeolocationEnabled: true,
        geolocationHandler,
      });

      // init awaits geolocation resolution, so if it were going to request
      // location it would have by now.
      expect(geolocationHandler).not.toHaveBeenCalled();
    });

    it('does not replay pre-consent events if consent is reset while geolocation resolves', async () => {
      let resolveGeolocation: (data: GeolocationData) => void = () => undefined;
      const geolocationHandler = jest.fn(
        () =>
          new Promise<GeolocationData>((resolve) => {
            resolveGeolocation = resolve;
          }),
      );
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: false,
          analyticsId,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
        isGeolocationEnabled: true,
        geolocationHandler,
      });

      controller.trackEvent(createTestEvent('preconsent_event'));
      expect(mockAdapter.track).not.toHaveBeenCalled();

      // Opt in, but leave geolocation resolving (do not await yet).
      const optInPromise = controller.optIn();
      expect(geolocationHandler).toHaveBeenCalledTimes(1);

      // The user resets their consent decision before geolocation resolves.
      controller.resetConsentDecision();

      // Geolocation resolves and optIn finishes reconciling.
      resolveGeolocation(buildGeolocationData(fullGeolocation));
      await optInPromise;

      // The pre-consent event is not delivered — the user is undecided again —
      // and it remains queued for a later decision.
      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(
        Object.values(controller.state.preConsentEventQueue ?? {}),
      ).toHaveLength(1);
    });
  });

  describe('event queue persistence', () => {
    it('does not create eventQueue when disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000000',
        },
        platformAdapter: mockAdapter,
      });

      controller.trackEvent(createTestEvent('test_event', { prop: 'value' }));

      expect(controller.state.eventQueue).toBeUndefined();
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        undefined,
      );
      expect(mockAdapter.track.mock.calls[0]).toHaveLength(3);
    });

    it('persists track payloads until the adapter callback succeeds', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000001',
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      controller.trackEvent(createTestEvent('test_event', { prop: 'value' }));

      const deliveryOptions = getDeliveryOptions(mockAdapter.track);
      expect(deliveryOptions).toStrictEqual({
        messageId: expect.any(String),
        timestamp: expect.any(Date),
        callback: expect.any(Function),
      });
      expect(controller.state.eventQueue).toStrictEqual({
        [deliveryOptions.messageId as string]: {
          type: 'track',
          eventName: 'test_event',
          messageId: deliveryOptions.messageId,
          timestamp: deliveryOptions.timestamp?.toISOString(),
          properties: { prop: 'value' },
        },
      });

      deliveryOptions.callback?.();

      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('ignores duplicate successful delivery callbacks', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000011',
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      controller.trackEvent(createTestEvent('test_event', { prop: 'value' }));

      const deliveryOptions = getDeliveryOptions(mockAdapter.track);
      deliveryOptions.callback?.();

      expect(() => deliveryOptions.callback?.()).not.toThrow();
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('clears queued payloads when the adapter callback receives an error', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000002',
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      controller.trackEvent(createTestEvent('test_event', { prop: 'value' }));

      const deliveryOptions = getDeliveryOptions(mockAdapter.track);
      deliveryOptions.callback?.(new Error('Segment failed'));

      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('keeps queued payloads when the platform adapter throws', async () => {
      const mockAdapter = createMockAdapter();
      jest.spyOn(mockAdapter, 'track').mockImplementation(() => {
        throw new Error('Segment failed');
      });
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000003',
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      expect(() =>
        controller.trackEvent(createTestEvent('test_event', { prop: 'value' })),
      ).not.toThrow();

      const [messageId] = Object.keys(controller.state.eventQueue ?? {});

      expect(controller.state.eventQueue).toHaveProperty(messageId);
      expect(controller.state.eventQueue?.[messageId]).toMatchObject({
        type: 'track',
        eventName: 'test_event',
        properties: { prop: 'value' },
      });
    });

    it('passes mutable clones of queued payload data to the platform adapter', async () => {
      const mockAdapter = createMockAdapter();
      let adapterMutationCompleted = false;
      jest
        .spyOn(mockAdapter, 'track')
        .mockImplementation((_eventName, properties, context) => {
          (
            properties as { nested: { adapterNormalized?: boolean } }
          ).nested.adapterNormalized = true;
          (
            context as { page: { adapterNormalized?: boolean } }
          ).page.adapterNormalized = true;
          adapterMutationCompleted = true;
        });
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000012',
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });
      const context: AnalyticsContext = {
        page: { title: 'Unit test' },
      };

      controller.trackEvent(
        createTestEvent('test_event', { nested: { prop: 'value' } }),
        context,
      );

      const [messageId] = Object.keys(controller.state.eventQueue ?? {});

      expect(adapterMutationCompleted).toBe(true);
      expect(controller.state.eventQueue?.[messageId]).toMatchObject({
        type: 'track',
        eventName: 'test_event',
        properties: { nested: { prop: 'value' } },
        context: { page: { title: 'Unit test' } },
      });
      expect(controller.state.eventQueue?.[messageId]).not.toHaveProperty(
        'properties.nested.adapterNormalized',
      );
      expect(controller.state.eventQueue?.[messageId]).not.toHaveProperty(
        'context.page.adapterNormalized',
      );
    });

    it('queues both track payloads when anonymous events split sensitive properties', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000004',
        },
        platformAdapter: mockAdapter,
        isAnonymousEventsFeatureEnabled: true,
        isEventQueuePersistenceEnabled: true,
      });

      controller.trackEvent(
        createTestEvent(
          'test_event',
          { prop: 'value' },
          { sensitive_prop: 'sensitive value' },
        ),
      );

      const identifiedOptions = getDeliveryOptions(mockAdapter.track, 0);
      const anonymousOptions = getDeliveryOptions(mockAdapter.track, 1);

      expect(anonymousOptions.messageId).not.toBe(identifiedOptions.messageId);
      expect(anonymousOptions.messageId).toStrictEqual(expect.any(String));
      expect(Object.keys(controller.state.eventQueue ?? {})).toHaveLength(2);

      identifiedOptions.callback?.();

      expect(controller.state.eventQueue).not.toHaveProperty(
        identifiedOptions.messageId as string,
      );
      expect(controller.state.eventQueue).toHaveProperty(
        anonymousOptions.messageId as string,
      );

      anonymousOptions.callback?.();

      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('persists identify and view payloads until their callbacks succeed', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '10000000-0000-4000-8000-000000000005';
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId,
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      const identifyContext: AnalyticsContext = {
        app: { name: 'MetaMask' },
      };
      const viewContext: AnalyticsContext = {
        page: { title: 'Home' },
      };

      controller.identify({ trait: 'value' }, identifyContext);
      controller.trackView('home', { referrer: 'test' }, viewContext);

      const identifyOptions = getDeliveryOptions(mockAdapter.identify);
      const viewOptions = getDeliveryOptions(mockAdapter.view);

      expect(mockAdapter.identify).toHaveBeenCalledWith(
        analyticsId,
        { trait: 'value' },
        identifyContext,
        expect.objectContaining({ messageId: identifyOptions.messageId }),
      );
      expect(mockAdapter.view).toHaveBeenCalledWith(
        'home',
        { referrer: 'test' },
        viewContext,
        expect.objectContaining({ messageId: viewOptions.messageId }),
      );
      expect(controller.state.eventQueue).toMatchObject({
        [identifyOptions.messageId as string]: {
          context: identifyContext,
        },
        [viewOptions.messageId as string]: {
          context: viewContext,
        },
      });
      expect(Object.keys(controller.state.eventQueue ?? {})).toHaveLength(2);

      identifyOptions.callback?.();
      viewOptions.callback?.();

      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('queues track, identify, and view payloads without optional properties', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '10000000-0000-4000-8000-000000000010';
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId,
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      controller.trackEvent(createTestEvent('test_event'));
      controller.identify();
      controller.trackView('home');

      const trackOptions = getDeliveryOptions(mockAdapter.track);
      const identifyOptions = getDeliveryOptions(mockAdapter.identify);
      const viewOptions = getDeliveryOptions(mockAdapter.view);

      expect(controller.state.eventQueue).toStrictEqual({
        [trackOptions.messageId as string]: {
          type: 'track',
          eventName: 'test_event',
          messageId: trackOptions.messageId,
          timestamp: trackOptions.timestamp?.toISOString(),
        },
        [identifyOptions.messageId as string]: {
          type: 'identify',
          userId: analyticsId,
          messageId: identifyOptions.messageId,
          timestamp: identifyOptions.timestamp?.toISOString(),
        },
        [viewOptions.messageId as string]: {
          type: 'view',
          name: 'home',
          messageId: viewOptions.messageId,
          timestamp: viewOptions.timestamp?.toISOString(),
        },
      });
    });

    it('replays queued track, identify, and view events during init when enabled and opted in', async () => {
      const mockAdapter = createMockAdapter();
      const analyticsId = '10000000-0000-4000-8000-000000000006';
      const trackEvent = {
        type: 'track' as const,
        eventName: 'test_event',
        messageId: 'track-message-id',
        timestamp: '2026-01-01T00:00:00.000Z',
        properties: { prop: 'value' },
      };
      const identifyEvent = {
        type: 'identify' as const,
        userId: analyticsId,
        messageId: 'identify-message-id',
        timestamp: '2026-01-01T00:00:01.000Z',
        traits: { trait: 'value' },
      };
      const viewEvent = {
        type: 'view' as const,
        name: 'home',
        messageId: 'view-message-id',
        timestamp: '2026-01-01T00:00:02.000Z',
        properties: { referrer: 'test' },
      };

      await setupController({
        state: {
          optedIn: true,
          analyticsId,
          eventQueue: {
            'track-message-id': trackEvent,
            'identify-message-id': identifyEvent,
            'view-message-id': viewEvent,
          },
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      expect(mockAdapter.track).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        undefined,
        expect.objectContaining({
          messageId: 'track-message-id',
          timestamp: new Date(trackEvent.timestamp),
          callback: expect.any(Function),
        }),
      );
      expect(mockAdapter.identify).toHaveBeenCalledWith(
        analyticsId,
        { trait: 'value' },
        undefined,
        expect.objectContaining({
          messageId: 'identify-message-id',
          timestamp: new Date(identifyEvent.timestamp),
          callback: expect.any(Function),
        }),
      );
      expect(mockAdapter.view).toHaveBeenCalledWith(
        'home',
        { referrer: 'test' },
        undefined,
        expect.objectContaining({
          messageId: 'view-message-id',
          timestamp: new Date(viewEvent.timestamp),
          callback: expect.any(Function),
        }),
      );
    });

    it('does not replay queued events when queue persistence is disabled', async () => {
      const mockAdapter = createMockAdapter();

      await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000007',
          eventQueue: {
            'message-id-1': {
              type: 'track',
              eventName: 'test_event',
              messageId: 'message-id-1',
              timestamp: '2026-01-01T00:00:00.000Z',
              properties: { prop: 'value' },
            },
          },
        },
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.track).not.toHaveBeenCalled();
    });

    it('clears queued events during init when opted out', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          analyticsId: '10000000-0000-4000-8000-000000000008',
          eventQueue: {
            'message-id-1': {
              type: 'track',
              eventName: 'test_event',
              messageId: 'message-id-1',
              timestamp: '2026-01-01T00:00:00.000Z',
              properties: { prop: 'value' },
            },
          },
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('clears queued events on opt out', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000009',
          eventQueue: {
            'message-id-1': {
              type: 'track',
              eventName: 'test_event',
              messageId: 'message-id-1',
              timestamp: '2026-01-01T00:00:00.000Z',
              properties: { prop: 'value' },
            },
          },
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      controller.optOut();

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('clears queued events on opt out when queue persistence is disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000013',
          eventQueue: {
            'message-id-1': {
              type: 'track',
              eventName: 'test_event',
              messageId: 'message-id-1',
              timestamp: '2026-01-01T00:00:00.000Z',
              properties: { prop: 'value' },
            },
          },
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: false,
      });

      controller.optOut();

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('does not fail when clearing an empty event queue on opt out', async () => {
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-00000000000c',
        },
        isEventQueuePersistenceEnabled: true,
      });

      expect(() => controller.optOut()).not.toThrow();

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.eventQueue).toBeUndefined();
    });

    it('drops invalid queued events during replay', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-00000000000d',
          eventQueue: {
            nullRecord: null,
            invalidRecord: 'not-an-event',
            invalidMetadata: {
              type: 'track',
              eventName: 'test_event',
              messageId: 123,
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            unsupportedType: {
              type: 'unknown',
              messageId: 'unsupportedType',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            'message-id-1': {
              type: 'track',
              eventName: 'test_event',
              messageId: 'different-message-id',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
          } as unknown as AnalyticsControllerState['eventQueue'],
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('drops queued events with invalid payload fields during replay', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-000000000014',
          eventQueue: {
            invalidTrackName: {
              type: 'track',
              eventName: 123,
              messageId: 'invalidTrackName',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            invalidTrackProperties: {
              type: 'track',
              eventName: 'test_event',
              messageId: 'invalidTrackProperties',
              timestamp: '2026-01-01T00:00:00.000Z',
              properties: 'invalid',
            },
            invalidTrackContext: {
              type: 'track',
              eventName: 'test_event',
              messageId: 'invalidTrackContext',
              timestamp: '2026-01-01T00:00:00.000Z',
              context: 'invalid',
            },
            invalidIdentifyUserId: {
              type: 'identify',
              userId: 123,
              messageId: 'invalidIdentifyUserId',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            invalidIdentifyTraits: {
              type: 'identify',
              userId: '10000000-0000-4000-8000-000000000014',
              messageId: 'invalidIdentifyTraits',
              timestamp: '2026-01-01T00:00:00.000Z',
              traits: 'invalid',
            },
            invalidIdentifyContext: {
              type: 'identify',
              userId: '10000000-0000-4000-8000-000000000014',
              messageId: 'invalidIdentifyContext',
              timestamp: '2026-01-01T00:00:00.000Z',
              context: 'invalid',
            },
            invalidViewName: {
              type: 'view',
              name: 123,
              messageId: 'invalidViewName',
              timestamp: '2026-01-01T00:00:00.000Z',
            },
            invalidViewProperties: {
              type: 'view',
              name: 'home',
              messageId: 'invalidViewProperties',
              timestamp: '2026-01-01T00:00:00.000Z',
              properties: 'invalid',
            },
            invalidViewContext: {
              type: 'view',
              name: 'home',
              messageId: 'invalidViewContext',
              timestamp: '2026-01-01T00:00:00.000Z',
              context: 'invalid',
            },
          } as unknown as AnalyticsControllerState['eventQueue'],
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(mockAdapter.identify).not.toHaveBeenCalled();
      expect(mockAdapter.view).not.toHaveBeenCalled();
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('drops queued events with invalid timestamps during replay', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          analyticsId: '10000000-0000-4000-8000-00000000000e',
          eventQueue: {
            'message-id-1': {
              type: 'track',
              eventName: 'test_event',
              messageId: 'message-id-1',
              timestamp: 'invalid-timestamp',
            },
          },
        },
        platformAdapter: mockAdapter,
        isEventQueuePersistenceEnabled: true,
      });

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(controller.state.eventQueue).toStrictEqual({});
    });
  });

  describe('optIn', () => {
    it('sets optedIn to true and records the consent decision', async () => {
      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: 'fedcba98-7654-4321-8fed-cba987654321',
        },
      });

      await controller.optIn();

      expect(controller.state.optedIn).toBe(true);
      expect(controller.state.consentDecisionMade).toBe(true);
    });
  });

  describe('optOut', () => {
    it('sets optedIn to false and records the consent decision', async () => {
      const { controller } = await setupController({
        state: {
          optedIn: true,
          consentDecisionMade: true,
          analyticsId: '01234567-89ab-4cde-8f01-23456789abcd',
        },
      });

      controller.optOut();

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.consentDecisionMade).toBe(true);
    });
  });

  describe('pre-consent event queue', () => {
    const ANALYTICS_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

    /**
     * Sets up an undecided controller with the pre-consent queue enabled and
     * queues a single track event.
     *
     * @returns The controller, mock adapter, and the queued event name.
     */
    async function setupControllerWithQueuedEvent(): Promise<{
      controller: AnalyticsController;
      mockAdapter: MockAnalyticsPlatformAdapter;
    }> {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      controller.trackEvent(createTestEvent('queued_event', { foo: 'bar' }));

      return { controller, mockAdapter };
    }

    it('queues track events while the user is undecided', async () => {
      const { controller, mockAdapter } =
        await setupControllerWithQueuedEvent();

      expect(mockAdapter.track).not.toHaveBeenCalled();

      const entries = Object.values(
        controller.state.preConsentEventQueue ?? {},
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        type: 'track',
        eventName: 'queued_event',
        properties: { foo: 'bar' },
      });
    });

    it('does not queue events when the pre-consent queue is disabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
      });

      controller.trackEvent(createTestEvent('event', { foo: 'bar' }));

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(controller.state.preConsentEventQueue).toBeUndefined();
    });

    it('drops a stale persisted queue on init when the queue is disabled', async () => {
      // A queue persisted while the feature was enabled...
      const { controller: enabled } = await setupControllerWithQueuedEvent();
      const persistedQueue = enabled.state.preConsentEventQueue;

      // ...is dropped on init if the feature is later disabled, so it can never
      // be replayed by a future enabled instance.
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: false,
          analyticsId: ANALYTICS_ID,
          preConsentEventQueue: persistedQueue,
        },
        platformAdapter: mockAdapter,
        // isPreConsentQueueEnabled defaults to false
      });

      expect(controller.state.preConsentEventQueue).toStrictEqual({});

      await controller.optIn();

      expect(controller.state.optedIn).toBe(true);
      expect(mockAdapter.track).not.toHaveBeenCalled();
    });

    it('opting in is a no-op when the queue is enabled but empty', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      await controller.optIn();

      expect(controller.state.optedIn).toBe(true);
      expect(controller.state.consentDecisionMade).toBe(true);
      expect(mockAdapter.track).not.toHaveBeenCalled();
    });

    it('drops events once a decision is made (opted out), without queuing', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: true,
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      controller.trackEvent(createTestEvent('event', { foo: 'bar' }));

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(controller.state.preConsentEventQueue ?? {}).toStrictEqual({});
    });

    it('replays queued events on opt-in and clears the queue', async () => {
      const { controller, mockAdapter } =
        await setupControllerWithQueuedEvent();

      await controller.optIn();

      expect(controller.state.optedIn).toBe(true);
      expect(controller.state.consentDecisionMade).toBe(true);
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'queued_event',
        { foo: 'bar' },
        undefined,
        expect.objectContaining({ messageId: expect.any(String) }),
      );
    });

    it('moves replayed events into the delivery queue when persistence is enabled', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
        isEventQueuePersistenceEnabled: true,
      });

      controller.trackEvent(createTestEvent('queued_event', { foo: 'bar' }));
      // Held in the pre-consent queue, not yet in the delivery queue.
      expect(controller.state.eventQueue ?? {}).toStrictEqual({});

      await controller.optIn();

      // The pre-consent queue is drained and the event is now tracked for
      // delivery (the mock adapter never acks, so it remains in eventQueue).
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
      expect(Object.values(controller.state.eventQueue ?? {})).toHaveLength(1);
      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'queued_event',
        { foo: 'bar' },
        undefined,
        expect.objectContaining({ messageId: expect.any(String) }),
      );
    });

    it('discards queued events on opt-out without delivering them', async () => {
      const { controller, mockAdapter } =
        await setupControllerWithQueuedEvent();

      controller.optOut();

      expect(controller.state.consentDecisionMade).toBe(true);
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
      expect(controller.state.eventQueue ?? {}).toStrictEqual({});
      expect(mockAdapter.track).not.toHaveBeenCalled();
    });

    it('preserves the pre-consent queue and resets the decision on resetConsentDecision', async () => {
      const { controller, mockAdapter } =
        await setupControllerWithQueuedEvent();
      const queuedEvents = controller.state.preConsentEventQueue;

      controller.resetConsentDecision();

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.consentDecisionMade).toBe(false);
      expect(controller.state.preConsentEventQueue).toStrictEqual(queuedEvents);
      expect(mockAdapter.track).not.toHaveBeenCalled();
    });

    it('clears the delivery queue on resetConsentDecision', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          consentDecisionMade: true,
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
        isEventQueuePersistenceEnabled: true,
      });

      // Opted in: this event lands in the persisted delivery queue.
      controller.trackEvent(createTestEvent('delivery_event', { foo: 'bar' }));
      expect(Object.values(controller.state.eventQueue ?? {})).toHaveLength(1);

      controller.resetConsentDecision();

      expect(controller.state.optedIn).toBe(false);
      expect(controller.state.consentDecisionMade).toBe(false);
      expect(controller.state.eventQueue).toStrictEqual({});
    });

    it('replays a persisted queue on init when already opted in', async () => {
      // Build a persisted queue via a first, undecided controller.
      const { controller: undecided } = await setupControllerWithQueuedEvent();
      const persistedQueue = undecided.state.preConsentEventQueue;

      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: true,
          consentDecisionMade: true,
          analyticsId: ANALYTICS_ID,
          preConsentEventQueue: persistedQueue,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      // init() runs in setupController and reconciles the leftover queue.
      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'queued_event',
        { foo: 'bar' },
        undefined,
        expect.objectContaining({ messageId: expect.any(String) }),
      );
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
    });

    it('clears a persisted queue on init when already opted out', async () => {
      const { controller: undecided } = await setupControllerWithQueuedEvent();
      const persistedQueue = undecided.state.preConsentEventQueue;

      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: true,
          analyticsId: ANALYTICS_ID,
          preConsentEventQueue: persistedQueue,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      expect(mockAdapter.track).not.toHaveBeenCalled();
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
    });

    it('queues multiple events and replays them with their context preserved', async () => {
      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          ...getDefaultAnalyticsControllerState(),
          analyticsId: ANALYTICS_ID,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      controller.trackEvent(createTestEvent('first_event', { a: 1 }), {
        source: 'onboarding',
      });
      controller.trackEvent(createTestEvent('second_event', { b: 2 }));

      expect(
        Object.values(controller.state.preConsentEventQueue ?? {}),
      ).toHaveLength(2);

      await controller.optIn();

      expect(mockAdapter.track).toHaveBeenCalledTimes(2);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'first_event',
        { a: 1 },
        { source: 'onboarding' },
        expect.objectContaining({ messageId: expect.any(String) }),
      );
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'second_event',
        { b: 2 },
        undefined,
        expect.objectContaining({ messageId: expect.any(String) }),
      );
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
    });

    it('skips invalid entries when replaying the queue', async () => {
      // Start from a valid persisted entry, then add malformed entries that are
      // not valid queued events.
      const { controller: undecided } = await setupControllerWithQueuedEvent();
      const queueWithInvalid: Record<string, Json> = {
        ...undecided.state.preConsentEventQueue,
        'not-a-record': 'just a string',
        'unknown-type': {
          type: 'mystery',
          messageId: 'unknown-type',
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      };

      const mockAdapter = createMockAdapter();
      const { controller } = await setupController({
        state: {
          optedIn: false,
          consentDecisionMade: false,
          analyticsId: ANALYTICS_ID,
          preConsentEventQueue: queueWithInvalid,
        },
        platformAdapter: mockAdapter,
        isPreConsentQueueEnabled: true,
      });

      await controller.optIn();

      // Only the valid entry is replayed; every malformed entry is dropped.
      expect(mockAdapter.track).toHaveBeenCalledTimes(1);
      expect(mockAdapter.track).toHaveBeenCalledWith(
        'queued_event',
        { foo: 'bar' },
        undefined,
        expect.objectContaining({ messageId: expect.any(String) }),
      );
      expect(controller.state.preConsentEventQueue).toStrictEqual({});
    });
  });

  describe('event fragments', () => {
    const ANALYTICS_ID = '11111111-2222-4333-8444-555555555555';

    /**
     * Sets up a controller with the event fragments feature enabled and the
     * user opted in.
     *
     * @param options - Overrides for the controller setup.
     * @param options.state - Extra state merged over the opted-in defaults.
     * @param options.isEventFragmentsEnabled - Whether the feature is enabled.
     * @param options.isAnonymousEventsFeatureEnabled - Whether anonymous events are enabled.
     * @param options.isPreConsentQueueEnabled - Whether the pre-consent queue is enabled.
     * @returns The controller and its mock adapter.
     */
    async function setupFragmentController({
      state,
      isEventFragmentsEnabled = true,
      isAnonymousEventsFeatureEnabled = false,
      isPreConsentQueueEnabled = false,
    }: {
      state?: Partial<AnalyticsControllerState>;
      isEventFragmentsEnabled?: boolean;
      isAnonymousEventsFeatureEnabled?: boolean;
      isPreConsentQueueEnabled?: boolean;
    } = {}): Promise<{
      controller: AnalyticsController;
      messenger: AnalyticsControllerMessenger;
      mockAdapter: MockAnalyticsPlatformAdapter;
    }> {
      const mockAdapter = createMockAdapter();
      const { controller, messenger } = await setupController({
        state: {
          optedIn: true,
          consentDecisionMade: true,
          analyticsId: ANALYTICS_ID,
          ...state,
        },
        platformAdapter: mockAdapter,
        isEventFragmentsEnabled,
        isAnonymousEventsFeatureEnabled,
        isPreConsentQueueEnabled,
      });

      return { controller, messenger, mockAdapter };
    }

    /**
     * Builds a stored event fragment fixture.
     *
     * @param overrides - Fields to override on the fixture.
     * @returns An event fragment.
     */
    function buildFragment(
      overrides: Partial<AnalyticsEventFragment> & { id: string },
    ): AnalyticsEventFragment {
      return {
        properties: {},
        sensitiveProperties: {},
        createdAt: 1700000000000,
        lastUpdated: 1700000000000,
        ...overrides,
      };
    }

    describe('when the feature is disabled', () => {
      it('ignores every fragment method and writes nothing to state', async () => {
        const { controller, mockAdapter } = await setupFragmentController({
          isEventFragmentsEnabled: false,
        });

        expect(
          controller.createEventFragment({
            id: 'signature-1',
            initialEvent: 'Signature Requested',
          }),
        ).toBeUndefined();
        controller.upsertEventFragment('signature-1', {
          properties: { foo: 'bar' },
        });
        controller.updateEventFragment('signature-1', {
          properties: { foo: 'bar' },
        });
        controller.deleteEventFragment('signature-1');
        controller.finalizeEventFragment('signature-1');

        expect(controller.getEventFragmentById('signature-1')).toBeUndefined();
        expect(controller.state.eventFragments).toBeUndefined();
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('does not throw from updateEventFragment or finalizeEventFragment for a missing fragment', async () => {
        const { controller } = await setupFragmentController({
          isEventFragmentsEnabled: false,
        });

        expect(() => controller.updateEventFragment('missing')).not.toThrow();
        expect(() => controller.finalizeEventFragment('missing')).not.toThrow();
      });

      it('clears fragments persisted by a session that had the feature enabled', async () => {
        const { controller } = await setupFragmentController({
          isEventFragmentsEnabled: false,
          state: {
            eventFragments: {
              'signature-1': buildFragment({
                id: 'signature-1',
                persist: true,
              }),
            },
          },
        });

        expect(controller.state.eventFragments).toStrictEqual({});
      });
    });

    describe('createEventFragment', () => {
      it('stores a fragment under a generated ID', async () => {
        const { controller } = await setupFragmentController();

        const fragment = controller.createEventFragment();

        expect(fragment).toBeDefined();
        expect(isValidUUIDv4(fragment?.id as string)).toBe(true);
        expect(controller.state.eventFragments).toStrictEqual({
          [fragment?.id as string]: fragment,
        });
      });

      it('defaults the property bags and timestamps', async () => {
        const now = 1700000000000;
        jest.spyOn(Date, 'now').mockReturnValue(now);
        const { controller } = await setupFragmentController();

        const fragment = controller.createEventFragment({ id: 'bag-1' });

        expect(fragment).toStrictEqual({
          id: 'bag-1',
          properties: {},
          sensitiveProperties: {},
          createdAt: now,
          lastUpdated: now,
        });
      });

      it('stores every supplied field under the supplied ID', async () => {
        const { controller } = await setupFragmentController();

        const fragment = controller.createEventFragment({
          id: 'signature-1',
          initialEvent: 'Signature Requested',
          successEvent: 'Signature Approved',
          failureEvent: 'Signature Rejected',
          properties: { signature_type: 'personal_sign' },
          sensitiveProperties: { eip712_primary_type: 'Permit' },
          context: { referrer: { url: 'https://dapp.test' } },
          persist: true,
        });

        expect(controller.state.eventFragments?.['signature-1']).toStrictEqual({
          id: 'signature-1',
          initialEvent: 'Signature Requested',
          successEvent: 'Signature Approved',
          failureEvent: 'Signature Rejected',
          properties: { signature_type: 'personal_sign' },
          sensitiveProperties: { eip712_primary_type: 'Permit' },
          context: { referrer: { url: 'https://dapp.test' } },
          persist: true,
          createdAt: expect.any(Number),
          lastUpdated: expect.any(Number),
        });
        expect(fragment).toStrictEqual(
          controller.state.eventFragments?.['signature-1'],
        );
      });

      it('emits the initial event with the fragment properties and context', async () => {
        const { controller, mockAdapter } = await setupFragmentController();

        controller.createEventFragment({
          id: 'signature-1',
          initialEvent: 'Signature Requested',
          successEvent: 'Signature Approved',
          properties: { signature_type: 'personal_sign' },
          context: { referrer: { url: 'https://dapp.test' } },
        });

        expect(mockAdapter.track).toHaveBeenCalledTimes(1);
        expect(mockAdapter.track).toHaveBeenCalledWith(
          'Signature Requested',
          { signature_type: 'personal_sign' },
          { referrer: { url: 'https://dapp.test' } },
        );
      });

      it('emits nothing when no initial event is declared', async () => {
        const { controller, mockAdapter } = await setupFragmentController();

        controller.createEventFragment({
          id: 'transaction-ui-1',
          properties: { gas_edit_attempted: 'basic' },
        });

        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('replaces an existing fragment so a new journey inherits nothing', async () => {
        const { controller } = await setupFragmentController({
          state: {
            eventFragments: {
              'signature-1': buildFragment({
                id: 'signature-1',
                persist: true,
                properties: { stale: true },
              }),
            },
          },
        });

        controller.createEventFragment({
          id: 'signature-1',
          properties: { fresh: true },
        });

        expect(
          controller.state.eventFragments?.['signature-1']?.properties,
        ).toStrictEqual({ fresh: true });
      });
    });

    describe('upsertEventFragment', () => {
      it('creates a property bag when the fragment does not exist', async () => {
        const { controller, mockAdapter } = await setupFragmentController();

        controller.upsertEventFragment('transaction-ui-1', {
          properties: { simulation_response: 'no_changes' },
        });

        expect(
          controller.state.eventFragments?.['transaction-ui-1'],
        ).toStrictEqual({
          id: 'transaction-ui-1',
          properties: { simulation_response: 'no_changes' },
          sensitiveProperties: {},
          createdAt: expect.any(Number),
          lastUpdated: expect.any(Number),
        });
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('creates an empty bag when no payload is supplied', async () => {
        const { controller } = await setupFragmentController();

        controller.upsertEventFragment('transaction-ui-1');

        expect(
          controller.state.eventFragments?.['transaction-ui-1']?.properties,
        ).toStrictEqual({});
      });

      it('merges into an existing fragment without disturbing its event names', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({
          id: 'transaction-ui-1',
          successEvent: 'Transaction Finalized',
          properties: { simulation_response: 'no_changes' },
        });

        controller.upsertEventFragment('transaction-ui-1', {
          properties: { gas_edit_attempted: 'basic' },
          sensitiveProperties: { sending_value: '0x1' },
        });

        expect(
          controller.state.eventFragments?.['transaction-ui-1'],
        ).toStrictEqual({
          id: 'transaction-ui-1',
          successEvent: 'Transaction Finalized',
          properties: {
            simulation_response: 'no_changes',
            gas_edit_attempted: 'basic',
          },
          sensitiveProperties: { sending_value: '0x1' },
          createdAt: expect.any(Number),
          lastUpdated: expect.any(Number),
        });
      });
    });

    describe('updateEventFragment', () => {
      it('merges properties into an existing fragment', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          properties: { alert_triggered_count: 1 },
        });

        controller.updateEventFragment('signature-1', {
          properties: { alert_resolved_count: 1 },
        });

        expect(
          controller.state.eventFragments?.['signature-1']?.properties,
        ).toStrictEqual({ alert_triggered_count: 1, alert_resolved_count: 1 });
      });

      it('replaces an array property wholesale instead of merging it by index', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({
          id: 'transaction-ui-1',
          properties: { simulation_receiving_assets_petname: ['a', 'b', 'c'] },
        });

        controller.updateEventFragment('transaction-ui-1', {
          properties: { simulation_receiving_assets_petname: ['x', 'y'] },
        });

        expect(
          controller.state.eventFragments?.['transaction-ui-1']?.properties,
        ).toStrictEqual({ simulation_receiving_assets_petname: ['x', 'y'] });
      });

      it('merges context over the fragment context', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          context: { referrer: { url: 'https://dapp.test' }, keep: 'me' },
        });

        controller.updateEventFragment('signature-1', {
          context: { referrer: { url: 'https://other.test' } },
        });

        expect(
          controller.state.eventFragments?.['signature-1']?.context,
        ).toStrictEqual({
          referrer: { url: 'https://other.test' },
          keep: 'me',
        });
      });

      it('leaves the context unset when neither side has one', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({ id: 'signature-1' });

        controller.updateEventFragment('signature-1', {
          properties: { foo: 'bar' },
        });

        expect(
          controller.state.eventFragments?.['signature-1'],
        ).not.toHaveProperty('context');
      });

      it('advances lastUpdated but preserves createdAt', async () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1000);
        const { controller } = await setupFragmentController();
        controller.createEventFragment({ id: 'signature-1' });
        nowSpy.mockReturnValue(2000);

        controller.updateEventFragment('signature-1', {
          properties: { foo: 'bar' },
        });

        expect(controller.state.eventFragments?.['signature-1']).toStrictEqual(
          expect.objectContaining({ createdAt: 1000, lastUpdated: 2000 }),
        );
      });

      it('throws when the fragment does not exist', async () => {
        const { controller } = await setupFragmentController();

        expect(() => controller.updateEventFragment('missing')).toThrow(
          'Event fragment with id missing does not exist.',
        );
      });
    });

    describe('getEventFragmentById', () => {
      it('returns the stored fragment', async () => {
        const { controller } = await setupFragmentController();
        const fragment = controller.createEventFragment({ id: 'signature-1' });

        expect(controller.getEventFragmentById('signature-1')).toStrictEqual(
          fragment,
        );
      });

      it('returns undefined for an unknown ID', async () => {
        const { controller } = await setupFragmentController();

        expect(controller.getEventFragmentById('missing')).toBeUndefined();
      });
    });

    describe('deleteEventFragment', () => {
      it('removes the fragment without emitting anything', async () => {
        const { controller, mockAdapter } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          successEvent: 'Signature Approved',
        });
        mockAdapter.track.mockClear();

        controller.deleteEventFragment('signature-1');

        expect(controller.state.eventFragments).toStrictEqual({});
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('leaves state untouched for an unknown ID', async () => {
        const { controller } = await setupFragmentController();
        const stateBefore = controller.state;

        controller.deleteEventFragment('missing');

        expect(controller.state).toBe(stateBefore);
      });
    });

    describe('finalizeEventFragment', () => {
      it('emits the success event with the accumulated properties and deletes the fragment', async () => {
        const { controller, mockAdapter } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          successEvent: 'Signature Approved',
          failureEvent: 'Signature Rejected',
          properties: { signature_type: 'personal_sign' },
        });
        controller.updateEventFragment('signature-1', {
          properties: { alert_triggered_count: 1 },
        });

        controller.finalizeEventFragment('signature-1');

        expect(mockAdapter.track).toHaveBeenCalledTimes(1);
        expect(mockAdapter.track).toHaveBeenCalledWith(
          'Signature Approved',
          { signature_type: 'personal_sign', alert_triggered_count: 1 },
          undefined,
        );
        expect(controller.state.eventFragments).toStrictEqual({});
      });

      it('emits the failure event when the journey was abandoned', async () => {
        const { controller, mockAdapter } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          successEvent: 'Signature Approved',
          failureEvent: 'Signature Rejected',
        });

        controller.finalizeEventFragment('signature-1', { abandoned: true });

        expect(mockAdapter.track).toHaveBeenCalledWith(
          'Signature Rejected',
          undefined,
          undefined,
        );
      });

      it('deletes without emitting when the relevant event name is not declared', async () => {
        const { controller, mockAdapter } = await setupFragmentController();
        controller.createEventFragment({
          id: 'transaction-ui-1',
          properties: { gas_edit_attempted: 'basic' },
        });

        controller.finalizeEventFragment('transaction-ui-1');
        controller.upsertEventFragment('transaction-ui-2', {
          properties: { gas_edit_attempted: 'basic' },
        });
        controller.finalizeEventFragment('transaction-ui-2', {
          abandoned: true,
        });

        expect(mockAdapter.track).not.toHaveBeenCalled();
        expect(controller.state.eventFragments).toStrictEqual({});
      });

      it('merges the finalize context over the fragment context', async () => {
        const { controller, mockAdapter } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          successEvent: 'Signature Approved',
          context: { referrer: { url: 'https://dapp.test' }, keep: 'me' },
        });

        controller.finalizeEventFragment('signature-1', {
          context: { referrer: { url: 'https://other.test' } },
        });

        expect(mockAdapter.track).toHaveBeenCalledWith(
          'Signature Approved',
          undefined,
          { referrer: { url: 'https://other.test' }, keep: 'me' },
        );
      });

      it('sends the sensitive properties on a separate anonymous payload', async () => {
        const { controller, mockAdapter } = await setupFragmentController({
          isAnonymousEventsFeatureEnabled: true,
        });
        controller.createEventFragment({
          id: 'signature-1',
          successEvent: 'Signature Approved',
          properties: { signature_type: 'personal_sign' },
          sensitiveProperties: { eip712_primary_type: 'Permit' },
        });

        controller.finalizeEventFragment('signature-1');

        expect(mockAdapter.track).toHaveBeenCalledTimes(2);
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          1,
          'Signature Approved',
          { signature_type: 'personal_sign' },
          undefined,
        );
        expect(mockAdapter.track).toHaveBeenNthCalledWith(
          2,
          'Signature Approved',
          {
            signature_type: 'personal_sign',
            eip712_primary_type: 'Permit',
            anonymous: true,
          },
          undefined,
        );
      });

      it('throws when the fragment does not exist', async () => {
        const { controller } = await setupFragmentController();

        expect(() => controller.finalizeEventFragment('missing')).toThrow(
          'Event fragment with id missing does not exist.',
        );
      });
    });

    describe('consent gating', () => {
      it('ignores every fragment method and writes nothing when the user has opted out', async () => {
        const { controller, mockAdapter } = await setupFragmentController({
          state: { optedIn: false, consentDecisionMade: true },
        });

        expect(
          controller.createEventFragment({
            id: 'signature-1',
            initialEvent: 'Signature Requested',
            successEvent: 'Signature Approved',
            sensitiveProperties: { eip712_primary_type: 'Permit' },
          }),
        ).toBeUndefined();
        controller.upsertEventFragment('signature-1', {
          properties: { foo: 'bar' },
        });
        controller.updateEventFragment('signature-1', {
          properties: { foo: 'bar' },
        });
        controller.deleteEventFragment('signature-1');
        controller.finalizeEventFragment('signature-1');

        expect(controller.getEventFragmentById('signature-1')).toBeUndefined();
        expect(controller.state.eventFragments).toBeUndefined();
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('does not throw from updateEventFragment or finalizeEventFragment when the user has opted out', async () => {
        const { controller } = await setupFragmentController({
          state: { optedIn: false, consentDecisionMade: true },
        });

        expect(() => controller.updateEventFragment('missing')).not.toThrow();
        expect(() => controller.finalizeEventFragment('missing')).not.toThrow();
      });

      it('writes nothing while the user is undecided and the pre-consent queue is disabled', async () => {
        const { controller, mockAdapter } = await setupFragmentController({
          state: { optedIn: false, consentDecisionMade: false },
        });

        controller.createEventFragment({
          id: 'signature-1',
          initialEvent: 'Signature Requested',
          properties: { signature_type: 'personal_sign' },
        });

        expect(controller.state.eventFragments).toBeUndefined();
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('accumulates while the user is undecided when the pre-consent queue holds their events, then replays them', async () => {
        const { controller, mockAdapter } = await setupFragmentController({
          state: { optedIn: false, consentDecisionMade: false },
          isPreConsentQueueEnabled: true,
        });
        controller.createEventFragment({
          id: 'signature-1',
          initialEvent: 'Signature Requested',
        });

        expect(controller.state.eventFragments).toHaveProperty('signature-1');
        expect(mockAdapter.track).not.toHaveBeenCalled();

        await controller.optIn();

        expect(mockAdapter.track).toHaveBeenCalledWith(
          'Signature Requested',
          undefined,
          undefined,
          expect.objectContaining({ messageId: expect.any(String) }),
        );
      });

      it('accumulates again once the user opts in', async () => {
        const { controller } = await setupFragmentController({
          state: { optedIn: false, consentDecisionMade: true },
        });

        await controller.optIn();
        controller.createEventFragment({ id: 'signature-1' });

        expect(controller.state.eventFragments).toHaveProperty('signature-1');
      });

      it('drops fragments persisted before the user opted out during init', async () => {
        const { controller, mockAdapter } = await setupFragmentController({
          state: {
            optedIn: false,
            consentDecisionMade: true,
            eventFragments: {
              'signature-1': buildFragment({
                id: 'signature-1',
                persist: true,
                successEvent: 'Signature Approved',
                sensitiveProperties: { eip712_primary_type: 'Permit' },
              }),
            },
          },
        });

        expect(controller.state.eventFragments).toStrictEqual({});
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('drops persisted fragments during init while the user is undecided and the pre-consent queue is disabled', async () => {
        const { controller } = await setupFragmentController({
          state: {
            optedIn: false,
            consentDecisionMade: false,
            eventFragments: {
              'signature-1': buildFragment({
                id: 'signature-1',
                persist: true,
              }),
            },
          },
        });

        expect(controller.state.eventFragments).toStrictEqual({});
      });

      it('keeps persisted fragments during init when the pre-consent queue holds events for an undecided user', async () => {
        const persisted = buildFragment({ id: 'signature-1', persist: true });
        const { controller } = await setupFragmentController({
          state: {
            optedIn: false,
            consentDecisionMade: false,
            eventFragments: { 'signature-1': persisted },
          },
          isPreConsentQueueEnabled: true,
        });

        expect(controller.state.eventFragments).toStrictEqual({
          'signature-1': persisted,
        });
      });

      it('discards fragments on resetConsentDecision when they can no longer accumulate', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({ id: 'signature-1', persist: true });

        controller.resetConsentDecision();

        expect(controller.state.eventFragments).toStrictEqual({});
      });

      it('keeps fragments on resetConsentDecision when the pre-consent queue is enabled', async () => {
        const { controller } = await setupFragmentController({
          isPreConsentQueueEnabled: true,
        });
        const fragment = controller.createEventFragment({
          id: 'signature-1',
          persist: true,
        });

        controller.resetConsentDecision();

        expect(controller.state.eventFragments).toStrictEqual({
          'signature-1': fragment,
        });
      });
    });

    describe('init', () => {
      it('keeps fragments that opted into persistence and drops the rest', async () => {
        const persisted = buildFragment({ id: 'signature-1', persist: true });
        const { controller, mockAdapter } = await setupFragmentController({
          state: {
            eventFragments: {
              'signature-1': persisted,
              'transaction-ui-1': buildFragment({ id: 'transaction-ui-1' }),
              'transaction-ui-2': buildFragment({
                id: 'transaction-ui-2',
                persist: false,
                failureEvent: 'Transaction Rejected',
              }),
            },
          },
        });

        expect(controller.state.eventFragments).toStrictEqual({
          'signature-1': persisted,
        });
        expect(mockAdapter.track).not.toHaveBeenCalled();
      });

      it('leaves state untouched when every fragment is persistent', async () => {
        const { controller } = await setupFragmentController({
          state: {
            eventFragments: {
              'signature-1': buildFragment({
                id: 'signature-1',
                persist: true,
              }),
            },
          },
        });
        const stateBefore = controller.state;

        await controller.init();

        expect(controller.state).toBe(stateBefore);
      });

      it('leaves state untouched when there are no fragments', async () => {
        const { controller } = await setupFragmentController();

        expect(controller.state.eventFragments).toBeUndefined();
      });

      it.each([
        ['a non-object', 'not-a-fragment'],
        ['a missing id', { ...buildFragment({ id: 'x' }), id: undefined }],
        ['an id that does not match its key', buildFragment({ id: 'other' })],
        [
          'a missing createdAt',
          { ...buildFragment({ id: 'x' }), createdAt: undefined },
        ],
        [
          'a missing lastUpdated',
          { ...buildFragment({ id: 'x' }), lastUpdated: undefined },
        ],
        [
          'non-object properties',
          { ...buildFragment({ id: 'x' }), properties: 'nope' },
        ],
        [
          'non-object sensitiveProperties',
          { ...buildFragment({ id: 'x' }), sensitiveProperties: 'nope' },
        ],
        [
          'a non-string initialEvent',
          { ...buildFragment({ id: 'x' }), initialEvent: 1 },
        ],
        [
          'a non-string successEvent',
          { ...buildFragment({ id: 'x' }), successEvent: 1 },
        ],
        [
          'a non-string failureEvent',
          { ...buildFragment({ id: 'x' }), failureEvent: 1 },
        ],
        ['a non-object context', { ...buildFragment({ id: 'x' }), context: 1 }],
        [
          'a non-boolean persist',
          { ...buildFragment({ id: 'x' }), persist: 'yes' },
        ],
      ])('drops a persisted fragment with %s', async (_description, value) => {
        const { controller } = await setupFragmentController({
          state: {
            eventFragments: {
              x: value as unknown as AnalyticsEventFragment,
            },
          },
        });

        expect(controller.state.eventFragments).toStrictEqual({});
      });
    });

    describe('optOut', () => {
      it('discards in-progress fragments', async () => {
        const { controller } = await setupFragmentController();
        controller.createEventFragment({
          id: 'signature-1',
          successEvent: 'Signature Approved',
          persist: true,
        });

        controller.optOut();

        expect(controller.state.eventFragments).toStrictEqual({});
      });

      it('leaves state untouched when there is nothing to discard', async () => {
        const { controller } = await setupFragmentController();
        controller.optOut();
        const stateBefore = controller.state;

        controller.optOut();

        expect(controller.state).toBe(stateBefore);
      });
    });

    describe('messenger actions', () => {
      it('exposes the fragment lifecycle', async () => {
        const { messenger, mockAdapter } = await setupFragmentController();

        messenger.call('AnalyticsController:createEventFragment', {
          id: 'signature-1',
          successEvent: 'Signature Approved',
        });
        messenger.call('AnalyticsController:upsertEventFragment', 'bag-1', {
          properties: { foo: 'bar' },
        });
        messenger.call(
          'AnalyticsController:updateEventFragment',
          'signature-1',
          { properties: { signature_type: 'personal_sign' } },
        );

        expect(
          messenger.call(
            'AnalyticsController:getEventFragmentById',
            'signature-1',
          ),
        ).toStrictEqual(
          expect.objectContaining({
            properties: { signature_type: 'personal_sign' },
          }),
        );

        messenger.call('AnalyticsController:deleteEventFragment', 'bag-1');
        messenger.call(
          'AnalyticsController:finalizeEventFragment',
          'signature-1',
        );

        expect(mockAdapter.track).toHaveBeenCalledWith(
          'Signature Approved',
          { signature_type: 'personal_sign' },
          undefined,
        );
      });
    });
  });
});
