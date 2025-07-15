import type { AccountWalletCategory } from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountTreeControllerMessenger } from 'src/AccountTreeController';

import type { MutableAccountTreeWallet } from '../AccountTreeWallet';

export type RuleMatch = {
  category: AccountWalletCategory;
  id: string;
};

export type Rule = {
  match(account: InternalAccount): RuleMatch | undefined;

  build(result: RuleMatch): MutableAccountTreeWallet;
};

export abstract class BaseRule implements Rule {
  protected readonly messenger: AccountTreeControllerMessenger;

  constructor(messenger: AccountTreeControllerMessenger) {
    this.messenger = messenger;
  }

  abstract match(account: InternalAccount): RuleMatch | undefined;

  abstract build(result: RuleMatch): MutableAccountTreeWallet;
}
