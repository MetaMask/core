import { type Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { SolScope } from '@metamask/keyring-api';
import {
  KeyringAccountEntropyTypeOption,
  SolAccountType,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';
import type { MultichainAccountServiceMessenger } from 'src/types';

import { assertAreBip44Accounts } from './BaseBip44AccountProvider';
import { SnapAccountProvider } from './SnapAccountProvider';

export class SolAccountProvider extends SnapAccountProvider {
  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  readonly #client: KeyringClient;

  constructor(messenger: MultichainAccountServiceMessenger) {
    super(SolAccountProvider.SOLANA_SNAP_ID, messenger);
    this.#client = this.#getKeyringClientFromSnapId(
      SolAccountProvider.SOLANA_SNAP_ID,
    );
  }

  getName(): string {
    return 'Solana';
  }

  #getKeyringClientFromSnapId(snapId: string): KeyringClient {
    return new KeyringClient({
      send: async (request: JsonRpcRequest) => {
        const response = await this.messenger.call(
          'SnapController:handleRequest',
          {
            snapId: snapId as SnapId,
            origin: 'metamask',
            handler: HandlerType.OnKeyringRequest,
            request,
          },
        );
        return response as Json;
      },
    });
  }

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === SolAccountType.DataAccount &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }

  override async createAccounts({
    entropySource,
    groupIndex,
    derivationPath = `m/44'/501'/${groupIndex}'/0'`,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
    derivationPath?: string;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    const createAccount = await this.getRestrictedSnapAccountCreator();

    // Create account without any confirmation nor selecting it.
    // TODO: Use the new keyring API `createAccounts` method with the "bip-44:derive-index"
    // type once ready.
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

    const accounts = [account];
    assertAreBip44Accounts(accounts);

    return accounts;
  }

  async discoverAndCreateAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    const discoveredAccounts = await this.#client.discoverAccounts(
      [SolScope.Mainnet],
      entropySource,
      groupIndex,
    );

    if (!discoveredAccounts.length) {
      return [];
    }

    const createdAccounts = await Promise.all(
      discoveredAccounts.map((d) =>
        this.createAccounts({
          entropySource,
          groupIndex,
          derivationPath: d.derivationPath,
        }),
      ),
    );

    return createdAccounts.flat();
  }
}
