import {
  toAccountGroupId,
  type AccountGroup,
  type AccountGroupId,
  type AccountWallet,
} from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountId } from '@metamask/keyring-utils';
import type { AccountTreeControllerMessenger } from 'src';

export const DEFAULT_ACCOUNT_GROUP_NAME: string = 'Default';

export class AccountTreeGroup implements AccountGroup<InternalAccount> {
  readonly id: AccountGroupId;

  readonly wallet: AccountWallet<InternalAccount>;

  readonly messenger: AccountTreeControllerMessenger;

  readonly #accounts: AccountId[];

  constructor(
    messenger: AccountTreeControllerMessenger,
    wallet: AccountWallet<InternalAccount>,
    id: string,
    accounts: AccountId[],
  ) {
    this.id = toAccountGroupId(wallet.id, id);
    this.wallet = wallet;
    this.messenger = messenger;

    this.#accounts = accounts;
  }

  get accounts(): AccountId[] {
    return this.#accounts.slice(); // Force the copy here.
  }

  getAccounts(): InternalAccount[] {
    const accounts = [];

    for (const id of this.#accounts) {
      const account = this.getAccount(id);

      // FIXME: I'm really not sure we should skip those but... We could be
      // "de-sync" with the AccountsController and might have some dangling
      // account IDs.
      if (!account) {
        console.warn(`! Unable to get account: "${id}"`);
        continue;
      }
      accounts.push(account);
    }
    return accounts;
  }

  getAccount(id: AccountId): InternalAccount | undefined {
    return this.messenger.call('AccountsController:getAccount', id);
  }

  getDefaultName(): string {
    // TODO: We might need to make this customizable when introducing multichain account.
    return DEFAULT_ACCOUNT_GROUP_NAME;
  }
}
