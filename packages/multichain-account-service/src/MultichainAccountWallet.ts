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
import type { AccountProvider } from '@metamask/account-api';
import {
  type EntropySourceId,
  type KeyringAccount,
} from '@metamask/keyring-api';

import { MultichainAccountGroup } from './MultichainAccountGroup';

/**
 * A multichain account wallet that holds multiple multichain accounts (one multichain account per
 * group index).
 */
export class MultichainAccountWallet<
  Account extends Bip44Account<KeyringAccount>,
> implements MultichainAccountWalletDefinition<Account>
{
  readonly #id: MultichainAccountWalletId;

  readonly #providers: AccountProvider<Account>[];

  readonly #entropySource: EntropySourceId;

  readonly #accounts: Map<number, MultichainAccountGroup<Account>>;

  constructor({
    providers,
    entropySource,
  }: {
    providers: AccountProvider<Account>[];
    entropySource: EntropySourceId;
  }) {
    this.#id = toMultichainAccountWalletId(entropySource);
    this.#providers = providers;
    this.#entropySource = entropySource;
    this.#accounts = new Map();

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
        let multichainAccount = this.#accounts.get(entropy.groupIndex);
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

          this.#accounts.set(entropy.groupIndex, multichainAccount);
        }
      }
    }

    // Now force-sync all remaining multichain accounts.
    for (const [groupIndex, multichainAccount] of this.#accounts.entries()) {
      multichainAccount.sync();

      // Clean up old multichain accounts.
      if (!multichainAccount.hasAccounts()) {
        this.#accounts.delete(groupIndex);
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
      return this.#accounts.get(0);
    }

    // If it is not a valid ID, we cannot extract the group index
    // from it, so we fail fast.
    if (!isMultichainAccountGroupId(id)) {
      return undefined;
    }

    const groupIndex = getGroupIndexFromMultichainAccountGroupId(id);
    return this.#accounts.get(groupIndex);
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
    return this.#accounts.get(groupIndex);
  }

  /**
   * Gets all multichain account groups.
   *
   * @returns The multichain accounts.
   */
  getMultichainAccountGroups(): MultichainAccountGroup<Account>[] {
    return Array.from(this.#accounts.values()); // TODO: Prevent copy here.
  }

  /**
   * Gets next group index for this wallet.
   *
   * @returns The next group index of this wallet.
   */
  getNextGroupIndex(): number {
    // Assuming we cannot have indexes gaps.
    return this.#accounts.size; // No +1 here, group indexes starts at 0.
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

    // READ THIS CAREFULLY:
    // Since we're not "fully supporting multichain" for now, we still rely on single
    // :accountCreated events to sync multichain account groups and wallets. Which means
    // that even if of the provider fails, some accouns (on the `AccountsController`
    // might be showing up AND that some multichain account wallets/groups might have
    // been automatically sync'd too.
    //
    // We will need to unsubscribe from :accountAdded once we "fully support multichain"
    // (meaning, the entire codebase relies on this new service for multichain account
    // creations).
    // --------------------------------------------------------------------------------

    // If any of the provider failed to create their accounts, then we consider the
    // multichain account group to have failed too.
    // NOTE: Though, we don't rollback existing created accounts and that's totally fine
    // because account creations is assumed to be imdepotent, thus, trying again should
    // just create the missing accounts, and previously created accounts will just be
    // re-used as is.
    if (results.some((result) => result.status === 'rejected')) {
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
    this.#accounts.set(groupIndex, group); // `group` cannot be undefined here.

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
}
