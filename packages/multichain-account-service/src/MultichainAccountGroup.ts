import type { Bip44Account } from '@metamask/account-api';
import type { AccountProvider } from '@metamask/account-api';
import type { AccountSelector } from '@metamask/account-api';
import { AccountGroupType } from '@metamask/account-api';
import {
  toMultichainAccountGroupId,
  type MultichainAccountGroupId,
  type MultichainAccountGroup as MultichainAccountGroupDefinition,
} from '@metamask/account-api';
import { type KeyringAccount } from '@metamask/keyring-api';
import { isScopeEqualToAny } from '@metamask/keyring-utils';

import type { MultichainAccountWallet } from './MultichainAccountWallet';

/**
 * A multichain account group that holds multiple accounts.
 */
export class MultichainAccountGroup<
  Account extends Bip44Account<KeyringAccount>,
> implements MultichainAccountGroupDefinition<Account>
{
  readonly #id: MultichainAccountGroupId;

  readonly #wallet: MultichainAccountWallet<Account>;

  readonly #index: number;

  readonly #providers: AccountProvider<Account>[];

  readonly #providerToAccounts: Map<AccountProvider<Account>, Account['id'][]>;

  readonly #accountToProvider: Map<Account['id'], AccountProvider<Account>>;

  constructor({
    groupIndex,
    wallet,
    providers,
  }: {
    groupIndex: number;
    wallet: MultichainAccountWallet<Account>;
    providers: AccountProvider<Account>[];
  }) {
    this.#id = toMultichainAccountGroupId(wallet.id, groupIndex);
    this.#index = groupIndex;
    this.#wallet = wallet;
    this.#providers = providers;
    this.#providerToAccounts = new Map();
    this.#accountToProvider = new Map();

    this.sync();
  }

  /**
   * Force multichain account synchronization.
   *
   * This can be used if account providers got new accounts that the multichain
   * account doesn't know about.
   */
  sync(): void {
    // Clear reverse mapping and re-construct it entirely based on the refreshed
    // list of accounts from each providers.
    this.#accountToProvider.clear();

    for (const provider of this.#providers) {
      // Filter account only for that index.
      const accounts = [];
      for (const account of provider.getAccounts()) {
        if (
          account.options.entropy.id === this.wallet.entropySource &&
          account.options.entropy.groupIndex === this.index
        ) {
          // We only use IDs to always fetch the latest version of accounts.
          accounts.push(account.id);
        }
      }
      this.#providerToAccounts.set(provider, accounts);

      // Reverse-mapping for fast indexing.
      for (const id of accounts) {
        this.#accountToProvider.set(id, provider);
      }
    }
  }

  /**
   * Gets the multichain account ID.
   *
   * @returns The multichain account ID.
   */
  get id(): MultichainAccountGroupId {
    return this.#id;
  }

  /**
   * Gets the multichain account type.
   *
   * @returns The multichain account type.
   */
  get type(): AccountGroupType.MultichainAccount {
    return AccountGroupType.MultichainAccount;
  }

  /**
   * Gets the multichain account's wallet reference (parent).
   *
   * @returns The multichain account's wallet.
   */
  get wallet(): MultichainAccountWallet<Account> {
    return this.#wallet;
  }

  /**
   * Gets the multichain account group index.
   *
   * @returns The multichain account group index.
   */
  get index(): number {
    return this.#index;
  }

  /**
   * Checks if there's any underlying accounts for this multichain accounts.
   *
   * @returns True if there's any underlying accounts, false otherwise.
   */
  hasAccounts(): boolean {
    // If there's anything in the reverse-map, it means we have some accounts.
    return this.#accountToProvider.size > 0;
  }

  /**
   * Gets the accounts for this multichain account.
   *
   * @returns The accounts.
   */
  getAccounts(): Account[] {
    const allAccounts: Account[] = [];

    for (const [provider, accounts] of this.#providerToAccounts.entries()) {
      for (const id of accounts) {
        const account = provider.getAccount(id);

        if (account) {
          // If for some reason we cannot get this account from the provider, it
          // might means it has been deleted or something, so we just filter it
          // out.
          allAccounts.push(account);
        }
      }
    }

    return allAccounts;
  }

  /**
   * Gets the account for a given account ID.
   *
   * @param id - Account ID.
   * @returns The account or undefined if not found.
   */
  getAccount(id: Account['id']): Account | undefined {
    const provider = this.#accountToProvider.get(id);

    // If there's nothing in the map, it means we tried to get an account
    // that does not belong to this multichain account.
    if (!provider) {
      return undefined;
    }
    return provider.getAccount(id);
  }

  /**
   * Query an account matching the selector.
   *
   * @param selector - Query selector.
   * @returns The account matching the selector or undefined if not matching.
   * @throws If multiple accounts match the selector.
   */
  get(selector: AccountSelector<Account>): Account | undefined {
    const accounts = this.select(selector);

    if (accounts.length > 1) {
      throw new Error(
        `Too many account candidates, expected 1, got: ${accounts.length}`,
      );
    }

    if (accounts.length === 0) {
      return undefined;
    }

    return accounts[0]; // This is safe, see checks above.
  }

  /**
   * Query accounts matching the selector.
   *
   * @param selector - Query selector.
   * @returns The accounts matching the selector.
   */
  select(selector: AccountSelector<Account>): Account[] {
    return this.getAccounts().filter((account) => {
      let selected = true;

      if (selector.id) {
        selected &&= account.id === selector.id;
      }
      if (selector.address) {
        selected &&= account.address === selector.address;
      }
      if (selector.type) {
        selected &&= account.type === selector.type;
      }
      if (selector.methods !== undefined) {
        selected &&= selector.methods.some((method) =>
          account.methods.includes(method),
        );
      }
      if (selector.scopes !== undefined) {
        selected &&= selector.scopes.some((scope) => {
          return (
            // This will cover specific EVM EOA scopes as well.
            isScopeEqualToAny(scope, account.scopes)
          );
        });
      }

      return selected;
    });
  }
}
