import type {
  AccountGroupType,
  AccountWalletType,
} from '@metamask/account-api';
import type {
  AccountGroupIdOf,
  AccountWalletIdOf,
} from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObject, AccountGroupObjectOf } from './group';
import type { AccountTreeControllerMessenger } from './types';
import type { AccountWalletObjectOf } from './wallet';

export type RuleResult<
  WalletType extends AccountWalletType,
  GroupType extends AccountGroupType,
> = {
  wallet: {
    type: WalletType;
    id: AccountWalletIdOf<WalletType>;
    // Omit `name` since it will get computed after the tree is built.
    metadata: Omit<AccountWalletObjectOf<WalletType>['metadata'], 'name'>;
  };
  group: {
    type: GroupType;
    id: AccountGroupIdOf<WalletType>;
    // Omit `name` since it will get computed after the tree is built.
    metadata: Omit<AccountGroupObjectOf<GroupType>['metadata'], 'name'>;
  };
};

export type Rule<
  WalletType extends AccountWalletType,
  GroupType extends AccountGroupType,
> = {
  /**
   * Account wallet type for this rule.
   */
  readonly walletType: WalletType;

  /**
   * Account group type for this rule.
   */
  readonly groupType: GroupType;

  /**
   * Applies the rule and check if the account matches.
   *
   * If the account matches, then the rule will return a {@link RuleResult} which means
   * this account needs to be grouped within a wallet associated with this rule.
   *
   * If a wallet already exists for this account (based on {@link RuleResult}) then
   * the account will be added to that wallet instance into its proper group (different for
   * every wallets).
   *
   * @param account - The account to match.
   * @returns A {@link RuleResult} if this account is part of that rule/wallet, returns
   * `undefined` otherwise.
   */
  match(
    account: InternalAccount,
  ): RuleResult<WalletType, GroupType> | undefined;

  /**
   * Gets default name for a wallet.
   *
   * @param wallet - Wallet associated to this rule.
   * @returns The default name for that wallet.
   */
  getDefaultAccountWalletName(
    wallet: AccountWalletObjectOf<WalletType>,
  ): string;

  /**
   * Gets computed name for a group based on its accounts.
   *
   * @param group - Group associated to this rule.
   * @returns The computed name based on existing accounts.
   */
  getComputedAccountGroupName(group: AccountGroupObjectOf<GroupType>): string;

  /**
   * Gets default name for a group based on its position in the wallet.
   *
   * @param group - Group associated to this rule.
   * @param index - The group's position within its wallet.
   * @returns The default name for that group.
   */
  getDefaultAccountGroupName(
    group: AccountGroupObjectOf<GroupType>,
    index: number,
  ): string;
};

export class BaseRule {
  protected readonly messenger: AccountTreeControllerMessenger;

  constructor(messenger: AccountTreeControllerMessenger) {
    this.messenger = messenger;
  }

  /**
   * Gets computed name for a group based on its accounts.
   *
   * @param group - Group associated to this rule.
   * @returns The computed name based on existing accounts.
   */
  getComputedAccountGroupName(group: AccountGroupObject): string {
    const account = this.messenger.call(
      'AccountsController:getAccount',
      // Type-wise, we are guaranteed to always have at least 1 account.
      group.accounts[0],
    );

    return account?.metadata.name ?? '';
  }

  /**
   * Gets default name for a group based on its position in the wallet.
   *
   * @param _group - Group associated to this rule.
   * @param index - The group's position within its wallet.
   * @returns The default name for that group.
   */
  getDefaultAccountGroupName(
    _group: AccountGroupObject,
    index?: number,
  ): string {
    return index === undefined ? '' : `Account ${index + 1}`;
  }
}
