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
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { ErrorReportingServiceCaptureExceptionAction } from '@metamask/error-reporting-service';
import type { KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
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

export type MultichainAccountServiceCreateNextMultichainAccountGroupAction = {
  type: `${typeof serviceName}:createNextMultichainAccountGroup`;
  handler: MultichainAccountService['createNextMultichainAccountGroup'];
};

export type MultichainAccountServiceCreateMultichainAccountGroupAction = {
  type: `${typeof serviceName}:createMultichainAccountGroup`;
  handler: MultichainAccountService['createMultichainAccountGroup'];
};

export type MultichainAccountServiceSetBasicFunctionalityAction = {
  type: `${typeof serviceName}:setBasicFunctionality`;
  handler: MultichainAccountService['setBasicFunctionality'];
};

export type MultichainAccountServiceAlignWalletAction = {
  type: `${typeof serviceName}:alignWallet`;
  handler: MultichainAccountService['alignWallet'];
};

export type MultichainAccountServiceAlignWalletsAction = {
  type: `${typeof serviceName}:alignWallets`;
  handler: MultichainAccountService['alignWallets'];
};

export type MultichainAccountServiceCreateMultichainAccountWalletAction = {
  type: `${typeof serviceName}:createMultichainAccountWallet`;
  handler: MultichainAccountService['createMultichainAccountWallet'];
};

export type MultichainAccountServiceResyncAccountsAction = {
  type: `${typeof serviceName}:resyncAccounts`;
  handler: MultichainAccountService['resyncAccounts'];
};

/**
 * All actions that {@link MultichainAccountService} registers so that other
 * modules can call them.
 */
export type MultichainAccountServiceActions =
  | MultichainAccountServiceGetMultichainAccountGroupAction
  | MultichainAccountServiceGetMultichainAccountGroupsAction
  | MultichainAccountServiceGetMultichainAccountWalletAction
  | MultichainAccountServiceGetMultichainAccountWalletsAction
  | MultichainAccountServiceCreateNextMultichainAccountGroupAction
  | MultichainAccountServiceCreateMultichainAccountGroupAction
  | MultichainAccountServiceSetBasicFunctionalityAction
  | MultichainAccountServiceAlignWalletAction
  | MultichainAccountServiceAlignWalletsAction
  | MultichainAccountServiceCreateMultichainAccountWalletAction
  | MultichainAccountServiceResyncAccountsAction;

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
  | AccountsControllerGetAccountAction
  | AccountsControllerGetAccountByAddressAction
  | SnapControllerHandleSnapRequestAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerGetStateAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerAddNewKeyringAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | ErrorReportingServiceCaptureExceptionAction;

/**
 * All events published by other modules that {@link MultichainAccountService}
 * subscribes to.
 */
type AllowedEvents =
  | KeyringControllerStateChangeEvent
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

/**
 * The messenger restricted to actions and events that
 * {@link MultichainAccountService} needs to access.
 */
export type MultichainAccountServiceMessenger = Messenger<
  'MultichainAccountService',
  MultichainAccountServiceActions | AllowedActions,
  MultichainAccountServiceEvents | AllowedEvents
>;

export type MultichainAccountServiceConfig = {
  trace?: TraceCallback;
};
