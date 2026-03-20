import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import type { serviceName } from './MoneyAccountService';
import type { MoneyAccountServiceMethodActions } from './MoneyAccountService-method-action-types';

export type MoneyAccountServiceActions = MoneyAccountServiceMethodActions;

type AllowedActions =
  | KeyringControllerWithKeyringAction
  | KeyringControllerAddNewKeyringAction;

type AllowedEvents = never;

export type MoneyAccountServiceMessenger = Messenger<
  typeof serviceName,
  MoneyAccountServiceActions | AllowedActions,
  AllowedEvents
>;
