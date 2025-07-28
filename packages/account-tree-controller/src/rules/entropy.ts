import {
  AccountWalletCategory,
  isBip44Account,
  toMultichainAccountId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { isEvmAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  AccountGroupObject,
  AccountWalletEntropyMetadata,
  AccountWalletObject,
} from '..';
import type { AccountTreeRuleResult } from '../rule';
import { AccountTreeRule } from '../rule';

export class EntropyRule extends AccountTreeRule {
  readonly category = AccountWalletCategory.Entropy;

  getEntropySourceIndex(entropySource: string) {
    const { keyrings } = this.messenger.call('KeyringController:getState');

    return keyrings
      .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
      .findIndex((keyring) => keyring.metadata.id === entropySource);
  }

  match(account: InternalAccount): AccountTreeRuleResult | undefined {
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

    const walletId = toMultichainAccountWalletId(account.options.entropy.id);
    const wallet: AccountTreeRuleResult['wallet'] = {
      id: walletId,
      metadata: {
        type: AccountWalletCategory.Entropy,
        entropy: {
          id: entropySource,
          // QUESTION: Should we re-compute the index everytime instead?
          index: entropySourceIndex,
        },
      },
    };

    const group: AccountTreeRuleResult['group'] = {
      id: toMultichainAccountId(walletId, account.options.entropy.groupIndex),
    };

    return {
      wallet,
      group,
    };
  }

  getDefaultAccountWalletName(wallet: AccountWalletObject): string {
    // Precondition: We assume the AccountTreeController will always use
    // the proper wallet instance.
    const options = wallet.metadata as AccountWalletEntropyMetadata;

    return `Wallet ${options.entropy.index + 1}`; // Use human indexing (starts at 1).
  }

  getDefaultAccountGroupName(group: AccountGroupObject): string {
    // EVM account name has a highest priority.
    const accounts = this.getAccountsFrom(group);
    const evmAccount = accounts.find((account) =>
      isEvmAccountType(account.type),
    );
    if (evmAccount) {
      return evmAccount.metadata.name;
    }

    // We should always have an account, since this function will be called only
    // if an account got a match.
    return accounts[0].metadata.name;
  }
}
