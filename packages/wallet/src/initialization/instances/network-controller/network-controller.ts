import { Messenger } from '@metamask/messenger';
import {
  NetworkController,
  NetworkControllerMessenger,
} from '@metamask/network-controller';

import { InitializationConfiguration } from '../../types.js';

export const networkController: InitializationConfiguration<
  NetworkController,
  NetworkControllerMessenger
> = {
  name: 'NetworkController',
  init: ({ state, messenger, options }) =>
    new NetworkController({
      state,
      messenger,
      infuraProjectId: options.infuraProjectId,
      failoverUrls: options.failoverUrls,
      analyticsOptions: options.analyticsOptions,
    }),
  getMessenger: (parent) => {
    const networkControllerMessenger: NetworkControllerMessenger =
      new Messenger({
        namespace: 'NetworkController',
        parent,
      });

    parent.delegate({
      messenger: networkControllerMessenger,
      actions: [
        'AnalyticsController:getState',
        'AnalyticsController:trackEvent',
        'ConnectivityController:getState',
        'RemoteFeatureFlagController:getState',
      ],

      events: [
        // eslint-disable-next-line no-restricted-syntax
        'RemoteFeatureFlagController:stateChange',
      ],
    });

    return networkControllerMessenger;
  },
};
