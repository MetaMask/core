import type { Bip44Account } from '@metamask/account-api';
import {
  AccountWalletCategory,
  isBip44Account,
  toMultichainAccountId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { isEvmAccountType, type EntropySourceId } from '@metamask/keyring-api';
import type { KeyringControllerState } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import { Rule } from './rule';
import type { AccountTreeGroup, AccountTreeWallet } from '..';
import type { AccountTreeControllerMessenger } from '../AccountTreeController';
import type { AccountContext } from '../types';

/**
 * Select keyrings from keyring controller state.
 *
 * @param state - The keyring controller state.
 * @returns The keyrings.
 */
function selectKeyringControllerKeyrings(state: KeyringControllerState) {
  return state.keyrings;
}

export class EntropyRule extends Rule {
  readonly category = AccountWalletCategory.Entropy;

  readonly #entropySourcesToIndex: Map<EntropySourceId, number>;

  constructor(messenger: AccountTreeControllerMessenger) {
    super(messenger);

    this.#entropySourcesToIndex = new Map();
    this.#syncEntropySources();
  }

  #syncEntropySources() {
    this.#entropySourcesToIndex.clear();

    const state = this.messenger.call('KeyringController:getState');
    state.keyrings.forEach((keyring, index) =>
      this.#entropySourcesToIndex.set(keyring.metadata.id, index),
    );

    this.messenger.subscribe(
      'KeyringController:stateChange',
      (keyrings) => {
        keyrings.forEach((keyring, index) =>
          this.#entropySourcesToIndex.set(keyring.metadata.id, index),
        );
      },
      selectKeyringControllerKeyrings,
    );
  }

  match(account: InternalAccount): AccountContext | undefined {
    if (!isBip44Account(account)) {
      return undefined;
    }

    const entropySource = account.options.entropy.id;
    const entropySourceIndex = this.#entropySourcesToIndex.get(entropySource);
    if (entropySourceIndex === undefined) {
      console.warn(
        `! Found an unknown entropy ID: "${entropySource}", account "${account.id}" won't be grouped by entropy.`,
      );
      return undefined;
    }

    const walletId = toMultichainAccountWalletId(account.options.entropy.id);
    const groupId = toMultichainAccountId(
      walletId,
      account.options.entropy.groupIndex,
    );

    return {
      walletId,
      groupId,
    };
  }

  getDefaultAccountWalletName(wallet: AccountTreeWallet): string {
    // Precondition: This method is invoked only if there was a match for
    // a BIP-44 account, so we can type-cast here.
    const account = wallet.getAnyAccount() as Bip44Account<InternalAccount>;

    const entropySource = account.options.entropy.id;
    const entropySourceIndex = this.#entropySourcesToIndex.get(
      entropySource,
    ) as number; // This has to be defined, we checked it during the `match` above.

    return `Wallet ${entropySourceIndex + 1}`; // Use human indexing (starts at 1).
  }

  getDefaultAccountGroupName(group: AccountTreeGroup): string {
    // EVM account name has a highest priority.
    const accounts = group.getAccounts();
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
