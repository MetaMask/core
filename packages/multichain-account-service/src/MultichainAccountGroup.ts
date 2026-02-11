import { AccountGroupType, select, selectOne } from '@metamask/account-api';
import { toMultichainAccountGroupId } from '@metamask/account-api';
import type {
  MultichainAccountGroupId,
  MultichainAccountGroup as MultichainAccountGroupDefinition,
} from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { AccountSelector } from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';

import type { Logger } from './logger';
import {
  projectLogger as log,
  createModuleLogger,
  WARNING_PREFIX,
} from './logger';
import type { ServiceState, StateKeys } from './MultichainAccountService';
import type { MultichainAccountWallet } from './MultichainAccountWallet';
import type { Bip44AccountProvider } from './providers';
import { isAccountProviderWrapper } from './providers';
import type { MultichainAccountServiceMessenger } from './types';
import { createSentryError } from './utils';

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

  readonly #providers: Bip44AccountProvider<Account>[];

  readonly #providerToAccounts: Map<
    Bip44AccountProvider<Account>,
    Account['id'][]
  >;

  readonly #accountToProvider: Map<
    Account['id'],
    Bip44AccountProvider<Account>
  >;

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
    providers: Bip44AccountProvider<Account>[];
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
   * Clear the account to provider state for a given provider.
   *
   * @param provider - The provider to clear the account to provider state for.
   */
  #clearAccountToProviderState(provider: Bip44AccountProvider<Account>): void {
    this.#accountToProvider.forEach((accountProvider, id) => {
      if (accountProvider === provider) {
        this.#accountToProvider.delete(id);
      }
    });
  }

  /**
   * Update the internal representation of accounts with the given group state.
   *
   * @param groupState - The group state.
   */
  #setState(groupState: GroupState): void {
    for (const provider of this.#providers) {
      const accountIds = groupState[provider.getName()];

      if (accountIds) {
        this.#clearAccountToProviderState(provider);
        this.#providerToAccounts.set(provider, accountIds);

        for (const accountId of accountIds) {
          this.#accountToProvider.set(accountId, provider);
        }
      }
    }
  }

  /**
   * Initialize the multichain account group and construct the internal representation of accounts.
   *
   * @param groupState - The group state.
   */
  init(groupState: GroupState): void {
    this.#log('Initializing group state...');
    this.#setState(groupState);
    this.#log('Finished initializing group state...');

    this.#initialized = true;
  }

  /**
   * Update the group state.
   *
   * @param groupState - The group state.
   */
  update(groupState: GroupState): void {
    this.#log('Updating group state...');
    this.#setState(groupState);
    this.#log('Finished updating group state...');

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

  /**
   * Gets the account IDs for this multichain account.
   *
   * @returns The account IDs.
   */
  getAccountIds(): Account['id'][] {
    return [...this.#accountToProvider.keys()];
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
    this.#log('Aligning accounts...');

    this.#providerToAccounts.clear();
    this.#accountToProvider.clear();

    const results = await Promise.allSettled(
      this.#providers.map(async (provider) => {
        try {
          const accounts = await provider.alignAccounts({
            entropySource: this.wallet.entropySource,
            groupIndex: this.groupIndex,
          });

          const isDisabled =
            isAccountProviderWrapper(provider) && provider.isDisabled();

          if (isDisabled) {
            this.#log(
              `Account provider "${provider.getName()}" is disabled, skipping alignment...`,
            );
          } else if (accounts.length > 0) {
            this.#log(
              `Found missing accounts for account provider "${provider.getName()}", creating them now...`,
            );
            this.#providerToAccounts.set(provider, accounts);
            for (const accountId of accounts) {
              this.#accountToProvider.set(accountId, provider);
            }
          }

          return accounts;
        } catch (error) {
          // istanbul ignore next
          this.#log(
            `${WARNING_PREFIX} ${error instanceof Error ? error.message : String(error)}`,
          );
          const sentryError = createSentryError(
            `Unable to align accounts with provider "${provider.getName()}"`,
            error as Error,
            {
              groupIndex: this.groupIndex,
              provider: provider.getName(),
            },
          );
          this.#messenger.captureException?.(sentryError);
          throw error;
        }
      }),
    );

    let failureMessage = '';
    let failureCount = 0;
    const groupState = results.reduce<GroupState>((state, result, idx) => {
      if (result.status === 'fulfilled' && result.value.length) {
        state[this.#providers[idx].getName()] = result.value;
      } else if (result.status === 'rejected') {
        failureCount += 1;
        failureMessage += `\n- ${this.#providers[idx].getName()}: ${result.reason.message}`;
      }
      return state;
    }, {});

    // Update group state
    this.update(groupState);

    if (failureCount > 0) {
      const hasMultipleFailures = failureCount > 1;
      const message = `Failed to fully align multichain account group for entropy ID: ${this.wallet.entropySource} and group index: ${this.groupIndex}, some accounts might be missing. ${hasMultipleFailures ? 'Providers' : 'Provider'} threw the following ${hasMultipleFailures ? 'errors' : 'error'}:${failureMessage}`;

      this.#log(`${WARNING_PREFIX} ${message}`);
      console.warn(message);
    }

    this.#log('Aligned');
  }
}
