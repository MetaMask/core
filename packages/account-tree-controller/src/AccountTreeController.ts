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

import { getAccountWalletNameFromKeyringType } from './names';

const controllerName = 'AccountTreeController';

export enum AccountWalletCategory {
  Entropy = 'entropy',
  Keyring = 'keyring',
  Snap = 'snap',
}

type AccountTreeRuleMatch = {
  category: AccountWalletCategory;
  id: AccountWalletId;
  name: string;
};

type AccountTreeRuleFunction = (
  account: InternalAccount,
) => AccountTreeRuleMatch | undefined;

type AccountReverseMapping = {
  walletId: AccountWalletId;
  groupId: AccountGroupId;
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
  // Account groups OR Multichain accounts (once available).
  groups: {
    [groupId: AccountGroupId]: AccountGroup;
  };
  metadata: AccountWalletMetadata;
};

export type AccountTreeControllerState = {
  accountTree: {
    wallets: {
      // Wallets:
      [walletId: AccountWalletId]: AccountWallet;
    };
  };
};

export type AccountTreeControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountTreeControllerState
>;

export type AllowedActions =
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

// TODO: For now we use this for the 2nd-level of the tree until we implements proper multichain accounts.
export const DEFAULT_ACCOUNT_GROUP_UNIQUE_ID: string = 'default'; // This might need to be re-evaluated based on new structure
export const DEFAULT_ACCOUNT_GROUP_NAME: string = 'Default';

/**
 * Convert a unique ID to a wallet ID for a given category.
 *
 * @param category - A wallet category.
 * @param id - A unique ID.
 * @returns A wallet ID.
 */
export function toAccountWalletId(
  category: AccountWalletCategory,
  id: string,
): AccountWalletId {
  return `${category}:${id}`;
}

/**
 * Convert a wallet ID and a unique ID, to a group ID.
 *
 * @param walletId - A wallet ID.
 * @param id - A unique ID.
 * @returns A group ID.
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
 * @param walletId - A wallet ID.
 * @returns The default group ID.
 */
export function toDefaultAccountGroupId(
  walletId: AccountWalletId,
): AccountGroupId {
  return toAccountGroupId(walletId, DEFAULT_ACCOUNT_GROUP_UNIQUE_ID);
}

export class AccountTreeController extends BaseController<
  typeof controllerName,
  AccountTreeControllerState,
  AccountTreeControllerMessenger
> {
  readonly #reverse: Map<AccountId, AccountReverseMapping>;

  readonly #rules: AccountTreeRuleFunction[];

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
    this.#reverse = new Map();

    // Rules to apply to construct the wallets tree.
    this.#rules = [
      // 1. We group by entropy-source
      (account: InternalAccount) => this.#matchGroupByEntropySource(account),
      // 2. We group by Snap ID
      (account: InternalAccount) => this.#matchGroupBySnapId(account),
      // 3. We group by wallet type (this rule cannot fail and will group all non-matching accounts)
      (account: InternalAccount) => this.#matchGroupByKeyringType(account),
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

  #hasKeyringType(account: InternalAccount, type: KeyringTypes): boolean {
    return account.metadata.keyring.type === (type as string);
  }

  #matchGroupByEntropySource(
    account: InternalAccount,
  ): AccountTreeRuleMatch | undefined {
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
  ): AccountTreeRuleMatch | undefined {
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
  ): AccountTreeRuleMatch | undefined {
    const { type } = account.metadata.keyring;

    return {
      category: AccountWalletCategory.Keyring,
      id: toAccountWalletId(AccountWalletCategory.Keyring, type),
      name: getAccountWalletNameFromKeyringType(type as KeyringTypes),
    };
  }

  #getSnapName(snapId: SnapId): string {
    const snap = this.messagingSystem.call('SnapController:get', snapId);
    const snapName = snap
      ? // TODO: Handle localization here, but that's a "client thing", so we don't have a `core` controller
        // to refer too.
        snap.manifest.proposedName
      : stripSnapPrefix(snapId);

    return `Snap: ${snapName}`;
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

  #insert(
    wallets: { [walletId: AccountWalletId]: AccountWallet },
    account: InternalAccount,
  ) {
    for (const rule of this.#rules) {
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

      // Update the reverse mapping for this account.
      this.#reverse.set(account.id, {
        walletId,
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
