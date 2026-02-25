import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type {
  AccountId,
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
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
import type { MultichainAccountServiceCreateMultichainAccountGroupAction } from '@metamask/multichain-account-service';
import type {
  AuthenticationController,
  UserStorageController,
} from '@metamask/profile-sync-controller';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import type { controllerName } from './AccountTreeController';
import type { AccountTreeControllerMethodActions } from './AccountTreeController-method-action-types';
import type {
  BackupAndSyncAnalyticsEventPayload,
  BackupAndSyncEmitAnalyticsEventParams,
} from './backup-and-sync/analytics';
import type {
  AccountGroupObject,
  AccountTreeGroupPersistedMetadata,
} from './group';
import type {
  AccountWalletObject,
  AccountTreeWalletPersistedMetadata,
} from './wallet';
import type { MultichainAccountServiceWalletStatusChangeEvent } from '../../multichain-account-service/src/types';

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
  | SnapControllerGetSnap
  | UserStorageController.UserStorageControllerGetStateAction
  | UserStorageController.UserStorageControllerPerformGetStorageAction
  | UserStorageController.UserStorageControllerPerformGetStorageAllFeatureEntriesAction
  | UserStorageController.UserStorageControllerPerformSetStorageAction
  | UserStorageController.UserStorageControllerPerformBatchSetStorageAction
  | AuthenticationController.AuthenticationControllerGetSessionProfileAction
  | MultichainAccountServiceCreateMultichainAccountGroupAction;

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

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerSelectedAccountChangeEvent
  | UserStorageController.UserStorageControllerStateChangeEvent
  | MultichainAccountServiceWalletStatusChangeEvent;

export type AccountTreeControllerEvents =
  | AccountTreeControllerStateChangeEvent
  | AccountTreeControllerAccountTreeChangeEvent
  | AccountTreeControllerSelectedAccountGroupChangeEvent;

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
