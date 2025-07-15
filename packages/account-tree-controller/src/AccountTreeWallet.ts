import {
  toAccountGroupId,
  toAccountWalletId,
  DEFAULT_ACCOUNT_GROUP_UNIQUE_ID,
  type AccountGroupId,
  type AccountWallet,
  type AccountWalletCategory,
  type AccountWalletId,
} from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { type AccountTreeControllerMessenger } from './AccountTreeController';
import type { AccountTreeGroup } from './AccountTreeGroup';
import { MutableAccountTreeGroup } from './AccountTreeGroup';

export type AccountTreeWallet = {
  getAccountGroup(groupId: AccountGroupId): AccountTreeGroup | undefined;

  getAccountGroups(): AccountTreeGroup[];
} & AccountWallet<InternalAccount>;

export abstract class MutableAccountTreeWallet implements AccountTreeWallet {
  readonly id: AccountWalletId;

  readonly category: AccountWalletCategory;

  readonly messenger: AccountTreeControllerMessenger;

  readonly #groups: Map<AccountGroupId, MutableAccountTreeGroup>;

  constructor(
    messenger: AccountTreeControllerMessenger,
    category: AccountWalletCategory,
    id: string,
  ) {
    this.id = toAccountWalletId(category, id);
    this.category = category;
    this.messenger = messenger;

    this.#groups = new Map();
  }

  protected addAccountGroup(group: AccountTreeGroup) {
    return this.#groups.set(group.id, group);
  }

  getAccountGroup(groupId: AccountGroupId): AccountTreeGroup | undefined {
    return this.#groups.get(groupId);
  }

  getAccountGroups(): AccountTreeGroup[] {
    return Array.from(this.#groups.values()); // TODO: Should we avoid the copy here?
  }

  // NOTE: This method SHOULD BE overriden if we need to group things differently.
  addAccount(account: InternalAccount): MutableAccountTreeGroup {
    const id = DEFAULT_ACCOUNT_GROUP_UNIQUE_ID;

    // Accounts for that group. We start with no accounts and will re-use the existing
    // ones (if any) + add the new one.
    let accounts = [];

    // Use a single-group by default.
    const groupId = toAccountGroupId(this.id, id);
    let group = this.#groups.get(groupId);
    if (group) {
      // Group exists already, we will just re-create it after (this way we don't have
      // to expose any mutable method to "update its content").
      accounts = group.accounts;
    }
    accounts.push(account.id);

    // We (re-)create the account group and attach it to this wallet.
    group = new MutableAccountTreeGroup(this.messenger, this, id, [account.id]);
    this.#groups.set(group.id, group);

    return group;
  }

  abstract getDefaultName(): string;
}
