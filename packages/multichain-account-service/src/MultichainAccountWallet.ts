import type {
  Bip44Account,
  MultichainAccountWalletId,
  MultichainAccountWallet as MultichainAccountWalletDefinition,
} from '@metamask/account-api';
import type { AccountGroupId } from '@metamask/account-api';
import {
  getGroupIndexFromMultichainAccountId as getGroupIndexFromMultichainAccountGroupId,
  isMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { toDefaultAccountGroupId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import {
  type EntropySourceId,
  type KeyringAccount,
} from '@metamask/keyring-api';

import { MultichainAccountGroup } from './MultichainAccountGroup';
import type { AccountProvider } from './providers/BaseAccountProvider';

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

  #createMultichainAccountGroup(
    groupIndex: number,
  ): MultichainAccountGroup<Account> {
    const multichainAccount = new MultichainAccountGroup({
      wallet: this,
      providers: this.#providers,
      groupIndex,
    });

    // Register the account to our internal map.
    this.#accounts.set(groupIndex, multichainAccount);

    return multichainAccount;
  }

  async createMultichainAccountGroup(
    groupIndex: number,
  ): Promise<MultichainAccountGroup<Account>> {
    const nextGroupIndex = this.getNextGroupIndex();
    if (groupIndex > nextGroupIndex) {
      throw new Error(
        `You cannot use a group index that is higher than the next available one: expected <=${nextGroupIndex}, got ${groupIndex}`,
      );
    }

    // TODO: Make this parallel.
    for (const provider of this.#providers) {
      // FIXME: What to do if any provider fails to create accounts?
      await provider.createAccounts({
        entropySource: this.#entropySource,
        groupIndex,
      });
    }

    // Re-create and "refresh" the multichain account (we assume all account creations are
    // idempotent, so we should get the same accounts and potentially some new accounts (if
    // some account providers decide to return more of them this time).
    return this.#createMultichainAccountGroup(groupIndex);
  }

  async createNextMultichainAccountGroup(): Promise<
    MultichainAccountGroup<Account>
  > {
    return this.createMultichainAccountGroup(this.getNextGroupIndex());
  }
}
