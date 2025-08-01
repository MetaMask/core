import { type Bip44Account } from '@metamask/account-api';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import type { EntropySourceId } from '@metamask/keyring-api';
import { SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import {
  assertIsBip44Account,
  BaseAccountProvider,
} from './BaseAccountProvider';

export class SolAccountProvider extends BaseAccountProvider {
  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === SolAccountType.DataAccount &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }

  async #createAccount(opts: {
    entropySource: EntropySourceId;
    derivationPath: `m/${string}`;
  }) {
    // NOTE: We're not supposed to make the keyring instance escape `withKeyring` but
    // we have to use the `SnapKeyring` instance to be able to create Solana account
    // without triggering UI confirmation.
    // Also, creating account that way won't invalidate the Snap keyring state. The
    // account will get created and persisted properly with the Snap account creation
    // flow "asynchronously" (with `notify:accountCreated`).
    const createAccount = await this.withKeyring<
      SnapKeyring,
      SnapKeyring['createAccount']
    >({ type: KeyringTypes.snap }, async ({ keyring }) =>
      keyring.createAccount.bind(keyring),
    );

    // Create account without any confirmation nor selecting it.
    const account = await createAccount(
      SolAccountProvider.SOLANA_SNAP_ID,
      opts,
      {
        displayAccountNameSuggestion: false,
        displayConfirmation: false,
        setSelectedAccount: false,
      },
    );

    assertIsBip44Account(account);

    return account;
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    // TODO: Use the new keyring API `createAccounts` method with the "bip-44:derive-index"
    // type once ready.
    const account = await this.#createAccount({
      entropySource,
      derivationPath: `m/44'/501'/${groupIndex}'/0'`,
    });

    return [account];
  }

  async discoverAndCreateAccounts(_: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    return []; // TODO: Implement account discovery.
  }
}
