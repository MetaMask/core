import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
} from '@metamask/messenger';
import { validate as validateUuid, version as getUuidVersion } from 'uuid';

import {
  AnalyticsController,
  type AnalyticsControllerMessenger,
  type AnalyticsControllerActions,
  type AnalyticsControllerEvents,
  type AnalyticsPlatformAdapter,
  AnalyticsPlatformAdapterSetupError,
  type AnalyticsTrackingEvent,
  analyticsControllerSelectors,
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
  const { state, platformAdapter } = options;

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
  return validateUuid(value) && getUuidVersion(value) === 4;
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

describe('AnalyticsController', () => {
  const createMockAdapter = (): AnalyticsPlatformAdapter => ({
    track: jest.fn(),
    identify: jest.fn(),
    view: jest.fn(),
    onSetupCompleted: jest.fn(),
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = setupController();

      expect(analyticsControllerSelectors.selectEnabled(controller.state)).toBe(
        false,
      );
      expect(controller.state.optedInForRegularAccount).toBe(false);
      expect(controller.state.optedInForSocialAccount).toBe(false);
      expect(isValidUUIDv4(controller.state.analyticsId)).toBe(true);
    });

    it('generates a new analyticsId when no state is provided', () => {
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
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
          analyticsId: customId,
        },
      });

      expect(analyticsControllerSelectors.selectEnabled(controller.state)).toBe(
        true,
      );
      expect(controller.state.optedInForRegularAccount).toBe(true);
      expect(controller.state.optedInForSocialAccount).toBe(false);
      expect(controller.state.analyticsId).toBe(customId);
    });

    it('initializes with custom opt-in settings', () => {
      const { controller } = setupController({
        state: {
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
        },
      });

      expect(analyticsControllerSelectors.selectEnabled(controller.state)).toBe(
        true,
      );
      expect(controller.state.optedInForRegularAccount).toBe(true);
      expect(controller.state.optedInForSocialAccount).toBe(false);
    });
  });

  describe('onSetupCompleted lifecycle hook', () => {
    it('calls onSetupCompleted with analyticsId after initialization', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';

      const { controller } = setupController({
        state: { analyticsId: customId },
        platformAdapter: mockAdapter,
      });

      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledWith(
        controller.state.analyticsId,
      );
    });

    it('ignores errors thrown by onSetupCompleted', () => {      const mockAdapter = createMockAdapter();
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

      const { controller } = setupController({
        state: { analyticsId: '550e8400-e29b-41d4-a716-446655440000' },
        platformAdapter: mockAdapter,
      });

      expect(controller).toBeDefined();
      expect(mockAdapter.onSetupCompleted).toHaveBeenCalledTimes(1);
    });
  });

  describe('trackEvent', () => {
    it('calls platform adapter to track event when enabled via regular opt-in', () => {  
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
        },
        platformAdapter: mockAdapter,
      });

      const event = createTestEvent('test_event', { prop: 'value' });
      controller.trackEvent(event);

      expect(mockAdapter.track).toHaveBeenCalledWith('test_event', {
        prop: 'value',
      });
    });

    it('tracks event via platform adapter when enabled via social opt-in', () => {  
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedInForRegularAccount: false,
          optedInForSocialAccount: true,
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
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
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
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
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
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
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
          optedInForRegularAccount: false,
          optedInForSocialAccount: false,
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
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          analyticsId: customId,
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
        },
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

    it('identifies user without traits', () => {
      const mockAdapter = createMockAdapter();
      const customId = '550e8400-e29b-41d4-a716-446655440000';
      const { controller } = setupController({
        state: {
          analyticsId: customId,
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
        },
        platformAdapter: mockAdapter,
      });

      controller.identify();

      expect(mockAdapter.identify).toHaveBeenCalledWith(customId, undefined);
    });

    it('does not identify when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedInForRegularAccount: false,
          optedInForSocialAccount: false,
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
    it('calls platform adapter to track view when enabled via regular opt-in', () => {  
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedInForRegularAccount: true,
          optedInForSocialAccount: false,
        },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home', { referrer: 'test' });

      expect(mockAdapter.view).toHaveBeenCalledWith('home', {
        referrer: 'test',
      });
    });

    it('calls platform adapter to track view when enabled via social opt-in', () => {  
      const mockAdapter = createMockAdapter();
      const { controller } = setupController({
        state: {
          optedInForRegularAccount: false,
          optedInForSocialAccount: true,
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
          optedInForRegularAccount: false,
          optedInForSocialAccount: false,
        },
        platformAdapter: mockAdapter,
      });

      controller.trackView('home');

      expect(mockAdapter.view).not.toHaveBeenCalled();
    });
  });

  describe('optInForRegularAccount', () => {
    it('sets optedInForRegularAccount to true', () => {
      const { controller } = setupController();

      controller.optInForRegularAccount();

      expect(controller.state.optedInForRegularAccount).toBe(true);
    });
  });

  describe('optOutForRegularAccount', () => {
    it('sets optedInForRegularAccount to false', () => {
      const { controller } = setupController({
        state: { optedInForRegularAccount: true },
      });

      controller.optOutForRegularAccount();

      expect(controller.state.optedInForRegularAccount).toBe(false);
    });
  });

  describe('optInForSocialAccount', () => {
    it('sets optedInForSocialAccount to true', () => {
      const { controller } = setupController();

      controller.optInForSocialAccount();

      expect(controller.state.optedInForSocialAccount).toBe(true);
    });
  });

  describe('optOutForSocialAccount', () => {
    it('sets optedInForSocialAccount to false', () => {
      const { controller } = setupController({
        state: { optedInForSocialAccount: true },
      });

      controller.optOutForSocialAccount();

      expect(controller.state.optedInForSocialAccount).toBe(false);
    });
  });
});
