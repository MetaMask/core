import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletCategory } from '@metamask/account-api';
import type {
  AccountId,
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerGetAccountAction,
  AccountsControllerListMultichainAccountsAction,
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
import type { AccountTreeGroup } from 'src';

import { AccountTreeWallet } from './AccountTreeWallet';
import type { Rule } from './rules';
import { EntropyRule, SnapRule, KeyringRule } from './rules';
import type { AccountContext } from './types';

const controllerName = 'AccountTreeController';

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
  category: AccountWalletCategory;
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
};

export type AccountTreeControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedActions =
  | AccountsControllerGetAccountAction
  | AccountsControllerListMultichainAccountsAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap;

export type AccountTreeControllerActions = never;

export type AccountTreeControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

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
  };
}

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #accountIdToContext: Map<AccountId, AccountContext>;

  readonly #rules: Rule[];

  readonly #categoryToRule: Record<AccountWalletCategory, Rule>;

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
  }

  init() {
    const wallets: AccountTreeControllerState['accountTree']['wallets'] = {};

    // For now, we always re-compute all wallets, we do not re-use the existing state.
    for (const account of this.#listAccounts()) {
      this.#insert(wallets, account);
    }

    // Once we have the account tree, we can compute the name.
    for (const wallet of Object.values(wallets)) {
      const walletInstance = this.getWallet(wallet.id);

      if (walletInstance) {
        if (wallet.metadata.name === '') {
          this.#renameAccountWallet(walletInstance, wallet);
        }

        for (const group of Object.values(wallet.groups)) {
          const groupInstance = walletInstance.getAccountGroup(group.id);

          if (groupInstance) {
            if (group.metadata.name === '') {
              this.#renameAccountGroup(groupInstance, group);
            }
          }
        }
      }
    }

    this.update((state) => {
      state.accountTree.wallets = wallets;
    });
  }

  #renameAccountWallet(
    wallet: AccountTreeWallet,
    walletObject: AccountWalletObject,
  ) {
    const rule = this.#categoryToRule[walletObject.category];
    walletObject.metadata.name = rule.getDefaultAccountWalletName(wallet);
  }

  #renameAccountGroup(
    group: AccountTreeGroup,
    groupObject: AccountGroupObject,
  ) {
    const rule = this.#categoryToRule[group.wallet.category];
    groupObject.metadata.name = rule.getDefaultAccountGroupName(group);
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

      const context = this.#accountIdToContext.get(account.id);
      if (context) {
        const { walletId, groupId } = context;

        const wallet = state.accountTree.wallets[walletId];
        if (wallet) {
          const walletInstance = this.getWallet(wallet.id);
          if (walletInstance) {
            if (wallet.metadata.name === '') {
              this.#renameAccountWallet(walletInstance, wallet);
            }

            const group = wallet.groups[groupId];
            if (group) {
              const groupInstance = walletInstance.getAccountGroup(group.id);
              if (groupInstance) {
                if (group.metadata.name === '') {
                  this.#renameAccountGroup(groupInstance, group);
                }
              }
            }
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
    wallets: AccountTreeControllerState['accountTree']['wallets'],
    account: InternalAccount,
  ) {
    for (const rule of this.#rules) {
      const match = rule.match(account);

      if (!match) {
        // No match for that rule, we go to the next one.
        continue;
      }

      // Update controller's state.
      const walletId = match.wallet.id;
      const walletOptions = match.wallet.options;
      let wallet = wallets[walletId];
      if (!wallet) {
        wallets[walletId] = {
          id: walletId,
          category: rule.category,
          groups: {},
          metadata: {
            name: '', // Will get updated later.
          },
        };
        wallet = wallets[walletId];
      }

      const groupId = match.group.id;
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

      // Update in-memory wallet/group instances.
      this.#wallets.set(
        wallet.id,
        new AccountTreeWallet({
          messenger: this.messagingSystem,
          wallet,
          options: walletOptions,
        }),
      );

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
}
