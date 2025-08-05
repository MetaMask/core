import type {
  AccountGroupType,
  MultichainAccountGroupId,
} from '@metamask/account-api';
import type { AccountGroup, AccountGroupId } from '@metamask/account-api';
import type { AccountId } from '@metamask/accounts-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  UpdatableField,
  ExtractRequiredFieldValues,
} from './type-utils.js';
import type { AccountTreeControllerMessenger } from './types';
import type { AccountTreeWallet } from './wallet';

/**
 * Persisted metadata for account groups (stored in controller state for persistence/sync).
 */
export type AccountGroupPersistedMetadata = {
  /** Custom name set by user, overrides default naming logic */
  name?: UpdatableField<string>;
  /** Whether this group is pinned in the UI */
  pinned?: UpdatableField<boolean>;
  /** Whether this group is hidden in the UI */
  hidden?: UpdatableField<boolean>;
};

/**
 * Tree metadata for account groups (required plain values extracted from persisted metadata).
 */
export type AccountTreeGroupMetadata =
  ExtractRequiredFieldValues<AccountGroupPersistedMetadata>;

export const DEFAULT_ACCOUNT_GROUP_NAME: string = 'Default';

/**
 * Type constraint for a {@link AccountGroupObject}. If one of its union-members
 * does not match this contraint, {@link AccountGroupObject} will resolve
 * to `never`.
 */
type IsAccountGroupObject<
  Type extends {
    type: AccountGroupType;
    id: AccountGroupId;
    accounts: AccountId[];
    metadata: AccountTreeGroupMetadata;
  },
> = Type;

/**
 * Multichain-account group object.
 */
export type AccountGroupMultichainAccountObject = {
  type: AccountGroupType.MultichainAccount;
  id: MultichainAccountGroupId;
  // Blockchain Accounts (at least 1 account per multichain-accounts):
  accounts: [AccountId, ...AccountId[]];
  metadata: AccountTreeGroupMetadata & {
    entropy: {
      groupIndex: number;
    };
  };
};

/**
 * Multichain-account group object.
 */
export type AccountGroupSingleAccountObject = {
  type: AccountGroupType.SingleAccount;
  id: AccountGroupId;
  // Blockchain Accounts (1 account per group):
  accounts: [AccountId];
  metadata: AccountTreeGroupMetadata;
};

/**
 * Account group object.
 */
export type AccountGroupObject = IsAccountGroupObject<
  AccountGroupMultichainAccountObject | AccountGroupSingleAccountObject
>;

export type AccountGroupObjectOf<GroupType extends AccountGroupType> = Extract<
  | {
      type: AccountGroupType.MultichainAccount;
      object: AccountGroupMultichainAccountObject;
    }
  | {
      type: AccountGroupType.SingleAccount;
      object: AccountGroupSingleAccountObject;
    },
  { type: GroupType }
>['object'];

/**
 * Account group coming from the {@link AccountTreeController}.
 */
export class AccountTreeGroup implements AccountGroup<InternalAccount> {
  readonly #messenger: AccountTreeControllerMessenger;

  readonly #group: AccountGroupObject;

  readonly #wallet: AccountTreeWallet;

  constructor({
    messenger,
    wallet,
    group,
  }: {
    messenger: AccountTreeControllerMessenger;
    wallet: AccountTreeWallet;
    group: AccountGroupObject;
  }) {
    this.#messenger = messenger;
    this.#group = group;
    this.#wallet = wallet;
  }

  get id(): AccountGroupId {
    return this.#group.id;
  }

  get wallet(): AccountTreeWallet {
    return this.#wallet;
  }

  get type(): AccountGroupType {
    return this.#group.type;
  }

  get name(): string {
    return this.#group.metadata.name;
  }

  getAccountIds(): [InternalAccount['id'], ...InternalAccount['id'][]] {
    return this.#group.accounts;
  }

  getAccount(id: string): InternalAccount | undefined {
    return this.#messenger.call('AccountsController:getAccount', id);
  }

  #getAccount(id: string): InternalAccount {
    const account = this.getAccount(id);

    if (!account) {
      throw new Error(`Unable to get account with ID: "${id}"`);
    }
    return account;
  }

  getAccounts(): InternalAccount[] {
    return this.#group.accounts.map((id) => this.#getAccount(id));
  }

  getOnlyAccount(): InternalAccount {
    const accountIds = this.getAccountIds();

    if (accountIds.length > 1) {
      throw new Error('Group contains more than 1 account');
    }

    // A group always have at least one account.
    return this.#getAccount(accountIds[0]);
  }
}
