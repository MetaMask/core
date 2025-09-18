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
  MultichainAccountWalletStatus,
} from '@metamask/account-api';
import type { AccountGroupId } from '@metamask/account-api';
import {
  type EntropySourceId,
  type KeyringAccount,
} from '@metamask/keyring-api';
import { createProjectLogger } from '@metamask/utils';
import { Mutex } from 'async-mutex';

import {
  type GroupState,
  MultichainAccountGroup,
} from './MultichainAccountGroup';
import type { ServiceState, StateKeys } from './MultichainAccountService';
import type { BaseBip44AccountProvider } from './providers';
import type { MultichainAccountServiceMessenger } from './types';

/**
 * The context for a provider discovery.
 */
type AccountProviderDiscoveryContext<
  Account extends Bip44Account<KeyringAccount>,
> = {
  provider: BaseBip44AccountProvider;
  stopped: boolean;
  groupIndex: number;
  accounts: Account[];
};

type DiscoveredGroupsState = {
  [groupIndex: string]: {
    [providerName: string]: Bip44Account<KeyringAccount>['address'][];
  };
};

type WalletState = ServiceState[StateKeys['entropySource']];

const log = createProjectLogger('multichain-account-service');

/**
 * A multichain account wallet that holds multiple multichain accounts (one multichain account per
 * group index).
 */
export class MultichainAccountWallet<
  Account extends Bip44Account<KeyringAccount>,
> implements MultichainAccountWalletDefinition<Account>
{
  readonly #lock = new Mutex();

  readonly #id: MultichainAccountWalletId;

  readonly #providers: BaseBip44AccountProvider[];

  readonly #entropySource: EntropySourceId;

  readonly #accountGroups: Map<number, MultichainAccountGroup<Account>>;

  readonly #messenger: MultichainAccountServiceMessenger;

  // eslint-disable-next-line @typescript-eslint/prefer-readonly
  #initialized = false;

  #status: MultichainAccountWalletStatus;

  constructor({
    providers,
    entropySource,
    messenger,
  }: {
    providers: BaseBip44AccountProvider[];
    entropySource: EntropySourceId;
    messenger: MultichainAccountServiceMessenger;
  }) {
    this.#id = toMultichainAccountWalletId(entropySource);
    this.#providers = providers;
    this.#entropySource = entropySource;
    this.#messenger = messenger;
    this.#accountGroups = new Map();

    // Initial synchronization (don't emit events during initialization).
    this.#status = 'uninitialized';
    this.sync();
    this.#initialized = true;
    this.#status = 'ready';
  }

  init(walletState: WalletState) {
    for (const groupIndex of Object.keys(walletState)) {
      // Have to convert to number because the state keys become strings when we construct the state object in the service
      const indexAsNumber = Number(groupIndex);
      const group = new MultichainAccountGroup({
        groupIndex: indexAsNumber,
        wallet: this,
        providers: this.#providers,
        messenger: this.#messenger,
      });

      group.init(walletState[groupIndex]);

      this.#accountGroups.set(indexAsNumber, group);
    }
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
    }
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
   * @throws If any of the account providers fails to create their accounts.
   * @returns The multichain account group for this group index.
   */
  async createMultichainAccountGroup(
    groupIndex: number,
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

      const didEveryProviderFail = results.every(
        (result) => result.status === 'rejected',
      );

      const providerFailures = results.reduce((acc, result) => {
        if (result.status === 'rejected') {
          acc += `\n- ${result.reason}`;
        }
        return acc;
      }, '');

      if (didEveryProviderFail) {
        // We throw an error if there's a failure on every provider
        throw new Error(
          `Unable to create multichain account group for index: ${groupIndex} due to provider failures:${providerFailures}`,
        );
      } else if (providerFailures) {
        // We warn there's failures on some providers and thus misalignment, but we still create the group
        console.warn(
          `Unable to create some accounts for group index: ${groupIndex}. Providers threw the following errors:${providerFailures}`,
        );
      }

      // Get the accounts list from the AccountsController
      // opting to do one call here instead of calling getAccounts() for each provider
      // which would result in multiple calls to the AccountsController
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

      group = new MultichainAccountGroup({
        wallet: this,
        providers: this.#providers,
        groupIndex,
        messenger: this.#messenger,
      });

      group.init(groupState);

      // Register the account(s) to our internal map.
      this.#accountGroups.set(groupIndex, group);

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
    return this.createMultichainAccountGroup(this.getNextGroupIndex());
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
      const discoveredGroupsState: DiscoveredGroupsState = {};

      // One serialized loop per provider; all run concurrently
      const runProviderDiscovery = async (
        context: AccountProviderDiscoveryContext<Account>,
      ) => {
        const message = (stepName: string, groupIndex: number) =>
          `[${context.provider.getName()}] Discovery ${stepName} (groupIndex=${groupIndex})`;

        while (!context.stopped) {
          // Fast‑forward to current high‑water mark
          const targetGroupIndex = Math.max(context.groupIndex, maxGroupIndex);

          log(message('STARTED', targetGroupIndex));

          let accounts: Account[] = [];
          try {
            accounts = (await context.provider.discoverAccounts({
              entropySource: this.#entropySource,
              groupIndex: targetGroupIndex,
            })) as Account[];
          } catch (error) {
            context.stopped = true;
            console.error(error);
            log(message('FAILED', targetGroupIndex), error);
            break;
          }

          if (!accounts.length) {
            log(message('STOPPED', targetGroupIndex));
            context.stopped = true;
            break;
          }

          log(message('SUCCEEDED', targetGroupIndex));

          context.accounts = context.accounts.concat(accounts);

          const providerName = context.provider.getName();

          if (!discoveredGroupsState[targetGroupIndex][providerName]) {
            discoveredGroupsState[targetGroupIndex][providerName] = [];
          }

          discoveredGroupsState[targetGroupIndex][providerName].push(
            ...accounts.map((account) => account.address),
          );

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
      for (const groupIndex of Object.keys(discoveredGroupsState)) {

      }

      // Align missing accounts from group. This is required to create missing account from non-discovered
      // indexes for some providers.
      await this.#alignAccounts();

      return providerContexts.flatMap((context) => context.accounts);
    });
  }
}
