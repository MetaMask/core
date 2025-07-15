import type { AccountWalletCategory } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountTreeControllerMessenger } from 'src/AccountTreeController';

import type { MutableAccountTreeWallet } from '../AccountTreeWallet';

/**
 * A rule match
 */
export type RuleMatch = {
  /** Account wallet category. */
  category: AccountWalletCategory;

  /** Unique ID that will be used to compute a unique account wallet ID. */
  id: string;
};

/**
 * A rule that can be used to group account in their proper account wallet/group.
 */
export type Rule = {
  /**
   * Try to see if the account matches this rule. If the account matches, then the
   * rule will return a {@link RuleMatch} which means this account needs to be
   * grouped within a wallet associated with this rule.
   *
   * If a wallet already exists for this account (based on {@link RuleMatch}) then
   * the account will be added to that wallet instance into its proper group
   * (different for every wallets).
   *
   * @param account - The account to match.
   * @returns A {@link RuleMatch} if this account is part of that rule/wallet, returns
   * `undefined` otherwise.
   */
  match(account: InternalAccount): RuleMatch | undefined;

  /**
   * Build a wallet for that rule based on a {@link RuleMatch}. If wallet already
   * exists for this same match. The previous wallet instance needs to be re-used.
   *
   * @param result - The result of a `match` call (if any).
   * @returns A new wallet instance for that rule based the `match` result.
   */
  build(result: RuleMatch): MutableAccountTreeWallet;
};

/**
 * Base abstract class for {@link Rule}.
 */
export abstract class BaseRule implements Rule {
  protected readonly messenger: AccountTreeControllerMessenger;

  constructor(messenger: AccountTreeControllerMessenger) {
    this.messenger = messenger;
  }

  abstract match(account: InternalAccount): RuleMatch | undefined;

  abstract build(result: RuleMatch): MutableAccountTreeWallet;
}
