import { AccountGroupType, select, selectOne } from '@metamask/account-api';
import {
  toMultichainAccountGroupId,
  type MultichainAccountGroupId,
  type MultichainAccountGroup as MultichainAccountGroupDefinition,
} from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { AccountSelector } from '@metamask/account-api';
import { type KeyringAccount } from '@metamask/keyring-api';

import type { ServiceState, StateKeys } from './MultichainAccountService';
import type { MultichainAccountWallet } from './MultichainAccountWallet';
import type { BaseBip44AccountProvider } from './providers';
import type { MultichainAccountServiceMessenger } from './types';

export type GroupState =
  ServiceState[StateKeys['entropySource']][StateKeys['groupIndex']];

/**
 * A multichain account group that holds multiple accounts.
 */
export class MultichainAccountGroup<
  Account extends Bip44Account<KeyringAccount>,
> implements MultichainAccountGroupDefinition<Account>
{
  readonly #id: MultichainAccountGroupId;

  readonly #wallet: MultichainAccountWallet<Account>;

  readonly #groupIndex: number;

  readonly #providers: BaseBip44AccountProvider[];

  readonly #providerToAccounts: Map<BaseBip44AccountProvider, Account['id'][]>;

  readonly #accountToProvider: Map<Account['id'], BaseBip44AccountProvider>;

  readonly #messenger: MultichainAccountServiceMessenger;

  // eslint-disable-next-line @typescript-eslint/prefer-readonly
  #initialized = false;

  constructor({
    groupIndex,
    wallet,
    providers,
    messenger,
  }: {
    groupIndex: number;
    wallet: MultichainAccountWallet<Account>;
    providers: BaseBip44AccountProvider[];
    messenger: MultichainAccountServiceMessenger;
  }) {
    this.#id = toMultichainAccountGroupId(wallet.id, groupIndex);
    this.#groupIndex = groupIndex;
    this.#wallet = wallet;
    this.#providers = providers;
    this.#messenger = messenger;
    this.#providerToAccounts = new Map();
    this.#accountToProvider = new Map();

    this.sync();
    this.#initialized = true;
  }

  init(groupState: GroupState) {
    for (const provider of this.#providers) {
      const accountIds = groupState[provider.getName()];

      if (accountIds) {
        for (const accountId of accountIds) {
          this.#accountToProvider.set(accountId, provider);
        }
        const providerAccounts = this.#providerToAccounts.get(provider);
        if (!providerAccounts) {
          this.#providerToAccounts.set(provider, accountIds);
        } else {
          providerAccounts.push(...accountIds);
        }
        // Add the accounts to the provider's internal list of account IDs
        provider.addAccounts(accountIds);
      }
    }
  }

  /**
   * Add a method to update a group and emit the multichainAccountGroupUpdated event
   */

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
          account.options.entropy.groupIndex === this.groupIndex
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

    // Emit update event when group is synced (only if initialized)
    if (this.#initialized) {
      this.#messenger.publish(
        'MultichainAccountService:multichainAccountGroupUpdated',
        this,
      );
    }
  }

  /**
   * Gets the multichain account group ID.
   *
   * @returns The multichain account group ID.
   */
  get id(): MultichainAccountGroupId {
    return this.#id;
  }

  /**
   * Gets the multichain account group type.
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
  get groupIndex(): number {
    return this.#groupIndex;
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

  getAccountIds(): Account['id'][] {
    return [...this.#providerToAccounts.values()].flat();
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
    return selectOne(this.getAccounts(), selector);
  }

  /**
   * Query accounts matching the selector.
   *
   * @param selector - Query selector.
   * @returns The accounts matching the selector.
   */
  select(selector: AccountSelector<Account>): Account[] {
    return select(this.getAccounts(), selector);
  }

  /**
   * Align the multichain account group.
   *
   * This will create accounts for providers that don't have any accounts yet.
   */
  async alignAccounts(): Promise<void> {
    const results = await Promise.allSettled(
      this.#providers.map((provider) => {
        const accounts = this.#providerToAccounts.get(provider);
        if (!accounts || accounts.length === 0) {
          return provider.createAccounts({
            entropySource: this.wallet.entropySource,
            groupIndex: this.groupIndex,
          });
        }
        return Promise.reject(new Error('Already aligned'));
      }),
    );

    // Fetching the account list once from the AccountsController to avoid multiple calls
    const accountsList = this.#messenger.call(
      'AccountsController:listMultichainAccounts',
    );

    const groupState: GroupState = {};

    const addressBuckets = results.map((result, idx) => {
      const addressSet = new Set<string>();
      if (result.status === 'fulfilled') {
        groupState[this.#providers[idx].getName()] = [];
        result.value.forEach((account) => {
          addressSet.add(account.address);
        });
      }
      return addressSet;
    });

    accountsList.forEach((account) => {
      const { address } = account;
      addressBuckets.forEach((addressSet, idx) => {
        if (addressSet.has(address)) {
          groupState[this.#providers[idx].getName()].push(account.id);
        }
      });
    });

    this.init(groupState);

    if (results.some((result) => result.status === 'rejected')) {
      const rejectedResults = results.filter(
        (result) =>
          result.status === 'rejected' && result.reason !== 'Already aligned',
      ) as PromiseRejectedResult[];
      const errors = rejectedResults
        .map((result) => `- ${result.reason}`)
        .join('\n');
      const hasMultipleFailures = rejectedResults.length > 1;
      console.warn(
        `Failed to fully align multichain account group for entropy ID: ${this.wallet.entropySource} and group index: ${this.groupIndex}, some accounts might be missing. ${hasMultipleFailures ? 'Providers' : 'Provider'} threw the following ${hasMultipleFailures ? 'errors' : 'error'}:\n${errors}`,
      );
    }
  }
}
