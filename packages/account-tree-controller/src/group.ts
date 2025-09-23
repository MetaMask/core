import {
  type AccountGroupType,
  type MultichainAccountGroupId,
} from '@metamask/account-api';
import type { AccountGroupId } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import {
  type AnyAccountType,
  BtcAccountType,
  EthAccountType,
  type KeyringAccountType,
  SolAccountType,
  TrxAccountType,
} from '@metamask/keyring-api';

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

type NonGenericAccountType<T extends KeyringAccountType = KeyringAccountType> =
  T extends `${AnyAccountType.Account}` ? never : T;

export const AccountTypeOrder: Record<NonGenericAccountType, number> = {
  [EthAccountType.Eoa]: 0,
  [EthAccountType.Erc4337]: 1,
  [BtcAccountType.P2pkh]: 2,
  [BtcAccountType.P2sh]: 3,
  [BtcAccountType.P2wpkh]: 4,
  [BtcAccountType.P2tr]: 5,
  [SolAccountType.DataAccount]: 6,
  [TrxAccountType.Eoa]: 7,
};

export type AccountTypeKey = keyof typeof AccountTypeOrder;

export type AccountOrderTuple = [number, AccountId];

/**
 * Sort two account order objects by their account type.
 *
 * @param a - The first account order tuple.
 * @param b - The second account order tuple.
 * @returns The sorted account order tuples.
 */
function sortByAccountType(a: AccountOrderTuple, b: AccountOrderTuple) {
  return a[0] - b[0];
}

/**
 * Derive accounts by their order.
 *
 * @param AccountOrderTuples - The account order tuples.
 * @returns The account IDs by their order.
 */
export function deriveAccountsByOrder(
  AccountOrderTuples: AccountOrderTuple[],
): AccountId[] {
  return AccountOrderTuples.sort(sortByAccountType).map((obj) => obj[1]);
}

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
    accountOrder: AccountOrderTuple[];
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
  metadata: AccountTreeGroupMetadata & {
    accountOrder: AccountOrderTuple[];
  };
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
