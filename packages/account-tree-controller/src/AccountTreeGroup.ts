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

/**
 * Account group coming from the {@link AccountTreeController}.
 */
export type AccountTreeGroup = {
  /**
   * Account IDs for that account group.
   */
  get accounts(): AccountId[];
} & AccountGroup<InternalAccount>;

// This class is meant to be used internally by every rules. It exposes mutable operations
// which should not leak outside of this package.
export class MutableAccountTreeGroup implements AccountTreeGroup {
  readonly id: AccountGroupId;

  readonly wallet: AccountWallet<InternalAccount>;

  readonly messenger: AccountTreeControllerMessenger;

  readonly #accounts: Set<AccountId>;

  constructor(
    messenger: AccountTreeControllerMessenger,
    wallet: AccountWallet<InternalAccount>,
    id: string,
  ) {
    this.id = toAccountGroupId(wallet.id, id);
    this.wallet = wallet;
    this.messenger = messenger;

    this.#accounts = new Set();
  }

  get accounts(): AccountId[] {
    return Array.from(this.#accounts); // FIXME: Should we force the copy here?
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

  addAccount(account: InternalAccount) {
    this.#accounts.add(account.id);
  }

  // NOTE: This method SHOULD BE overriden if a rule need to name its group differently.
  getDefaultName(): string {
    return DEFAULT_ACCOUNT_GROUP_NAME;
  }
}
