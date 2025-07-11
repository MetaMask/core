import {
  AccountWalletCategory,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { RuleMatch } from './Rule';
import { BaseRule } from './Rule';
import { hasKeyringType } from './utils';

export class EntropySourceRule extends BaseRule {
  match(account: InternalAccount): RuleMatch | undefined {
    let entropySource: string | undefined;

    if (hasKeyringType(account, KeyringTypes.hd)) {
      // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
      if (!account.options.entropySource) {
        console.warn(
          "! Found an HD account with no entropy source: account won't be associated to its wallet",
        );
        return undefined;
      }

      entropySource = account.options.entropySource as string;
    }

    // TODO: For now, we're not checking if the Snap is a preinstalled one, and we probably should...
    if (
      hasKeyringType(account, KeyringTypes.snap) &&
      account.metadata.snap?.enabled
    ) {
      // Not all Snaps have an entropy-source and options are not typed yet, so we have to check manually here.
      if (account.options.entropySource) {
        // We blindly trust the `entropySource` for now, but it could be wrong since it comes from a Snap.
        entropySource = account.options.entropySource as string;
      }
    }

    if (!entropySource) {
      return undefined;
    }

    // We check if we can get the name for that entropy source, if not this means this entropy does not match
    // any HD keyrings, thus, is invalid (this account will be grouped by another rule).
    const entropySourceName = this.#getEntropySourceName(entropySource);
    if (!entropySourceName) {
      console.warn(
        '! Tried to name a wallet using an unknown entropy, this should not be possible.',
      );
      return undefined;
    }

    return {
      category: AccountWalletCategory.Entropy,
      id: toAccountWalletId(AccountWalletCategory.Entropy, entropySource),
      name: entropySourceName,
    };
  }

  #getEntropySourceName(entropySource: string): string | undefined {
    const { keyrings } = this.messenger.call('KeyringController:getState');

    const index = keyrings
      .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
      .findIndex((keyring) => keyring.metadata.id === entropySource);

    if (index === -1) {
      return undefined;
    }

    return `Wallet ${index + 1}`; // Use human indexing.
  }
}
