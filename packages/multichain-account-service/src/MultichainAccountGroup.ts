import { AccountGroupType, select, selectOne } from '@metamask/account-api';
import {
  toMultichainAccountGroupId,
  type MultichainAccountGroupId,
  type MultichainAccountGroup as MultichainAccountGroupDefinition,
} from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { AccountSelector } from '@metamask/account-api';
import { type KeyringAccount } from '@metamask/keyring-api';

import type { Logger } from './logger';
import {
  projectLogger as log,
  createModuleLogger,
  WARNING_PREFIX,
} from './logger';
import type { ServiceState, StateKeys } from './MultichainAccountService';
import type { MultichainAccountWallet } from './MultichainAccountWallet';
import {
  AccountProviderWrapper,
  type BaseBip44AccountProvider,
} from './providers';
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

  readonly #log: Logger;

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

    this.#log = createModuleLogger(log, `[${this.#id}]`);
  }

  /**
   * Initialize the multichain account group and construct the internal representation of accounts.
   *
   * Note: This method can be called multiple times to update the group state.
   *
   * @param groupState - The group state.
   */
  init(groupState: GroupState) {
    this.#log('Initializing group state...');
    for (const provider of this.#providers) {
      const accountIds = groupState[provider.getName()];

      if (accountIds) {
        this.#providerToAccounts.set(provider, accountIds);
        // Add the accounts to the provider's internal list of account IDs
        provider.addAccounts(accountIds);

        for (const accountId of accountIds) {
          this.#accountToProvider.set(accountId, provider);
        }
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

    this.#log('Finished initializing group state...');
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

  #cleanDisabledProvidersState(
    accounts: Account['id'][],
    provider: BaseBip44AccountProvider,
  ): void {
    accounts.forEach((account) => {
      this.#accountToProvider.delete(account);
    });
    this.#providerToAccounts.delete(provider);
    provider.removeAccountsFromList(accounts);
  }

  /**
   * Align the multichain account group.
   *
   * This will create accounts for providers that don't have any accounts yet.
   */
  async alignAccounts(): Promise<void> {
    this.#log('Aligning accounts...');

    const results = await Promise.allSettled(
      this.#providers.map(async (provider) => {
        const accounts = this.#providerToAccounts.get(provider);
        const isDisabled =
          provider instanceof AccountProviderWrapper && provider.isDisabled();
        if ((!accounts || accounts.length === 0) && !isDisabled) {
          this.#log(
            `Found missing accounts for account provider "${provider.getName()}", creating them now...`,
          );
          const created = await provider.createAccounts({
            entropySource: this.wallet.entropySource,
            groupIndex: this.groupIndex,
          });
          this.#log(`Created ${created.length} accounts`);

          return created;
        } else if (isDisabled) {
          this.#log(
            `Account provider "${provider.getName()}" is disabled, skipping alignment...`,
          );
          this.#cleanDisabledProvidersState(accounts ?? [], provider);
        }
        return Promise.reject(new Error('Already aligned'));
      }),
    );

    let failureMessage = '';
    let failureCount = 0;
    const groupState = results.reduce<GroupState>((state, result, idx) => {
      if (result.status === 'fulfilled') {
        state[this.#providers[idx].getName()] = result.value.map(
          (account) => account.id,
        );
      } else if (
        result.status === 'rejected' &&
        result.reason.message !== 'Already aligned'
      ) {
        failureCount += 1;
        failureMessage += `\n- ${this.#providers[idx].getName()}: ${result.reason.message}`;
      }
      return state;
    }, {});

    // Update group state
    this.init(groupState);

    if (failureCount > 0) {
      const hasMultipleFailures = failureCount > 1;
      const message = `Failed to fully align multichain account group for entropy ID: ${this.wallet.entropySource} and group index: ${this.groupIndex}, some accounts might be missing. ${hasMultipleFailures ? 'Providers' : 'Provider'} threw the following ${hasMultipleFailures ? 'errors' : 'error'}:${failureMessage}`;

      this.#log(`${WARNING_PREFIX} ${message}`);
      console.warn(message);
    }

    this.#log('Aligned');
  }
}
