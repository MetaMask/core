import type {
  AccountGroupType,
  MultichainAccountGroupId,
} from '@metamask/account-api';
import type { AccountGroupId } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import {
  AnyAccountType,
  BtcAccountType,
  EthAccountType,
  SolAccountType,
  TrxAccountType,
} from '@metamask/keyring-api';
import type { KeyringAccountType } from '@metamask/keyring-api';

import type { UpdatableField, ExtractFieldValues } from './type-utils';
import type { AccountTreeControllerState } from './types';
import type { AccountWalletObject } from './wallet';

/**
 * Persisted metadata for account groups (stored in controller state for persistence/sync).
 */
export type AccountTreeGroupPersistedMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
  /** Whether this group is pinned in the UI */
  pinned?: UpdatableField<boolean>;
  /** Whether this group is hidden in the UI */
  hidden?: UpdatableField<boolean>;
};

export const MAX_SORT_ORDER = 9999;

/**
 * Order of account types.
 */
export const ACCOUNT_TYPE_TO_SORT_ORDER: Record<KeyringAccountType, number> = {
  [EthAccountType.Eoa]: 0,
  [EthAccountType.Erc4337]: 1,
  [SolAccountType.DataAccount]: 2,
  [BtcAccountType.P2pkh]: 3,
  [BtcAccountType.P2sh]: 4,
  [BtcAccountType.P2wpkh]: 5,
  [BtcAccountType.P2tr]: 6,
  [TrxAccountType.Eoa]: 7,
  [AnyAccountType.Account]: MAX_SORT_ORDER,
};

export type AccountTypeOrderKey = keyof typeof ACCOUNT_TYPE_TO_SORT_ORDER;

/**
 * Tree metadata for account groups (required plain values extracted from persisted metadata).
 */
export type AccountTreeGroupMetadata = Required<
  ExtractFieldValues<AccountTreeGroupPersistedMetadata>
>;

/**
 * Type constraint for a {@link AccountGroupObject}. If one of its union-members
 * does not match this contraint, {@link AccountGroupObject} will resolve
 * to `never`.
 */
type IsAccountGroupObject<
  Type extends {
    type: AccountGroupType;
    id: AccountGroupId;
    accounts: AccountId[];
    metadata: AccountTreeGroupMetadata;
  },
> = Type;

/**
 * Multichain-account group object.
 */
export type AccountGroupMultichainAccountObject = {
  type: AccountGroupType.MultichainAccount;
  id: MultichainAccountGroupId;
  // Blockchain Accounts (at least 1 account per multichain-accounts):
  accounts: [AccountId, ...AccountId[]];
  metadata: AccountTreeGroupMetadata & {
    entropy: {
      groupIndex: number;
    };
  };
};

/**
 * Multichain-account group object.
 */
export type AccountGroupSingleAccountObject = {
  type: AccountGroupType.SingleAccount;
  id: AccountGroupId;
  // Blockchain Accounts (1 account per group):
  accounts: [AccountId];
  metadata: AccountTreeGroupMetadata;
};

/**
 * Account group object.
 */
export type AccountGroupObject = IsAccountGroupObject<
  AccountGroupMultichainAccountObject | AccountGroupSingleAccountObject
>;

export type AccountGroupObjectOf<GroupType extends AccountGroupType> = Extract<
  | {
      type: AccountGroupType.MultichainAccount;
      object: AccountGroupMultichainAccountObject;
    }
  | {
      type: AccountGroupType.SingleAccount;
      object: AccountGroupSingleAccountObject;
    },
  { type: GroupType }
>['object'];

/**
 * Checks if a group name is unique within a specific wallet.
 *
 * @param wallet - The wallet to check within.
 * @param groupId - The account group ID to exclude from the check.
 * @param name - The name to validate for uniqueness.
 * @returns True if the name is unique within the wallet, false otherwise.
 */
export function isAccountGroupNameUniqueFromWallet(
  wallet: AccountWalletObject,
  groupId: AccountGroupId,
  name: string,
): boolean {
  const trimmedName = name.trim();

  // Check for duplicates within this wallet
  for (const group of Object.values(wallet.groups)) {
    if (group.id !== groupId && group.metadata.name.trim() === trimmedName) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if an account group name is unique within the same wallet.
 *
 * @param state - The account tree controller state.
 * @param groupId - The account group ID to exclude from the check.
 * @param name - The name to validate for uniqueness.
 * @returns True if the name is unique within the same wallet, false otherwise.
 * @throws Error if the group ID does not exist.
 */
export function isAccountGroupNameUnique(
  state: AccountTreeControllerState,
  groupId: AccountGroupId,
  name: string,
): boolean {
  // Find the wallet that contains the group being validated
  for (const wallet of Object.values(state.accountTree.wallets)) {
    if (wallet.groups[groupId]) {
      // Use the wallet-specific function for consistency
      return isAccountGroupNameUniqueFromWallet(wallet, groupId, name);
    }
  }

  throw new Error(`Account group with ID "${groupId}" not found in tree`);
}
