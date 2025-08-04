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
import type { AccountGroupObject } from './group';
import type { AccountWalletObject } from './wallet';

/**
 * Updatable field with value and sync timestamp for Account Syncing V2.
 */
export type UpdatableField<T> = {
  value: T;
  lastUpdatedAt: number;
};

/**
 * Type utility to extract value from UpdatableField or return field as-is.
 */
export type ToValue<Field> =
  Field extends UpdatableField<unknown> ? Field['value'] : Field;

/**
 * Type utility to extract plain values from an object with UpdatableField properties.
 */
export type ExtractValues<ObjectValue extends Record<string, unknown>> = {
  [Key in keyof ObjectValue]: ToValue<ObjectValue[Key]>;
};

/**
 * Persisted metadata for account groups (stored in controller state for persistence/sync).
 */
export type AccountGroupPersistedMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
  /** Whether this group is pinned in the UI */
  pinned?: UpdatableField<boolean>;
  /** Whether this group is hidden in the UI */
  hidden?: UpdatableField<boolean>;
};

/**
 * Persisted metadata for account wallets (stored in controller state for persistence/sync).
 */
export type AccountWalletPersistedMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
};

/**
 * Tree metadata for account groups (plain values extracted from persisted metadata).
 */
export type AccountGroupTreeMetadata =
  ExtractValues<AccountGroupPersistedMetadata>;

/**
 * Tree metadata for account wallets (plain values extracted from persisted metadata).
 */
export type AccountWalletTreeMetadata =
  ExtractValues<AccountWalletPersistedMetadata>;

// Backward compatibility aliases using indexed access types
/**
 * @deprecated Use AccountGroupTreeMetadata for tree objects or AccountGroupPersistedMetadata for controller state
 */
export type AccountGroupMetadata = AccountGroupObject['metadata'];

/**
 * @deprecated Use AccountWalletTreeMetadata for tree objects or AccountWalletPersistedMetadata for controller state
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
  accountGroupsMetadata: Record<AccountGroupId, AccountGroupPersistedMetadata>;
  /** Persistent metadata for account wallets (names, sync timestamps) */
  accountWalletsMetadata: Record<
    AccountWalletId,
    AccountWalletPersistedMetadata
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
