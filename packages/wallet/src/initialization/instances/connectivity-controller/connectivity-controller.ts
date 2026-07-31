import {
  ConnectivityController,
  ConnectivityControllerMessenger,
} from '@metamask/connectivity-controller';
import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import type { InitializationConfiguration } from '../../types.js';

export const connectivityController: InitializationConfiguration<
  ConnectivityController,
  ConnectivityControllerMessenger
> = {
  name: 'ConnectivityController',
  init: ({ messenger, options }) =>
    new ConnectivityController({
      messenger,
      connectivityAdapter: options.connectivityAdapter,
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) =>
    new Messenger({
      namespace: 'ConnectivityController',
      parent,
    }),
};
