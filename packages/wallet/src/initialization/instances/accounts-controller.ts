import {
  AccountsController,
  AccountsControllerMessenger,
  AccountsControllerState,
} from '@metamask/accounts-controller';
import {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { DefaultActions, DefaultEvents, RootMessenger } from '../defaults';
import type { InitializationConfiguration } from '../types';

// TODO: AccountsController is deprecated in favour of AccountTreeController
// and MultichainAccountService. Migrate once those controllers are wired into
// the wallet initialization (both still depend on AccountsController at the
// messenger level, so it must remain present in the meantime).
type AllowedActions = MessengerActions<AccountsControllerMessenger>;

type AllowedEvents = MessengerEvents<AccountsControllerMessenger>;

export const accountsController: InitializationConfiguration<
  AccountsController,
  AccountsControllerMessenger
> = {
  name: 'AccountsController',
  init: ({ state, messenger }) =>
    new AccountsController({
      state: (state ?? {}) as AccountsControllerState,
      messenger,
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) => {
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
        // AccountsController subscribes to :stateChange internally; the
        // delegation must match until that package migrates to :stateChanged.
        // eslint-disable-next-line no-restricted-syntax
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
