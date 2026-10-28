import { Messenger } from '@metamask/messenger';
import { NetworkEnablementController } from '@metamask/network-enablement-controller';
import type { NetworkEnablementControllerMessenger } from '@metamask/network-enablement-controller';

import type { InitializationConfiguration } from '../../types.js';

export const networkEnablementController: InitializationConfiguration<
  NetworkEnablementController,
  NetworkEnablementControllerMessenger
> = {
  name: 'NetworkEnablementController',
  reference: NetworkEnablementController,
  init: ({ state, messenger }) =>
    new NetworkEnablementController({
      state,
      messenger,
    }),
  getMessenger: (parent) => {
    const messenger: NetworkEnablementControllerMessenger = new Messenger({
      namespace: 'NetworkEnablementController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'ConfigRegistryController:getState',
        'MultichainNetworkController:getState',
        'NetworkController:getState',
      ],
      events: [
        'NetworkController:networkAdded',
        'NetworkController:networkRemoved',
        'NetworkController:stateChange',
        'TransactionController:transactionSubmitted',
      ],
    });

    return messenger;
  },
};
