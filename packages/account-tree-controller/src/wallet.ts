import type { AccountGroupId } from '@metamask/account-api';
import {
  AccountWalletType,
} from '@metamask/account-api';
import type {
  AccountWalletId,
  MultichainAccountWalletId,
  AccountWalletStatus,
  MultichainAccountWalletStatus,
} from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { KeyringTypes } from '@metamask/keyring-controller';
import type { SnapId } from '@metamask/snaps-sdk';

import type {
  AccountGroupMultichainAccountObject,
  AccountGroupObject,
  AccountGroupSingleAccountObject,
} from './group';
import type { UpdatableField, ExtractFieldValues } from './type-utils.js';

/**
 * Persisted metadata for account wallets (stored in controller state for persistence/sync).
 */
export type AccountTreeWalletPersistedMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
};

/**
 * Tree metadata for account wallets (required plain values extracted from persisted metadata).
 */
export type AccountTreeWalletMetadata = Required<
  ExtractFieldValues<AccountTreeWalletPersistedMetadata>
>;

/**
 * Type constraint for a {@link AccountGroupObject}. If one of its union-members
 * does not match this contraint, {@link AccountGroupObject} will resolve
 * to `never`.
 */
type IsAccountWalletObject<
  Type extends {
    type: AccountWalletType;
    id: AccountWalletId;
    status: string; // Has to be refined by the type extending this base type.
    groups: {
      [groupId: AccountGroupId]: AccountGroupObject;
    };
    metadata: AccountTreeWalletMetadata;
  },
> = Type;

/**
 * Account wallet object for the "entropy" wallet category.
 */
export type AccountWalletEntropyObject = {
  type: AccountWalletType.Entropy;
  id: MultichainAccountWalletId;
  status: MultichainAccountWalletStatus;
  groups: {
    // NOTE: Using `MultichainAccountGroupId` instead of `AccountGroupId` would introduce
    // some type problems when using a group ID as an `AccountGroupId` directly. This
    // would require some up-cast to a `MultichainAccountGroupId` which could be considered
    // unsafe... So we keep it as a `AccountGroupId` for now.
    [groupId: AccountGroupId]: AccountGroupMultichainAccountObject;
  };
  metadata: AccountTreeWalletMetadata & {
    entropy: {
      id: EntropySourceId;
    };
  };
};

/**
 * Account wallet object for the "snap" wallet category.
 */
export type AccountWalletSnapObject = {
  type: AccountWalletType.Snap;
  id: AccountWalletId;
  status: AccountWalletStatus;
  groups: {
    [groupId: AccountGroupId]: AccountGroupSingleAccountObject;
  };
  metadata: AccountTreeWalletMetadata & {
    snap: {
      id: SnapId;
    };
  };
};

/**
 * Account wallet object for the "keyring" wallet category.
 */
export type AccountWalletKeyringObject = {
  type: AccountWalletType.Keyring;
  id: AccountWalletId;
  status: AccountWalletStatus;
  groups: {
    [groupId: AccountGroupId]: AccountGroupSingleAccountObject;
  };
  metadata: AccountTreeWalletMetadata & {
    keyring: {
      type: KeyringTypes;
    };
  };
};

/**
 * Account wallet metadata for the "keyring" wallet category.
 */
export type AccountWalletObject = IsAccountWalletObject<
  | AccountWalletEntropyObject
  | AccountWalletSnapObject
  | AccountWalletKeyringObject
>;

export type AccountWalletObjectOf<WalletType extends AccountWalletType> =
  Extract<
    | { type: AccountWalletType.Entropy; object: AccountWalletEntropyObject }
    | { type: AccountWalletType.Keyring; object: AccountWalletKeyringObject }
    | { type: AccountWalletType.Snap; object: AccountWalletSnapObject },
    { type: WalletType }
  >['object'];

/**
 * Returns `true` if the wallet is a multichain account (entropy-backed) wallet,
 * narrowing its type to the entropy variant.
 *
 * Works for both {@link AccountWalletObject} state objects and the intermediate
 * rule-result wallet shapes used inside `#insert()`.
 *
 * @param wallet - The wallet to check.
 * @returns `true` if the wallet is a multichain account wallet, `false` otherwise.
 */
export function isMultichainAccountWallet<Value extends { type: AccountWalletType }>(
  wallet: Value,
): wallet is Value & { type: AccountWalletType.Entropy } {
  return wallet.type === AccountWalletType.Entropy;
}