import type {
  AccountWalletCategory,
  AccountWalletId,
} from '@metamask/account-api';
import { type AccountGroupId, type AccountWallet } from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import type { AccountGroupObject } from './group';
import { AccountTreeGroup } from './group';
import { type AccountTreeControllerMessenger } from './types';

/**
 * Account wallet metadata for the "entropy" wallet category.
 */
export type AccountWalletEntropyMetadata = {
  type: AccountWalletCategory.Entropy;
  entropy: {
    id: EntropySourceId;
    index: number;
  };
};

/**
 * Account wallet metadata for the "snap" wallet category.
 */
export type AccountWalletSnapMetadata = {
  type: AccountWalletCategory.Snap;
  snap: {
    id: SnapId;
  };
};

/**
 * Account wallet metadata for the "keyring" wallet category.
 */
export type AccountWalletKeyringMetadata = {
  type: AccountWalletCategory.Keyring;
  keyring: {
    type: KeyringTypes;
  };
};

/**
 * Account wallet metadata for the "keyring" wallet category.
 */
export type AccountWalletCategoryMetadata =
  | AccountWalletEntropyMetadata
  | AccountWalletSnapMetadata
  | AccountWalletKeyringMetadata;

export type AccountWalletMetadata = {
  name: string;
} & AccountWalletCategoryMetadata;

export type AccountWalletObject = {
  id: AccountWalletId;
  // Account groups OR Multichain accounts (once available).
  groups: {
    [groupId: AccountGroupId]: AccountGroupObject;
  };
  metadata: AccountWalletMetadata;
};

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

  get category(): AccountWalletCategory {
    return this.#wallet.metadata.type;
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
