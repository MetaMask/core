import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { isEvmAccountType } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import {
  getAllGroupsFromUserStorage,
  getLegacyAccountSyncingAccountsFromUserStorage,
  getWalletFromUserStorage,
  pushGroupToUserStorage,
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
    isLegacyAccountSyncingEnabled: {
      persist: true,
      anonymous: false,
    },
    isAccountSyncingInProgress: {
      persist: false,
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
    isLegacyAccountSyncingEnabled: true, // Gets set to false after a successful legacy sync.
    isAccountSyncingInProgress: false, // Used to track if syncing is in progress.
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

    // For now, we always re-compute all wallets, we do not re-use the existing state.
    for (const account of this.#listAccounts()) {
      this.#insert(wallets, account);
    }

    // Once we have the account tree, we can compute the name.
    for (const wallet of Object.values(wallets)) {
      this.#renameAccountWalletIfNeeded(wallet);

      for (const group of Object.values(wallet.groups)) {
        this.#renameAccountGroupIfNeeded(wallet, group);
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

  #renameAccountWalletIfNeeded(wallet: AccountWalletObject) {
    if (wallet.metadata.name) {
      return;
    }

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

  #renameAccountGroupIfNeeded(
    wallet: AccountWalletObject,
    group: AccountGroupObject,
  ) {
    if (group.metadata.name) {
      return;
    }

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
          this.#renameAccountWalletIfNeeded(wallet);

          const group = wallet.groups[groupId];
          if (group) {
            this.#renameAccountGroupIfNeeded(wallet, group);
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
          ...result.group.metadata,
        },
        // We do need to type-cast since we're not narrowing `result` with
        // the union tag `result.group.type`.
      } as AccountGroupObject;
      group = wallet.groups[groupId];
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
   * - 2. Fetch the latest data from user storage, for both legacy and multichain account syncing
   * - - 2.1 If any wallet has legacy account syncing data, execute legacy syncing before proceeding.
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

    // TODO: implement this
    const sendMixpanelEvent = async (eventName: string) => {
      // await send({
      //   eventName,
      //   profileId: this.messagingSystem.call(
      //     'UserStorageController:getProfileId',
      //   )
      // });
      return eventName;
    };

    try {
      this.update((state) => {
        state.isAccountSyncingInProgress = true;
      });

      // 1. Iterate over all AccountWalletEntropyObject
      const localSyncableWallets: AccountWalletEntropyObject[] = [];

      for (const wallet of Object.values(this.state.accountTree.wallets)) {
        if (wallet.type === AccountWalletType.Entropy) {
          localSyncableWallets.push(wallet);
        }
      }

      if (!localSyncableWallets.length) {
        // No wallets to sync, just return. This shouldn't happen.
        return;
      }

      for (const wallet of localSyncableWallets) {
        const entropySourceId = wallet.metadata.entropy.id;

        // 2. Fetch legacy account syncing data, wallet data and groups data from user storage.
        const [
          legacyAccountsFromUserStorage,
          walletFromUserStorage,
          groupsFromUserStorage,
        ] = await Promise.all([
          getLegacyAccountSyncingAccountsFromUserStorage(
            this.messagingSystem,
            entropySourceId,
          ),
          getWalletFromUserStorage(this.messagingSystem, entropySourceId),
          getAllGroupsFromUserStorage(this.messagingSystem, entropySourceId),
        ]);

        // 2.1 If any wallet has legacy account syncing data, execute legacy syncing before proceeding.
        // Since 'UserStorageController:syncInternalAccountsWithUserStorage' already iterates over each entropy source,
        // we can just dispatch it at the moment we detect that at least one wallet has legacy data.
        // We then set `isLegacyAccountSyncingEnabled` to false to prevent further legacy syncing.
        if (
          legacyAccountsFromUserStorage?.length &&
          this.state.isLegacyAccountSyncingEnabled
        ) {
          // Dispatch legacy account syncing method before proceeding
          // This will add and rename accounts as needed, and then update the account tree state accordingly.
          await this.messagingSystem.call(
            'UserStorageController:syncInternalAccountsWithUserStorage',
          );
          await sendMixpanelEvent('legacy_account_syncing_done');

          this.update((state) => {
            state.isLegacyAccountSyncingEnabled = false; // Disable legacy syncing after the first successful sync.
          });
        }

        // 3. Multichain account syncing

        // 3.1 Wallet syncing
        // If wallet data does not exist in user storage yet, create it
        if (!walletFromUserStorage) {
          const groupsToPushToUserStorage = [];
          for (const group of Object.values(wallet.groups)) {
            groupsToPushToUserStorage.push(group);
          }
          await Promise.all([
            pushWalletToUserStorage(wallet, this.messagingSystem),
            ...groupsToPushToUserStorage.map((group) =>
              pushGroupToUserStorage(group, this.messagingSystem),
            ),
          ]);

          // TODO: Do we want to go on and still check groups in this case?
          continue; // No need to check groups if wallet is new, as they would be created above as well.
        }

        // TODO: extract the logic below into a separate method
        // If wallet data exists, compare metadata and update if needed
        // For now, some of what we need is not yet implemented, so we're mocking it.
        // Also, since we don't add or remove wallets, the logic here only concerns comparing metadata and renaming if needed.
        const isWalletNameFromUserStorageMoreRecent = false;
        const isWalletNameFromUserStorageDifferentFromLocal =
          wallet.metadata.name !== walletFromUserStorage.name;

        if (isWalletNameFromUserStorageDifferentFromLocal) {
          if (isWalletNameFromUserStorageMoreRecent) {
            // If the name from user storage is more recent, update the local wallet name
            wallet.metadata.name = walletFromUserStorage.name;
            this.update((state) => {
              state.accountTree.wallets[wallet.id].metadata.name =
                wallet.metadata.name;
            });
            await sendMixpanelEvent('wallet_name_updated_from_user_storage');
          } else {
            // If the local name is more recent, push it to user storage
            await pushWalletToUserStorage(wallet, this.messagingSystem);
          }
        }

        // 3.2 Groups syncing
        // If groups data does not exist in user storage yet, create it
        if (!groupsFromUserStorage.length) {
          // If no groups exist in user storage, we can push all groups from the wallet
          const groupsToPushToUserStorage = [];
          for (const group of Object.values(wallet.groups)) {
            groupsToPushToUserStorage.push(group);
          }
          await pushGroupToUserStorageBatch(
            groupsToPushToUserStorage,
            this.messagingSystem,
            entropySourceId,
          );

          continue; // No need to proceed with metadata comparison if groups are new
        }

        // For now, we use idempotent local group creation logic for EVERY user storage group.
        // This is needed because a user might have out of sequence groups in user storage due to deletions.
        for (const groupFromUserStorage of groupsFromUserStorage) {
          const { groupIndex } = groupFromUserStorage;

          // TODO: Use the MultichainAccountService here to create the group
          // This will be idempotent so we can create the group even if it already exists
          const createGroup = async (_groupIndex: number) => {
            // return await this.messagingSystem.call(
            //   'MultichainAccountService:createGroup',
            //   groupIndex,
            //   wallet.id,
            // );
          };
          await createGroup(groupIndex);
          await sendMixpanelEvent(`group_created_from_user_storage`);
        }

        // Now we can compare groups metadata and update if needed
        const localSyncableGroups: AccountGroupMultichainAccountObject[] = [];
        const localSyncableGroupsToBePushedToUserStorage: AccountGroupMultichainAccountObject[] =
          [];

        for (const group of Object.values(
          this.state.accountTree.wallets[wallet.id].groups,
        )) {
          localSyncableGroups.push(group);
        }

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
          // 1 - Name comparison
          const isGroupNameFromUserStorageMoreRecent = false; // TODO: Implement this logic
          const isGroupNameFromUserStorageDifferentFromLocal =
            localSyncableGroup.metadata.name !== groupFromUserStorage.name;

          if (isGroupNameFromUserStorageDifferentFromLocal) {
            if (isGroupNameFromUserStorageMoreRecent) {
              // If the name from user storage is more recent, update the local group name
              localSyncableGroup.metadata.name = groupFromUserStorage.name;
              this.update((state) => {
                state.accountTree.wallets[wallet.id].groups[
                  localSyncableGroup.id
                ].metadata.name = localSyncableGroup.metadata.name;
              });
              await sendMixpanelEvent('group_name_updated_from_user_storage');
            } else {
              localSyncableGroupsToBePushedToUserStorage.push(
                localSyncableGroup,
              );
            }
          }
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
