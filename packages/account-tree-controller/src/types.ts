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
 * Updatable field with value and sync timestamp for Account Syncing V2.
 */
export type UpdatableField<T> = {
  value: T;
  lastUpdatedAt: number;
};

/**
 * Base metadata for account groups (provided by rules, before name computation).
 */
export type AccountGroupBaseMetadata = {
  /** Entropy-specific metadata */
  entropy?: {
    groupIndex: number;
  };
};

/**
 * Full metadata for account groups in tree objects (base + computed name).
 * UI states (pinned, hidden) are added dynamically during tree building.
 */
export type AccountGroupTreeMetadata = AccountGroupBaseMetadata & {
  /** Computed name (from rules or user customization) */
  name: string;
};

/**
 * Base metadata for account wallets (provided by rules, before name computation).
 */
export type AccountWalletBaseMetadata = {
  /** Entropy-specific metadata */
  entropy?: {
    id: string;
    index: number;
  };
  /** Snap-specific metadata */
  snap?: {
    id: string;
  };
  /** Keyring-specific metadata */
  keyring?: {
    type: string;
  };
};

/**
 * Full metadata for account wallets in tree objects (base + computed name).
 * UI states (collapsed) are added dynamically during tree building.
 */
export type AccountWalletTreeMetadata = AccountWalletBaseMetadata & {
  /** Computed name (from rules or user customization) */
  name: string;
};

/**
 * Persisted metadata for account groups (stored in controller state for persistence/sync).
 * Tree objects will extract the .value from UpdatableField during building.
 */
export type AccountGroupMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
  /** Whether this group is pinned in the UI */
  pinned?: UpdatableField<boolean>;
  /** Whether this group is hidden in the UI */
  hidden?: UpdatableField<boolean>;
};

/**
 * Persisted metadata for account wallets (stored in controller state for persistence/sync).
 * Tree objects will extract the .value from UpdatableField during building.
 */
export type AccountWalletMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
  /** Whether this wallet is collapsed in the UI */
  collapsed?: UpdatableField<boolean>;
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
