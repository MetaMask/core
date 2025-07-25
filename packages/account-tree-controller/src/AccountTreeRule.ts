import type { AccountWalletCategory } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountTreeGroup, AccountTreeWallet } from '.';
import type {
  AccountGroupObject,
  AccountTreeControllerMessenger,
  AccountWalletCategoryMetadata,
  AccountWalletObject,
} from './types';

export type AccountTreeRuleResult = {
  wallet: {
    id: AccountTreeWallet['id'];
    metadata: AccountWalletCategoryMetadata;
  };
  group: {
    id: AccountTreeGroup['id'];
  };
};

export abstract class AccountTreeRule {
  abstract readonly category: AccountWalletCategory;

  protected readonly messenger: AccountTreeControllerMessenger;

  constructor(messenger: AccountTreeControllerMessenger) {
    this.messenger = messenger;
  }

  /**
   * Applies the rule and check if the account matches.
   *
   * If the account matches, then the rule will return a {@link AccountTreeRuleResult} which means
   * this account needs to be grouped within a wallet associated with this rule.
   *
   * If a wallet already exists for this account (based on {@link AccountTreeRuleResult}) then
   * the account will be added to that wallet instance into its proper group (different for
   * every wallets).
   *
   * @param account - The account to match.
   * @returns A {@link AccountTreeRuleResult} if this account is part of that rule/wallet, returns
   * `undefined` otherwise.
   */
  abstract match(account: InternalAccount): AccountTreeRuleResult | undefined;

  /**
   * Gets default name for a wallet.
   *
   * @param wallet - Wallet associated to this rule.
   * @param context - Rule context.
   * @returns The default name for that wallet.
   */
  abstract getDefaultAccountWalletName(wallet: AccountWalletObject): string;

  /**
   * Gets default name for a group.
   *
   * @param group - Group associated to this rule.
   * @param context - Rule context.
   * @returns The default name for that group.
   */
  abstract getDefaultAccountGroupName(group: AccountGroupObject): string;

  #getAccount(id: string): InternalAccount {
    const account = this.messenger.call('AccountsController:getAccount', id);

    if (!account) {
      throw new Error(`Unable to get account with ID: "${id}"`);
    }
    return account;
  }

  getAccountsFrom(group: AccountGroupObject): InternalAccount[] {
    return group.accounts.map((id) => this.#getAccount(id));
  }

  getOnlyAccountFrom(group: AccountGroupObject): InternalAccount {
    const accountIds = group.accounts;

    if (accountIds.length === 0) {
      throw new Error('Group contains no account');
    }
    if (accountIds.length > 1) {
      throw new Error('Group contains more than 1 account');
    }

    return this.#getAccount(accountIds[0]);
  }
}
