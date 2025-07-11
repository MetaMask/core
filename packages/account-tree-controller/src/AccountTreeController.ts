import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { toAccountWalletId } from '@metamask/account-api';
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

import type { Rule } from './rules';
import { EntropySourceRule, SnapIdRule, KeyringTypeRule } from './rules';
import type { AccountTreeWallet } from './AccountTreeWallet';

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
  readonly #reverse: Map<AccountId, AccountReverseMapping>;

  readonly #rules: Rule[];

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
      new EntropySourceRule(this.messagingSystem),
      // 2. We group by Snap ID
      new SnapIdRule(this.messagingSystem),
      // 3. We group by wallet type (this rule cannot fail and will group all non-matching accounts)
      new KeyringTypeRule(this.messagingSystem),
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
    const wallets = {};

    // For now, we always re-compute all wallets, we do not re-use the existing state.
    for (const account of this.#listAccounts()) {
      this.#insert(wallets, account);
    }

    this.update((state) => {
      state.accountTree.wallets = wallets;
    });
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
      const result = rule.match(account);

      if (!result) {
        // No match for that rule, we go to the next one.
        continue;
      }

      const walletId = toAccountWalletId(result.category, result.id);
      let wallet = this.#wallets.get(walletId);
      if (!wallet) {
        // If we don't have any AccountTreeWallet yet, we just create it.
        wallet = rule.build(result);
      }

      // This will automatically creates the group if it's missing.
      const group = wallet.addAccount(account);
      const groupId = group.id;

      if (!wallets[walletId]) {
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
        groupId,
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
