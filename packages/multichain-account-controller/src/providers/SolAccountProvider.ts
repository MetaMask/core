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
import type {
  EthKeyring,
  InternalAccount,
} from '@metamask/keyring-internal-api';
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

// eslint-disable-next-line jsdoc/require-jsdoc
function assertInternalAccountExists(
  account: InternalAccount | undefined,
): asserts account is InternalAccount {
  if (!account) {
    throw new Error('Internal account does not exist');
  }
}

const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;
export class SolAccountProvider implements AccountProvider {
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

    // FIXME: This part of the flow is truly async, so when the `KeyringClient`
    // returns the `KeyringAccount`, its `InternalAccount` won't be "ready"
    // right away. For now we just re-create a fake `InternalAccount` and
    // we might have to rely solely on `account.id`.

    // Actually get the associated `InternalAccount`.
    // const account = this.#messenger.call(
    //  'AccountsController:getAccount',
    //  keyringAccount.id,
    // );

    const account: InternalAccount = {
      ...keyringAccount,
      metadata: {
        name: `Solana account -- ${keyringAccount.options.index}`,
        importTime: 0,
        keyring: {
          type: KeyringTypes.snap,
        },
      },
    };

    // We MUST have the associated internal account.
    assertInternalAccountExists(account);

    return account;
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }) {
    const account = await this.#createAccount({
      entropySource,
      derivationPath: `m/44'/501'/${groupIndex}'/0'`,
    });

    return [account];
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

  #getAccounts(): SolInternalAccount[] {
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

        return true;
      }) as SolInternalAccount[]; // Safe, we did check for options fields during filtering.
  }

  getAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): InternalAccount[] {
    return this.#getAccounts().filter((account) => {
      return (
        account.options.entropySource === entropySource &&
        account.options.index === groupIndex
      );
    });
  }

  getEntropySources(): EntropySourceId[] {
    const entropySources = new Set<EntropySourceId>();

    for (const account of this.#getAccounts()) {
      entropySources.add(account.options.entropySource);
    }

    return Array.from(entropySources);
  }
}
