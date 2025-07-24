import type { AccountWalletCategory } from '@metamask/account-api';
import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type {
  AccountId,
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
} from '@metamask/base-controller';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import type { controllerName } from './AccountTreeController';

export type AccountWalletMetadata = {
  name: string;
};

export type AccountGroupMetadata = {
  name: string;
};

export type AccountGroupObject = {
  id: AccountGroupId;
  // Blockchain Accounts:
  accounts: AccountId[];
  metadata: AccountGroupMetadata;
};

export type AccountWalletObject = {
  id: AccountWalletId;
  category: AccountWalletCategory;
  // Account groups OR Multichain accounts (once available).
  groups: {
    [groupId: AccountGroupId]: AccountGroupObject;
  };
  metadata: AccountWalletMetadata;
};

export type AccountTreeControllerState = {
  accountTree: {
    wallets: {
      // Wallets:
      [walletId: AccountWalletId]: AccountWalletObject;
    };
  };
};

export type AccountTreeControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerListMultichainAccountsAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap;

export type AccountTreeControllerActions = never;

export type AccountTreeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

export type AccountTreeControllerEvents = AccountTreeControllerStateChangeEvent;

export type AccountTreeControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountTreeControllerActions | AllowedActions,
  AccountTreeControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;
