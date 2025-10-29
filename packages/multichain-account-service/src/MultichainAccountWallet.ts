import type {
  AccountGroupId,
  Bip44Account,
  MultichainAccountWalletId,
  MultichainAccountWallet as MultichainAccountWalletDefinition,
  MultichainAccountWalletStatus,
} from '@metamask/account-api';
import {
  AccountWalletType,
  getGroupIndexFromMultichainAccountGroupId,
  isMultichainAccountGroupId,
  toDefaultAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { assert } from '@metamask/utils';
import { Mutex, Semaphore } from 'async-mutex';

import type { Logger } from './logger';
import {
  createModuleLogger,
  ERROR_PREFIX,
  projectLogger as log,
  WARNING_PREFIX,
} from './logger';
import { MultichainAccountGroup } from './MultichainAccountGroup';
import {
  EvmAccountProvider,
  SOL_ACCOUNT_PROVIDER_NAME,
  type NamedAccountProvider,
} from './providers';
import type { MultichainAccountServiceMessenger } from './types';

/**
 * The context for a provider discovery.
 */
type AccountProviderDiscoveryContext<
  Account extends Bip44Account<KeyringAccount>,
> = {
  provider: NamedAccountProvider<Account>;
  stopped: boolean;
  groupIndex: number;
  accounts: Account[];
};

/**
 * A multichain account wallet that holds multiple multichain accounts (one multichain account per
 * group index).
 */
export class MultichainAccountWallet<
  Account extends Bip44Account<KeyringAccount>,
> implements MultichainAccountWalletDefinition<Account>
{
  /**
   * Per-provider semaphores to throttle background account creation for non-EVM providers.
   * Only providers listed in PROVIDER_CONCURRENCY_MAP are throttled, others run unthrottled by default.
   */
  private static readonly PROVIDER_CONCURRENCY_MAP: Record<string, number> = {
    [SOL_ACCOUNT_PROVIDER_NAME]: 3, // Limit Solana to 3 concurrent account creations.
  };

  private static readonly providerQueues: Map<string, Semaphore> = new Map();

  private static getProviderQueue(providerName: string): Semaphore | undefined {
    const configured = this.PROVIDER_CONCURRENCY_MAP[providerName];
    if (!configured || configured <= 0) {
      // No throttling configured for this provider.
      return undefined;
    }
    let queue = this.providerQueues.get(providerName);
    if (!queue) {
      queue = new Semaphore(configured);
      this.providerQueues.set(providerName, queue);
    }
    return queue;
  }

  readonly #lock = new Mutex();

  readonly #id: MultichainAccountWalletId;

  readonly #providers: NamedAccountProvider<Account>[];

  readonly #entropySource: EntropySourceId;

  readonly #accountGroups: Map<number, MultichainAccountGroup<Account>>;

  readonly #messenger: MultichainAccountServiceMessenger;

  readonly #log: Logger;

  // eslint-disable-next-line @typescript-eslint/prefer-readonly
  #initialized = false;

  #status: MultichainAccountWalletStatus;

  constructor({
    providers,
    entropySource,
    messenger,
  }: {
    providers: NamedAccountProvider<Account>[];
    entropySource: EntropySourceId;
    messenger: MultichainAccountServiceMessenger;
  }) {
    this.#id = toMultichainAccountWalletId(entropySource);
    this.#providers = providers;
    this.#entropySource = entropySource;
    this.#messenger = messenger;
    this.#accountGroups = new Map();

    this.#log = createModuleLogger(log, `[${this.#id}]`);

    // Initial synchronization (don't emit events during initialization).
    this.#status = 'uninitialized';
    this.sync();
    this.#initialized = true;
    this.#status = 'ready';
  }

  /**
   * Force wallet synchronization.
   *
   * This can be used if account providers got new accounts that the wallet
   * doesn't know about.
   */
  sync(): void {
    this.#log('Synchronizing with account providers...');
    for (const provider of this.#providers) {
      for (const account of provider.getAccounts()) {
        const { entropy } = account.options;

        // Filter for this wallet only.
        if (entropy.id !== this.entropySource) {
          continue;
        }

        // This multichain account might exists already.
        let multichainAccount = this.#accountGroups.get(entropy.groupIndex);
        if (!multichainAccount) {
          multichainAccount = new MultichainAccountGroup<Account>({
            groupIndex: entropy.groupIndex,
            wallet: this,
            providers: this.#providers,
            messenger: this.#messenger,
          });

          // This existing multichain account group might differ from the
          // `createMultichainAccountGroup` behavior. When creating a new
          // group, we expect the providers to all succeed. But here, we're
          // just fetching the account lists from them, so this group might
          // not be "aligned" yet (e.g having a missing Solana account).
          //
          // Since "aligning" is an async operation, it would have to be run
          // after the first-sync.
          // TODO: Implement align mechanism to create "missing" accounts.

          this.#log(`Found a new group: [${multichainAccount.id}]`);
          this.#accountGroups.set(entropy.groupIndex, multichainAccount);
        }
      }
    }

    // Now force-sync all remaining multichain accounts.
    for (const [
      groupIndex,
      multichainAccount,
    ] of this.#accountGroups.entries()) {
      multichainAccount.sync();

      // Clean up old multichain accounts.
      if (!multichainAccount.hasAccounts()) {
        this.#log(`Deleting group: [${multichainAccount.id}]`);
        this.#accountGroups.delete(groupIndex);
      }
    }

    this.#log('Synchronized');
  }

  /**
   * Gets the multichain account wallet ID.
   *
   * @returns The multichain account wallet ID.
   */
  get id(): MultichainAccountWalletId {
    return this.#id;
  }

  /**
   * Gets the multichain account wallet type, which is always {@link AccountWalletType.Entropy}.
   *
   * @returns The multichain account wallet type.
   */
  get type(): AccountWalletType.Entropy {
    return AccountWalletType.Entropy;
  }

  /**
   * Gets the multichain account wallet entropy source.
   *
   * @returns The multichain account wallet entropy source.
   */
  get entropySource(): EntropySourceId {
    return this.#entropySource;
  }

  /**
   * Gets the multichain account wallet current status.
   *
   * @returns The multichain account wallet current status.
   */
  get status(): MultichainAccountWalletStatus {
    return this.#status;
  }

  /**
   * Set the wallet status and run the associated operation callback.
   *
   * @param status - Wallet status associated with this operation.
   * @param operation - Operation to run.
   * @returns The operation's result.
   * @throws {Error} If the wallet is already running a mutable operation.
   */
  async #withLock<Return>(
    status: MultichainAccountWalletStatus,
    operation: () => Promise<Return>,
  ) {
    const release = await this.#lock.acquire();
    try {
      this.#log(`Locking wallet with status "${status}"...`);
      this.#status = status;
      this.#messenger.publish(
        'MultichainAccountService:walletStatusChange',
        this.id,
        this.#status,
      );
      return await operation();
    } finally {
      this.#status = 'ready';
      this.#messenger.publish(
        'MultichainAccountService:walletStatusChange',
        this.id,
        this.#status,
      );
      release();
      this.#log(`Releasing wallet lock (was "${status}")`);
    }
  }

  /**
   * Create accounts with non‑EVM providers, optionally throttled per provider.
   * When awaitAll is true, waits for all providers and throws if any failed.
   * When false, starts work in background and logs errors without throwing.
   *
   * @param options - Method options.
   * @param options.groupIndex - The group index to create accounts for.
   * @param options.providers - The non‑EVM account providers.
   * @param options.awaitAll - Whether to wait for all providers to finish.
   * @throws If awaitAll is true and any provider fails to create accounts.
   * @returns A promise that resolves when done (if awaitAll is true) or immediately (if false).
   */
  async #createNonEvmAccounts({
    groupIndex,
    providers,
    awaitAll,
  }: {
    groupIndex: number;
    providers: NamedAccountProvider<Account>[];
    awaitAll: boolean;
  }): Promise<void> {
    if (awaitAll) {
      const queuedTasks = providers.map((provider) => {
        const queue = MultichainAccountWallet.getProviderQueue(
          provider.getName(),
        );
        const operation = async () =>
          provider.createAccounts({
            entropySource: this.#entropySource,
            groupIndex,
          });
        return queue ? queue.runExclusive(operation) : operation();
      });

      const results = await Promise.allSettled(queuedTasks);
      if (results.some((r) => r.status === 'rejected')) {
        const error = `Unable to create multichain account group for index: ${groupIndex}`;

        let message = `${error}:`;
        for (const r of results) {
          if (r.status === 'rejected') {
            message += `\n- ${r.reason}`;
          }
        }
        this.#log(`${WARNING_PREFIX} ${message}`);
        console.warn(message);
        throw new Error(error);
      }
      return;
    }

    // Background mode: start tasks, throttle if configured, and log errors.
    providers.forEach((provider) => {
      const queue = MultichainAccountWallet.getProviderQueue(
        provider.getName(),
      );
      const operation = async () => {
        try {
          await provider.createAccounts({
            entropySource: this.#entropySource,
            groupIndex,
          });
        } catch (error) {
          const errorMessage = `Could not to create account with provider "${provider.getName()}" for multichain account group index: ${groupIndex}`;
          this.#log(`${WARNING_PREFIX} ${errorMessage}:`, error);
        }
      };
      if (queue) {
        // eslint-disable-next-line no-void
        void queue.runExclusive(operation);
      } else {
        // eslint-disable-next-line no-void
        void operation();
      }
    });
  }

  /**
   * Gets multichain account for a given ID.
   * The default group ID will default to the multichain account with index 0.
   *
   * @param id - Account group ID.
   * @returns Account group.
   */
  getAccountGroup(
    id: AccountGroupId,
  ): MultichainAccountGroup<Account> | undefined {
    // We consider the "default case" to be mapped to index 0.
    if (id === toDefaultAccountGroupId(this.id)) {
      return this.#accountGroups.get(0);
    }

    // If it is not a valid ID, we cannot extract the group index
    // from it, so we fail fast.
    if (!isMultichainAccountGroupId(id)) {
      return undefined;
    }

    const groupIndex = getGroupIndexFromMultichainAccountGroupId(id);
    return this.#accountGroups.get(groupIndex);
  }

  /**
   * Gets all multichain accounts. Similar to {@link MultichainAccountWallet.getMultichainAccountGroups}.
   *
   * @returns The multichain accounts.
   */
  getAccountGroups(): MultichainAccountGroup<Account>[] {
    return this.getMultichainAccountGroups();
  }

  /**
   * Gets multichain account group for a given index.
   *
   * @param groupIndex - Multichain account index.
   * @returns The multichain account associated with the given index.
   */
  getMultichainAccountGroup(
    groupIndex: number,
  ): MultichainAccountGroup<Account> | undefined {
    return this.#accountGroups.get(groupIndex);
  }

  /**
   * Gets all multichain account groups.
   *
   * @returns The multichain accounts.
   */
  getMultichainAccountGroups(): MultichainAccountGroup<Account>[] {
    return Array.from(this.#accountGroups.values()); // TODO: Prevent copy here.
  }

  /**
   * Gets next group index for this wallet.
   *
   * @returns The next group index of this wallet.
   */
  getNextGroupIndex(): number {
    // We do not check for gaps.
    return (
      Math.max(
        -1, // So it will default to 0 if no groups.
        ...this.#accountGroups.keys(),
      ) + 1
    );
  }

  /**
   * Creates a multichain account group for a given group index.
   *
   * NOTE: This operation WILL lock the wallet's mutex.
   *
   * @param groupIndex - The group index to use.
   * @param options - Options to configure the account creation.
   * @param options.waitForAllProvidersToFinishCreatingAccounts - Whether to wait for all
   * account providers to finish creating their accounts before returning. If `false`, only
   * the EVM provider will be awaited, while all other providers will create their accounts
   * in the background. Defaults to `false`.
   * @throws If any of the account providers fails to create their accounts and
   * the `waitForAllProvidersToFinishCreatingAccounts` option is set to `true`. If `false`,
   * errors from non-EVM providers will be logged but ignored, and only errors from the
   * EVM provider will be thrown.
   * @returns The multichain account group for this group index.
   */
  async createMultichainAccountGroup(
    groupIndex: number,
    options: {
      waitForAllProvidersToFinishCreatingAccounts?: boolean;
    } = { waitForAllProvidersToFinishCreatingAccounts: false },
  ): Promise<MultichainAccountGroup<Account>> {
    return await this.#withLock('in-progress:create-accounts', async () => {
      const nextGroupIndex = this.getNextGroupIndex();
      if (groupIndex > nextGroupIndex) {
        throw new Error(
          `You cannot use a group index that is higher than the next available one: expected <=${nextGroupIndex}, got ${groupIndex}`,
        );
      }

      let group = this.getMultichainAccountGroup(groupIndex);
      if (group) {
        // If the group already exists, we just `sync` it and returns the same
        // reference.
        group.sync();

        this.#log(
          `Trying to re-create existing group: [${group.id}] (idempotent)`,
        );
        return group;
      }

      this.#log(`Creating new group for index ${groupIndex}...`);

      // Extract the EVM provider from the list of providers.
      // We always await EVM account creation first.
      const [evmProvider, ...otherProviders] = this.#providers;
      assert(
        evmProvider instanceof EvmAccountProvider,
        'EVM account provider must be first',
      );

      try {
        await evmProvider.createAccounts({
          entropySource: this.#entropySource,
          groupIndex,
        });
      } catch (error) {
        const errorMessage = `Unable to create multichain account group for index: ${groupIndex} with provider "${evmProvider.getName()}". Error: ${(error as Error).message}`;
        this.#log(`${ERROR_PREFIX} ${errorMessage}:`, error);
        throw new Error(errorMessage);
      }

      // We then create accounts with other providers (some being throttled if configured).
      // Depending on the options, we either await all providers or run them in background.
      if (options?.waitForAllProvidersToFinishCreatingAccounts) {
        await this.#createNonEvmAccounts({
          groupIndex,
          providers: otherProviders,
          awaitAll: true,
        });
      } else {
        // eslint-disable-next-line no-void
        void this.#createNonEvmAccounts({
          groupIndex,
          providers: otherProviders,
          awaitAll: false,
        });
      }

      // --------------------------------------------------------------------------------
      // READ THIS CAREFULLY:
      //
      // Since we're not "fully supporting multichain" for now, we still rely on single
      // :accountCreated events to sync multichain account groups and wallets. Which means
      // that even if of the provider fails, some accounts will still be created on some
      // other providers and will become "available" on the `AccountsController`, like:
      //
      // 1. Creating a multichain account group for index 1
      // 2. EvmAccountProvider.createAccounts returns the EVM account for index 1
      //   * AccountsController WILL fire :accountCreated for this account
      //   * This account WILL BE "available" on the AccountsController state
      // 3. SolAccountProvider.createAccounts fails to create a Solana account for index 1
      //   * AccountsController WON't fire :accountCreated for this account
      //   * This account WON'T be "available" on the Account
      // 4. MultichainAccountService will receive a :accountCreated for the EVM account from
      // step 2 and will create a new multichain account group for index 1, but it won't
      // receive any event for the Solana account of this group. Thus, this group won't be
      // "aligned" (missing "blockchain account" on this group).
      //
      // --------------------------------------------------------------------------------

      // Because of the :accountAdded automatic sync, we might already have created the
      // group, so we first try to get it.
      group = this.getMultichainAccountGroup(groupIndex);
      if (!group) {
        // If for some reason it's still not created, we're creating it explicitly now:
        group = new MultichainAccountGroup({
          wallet: this,
          providers: this.#providers,
          groupIndex,
          messenger: this.#messenger,
        });
      }

      // Register the account to our internal map.
      this.#accountGroups.set(groupIndex, group); // `group` cannot be undefined here.
      this.#log(`New group created: [${group.id}]`);

      if (this.#initialized) {
        this.#messenger.publish(
          'MultichainAccountService:multichainAccountGroupCreated',
          group,
        );
      }

      return group;
    });
  }

  /**
   * Creates the next multichain account group.
   *
   * @throws If any of the account providers fails to create their accounts.
   * @returns The multichain account group for the next group index available.
   */
  async createNextMultichainAccountGroup(): Promise<
    MultichainAccountGroup<Account>
  > {
    return this.createMultichainAccountGroup(this.getNextGroupIndex(), {
      waitForAllProvidersToFinishCreatingAccounts: true,
    });
  }

  /**
   * Align all multichain account groups.
   *
   * NOTE: This operation WILL NOT lock the wallet's mutex.
   */
  async #alignAccounts(): Promise<void> {
    const groups = this.getMultichainAccountGroups();
    await Promise.all(groups.map((group) => group.alignAccounts()));
  }

  /**
   * Align all accounts from each existing multichain account groups.
   *
   * NOTE: This operation WILL lock the wallet's mutex.
   */
  async alignAccounts(): Promise<void> {
    await this.#withLock('in-progress:alignment', async () => {
      await this.#alignAccounts();
    });
  }

  /**
   * Align a specific multichain account group.
   *
   * NOTE: This operation WILL lock the wallet's mutex.
   *
   * @param groupIndex - The group index to align.
   */
  async alignAccountsOf(groupIndex: number): Promise<void> {
    await this.#withLock('in-progress:alignment', async () => {
      const group = this.getMultichainAccountGroup(groupIndex);
      if (group) {
        await group.alignAccounts();
      }
    });
  }

  /**
   * Discover and create accounts for all providers.
   *
   * NOTE: This operation WILL lock the wallet's mutex.
   *
   * @returns The discovered accounts for each provider.
   */
  async discoverAccounts(): Promise<Account[]> {
    return this.#withLock('in-progress:discovery', async () => {
      // Start with the next available group index (so we can resume the discovery
      // from there).
      let maxGroupIndex = this.getNextGroupIndex();

      // One serialized loop per provider; all run concurrently
      const runProviderDiscovery = async (
        context: AccountProviderDiscoveryContext<Account>,
      ) => {
        const providerName = context.provider.getName();
        const message = (stepName: string, groupIndex: number) =>
          `[${providerName}] Discovery ${stepName} for group index: ${groupIndex}`;

        while (!context.stopped) {
          // Fast‑forward to current high‑water mark
          const targetGroupIndex = Math.max(context.groupIndex, maxGroupIndex);

          log(message('started', targetGroupIndex));

          let accounts: Account[] = [];
          try {
            accounts = await context.provider.discoverAccounts({
              entropySource: this.#entropySource,
              groupIndex: targetGroupIndex,
            });
          } catch (error) {
            context.stopped = true;
            console.error(error);
            log(
              message(
                `failed (with: "${(error as Error).message}")`,
                targetGroupIndex,
              ),
              error,
            );
            break;
          }

          if (!accounts.length) {
            log(
              message('stopped (no accounts got discovered)', targetGroupIndex),
            );
            context.stopped = true;
            break;
          }

          log(message('**succeeded**', targetGroupIndex));

          context.accounts = context.accounts.concat(accounts);

          const nextGroupIndex = targetGroupIndex + 1;
          context.groupIndex = nextGroupIndex;

          if (nextGroupIndex > maxGroupIndex) {
            maxGroupIndex = nextGroupIndex;
          }
        }
      };

      const providerContexts: AccountProviderDiscoveryContext<Account>[] =
        this.#providers.map((provider) => ({
          provider,
          stopped: false,
          groupIndex: maxGroupIndex,
          accounts: [],
        }));

      // Start discovery for each providers.
      await Promise.all(providerContexts.map(runProviderDiscovery));

      // Sync the wallet after discovery to ensure that the newly added accounts are added into their groups.
      // We can potentially remove this if we know that this race condition is not an issue in practice.
      this.sync();

      // Align missing accounts from group. This is required to create missing account from non-discovered
      // indexes for some providers.
      await this.#alignAccounts();

      return providerContexts.flatMap((context) => context.accounts);
    });
  }
}
