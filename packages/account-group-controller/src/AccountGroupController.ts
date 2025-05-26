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

import { generateAccountGroupName } from './utils';

const controllerName = 'AccountGroupController';

export enum AccountGroupCategory {
  Entropy = 'entropy',
  Snap = 'snap',
  Keyring = 'keyring',
  Default = 'default', // TODO: Remove `default` once we have multichain accounts.
}

export type AccountGroupId = `${AccountGroupCategory}:${string}` | string;

// NOTES:
// - Maybe add a `metadata` / `flags` for each groups (or at least, top-level ones)

export type AccountGroup = {
  id: AccountGroupId;
  name: string;
  accounts: AccountId[];
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

export type AllowedActions = AccountsControllerListMultichainAccountsAction;

export type AccountGroupControllerActions = never;

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
      persist: false, // TODO: Change it to true once we have customizable names.
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
export const DEFAULT_SUB_GROUP = 'default:default';

/**
 * Cast a generic ID to a group ID.
 *
 * @param category - The category of the group.
 * @param id - The ID of the group.
 * @returns The group ID.
 */
function toAccountGroupId(
  category: AccountGroupCategory,
  id: string | undefined,
): AccountGroupId | undefined {
  return id ? `${category}:${id}` : undefined;
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

  #groupByEntropySource(account: InternalAccount): string | undefined {
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
    return account.metadata.keyring.type as string;
  }

  async updateAccountGroups(): Promise<void> {
    const rules = [
      // 1. We group by entropy-source
      {
        category: AccountGroupCategory.Entropy,
        rule: (account: InternalAccount) => this.#groupByEntropySource(account),
      },
      // 2. We group by Snap ID
      {
        category: AccountGroupCategory.Snap,
        rule: (account: InternalAccount) => this.#groupBySnapId(account),
      },
      // 3. We group by wallet type
      {
        category: AccountGroupCategory.Keyring,
        rule: (account: InternalAccount) => this.#groupByWalletType(account),
      },
    ];
    const groups: AccountGroupControllerState['accountGroups']['groups'] = {};

    for (const account of this.#listAccounts()) {
      for (const { category, rule } of rules) {
        const groupId = toAccountGroupId(category, rule(account) ?? undefined);

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

    const accountGroupsMetadata = this.#generateUniqueGroupNames(groups);

    this.update((state) => {
      state.accountGroups.groups = groups;
      state.accountGroupsMetadata = accountGroupsMetadata;
    });
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

  #generateUniqueGroupNames(
    groups: AccountGroupControllerState['accountGroups']['groups'],
  ): AccountGroupControllerState['accountGroupsMetadata'] {
    const newAccountGroupsMetadata: AccountGroupControllerState['accountGroupsMetadata'] =
      {};
    const baseNameMap = new Map<string, AccountGroupId[]>();

    // 1. Generate base names and collect groups sharing the same base name
    for (const groupIdString in groups) {
      if (Object.prototype.hasOwnProperty.call(groups, groupIdString)) {
        const groupId = groupIdString as AccountGroupId;
        let baseName: string;

        // We need to reliably get the category from the groupId
        const categoryPart = groupId.split(':')[0] as AccountGroupCategory;

        if (categoryPart === AccountGroupCategory.Entropy) {
          baseName = 'Wallet';
        } else {
          baseName = generateAccountGroupName(groupId);
        }

        if (!baseNameMap.has(baseName)) {
          baseNameMap.set(baseName, []);
        }
        const groupList = baseNameMap.get(baseName);
        if (groupList) {
          groupList.push(groupId);
        }
      }
    }

    // 2. Assign final names, adding sequential numbers for duplicates
    for (const [baseName, groupIdsWithSameBaseName] of baseNameMap.entries()) {
      if (groupIdsWithSameBaseName.length === 1) {
        newAccountGroupsMetadata[groupIdsWithSameBaseName[0]] = {
          name: baseName,
        };
      } else {
        groupIdsWithSameBaseName.sort((a, b) => a.localeCompare(b));

        let counter = 1;
        for (const groupId of groupIdsWithSameBaseName) {
          newAccountGroupsMetadata[groupId] = {
            name: `${baseName} ${counter}`,
          };
          counter += 1;
        }
      }
    }
    return newAccountGroupsMetadata;
  }
}
