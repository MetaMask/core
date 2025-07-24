import type {
  AccountWalletCategory,
  AccountWalletId,
} from '@metamask/account-api';
import { type AccountGroupId, type AccountWallet } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountWalletObject } from './AccountTreeController';
import { type AccountTreeControllerMessenger } from './AccountTreeController';
import { AccountTreeGroup } from './AccountTreeGroup';

/**
 * Account wallet coming from the {@link AccountTreeController}.
 */
export class AccountTreeWallet implements AccountWallet<InternalAccount> {
  readonly #messenger: AccountTreeControllerMessenger;

  readonly #wallet: AccountWalletObject;

  readonly #groups: Map<AccountGroupId, AccountTreeGroup>;

  constructor({
    messenger,
    wallet,
  }: {
    messenger: AccountTreeControllerMessenger;
    wallet: AccountWalletObject;
  }) {
    this.#messenger = messenger;
    this.#wallet = wallet;
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

  get name(): string {
    return this.#wallet.metadata.name;
  }

  /**
   * Gets account tree group for a given ID.
   *
   * @param groupId - Group ID.
   * @returns Account tree group.
   */
  getAccountGroup(groupId: AccountGroupId): AccountTreeGroup | undefined {
    return this.#groups.get(groupId);
  }

  /**
   * Gets all account tree groups.
   *
   * @returns Account tree groups.
   */
  getAccountGroups(): AccountTreeGroup[] {
    return Array.from(this.#groups.values());
  }

  /**
   * Gets any underlying account.
   *
   * This can be useful if the accounts from this wallet have been grouped some
   * common criteria, so you expect some commonly defined information on any of
   * those accounts.
   *
   * @throws If the wallet has no account group (which should not be possible).
   * @returns Any account that share the same information based on the grouping
   * rule that has been used.
   */
  getAnyAccount(): InternalAccount {
    if (this.#groups.size === 0) {
      throw new Error('Wallet contains no account group');
    }

    // It cannot be `undefined`, we checked the size before.
    const group = this.#groups.values().next().value as AccountTreeGroup;
    return group.getAnyAccount();
  }
}
