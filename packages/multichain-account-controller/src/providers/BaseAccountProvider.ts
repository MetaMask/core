import type { AccountId } from '@metamask/accounts-controller';
import type { KeyringAccount } from '@metamask/keyring-api';
import { type EntropySourceId } from '@metamask/keyring-api';
import {
  type KeyringMetadata,
  type KeyringSelector,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountProvider } from '@metamask/multichain-account-api';

import type { MultichainAccountControllerMessenger } from '../types';

export type Bip44Account<Account extends KeyringAccount> = Account & {
  options: {
    index: number;
    entropySource: EntropySourceId;
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
  // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
  if (!account.options.entropySource) {
    console.warn(
      "! Found an HD account with no entropy source: account won't be associated to its wallet.",
    );
    return false;
  }

  // TODO: We need to add this index for native accounts too!
  if (account.options.index === undefined) {
    console.warn(
      "! Found an HD account with no index: account won't be associated to its wallet.",
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

  protected async withKeyring<SelectedKeyring, CallbackResult = void>(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    const result = await this.messenger.call(
      'KeyringController:withKeyring',
      selector,
      ({ keyring, metadata }) =>
        operation({
          keyring: keyring as SelectedKeyring,
          metadata,
        }),
    );

    return result as CallbackResult;
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

  getAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): AccountId[] {
    return this.#getAccounts((account) => {
      return (
        account.options.entropySource === entropySource &&
        account.options.index === groupIndex
      );
    }).map((account) => account.id);
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

  abstract createAccounts(opts: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<AccountId[]>;

  abstract discoverAndCreateAccounts(opts: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<AccountId[]>;
}
