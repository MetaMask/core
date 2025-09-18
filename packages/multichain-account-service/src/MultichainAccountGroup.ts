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
  }

  /**
   * Initialize the multichain account group and construct the internal representation of accounts.
   *
   * Note: This method can be called multiple times to update the group state.
   *
   * @param groupState - The group state.
   */
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

    if (!this.#initialized) {
      this.#initialized = true;
    } else {
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
          // We cast here because TS cannot infer the type of the account from the provider
          allAccounts.push(account as Account);
        }
      }
    }

    return allAccounts;
  }

  /**
   * Gets the account IDs for this multichain account.
   *
   * @returns The account IDs.
   */
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

    // We cast here because TS cannot infer the type of the account from the provider
    return provider.getAccount(id) as Account;
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

    const groupState = results.reduce<GroupState>((state, result, idx) => {
      if (result.status === 'fulfilled') {
        state[this.#providers[idx].getName()] = result.value.map(
          (account) => account.id,
        );
      }
      return state;
    }, {});

    // Update group state
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
