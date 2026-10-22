import {
  AnalyticsController,
  getDefaultAnalyticsControllerState,
} from '@metamask/analytics-controller';
import type {
  AnalyticsPlatformAdapter,
  AnalyticsTrackingEvent,
} from '@metamask/analytics-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { analyticsController } from './analytics-controller.js';
import type { AnalyticsControllerInstanceOptions } from './types.js';

const TEST_ANALYTICS_ID = '11111111-1111-4111-8111-111111111111';
const PERSISTED_ANALYTICS_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

type StubPlatformAdapter = AnalyticsPlatformAdapter & {
  track: jest.Mock;
  identify: jest.Mock;
  view: jest.Mock;
  onSetupCompleted: jest.Mock;
};

/**
 * Creates a stub platform adapter for testing.
 *
 * @returns A stub AnalyticsPlatformAdapter.
 */
function createStubPlatformAdapter(): StubPlatformAdapter {
  return {
    track: jest.fn(),
    identify: jest.fn(),
    view: jest.fn(),
    onSetupCompleted: jest.fn(),
  };
}

/**
 * Builds the required analytics controller instance options for tests.
 *
 * @param overrides - Optional overrides for the default options.
 * @returns Analytics controller instance options.
 */
function getAnalyticsOptions(
  overrides: Partial<AnalyticsControllerInstanceOptions> = {},
): AnalyticsControllerInstanceOptions {
  return {
    platformAdapter: createStubPlatformAdapter(),
    analyticsId: TEST_ANALYTICS_ID,
    ...overrides,
  };
}

describe('analyticsController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(analyticsController);
  });

  it('initializes an AnalyticsController with the supplied analyticsId', () => {
    const messenger = analyticsController.getMessenger(getRootMessenger());
    const options = getAnalyticsOptions();

    const instance = analyticsController.init({
      state: undefined,
      messenger,
      options,
    });

    expect(instance).toBeInstanceOf(AnalyticsController);
    expect(instance.state).toStrictEqual({
      ...getDefaultAnalyticsControllerState(),
      analyticsId: TEST_ANALYTICS_ID,
    });
  });

  it('lets persisted state override the supplied analyticsId', () => {
    const messenger = analyticsController.getMessenger(getRootMessenger());

    const instance = analyticsController.init({
      state: {
        analyticsId: PERSISTED_ANALYTICS_ID,
        optedIn: false,
      },
      messenger,
      options: getAnalyticsOptions(),
    });

    expect(instance.state.analyticsId).toBe(PERSISTED_ANALYTICS_ID);
  });

  it('forwards feature flags to the controller', () => {
    const messenger = analyticsController.getMessenger(getRootMessenger());
    const options = getAnalyticsOptions({
      isAnonymousEventsFeatureEnabled: true,
      isEventQueuePersistenceEnabled: true,
      isPreConsentQueueEnabled: true,
      isGeolocationEnabled: true,
      isEventFragmentsEnabled: true,
    });

    const instance = analyticsController.init({
      state: undefined,
      messenger,
      options,
    });

    expect(instance).toBeInstanceOf(AnalyticsController);
  });

  it('delegates ConfigRegistryController and GeolocationController actions', () => {
    const parent = getRootMessenger();
    const delegateSpy = jest.spyOn(parent, 'delegate');
    const messenger = analyticsController.getMessenger(parent);

    expect(delegateSpy).toHaveBeenCalledWith({
      messenger,
      actions: [
        'ConfigRegistryController:getState',
        'GeolocationController:getGeolocationData',
      ],
      events: ['ConfigRegistryController:stateChanged'],
    });
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = analyticsController.getMessenger(rootMessenger);

    analyticsController.init({
      state: undefined,
      messenger,
      options: getAnalyticsOptions(),
    });

    expect(rootMessenger.call('AnalyticsController:getState')).toStrictEqual({
      ...getDefaultAnalyticsControllerState(),
      analyticsId: TEST_ANALYTICS_ID,
    });
  });

  it('registers trackEvent on the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = analyticsController.getMessenger(rootMessenger);
    const platformAdapter = createStubPlatformAdapter();

    analyticsController.init({
      state: {
        analyticsId: TEST_ANALYTICS_ID,
        optedIn: true,
        consentDecisionMade: true,
      },
      messenger,
      options: getAnalyticsOptions({ platformAdapter }),
    });

    const event: AnalyticsTrackingEvent = {
      name: 'Test Event',
      properties: {},
      sensitiveProperties: {},
      saveDataRecording: true,
      hasProperties: false,
    };

    rootMessenger.call('AnalyticsController:trackEvent', event);

    expect(platformAdapter.track).toHaveBeenCalledTimes(1);
    expect(platformAdapter.track).toHaveBeenCalledWith(
      'Test Event',
      undefined,
      {
        consent: {
          categoryPreferences: {
            marketing: false,
            product: true,
          },
        },
      },
    );
  });
});
