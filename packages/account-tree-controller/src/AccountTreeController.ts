import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import type {
  AccountId,
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerListMultichainAccountsAction,
  AccountsControllerSelectedAccountChangeEvent,
  AccountsControllerSetSelectedAccountAction,
} from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
  BaseController,
} from '@metamask/base-controller';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';

import type { AccountTreeWallet } from './AccountTreeWallet';
import type { WalletRule } from './rules';
import {
  EntropySourceWalletRule,
  SnapWalletRule,
  KeyringWalletRule,
} from './rules';

const controllerName = 'AccountTreeController';

type AccountReverseMapping = {
  walletId: AccountWalletId;
  groupId: AccountGroupId;
};

// Do not export this one, we just use it to have a common type interface between group and wallet metadata.
type Metadata = {
  name: string;
};

export type AccountWalletMetadata = Metadata;

export type AccountGroupMetadata = Metadata;

export type AccountGroupObject = {
  id: AccountGroupId;
  // Blockchain Accounts:
  accounts: AccountId[];
  metadata: AccountGroupMetadata;
};

export type AccountWalletObject = {
  id: AccountWalletId;
  // Account groups OR Multichain accounts (once available).
  groups: {
    [groupId: AccountGroupId]: AccountGroupObject;
  };
  metadata: AccountWalletMetadata;
};

export type AccountTreeControllerState = {
  accountTree: {
    wallets: {
      // Wallets:
      [walletId: AccountWalletId]: AccountWalletObject;
    };
  };
  selectedAccountGroup: AccountGroupId | '';
};

export type AccountTreeControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AccountTreeControllerSetSelectedAccountGroupAction = {
  type: `${typeof controllerName}:setSelectedAccountGroup`;
  handler: AccountTreeController['setSelectedAccountGroup'];
};

export type AccountTreeControllerGetSelectedAccountGroupAction = {
  type: `${typeof controllerName}:getSelectedAccountGroup`;
  handler: AccountTreeController['getSelectedAccountGroup'];
};

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerGetSelectedAccountAction
  | AccountsControllerListMultichainAccountsAction
  | AccountsControllerSetSelectedAccountAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap;

export type AccountTreeControllerActions =
  | AccountTreeControllerGetStateAction
  | AccountTreeControllerSetSelectedAccountGroupAction
  | AccountTreeControllerGetSelectedAccountGroupAction;

export type AccountTreeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent
  | AccountsControllerSelectedAccountChangeEvent;

export type AccountTreeControllerEvents = AccountTreeControllerStateChangeEvent;

export type AccountTreeControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountTreeControllerActions | AllowedActions,
  AccountTreeControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

const accountTreeControllerMetadata: StateMetadata<AccountTreeControllerState> =
  {
    accountTree: {
      persist: false, // We do re-recompute this state everytime.
      anonymous: false,
    },
    selectedAccountGroup: {
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
    },
    selectedAccountGroup: '',
  };
}

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #reverse: Map<AccountId, AccountReverseMapping>;

  readonly #rules: WalletRule[];

  readonly #wallets: Map<AccountWalletId, AccountTreeWallet>;

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
    this.#wallets = new Map();

    // Reverse map to allow fast node access from an account ID.
    this.#reverse = new Map();

    // Rules to apply to construct the wallets tree.
    this.#rules = [
      // 1. We group by entropy-source
      new EntropySourceWalletRule(this.messagingSystem),
      // 2. We group by Snap ID
      new SnapWalletRule(this.messagingSystem),
      // 3. We group by wallet type (this rule cannot fail and will group all non-matching accounts)
      new KeyringWalletRule(this.messagingSystem),
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
    const wallets: { [walletId: AccountWalletId]: AccountWalletObject } = {};

    // For now, we always re-compute all wallets, we do not re-use the existing state.
    for (const account of this.#listAccounts()) {
      this.#insert(wallets, account);
    }

    this.update((state) => {
      state.accountTree.wallets = wallets;

      if (state.selectedAccountGroup === '') {
        // No group is selected yet, re-sync with the AccountsController.
        state.selectedAccountGroup =
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
      const accountMapping = this.#reverse.get(selectedAccount.id);
      if (accountMapping) {
        const { groupId } = accountMapping;

        return groupId;
      }
    }

    // Default to the first wallet, first group in case of errors.
    return Object.values(Object.values(wallets)[0]?.groups ?? {})[0]?.id ?? '';
  }

  getWallet(id: AccountWalletId): AccountTreeWallet | undefined {
    return this.#wallets.get(id);
  }

  getWallets(): AccountTreeWallet[] {
    return Array.from(this.#wallets.values());
  }

  #handleAccountAdded(account: InternalAccount) {
    this.update((state) => {
      this.#insert(state.accountTree.wallets, account);
    });
  }

  #handleAccountRemoved(accountId: AccountId) {
    const found = this.#reverse.get(accountId);

    if (found) {
      const { walletId, groupId } = found;
      this.update((state) => {
        const { accounts } =
          state.accountTree.wallets[walletId].groups[groupId];

        const index = accounts.indexOf(accountId);
        if (index !== -1) {
          accounts.splice(index, 1);
        }
      });
    }
  }

  #insert(
    wallets: { [walletId: AccountWalletId]: AccountWalletObject },
    account: InternalAccount,
  ) {
    for (const rule of this.#rules) {
      const match = rule.match(account);

      if (!match) {
        // No match for that rule, we go to the next one.
        continue;
      }

      const { wallet, group } = match;

      // Update in-memory wallet/group instances.
      this.#wallets.set(wallet.id, wallet);

      // Update controller's state.
      if (!wallets[wallet.id]) {
        wallets[wallet.id] = {
          id: wallet.id,
          groups: {
            [group.id]: {
              id: group.id,
              accounts: [],
              metadata: { name: group.getDefaultName() },
            },
          },
          metadata: {
            name: wallet.getDefaultName(),
          },
        };
      }
      wallets[wallet.id].groups[group.id].accounts.push(account.id);

      // Update the reverse mapping for this account.
      this.#reverse.set(account.id, {
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
    return this.state.selectedAccountGroup;
  }

  /**
   * Sets the selected account group and updates the AccountsController selectedAccount accordingly.
   *
   * @param accountGroupId - The account group ID to select.
   */
  setSelectedAccountGroup(accountGroupId: AccountGroupId): void {
    const currentSelectedGroup = this.state.selectedAccountGroup;

    // Idempotent check - if the same group is already selected, do nothing
    if (currentSelectedGroup === accountGroupId) {
      return;
    }

    // Find the first account in this group to select
    const accountToSelect = this.#getFirstAccountInGroup(accountGroupId);
    if (!accountToSelect) {
      throw new Error(`No accounts found in group: ${accountGroupId}`);
    }

    // Update our state first
    this.update((state) => {
      state.selectedAccountGroup = accountGroupId;
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
    const accountMapping = this.#reverse.get(account.id);
    if (!accountMapping) {
      // Account not in tree yet, might be during initialization
      return;
    }

    const { groupId } = accountMapping;
    const currentSelectedGroup = this.state.selectedAccountGroup;

    // Idempotent check - if the same group is already selected, do nothing
    if (currentSelectedGroup === groupId) {
      return;
    }

    // Update selectedAccountGroup to match the selected account
    this.update((state) => {
      state.selectedAccountGroup = groupId;
    });
  }

  /**
   * Gets the first account ID in the specified group.
   *
   * @param accountGroupId - The account group ID.
   * @returns The first account ID in the group, or undefined if no accounts found.
   */
  #getFirstAccountInGroup(
    accountGroupId: AccountGroupId,
  ): AccountId | undefined {
    for (const wallet of Object.values(
      this.state.accountTree.wallets,
    ) as AccountWalletObject[]) {
      if (Object.hasOwnProperty.call(wallet.groups, accountGroupId)) {
        const group = (wallet.groups as Record<string, AccountGroupObject>)[
          accountGroupId
        ];
        if (group && group.accounts.length > 0) {
          return group.accounts[0];
        }
      }
    }
    return undefined;
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
