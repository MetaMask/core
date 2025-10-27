import { AccountGroupType, AccountWalletType } from '@metamask/account-api';
import { isEvmAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type { AccountGroupObjectOf } from '../group';
import { BaseRule, type Rule, type RuleResult } from '../rule';
import type { AccountWalletObjectOf } from '../wallet';

export class EntropyRule extends BaseRule {
  readonly walletType = AccountWalletType.Entropy;

  readonly groupType = AccountGroupType.MultichainAccount;

  getEntropySourceIndex(entropySource: string) {
    const { keyrings } = this.messenger.call('KeyringController:getState');

    return keyrings
      .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
      .findIndex((keyring) => keyring.metadata.id === entropySource);
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

  getDefaultAccountGroupPrefix(
    _wallet: AccountWalletObjectOf<AccountWalletType.Entropy>,
  ): string {
    return 'Account';
  }
}
