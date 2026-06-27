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
    // Type cast required: RampsControllerMessenger's parent constraint includes
    // RampsService/TransakService actions that are not in DefaultActions (since
    // these are opt-in configs, not default wallet instances).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messenger: RampsControllerMessenger = new Messenger({
      namespace: 'RampsController',
      parent: parent as never,
    });

    parent.delegate({
      messenger,
      actions: [...RAMPS_CONTROLLER_REQUIRED_SERVICE_ACTIONS] as never[],
      events: [],
    });

    return messenger;
  },
};
