import { MultichainBalancesController } from '@metamask/assets-controllers';
import type { MultichainBalancesControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const multichainBalancesController: InitializationConfiguration<
  MultichainBalancesController,
  MultichainBalancesControllerMessenger
> = {
  name: 'MultichainBalancesController',
  reference: MultichainBalancesController,
  init: ({ state, messenger, options }) =>
    new MultichainBalancesController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: MultichainBalancesControllerMessenger = new Messenger({
      namespace: 'MultichainBalancesController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:listMultichainAccounts',
        'KeyringController:getState',
        'MultichainAssetsController:getState',
        'SnapController:handleRequest',
      ],
      events: [
        'AccountsController:accountAdded',
        'AccountsController:accountBalancesUpdated',
        'AccountsController:accountRemoved',
        'MultichainAssetsController:accountAssetListUpdated',
      ],
    });

    return messenger;
  },
};
