import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type {
  AccountId,
  AccountsControllerAccountsAddedEvent,
  AccountsControllerAccountsRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedMultichainAccountAction,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
  AccountsControllerSetSelectedAccountAction,
} from '@metamask/accounts-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  MultichainAccountServiceCreateMultichainAccountGroupAction,
  MultichainAccountServiceCreateMultichainAccountGroupsAction,
} from '@metamask/multichain-account-service';
import type { MultichainAccountServiceWalletStatusChangeEvent } from '@metamask/multichain-account-service';
import type {
  AuthenticationController,
  UserStorageController,
} from '@metamask/profile-sync-controller';
import type { SnapControllerGetSnapAction } from '@metamask/snaps-controllers';

import type { AccountTreeControllerMethodActions } from './AccountTreeController-method-action-types.js';
import type { controllerName } from './AccountTreeController.js';
import type {
  BackupAndSyncAnalyticsEventPayload,
  BackupAndSyncEmitAnalyticsEventParams,
} from './backup-and-sync/analytics/index.js';
import type {
  AccountGroupObject,
  AccountTreeGroupPersistedMetadata,
} from './group.js';
import type {
  AccountWalletObject,
  AccountTreeWalletPersistedMetadata,
} from './wallet.js';

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
  };
  selectedAccountGroup: AccountGroupId | '';
  isAccountTreeSyncingInProgress: boolean;
  hasAccountTreeSyncingSyncedAtLeastOnce: boolean;
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

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedMultichainAccountAction
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetSelectedAccountAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnapAction
  | UserStorageController.UserStorageControllerGetStateAction
  | UserStorageController.UserStorageControllerPerformGetStorageAction
  | UserStorageController.UserStorageControllerPerformGetStorageAllFeatureEntriesAction
  | UserStorageController.UserStorageControllerPerformSetStorageAction
  | UserStorageController.UserStorageControllerPerformBatchSetStorageAction
  | AuthenticationController.AuthenticationControllerGetSessionProfileAction
  | MultichainAccountServiceCreateMultichainAccountGroupAction
  | MultichainAccountServiceCreateMultichainAccountGroupsAction;

export type AccountTreeControllerActions =
  | AccountTreeControllerGetStateAction
  | AccountTreeControllerMethodActions;

export type AccountTreeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountTreeControllerState
>;

/**
 * Represents the `AccountTreeController:accountTreeChange` event.
 * This event is emitted when nodes (wallets, groups, or accounts) are added or removed.
 */
export type AccountTreeControllerAccountTreeChangeEvent = {
  type: `${typeof controllerName}:accountTreeChange`;
  payload: [AccountTreeControllerState['accountTree']];
};

/**
 * Represents the `AccountTreeController:selectedAccountGroupChange` event.
 * This event is emitted when the selected account group changes.
 */
export type AccountTreeControllerSelectedAccountGroupChangeEvent = {
  type: `${typeof controllerName}:selectedAccountGroupChange`;
  payload: [AccountGroupId | '', AccountGroupId | ''];
};

/**
 * Represents the `AccountTreeController:accountGroupCreated` event.
 * This event is emitted when a new account group is added to the tree
 * after the controller has been initialized.
 */
export type AccountTreeControllerAccountGroupCreatedEvent = {
  type: `${typeof controllerName}:accountGroupCreated`;
  payload: [AccountGroupObject];
};

/**
 * Represents the `AccountTreeController:accountGroupUpdated` event.
 * This event is emitted when an existing account group's metadata or
 * membership changes after the controller has been initialized.
 */
export type AccountTreeControllerAccountGroupUpdatedEvent = {
  type: `${typeof controllerName}:accountGroupUpdated`;
  payload: [AccountGroupObject];
};

/**
 * Represents the `AccountTreeController:accountGroupRemoved` event.
 * This event is emitted when an account group is pruned from the tree
 * (its last account was removed) after the controller has been initialized.
 */
export type AccountTreeControllerAccountGroupRemovedEvent = {
  type: `${typeof controllerName}:accountGroupRemoved`;
  payload: [AccountGroupId];
};

export type AllowedEvents =
  | AccountsControllerAccountsAddedEvent
  | AccountsControllerAccountsRemovedEvent
  | AccountsControllerSelectedAccountChangeEvent
  | UserStorageController.UserStorageControllerStateChangeEvent
  | MultichainAccountServiceWalletStatusChangeEvent;

export type AccountTreeControllerEvents =
  | AccountTreeControllerStateChangeEvent
  | AccountTreeControllerAccountTreeChangeEvent
  | AccountTreeControllerSelectedAccountGroupChangeEvent
  | AccountTreeControllerAccountGroupCreatedEvent
  | AccountTreeControllerAccountGroupUpdatedEvent
  | AccountTreeControllerAccountGroupRemovedEvent;

export type AccountTreeControllerMessenger = Messenger<
  typeof controllerName,
  AccountTreeControllerActions | AllowedActions,
  AccountTreeControllerEvents | AllowedEvents
>;

export type AccountTreeControllerConfig = {
  trace?: TraceCallback;
  backupAndSync?: {
    onBackupAndSyncEvent?: (event: BackupAndSyncAnalyticsEventPayload) => void;
  };
  accountOrderCallbacks?: {
    isHiddenAccount?: (accountId: AccountId) => boolean;
    isPinnedAccount?: (accountId: AccountId) => boolean;
  };
};

export type AccountTreeControllerInternalBackupAndSyncConfig = {
  emitAnalyticsEventFn: (event: BackupAndSyncEmitAnalyticsEventParams) => void;
};
