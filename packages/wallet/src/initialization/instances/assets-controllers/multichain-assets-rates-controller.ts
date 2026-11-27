import { MultichainAssetsRatesController } from '@metamask/assets-controllers';
import type { MultichainAssetsRatesControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const multichainAssetsRatesController: InitializationConfiguration<
  MultichainAssetsRatesController,
  MultichainAssetsRatesControllerMessenger
> = {
  name: 'MultichainAssetsRatesController',
  reference: MultichainAssetsRatesController,
  init: ({ state, messenger, options }) =>
    new MultichainAssetsRatesController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: MultichainAssetsRatesControllerMessenger = new Messenger({
      namespace: 'MultichainAssetsRatesController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getSelectedMultichainAccount',
        'AccountsController:listMultichainAccounts',
        'CurrencyRateController:getState',
        'MultichainAssetsController:getState',
        'SnapController:handleRequest',
      ],
      events: [
        'AccountsController:accountAdded',
        'CurrencyRateController:stateChange',
        'KeyringController:lock',
        'KeyringController:unlock',
        'MultichainAssetsController:accountAssetListUpdated',
      ],
    });

    return messenger;
  },
};
