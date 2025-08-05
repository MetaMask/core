import type {
  AccountWalletType,
  AccountWalletId,
  MultichainAccountWalletId,
} from '@metamask/account-api';
import { type AccountGroupId, type AccountWallet } from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import type {
  AccountGroupMultichainAccountObject,
  AccountGroupObject,
  AccountGroupSingleAccountObject,
} from './group';
import { AccountTreeGroup } from './group';
import type {
  UpdatableField,
  ExtractRequiredFieldValues,
} from './type-utils.js';
import { type AccountTreeControllerMessenger } from './types';

/**
 * Persisted metadata for account wallets (stored in controller state for persistence/sync).
 */
export type AccountWalletPersistedMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
};

/**
 * Tree metadata for account wallets (required plain values extracted from persisted metadata).
 */
export type AccountTreeWalletMetadata =
  ExtractRequiredFieldValues<AccountWalletPersistedMetadata>;

/**
 * Type constraint for a {@link AccountGroupObject}. If one of its union-members
 * does not match this contraint, {@link AccountGroupObject} will resolve
 * to `never`.
 */
type IsAccountWalletObject<
  Type extends {
    type: AccountWalletType;
    id: AccountWalletId;
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
      index: number;
    };
  };
};

/**
 * Account wallet object for the "snap" wallet category.
 */
export type AccountWalletSnapObject = {
  type: AccountWalletType.Snap;
  id: AccountWalletId;
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
 * Account wallet coming from the {@link AccountTreeController}.
 */
export class AccountTreeWallet implements AccountWallet<InternalAccount> {
  readonly #wallet: AccountWalletObject;

  protected messenger: AccountTreeControllerMessenger;

  protected groups: Map<AccountGroupId, AccountTreeGroup>;

  constructor({
    messenger,
    wallet,
  }: {
    messenger: AccountTreeControllerMessenger;
    wallet: AccountWalletObject;
  }) {
    this.messenger = messenger;
    this.#wallet = wallet;
    this.groups = new Map();

    for (const [groupId, group] of Object.entries(this.#wallet.groups)) {
      this.groups.set(
        groupId as AccountGroupId,
        new AccountTreeGroup({
          messenger: this.messenger,
          wallet: this,
          group,
        }),
      );
    }
  }

  get id(): AccountWalletId {
    return this.#wallet.id;
  }

  get type(): AccountWalletType {
    return this.#wallet.type;
  }

  get name(): string {
    return this.#wallet.metadata.name;
  }

  /**
   * Gets account tree group for a given ID.
   *
   * @param groupId - Group ID.
   * @returns Account tree group, or undefined if not found.
   */
  getAccountGroup(groupId: AccountGroupId): AccountTreeGroup | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Gets account tree group for a given ID.
   *
   * @param groupId - Group ID.
   * @throws If the account group is not found.
   * @returns Account tree group.
   */
  getAccountGroupOrThrow(groupId: AccountGroupId): AccountTreeGroup {
    const group = this.getAccountGroup(groupId);
    if (!group) {
      throw new Error('Unable to get account group');
    }

    return group;
  }

  /**
   * Gets all account tree groups.
   *
   * @returns Account tree groups.
   */
  getAccountGroups(): AccountTreeGroup[] {
    return Array.from(this.groups.values());
  }
}
