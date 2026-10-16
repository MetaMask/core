import { Messenger } from '@metamask/messenger';
import {
  SelectedNetworkController,
  SelectedNetworkControllerMessenger,
} from '@metamask/selected-network-controller';

import type { InitializationConfiguration } from '../../types.js';

export const selectedNetworkController: InitializationConfiguration<
  SelectedNetworkController,
  SelectedNetworkControllerMessenger
> = {
  name: 'SelectedNetworkController',
  reference: SelectedNetworkController,
  init: ({ state, messenger, options }) =>
    new SelectedNetworkController({
      state,
      messenger,
      domainProxyMap: options.domainProxyMap,
    }),
  getMessenger: (parent) => {
    const messenger: SelectedNetworkControllerMessenger = new Messenger({
      namespace: 'SelectedNetworkController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
        'NetworkController:getSelectedNetworkClient',
        'PermissionController:hasPermissions',
        'PermissionController:getSubjectNames',
      ],
      events: [
        'NetworkController:stateChange',
        'PermissionController:stateChange',
      ],
    });

    return messenger;
  },
};
