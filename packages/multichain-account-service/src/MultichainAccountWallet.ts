import {
  getGroupIndexFromMultichainAccountGroupId,
  isMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { toDefaultAccountGroupId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import type {
  Bip44Account,
  MultichainAccountWalletId,
  MultichainAccountWallet as MultichainAccountWalletDefinition,
} from '@metamask/account-api';
import type { AccountGroupId } from '@metamask/account-api';
import {
  type EntropySourceId,
  type KeyringAccount,
} from '@metamask/keyring-api';

import { MultichainAccountGroup } from './MultichainAccountGroup';
import type { NamedAccountProvider } from './providers';

/**
 * A multichain account wallet that holds multiple multichain accounts (one multichain account per
 * group index).
 */
export class MultichainAccountWallet<
  Account extends Bip44Account<KeyringAccount>,
> implements MultichainAccountWalletDefinition<Account>
{
  readonly #id: MultichainAccountWalletId;

  readonly #providers: NamedAccountProvider<Account>[];

  readonly #entropySource: EntropySourceId;

  readonly #accountGroups: Map<number, MultichainAccountGroup<Account>>;

  #isAlignmentInProgress: boolean = false;

  constructor({
    providers,
    entropySource,
  }: {
    providers: NamedAccountProvider<Account>[];
    entropySource: EntropySourceId;
  }) {
    this.#id = toMultichainAccountWalletId(entropySource);
    this.#providers = providers;
    this.#entropySource = entropySource;
    this.#accountGroups = new Map();

    // Initial synchronization.
    this.sync();
  }

  /**
   * Force wallet synchronization.
   *
   * This can be used if account providers got new accounts that the wallet
   * doesn't know about.
   */
  sync(): void {
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
        this.#accountGroups.delete(groupIndex);
      }
    }
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
   * @param groupIndex - The group index to use.
   * @throws If any of the account providers fails to create their accounts.
   * @returns The multichain account group for this group index.
   */
  async createMultichainAccountGroup(
    groupIndex: number,
  ): Promise<MultichainAccountGroup<Account>> {
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

      return group;
    }

    const results = await Promise.allSettled(
      this.#providers.map((provider) =>
        provider.createAccounts({
          entropySource: this.#entropySource,
          groupIndex,
        }),
      ),
    );

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

    // If any of the provider failed to create their accounts, then we consider the
    // multichain account group to have failed too.
    if (results.some((result) => result.status === 'rejected')) {
      // NOTE: Some accounts might still have been created on other account providers. We
      // don't rollback them.
      const error = `Unable to create multichain account group for index: ${groupIndex}`;

      let warn = `${error}:`;
      for (const result of results) {
        if (result.status === 'rejected') {
          warn += `\n- ${result.reason}`;
        }
      }
      console.warn(warn);

      throw new Error(error);
    }

    // Because of the :accountAdded automatic sync, we might already have created the
    // group, so we first try to get it.
    group = this.getMultichainAccountGroup(groupIndex);
    if (!group) {
      // If for some reason it's still not created, we're creating it explicitly now:
      group = new MultichainAccountGroup({
        wallet: this,
        providers: this.#providers,
        groupIndex,
      });
    }

    // Register the account to our internal map.
    this.#accountGroups.set(groupIndex, group); // `group` cannot be undefined here.

    return group;
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
    return this.createMultichainAccountGroup(this.getNextGroupIndex());
  }

  /**
   * Gets whether alignment is currently in progress for this wallet.
   *
   * @returns True if alignment is in progress, false otherwise.
   */
  getIsAlignmentInProgress(): boolean {
    return this.#isAlignmentInProgress;
  }

  /**
   * Align all multichain account groups.
   */
  async alignGroups(): Promise<void> {
    if (this.#isAlignmentInProgress) {
      return; // Prevent concurrent alignments
    }

    this.#isAlignmentInProgress = true;
    try {
      const groups = this.getMultichainAccountGroups();
      await Promise.all(groups.map((g) => g.align()));
    } finally {
      this.#isAlignmentInProgress = false;
    }
  }

  /**
   * Align a specific multichain account group.
   *
   * @param groupIndex - The group index to align.
   */
  async alignGroup(groupIndex: number): Promise<void> {
    if (this.#isAlignmentInProgress) {
      return; // Prevent concurrent alignments
    }

    this.#isAlignmentInProgress = true;
    try {
      const group = this.getMultichainAccountGroup(groupIndex);
      if (group) {
        await group.align();
      }
    } finally {
      this.#isAlignmentInProgress = false;
    }
  }

  /**
   * Discover and create accounts for all providers.
   *
   * NOTE: This method should only be called on a newly created wallet.
   *
   * @returns The discovered accounts for each provider.
   */
  async discoverAndCreateAccounts(): Promise<Record<string, number>> {
    const providers = this.#providers;
    const providerContexts = new Map<
      NamedAccountProvider,
      {
        stopped: boolean;
        running?: Promise<void>;
        groupIndex: number;
        count: number;
      }
    >();

    for (const p of providers) {
      providerContexts.set(p, { stopped: false, groupIndex: 0, count: 0 });
    }

    let maxGroupIndex = 0;

    const schedule = async (p: NamedAccountProvider, index: number) => {
      // Ok to cast here because we know that the ctx will always be set.
      const providerCtx = providerContexts.get(p) as {
        stopped: boolean;
        running?: Promise<void>;
        groupIndex: number;
        count: number;
      };

      /* istanbul ignore next
       * Reason: This guard triggers only if `schedule` is invoked for the same
       * provider while a previous step is still pending. Because the
       * coordinator self‑reschedules in `finally` and catch‑up scheduling checks
       * `!qCtx.running`, creating this exact interleaving in unit tests without
       * racy sleeps is brittle. We keep the guard for safety and exclude it from
       * coverage.
       */
      if (providerCtx.running) {
        // Wait for current scheduled job before starting a new one.
        await providerCtx.running.catch((error) => {
          console.error(error);
        });
        providerCtx.running = undefined;
      }

      providerCtx.groupIndex = index;

      providerCtx.running = (async () => {
        try {
          const accounts = await p.discoverAndCreateAccounts({
            entropySource: this.#entropySource,
            groupIndex: index,
          });

          // Stopping condition: Account discovery is halted if no accounts are returned by the provider.
          if (!accounts.length) {
            providerCtx.stopped = true;
            return;
          }

          providerCtx.count += accounts.length;

          const next = index + 1;
          providerCtx.groupIndex = next;

          if (next > maxGroupIndex) {
            maxGroupIndex = next;
            for (const [q, qCtx] of providerContexts) {
              /* istanbul ignore next
               * Reason: This branch triggers only when a lagging provider is
               * momentarily "not running" exactly as another provider advances
               * the high group index. Because the coordinator self‑reschedules in
               * `finally`, tests cannot reliably create this timing window without
               * racy sleeps. We keep this path for robustness and exclude it from
               * coverage.
               */
              if (
                !qCtx.stopped &&
                !qCtx.running &&
                qCtx.groupIndex < maxGroupIndex
              ) {
                qCtx.running = schedule(q, maxGroupIndex);
              }
            }
          }
        } catch (err) {
          providerCtx.stopped = true;
          console.error(err);
        } finally {
          providerCtx.running = undefined;
          if (!providerCtx.stopped) {
            const target = Math.max(maxGroupIndex, providerCtx.groupIndex);
            providerCtx.running = schedule(p, target);
          }
        }
      })();

      return providerCtx.running;
    };

    const currentGroupIndex = this.getNextGroupIndex();
    // Start discovery for all providers.
    for (const p of providers) {
      const pCtx = providerContexts.get(p) as {
        stopped: boolean;
        running?: Promise<void>;
        groupIndex: number;
        count: number;
      };
      pCtx.running = schedule(p, currentGroupIndex);
    }

    let racers: Promise<void>[] = [];
    do {
      racers = [...providerContexts.values()]
        .map((c) => c.running)
        .filter(Boolean) as Promise<void>[];

      if (racers.length) {
        await Promise.race(racers);
      }
    } while (racers.length);

    // Sync the wallet after discovery to ensure that the newly added accounts are added into their groups.
    // We can potentially remove this if we know that this race condition is not an issue in practice.
    this.sync();

    await this.alignGroups();

    const discoveredAccounts: Record<string, number> = {};

    for (const [p, ctx] of providerContexts) {
      const groupKey = p.getName();
      discoveredAccounts[groupKey] = ctx.count;
    }

    return discoveredAccounts;
  }
}
