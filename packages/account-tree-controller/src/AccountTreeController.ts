import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  emitAnalyticsEvent,
  MultichainAccountSyncingAnalyticsEvents,
} from './account-syncing/analytics';
import { getProfileId } from './account-syncing/authentication/utils';
import {
  getAllGroupsFromUserStorage,
  getWalletFromUserStorage,
  pushGroupToUserStorageBatch,
  pushWalletToUserStorage,
} from './account-syncing/user-storage/network-operations';
import type {
  AccountGroupMultichainAccountObject,
  AccountGroupObject,
} from './group';
import { EntropyRule } from './rules/entropy';
import { KeyringRule } from './rules/keyring';
import { SnapRule } from './rules/snap';
import type {
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from './types';
import type { AccountWalletEntropyObject, AccountWalletObject } from './wallet';
import { AccountTreeWallet } from './wallet';

export const controllerName = 'AccountTreeController';

const accountTreeControllerMetadata: StateMetadata<AccountTreeControllerState> =
  {
    accountTree: {
      persist: false, // We do re-recompute this state everytime.
      anonymous: false,
    },
    isLegacyAccountSyncingDisabled: {
      persist: true,
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
    isLegacyAccountSyncingDisabled: {},
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
        }
      });

      // Clear reverse-mapping for that account.
      this.#accountIdToContext.delete(accountId);
    }
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

  /**
   * "Big sync" method that will:
   *
   * - 1. Iterate over all AccountWalletEntropyObject, and then, for each wallet:
   * - 2. Assess if legacy account syncing is needed:
   * - - 2.1 If any local wallet needs a legacy sync, we perform legacy syncing.
   * - 3. Perform multichain account syncing
   * - - 3.1 Wallet syncing
   * - - 3.2 Wallet's Groups syncing
   */
  async syncWithUserStorage(): Promise<void> {
    // Prevent multiple syncs from running at the same time.
    // Also prevents atomic updates from being applied while syncing is in progress.
    if (this.state.isAccountSyncingInProgress) {
      return;
    }

    try {
      this.update((state) => {
        state.isAccountSyncingInProgress = true;
      });

      // TODO: extract this logic into a separate method
      const getLocalEntropyWallets = (): AccountWalletEntropyObject[] => {
        return Object.values(this.state.accountTree.wallets).filter(
          (wallet) => wallet.type === AccountWalletType.Entropy,
        );
      };
      // TODO: extract this logic into a separate method
      const getLocalGroupsForEntropyWallet = (
        walletId: AccountWalletId,
      ): AccountGroupMultichainAccountObject[] => {
        const wallet = this.state.accountTree.wallets[walletId];
        if (!wallet) {
          return [];
        }

        return Object.values(wallet.groups);
      };

      // Get the feature flag value from UserStorageController
      // This will determine if we should proceed with multichain account syncing, and allow multiple legacy syncs to run.
      const isMultichainAccountSyncingEnabled = this.messagingSystem.call(
        'UserStorageController:getIsMultichainAccountSyncingEnabled',
      );

      // 1. Iterate over all AccountWalletEntropyObject
      const localSyncableWallets = getLocalEntropyWallets();

      if (!localSyncableWallets.length) {
        // No wallets to sync, just return. This shouldn't happen.
        return;
      }

      // 2. Assess if legacy account syncing is needed
      // 2.1 If any wallet has legacy account syncing data, execute legacy syncing before proceeding.
      const doSomeLocalSyncableWalletsNeedLegacySyncing =
        localSyncableWallets.some(
          (syncableWallet) =>
            !this.state.isLegacyAccountSyncingDisabled[
              syncableWallet.metadata.entropy.id
            ],
        );

      if (doSomeLocalSyncableWalletsNeedLegacySyncing) {
        // Dispatch legacy account syncing method before proceeding
        // This will add and rename accounts as needed, and then update the account tree state accordingly.
        await this.messagingSystem.call(
          'UserStorageController:syncInternalAccountsWithUserStorage',
        );

        const primarySrpProfileId = await getProfileId(this.messagingSystem);
        await emitAnalyticsEvent({
          action: MultichainAccountSyncingAnalyticsEvents.LEGACY_SYNCING_DONE,
          profileId: primarySrpProfileId,
        });

        // After legacy syncing is done, we can check if multichain account syncing is enabled.
        // If it is not enabled, we can just return and not proceed with multichain account syncing.
        if (!isMultichainAccountSyncingEnabled) {
          return;
        }

        // If multichain account syncing is enabled, we prevent further legacy syncing
        // by setting `isLegacyAccountSyncingDisabled` to true for all local syncable wallets.
        // This is done to prevent legacy syncing from running again after the first successful sync.
        // If a new wallet is added later, it will still be able to run legacy syncing.
        // TODO: extract this logic into a separate method
        this.update((state) => {
          // Disable legacy syncing after the first successful sync.
          localSyncableWallets.forEach((syncableWallet) => {
            const syncableWalletEntropySourceId =
              syncableWallet.metadata.entropy.id;
            state.isLegacyAccountSyncingDisabled[
              syncableWalletEntropySourceId
            ] = true;
          });
        });
      }

      // 3. Multichain account syncing
      for (const wallet of localSyncableWallets) {
        const entropySourceId = wallet.metadata.entropy.id;
        const profileId = await getProfileId(
          this.messagingSystem,
          entropySourceId,
        );

        const [walletFromUserStorage, groupsFromUserStorage] =
          await Promise.all([
            getWalletFromUserStorage(this.messagingSystem, entropySourceId),
            getAllGroupsFromUserStorage(this.messagingSystem, entropySourceId),
          ]);

        // 3.1 Wallet syncing
        // If wallet data does not exist in user storage, push the local wallet
        if (!walletFromUserStorage) {
          await pushWalletToUserStorage(wallet, this.messagingSystem);
        }

        // TODO: extract the logic below into a separate method
        // If wallet data exists, compare metadata and update if needed
        // For now, some of what we need is not yet implemented, so we're mocking it.
        // Also, since we don't add or remove wallets, the logic here only concerns comparing metadata and renaming if needed.
        if (walletFromUserStorage) {
          const walletPersistedMetadata =
            this.state.accountWalletsMetadata[wallet.id];

          // TODO: check if we need early exits depending on the presence of metadata in either local or user storage
          const isWalletNameFromUserStorageMoreRecent =
            walletPersistedMetadata.name?.lastUpdatedAt &&
            walletFromUserStorage.name?.lastUpdatedAt &&
            walletPersistedMetadata.name?.lastUpdatedAt <
              walletFromUserStorage.name?.lastUpdatedAt;

          const isWalletNameFromUserStorageDifferentFromLocal =
            walletPersistedMetadata.name?.value !==
            walletFromUserStorage.name?.value;

          if (isWalletNameFromUserStorageDifferentFromLocal) {
            if (
              isWalletNameFromUserStorageMoreRecent &&
              // TODO: extract this type guard into a separate method
              walletFromUserStorage.name?.value !== undefined
            ) {
              // If the name from user storage is more recent, update the local wallet name
              this.setAccountWalletName(
                wallet.id,
                walletFromUserStorage.name?.value,
              );

              await emitAnalyticsEvent({
                action: MultichainAccountSyncingAnalyticsEvents.WALLET_RENAMED,
                profileId,
              });
            } else {
              // If the local name is more recent, push it to user storage
              await pushWalletToUserStorage(wallet, this.messagingSystem);
            }
          }
        }

        // 3.2 Groups syncing
        // If groups data does not exist in user storage yet, create it
        if (!groupsFromUserStorage.length) {
          // If no groups exist in user storage, we can push all groups from the wallet to the user storage and exit
          await pushGroupToUserStorageBatch(
            getLocalGroupsForEntropyWallet(wallet.id),
            this.messagingSystem,
            entropySourceId,
          );

          continue; // No need to proceed with metadata comparison if groups are new
        }

        // Sort groups from user storage by groupIndex in ascending order
        groupsFromUserStorage.sort((a, b) => a.groupIndex - b.groupIndex);

        // Create local groups for each group from user storage
        // For now, we use idempotent local group creation logic for EVERY user storage group.
        // This is needed because a user might have out of sequence groups in user storage due to deletions.
        let previousGroupIndex = -1;
        for (const groupFromUserStorage of groupsFromUserStorage) {
          const { groupIndex } = groupFromUserStorage;

          const isGroupIndexOutOfSequence =
            groupIndex <= previousGroupIndex &&
            groupIndex !== previousGroupIndex + 1;
          previousGroupIndex = groupIndex;

          if (isGroupIndexOutOfSequence) {
            // TODO: Probably an erroneous situation
            // In the future, this might also mean that we need to delete some groups
          }

          // This will be idempotent so we can create the group even if it already exists
          await this.messagingSystem.call(
            'MultichainAccountService:createMultichainAccountGroup',
            {
              entropySource: entropySourceId,
              groupIndex,
            },
          );
          await emitAnalyticsEvent({
            action: MultichainAccountSyncingAnalyticsEvents.GROUP_ADDED,
            profileId,
          });
        }

        // Now we can compare groups metadata and update if needed
        const localSyncableGroupsToBePushedToUserStorage: AccountGroupMultichainAccountObject[] =
          [];

        // TODO: has it been updated yet with the groups we just created?
        const localSyncableGroups = getLocalGroupsForEntropyWallet(wallet.id);

        for (const localSyncableGroup of localSyncableGroups) {
          const groupFromUserStorage = groupsFromUserStorage.find(
            (group) =>
              group.groupIndex ===
              localSyncableGroup.metadata.entropy.groupIndex,
          );

          if (!groupFromUserStorage) {
            // If the group does not exist in user storage, we can push it
            localSyncableGroupsToBePushedToUserStorage.push(localSyncableGroup);
            continue; // No need to compare metadata if we just pushed it
          }

          // Compare metadata and update if needed
          const groupPersistedMetadata =
            this.state.accountGroupsMetadata[localSyncableGroup.id];

          // 1 - Name comparison
          const isGroupNameFromUserStorageDifferentFromLocal =
            groupPersistedMetadata.name?.value !==
            groupFromUserStorage.name?.value;

          // TODO: check if we need early exits depending on the presence of metadata in either local or user storage
          const isGroupNameFromUserStorageMoreRecent =
            groupPersistedMetadata.name?.lastUpdatedAt &&
            groupFromUserStorage.name?.lastUpdatedAt &&
            groupPersistedMetadata.name?.lastUpdatedAt <
              groupFromUserStorage.name?.lastUpdatedAt;

          if (isGroupNameFromUserStorageDifferentFromLocal) {
            if (
              isGroupNameFromUserStorageMoreRecent &&
              // TODO: extract this type guard into a separate method
              groupFromUserStorage.name?.value
            ) {
              // If the name from user storage is more recent, update the local group name
              this.setAccountGroupName(
                localSyncableGroup.id,
                groupFromUserStorage.name?.value,
              );

              await emitAnalyticsEvent({
                action: MultichainAccountSyncingAnalyticsEvents.GROUP_RENAMED,
                profileId,
              });
            } else {
              localSyncableGroupsToBePushedToUserStorage.push(
                localSyncableGroup,
              );
            }
          }

          // TODO: 2 - Pinned comparison
          // TODO: 3 - Hidden comparison
        }

        // Push all groups that need to be updated to user storage
        if (localSyncableGroupsToBePushedToUserStorage.length > 0) {
          await pushGroupToUserStorageBatch(
            localSyncableGroupsToBePushedToUserStorage,
            this.messagingSystem,
            entropySourceId,
          );
        }
      }
    } catch (error) {
      console.error('Error during account tree sync:', error);
      throw error;
    } finally {
      this.update((state) => {
        state.isAccountSyncingInProgress = false;
      });
    }
  }
}
