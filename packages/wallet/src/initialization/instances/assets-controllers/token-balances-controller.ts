import { TokenBalancesController } from '@metamask/assets-controllers';
import type { TokenBalancesControllerMessenger } from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

export const tokenBalancesController: InitializationConfiguration<
  TokenBalancesController,
  TokenBalancesControllerMessenger
> = {
  name: 'TokenBalancesController',
  reference: TokenBalancesController,
  init: ({ state, messenger, options }) =>
    new TokenBalancesController({
      ...options,
      messenger,
      state,
    }),
  getMessenger: (parent) => {
    const messenger: TokenBalancesControllerMessenger = new Messenger({
      namespace: 'TokenBalancesController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountTrackerController:getState',
        'AccountTrackerController:updateNativeBalances',
        'AccountTrackerController:updateStakedBalances',
        'AccountsController:getSelectedAccount',
        'AccountsController:listAccounts',
        'AuthenticationController:getBearerToken',
        'KeyringController:getState',
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
        'PreferencesController:getState',
        'TokenDetectionController:addDetectedTokensViaPolling',
        'TokenDetectionController:addDetectedTokensViaWs',
        'TokenDetectionController:detectTokens',
        'TokensController:getState',
      ],
      events: [
        'AccountActivityService:balanceUpdated',
        'AccountActivityService:statusChanged',
        'AccountsController:selectedEvmAccountChange',
        'KeyringController:accountRemoved',
        'KeyringController:lock',
        'KeyringController:unlock',
        'NetworkController:stateChange',
        'PreferencesController:stateChange',
        'TokensController:stateChange',
        'TransactionController:transactionConfirmed',
      ],
    });

    return messenger;
  },
};
