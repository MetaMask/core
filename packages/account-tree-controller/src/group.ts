import {
  type AccountGroupType,
  type MultichainAccountGroupId,
} from '@metamask/account-api';
import type { AccountGroupId } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';

import type { UpdatableField, ExtractFieldValues } from './type-utils.js';

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
