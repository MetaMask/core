import {
  isBip44Account,
  type AccountProvider,
  type Bip44Account,
} from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';

import type { MultichainAccountServiceMessenger } from '../types';

export abstract class BaseAccountProvider
  implements AccountProvider<Bip44Account<KeyringAccount>>
{
  protected readonly messenger: MultichainAccountServiceMessenger;

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.messenger = messenger;
  }

  #getAccounts(
    filter: (account: KeyringAccount) => boolean = () => true,
  ): Bip44Account<KeyringAccount>[] {
    const accounts: Bip44Account<KeyringAccount>[] = [];

    for (const account of this.messenger.call(
      // NOTE: Even though the name is misleading, this only fetches all internal
      // accounts, including EVM and non-EVM. We might wanna change this action
      // name once we fully support multichain accounts.
      'AccountsController:listMultichainAccounts',
    )) {
      if (
        isBip44Account(account) &&
        this.isAccountCompatible(account) &&
        filter(account)
      ) {
        accounts.push(account);
      }
    }

    return accounts;
  }

  getAccounts(): Bip44Account<KeyringAccount>[] {
    return this.#getAccounts();
  }

  getAccount(
    id: Bip44Account<KeyringAccount>['id'],
  ): Bip44Account<KeyringAccount> {
    // TODO: Maybe just use a proper find for faster lookup?
    const [found] = this.#getAccounts((account) => account.id === id);

    if (!found) {
      throw new Error(`Unable to find account: ${id}`);
    }

    return found;
  }

  abstract isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;
}
