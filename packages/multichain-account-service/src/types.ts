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
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringControllerAddNewKeyringAction,
  KeyringControllerCreateNewVaultAndKeychainAction,
  KeyringControllerCreateNewVaultAndRestoreAction,
  KeyringControllerGetKeyringsByTypeAction,
  KeyringControllerGetStateAction,
  KeyringControllerRemoveAccountAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerWithKeyringAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type {
  HandleSnapRequest as SnapControllerHandleSnapRequestAction,
  SnapControllerGetStateAction,
  SnapStateChange as SnapControllerStateChangeEvent,
} from '@metamask/snaps-controllers';

import type {
  MultichainAccountService,
  serviceName,
} from './MultichainAccountService';

/**
 * Enum representing the different ways an account can be created.
 */
export enum AccountCreationType {
  /**
   * Represents an account created using a BIP-44 derivation path.
   */
  Bip44DerivePath = 'bip44:derive-path',

  /**
   * Represents accounts created using a BIP-44 account index.
   *
   * More than one account can be created, for example, the keyring can create
   * multiple account types (e.g., P2PKH, P2TR, P2WPKH) for the same account
   * index.
   */
  Bip44DeriveIndex = 'bip44:derive-index',

  /**
   * Represents accounts created by deriving a range of BIP-44 account indices.
   *
   * More than one account can be created per index, for example, the keyring
   * can create multiple account types (e.g., P2PKH, P2TR, P2WPKH) for each
   * account index in the range.
   */
  Bip44DeriveIndexRange = 'bip44:derive-index-range',

  /**
   * Represents accounts created through BIP-44 account discovery.
   *
   * More than one account can be created, for example, the keyring can create
   * multiple account types (e.g., P2PKH, P2TR, P2WPKH) for the same account
   * index.
   */
  Bip44Discover = 'bip44:discover',

  /**
   * Represents an account imported from a private key.
   */
  PrivateKeyImport = 'private-key:import',

  /**
   * Represents an account created using custom options.
   */
  Custom = 'custom',
}

/**
 * Options for creating an account using the given BIP-44 account group index.
 *
 * Note that the keyring can support non-standard BIP-44 paths for
 * compatibility with other wallets.
 */
export type CreateAccountBip44DeriveIndexOptions = {
  /**
   * The type of the options.
   */
  type: AccountCreationType.Bip44DeriveIndex;

  /**
   * ID of the entropy source to be used to derive the account.
   */
  entropySource: EntropySourceId;

  /**
   * The index of the account group to be derived.
   */
  groupIndex: number;
};

/**
 * Options for creating accounts by deriving a range of BIP-44 account indices.
 *
 * The range is inclusive on both ends, meaning range.from=0 and range.to=5
 * will create accounts for group indices 0, 1, 2, 3, 4, and 5.
 *
 * Note that the keyring can support non-standard BIP-44 paths for
 * compatibility with other wallets.
 */
export type CreateAccountBip44DeriveRangeOptions = {
  /**
   * The type of the options.
   */
  type: AccountCreationType.Bip44DeriveIndexRange;

  /**
   * ID of the entropy source to be used to derive the accounts.
   */
  entropySource: EntropySourceId;

  /**
   * The range of account group indices to derive (inclusive on both ends).
   */
  range: {
    /**
     * The starting index of the account group range (inclusive).
     */
    from: number;

    /**
     * The ending index of the account group range (inclusive).
     */
    to: number;
  };
};

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

export type MultichainAccountServiceCreateMultichainAccountGroupsAction = {
  type: `${typeof serviceName}:createMultichainAccountGroups`;
  handler: MultichainAccountService['createMultichainAccountGroups'];
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

export type MultichainAccountServiceRemoveMultichainAccountWalletAction = {
  type: `${typeof serviceName}:removeMultichainAccountWallet`;
  handler: MultichainAccountService['removeMultichainAccountWallet'];
};

export type MultichainAccountServiceEnsureCanUseSnapPlatformAction = {
  type: `${typeof serviceName}:ensureCanUseSnapPlatform`;
  handler: MultichainAccountService['ensureCanUseSnapPlatform'];
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
  | MultichainAccountServiceCreateMultichainAccountGroupsAction
  | MultichainAccountServiceSetBasicFunctionalityAction
  | MultichainAccountServiceAlignWalletAction
  | MultichainAccountServiceAlignWalletsAction
  | MultichainAccountServiceCreateMultichainAccountWalletAction
  | MultichainAccountServiceResyncAccountsAction
  | MultichainAccountServiceRemoveMultichainAccountWalletAction
  | MultichainAccountServiceEnsureCanUseSnapPlatformAction;

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
  | SnapControllerGetStateAction
  | SnapControllerHandleSnapRequestAction
  | KeyringControllerWithKeyringAction
  | KeyringControllerGetStateAction
  | KeyringControllerGetKeyringsByTypeAction
  | KeyringControllerAddNewKeyringAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | KeyringControllerCreateNewVaultAndKeychainAction
  | KeyringControllerCreateNewVaultAndRestoreAction
  | KeyringControllerRemoveAccountAction;

/**
 * All events published by other modules that {@link MultichainAccountService}
 * subscribes to.
 */
type AllowedEvents =
  | SnapControllerStateChangeEvent
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
