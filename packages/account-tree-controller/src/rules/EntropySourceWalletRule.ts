import type { AccountWalletId } from '@metamask/account-api';
import {
  AccountWalletCategory,
  toAccountWalletId,
} from '@metamask/account-api';
import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { hasKeyringType } from './utils';
import type { WalletRuleMatch } from './WalletRule';
import { BaseWalletRule } from './WalletRule';
import type { AccountTreeControllerMessenger } from '../AccountTreeController';
import { MutableAccountTreeWallet } from '../AccountTreeWallet';

export class EntropySourceWallet extends MutableAccountTreeWallet {
  readonly entropySource: string;

  constructor(
    messenger: AccountTreeControllerMessenger,
    entropySource: string,
  ) {
    super(messenger, AccountWalletCategory.Entropy, entropySource);
    this.entropySource = entropySource;
  }

  static toAccountWalletId(entropySource: string) {
    return toAccountWalletId(AccountWalletCategory.Entropy, entropySource);
  }

  static getEntropySourceIndex(
    keyrings: KeyringObject[],
    entropySource: string,
  ) {
    return keyrings
      .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
      .findIndex((keyring) => keyring.metadata.id === entropySource);
  }

  getDefaultName(): string {
    const { keyrings } = this.messenger.call('KeyringController:getState');

    const index = EntropySourceWallet.getEntropySourceIndex(
      keyrings,
      this.entropySource,
    );
    if (index === -1) {
      // NOTE: This should never really fail, as we checked for this precondition
      // during rule matching.
      throw new Error('Unable to get index for entropy source');
    }

    return `Wallet ${index + 1}`; // Use human indexing.
  }
}

export class EntropySourceWalletRule extends BaseWalletRule {
  readonly #wallets: Map<AccountWalletId, EntropySourceWallet>;

  constructor(messenger: AccountTreeControllerMessenger) {
    super(messenger);

    this.#wallets = new Map();
  }

  match(account: InternalAccount): WalletRuleMatch | undefined {
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

    // NOTE: We make this check now, so that we are guaranteed that `getDefaultName` will never fail if we
    // pass that point:
    // ------------------------------------------------------------------------------------------------------
    // We check if we can get the name for that entropy source, if not this means this entropy does not match
    // any HD keyrings, thus, is invalid (this account will be grouped by another rule).
    const { keyrings } = this.messenger.call('KeyringController:getState');
    if (
      EntropySourceWallet.getEntropySourceIndex(keyrings, entropySource) === -1
    ) {
      console.warn(
        '! Tried to name a wallet using an unknown entropy, this should not be possible.',
      );
      return undefined;
    }

    // Check if a wallet already exists for that entropy source.
    let wallet = this.#wallets.get(
      EntropySourceWallet.toAccountWalletId(entropySource),
    );
    if (!wallet) {
      wallet = new EntropySourceWallet(this.messenger, entropySource);
      this.#wallets.set(wallet.id, wallet);
    }

    // This will automatically creates the group if it's missing.
    const group = wallet.addAccount(account);

    return {
      wallet,
      group,
    };
  }
}
