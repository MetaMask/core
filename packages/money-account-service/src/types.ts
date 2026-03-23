import type { AccountTreeControllerGetAccountWalletObjectAction } from '@metamask/account-tree-controller';
import type { AccountsControllerGetAccountAction } from '@metamask/accounts-controller';
import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerWithKeyringAction,
  KeyringControllerGetStateAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import type { serviceName } from './MoneyAccountService';
import type { MoneyAccountServiceMethodActions } from './MoneyAccountService-method-action-types';

export type MoneyAccountServiceActions = MoneyAccountServiceMethodActions;

type AllowedActions =
  | AccountTreeControllerGetAccountWalletObjectAction
  | AccountsControllerGetAccountAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerAddNewKeyringAction
  | KeyringControllerGetStateAction;

type AllowedEvents = never;

export type MoneyAccountServiceMessenger = Messenger<
  typeof serviceName,
  MoneyAccountServiceActions | AllowedActions,
  AllowedEvents
>;
