import { MultichainAssetsController } from '@metamask/assets-controllers';
import type { MultichainAssetsControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const multichainAssetsController: InitializationConfiguration<
  MultichainAssetsController,
  MultichainAssetsControllerMessenger
> = {
  name: 'MultichainAssetsController',
  reference: MultichainAssetsController,
  init: ({ state, messenger, options }) =>
    new MultichainAssetsController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: MultichainAssetsControllerMessenger = new Messenger({
      namespace: 'MultichainAssetsController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:listMultichainAccounts',
        'PermissionController:getPermissions',
        'PhishingController:bulkScanTokens',
        'SnapController:getRunnableSnaps',
        'SnapController:handleRequest',
      ],
      events: [
        'AccountsController:accountAdded',
        'AccountsController:accountAssetListUpdated',
        'AccountsController:accountRemoved',
      ],
    });

    return messenger;
  },
};
