import type { AccountProvider } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type {
  KeyringAccount,
  KeyringAccountEntropyMnemonicOptions,
} from '@metamask/keyring-api';
import { KeyringAccountEntropyTypeOption } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { MultichainAccountControllerMessenger } from '../types';

export type Bip44Account<Account extends KeyringAccount> = Account & {
  options: {
    entropy: KeyringAccountEntropyMnemonicOptions;
  };
};

/**
 * Checks if an account is BIP-44 compatible.
 *
 * @param account - The account to be tested.
 * @returns True if the account is BIP-44 compatible.
 */
export function isBip44Account<Account extends KeyringAccount>(
  account: Account,
): account is Bip44Account<Account> {
  if (
    !account.options.entropy ||
    account.options.entropy.type !== KeyringAccountEntropyTypeOption.Mnemonic
  ) {
    console.warn(
      "! Found an HD account with invalid entropy options: account won't be associated to its wallet.",
    );
    return false;
  }

  return true;
}

export abstract class BaseAccountProvider
  implements AccountProvider<InternalAccount>
{
  protected readonly messenger: MultichainAccountControllerMessenger;

  constructor(messenger: MultichainAccountControllerMessenger) {
    this.messenger = messenger;
  }

  #getAccounts(
    filter: (account: InternalAccount) => boolean = () => true,
  ): Bip44Account<InternalAccount>[] {
    const accounts: Bip44Account<InternalAccount>[] = [];

    for (const account of this.messenger.call(
      'AccountsController:listMultichainAccounts',
    )) {
      if (
        this.isAccountCompatible(account) &&
        isBip44Account(account) &&
        filter(account)
      ) {
        accounts.push(account);
      }
    }

    return accounts;
  }

  getAccounts(): InternalAccount[] {
    return this.#getAccounts();
  }

  getAccount(id: AccountId): InternalAccount {
    // TODO: Maybe just use a proper find for faster lookup?
    const [found] = this.#getAccounts((account) => account.id === id);

    if (!found) {
      throw new Error(`Unable to find account: ${id}`);
    }

    return found;
  }

  abstract isAccountCompatible(account: InternalAccount): boolean;
}
