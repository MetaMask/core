import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import {
  keyringTypeToName,
  type AccountId,
} from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObject } from './group';
import { EntropyRule } from './rules/entropy';
import { KeyringRule } from './rules/keyring';
import { SnapRule } from './rules/snap';
import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from './types';
import type { AccountWalletObject } from './wallet';
import { AccountTreeWallet } from './wallet';

export const controllerName = 'AccountTreeController';

const accountTreeControllerMetadata: StateMetadata<AccountTreeControllerState> =
  {
    accountTree: {
      persist: false, // We do re-recompute this state everytime.
      anonymous: false,
    },
    accountGroupsMetadata: {
      persist: true,
      anonymous: false,
    },
    accountWalletsMetadata: {
      persist: true,
      anonymous: false,
    },
  };

/**
 * Gets default state of the `AccountTreeController`.
 *
 * @returns The default state of the `AccountTreeController`.
 */
export function getDefaultAccountTreeControllerState(): AccountTreeControllerState {
  return {
    accountTree: {
      wallets: {},
      selectedAccountGroup: '',
    },
    accountGroupsMetadata: {},
    accountWalletsMetadata: {},
  };
}

/**
 * Context for an account.
 */
export type AccountContext = {
  /**
   * Wallet ID associated to that account.
   */
  walletId: AccountWalletObject['id'];

  /**
   * Account group ID associated to that account.
   */
  groupId: AccountGroupObject['id'];
};

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #accountIdToContext: Map<AccountId, AccountContext>;

  readonly #groupIdToWalletId: Map<AccountGroupId, AccountWalletId>;

  readonly #rules: [EntropyRule, SnapRule, KeyringRule];

  /**
   * Constructor for AccountTreeController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: AccountTreeControllerMessenger;
    state?: Partial<AccountTreeControllerState>;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: accountTreeControllerMetadata,
      state: {
        ...getDefaultAccountTreeControllerState(),
        ...state,
      },
    });

    // Reverse map to allow fast node access from an account ID.
    this.#accountIdToContext = new Map();

    // Reverse map to allow fast wallet node access from a group ID.
    this.#groupIdToWalletId = new Map();

    // Rules to apply to construct the wallets tree.
    this.#rules = [
      // 1. We group by entropy-source
      new EntropyRule(this.messagingSystem),
      // 2. We group by Snap ID
      new SnapRule(this.messagingSystem),
      // 3. We group by wallet type (this rule cannot fail and will group all non-matching accounts)
      new KeyringRule(this.messagingSystem),
    ];

    this.messagingSystem.subscribe(
      'AccountsController:accountAdded',
      (account) => {
        this.#handleAccountAdded(account);
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:accountRemoved',
      (accountId) => {
        this.#handleAccountRemoved(accountId);
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:selectedAccountChange',
      (account) => {
        this.#handleSelectedAccountChange(account);
      },
    );

    this.messagingSystem.subscribe(
      'AccountsController:accountRenamed',
      (account) => {
        this.#handleAccountRenamed(account);
      },
    );

    this.#registerMessageHandlers();
  }

  init() {
    const wallets: AccountTreeControllerState['accountTree']['wallets'] = {};

    // Clear mappings for fresh rebuild
    this.#accountIdToContext.clear();
    this.#groupIdToWalletId.clear();

    // For now, we always re-compute all wallets, we do not re-use the existing state.
    for (const account of this.#listAccounts()) {
      this.#insert(wallets, account);
    }

    // Once we have the account tree, we can apply persisted metadata (names + UI states).
    for (const wallet of Object.values(wallets)) {
      this.#applyAccountWalletMetadata(wallet);

      for (const group of Object.values(wallet.groups)) {
        this.#applyAccountGroupMetadata(wallet, group);
      }
    }

    this.update((state) => {
      state.accountTree.wallets = wallets;

      if (state.accountTree.selectedAccountGroup === '') {
        // No group is selected yet, re-sync with the AccountsController.
        state.accountTree.selectedAccountGroup =
          this.#getDefaultSelectedAccountGroup(wallets);
      }
    });
  }

  #getEntropyRule(): EntropyRule {
    return this.#rules[0];
  }

  #getSnapRule(): SnapRule {
    return this.#rules[1];
  }

  #getKeyringRule(): KeyringRule {
    return this.#rules[2];
  }

  #applyAccountWalletMetadata(wallet: AccountWalletObject) {
    const persistedMetadata = this.state.accountWalletsMetadata[wallet.id];

    // Apply persisted name if available (including empty strings)
    if (persistedMetadata?.name !== undefined) {
      wallet.metadata.name = persistedMetadata.name.value;
    } else if (!wallet.metadata.name) {
      // Generate default name if none exists
      if (wallet.type === AccountWalletType.Entropy) {
        wallet.metadata.name =
          this.#getEntropyRule().getDefaultAccountWalletName(wallet);
      } else if (wallet.type === AccountWalletType.Snap) {
        wallet.metadata.name =
          this.#getSnapRule().getDefaultAccountWalletName(wallet);
      } else {
        wallet.metadata.name =
          this.#getKeyringRule().getDefaultAccountWalletName(wallet);
      }
    }
  }

  #applyAccountGroupMetadata(
    wallet: AccountWalletObject,
    group: AccountGroupObject,
  ) {
    const persistedMetadata = this.state.accountGroupsMetadata[group.id];

    // Apply persisted name if available (including empty strings)
    if (persistedMetadata?.name !== undefined) {
      group.metadata.name = persistedMetadata.name.value;
    } else if (!group.metadata.name) {
      // Generate default name if none exists
      if (wallet.type === AccountWalletType.Entropy) {
        group.metadata.name = this.#getEntropyRule().getDefaultAccountGroupName(
          // Get the group from the wallet, to get the proper type inference.
          wallet.groups[group.id],
        );
      } else if (wallet.type === AccountWalletType.Snap) {
        group.metadata.name = this.#getSnapRule().getDefaultAccountGroupName(
          // Same here.
          wallet.groups[group.id],
        );
      } else {
        group.metadata.name = this.#getKeyringRule().getDefaultAccountGroupName(
          // Same here.
          wallet.groups[group.id],
        );
      }
    }

    // Apply persisted UI states
    if (persistedMetadata?.pinned?.value !== undefined) {
      group.metadata.pinned = persistedMetadata.pinned.value;
    }
    if (persistedMetadata?.hidden?.value !== undefined) {
      group.metadata.hidden = persistedMetadata.hidden.value;
    }
  }

  getAccountWallet(walletId: AccountWalletId): AccountTreeWallet | undefined {
    const wallet = this.state.accountTree.wallets[walletId];
    if (!wallet) {
      return undefined;
    }

    return new AccountTreeWallet({ messenger: this.messagingSystem, wallet });
  }

  getAccountWallets(): AccountTreeWallet[] {
    return Object.values(this.state.accountTree.wallets).map((wallet) => {
      return new AccountTreeWallet({ messenger: this.messagingSystem, wallet });
    });
  }

  #handleAccountAdded(account: InternalAccount) {
    this.update((state) => {
      this.#insert(state.accountTree.wallets, account);

      const context = this.#accountIdToContext.get(account.id);
      if (context) {
        const { walletId, groupId } = context;

        const wallet = state.accountTree.wallets[walletId];
        if (wallet) {
          this.#applyAccountWalletMetadata(wallet);

          const group = wallet.groups[groupId];
          if (group) {
            this.#applyAccountGroupMetadata(wallet, group);
          }
        }
      }
    });
  }

  #handleAccountRemoved(accountId: AccountId) {
    const context = this.#accountIdToContext.get(accountId);

    if (context) {
      const { walletId, groupId } = context;

      this.update((state) => {
        const accounts =
          state.accountTree.wallets[walletId]?.groups[groupId]?.accounts;

        if (accounts) {
          const index = accounts.indexOf(accountId);
          if (index !== -1) {
            accounts.splice(index, 1);

            // Check if we need to update selectedAccountGroup after removal
            if (
              state.accountTree.selectedAccountGroup === groupId &&
              accounts.length === 0
            ) {
              // The currently selected group is now empty, find a new group to select
              state.accountTree.selectedAccountGroup =
                this.#getDefaultAccountGroupId(state.accountTree.wallets);
            }
          }
          if (accounts.length === 0) {
            this.#pruneEmptyGroupAndWallet(state, walletId, groupId);
          }
        }
      });

      // Clear reverse-mapping for that account.
      this.#accountIdToContext.delete(accountId);
    }
  }

  #handleAccountRenamed(account: InternalAccount) {
    if (!isEvmAccountType(account.type)) {
      return;
    }

    const context = this.#accountIdToContext.get(account.id);

    if (context) {
      const { walletId, groupId } = context;

      const wallet = this.state.accountTree.wallets[walletId];
      if (wallet) {
        const group = wallet.groups[groupId];
        if (group) {
          const isDefaultNameRegex = new RegExp(
            `^${keyringTypeToName(account.metadata.keyring.type)} ([0-9]+)$`,
            'u',
          );

          const isAccountNameDefault = isDefaultNameRegex.test(
            account.metadata.name,
          );
          const isGroupNameDefault = isDefaultNameRegex.test(
            group.metadata.name,
          );

          if (isGroupNameDefault && !isAccountNameDefault) {
            this.setAccountGroupName(groupId, account.metadata.name);
          }
        }
      }
    }
  }

  /**
   * Helper method to prune a group if it holds no accounts and additionally
   * prune the wallet if it holds no groups. This action should take place
   * after a singular account removal.
   *
   * NOTE: This method should only be used for a group that we know to be empty.
   *
   * @param state - The AccountTreeController state to prune.
   * @param walletId - The wallet ID to prune, the wallet should be the parent of the associated group that holds the removed account.
   * @param groupId - The group ID to prune, the group should be the parent of the associated account that was removed.
   * @returns The updated state.
   */
  #pruneEmptyGroupAndWallet(
    state: AccountTreeControllerState,
    walletId: AccountWalletId,
    groupId: AccountGroupId,
  ) {
    const { wallets } = state.accountTree;

    delete wallets[walletId].groups[groupId];
    this.#groupIdToWalletId.delete(groupId);

    if (Object.keys(wallets[walletId].groups).length === 0) {
      delete wallets[walletId];
    }
    return state;
  }

  #insert(
    wallets: AccountTreeControllerState['accountTree']['wallets'],
    account: InternalAccount,
  ) {
    const result =
      this.#getEntropyRule().match(account) ??
      this.#getSnapRule().match(account) ??
      this.#getKeyringRule().match(account); // This one cannot fail.

    // Update controller's state.
    const walletId = result.wallet.id;
    let wallet = wallets[walletId];
    if (!wallet) {
      wallets[walletId] = {
        ...result.wallet,
        groups: {},
        metadata: {
          name: '', // Will get updated later.
          ...result.wallet.metadata,
        },
        // We do need to type-cast since we're not narrowing `result` with
        // the union tag `result.wallet.type`.
      } as AccountWalletObject;
      wallet = wallets[walletId];
    }

    const groupId = result.group.id;
    let group = wallet.groups[groupId];
    if (!group) {
      wallet.groups[groupId] = {
        ...result.group,
        // Type-wise, we are guaranteed to always have at least 1 account.
        accounts: [account.id],
        metadata: {
          name: '',
          ...{ pinned: false, hidden: false }, // Default UI states
          ...result.group.metadata, // Allow rules to override defaults
        },
        // We do need to type-cast since we're not narrowing `result` with
        // the union tag `result.group.type`.
      } as AccountGroupObject;
      group = wallet.groups[groupId];

      // Map group ID to its containing wallet ID for efficient direct access
      this.#groupIdToWalletId.set(groupId, walletId);
    } else {
      group.accounts.push(account.id);
    }

    // Update the reverse mapping for this account.
    this.#accountIdToContext.set(account.id, {
      walletId: wallet.id,
      groupId: group.id,
    });
  }

  #listAccounts(): InternalAccount[] {
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    );
  }

  /**
   * Asserts that a group exists in the current account tree.
   *
   * @param groupId - The account group ID to validate.
   * @throws Error if the group does not exist.
   */
  #assertAccountGroupExists(groupId: AccountGroupId): void {
    const exists = this.#groupIdToWalletId.has(groupId);
    if (!exists) {
      throw new Error(`Account group with ID "${groupId}" not found in tree`);
    }
  }

  /**
   * Asserts that a wallet exists in the current account tree.
   *
   * @param walletId - The account wallet ID to validate.
   * @throws Error if the wallet does not exist.
   */
  #assertAccountWalletExists(walletId: AccountWalletId): void {
    const exists = Boolean(this.state.accountTree.wallets[walletId]);
    if (!exists) {
      throw new Error(`Account wallet with ID "${walletId}" not found in tree`);
    }
  }

  /**
   * Gets the currently selected account group ID.
   *
   * @returns The selected account group ID or empty string if none selected.
   */
  getSelectedAccountGroup(): AccountGroupId | '' {
    return this.state.accountTree.selectedAccountGroup;
  }

  /**
   * Sets the selected account group and updates the AccountsController selectedAccount accordingly.
   *
   * @param groupId - The account group ID to select.
   */
  setSelectedAccountGroup(groupId: AccountGroupId): void {
    const currentSelectedGroup = this.state.accountTree.selectedAccountGroup;

    // Idempotent check - if the same group is already selected, do nothing
    if (currentSelectedGroup === groupId) {
      return;
    }

    // Find the first account in this group to select
    const accountToSelect = this.#getDefaultAccountFromAccountGroupId(groupId);
    if (!accountToSelect) {
      throw new Error(`No accounts found in group: ${groupId}`);
    }

    // Update our state first
    this.update((state) => {
      state.accountTree.selectedAccountGroup = groupId;
    });

    // Update AccountsController - this will trigger selectedAccountChange event,
    // but our handler is idempotent so it won't cause infinite loop
    this.messagingSystem.call(
      'AccountsController:setSelectedAccount',
      accountToSelect,
    );
  }

  /**
   * Initializes the selectedAccountGroup based on the currently selected account from AccountsController.
   *
   * @param wallets - Wallets object to use for fallback logic
   * @returns The default selected account group ID or empty string if none selected.
   */
  #getDefaultSelectedAccountGroup(wallets: {
    [walletId: AccountWalletId]: AccountWalletObject;
  }): AccountGroupId | '' {
    const selectedAccount = this.messagingSystem.call(
      'AccountsController:getSelectedAccount',
    );
    if (selectedAccount && selectedAccount.id) {
      const accountMapping = this.#accountIdToContext.get(selectedAccount.id);
      if (accountMapping) {
        const { groupId } = accountMapping;

        return groupId;
      }
    }

    // Default to the default group in case of errors.
    return this.#getDefaultAccountGroupId(wallets);
  }

  /**
   * Handles selected account change from AccountsController.
   * Updates selectedAccountGroup to match the selected account.
   *
   * @param account - The newly selected account.
   */
  #handleSelectedAccountChange(account: InternalAccount): void {
    const accountMapping = this.#accountIdToContext.get(account.id);
    if (!accountMapping) {
      // Account not in tree yet, might be during initialization
      return;
    }

    const { groupId } = accountMapping;
    const currentSelectedGroup = this.state.accountTree.selectedAccountGroup;

    // Idempotent check - if the same group is already selected, do nothing
    if (currentSelectedGroup === groupId) {
      return;
    }

    // Update selectedAccountGroup to match the selected account
    this.update((state) => {
      state.accountTree.selectedAccountGroup = groupId;
    });
  }

  /**
   * Gets account group.
   *
   * @param groupId - The account group ID.
   * @returns The account group or undefined if not found.
   */
  #getAccountGroup(groupId: AccountGroupId): AccountGroupObject | undefined {
    const found = Object.values(this.state.accountTree.wallets).find(
      (wallet) => wallet.groups[groupId] !== undefined,
    );

    return found?.groups[groupId];
  }

  /**
   * Gets the default account for specified group.
   *
   * @param groupId - The account group ID.
   * @returns The first account ID in the group, or undefined if no accounts found.
   */
  #getDefaultAccountFromAccountGroupId(
    groupId: AccountGroupId,
  ): AccountId | undefined {
    const group = this.#getAccountGroup(groupId);

    if (group) {
      let candidate;
      for (const id of group.accounts) {
        const account = this.messagingSystem.call(
          'AccountsController:getAccount',
          id,
        );

        if (!candidate) {
          candidate = id;
        }
        if (account && isEvmAccountType(account.type)) {
          // EVM accounts have a higher priority, so if we find any, we just
          // use that account!
          return account.id;
        }
      }

      return candidate;
    }

    return undefined;
  }

  /**
   * Gets the default group id, which is either, the first non-empty group that contains an EVM account or
   * just the first non-empty group with any accounts.
   *
   * @param wallets - The wallets object to search.
   * @returns The ID of the first non-empty group, or an empty string if no groups are found.
   */
  #getDefaultAccountGroupId(wallets: {
    [walletId: AccountWalletId]: AccountWalletObject;
  }): AccountGroupId | '' {
    let candidate: AccountGroupId | '' = '';

    for (const wallet of Object.values(wallets)) {
      for (const group of Object.values(wallet.groups)) {
        // We only update the candidate with the first non-empty group, but still
        // try to find a group that contains an EVM account (the `candidate` is
        // our fallback).
        if (candidate === '' && group.accounts.length > 0) {
          candidate = group.id;
        }

        for (const id of group.accounts) {
          const account = this.messagingSystem.call(
            'AccountsController:getAccount',
            id,
          );

          if (account && isEvmAccountType(account.type)) {
            // EVM accounts have a higher priority, so if we find any, we just
            // use that group!
            return group.id;
          }
        }
      }
    }
    return candidate;
  }

  /**
   * Sets a custom name for an account group.
   *
   * @param groupId - The account group ID.
   * @param name - The custom name to set.
   * @throws If the account group ID is not found in the current tree.
   */
  setAccountGroupName(groupId: AccountGroupId, name: string): void {
    // Validate that the group exists in the current tree
    this.#assertAccountGroupExists(groupId);

    this.update((state) => {
      // Update persistent metadata
      state.accountGroupsMetadata[groupId] ??= {};
      state.accountGroupsMetadata[groupId].name = {
        value: name,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly using efficient mapping
      const walletId = this.#groupIdToWalletId.get(groupId);
      if (walletId) {
        state.accountTree.wallets[walletId].groups[groupId].metadata.name =
          name;
      }
    });
  }

  /**
   * Sets a custom name for an account wallet.
   *
   * @param walletId - The account wallet ID.
   * @param name - The custom name to set.
   * @throws If the account wallet ID is not found in the current tree.
   */
  setAccountWalletName(walletId: AccountWalletId, name: string): void {
    // Validate that the wallet exists in the current tree
    this.#assertAccountWalletExists(walletId);

    this.update((state) => {
      // Update persistent metadata
      state.accountWalletsMetadata[walletId] ??= {};
      state.accountWalletsMetadata[walletId].name = {
        value: name,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly
      state.accountTree.wallets[walletId].metadata.name = name;
    });
  }

  /**
   * Toggles the pinned state of an account group.
   *
   * @param groupId - The account group ID.
   * @param pinned - Whether the group should be pinned.
   * @throws If the account group ID is not found in the current tree.
   */
  setAccountGroupPinned(groupId: AccountGroupId, pinned: boolean): void {
    // Validate that the group exists in the current tree
    this.#assertAccountGroupExists(groupId);

    this.update((state) => {
      // Update persistent metadata
      state.accountGroupsMetadata[groupId] ??= {};
      state.accountGroupsMetadata[groupId].pinned = {
        value: pinned,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly using efficient mapping
      const walletId = this.#groupIdToWalletId.get(groupId);
      if (walletId) {
        state.accountTree.wallets[walletId].groups[groupId].metadata.pinned =
          pinned;
      }
    });
  }

  /**
   * Toggles the hidden state of an account group.
   *
   * @param groupId - The account group ID.
   * @param hidden - Whether the group should be hidden.
   * @throws If the account group ID is not found in the current tree.
   */
  setAccountGroupHidden(groupId: AccountGroupId, hidden: boolean): void {
    // Validate that the group exists in the current tree
    this.#assertAccountGroupExists(groupId);

    this.update((state) => {
      // Update persistent metadata
      state.accountGroupsMetadata[groupId] ??= {};
      state.accountGroupsMetadata[groupId].hidden = {
        value: hidden,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly using efficient mapping
      const walletId = this.#groupIdToWalletId.get(groupId);
      if (walletId) {
        state.accountTree.wallets[walletId].groups[groupId].metadata.hidden =
          hidden;
      }
    });
  }

  /**
   * Registers message handlers for the AccountTreeController.
   */
  #registerMessageHandlers(): void {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:getSelectedAccountGroup`,
      this.getSelectedAccountGroup.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setSelectedAccountGroup`,
      this.setSelectedAccountGroup.bind(this),
    );
  }
}
