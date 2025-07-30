import {
  isBip44Account,
  type AccountProvider as AccountProviderDefinition,
  type Bip44Account,
} from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringMetadata,
  KeyringSelector,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { MultichainAccountServiceMessenger } from '../types';

export type AccountProvider<Account extends KeyringAccount> =
  AccountProviderDefinition<Account> & {
    createAccounts({
      entropySource,
      groupIndex,
    }: {
      entropySource: EntropySourceId;
      groupIndex: number;
    }): Promise<Account['id'][]>;
  };

export abstract class BaseAccountProvider
  implements AccountProvider<Bip44Account<InternalAccount>>
{
  protected readonly messenger: MultichainAccountServiceMessenger;

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.messenger = messenger;
  }

  #getAccounts(
    filter: (account: InternalAccount) => boolean = () => true,
  ): Bip44Account<InternalAccount>[] {
    const accounts: Bip44Account<InternalAccount>[] = [];

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

  getAccounts(): Bip44Account<InternalAccount>[] {
    return this.#getAccounts();
  }

  getAccount(id: InternalAccount['id']): Bip44Account<InternalAccount> {
    // TODO: Maybe just use a proper find for faster lookup?
    const [found] = this.#getAccounts((account) => account.id === id);

    if (!found) {
      throw new Error(`Unable to find account: ${id}`);
    }

    return found;
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

  abstract isAccountCompatible(account: Bip44Account<InternalAccount>): boolean;

  abstract createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<InternalAccount>['id'][]>;
}
