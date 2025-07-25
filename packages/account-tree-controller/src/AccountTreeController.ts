import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';
import { AccountWalletCategory } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountTreeRule } from './AccountTreeRule';
import { AccountTreeWallet } from './AccountTreeWallet';
import { EntropyRule } from './rules/entropy';
import { KeyringRule } from './rules/keyring';
import { SnapRule } from './rules/snap';
import type {
  AccountGroupObject,
  AccountTreeControllerMessenger,
  AccountTreeControllerState,
  AccountWalletObject,
} from './types';

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
    });
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
        const { accounts } =
          state.accountTree.wallets[walletId].groups[groupId];

        const index = accounts.indexOf(accountId);
        if (index !== -1) {
          accounts.splice(index, 1);
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
}
