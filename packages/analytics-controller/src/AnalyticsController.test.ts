import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
} from '@metamask/messenger';

import {
  AnalyticsController,
  type AnalyticsControllerMessenger,
  type AnalyticsControllerActions,
  type AnalyticsControllerEvents,
  type PlatformAdapter,
  getDefaultAnalyticsControllerState,
} from '.';

describe('AnalyticsController', () => {
  const createMockAdapter = (): PlatformAdapter => ({
    platform: 'MOBILE',
    trackEvent: jest.fn(),
    identify: jest.fn(),
    trackPage: jest.fn(),
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = withController();

      const defaultState = getDefaultAnalyticsControllerState();
      const state = controller.state;

      expect(state.enabled).toBe(true);
      expect(state.optedIn).toBe(false);
      expect(state.platform).toBe('MOBILE');
      expect(state.analyticsId).toBe(null);
      expect(state.eventsTracked).toBe(0);
    });

    it('initializes with provided state', () => {
      const { controller } = withController({
        state: {
          enabled: false,
          optedIn: true,
          analyticsId: 'test-id',
        },
      });

      expect(controller.state.enabled).toBe(false);
      expect(controller.state.optedIn).toBe(true);
      expect(controller.state.analyticsId).toBe('test-id');
    });

    it('initializes with custom enabled/optedIn', () => {
      const { controller } = withController({
        enabled: false,
        optedIn: true,
      });

      expect(controller.state.enabled).toBe(false);
      expect(controller.state.optedIn).toBe(true);
    });
  });

  describe('trackEvent', () => {
    it('tracks event when enabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' });

      expect(mockAdapter.trackEvent).toHaveBeenCalledWith(
        'test_event',
        { prop: 'value' },
        {},
      );
      expect(controller.state.eventsTracked).toBe(1);
    });

    it('does not track event when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ enabled: false, platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' });

      expect(mockAdapter.trackEvent).not.toHaveBeenCalled();
      expect(controller.state.eventsTracked).toBe(0);
    });

    it('does not track opt-in events when user has not opted in', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ optedIn: false, platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' }, { isOptIn: true });

      expect(mockAdapter.trackEvent).not.toHaveBeenCalled();
    });

    it('tracks opt-in events when user has opted in', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ optedIn: true, platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' }, { isOptIn: true });

      expect(mockAdapter.trackEvent).toHaveBeenCalled();
      expect(controller.state.eventsTracked).toBe(1);
    });

    it('does not track when excludeFromMetrics is true', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ platformAdapter: mockAdapter });

      controller.trackEvent('test_event', { prop: 'value' }, { excludeFromMetrics: true });

      expect(mockAdapter.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('identify', () => {
    it('identifies user and updates state', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ platformAdapter: mockAdapter });

      controller.identify('user-123', { email: 'test@example.com' });

      expect(controller.state.analyticsId).toBe('user-123');
      expect(mockAdapter.identify).toHaveBeenCalledWith('user-123', {
        email: 'test@example.com',
      });
    });

    it('does not identify when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ enabled: false, platformAdapter: mockAdapter });

      controller.identify('user-123');

      expect(mockAdapter.identify).not.toHaveBeenCalled();
    });
  });

  describe('trackPage', () => {
    it('tracks page view', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ platformAdapter: mockAdapter });

      controller.trackPage('home', { referrer: 'test' });

      expect(mockAdapter.trackPage).toHaveBeenCalledWith('home', { referrer: 'test' });
    });

    it('does not track page when disabled', () => {
      const mockAdapter = createMockAdapter();
      const { controller } = withController({ enabled: false, platformAdapter: mockAdapter });

      controller.trackPage('home');

      expect(mockAdapter.trackPage).not.toHaveBeenCalled();
    });
  });

  describe('enable/disable', () => {
    it('enables analytics', () => {
      const { controller } = withController({ enabled: false });

      controller.enable();

      expect(controller.state.enabled).toBe(true);
    });

    it('disables analytics', () => {
      const { controller } = withController();

      controller.disable();

      expect(controller.state.enabled).toBe(false);
    });
  });

  describe('setOptedIn', () => {
    it('sets opted-in state', () => {
      const { controller } = withController();

      expect(controller.state.optedIn).toBe(false);

      controller.setOptedIn(true);
      expect(controller.state.optedIn).toBe(true);

      controller.setOptedIn(false);
      expect(controller.state.optedIn).toBe(false);
    });
  });

  describe('messenger actions', () => {
    it('handles trackEvent action', () => {
      const mockAdapter = createMockAdapter();
      const { controller, messenger } = withController({ platformAdapter: mockAdapter });

      messenger.call('AnalyticsController:trackEvent', 'test_event', { prop: 'value' });

      expect(mockAdapter.trackEvent).toHaveBeenCalled();
      expect(controller.state.eventsTracked).toBe(1);
    });

    it('handles identify action', () => {
      const mockAdapter = createMockAdapter();
      const { controller, messenger } = withController({ platformAdapter: mockAdapter });

      messenger.call('AnalyticsController:identify', 'user-123', { email: 'test' });

      expect(mockAdapter.identify).toHaveBeenCalled();
      expect(controller.state.analyticsId).toBe('user-123');
    });

    it('handles trackPage action', () => {
      const mockAdapter = createMockAdapter();
      const { messenger } = withController({ platformAdapter: mockAdapter });

      messenger.call('AnalyticsController:trackPage', 'home', {});

      expect(mockAdapter.trackPage).toHaveBeenCalled();
    });

    it('handles enable action', () => {
      const { controller, messenger } = withController({ enabled: false });

      messenger.call('AnalyticsController:enable');

      expect(controller.state.enabled).toBe(true);
    });

    it('handles disable action', () => {
      const { controller, messenger } = withController();

      messenger.call('AnalyticsController:disable');

      expect(controller.state.enabled).toBe(false);
    });

    it('handles setOptedIn action', () => {
      const { controller, messenger } = withController();

      messenger.call('AnalyticsController:setOptedIn', true);

      expect(controller.state.optedIn).toBe(true);
    });
  });
});

type WithControllerOptions = {
  state?: Partial<ReturnType<typeof getDefaultAnalyticsControllerState>>;
  enabled?: boolean;
  optedIn?: boolean;
  platformAdapter?: PlatformAdapter;
};

type WithControllerReturn = {
  controller: AnalyticsController;
  messenger: AnalyticsControllerMessenger;
};

/**
 * Builds an AnalyticsController based on the given options.
 *
 * @param options - Controller options
 * @returns The controller and messenger
 */
function withController(options: WithControllerOptions = {}): WithControllerReturn {
  const {
    state = {},
    enabled = true,
    optedIn = false,
    platformAdapter,
  } = options;

  // Create default mock adapter if not provided
  const adapter =
    platformAdapter ??
    ({
      platform: 'MOBILE',
      trackEvent: jest.fn(),
      identify: jest.fn(),
      trackPage: jest.fn(),
    } as PlatformAdapter);

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
    enabled,
    optedIn,
    state,
  });

  return {
    controller,
    messenger: analyticsControllerMessenger,
  };
}

