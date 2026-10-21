import { AnalyticsController } from '@metamask/analytics-controller';
import type { AnalyticsControllerMessenger } from '@metamask/analytics-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export type { AnalyticsControllerInstanceOptions } from './types.js';

export const analyticsController: InitializationConfiguration<
  AnalyticsController,
  AnalyticsControllerMessenger
> = {
  name: 'AnalyticsController',
  reference: AnalyticsController,
  init: ({ state, messenger, options }) =>
    new AnalyticsController({
      messenger,
      platformAdapter: options.platformAdapter,
      state: {
        analyticsId: options.analyticsId,
        ...state,
      },
      isAnonymousEventsFeatureEnabled: options.isAnonymousEventsFeatureEnabled,
      isEventQueuePersistenceEnabled: options.isEventQueuePersistenceEnabled,
      isPreConsentQueueEnabled: options.isPreConsentQueueEnabled,
      isGeolocationEnabled: options.isGeolocationEnabled,
      isEventFragmentsEnabled: options.isEventFragmentsEnabled,
    }),
  getMessenger: (parent) => {
    const messenger: AnalyticsControllerMessenger = new Messenger({
      namespace: 'AnalyticsController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'ConfigRegistryController:getState',
        'GeolocationController:getGeolocationData',
      ],
      events: ['ConfigRegistryController:stateChanged'],
    });

    return messenger;
  },
};
