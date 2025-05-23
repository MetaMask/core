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

const controllerName = 'AccountGroupController';

export type AccountGroupId = string;

// NOTES:
// - Maybe add a `metadata` / `flags` for each groups (or at least, top-level ones)

export type AccountGroup = {
  id: AccountGroupId;
  name: string;
  subGroups: {
    [accountSubGroup: AccountGroupId]: AccountId[];
  };
};

export type AccountGroupMetadata = {
  name: string;
};

export type AccountGroupControllerState = {
  accountGroups: {
    groups: {
      // Wallet
      [accountGroup: AccountGroupId]: {
        // Multichain Account OR Account Group
        [accountSubGroup: AccountGroupId]: AccountId[]; // Blockchain Accounts
      };
    };
  };
  accountGroupsMetadata: {
    [accountGroup: AccountGroupId]: AccountGroupMetadata;
  };
};

export type AccountGroupControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AccountGroupControllerState
>;

export type AccountGroupControllerListAccountGroupsAction = {
  type: `${typeof controllerName}:listAccountGroups`;
  handler: AccountGroupController['listAccountGroups'];
};

export type AllowedActions = AccountsControllerListMultichainAccountsAction;

export type AccountGroupControllerActions =
  AccountGroupControllerListAccountGroupsAction;

export type AccountGroupControllerChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AccountGroupControllerState
>;

export type AllowedEvents =
  | AccountsControllerAccountAddedEvent
  | AccountsControllerAccountRemovedEvent;

export type AccountGroupControllerEvents = never;

export type AccountGroupControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AccountGroupControllerActions | AllowedActions,
  AccountGroupControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

const accountGroupControllerMetadata: StateMetadata<AccountGroupControllerState> =
  {
    accountGroups: {
      persist: false, // We do re-recompute this state everytime.
      anonymous: false,
    },
    accountGroupsMetadata: {
      persist: false, // TODO: Change it to true once we have data to persist.
      anonymous: false,
    },
  };

/**
 * Gets default state of the `AccountGroupController`.
 *
 * @returns The default state of the `AccountGroupController`.
 */
export function getDefaultAccountGroupControllerState(): AccountGroupControllerState {
  return {
    accountGroups: {
      groups: {},
    },
    accountGroupsMetadata: {},
  };
}

// TODO: For now we use this for the 2nd-level of the tree until we implements proper multichain accounts.
// QUESTION: This might still be useful for accounts that are not multichains?
export const DEFAULT_SUB_GROUP = 'default';

/**
 * Cast a generic ID to a group ID.
 *
 * @param id - Generic ID.
 * @returns The group ID.
 */
function asAccountGroupId(id: unknown): AccountGroupId {
  // For now, we're just casting, but we could think of something better (e.g. "wallet:<entropy-source-id>",
  // "snap:<snap-id>", "keyring:<keyring-id>", etc..).
  return id as AccountGroupId;
}

export class AccountGroupController extends BaseController<
  typeof controllerName,
  AccountGroupControllerState,
  AccountGroupControllerMessenger
> {
  /**
   * Constructor for AccountGroupController.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger object.
   * @param options.state - Initial state to set on this controller
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: AccountGroupControllerMessenger;
    state?: AccountGroupControllerState;
  }) {
    super({
      messenger,
      name: controllerName,
      metadata: accountGroupControllerMetadata,
      state: {
        ...getDefaultAccountGroupControllerState(),
        ...state,
      },
    });
  }

  #hasKeyringType(account: InternalAccount, type: KeyringTypes): boolean {
    return account.metadata.keyring.type === (type as string);
  }

  #groupByEntropySource(account: InternalAccount): AccountGroupId | undefined {
    if (this.#hasKeyringType(account, KeyringTypes.hd)) {
      // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
      if (!account.options.entropySource) {
        console.warn(
          "! Found an HD account with no entropy source: account won't be associated to its wallet",
        );
        return undefined;
      }

      return asAccountGroupId(account.options.entropySource);
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
        return asAccountGroupId(entropySource);
      }
    }

    return undefined;
  }

  #groupBySnapId(account: InternalAccount): AccountGroupId | undefined {
    if (
      this.#hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap &&
      account.metadata.snap.enabled
    ) {
      return account.metadata.snap.id;
    }

    return undefined;
  }

  #groupByWalletType(account: InternalAccount): AccountGroupId | undefined {
    return account.metadata.keyring.type as AccountGroupId;
  }

  async updateAccountGroups(): Promise<void> {
    const rules = [
      // 1. We group by entropy-source
      (account: InternalAccount) => this.#groupByEntropySource(account),
      // 2. We group by Snap ID
      (account: InternalAccount) => this.#groupBySnapId(account),
      // 3. We group by wallet type
      (account: InternalAccount) => this.#groupByWalletType(account),
    ];
    const groups: AccountGroupControllerState['accountGroups']['groups'] = {};

    for (const account of this.#listAccounts()) {
      for (const rule of rules) {
        const groupId = rule(account);

        if (!groupId) {
          // If none group ID got found, we continue and use the next rule.
          continue;
        }

        if (!groups[groupId]) {
          // For now, we add a default sub-group.
          groups[groupId] = {
            [DEFAULT_SUB_GROUP]: [],
          };
        }
        groups[groupId][DEFAULT_SUB_GROUP].push(account.id);

        // We found a matching rule, stop and continue with the next account.
        break;
      }
    }

    this.update((state) => {
      state.accountGroups.groups = groups;
    });
  }

  async listAccountGroups(): Promise<AccountGroup[]> {
    return Object.keys(this.state.accountGroups.groups).map(
      (groupId: AccountGroupId) => {
        const subGroups = this.state.accountGroups.groups[groupId];
        return {
          id: groupId,
          name: this.state.accountGroupsMetadata[groupId].name,
          subGroups,
        };
      },
    );
  }

  /**
   * Lists the multichain accounts coming from the `AccountsController`.
   *
   * @returns A list of multichain accounts.
   */
  #listAccounts(): InternalAccount[] {
    return this.messagingSystem.call(
      'AccountsController:listMultichainAccounts',
    );
  }
}
