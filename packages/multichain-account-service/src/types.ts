import type {
  Bip44Account,
  MultichainAccountGroup,
  MultichainAccountWalletId,
  MultichainAccountWalletStatus,
} from '@metamask/account-api';
import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerGetAccountsAction,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerCreateNewVaultAndKeychainAction,
  KeyringControllerCreateNewVaultAndRestoreAction,
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetStateAction,
  KeyringControllerRemoveAccountAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerWithKeyringAction,
  KeyringControllerWithKeyringV2Action,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type {
  SnapControllerHandleRequestAction,
  SnapControllerGetStateAction,
  SnapControllerStateChangeEvent,
} from '@metamask/snaps-controllers';

import type { serviceName } from './MultichainAccountService';
import type { MultichainAccountServiceMethodActions } from './MultichainAccountService-method-action-types';

/**
 * All actions that {@link MultichainAccountService} registers so that other
 * modules can call them.
 */
export type MultichainAccountServiceActions =
  MultichainAccountServiceMethodActions;

export type MultichainAccountServiceMultichainAccountGroupCreatedEvent = {
  type: `${typeof serviceName}:multichainAccountGroupCreated`;
  payload: [MultichainAccountGroup<Bip44Account<KeyringAccount>>];
};

export type MultichainAccountServiceMultichainAccountGroupUpdatedEvent = {
  type: `${typeof serviceName}:multichainAccountGroupUpdated`;
  payload: [MultichainAccountGroup<Bip44Account<KeyringAccount>>];
};

export type MultichainAccountServiceWalletStatusChangeEvent = {
  type: `${typeof serviceName}:walletStatusChange`;
  payload: [MultichainAccountWalletId, MultichainAccountWalletStatus];
};

/**
 * All events that {@link MultichainAccountService} publishes so that other modules
 * can subscribe to them.
 */
export type MultichainAccountServiceEvents =
  | MultichainAccountServiceMultichainAccountGroupCreatedEvent
  | MultichainAccountServiceMultichainAccountGroupUpdatedEvent
  | MultichainAccountServiceWalletStatusChangeEvent;

/**
 * All actions registered by other modules that {@link MultichainAccountService}
 * calls.
 */
type AllowedActions =
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerGetAccountsAction
  | AccountsControllerGetAccountAction
  | AccountsControllerGetAccountByAddressAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerWithKeyringV2Action
  | KeyringControllerGetStateAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerAddNewKeyringAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | KeyringControllerCreateNewVaultAndKeychainAction
  | KeyringControllerCreateNewVaultAndRestoreAction
  | KeyringControllerRemoveAccountAction
  | SnapControllerGetStateAction
  | SnapControllerHandleRequestAction;

/**
 * All events published by other modules that {@link MultichainAccountService}
 * subscribes to.
 */
type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | KeyringControllerStateChangeEvent
  | SnapControllerStateChangeEvent;

/**
 * The messenger restricted to actions and events that
 * {@link MultichainAccountService} needs to access.
 */
export type MultichainAccountServiceMessenger = Messenger<
  'MultichainAccountService',
  MultichainAccountServiceActions | AllowedActions,
  MultichainAccountServiceEvents | AllowedEvents
>;

/**
 * Config for the Snap platform watcher (SnapPlatformWatcher).
 */
export type SnapPlatformWatcherConfig = {
  /**
   * How long to wait for the Snap keyring to appear before rejecting (ms).
   */
  timeoutMs?: number;
};

export type MultichainAccountServiceConfig = {
  trace?: TraceCallback;
  snapPlatformWatcher?: SnapPlatformWatcherConfig;
};
