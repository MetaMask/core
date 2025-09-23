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

import type { AccountTypeKey } from '../group';
import { AccountTypeOrder, type AccountGroupObjectOf } from '../group';
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
          accountOrder: [
            [AccountTypeOrder[account.type as AccountTypeKey], account.id],
          ],
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

  getComputedAccountGroupName(
    group: AccountGroupObjectOf<AccountGroupType.MultichainAccount>,
  ): string {
    // Only use EVM account names for multichain groups to avoid chain-specific names becoming group names.
    // Non-EVM account names should not be used as group names since groups represent multichain collections.
    for (const id of group.accounts) {
      const account = this.messenger.call('AccountsController:getAccount', id);

      if (account && isEvmAccountType(account.type)) {
        return account.metadata.name;
      }
    }

    return '';
  }

  getDefaultAccountGroupName(index: number): string {
    return `Account ${index + 1}`;
  }
}
