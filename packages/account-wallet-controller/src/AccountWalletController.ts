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
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { GetSnap as SnapControllerGetSnap } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { stripSnapPrefix } from '@metamask/snaps-utils';

const controllerName = 'AccountWalletController';

export enum AccountWalletCategory {
  Entropy = 'entropy',
  Snap = 'snap',
  Keyring = 'keyring',
  Default = 'default', // TODO: Remove `default` once we have multichain accounts.
}

type AccountWalletRuleMatch = {
  category: AccountWalletCategory;
  id: AccountWalletId;
  name: string;
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

export type AllowedActions =
  | AccountsControllerListMultichainAccountsAction
  | KeyringControllerGetStateAction
  | SnapControllerGetSnap;

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

  #matchGroupByEntropySource(
    account: InternalAccount,
  ): AccountWalletRuleMatch | undefined {
    let entropySource: string | undefined;

    if (this.#hasKeyringType(account, KeyringTypes.hd)) {
      // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
      if (!account.options.entropySource) {
        console.warn(
          "! Found an HD account with no entropy source: account won't be associated to its wallet",
        );
        return undefined;
      }

      entropySource = account.options.entropySource as string;
    }

    // TODO: For now, we're not checking if the Snap is a preinstalled one, and we probably should...
    if (
      this.#hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap?.enabled
    ) {
      // Not all Snaps have an entropy-source and options are not typed yet, so we have to check manually here.
      if (account.options.entropySource) {
        // We blindly trust the `entropySource` for now, but it could be wrong since it comes from a Snap.
        entropySource = account.options.entropySource as string;
      }
    }

    if (!entropySource) {
      return undefined;
    }

    // We check if we can get the name for that entropy source, if not this means this entropy does not match
    // any HD keyrings, thus, is invalid (this account will be grouped by another rule).
    const entropySourceName = this.#getEntropySourceName(entropySource);
    if (!entropySourceName) {
      console.warn(
        '! Tried to name a wallet using an unknown entropy, this should not be possible.',
      );
      return undefined;
    }

    return {
      category: AccountWalletCategory.Entropy,
      id: toAccountWalletId(AccountWalletCategory.Entropy, entropySource),
      name: entropySourceName,
    };
  }

  #matchGroupBySnapId(
    account: InternalAccount,
  ): AccountWalletRuleMatch | undefined {
    if (
      this.#hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap &&
      account.metadata.snap.enabled
    ) {
      const { id } = account.metadata.snap;

      return {
        category: AccountWalletCategory.Snap,
        id: toAccountWalletId(AccountWalletCategory.Snap, id),
        name: this.#getSnapName(id as SnapId),
      };
    }

    return undefined;
  }

  #matchGroupByKeyringType(
    account: InternalAccount,
  ): AccountWalletRuleMatch | undefined {
    const { type } = account.metadata.keyring;

    return {
      category: AccountWalletCategory.Keyring,
      id: toAccountWalletId(AccountWalletCategory.Keyring, type),
      name: this.#getKeyringName(type as KeyringTypes),
    };
  }

  #getSnapName(snapId: SnapId): string {
    const snap = this.messagingSystem.call('SnapController:get', snapId);

    if (!snap) {
      return stripSnapPrefix(snapId);
    }

    // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
    // to refer too.
    return snap.manifest.proposedName;
  }

  #getKeyringName(type: KeyringTypes) {
    switch (type) {
      case KeyringTypes.simple: {
        return 'Private Keys';
      }
      case KeyringTypes.hd: {
        return 'HD Wallet';
      }
      case KeyringTypes.trezor: {
        return 'Trezor';
      }
      case KeyringTypes.oneKey: {
        return 'OneKey';
      }
      case KeyringTypes.ledger: {
        return 'Ledger';
      }
      case KeyringTypes.lattice: {
        return 'Lattice';
      }
      case KeyringTypes.qr: {
        return 'QR';
      }
      case KeyringTypes.snap: {
        return 'Snap Wallet';
      }
      default: {
        return 'Unknown';
      }
    }
  }

  #getEntropySourceName(entropySource: string): string | undefined {
    const { keyrings } = this.messagingSystem.call(
      'KeyringController:getState',
    );

    const index = keyrings
      .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
      .findIndex((keyring) => keyring.metadata.id === entropySource);

    if (index === -1) {
      return undefined;
    }

    return `Wallet ${index + 1}`; // Use human indexing.
  }

  async updateAccountWallets(): Promise<void> {
    const rules = [
      // 1. We group by entropy-source
      (account: InternalAccount) => this.#matchGroupByEntropySource(account),
      // 2. We group by Snap ID
      (account: InternalAccount) => this.#matchGroupBySnapId(account),
      // 3. We group by wallet type
      (account: InternalAccount) => this.#matchGroupByKeyringType(account),
    ];

    const wallets: AccountWalletControllerState['accountWallets'] = {};

    for (const account of this.#listAccounts()) {
      let grouped = false;

      for (const rule of rules) {
        const match = rule(account);

        if (!match) {
          // No match for that rule, we go to the next one.
          continue;
        }

        const walletId = match.id;
        const walletName = match.name;
        const groupId = toDefaultAccountGroupId(walletId); // Use a single-group for now until multichain accounts is supported.
        const groupName = DEFAULT_ACCOUNT_GROUP_NAME;

        if (!wallets[walletId]) {
          wallets[walletId] = {
            id: walletId,
            groups: {
              [groupId]: {
                id: groupId,
                accounts: [],
                metadata: { name: groupName },
              },
            },
            metadata: {
              name: walletName,
            },
          };
        }
        wallets[walletId].groups[groupId].accounts.push(account.id);

        // Mark this account as grouped
        grouped = true;
        break;
      }

      // This should never happen, but we should still check for it.
      if (!grouped) {
        throw new Error(
          `Account "${account.id}" could not be attached to any wallet/group`,
        );
      }
    }

    this.update((state) => {
      state.accountWallets = wallets;
    });
  }

  #listAccounts(): InternalAccount[] {
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    ) as InternalAccount[];
  }
}
