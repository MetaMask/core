import type {
  AccountWalletCategory,
  AccountWalletId,
} from '@metamask/account-api';
import { type AccountGroupId, type AccountWallet } from '@metamask/account-api';
import type { EntropySourceId } from '@metamask/keyring-api';
import type { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import { AccountTreeGroup } from './AccountTreeGroup';
import type { AccountWalletObject } from './types';
import { type AccountTreeControllerMessenger } from './types';

/**
 * Account wallet options for the "entropy" wallet category.
 */
export type AccountTreeWalletEntropyOptions = {
  type: AccountWalletCategory.Entropy;
  entropy: {
    id: EntropySourceId;
    index: number;
  };
};

/**
 * Account wallet options for the "snap" wallet category.
 */
export type AccountTreeWalletSnapOptions = {
  type: AccountWalletCategory.Snap;
  snap: {
    id: SnapId;
  };
};

/**
 * Account wallet options for the "keyring" wallet category.
 */
export type AccountTreeWalletKeyringOptions = {
  type: AccountWalletCategory.Keyring;
  keyring: {
    type: KeyringTypes;
  };
};

/**
 * Account wallet options for the "keyring" wallet category.
 */
export type AccountTreeWalletOptions =
  | AccountTreeWalletEntropyOptions
  | AccountTreeWalletSnapOptions
  | AccountTreeWalletKeyringOptions;

/**
 * Account wallet coming from the {@link AccountTreeController}.
 */
export class AccountTreeWallet implements AccountWallet<InternalAccount> {
  readonly #messenger: AccountTreeControllerMessenger;

  readonly #wallet: AccountWalletObject;

  readonly #options: AccountTreeWalletOptions;

  readonly #groups: Map<AccountGroupId, AccountTreeGroup>;

  constructor({
    messenger,
    wallet,
    options,
  }: {
    messenger: AccountTreeControllerMessenger;
    wallet: AccountWalletObject;
    options: AccountTreeWalletOptions;
  }) {
    this.#messenger = messenger;
    this.#wallet = wallet;
    this.#options = options;
    this.#groups = new Map();

    for (const [groupId, group] of Object.entries(this.#wallet.groups)) {
      this.#groups.set(
        groupId as AccountGroupId,
        new AccountTreeGroup({
          messenger: this.#messenger,
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
    return this.#wallet.category;
  }

  get options(): AccountTreeWalletOptions {
    return this.#options;
  }

  get name(): string {
    return this.#wallet.metadata.name;
  }

  /**
   * Returns a reference to the state object.
   *
   * @returns A reference to the wallet state object.
   */
  get object(): AccountWalletObject {
    return this.#wallet;
  }

  /**
   * Gets account tree group for a given ID.
   *
   * @param groupId - Group ID.
   * @returns Account tree group, or undefined if not found.
   */
  getAccountGroup(groupId: AccountGroupId): AccountTreeGroup | undefined {
    return this.#groups.get(groupId);
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
    return Array.from(this.#groups.values());
  }
}
