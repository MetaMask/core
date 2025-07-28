import { type AccountGroup, type AccountGroupId } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountTreeControllerMessenger } from './types';
import type { AccountTreeWallet } from './wallet';

export const DEFAULT_ACCOUNT_GROUP_NAME: string = 'Default';

export type AccountGroupMetadata = {
  name: string;
};

export type AccountGroupObject = {
  id: AccountGroupId;
  // Blockchain Accounts:
  accounts: AccountId[];
  metadata: AccountGroupMetadata;
};

/**
 * Account group coming from the {@link AccountTreeController}.
 */
export class AccountTreeGroup implements AccountGroup<InternalAccount> {
  readonly #messenger: AccountTreeControllerMessenger;

  readonly #group: AccountGroupObject;

  readonly #wallet: AccountTreeWallet;

  constructor({
    messenger,
    wallet,
    group,
  }: {
    messenger: AccountTreeControllerMessenger;
    wallet: AccountTreeWallet;
    group: AccountGroupObject;
  }) {
    this.#messenger = messenger;
    this.#group = group;
    this.#wallet = wallet;
  }

  get id(): AccountGroupId {
    return this.#group.id;
  }

  get wallet(): AccountTreeWallet {
    return this.#wallet;
  }

  get name(): string {
    return this.#group.metadata.name;
  }

  getAccountIds(): InternalAccount['id'][] {
    return this.#group.accounts;
  }

  getAccount(id: string): InternalAccount | undefined {
    return this.#messenger.call('AccountsController:getAccount', id);
  }

  #getAccount(id: string): InternalAccount {
    const account = this.getAccount(id);

    if (!account) {
      throw new Error(`Unable to get account with ID: "${id}"`);
    }
    return account;
  }

  getAccounts(): InternalAccount[] {
    return this.#group.accounts.map((id) => this.#getAccount(id));
  }

  getOnlyAccount(): InternalAccount {
    const accountIds = this.getAccountIds();

    if (accountIds.length === 0) {
      throw new Error('Group contains no account');
    }
    if (accountIds.length > 1) {
      throw new Error('Group contains more than 1 account');
    }

    return this.#getAccount(accountIds[0]);
  }
}
