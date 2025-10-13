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

export type NamedAccountProvider<
  Account extends Bip44Account<KeyringAccount> = Bip44Account<KeyringAccount>,
> = AccountProvider<Account> & {
  getName(): string;
};

export abstract class BaseBip44AccountProvider implements NamedAccountProvider {
  protected readonly messenger: MultichainAccountServiceMessenger;

  accounts: Bip44Account<KeyringAccount>['id'][] = [];

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.messenger = messenger;
  }

  abstract getName(): string;

  /**
   * Add accounts to the provider.
   *
   * @param accounts - The accounts to add.
   */
  addAccounts(accounts: Bip44Account<KeyringAccount>['id'][]): void {
    this.accounts.push(...accounts);
  }

  /**
   * Get the accounts list for the provider.
   *
   * @returns The accounts list.
   */
  #getAccountsList(): Bip44Account<KeyringAccount>['id'][] {
    return this.accounts;
  }

  removeAccountsFromList(accounts: Bip44Account<KeyringAccount>['id'][]): void {
    this.accounts = this.accounts.filter(
      (account) => !accounts.includes(account),
    );
  }

  /**
   * Get the accounts list for the provider from the AccountsController.
   *
   * @returns The accounts list.
   */
  getAccounts(): Bip44Account<KeyringAccount>[] {
    const accountsList = this.#getAccountsList();
    const internalAccounts = this.messenger.call(
      'AccountsController:getAccounts',
      accountsList,
    );
    // we cast here because we know that the accounts are BIP-44 compatible
    return internalAccounts as Bip44Account<KeyringAccount>[];
  }

  /**
   * Get the account for the provider.
   *
   * @param id - The account ID.
   * @returns The account.
   * @throws If the account is not found.
   */
  getAccount(
    id: Bip44Account<KeyringAccount>['id'],
  ): Bip44Account<KeyringAccount> {
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

  abstract isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;

  abstract createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]>;

  abstract discoverAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]>;
}
