import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { HandleSnapRequest as SnapControllerHandleSnapRequestAction } from '@metamask/snaps-controllers';

import type {
  MultichainAccountService,
  serviceName,
} from './MultichainAccountService';

export type MultichainAccountServiceGetMultichainAccountGroupAction = {
  type: `${typeof serviceName}:getMultichainAccountGroup`;
  handler: MultichainAccountService['getMultichainAccountGroup'];
};

export type MultichainAccountServiceGetMultichainAccountGroupsAction = {
  type: `${typeof serviceName}:getMultichainAccountGroups`;
  handler: MultichainAccountService['getMultichainAccountGroups'];
};

export type MultichainAccountServiceGetMultichainAccountWalletAction = {
  type: `${typeof serviceName}:getMultichainAccountWallet`;
  handler: MultichainAccountService['getMultichainAccountWallet'];
};

export type MultichainAccountServiceGetMultichainAccountWalletsAction = {
  type: `${typeof serviceName}:getMultichainAccountWallets`;
  handler: MultichainAccountService['getMultichainAccountWallets'];
};

/**
 * All actions that {@link MultichainAccountService} registers so that other
 * modules can call them.
 */
export type MultichainAccountServiceActions =
  | MultichainAccountServiceGetMultichainAccountGroupAction
  | MultichainAccountServiceGetMultichainAccountGroupsAction
  | MultichainAccountServiceGetMultichainAccountWalletAction
  | MultichainAccountServiceGetMultichainAccountWalletsAction;

/**
 * All events that {@link MultichainAccountService} publishes so that other modules
 * can subscribe to them.
 */
export type MultichainAccountServiceEvents = never;

/**
 * All actions registered by other modules that {@link MultichainAccountService}
 * calls.
 */
export type AllowedActions =
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetAccountByAddressAction
  | SnapControllerHandleSnapRequestAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerGetStateAction;

/**
 * All events published by other modules that {@link MultichainAccountService}
 * subscribes to.
 */
export type AllowedEvents =
  | KeyringControllerStateChangeEvent
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

/**
 * The messenger restricted to actions and events that
 * {@link MultichainAccountService} needs to access.
 */
export type MultichainAccountServiceMessenger = RestrictedMessenger<
  'MultichainAccountService',
  MultichainAccountServiceActions | AllowedActions,
  MultichainAccountServiceEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
