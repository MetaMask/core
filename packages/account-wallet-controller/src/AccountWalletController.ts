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
import { cloneDeep } from 'lodash';

import { generateAccountWalletName } from './utils';

const controllerName = 'AccountWalletController';

export enum AccountWalletCategory {
  Entropy = 'entropy',
  Snap = 'snap',
  Keyring = 'keyring',
  Default = 'default', // TODO: Remove `default` once we have multichain accounts.
}

type AccountWalletRuleMatch = {
  id: string;
  category: AccountWalletCategory;
};

export type AccountWalletId = `${AccountWalletCategory}:${string}`;
export type AccountGroupId = `${AccountWalletId}:${string}`;

// Do not export this one, we just use it to have a common type interface between group and wallet metadata.
type Metadata = {
  name: string;
};

export type AccountWalletMetadata = Metadata;

export type AccountGroupMetadata = Metadata;

export type AccountGroup = {
  id: AccountGroupId;
  // Blockchain Accounts:
  accounts: AccountId[];
  metadata: AccountGroupMetadata;
};

export type AccountWallet = {
  id: AccountWalletId;
  // Account groups OR Multichain accounts (once avaialble).
  groups: {
    [accountGroup: AccountGroupId]: AccountGroup;
  };
  metadata: AccountGroupMetadata; // Assuming Metadata is a defined type
};

export type AccountWalletControllerState = {
  accountWallets: {
    // Wallets:
    [accountWallet: AccountWalletId]: AccountWallet;
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
export const DEFAULT_ACCOUNT_GROUP_UNIQUE_ID: string = 'default'; // This might need to be re-evaluated based on new structure
export const DEFAULT_ACCOUNT_GROUP_NAME: string = 'Default';

/**
 * Convert a unique ID to a wallet ID for a given category.
 *
 * @param category - The category of the wallet.
 * @param id - The unique ID.
 * @returns The wallet ID.
 */
export function toAccountWalletId(
  category: AccountWalletCategory,
  id: string,
): AccountWalletId {
  return `${category}:${id}`;
}

/**
 * Convert a wallet ID and a unique ID to a group ID.
 *
 * @param walletId - The wallet ID.
 * @param id - The unique ID.
 * @returns The group ID.
 */
export function toAccountGroupId(
  walletId: AccountWalletId,
  id: string,
): AccountGroupId {
  return `${walletId}:${id}`;
}

/**
 * Convert a wallet ID to the default group ID.
 *
 * @param walletId - The wallet ID.
 * @returns The default group ID.
 */
export function toDefaultAccountGroupId(
  walletId: AccountWalletId,
): AccountGroupId {
  return toAccountGroupId(walletId, DEFAULT_ACCOUNT_GROUP_UNIQUE_ID);
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

  #getEntropySource(
    account: InternalAccount,
  ): AccountWalletRuleMatch | undefined {
    if (this.#hasKeyringType(account, KeyringTypes.hd)) {
      // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
      if (!account.options.entropySource) {
        console.warn(
          "! Found an HD account with no entropy source: account won't be associated to its wallet",
        );
        return undefined;
      }

      return {
        category: AccountWalletCategory.Entropy,
        id: account.options.entropySource as string,
      };
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
        return {
          category: AccountWalletCategory.Entropy,
          id: entropySource as string,
        };
      }
    }

    return undefined;
  }

  #getSnapId(account: InternalAccount): AccountWalletRuleMatch | undefined {
    if (
      this.#hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap &&
      account.metadata.snap.enabled
    ) {
      return {
        category: AccountWalletCategory.Snap,
        id: account.metadata.snap.id,
      };
    }

    return undefined;
  }

  #getKeyringType(
    account: InternalAccount,
  ): AccountWalletRuleMatch | undefined {
    return {
      category: AccountWalletCategory.Keyring,
      id: account.metadata.keyring.type as string,
    };
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
      (account: InternalAccount) => this.#getEntropySource(account),
      // 2. We group by Snap ID
      (account: InternalAccount) => this.#getSnapId(account),
      // 3. We group by wallet type
      (account: InternalAccount) => this.#getKeyringType(account),
    ];

    const wallets: AccountWalletControllerState['accountWallets'] = {};

    for (const account of this.#listAccounts()) {
      for (const rule of rules) {
        const match = rule(account);

        if (!match) {
          // No match for that rule, we go to the next one.
          continue;
        }

        const walletId = toAccountWalletId(match.category, match.id);
        const groupId = toDefaultAccountGroupId(walletId); // Use a single-group for now until multichain accounts is supported.
        if (!wallets[walletId]) {
          wallets[walletId] = {
            id: walletId,
            groups: {
              [groupId]: {
                id: groupId,
                accounts: [],
                metadata: { name: DEFAULT_ACCOUNT_GROUP_NAME },
              },
            },
            metadata: { name: generateAccountWalletName(walletId) },
          };
        }
        wallets[walletId].groups[groupId].accounts.push(account.id);
        break;
      }
    }

    // TODO: We might want to compute unique name in a more deterministic way!
    const finalWallets = this.#assignUniqueWalletNames(wallets);

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
