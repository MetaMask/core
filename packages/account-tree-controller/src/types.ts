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
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import type {
  AccountTreeController,
  controllerName,
} from './AccountTreeController';
import type {
  AccountGroupObject,
  AccountTreeGroupPersistedMetadata,
} from './group';
import type {
  AccountWalletObject,
  AccountTreeWalletPersistedMetadata,
} from './wallet';

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

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetSelectedAccountAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap;

export type AccountTreeControllerActions =
  | AccountTreeControllerGetStateAction
  | AccountTreeControllerSetSelectedAccountGroupAction
  | AccountTreeControllerGetSelectedAccountGroupAction
  | AccountTreeControllerGetAccountsFromSelectedAccountGroupAction
  | AccountTreeControllerSetAccountWalletNameAction
  | AccountTreeControllerSetAccountGroupNameAction
  | AccountTreeControllerSetAccountGroupPinnedAction
  | AccountTreeControllerSetAccountGroupHiddenAction;

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
  | AccountsControllerAccountRenamedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerSelectedAccountChangeEvent;

export type AccountTreeControllerEvents =
  | AccountTreeControllerStateChangeEvent
  | AccountTreeControllerAccountTreeChangeEvent
  | AccountTreeControllerSelectedAccountGroupChangeEvent;

export type AccountTreeControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountTreeControllerActions | AllowedActions,
  AccountTreeControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
