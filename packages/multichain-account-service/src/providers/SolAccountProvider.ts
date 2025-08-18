import { type Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import {
  KeyringAccountEntropyTypeOption,
  SolAccountType,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import type { MultichainAccountServiceMessenger } from 'src/types';

import { assertIsBip44Account } from './BaseAccountProvider';
import { SnapAccountProvider } from './SnapAccountProvider';

export class SolAccountProvider extends SnapAccountProvider {
  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  constructor(messenger: MultichainAccountServiceMessenger) {
    super(SolAccountProvider.SOLANA_SNAP_ID, messenger);
  }

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === SolAccountType.DataAccount &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    // Check if provider is disabled
    if (this.isDisabled) {
      console.log(
        `${this.constructor.name} is disabled - skipping account creation`,
      );
      return [];
    }
    return this.withCreateAccount(async (createAccount) => {
      // Create account without any confirmation nor selecting it.
      // TODO: Use the new keyring API `createAccounts` method with the "bip-44:derive-index"
      // type once ready.
      const derivationPath = `m/44'/501'/${groupIndex}'/0'`;
      const account = await createAccount({
        entropySource,
        derivationPath,
      });

      // Solana Snap does not use BIP-44 typed options for the moment
      // so we "inject" them (the `AccountsController` does a similar thing
      // for the moment).
      account.options.entropy = {
        type: KeyringAccountEntropyTypeOption.Mnemonic,
        id: entropySource,
        groupIndex,
        derivationPath,
      };

      assertIsBip44Account(account);

      return [account];
    });
  }

  async discoverAndCreateAccounts(_: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    return []; // TODO: Implement account discovery.
  }
}
