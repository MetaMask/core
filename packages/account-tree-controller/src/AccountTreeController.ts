import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import { type AccountId } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { MultichainAccountSyncingEmitAnalyticsEventParams } from './account-syncing/analytics';
import {
  formatAnalyticsEvent,
  traceFallback,
  TraceName,
} from './account-syncing/analytics';
import { AtomicSyncQueue } from './account-syncing/atomic-sync-queue';
import { getProfileId } from './account-syncing/authentication';
import type { StateSnapshot } from './account-syncing/controller-utils';
import {
  createStateSnapshot,
  restoreStateFromSnapshot,
  getLocalEntropyWallets,
  getLocalGroupsForEntropyWallet,
} from './account-syncing/controller-utils';
import {
  createLocalGroupsFromUserStorage,
  disableLegacyAccountSyncingForAllWallets,
  performLegacyAccountSyncing,
  syncGroupsMetadata,
  syncSingleGroupMetadata,
  syncWalletMetadata,
} from './account-syncing/syncing';
import type { AccountSyncingContext } from './account-syncing/types';
import {
  getAllGroupsFromUserStorage,
  getGroupFromUserStorage,
  getWalletFromUserStorage,
  pushGroupToUserStorageBatch,
} from './account-syncing/user-storage';
import type { AccountGroupObject } from './group';
import { EntropyRule } from './rules/entropy';
import { KeyringRule } from './rules/keyring';
import { SnapRule } from './rules/snap';
import type {
  AccountTreeControllerConfig,
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
    isAccountSyncingInProgress: {
      persist: false,
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
    isAccountSyncingInProgress: false,
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

const DEFAULT_HD_SIMPLE_ACCOUNT_NAME_REGEX = /^Account ([0-9]+)$/u;

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #accountIdToContext: Map<AccountId, AccountContext>;

  readonly #groupIdToWalletId: Map<AccountGroupId, AccountWalletId>;

  /**
   * Queue manager for atomic sync operations.
   */
  readonly #atomicSyncQueue: AtomicSyncQueue;

  readonly #rules: [EntropyRule, SnapRule, KeyringRule];

  readonly #trace: TraceCallback;

  readonly #accountSyncingConfig: {
    emitAccountSyncingEvent: (
      event: MultichainAccountSyncingEmitAnalyticsEventParams,
    ) => void;
    enableDebugLogging: boolean;
  };

  // Temporary: ensures we can release updates to AccountTreeController without
  // breaking changes while we transition to the new multichain syncing approach.
  readonly #disableMultichainAccountSyncing: boolean = true;

  /**
   * Constructor for AccountTreeController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   * @param options.config - Optional configuration for the controller.
   */
  constructor({
    messenger,
    state,
    config,
  }: {
    messenger: AccountTreeControllerMessenger;
    state?: Partial<AccountTreeControllerState>;
    config?: AccountTreeControllerConfig;
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

    // Initialize atomic sync queue
    this.#atomicSyncQueue = new AtomicSyncQueue(
      config?.accountSyncing?.enableDebugLogging ?? false,
    );

    // Rules to apply to construct the wallets tree.
    this.#rules = [
      // 1. We group by entropy-source
      new EntropyRule(this.messagingSystem),
      // 2. We group by Snap ID
      new SnapRule(this.messagingSystem),
      // 3. We group by wallet type (this rule cannot fail and will group all non-matching accounts)
      new KeyringRule(this.messagingSystem),
    ];

    this.#trace = config?.trace ?? traceFallback;

    this.#accountSyncingConfig = {
      emitAccountSyncingEvent: (
        event: MultichainAccountSyncingEmitAnalyticsEventParams,
      ) => {
        const formattedEvent = formatAnalyticsEvent(event);
        return config?.accountSyncing?.onAccountSyncingEvent?.(formattedEvent);
      },
      enableDebugLogging: config?.accountSyncing?.enableDebugLogging ?? false,
    };

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
    // We only consider HD and simple EVM accounts for the moment as they have
    // an higher priority over others when it comes to naming.
    // (Similar logic than `EntropyRule.getDefaultAccountGroupName`).
    // TODO: Rename other kind of accounts, but we need to compute their "default name" with custom prefixes.
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
          // We both use the same naming conventions for HD and simple accounts,
          // so we can use the same regex to check if the name is a default one.
          const isAccountNameDefault =
            DEFAULT_HD_SIMPLE_ACCOUNT_NAME_REGEX.test(account.metadata.name);
          const isGroupNameDefault = DEFAULT_HD_SIMPLE_ACCOUNT_NAME_REGEX.test(
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

      // Trigger atomic sync for new wallet (only for entropy wallets)
      if (wallet.type === AccountWalletType.Entropy) {
        this.#atomicSyncQueue.enqueue(
          () => this.#syncWalletToUserStorage(walletId),
          this.state.isAccountSyncingInProgress,
        );
      }
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

      // Trigger atomic sync for new group (only for entropy wallets)
      if (wallet.type === AccountWalletType.Entropy) {
        this.#atomicSyncQueue.enqueue(
          () => this.#syncGroupToUserStorage(groupId),
          this.state.isAccountSyncingInProgress,
        );
      }
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

    // Trigger atomic sync for group rename
    this.#atomicSyncQueue.enqueue(
      () => this.#syncGroupToUserStorage(groupId),
      this.state.isAccountSyncingInProgress,
    );
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

    // Trigger atomic sync for wallet rename
    this.#atomicSyncQueue.enqueue(
      () => this.#syncWalletToUserStorage(walletId),
      this.state.isAccountSyncingInProgress,
    );
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

  /**
   * Synchronizes the local account tree with user storage, ensuring consistency
   * between local state and cloud-stored account data.
   *
   * This method performs a comprehensive sync operation that:
   * 1. Identifies all local entropy wallets that can be synchronized
   * 2. Performs legacy account syncing if needed (for backwards compatibility)
   * - Resolves potential name conflicts by comparing timestamps to preserve more recent local group names
   * - Disables subsequent legacy syncing by setting a flag in user storage
   * - Exits early if multichain account syncing is disabled after legacy sync
   * 3. Executes multichain account syncing for each wallet:
   * - Syncs wallet metadata bidirectionally
   * - Creates missing local groups from user storage data (or pushes local groups if none exist remotely)
   * - Refreshes local state to reflect newly created groups
   * - Syncs group metadata bidirectionally
   *
   * The sync is atomic per wallet with rollback on errors, but continues processing other wallets
   * if individual wallet sync fails. A global lock prevents concurrent sync operations.
   *
   * During this process, all other atomic multichain related user storage updates are blocked.
   *
   * @throws Will throw if the sync operation encounters unrecoverable errors
   */
  async syncWithUserStorage(): Promise<void> {
    if (this.#disableMultichainAccountSyncing) {
      if (this.#accountSyncingConfig.enableDebugLogging) {
        console.warn(
          'Multichain account syncing is disabled. Skipping sync operation.',
        );
      }
      return;
    }

    // Prevent multiple syncs from running at the same time.
    // Also prevents atomic updates from being applied while syncing is in progress.
    if (this.state.isAccountSyncingInProgress) {
      return;
    }

    const context = this.#createAccountSyncingContext();
    if (!context) {
      return;
    }

    // Encapsulate the sync logic in a function to allow tracing
    const bigSyncFn = async () => {
      // Do only once, since legacy account syncing iterates over all wallets
      let hasLegacyAccountSyncingBeenPerformed = false;

      try {
        this.update((state) => {
          state.isAccountSyncingInProgress = true;
        });

        // Clear stale atomic syncs - big sync supersedes them
        this.#atomicSyncQueue.clear();

        // 1. Identifies all local entropy wallets that can be synchronized
        const localSyncableWallets = getLocalEntropyWallets(context);

        if (!localSyncableWallets.length) {
          // No wallets to sync, just return. This shouldn't happen.
          return;
        }

        // 2. Iterate over each local wallet
        for (const wallet of localSyncableWallets) {
          let stateSnapshot: StateSnapshot | undefined;
          const entropySourceId = wallet.metadata.entropy.id;

          try {
            const walletProfileId = await getProfileId(
              context,
              entropySourceId,
            );

            const [walletFromUserStorage, groupsFromUserStorage] =
              await Promise.all([
                getWalletFromUserStorage(context, entropySourceId),
                getAllGroupsFromUserStorage(context, entropySourceId),
              ]);

            // 2.1 Decide if we need to perform legacy account syncing
            if (
              !walletFromUserStorage ||
              (!walletFromUserStorage.isLegacyAccountSyncingDisabled &&
                !hasLegacyAccountSyncingBeenPerformed)
            ) {
              // 2.2 Perform legacy account syncing
              // This will also update the `isLegacyAccountSyncingDisabled` remote flag for all wallets.

              // This might add new InternalAccounts and / or update existing ones' names.
              // This in turn will be picked up by our `#handleAccountAdded` and `#handleAccountRenamed` methods
              // to update the account tree.
              await performLegacyAccountSyncing(context);
              hasLegacyAccountSyncingBeenPerformed = true;

              const isMultichainAccountSyncingEnabled = context.messenger.call(
                'UserStorageController:getIsMultichainAccountSyncingEnabled',
              );
              if (!isMultichainAccountSyncingEnabled) {
                // If multichain account syncing is disabled, we can stop here
                // and not perform any further syncing.
                if (this.#accountSyncingConfig.enableDebugLogging) {
                  console.log(
                    'Multichain account syncing is disabled, skipping further syncing.',
                  );
                }
                return;
              }
            }

            // If we reach this point, we are either:
            // 1. Not performing legacy account syncing at all (new wallets)
            // 2. Legacy account syncing has been performed and we are now ready to proceed with
            //    multichain account syncing.
            // 2.3 Disable legacy account syncing for all wallets
            // This will ensure that we do not perform legacy account syncing again in the future for these wallets.
            await disableLegacyAccountSyncingForAllWallets(context);

            // 3. Execute multichain account syncing
            // 3.1 Wallet syncing
            // Create a state snapshot before processing each wallet for potential rollback
            stateSnapshot = createStateSnapshot(context);

            // Sync wallet metadata bidirectionally
            await syncWalletMetadata(
              context,
              wallet,
              walletFromUserStorage,
              walletProfileId,
            );

            // 3.2 Groups syncing
            // If groups data does not exist in user storage yet, create it
            if (!groupsFromUserStorage.length) {
              // If no groups exist in user storage, we can push all groups from the wallet to the user storage and exit
              await pushGroupToUserStorageBatch(
                context,
                getLocalGroupsForEntropyWallet(context, wallet.id),
                entropySourceId,
              );

              continue; // No need to proceed with metadata comparison if groups are new
            }

            // Create local groups for each group from user storage if they do not exist
            // This will ensure that we have all groups available locally before syncing metadata
            await createLocalGroupsFromUserStorage(
              context,
              groupsFromUserStorage,
              entropySourceId,
              walletProfileId,
            );

            // Refresh local state to ensure we have the latest groups that were just created
            // This is important because createLocalGroupsFromUserStorage might have created new groups
            // that need to be reflected in our local state before we proceed with metadata syncing
            this.init();

            // Sync group metadata bidirectionally
            await syncGroupsMetadata(
              context,
              wallet,
              groupsFromUserStorage,
              entropySourceId,
              walletProfileId,
            );
          } catch (error) {
            if (context.enableDebugLogging) {
              console.error(
                `Error syncing wallet ${wallet.id}:`,
                error instanceof Error ? error.message : String(error),
              );
            }

            // Attempt to rollback state changes for this wallet
            try {
              if (!stateSnapshot) {
                throw new Error(
                  `State snapshot is missing for wallet ${wallet.id}`,
                );
              }
              restoreStateFromSnapshot(context, stateSnapshot);
              if (context.enableDebugLogging) {
                console.log(
                  `Rolled back state changes for wallet ${wallet.id}`,
                );
              }
            } catch (rollbackError) {
              if (context.enableDebugLogging) {
                console.error(
                  `Failed to rollback state for wallet ${wallet.id}:`,
                  rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError),
                );
              }
            }

            // Continue with next wallet instead of failing the entire sync
            continue;
          }
        }
      } catch (error) {
        if (context.enableDebugLogging) {
          console.error('Error during multichain account syncing:', error);
        }
        throw error;
      } finally {
        this.update((state) => {
          state.isAccountSyncingInProgress = false;
        });
      }
    };

    // Execute the big sync function with tracing
    await this.#trace(
      {
        name: TraceName.AccountSyncFull,
      },
      bigSyncFn,
    );
  }

  /**
   * Creates an account syncing context for sync operations.
   *
   * @returns The account syncing context or null if syncing is disabled.
   */
  #createAccountSyncingContext(): AccountSyncingContext | null {
    if (this.#disableMultichainAccountSyncing) {
      return null;
    }

    return {
      controller: this,
      messenger: this.messagingSystem,
      controllerStateUpdateFn: this.update.bind(this),
      traceFn: this.#trace.bind(this),
      emitAnalyticsEventFn:
        this.#accountSyncingConfig.emitAccountSyncingEvent.bind(this),
      enableDebugLogging: this.#accountSyncingConfig.enableDebugLogging,
    };
  }

  /**
   * Syncs a single wallet's metadata to user storage.
   *
   * @param walletId - The wallet ID to sync.
   */
  async #syncWalletToUserStorage(walletId: AccountWalletId): Promise<void> {
    const context = this.#createAccountSyncingContext();
    if (!context) {
      return;
    }

    try {
      const wallet = this.state.accountTree.wallets[walletId];
      if (!wallet || wallet.type !== AccountWalletType.Entropy) {
        return; // Only sync entropy wallets
      }

      const entropySourceId = wallet.metadata.entropy.id;
      const walletProfileId = await getProfileId(context, entropySourceId);
      const walletFromUserStorage = await getWalletFromUserStorage(
        context,
        entropySourceId,
      );

      await syncWalletMetadata(
        context,
        wallet,
        walletFromUserStorage,
        walletProfileId,
      );
    } catch (error) {
      if (context.enableDebugLogging) {
        console.error(
          `Error syncing wallet ${walletId} to user storage:`,
          error,
        );
      }
      throw error;
    }
  }

  /**
   * Syncs a single group's metadata to user storage.
   *
   * @param groupId - The group ID to sync.
   */
  async #syncGroupToUserStorage(groupId: AccountGroupId): Promise<void> {
    const context = this.#createAccountSyncingContext();
    if (!context) {
      return;
    }

    try {
      const walletId = this.#groupIdToWalletId.get(groupId);
      if (!walletId) {
        return;
      }

      const wallet = this.state.accountTree.wallets[walletId];
      if (!wallet || wallet.type !== AccountWalletType.Entropy) {
        return; // Only sync entropy wallets
      }

      const group = wallet.groups[groupId];
      if (!group) {
        return;
      }

      const entropySourceId = wallet.metadata.entropy.id;
      const walletProfileId = await getProfileId(context, entropySourceId);

      // Get the specific group from user storage
      const groupFromUserStorage = await getGroupFromUserStorage(
        context,
        entropySourceId,
        group.metadata.entropy.groupIndex,
      );

      await syncSingleGroupMetadata(
        context,
        group,
        groupFromUserStorage,
        entropySourceId,
        walletProfileId,
      );
    } catch (error) {
      if (context.enableDebugLogging) {
        console.error(`Error syncing group ${groupId} to user storage:`, error);
      }
      throw error;
    }
  }
}
