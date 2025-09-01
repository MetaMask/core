import type { AccountProvider, Bip44Account } from '@metamask/account-api';
import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { RestrictedMessenger } from '@metamask/base-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringMetadata,
  KeyringSelector,
} from '@metamask/keyring-controller';
import type { EthKeyring } from '@metamask/keyring-internal-api';
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

export type MultichainAccountServiceGetIsAlignmentInProgressAction = {
  type: `${typeof serviceName}:getIsAlignmentInProgress`;
  handler: MultichainAccountService['getIsAlignmentInProgress'];
};

export type MultichainAccountServiceCreateMultichainAccountWalletAction = {
  type: `${typeof serviceName}:createMultichainAccountWallet`;
  handler: MultichainAccountService['createMultichainAccountWallet'];
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
  | MultichainAccountServiceGetIsAlignmentInProgressAction
  | MultichainAccountServiceCreateMultichainAccountWalletAction;

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
  | KeyringControllerWithKeyringWithOptionsAction
  | KeyringControllerGetStateAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction;

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

export type Bip44AccountProvider = AccountProvider<
  Bip44Account<KeyringAccount>
>;

/**
 * Locally widen the withKeyring action so the messenger accepts the optional options
 * parameter (createIfMissing/createWithData) in addition to selector and operation.
 */
export type KeyringControllerWithKeyringWithOptionsAction = {
  type: 'KeyringController:withKeyring';
  handler: <
    SelectedKeyring extends EthKeyring = EthKeyring,
    CallbackResult = void,
  >(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
    options?:
      | { createIfMissing?: false }
      | { createIfMissing: true; createWithData?: unknown },
  ) => Promise<CallbackResult>;
};
