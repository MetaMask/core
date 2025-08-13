import {
  AccountGroupType,
  AccountWalletType,
  isBip44Account,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { isEvmAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObjectOf } from '../group';
import { BaseRule, type Rule, type RuleResult } from '../rule';
import type { AccountWalletObjectOf } from '../wallet';

export class EntropyRule
  extends BaseRule
  implements Rule<AccountWalletType.Entropy, AccountGroupType.MultichainAccount>
{
  readonly walletType = AccountWalletType.Entropy;

  readonly groupType = AccountGroupType.MultichainAccount;

  getEntropySourceIndex(entropySource: string) {
    const { keyrings } = this.messenger.call('KeyringController:getState');

    return keyrings
      .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
      .findIndex((keyring) => keyring.metadata.id === entropySource);
  }

  match(
    account: InternalAccount,
  ):
    | RuleResult<AccountWalletType.Entropy, AccountGroupType.MultichainAccount>
    | undefined {
    if (!isBip44Account(account)) {
      return undefined;
    }

    const entropySource = account.options.entropy.id;
    const entropySourceIndex = this.getEntropySourceIndex(entropySource);
    if (entropySourceIndex === -1) {
      console.warn(
        `! Found an unknown entropy ID: "${entropySource}", account "${account.id}" won't be grouped by entropy.`,
      );
      return undefined;
    }

    const walletId = toMultichainAccountWalletId(entropySource);
    const groupId = toMultichainAccountGroupId(
      walletId,
      account.options.entropy.groupIndex,
    );

    return {
      wallet: {
        type: this.walletType,
        id: walletId,
        metadata: {
          entropy: {
            id: entropySource,
          },
        },
      },

      group: {
        type: this.groupType,
        id: groupId,
        metadata: {
          entropy: {
            groupIndex: account.options.entropy.groupIndex,
          },
          pinned: false,
          hidden: false,
        },
      },
    };
  }

  getDefaultAccountWalletName(
    wallet: AccountWalletObjectOf<AccountWalletType.Entropy>,
  ): string {
    // NOTE: We have checked during the rule matching, so we can safely assume it will
    // well-defined here.
    const entropySourceIndex = this.getEntropySourceIndex(
      wallet.metadata.entropy.id,
    );

    return `Wallet ${entropySourceIndex + 1}`; // Use human indexing (starts at 1).
  }

  getDefaultAccountGroupName(
    group: AccountGroupObjectOf<AccountGroupType.MultichainAccount>,
  ): string {
    let candidate = '';
    for (const id of group.accounts) {
      const account = this.messenger.call('AccountsController:getAccount', id);

      if (account) {
        candidate = account.metadata.name;

        // EVM account name has a highest priority.
        if (isEvmAccountType(account.type)) {
          return account.metadata.name;
        }
      }
    }

    return candidate;
  }
}
