import {
  AccountsController,
  AccountsControllerMessenger,
} from '@metamask/accounts-controller';
import { Messenger } from '@metamask/messenger';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import type { InitializationConfiguration } from '../../types.js';

export const accountsController: InitializationConfiguration<
  AccountsController,
  AccountsControllerMessenger
> = {
  name: 'AccountsController',
  init: ({ state, messenger }) =>
    new AccountsController({
      state,
      messenger,
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) => {
    const accountsControllerMessenger: AccountsControllerMessenger =
      new Messenger({
        namespace: 'AccountsController',
        parent,
      });

    parent.delegate({
      messenger: accountsControllerMessenger,
      actions: [
        'KeyringController:getState',
        'KeyringController:getKeyringsByType',
      ],
      events: [
        // AccountsController subscribes to :stateChange internally; the
        // delegation must match until that package migrates to :stateChanged.
        // eslint-disable-next-line no-restricted-syntax
        'KeyringController:stateChange',
        'SnapAccountService:accountAssetListUpdated',
        'SnapAccountService:accountBalancesUpdated',
        'SnapAccountService:accountTransactionsUpdated',
        'MultichainNetworkController:networkDidChange',
      ],
    });

    return accountsControllerMessenger;
  },
};
