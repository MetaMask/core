import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import {
  SolAccountType,
  SolScope,
  type EntropySourceId,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { BaseAccountProvider } from './BaseAccountProvider';
import type { MultichainAccountControllerMessenger } from '../types';

export class SolAccountProvider extends BaseAccountProvider {
  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  readonly #client: KeyringClient;

  constructor(messenger: MultichainAccountControllerMessenger) {
    super(messenger);

    // TODO: Change this once we introduce 1 Snap keyring per Snaps.
    this.#client = this.#getKeyringClientFromSnapId(
      SolAccountProvider.SOLANA_SNAP_ID,
    );
  }

  isAccountCompatible(account: InternalAccount): boolean {
    return (
      account.type === SolAccountType.DataAccount &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
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
        return response as Promise<Json>;
      },
    });
  }

  async #createAccount(opts: {
    entropySource: EntropySourceId;
    derivationPath: `m/${string}`;
  }) {
    // NOTE: We're not supposed to make the keyring instance escape `withKeyring` but
    // we have to use the `SnapKeyring` instance to be able to create Solana account
    // without triggering UI confirmation.
    // Also, creating account that way won't invalidate the snap keyring state. The
    // account will get created and persisted properly with the Snap account creation
    // flow "asynchronously" (with `notify:accountCreated`).
    const createAccount = await this.withKeyring<
      SnapKeyring,
      SnapKeyring['createAccount']
    >({ type: KeyringTypes.snap }, async ({ keyring }) =>
      keyring.createAccount.bind(keyring),
    );

    // Create account without any confirmation nor selecting it.
    const keyringAccount = await createAccount(
      SolAccountProvider.SOLANA_SNAP_ID,
      opts,
      {
        displayAccountNameSuggestion: false,
        displayConfirmation: false,
        setSelectedAccount: false,
      },
    );

    return keyringAccount.id;
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    const id = await this.#createAccount({
      entropySource,
      derivationPath: `m/44'/501'/${groupIndex}'/0'`,
    });

    return [id];
  }

  async discoverAndCreateAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    const discoveredAccounts = await this.#client.discoverAccounts(
      [SolScope.Mainnet, SolScope.Testnet],
      entropySource,
      groupIndex,
    );

    return await Promise.all(
      discoveredAccounts.map(
        async ({ derivationPath }) =>
          await this.#createAccount({ entropySource, derivationPath }),
      ),
    );
  }
}
