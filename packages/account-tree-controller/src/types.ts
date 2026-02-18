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

import type {
  AccountTreeController,
  controllerName,
} from './AccountTreeController';
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

export type AccountTreeControllerGetAccountContextAction = {
  type: `${typeof controllerName}:getAccountContext`;
  handler: AccountTreeController['getAccountContext'];
};

export type AccountTreeControllerSetAccountWalletNameAction = {
  type: `${typeof controllerName}:setAccountWalletName`;
  handler: AccountTreeController['setAccountWalletName'];
};

export type AccountTreeControllerSetAccountGroupNameAction = {
  type: `${typeof controllerName}:setAccountGroupName`;
  handler: AccountTreeController['setAccountGroupName'];
};

export type AccountTreeControllerSetAccountGroupHiddenAction = {
  type: `${typeof controllerName}:setAccountGroupHidden`;
  handler: AccountTreeController['setAccountGroupHidden'];
};

export type AccountTreeControllerSetAccountGroupPinnedAction = {
  type: `${typeof controllerName}:setAccountGroupPinned`;
  handler: AccountTreeController['setAccountGroupPinned'];
};

export type AccountTreeControllerGetAccountWalletObjectAction = {
  type: `${typeof controllerName}:getAccountWalletObject`;
  handler: AccountTreeController['getAccountWalletObject'];
};

export type AccountTreeControllerGetAccountWalletObjectsAction = {
  type: `${typeof controllerName}:getAccountWalletObjects`;
  handler: AccountTreeController['getAccountWalletObjects'];
};

export type AccountTreeControllerGetAccountGroupObjectAction = {
  type: `${typeof controllerName}:getAccountGroupObject`;
  handler: AccountTreeController['getAccountGroupObject'];
};

export type AccountTreeControllerClearStateAction = {
  type: `${typeof controllerName}:clearState`;
  handler: AccountTreeController['clearState'];
};

export type AccountTreeControllerSyncWithUserStorageAction = {
  type: `${typeof controllerName}:syncWithUserStorage`;
  handler: AccountTreeController['syncWithUserStorage'];
};

export type AccountTreeControllerSyncWithUserStorageAtLeastOnceAction = {
  type: `${typeof controllerName}:syncWithUserStorageAtLeastOnce`;
  handler: AccountTreeController['syncWithUserStorageAtLeastOnce'];
};

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedMultichainAccountAction
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetSelectedAccountAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap
  | UserStorageController.UserStorageControllerGetStateAction
  | UserStorageController.UserStorageControllerPerformGetStorage
  | UserStorageController.UserStorageControllerPerformGetStorageAllFeatureEntries
  | UserStorageController.UserStorageControllerPerformSetStorage
  | UserStorageController.UserStorageControllerPerformBatchSetStorage
  | AuthenticationController.AuthenticationControllerGetSessionProfile
  | MultichainAccountServiceCreateMultichainAccountGroupAction;

export type AccountTreeControllerActions =
  | AccountTreeControllerGetStateAction
  | AccountTreeControllerSetSelectedAccountGroupAction
  | AccountTreeControllerGetSelectedAccountGroupAction
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | AccountTreeControllerGetAccountContextAction
  | AccountTreeControllerSetAccountWalletNameAction
  | AccountTreeControllerSetAccountGroupNameAction
  | AccountTreeControllerSetAccountGroupPinnedAction
  | AccountTreeControllerSetAccountGroupHiddenAction
  | AccountTreeControllerGetAccountWalletObjectAction
  | AccountTreeControllerGetAccountWalletObjectsAction
  | AccountTreeControllerGetAccountGroupObjectAction
  | AccountTreeControllerClearStateAction
  | AccountTreeControllerSyncWithUserStorageAction
  | AccountTreeControllerSyncWithUserStorageAtLeastOnceAction;

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
