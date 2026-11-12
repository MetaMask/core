import { AccountTrackerController } from '@metamask/assets-controllers';
import type {
  AccountTrackerControllerMessenger,
  AssetsContractControllerGetStakedBalanceForChainAction,
} from '@metamask/assets-controllers';
import { Messenger } from '@metamask/messenger';
import type { MessengerActions, MessengerEvents } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types.js';

/**
 * The `AccountTrackerController` messenger, which can also reach
 * `AssetsContractController` for staked balances.
 */
export type AccountTrackerControllerInstanceMessenger = Messenger<
  'AccountTrackerController',
  | MessengerActions<AccountTrackerControllerMessenger>
  | AssetsContractControllerGetStakedBalanceForChainAction,
  MessengerEvents<AccountTrackerControllerMessenger>
>;

export const accountTrackerController: InitializationConfiguration<
  AccountTrackerController,
  AccountTrackerControllerInstanceMessenger
> = {
  name: 'AccountTrackerController',
  reference: AccountTrackerController,
  init: ({ state, messenger, options }) =>
    new AccountTrackerController({
      ...options,
      messenger,
      state,
      getStakedBalanceForChain: async (...args) =>
        messenger.call(
          'AssetsContractController:getStakedBalanceForChain',
          ...args,
        ),
    }),
  getMessenger: (parent) => {
    const messenger: AccountTrackerControllerInstanceMessenger = new Messenger({
      namespace: 'AccountTrackerController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'AccountsController:getSelectedAccount',
        'AccountsController:listAccounts',
        'AssetsContractController:getStakedBalanceForChain',
        'KeyringController:getState',
        'NetworkController:getNetworkClientById',
        'NetworkController:getState',
        'NetworkEnablementController:getState',
        'NetworkEnablementController:listPopularEvmNetworks',
        'PreferencesController:getState',
      ],
      events: [
        'AccountsController:selectedEvmAccountChange',
        'KeyringController:lock',
        'KeyringController:unlock',
        'NetworkController:networkAdded',
        'TransactionController:transactionConfirmed',
        'TransactionController:unapprovedTransactionAdded',
      ],
    });

    return messenger;
  },
};
