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
import type { MultichainAccountWallet } from './MultichainAccountWallet';
import type { Bip44AccountProvider } from './providers';
import type { MultichainAccountServiceMessenger } from './types';
import { createSentryError } from './utils';

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

    this.sync();
    this.#initialized = true;
  }

  /**
   * Force multichain account synchronization.
   *
   * This can be used if account providers got new accounts that the multichain
   * account doesn't know about.
   */
  sync(): void {
    this.#log('Synchronizing with account providers...');
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

    this.#log('Synchronized');
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

    const results = await Promise.allSettled(
      this.#providers.map(async (provider) => {
        try {
          const accounts = this.#providerToAccounts.get(provider);
          if (!accounts || accounts.length === 0) {
            this.#log(
              `Found missing accounts for account provider "${provider.getName()}", creating them now...`,
            );
            const created = await provider.createAccounts({
              entropySource: this.wallet.entropySource,
              groupIndex: this.groupIndex,
            });
            this.#log(`Created ${created.length} accounts`);

            return created;
          }
          return Promise.resolve();
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
          this.#messenger.call(
            'ErrorReportingService:captureException',
            sentryError,
          );
          throw error;
        }
      }),
    );

    if (results.some((result) => result.status === 'rejected')) {
      const message = `Failed to fully align multichain account group for entropy ID: ${this.wallet.entropySource} and group index: ${this.groupIndex}, some accounts might be missing`;

      this.#log(`${WARNING_PREFIX} ${message}`);
      console.warn(message);
    }

    this.#log('Aligned');
  }
}
