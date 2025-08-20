import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type {
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRenamedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
  AccountsControllerSetSelectedAccountAction,
} from '@metamask/accounts-controller';
import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { MultichainAccountServiceCreateMultichainAccountGroupAction } from '@metamask/multichain-account-service';
import type {
  UserStorageControllerGetIsMultichainAccountSyncingEnabled,
  UserStorageControllerPerformBatchSetStorage,
  UserStorageControllerPerformGetStorage,
  UserStorageControllerPerformSetStorage,
  UserStorageControllerSyncInternalAccountsWithUserStorage,
} from '@metamask/profile-sync-controller/user-storage';
import type { UserStorageControllerPerformGetStorageAllFeatureEntries } from '@metamask/profile-sync-controller/user-storage';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import type {
  AccountTreeController,
  controllerName,
} from './AccountTreeController';
import type { BackupAndSyncAnalyticsEventPayload } from './backup-and-sync/analytics';
import type {
  AccountGroupObject,
  AccountTreeGroupPersistedMetadata,
} from './group';
import type {
  AccountWalletObject,
  AccountTreeWalletPersistedMetadata,
} from './wallet';
import type { AuthenticationControllerGetSessionProfile } from '../../profile-sync-controller/dist/controllers/authentication/AuthenticationController.cjs';

// Backward compatibility aliases using indexed access types
/**
 * @deprecated Use AccountTreeGroupMetadata for tree objects or AccountTreeGroupPersistedMetadata for controller state
 */
export type AccountGroupMetadata = AccountGroupObject['metadata'];

/**
 * @deprecated Use AccountTreeWalletMetadata for tree objects or AccountTreeWalletPersistedMetadata for controller state
 */
export type AccountWalletMetadata = AccountWalletObject['metadata'];

export type AccountTreeControllerState = {
  accountTree: {
    wallets: {
      // Wallets:
      [walletId: AccountWalletId]: AccountWalletObject;
    };
    selectedAccountGroup: AccountGroupId | '';
  };
  isBackupAndSyncInProgress: boolean;
  /** Persistent metadata for account groups (names, pinning, hiding, sync timestamps) */
  accountGroupsMetadata: Record<
    AccountGroupId,
    AccountTreeGroupPersistedMetadata
  >;
  /** Persistent metadata for account wallets (names, sync timestamps) */
  accountWalletsMetadata: Record<
    AccountWalletId,
    AccountTreeWalletPersistedMetadata
  >;
};

export type AccountTreeControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AccountTreeControllerSetSelectedAccountGroupAction = {
  type: `${typeof controllerName}:setSelectedAccountGroup`;
  handler: AccountTreeController['setSelectedAccountGroup'];
};

export type AccountTreeControllerGetSelectedAccountGroupAction = {
  type: `${typeof controllerName}:getSelectedAccountGroup`;
  handler: AccountTreeController['getSelectedAccountGroup'];
};

export type AccountTreeControllerGetAccountsFromSelectedAccountGroupAction = {
  type: `${typeof controllerName}:getAccountsFromSelectedAccountGroup`;
  handler: AccountTreeController['getAccountsFromSelectedAccountGroup'];
};

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetSelectedAccountAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap
  | UserStorageControllerPerformGetStorage
  | UserStorageControllerPerformGetStorageAllFeatureEntries
  | UserStorageControllerPerformSetStorage
  | UserStorageControllerPerformBatchSetStorage
  | UserStorageControllerSyncInternalAccountsWithUserStorage
  | UserStorageControllerGetIsMultichainAccountSyncingEnabled
  | AuthenticationControllerGetSessionProfile
  | MultichainAccountServiceCreateMultichainAccountGroupAction;

export type AccountTreeControllerActions =
  | AccountTreeControllerGetStateAction
  | AccountTreeControllerSetSelectedAccountGroupAction
  | AccountTreeControllerGetSelectedAccountGroupAction
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction;

export type AccountTreeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRenamedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerSelectedAccountChangeEvent;

export type AccountTreeControllerEvents = AccountTreeControllerStateChangeEvent;

export type AccountTreeControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountTreeControllerActions | AllowedActions,
  AccountTreeControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

export type AccountTreeControllerConfig = {
  trace?: TraceCallback;
  backupAndSync?: {
    onBackupAndSyncEvent?: (event: BackupAndSyncAnalyticsEventPayload) => void;
    enableDebugLogging?: boolean;
  };
};
