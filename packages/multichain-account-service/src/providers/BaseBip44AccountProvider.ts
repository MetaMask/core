import {
  isBip44Account,
  type AccountProvider,
  type Bip44Account,
} from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringMetadata,
  KeyringSelector,
} from '@metamask/keyring-controller';

import type { MultichainAccountServiceMessenger } from '../types';

/**
 * Asserts a keyring account is BIP-44 compatible.
 *
 * @param account - Keyring account to check.
 * @throws If the keyring account is not compatible.
 */
export function assertIsBip44Account(
  account: KeyringAccount,
): asserts account is Bip44Account<KeyringAccount> {
  if (!isBip44Account(account)) {
    throw new Error('Created account is not BIP-44 compatible');
  }
}

/**
 * Asserts that a list of keyring accounts are all BIP-44 compatible.
 *
 * @param accounts - Keyring accounts to check.
 * @throws If any of the keyring account is not compatible.
 */
export function assertAreBip44Accounts(
  accounts: KeyringAccount[],
): asserts accounts is Bip44Account<KeyringAccount>[] {
  accounts.forEach(assertIsBip44Account);
}

export type Bip44AccountProvider<
  Account extends Bip44Account<KeyringAccount> = Bip44Account<KeyringAccount>,
> = AccountProvider<Account> & {
  getName(): string;
  addAccounts(accounts: Bip44Account<KeyringAccount>['id'][]): void;
  clearAccountsList(): void;
  isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;
};

export abstract class BaseBip44AccountProvider<
  Account extends Bip44Account<KeyringAccount> = Bip44Account<KeyringAccount>,
> implements Bip44AccountProvider
{
  protected readonly messenger: MultichainAccountServiceMessenger;

  accounts: Bip44Account<KeyringAccount>['id'][] = [];

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.messenger = messenger;
  }

  /**
   * Add accounts to the provider.
   *
   * @param accounts - The accounts to add.
   */
  addAccounts(accounts: Account['id'][]): void {
    this.accounts.push(...accounts);
  }

  /**
   * Get the accounts list for the provider.
   *
   * @returns The accounts list.
   */
  #getAccountIds(): Account['id'][] {
    return this.accounts;
  }

  clearAccountsList(): void {
    this.accounts = [];
  }

  /**
   * Get the accounts list for the provider from the AccountsController.
   *
   * @returns The accounts list.
   */
  getAccounts(): Account[] {
    const accountsIds = this.#getAccountIds();
    const internalAccounts = this.messenger.call(
      'AccountsController:getAccounts',
      accountsIds,
    );
    // we cast here because we know that the accounts are BIP-44 compatible
    return internalAccounts as unknown as Account[];
  }

  /**
   * Get the account for the provider.
   *
   * @param id - The account ID.
   * @returns The account.
   * @throws If the account is not found.
   */
  getAccount(id: Account['id']): Account {
    const found = this.getAccounts().find((account) => account.id === id);

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

  abstract getName(): string;

  abstract isAccountCompatible(account: Account): boolean;

  abstract createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Account[]>;

  abstract discoverAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Account[]>;
}
