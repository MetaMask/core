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

  getAccountGroup(groupId: AccountGroupId): AccountTreeGroup | undefined {
    return this.#groups.get(groupId);
  }

  getAccountGroups(): AccountTreeGroup[] {
    return Array.from(this.#groups.values()); // TODO: Should we avoid the copy here?
  }

  // NOTE: This method SHOULD BE overriden if we need to group things differently.
  addAccount(account: InternalAccount): MutableAccountTreeGroup {
    const id = DEFAULT_ACCOUNT_GROUP_UNIQUE_ID;

    // Use a single-group by default.
    let group = this.#groups.get(toAccountGroupId(this.id, id));
    if (!group) {
      // We create the account group and attach it to this wallet.
      group = new MutableAccountTreeGroup(this.messenger, this, id);
      this.#groups.set(group.id, group);
    }

    group.addAccount(account);

    return group;
  }

  abstract getDefaultName(): string;
}
