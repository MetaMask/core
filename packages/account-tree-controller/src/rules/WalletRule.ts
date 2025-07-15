import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountTreeControllerMessenger } from 'src/AccountTreeController';

import type { AccountTreeGroup } from '../AccountTreeGroup';
import type { AccountTreeWallet } from '../AccountTreeWallet';

export type WalletRuleMatch = {
  wallet: AccountTreeWallet;
  group: AccountTreeGroup;
};

/**
 * A rule that can be used to group account in their proper account wallet/group.
 */
export type WalletRule = {
  /**
   * Try to see if the account matches this rule. If the account matches, then the
   * rule will return a {@link WalletRuleMatch} which means this account needs to be
   * grouped within a wallet associated with this rule.
   *
   * If a wallet already exists for this account (based on {@link WalletRuleMatch}) then
   * the account will be added to that wallet instance into its proper group
   * (different for every wallets).
   *
   * @param account - The account to match.
   * @returns A {@link WalletRuleMatch} if this account is part of that rule/wallet, returns
   * `undefined` otherwise.
   */
  match(account: InternalAccount): WalletRuleMatch | undefined;
};

/**
 * Base abstract class for {@link WalletRule}.
 */
export abstract class BaseWalletRule implements WalletRule {
  protected readonly messenger: AccountTreeControllerMessenger;

  constructor(messenger: AccountTreeControllerMessenger) {
    this.messenger = messenger;
  }

  abstract match(account: InternalAccount): WalletRuleMatch | undefined;
}
