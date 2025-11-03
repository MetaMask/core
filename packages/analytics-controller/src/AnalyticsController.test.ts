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
  type AnalyticsPlatformAdapter,
  getDefaultAnalyticsControllerState,
} from '.';

type SetupControllerOptions = {
  state?: Partial<ReturnType<typeof getDefaultAnalyticsControllerState>>;
  enabled?: boolean;
  optedIn?: boolean;
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
    enabled,
    optedIn,
    state,
  });

  return {
    controller,
    messenger: analyticsControllerMessenger,
  };
}

describe('AnalyticsController', () => {
  const createMockAdapter = (): AnalyticsPlatformAdapter => ({
    trackEvent: jest.fn(),
    identify: jest.fn(),
    trackPage: jest.fn(),
  });

  describe('constructor', () => {
    it('initializes with default state', () => {
      const { controller } = setupController();

      const { state } = controller;

      expect(state.enabled).toBe(true);
      expect(state.optedIn).toBe(false);
      expect(state.analyticsId).toBeNull();
    });

    it('initializes with provided state', () => {
      const { controller } = setupController({
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
      const { controller } = setupController({
        enabled: false,
        optedIn: true,
      });

      expect(controller.state.enabled).toBe(false);
      expect(controller.state.optedIn).toBe(true);
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

      expect(controller.state.enabled).toBe(true);
      expect(controller.state.optedIn).toBe(false);
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
        enabled: false,
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
        enabled: false,
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
        enabled: false,
        platformAdapter: mockAdapter,
      });

      controller.trackPage('home');

      expect(mockAdapter.trackPage).not.toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('enables analytics tracking', () => {
      const { controller } = setupController({ enabled: false });

      expect(controller.state.enabled).toBe(false);

      controller.enable();

      expect(controller.state.enabled).toBe(true);
    });
  });

  describe('disable', () => {
    it('disables analytics tracking', () => {
      const { controller } = setupController({ enabled: true });

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
      const { controller } = setupController({ optedIn: true });

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
      const { controller, messenger } = setupController({ enabled: false });

      expect(controller.state.enabled).toBe(false);

      messenger.call('AnalyticsController:enable');

      expect(controller.state.enabled).toBe(true);
    });

    it('handles disable action', () => {
      const { controller, messenger } = setupController({ enabled: true });

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
      const { controller, messenger } = setupController({ optedIn: true });

      expect(controller.state.optedIn).toBe(true);

      messenger.call('AnalyticsController:optOut');

      expect(controller.state.optedIn).toBe(false);
    });
  });
});
