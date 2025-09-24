import { AccountWalletType, select } from '@metamask/account-api';
import type {
  AccountGroupId,
  AccountWalletId,
  AccountSelector,
  MultichainAccountWalletId,
  AccountGroupType,
} from '@metamask/account-api';
import type { MultichainAccountWalletStatus } from '@metamask/account-api';
import { type AccountId } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TraceCallback } from '@metamask/controller-utils';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { assert } from '@metamask/utils';

import type { BackupAndSyncEmitAnalyticsEventParams } from './backup-and-sync/analytics';
import {
  formatAnalyticsEvent,
  traceFallback,
} from './backup-and-sync/analytics';
import { BackupAndSyncService } from './backup-and-sync/service';
import type { BackupAndSyncContext } from './backup-and-sync/types';
import type { AccountGroupObject, AccountTypeOrderKey } from './group';
import {
  ACCOUNT_TYPE_TO_SORT_ORDER,
  isAccountGroupNameUnique,
  isAccountGroupNameUniqueFromWallet,
  MAX_SORT_ORDER,
} from './group';
import type { Rule } from './rule';
import { EntropyRule } from './rules/entropy';
import { KeyringRule } from './rules/keyring';
import { SnapRule } from './rules/snap';
import type {
  AccountTreeControllerConfig,
  AccountTreeControllerInternalBackupAndSyncConfig,
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
} from './types';
import { type AccountWalletObject, type AccountWalletObjectOf } from './wallet';

export const controllerName = 'AccountTreeController';

const accountTreeControllerMetadata: StateMetadata<AccountTreeControllerState> =
  {
    accountTree: {
      includeInStateLogs: true,
      persist: false, // We do re-recompute this state everytime.
      anonymous: false,
      usedInUi: true,
    },
    isAccountTreeSyncingInProgress: {
      includeInStateLogs: false,
      persist: false,
      anonymous: false,
      usedInUi: true,
    },
    hasAccountTreeSyncingSyncedAtLeastOnce: {
      includeInStateLogs: true,
      persist: true,
      anonymous: false,
      usedInUi: true,
    },
    accountGroupsMetadata: {
      includeInStateLogs: true,
      persist: true,
      anonymous: false,
      usedInUi: true,
    },
    accountWalletsMetadata: {
      includeInStateLogs: true,
      persist: true,
      anonymous: false,
      usedInUi: true,
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
    isAccountTreeSyncingInProgress: false,
    hasAccountTreeSyncingSyncedAtLeastOnce: false,
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

  /**
   * Sort order of the account.
   */
  sortOrder: (typeof ACCOUNT_TYPE_TO_SORT_ORDER)[AccountTypeOrderKey];
};

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #accountIdToContext: Map<AccountId, AccountContext>;

  readonly #groupIdToWalletId: Map<AccountGroupId, AccountWalletId>;

  /**
   * Service responsible for all backup and sync operations.
   */
  readonly #backupAndSyncService: BackupAndSyncService;

  readonly #rules: [EntropyRule, SnapRule, KeyringRule];

  readonly #trace: TraceCallback;

  readonly #backupAndSyncConfig: AccountTreeControllerInternalBackupAndSyncConfig;

  #initialized: boolean;

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

    // This will be set to true upon the first `init` call.
    this.#initialized = false;

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

    // Initialize trace function
    this.#trace = config?.trace ?? traceFallback;

    // Initialize backup and sync config
    this.#backupAndSyncConfig = {
      emitAnalyticsEventFn: (event: BackupAndSyncEmitAnalyticsEventParams) => {
        return (
          config?.backupAndSync?.onBackupAndSyncEvent &&
          config.backupAndSync.onBackupAndSyncEvent(formatAnalyticsEvent(event))
        );
      },
    };

    // Initialize the backup and sync service
    this.#backupAndSyncService = new BackupAndSyncService(
      this.#createBackupAndSyncContext(),
    );

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
      'UserStorageController:stateChange',
      (userStorageControllerState) => {
        this.#backupAndSyncService.handleUserStorageStateChange(
          userStorageControllerState,
        );
      },
    );

    this.messagingSystem.subscribe(
      'MultichainAccountService:walletStatusChange',
      (walletId, status) => {
        this.#handleMultichainAccountWalletStatusChange(walletId, status);
      },
    );

    this.#registerMessageHandlers();
  }

  /**
   * Initialize the controller's state.
   *
   * It constructs the initial state of the account tree (tree nodes, nodes
   * names, metadata, etc..) and will automatically update the controller's
   * state with it.
   */
  init() {
    if (this.#initialized) {
      // We prevent re-initilializing the state multiple times. Though, we can use
      // `reinit` to re-init everything from scratch.
      return;
    }

    const wallets: AccountTreeControllerState['accountTree']['wallets'] = {};

    // Clear mappings for fresh rebuild.
    this.#accountIdToContext.clear();
    this.#groupIdToWalletId.clear();

    // Keep the current selected group to check if it's still part of the tree
    // after rebuilding it.
    const previousSelectedAccountGroup =
      this.state.accountTree.selectedAccountGroup;

    // For now, we always re-compute all wallets, we do not re-use the existing state.
    for (const account of this.#listAccounts()) {
      this.#insert(wallets, account);
    }

    // Once we have the account tree, we can apply persisted metadata (names + UI states).
    let previousSelectedAccountGroupStillExists = false;
    this.update((state) => {
      state.accountTree.wallets = wallets;

      // Apply group metadata within the state update
      for (const wallet of Object.values(state.accountTree.wallets)) {
        this.#applyAccountWalletMetadata(state, wallet.id);

        // Used for default group default names (so we use human-indexing here).
        let nextNaturalNameIndex = 1;
        for (const group of Object.values(wallet.groups)) {
          this.#applyAccountGroupMetadata(
            state,
            wallet.id,
            group.id,
            // FIXME: We should not need this kind of logic if we were not inserting accounts
            // 1 by 1. Instead, we should be inserting wallets and groups directly. This would
            // allow us to naturally insert a group in the tree AND update its metadata right
            // away...
            // But here, we have to wait for the entire group to be ready before updating
            // its metadata (mainly because we're dealing with single accounts rather than entire
            // groups).
            // That is why we need this kind of extra parameter.
            nextNaturalNameIndex,
          );

          if (group.id === previousSelectedAccountGroup) {
            previousSelectedAccountGroupStillExists = true;
          }
          nextNaturalNameIndex += 1;
        }
      }

      if (
        !previousSelectedAccountGroupStillExists ||
        previousSelectedAccountGroup === ''
      ) {
        // No group is selected yet OR group no longer exists, re-sync with the
        // AccountsController.
        state.accountTree.selectedAccountGroup =
          this.#getDefaultSelectedAccountGroup(wallets);
      }
    });

    // We still compare the previous and new value, the previous one could have been
    // an empty string and `#getDefaultSelectedAccountGroup` could also return an
    // empty string too, thus, we would re-use the same value here again. In that
    // case, no need to fire any event.
    if (
      previousSelectedAccountGroup !==
      this.state.accountTree.selectedAccountGroup
    ) {
      this.messagingSystem.publish(
        `${controllerName}:selectedAccountGroupChange`,
        this.state.accountTree.selectedAccountGroup,
        previousSelectedAccountGroup,
      );
    }

    this.#initialized = true;
  }

  /**
   * Re-initialize the controller's state.
   *
   * This is done in one single (atomic) `update` block to avoid having a temporary
   * cleared state.
   */
  reinit() {
    this.#initialized = false;
    this.init();
  }

  /**
   * Force-init if the controller's state has not been initilized yet.
   */
  #initAtLeastOnce() {
    if (!this.#initialized) {
      this.init();
    }
  }

  /**
   * Rule for entropy-base wallets.
   *
   * @returns The rule for entropy-based wallets.
   */
  #getEntropyRule(): EntropyRule {
    return this.#rules[0];
  }

  /**
   * Rule for Snap-base wallets.
   *
   * @returns The rule for snap-based wallets.
   */
  #getSnapRule(): SnapRule {
    return this.#rules[1];
  }

  /**
   * Rule for keyring-base wallets.
   *
   * This rule acts as a fallback and never fails since all accounts
   * comes from a keyring anyway.
   *
   * @returns The fallback rule for every accounts that did not match
   * any other rules.
   */
  #getKeyringRule(): KeyringRule {
    return this.#rules[2];
  }

  /**
   * Applies wallet metadata updates (name) by checking the persistent state
   * first, and then fallbacks to default values (based on the wallet's
   * type).
   *
   * @param state Controller state to update for persistence.
   * @param walletId The wallet ID to update.
   */
  #applyAccountWalletMetadata(
    state: AccountTreeControllerState,
    walletId: AccountWalletId,
  ) {
    const wallet = state.accountTree.wallets[walletId];
    const persistedMetadata = state.accountWalletsMetadata[walletId];

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

  /**
   * Gets the appropriate rule instance for a given wallet type.
   *
   * @param wallet - The wallet object to get the rule for.
   * @returns The rule instance that handles the wallet's type.
   */
  #getRuleForWallet<WalletType extends AccountWalletType>(
    wallet: AccountWalletObjectOf<WalletType>,
  ): Rule<WalletType, AccountGroupType> {
    switch (wallet.type) {
      case AccountWalletType.Entropy:
        return this.#getEntropyRule() as unknown as Rule<
          WalletType,
          AccountGroupType
        >;
      case AccountWalletType.Snap:
        return this.#getSnapRule() as unknown as Rule<
          WalletType,
          AccountGroupType
        >;
      default:
        return this.#getKeyringRule() as unknown as Rule<
          WalletType,
          AccountGroupType
        >;
    }
  }

  /**
   * Applies group metadata updates (name, pinned, hidden flags) by checking
   * the persistent state first, and then fallbacks to default values (based
   * on the wallet's
   * type).
   *
   * @param state Controller state to update for persistence.
   * @param walletId The wallet ID containing the group.
   * @param groupId The account group ID to update.
   * @param nextNaturalNameIndex The next natural name index for this group (only used for default names).
   */
  #applyAccountGroupMetadata(
    state: AccountTreeControllerState,
    walletId: AccountWalletId,
    groupId: AccountGroupId,
    nextNaturalNameIndex?: number,
  ) {
    const wallet = state.accountTree.wallets[walletId];
    const group = wallet.groups[groupId];
    const persistedGroupMetadata = state.accountGroupsMetadata[group.id];

    // Apply persisted name if available (including empty strings)
    if (persistedGroupMetadata?.name !== undefined) {
      state.accountTree.wallets[walletId].groups[groupId].metadata.name =
        persistedGroupMetadata.name.value;
    } else if (!group.metadata.name) {
      // Get the appropriate rule for this wallet type
      const rule = this.#getRuleForWallet(wallet);

      // Get the prefix for groups of this wallet
      const namePrefix = rule.getDefaultAccountGroupPrefix(wallet);

      // Skip computed names for now - use default naming with per-wallet logic
      // TODO: Implement computed names in a future iteration

      // Parse the highest account index being used (similar to accounts-controller)
      let highestNameIndex = 0;
      for (const existingGroup of Object.values(
        wallet.groups,
      ) as AccountGroupObject[]) {
        // Skip the current group being processed
        if (existingGroup.id === group.id) {
          continue;
        }
        // Parse the existing group name to extract the numeric index
        const nameMatch =
          existingGroup.metadata.name.match(/account\s+(\d+)$/iu);
        if (nameMatch) {
          const nameIndex = parseInt(nameMatch[1], 10);
          if (nameIndex > highestNameIndex) {
            highestNameIndex = nameIndex;
          }
        }
      }

      // We just use the highest known index no matter the wallet type.
      //
      // For entropy-based wallets (bip44), if a multichain account group with group index 1
      // is inserted before another one with group index 0, then the naming will be:
      // - "Account 1" (group index 1)
      // - "Account 2" (group index 0)
      // This naming makes more sense for the end-user.
      //
      // For other type of wallets, since those wallets can create arbitrary gaps, we still
      // rely on the highest know index to avoid back-filling account with "old names".
      let proposedNameIndex = Math.max(
        // Use + 1 to use the next available index.
        highestNameIndex + 1,
        // In case all accounts have been renamed differently than the usual "Account <index>"
        // pattern, we want to use the next "natural" index, which is just the number of groups
        // in that wallet (e.g. ["Account A", "Another Account"], next natural index would be
        // "Account 3" in this case).
        nextNaturalNameIndex ?? Object.keys(wallet.groups).length,
      );

      // Find a unique name by checking for conflicts and incrementing if needed
      let proposedNameExists: boolean;
      let proposedName = '';
      do {
        proposedName = `${namePrefix} ${proposedNameIndex}`;

        // Check if this name already exists in the wallet (excluding current group)
        proposedNameExists = !isAccountGroupNameUniqueFromWallet(
          wallet,
          group.id,
          proposedName,
        );

        /* istanbul ignore next */
        if (proposedNameExists) {
          proposedNameIndex += 1; // Try next number
        }
      } while (proposedNameExists);

      state.accountTree.wallets[walletId].groups[groupId].metadata.name =
        proposedName;

      // Persist the generated name to ensure consistency
      state.accountGroupsMetadata[group.id] ??= {};
      state.accountGroupsMetadata[group.id].name = {
        value: proposedName,
        // The `lastUpdatedAt` field is used for backup and sync, when comparing local names
        // with backed up names. In this case, the generated name should never take precedence
        // over a user-defined name, so we set `lastUpdatedAt` to 0.
        lastUpdatedAt: 0,
      };
    }

    // Apply persisted UI states
    if (persistedGroupMetadata?.pinned?.value !== undefined) {
      group.metadata.pinned = persistedGroupMetadata.pinned.value;
    }
    if (persistedGroupMetadata?.hidden?.value !== undefined) {
      group.metadata.hidden = persistedGroupMetadata.hidden.value;
    }
  }

  /**
   * Gets the account wallet object from its ID.
   *
   * @param walletId - Account wallet ID.
   * @returns The account wallet object if found, undefined otherwise.
   */
  getAccountWalletObject(
    walletId: AccountWalletId,
  ): AccountWalletObject | undefined {
    const wallet = this.state.accountTree.wallets[walletId];
    if (!wallet) {
      return undefined;
    }

    return wallet;
  }

  /**
   * Gets all account wallet objects.
   *
   * @returns All account wallet objects.
   */
  getAccountWalletObjects(): AccountWalletObject[] {
    return Object.values(this.state.accountTree.wallets);
  }

  /**
   * Gets all underlying accounts from the currently selected account
   * group.
   *
   * It also support account selector, which allows to filter specific
   * accounts given some criterias (account type, address, scopes, etc...).
   *
   * @param selector - Optional account selector.
   * @returns Underlying accounts for the currently selected account (filtered
   * by the selector if provided).
   */
  getAccountsFromSelectedAccountGroup(
    selector?: AccountSelector<InternalAccount>,
  ) {
    const groupId = this.getSelectedAccountGroup();
    if (!groupId) {
      return [];
    }

    const group = this.getAccountGroupObject(groupId);
    // We should never reach this part, so we cannot cover it either.
    /* istanbul ignore next */
    if (!group) {
      return [];
    }

    const accounts: InternalAccount[] = [];
    for (const id of group.accounts) {
      const account = this.messagingSystem.call(
        'AccountsController:getAccount',
        id,
      );

      // For now, we're filtering undefined account, but I believe
      // throwing would be more appropriate here.
      if (account) {
        accounts.push(account);
      }
    }

    return selector ? select(accounts, selector) : accounts;
  }

  /**
   * Gets the account group object from its ID.
   *
   * @param groupId - Account group ID.
   * @returns The account group object if found, undefined otherwise.
   */
  getAccountGroupObject(
    groupId: AccountGroupId,
  ): AccountGroupObject | undefined {
    const walletId = this.#groupIdToWalletId.get(groupId);
    if (!walletId) {
      return undefined;
    }

    const wallet = this.getAccountWalletObject(walletId);
    return wallet?.groups[groupId];
  }

  /**
   * Handles "AccountsController:accountAdded" event to insert
   * new accounts into the tree.
   *
   * @param account - New account.
   */
  #handleAccountAdded(account: InternalAccount) {
    // We force-init to make sure we have the proper account groups for the
    // incoming account change.
    this.#initAtLeastOnce();

    // Check if this account got already added by `#initAtLeastOnce`, if not, then we
    // can proceed.
    if (!this.#accountIdToContext.has(account.id)) {
      this.update((state) => {
        this.#insert(state.accountTree.wallets, account);

        const context = this.#accountIdToContext.get(account.id);
        if (context) {
          const { walletId, groupId } = context;

          const wallet = state.accountTree.wallets[walletId];
          if (wallet) {
            this.#applyAccountWalletMetadata(state, walletId);
            this.#applyAccountGroupMetadata(state, walletId, groupId);
          }
        }
      });

      this.messagingSystem.publish(
        `${controllerName}:accountTreeChange`,
        this.state.accountTree,
      );
    }
  }

  /**
   * Handles "AccountsController:accountRemoved" event to remove
   * given account from the tree.
   *
   * @param accountId - Removed account ID.
   */
  #handleAccountRemoved(accountId: AccountId) {
    // We force-init to make sure we have the proper account groups for the
    // incoming account change.
    this.#initAtLeastOnce();

    const context = this.#accountIdToContext.get(accountId);

    if (context) {
      const { walletId, groupId } = context;

      const previousSelectedAccountGroup =
        this.state.accountTree.selectedAccountGroup;
      let selectedAccountGroupChanged = false;

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
              const newSelectedAccountGroup = this.#getDefaultAccountGroupId(
                state.accountTree.wallets,
              );
              state.accountTree.selectedAccountGroup = newSelectedAccountGroup;
              selectedAccountGroupChanged =
                newSelectedAccountGroup !== previousSelectedAccountGroup;
            }
          }
          if (accounts.length === 0) {
            this.#pruneEmptyGroupAndWallet(state, walletId, groupId);
          }
        }
      });
      this.messagingSystem.publish(
        `${controllerName}:accountTreeChange`,
        this.state.accountTree,
      );

      // Emit selectedAccountGroupChange event if the selected group changed
      if (selectedAccountGroupChanged) {
        this.messagingSystem.publish(
          `${controllerName}:selectedAccountGroupChange`,
          this.state.accountTree.selectedAccountGroup,
          previousSelectedAccountGroup,
        );
      }

      // Clear reverse-mapping for that account.
      this.#accountIdToContext.delete(accountId);
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

    // Clean up metadata for the pruned group
    delete state.accountGroupsMetadata[groupId];

    if (Object.keys(wallets[walletId].groups).length === 0) {
      delete wallets[walletId];
    }
    return state;
  }

  /**
   * Insert an account inside an account tree.
   *
   * We go over multiple rules to try to "match" the account following
   * specific criterias. If a rule "matches" an account, then this
   * account get added into its proper account wallet and account group.
   *
   * @param wallets - Account tree.
   * @param account - The account to be inserted.
   */
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
        status: 'ready',
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
        this.#backupAndSyncService.enqueueSingleWalletSync(walletId);
      }
    }

    const groupId = result.group.id;
    let group = wallet.groups[groupId];
    const { type, id } = account;
    const sortOrder = ACCOUNT_TYPE_TO_SORT_ORDER[type];

    if (!group) {
      wallet.groups[groupId] = {
        ...result.group,
        // Type-wise, we are guaranteed to always have at least 1 account.
        accounts: [id],
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
        this.#backupAndSyncService.enqueueSingleGroupSync(groupId);
      }
    } else {
      group.accounts.push(id);
      // We need to do this at every insertion because race conditions can happen
      // during the account creation process where one provider completes before the other.
      // The discovery process in the service can also lead to some accounts being created "out of order".
      const { accounts } = group;
      accounts.sort(
        /* istanbul ignore next: Comparator branch execution (a===id vs b===id)
         * and return attribution vary across engines; final ordering is covered
         * by behavior tests. Ignoring the entire comparator avoids flaky line
         * coverage without reducing scenario coverage.
         */
        (a, b) => {
          const aSortOrder =
            a === id ? sortOrder : this.#accountIdToContext.get(a)?.sortOrder;
          const bSortOrder =
            b === id ? sortOrder : this.#accountIdToContext.get(b)?.sortOrder;
          return (
            (aSortOrder ?? MAX_SORT_ORDER) - (bSortOrder ?? MAX_SORT_ORDER)
          );
        },
      );
    }

    // Update the reverse mapping for this account.
    this.#accountIdToContext.set(account.id, {
      walletId: wallet.id,
      groupId: group.id,
      sortOrder,
    });
  }

  /**
   * List all internal accounts.
   *
   * @returns The list of all internal accounts.
   */
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
   * Asserts that an account group name is unique within the same wallet.
   *
   * @param groupId - The account group ID to exclude from the check.
   * @param name - The name to validate for uniqueness.
   * @throws Error if the name already exists in another group within the same wallet.
   */
  #assertAccountGroupNameIsUnique(groupId: AccountGroupId, name: string): void {
    if (!isAccountGroupNameUnique(this.state, groupId, name)) {
      throw new Error('Account group name already exists');
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
    const previousSelectedAccountGroup =
      this.state.accountTree.selectedAccountGroup;

    // Idempotent check - if the same group is already selected, do nothing
    if (previousSelectedAccountGroup === groupId) {
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
    this.messagingSystem.publish(
      `${controllerName}:selectedAccountGroupChange`,
      groupId,
      previousSelectedAccountGroup,
    );

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
      'AccountsController:getSelectedMultichainAccount',
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
    const previousSelectedAccountGroup =
      this.state.accountTree.selectedAccountGroup;

    // Idempotent check - if the same group is already selected, do nothing
    if (previousSelectedAccountGroup === groupId) {
      return;
    }

    // Update selectedAccountGroup to match the selected account
    this.update((state) => {
      state.accountTree.selectedAccountGroup = groupId;
    });
    this.messagingSystem.publish(
      `${controllerName}:selectedAccountGroupChange`,
      groupId,
      previousSelectedAccountGroup,
    );
  }

  /**
   * Handles multichain account wallet status change from
   * the MultichainAccountService.
   *
   * @param walletId - Multichain account wallet ID.
   * @param walletStatus - New multichain account wallet status.
   */
  #handleMultichainAccountWalletStatusChange(
    walletId: MultichainAccountWalletId,
    walletStatus: MultichainAccountWalletStatus,
  ): void {
    this.update((state) => {
      const wallet = state.accountTree.wallets[walletId];

      if (wallet) {
        wallet.status = walletStatus;
      }
    });
  }

  /**
   * Gets account group object.
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
   * Resolves name conflicts by adding a suffix to make the name unique.
   *
   * @internal
   * @param wallet - The wallet to check within.
   * @param groupId - The account group ID to exclude from the check.
   * @param name - The desired name that has a conflict.
   * @returns A unique name with suffix added if necessary.
   */
  resolveNameConflict(
    wallet: AccountWalletObject,
    groupId: AccountGroupId,
    name: string,
  ): string {
    let suffix = 2;
    let candidateName = `${name} (${suffix})`;

    // Keep incrementing suffix until we find a unique name
    while (
      !isAccountGroupNameUniqueFromWallet(wallet, groupId, candidateName)
    ) {
      suffix += 1;
      candidateName = `${name} (${suffix})`;
    }

    return candidateName;
  }

  /**
   * Sets a custom name for an account group.
   *
   * @param groupId - The account group ID.
   * @param name - The custom name to set.
   * @param autoHandleConflict - If true, automatically resolves name conflicts by adding a suffix. If false, throws on conflicts.
   * @throws If the account group ID is not found in the current tree.
   * @throws If the account group name already exists and autoHandleConflict is false.
   */
  setAccountGroupName(
    groupId: AccountGroupId,
    name: string,
    autoHandleConflict: boolean = false,
  ): void {
    // Validate that the group exists in the current tree
    this.#assertAccountGroupExists(groupId);

    const walletId = this.#groupIdToWalletId.get(groupId);
    assert(walletId, `Account group with ID "${groupId}" not found in tree`);

    const wallet = this.state.accountTree.wallets[walletId];
    let finalName = name;

    // Handle name conflicts based on the autoHandleConflict flag
    if (
      autoHandleConflict &&
      !isAccountGroupNameUniqueFromWallet(wallet, groupId, name)
    ) {
      finalName = this.resolveNameConflict(wallet, groupId, name);
    } else {
      // Validate that the name is unique
      this.#assertAccountGroupNameIsUnique(groupId, finalName);
    }

    this.update((state) => {
      /* istanbul ignore next */
      if (!state.accountGroupsMetadata[groupId]) {
        state.accountGroupsMetadata[groupId] = {};
      }

      // Update persistent metadata
      state.accountGroupsMetadata[groupId].name = {
        value: finalName,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly using efficient mapping
      state.accountTree.wallets[walletId].groups[groupId].metadata.name =
        finalName;
    });

    // Trigger atomic sync for group rename (only for groups from entropy wallets)
    if (wallet.type === AccountWalletType.Entropy) {
      this.#backupAndSyncService.enqueueSingleGroupSync(groupId);
    }
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

    // Trigger atomic sync for wallet rename (only for groups from entropy wallets)
    if (
      this.state.accountTree.wallets[walletId].type ===
      AccountWalletType.Entropy
    ) {
      this.#backupAndSyncService.enqueueSingleWalletSync(walletId);
    }
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

    const walletId = this.#groupIdToWalletId.get(groupId);

    this.update((state) => {
      /* istanbul ignore next */
      if (!state.accountGroupsMetadata[groupId]) {
        state.accountGroupsMetadata[groupId] = {};
      }

      // Update persistent metadata
      state.accountGroupsMetadata[groupId].pinned = {
        value: pinned,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly using efficient mapping
      if (walletId) {
        state.accountTree.wallets[walletId].groups[groupId].metadata.pinned =
          pinned;
      }
    });

    // Trigger atomic sync for group pinning (only for groups from entropy wallets)
    if (
      walletId &&
      this.state.accountTree.wallets[walletId].type ===
        AccountWalletType.Entropy
    ) {
      this.#backupAndSyncService.enqueueSingleGroupSync(groupId);
    }
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

    const walletId = this.#groupIdToWalletId.get(groupId);

    this.update((state) => {
      /* istanbul ignore next */
      if (!state.accountGroupsMetadata[groupId]) {
        state.accountGroupsMetadata[groupId] = {};
      }

      // Update persistent metadata
      state.accountGroupsMetadata[groupId].hidden = {
        value: hidden,
        lastUpdatedAt: Date.now(),
      };

      // Update tree node directly using efficient mapping
      if (walletId) {
        state.accountTree.wallets[walletId].groups[groupId].metadata.hidden =
          hidden;
      }
    });

    // Trigger atomic sync for group hiding (only for groups from entropy wallets)
    if (
      walletId &&
      this.state.accountTree.wallets[walletId].type ===
        AccountWalletType.Entropy
    ) {
      this.#backupAndSyncService.enqueueSingleGroupSync(groupId);
    }
  }

  /**
   * Clears the controller state and resets to default values.
   * Also clears the backup and sync service state.
   */
  clearState(): void {
    this.update(() => {
      return {
        ...getDefaultAccountTreeControllerState(),
      };
    });
    this.#backupAndSyncService.clearState();

    // So we know we have to call `init` again.
    this.#initialized = false;
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

    this.messagingSystem.registerActionHandler(
      `${controllerName}:getAccountsFromSelectedAccountGroup`,
      this.getAccountsFromSelectedAccountGroup.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setAccountWalletName`,
      this.setAccountWalletName.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setAccountGroupName`,
      this.setAccountGroupName.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setAccountGroupPinned`,
      this.setAccountGroupPinned.bind(this),
    );

    this.messagingSystem.registerActionHandler(
      `${controllerName}:setAccountGroupHidden`,
      this.setAccountGroupHidden.bind(this),
    );
  }

  /**
   * Bi-directionally syncs the account tree with user storage.
   * This will perform a full sync, including both pulling updates
   * from user storage and pushing local changes to user storage.
   * This also performs legacy account syncing if needed.
   *
   * IMPORTANT:
   * If a full sync is already in progress, it will return the ongoing promise.
   *
   * @returns A promise that resolves when the sync is complete.
   */
  async syncWithUserStorage(): Promise<void> {
    return this.#backupAndSyncService.performFullSync();
  }

  /**
   * Bi-directionally syncs the account tree with user storage.
   * This will ensure at least one full sync is ran, including both pulling updates
   * from user storage and pushing local changes to user storage.
   * This also performs legacy account syncing if needed.
   *
   * IMPORTANT:
   * If the first ever full sync is already in progress, it will return the ongoing promise.
   * If the first ever full sync was previously completed, it will NOT start a new sync, and will resolve immediately.
   *
   * @returns A promise that resolves when the first ever full sync is complete.
   */
  async syncWithUserStorageAtLeastOnce(): Promise<void> {
    return this.#backupAndSyncService.performFullSyncAtLeastOnce();
  }

  /**
   * Creates an backup and sync context for sync operations.
   * Used by the backup and sync service.
   *
   * @returns The backup and sync context.
   */
  #createBackupAndSyncContext(): BackupAndSyncContext {
    return {
      ...this.#backupAndSyncConfig,
      controller: this,
      messenger: this.messagingSystem,
      controllerStateUpdateFn: this.update.bind(this),
      traceFn: this.#trace.bind(this),
      groupIdToWalletId: this.#groupIdToWalletId,
    };
  }
}
