import type {
  AccountWalletCategory,
  AccountWalletId,
} from '@metamask/account-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountTreeControllerMessenger } from 'src/AccountTreeController';

export type RuleMatch = {
  category: AccountWalletCategory;
  id: AccountWalletId;
  name: string;
};

export type Rule = {
  match(account: InternalAccount): RuleMatch | undefined;
};

export abstract class BaseRule implements Rule {
  protected readonly messenger: AccountTreeControllerMessenger;

  constructor(messenger: AccountTreeControllerMessenger) {
    this.messenger = messenger;
  }

  abstract match(account: InternalAccount): RuleMatch | undefined;
}
