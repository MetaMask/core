import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type {
  AccountsControllerAccountAddedEvent,
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
import type { AccountWalletObject } from './wallet';

/**
 * Metadata for persisting account group customizations.
 * This includes user customizations like names, UI states, and sync timestamps.
 */
export type AccountGroupMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: string;
  /** Whether this group is pinned in the UI */
  pinned?: boolean;
  /** Whether this group is hidden in the UI */
  hidden?: boolean;
  /** Timestamp of last metadata update for sync conflict resolution */
  lastUpdatedAt?: number;
};

/**
 * Metadata for persisting account wallet customizations.
 * This includes user customizations like names, UI states, and sync timestamps.
 */
export type AccountWalletMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: string;
  /** Whether this wallet is collapsed in the UI */
  collapsed?: boolean;
  /** Timestamp of last metadata update for sync conflict resolution */
  lastUpdatedAt?: number;
};

export type AccountTreeControllerState = {
  accountTree: {
    wallets: {
      // Wallets:
      [walletId: AccountWalletId]: AccountWalletObject;
    };
    selectedAccountGroup: AccountGroupId | '';
  };
  /** Persistent metadata for account groups (names, pinning, hiding, sync timestamps) */
  accountGroupsMetadata: Record<AccountGroupId, AccountGroupMetadata>;
  /** Persistent metadata for account wallets (names, collapsing, sync timestamps) */
  accountWalletsMetadata: Record<AccountWalletId, AccountWalletMetadata>;
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
  | AccountTreeControllerGetSelectedAccountGroupAction;

export type AccountTreeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
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
