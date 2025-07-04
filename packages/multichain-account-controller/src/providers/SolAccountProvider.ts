import type { AccountId } from '@metamask/accounts-controller';
import type { SnapKeyring } from '@metamask/eth-snap-keyring';
import {
  SolAccountType,
  SolScope,
  type EntropySourceId,
} from '@metamask/keyring-api';
import type {
  KeyringMetadata,
  KeyringSelector,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { AccountProvider } from '@metamask/multichain-account-api';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import type { MultichainAccountControllerMessenger } from '../types';

type SolInternalAccount = InternalAccount & {
  options: {
    index: number;
    entropySource: EntropySourceId;
  };
};

const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

export class SolAccountProvider implements AccountProvider<InternalAccount> {
  readonly #messenger: MultichainAccountControllerMessenger;

  readonly #client: KeyringClient;

  constructor(messenger: MultichainAccountControllerMessenger) {
    this.#messenger = messenger;

    // TODO: Change this once we introduce 1 Snap keyring per Snaps.
    this.#client = this.#getKeyringClientFromSnapId(SOLANA_SNAP_ID);
  }

  async #withKeyring<SelectedKeyring, CallbackResult = void>(
    selector: KeyringSelector,
    operation: ({
      keyring,
      metadata,
    }: {
      keyring: SelectedKeyring;
      metadata: KeyringMetadata;
    }) => Promise<CallbackResult>,
  ): Promise<CallbackResult> {
    const result = await this.#messenger.call(
      'KeyringController:withKeyring',
      selector,
      ({ keyring, metadata }) =>
        operation({
          keyring: keyring as SelectedKeyring,
          metadata,
        }),
    );

    return result as CallbackResult;
  }

  #getKeyringClientFromSnapId(snapId: string): KeyringClient {
    return new KeyringClient({
      send: async (request: JsonRpcRequest) => {
        const response = await this.#messenger.call(
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
    const createAccount = await this.#withKeyring<
      SnapKeyring,
      SnapKeyring['createAccount']
    >({ type: KeyringTypes.snap }, async ({ keyring }) =>
      keyring.createAccount.bind(keyring),
    );

    const keyringAccount = await createAccount(SOLANA_SNAP_ID, opts, {
      displayAccountNameSuggestion: false,
      displayConfirmation: false,
      setSelectedAccount: false,
    });

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

  #getAccounts(
    filter: (account: InternalAccount) => boolean = () => true,
  ): SolInternalAccount[] {
    return this.#messenger
      .call('AccountsController:listMultichainAccounts')
      .filter((account) => {
        // We only check for EOA accounts for multichain accounts.
        if (
          account.type !== SolAccountType.DataAccount ||
          account.metadata.keyring.type !== (KeyringTypes.snap as string)
        ) {
          return false;
        }

        // TODO: Maybe use superstruct to validate the structure of HD account since they are not strongly-typed for now?
        if (!account.options.entropySource) {
          console.warn(
            "! Found a Solana account with no entropy source: account won't be associated to its wallet.",
          );
          return false;
        }

        // TODO: We need to add this index for native accounts too!
        if (account.options.index === undefined) {
          console.warn(
            "! Found a Solana account with no index: account won't be associated to its wallet.",
          );
          return false;
        }

        return filter(account);
      }) as SolInternalAccount[]; // Safe, we did check for options fields during filtering.
  }

  getAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): AccountId[] {
    return this.#getAccounts()
      .filter((account) => {
        return (
          account.options.entropySource === entropySource &&
          account.options.index === groupIndex
        );
      })
      .map((account) => account.id);
  }

  getAccount(id: AccountId): InternalAccount {
    // TODO: Maybe just use a proper find for faster lookup?
    const [found] = this.#getAccounts((account) => account.id === id);

    if (!found) {
      throw new Error(`Unable to find Solana account: ${id}`);
    }

    return found;
  }
}
