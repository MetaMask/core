import type {
  AccountId,
  AccountsControllerAccountAddedEvent,
  AccountsControllerAccountRemovedEvent,
  AccountsControllerListMultichainAccountsAction,
} from '@metamask/accounts-controller';
import type { StateMetadata } from '@metamask/base-controller';
import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
  type RestrictedMessenger,
  BaseController,
} from '@metamask/base-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import cloneDeep from 'lodash/cloneDeep';

import { generateAccountWalletName } from './utils';

const controllerName = 'AccountWalletController';

export enum AccountWalletCategory {
  Entropy = 'entropy',
  Snap = 'snap',
  Keyring = 'keyring',
  Default = 'default', // TODO: Remove `default` once we have multichain accounts.
}

export type AccountWalletId = `${AccountWalletCategory}:${string}` | string;
export type AccountGroupId = string;

export type AccountGroup = {
  accounts: AccountId[]; // Blockchain Accounts
  metadata: Metadata; // Assuming Metadata is a defined type
};

export type AccountWallet = {
  id: AccountWalletId;
  groups: {
    [accountGroup: AccountGroupId]: AccountGroup;
  };
  metadata: Metadata; // Assuming Metadata is a defined type
};

export type AccountWalletControllerState = {
  accountWallets: {
    // Wallet
    [accountWallet: AccountWalletId]: {
      // Multichain Account OR Account Group
      groups: {
        [accountGroup: AccountGroupId]: {
          accounts: AccountId[]; // Blockchain Accounts
          metadata: Metadata; // Assuming Metadata is a defined type
        };
      };
      metadata: Metadata; // Assuming Metadata is a defined type
    };
  };
};

export type AccountGroupsMetadata =
  AccountWalletControllerState['accountWallets'];

export type AccountWalletControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountWalletControllerState
>;

export type AllowedActions = AccountsControllerListMultichainAccountsAction;

export type AccountWalletControllerActions = never;

export type AccountWalletControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountWalletControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

export type AccountWalletControllerEvents = never;

export type AccountWalletControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountWalletControllerActions | AllowedActions,
  AccountWalletControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

const accountWalletControllerMetadata: StateMetadata<AccountWalletControllerState> =
  {
    accountWallets: {
      persist: false, // We do re-recompute this state everytime.
      anonymous: false,
    },
  };

/**
 * Gets default state of the `AccountWalletController`.
 *
 * @returns The default state of the `AccountWalletController`.
 */
export function getDefaultAccountWalletControllerState(): AccountWalletControllerState {
  return {
    accountWallets: {},
  };
}

// TODO: For now we use this for the 2nd-level of the tree until we implements proper multichain accounts.
export const DEFAULT_SUB_GROUP = 'default:default'; // This might need to be re-evaluated based on new structure

/**
 * Cast a generic ID to a wallet ID.
 *
 * @param category - The category of the wallet.
 * @param id - The ID of the wallet.
 * @returns The wallet ID.
 */
function toAccountWalletId(
  category: AccountWalletCategory,
  id: string | undefined,
): AccountWalletId | undefined {
  return id ? `${category}:${id}` : undefined;
}

export class AccountWalletController extends BaseController<
  typeof controllerName,
  AccountWalletControllerState,
  AccountWalletControllerMessenger
> {
  /**
   * Constructor for AccountWalletController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: AccountWalletControllerMessenger;
    state?: AccountWalletControllerState;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: accountWalletControllerMetadata,
      state: {
        ...getDefaultAccountWalletControllerState(),
        ...state,
      },
    });
  }

  #hasKeyringType(account: InternalAccount, type: KeyringTypes): boolean {
    return account.metadata.keyring.type === (type as string);
  }

  #getEntropySource(account: InternalAccount): string | undefined {
    if (this.#hasKeyringType(account, KeyringTypes.hd)) {
      // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
      if (!account.options.entropySource) {
        console.warn(
          "! Found an HD account with no entropy source: account won't be associated to its wallet",
        );
        return undefined;
      }

      return account.options.entropySource as string;
    }

    // TODO: For now, we're not checking if the Snap is a preinstalled one, and we probably should...
    if (
      this.#hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap?.enabled
    ) {
      // Not all Snaps have an entropy-source and options are not typed yet, so we have to check manually here.
      const { entropySource } = account.options;

      if (entropySource) {
        // We blindly trust the `entropySource` for now, but it could be wrong since it comes from a Snap.
        return entropySource as string;
      }
    }

    return undefined;
  }

  #getSnapId(account: InternalAccount): AccountWalletId | undefined {
    if (
      this.#hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap &&
      account.metadata.snap.enabled
    ) {
      return account.metadata.snap.id;
    }

    return undefined;
  }

  #getWalletType(account: InternalAccount): AccountWalletId | undefined {
    return account.metadata.keyring.type as string;
  }

  #assignUniqueWalletNames(
    wallets: AccountGroupsMetadata,
  ): AccountGroupsMetadata {
    const baseNameMap = new Map<string, AccountWalletId[]>();
    const finalWallets: AccountGroupsMetadata = cloneDeep(wallets);

    for (const walletIdString in finalWallets) {
      if (Object.prototype.hasOwnProperty.call(finalWallets, walletIdString)) {
        const walletId = walletIdString as AccountWalletId;
        const walletData = finalWallets[walletId];
        const baseName = walletData.metadata.name; // Assumes name is already generated

        if (!baseNameMap.has(baseName)) {
          baseNameMap.set(baseName, []);
        }
        baseNameMap.get(baseName)?.push(walletId);
      }
    }

    for (const [baseName, walletIdsWithSameBaseName] of baseNameMap.entries()) {
      if (walletIdsWithSameBaseName.length > 1) {
        walletIdsWithSameBaseName.sort((a, b) => a.localeCompare(b));
        let counter = 1;
        for (const walletId of walletIdsWithSameBaseName) {
          finalWallets[walletId].metadata.name = `${baseName} ${counter}`;
          counter += 1;
        }
      }
    }
    return finalWallets;
  }

  async updateAccountWallets(): Promise<void> {
    const rules = [
      // 1. We group by entropy-source
      {
        category: AccountWalletCategory.Entropy,
        rule: (account: InternalAccount) => this.#getEntropySource(account),
      },
      // 2. We group by Snap ID
      {
        category: AccountWalletCategory.Snap,
        rule: (account: InternalAccount) => this.#getSnapId(account),
      },
      // 3. We group by wallet type
      {
        category: AccountWalletCategory.Keyring,
        rule: (account: InternalAccount) => this.#getWalletType(account),
      },
    ];
    const initialWallets: AccountGroupsMetadata = {};

    for (const account of this.#listAccounts()) {
      for (const { category, rule } of rules) {
        const walletId = toAccountWalletId(
          category,
          rule(account) ?? undefined,
        );

        if (!walletId) {
          continue;
        }

        if (!initialWallets[walletId]) {
          initialWallets[walletId] = {
            groups: {
              [DEFAULT_SUB_GROUP]: {
                accounts: [],
                metadata: { name: '' },
              },
            },
            metadata: { name: generateAccountWalletName(walletId) },
          };
        }
        initialWallets[walletId].groups[DEFAULT_SUB_GROUP].accounts.push(
          account.id,
        );
        break;
      }
    }

    const finalWallets = this.#assignUniqueWalletNames(initialWallets);

    this.update((state) => {
      state.accountWallets = finalWallets;
    });
  }

  #listAccounts(): InternalAccount[] {
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    ) as InternalAccount[];
  }
}

export type Metadata = {
  name: string;
};
