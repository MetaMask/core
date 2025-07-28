import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletCategory } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObject } from './group';
import type { AccountTreeRule } from './rule';
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
  };
}

/**
 * Context for an account.
 */
export type AccountContext = {
  /**
   * Wallet ID associated to that account.
   */
  walletId: AccountWalletId;

  /**
   * Account group ID associated to that account.
   */
  groupId: AccountGroupId;
};

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #accountIdToContext: Map<AccountId, AccountContext>;

  readonly #rules: AccountTreeRule[];

  readonly #categoryToRule: Record<AccountWalletCategory, AccountTreeRule>;

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
    this.#categoryToRule = {
      [AccountWalletCategory.Entropy]: new EntropyRule(this.messagingSystem),
      [AccountWalletCategory.Snap]: new SnapRule(this.messagingSystem),
      [AccountWalletCategory.Keyring]: new KeyringRule(this.messagingSystem),
    } as const;
    this.#rules = [
      // 1. We group by entropy-source
      this.#categoryToRule[AccountWalletCategory.Entropy],
      // 2. We group by Snap ID
      this.#categoryToRule[AccountWalletCategory.Snap],
      // 3. We group by wallet type (this rule cannot fail and will group all non-matching accounts)
      this.#categoryToRule[AccountWalletCategory.Keyring],
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

    // Default to the first non-empty group in case of errors.
    return this.#findFirstNonEmptyGroup(wallets);
  }

  #renameAccountWalletIfNeeded(wallet: AccountWalletObject) {
    if (wallet.metadata.name) {
      return;
    }

    const rule = this.#categoryToRule[wallet.metadata.type];
    wallet.metadata.name = rule.getDefaultAccountWalletName(wallet);
  }

  #renameAccountGroupIfNeeded(
    wallet: AccountWalletObject,
    group: AccountGroupObject,
  ) {
    if (group.metadata.name) {
      return;
    }

    const rule = this.#categoryToRule[wallet.metadata.type];
    group.metadata.name = rule.getDefaultAccountGroupName(group);
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
                this.#findFirstNonEmptyGroup(state.accountTree.wallets);
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
    for (const rule of this.#rules) {
      const result = rule.match(account);

      if (!result) {
        // No match for that rule, we go to the next one.
        continue;
      }

      // Update controller's state.
      const walletId = result.wallet.id;
      let wallet = wallets[walletId];
      if (!wallet) {
        wallets[walletId] = {
          id: walletId,
          groups: {},
          metadata: {
            name: '', // Will get updated later.
            ...result.wallet.metadata,
          },
        };
        wallet = wallets[walletId];
      }

      const groupId = result.group.id;
      let group = wallet.groups[groupId];
      if (!group) {
        wallet.groups[groupId] = {
          id: groupId,
          accounts: [],
          metadata: {
            name: '', // Will get updated later.
          },
        };
        group = wallet.groups[groupId];
      }

      group.accounts.push(account.id);

      // Update the reverse mapping for this account.
      this.#accountIdToContext.set(account.id, {
        walletId: wallet.id,
        groupId: group.id,
      });

      return;
    }
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
    const accountToSelect = this.#getFirstAccountInGroup(groupId);
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
   * Gets the first account ID in the specified group.
   *
   * @param groupId - The account group ID.
   * @returns The first account ID in the group, or undefined if no accounts found.
   */
  #getFirstAccountInGroup(groupId: AccountGroupId): AccountId | undefined {
    for (const wallet of Object.values(this.state.accountTree.wallets)) {
      if (wallet.groups[groupId]) {
        const group = wallet.groups[groupId];
        if (group && group.accounts.length > 0) {
          return group.accounts[0];
        }
      }
    }
    return undefined;
  }

  /**
   * Finds the first non-empty group in the given wallets object.
   *
   * @param wallets - The wallets object to search.
   * @returns The ID of the first non-empty group, or an empty string if no groups are found.
   */
  #findFirstNonEmptyGroup(wallets: {
    [walletId: AccountWalletId]: AccountWalletObject;
  }): AccountGroupId | '' {
    for (const wallet of Object.values(wallets)) {
      for (const group of Object.values(wallet.groups)) {
        if (group.accounts.length > 0) {
          return group.id;
        }
      }
    }
    return '';
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
