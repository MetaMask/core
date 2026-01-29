import { isBip44Account } from '@metamask/account-api';
import type { AccountProvider, Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import type {
  KeyringMetadata,
  KeyringSelector,
} from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

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
  /**
   * Get the name of the provider.
   *
   * @returns The name of the provider.
   */
  getName(): string;
  /**
   * Initialize the provider with the given accounts.
   *
   * @param accounts - The accounts to initialize the provider with.
   */
  init(accounts: Bip44Account<KeyringAccount>['id'][]): void;
  /**
   * Check if the account is compatible with the provider.
   */
  isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;
  /**
   * Align the accounts with the given entropy source and group index.
   *
   * @param options - The options for aligning the accounts.
   * @param options.entropySource - The entropy source.
   * @param options.groupIndex - The group index.
   * @returns The already and newly aligned accounts IDs.
   */
  alignAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Account['id'][]>;
  /**
   * Re-synchronize MetaMask accounts and the providers accounts if needed.
   *
   * NOTE: This is mostly required if one of the providers (keyrings or Snaps)
   * have different sets of accounts. This method would ensure that both are
   * in-sync and use the same accounts (and same IDs).
   */
  resyncAccounts(accounts: Bip44Account<InternalAccount>[]): Promise<void>;
};

export abstract class BaseBip44AccountProvider<
  Account extends Bip44Account<KeyringAccount> = Bip44Account<KeyringAccount>,
> implements Bip44AccountProvider
{
  protected readonly messenger: MultichainAccountServiceMessenger;

  protected accounts: Set<Bip44Account<KeyringAccount>['id']> = new Set();

  constructor(messenger: MultichainAccountServiceMessenger) {
    this.messenger = messenger;
  }

  /**
   * Add accounts to the provider.
   *
   * Note: There's an implicit assumption that the accounts are BIP-44 compatible.
   *
   * @param accounts - The accounts to add.
   */
  init(accounts: Account['id'][]): void {
    for (const account of accounts) {
      this.accounts.add(account);
    }
  }

  /**
   * Get the accounts list for the provider.
   *
   * @returns The accounts list.
   */
  #getAccountIds(): Account['id'][] {
    return [...this.accounts];
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
    const hasAccount = this.accounts.has(id);

    if (!hasAccount) {
      throw new Error(`Unable to find account: ${id}`);
    }

    // We need to upcast here since InternalAccounts are not always BIP-44 compatible
    // but we know that the account is BIP-44 compatible here so it is safe to do so
    return this.messenger.call(
      'AccountsController:getAccount',
      id,
    ) as unknown as Account;
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

  async alignAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Account['id'][]> {
    const accounts = await this.createAccounts({
      entropySource,
      groupIndex,
    });
    const accountIds = accounts.map((account) => account.id);
    return accountIds;
  }

  abstract getName(): string;

  abstract resyncAccounts(
    accounts: Bip44Account<InternalAccount>[],
  ): Promise<void>;

  abstract isAccountCompatible(account: Bip44Account<KeyringAccount>): boolean;

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
