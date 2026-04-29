import {
  AccountsController,
  AccountsControllerMessenger,
} from '@metamask/accounts-controller';
import {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { InitializationConfiguration } from '../types';

type AllowedActions = MessengerActions<AccountsControllerMessenger>;

type AllowedEvents = MessengerEvents<AccountsControllerMessenger>;

export const accountsController: InitializationConfiguration<
  AccountsController,
  AccountsControllerMessenger
> = {
  name: 'AccountsController',
  init: ({ state, messenger }) => {
    const instance = new AccountsController({
      state,
      messenger,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const accountsControllerMessenger = new Messenger<
      'AccountsController',
      AllowedActions,
      AllowedEvents,
      typeof parent
    >({
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
        'KeyringController:stateChange',
        'SnapKeyring:accountAssetListUpdated',
        'SnapKeyring:accountBalancesUpdated',
        'SnapKeyring:accountTransactionsUpdated',
        'MultichainNetworkController:networkDidChange',
      ],
    });

    return accountsControllerMessenger;
  },
};
