import { Messenger } from '@metamask/messenger';
import {
  RampsController,
  RampsControllerMessenger,
  RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS,
} from '@metamask/ramps-controller';

import { InitializationConfiguration } from '../../../types';

export const rampsController: InitializationConfiguration<
  RampsController,
  RampsControllerMessenger
> = {
  name: 'RampsController',
  init: ({ state, messenger, options }) =>
    new RampsController({
      messenger,
      state: state ?? {},
      requestCacheTTL: options.requestCacheTTL,
      requestCacheMaxSize: options.requestCacheMaxSize,
    }),
  getMessenger: (parent) => {
    const messenger: RampsControllerMessenger = new Messenger({
      namespace: 'RampsController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [...RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS],
      events: [],
    });

    return messenger;
  },
};
