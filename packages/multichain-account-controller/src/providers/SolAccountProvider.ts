import {
  SolAccountType,
  SolScope,
  type EntropySourceId,
} from '@metamask/keyring-api';
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

// eslint-disable-next-line jsdoc/require-jsdoc
function assertInternalAccountExists(
  account: InternalAccount | undefined,
): asserts account is InternalAccount {
  if (!account) {
    throw new Error('Internal account does not exist');
  }
}

export class SolAccountProvider implements AccountProvider {
  readonly #messenger: MultichainAccountControllerMessenger;
 
  readonly #client: KeyringClient;

  constructor(messenger: MultichainAccountControllerMessenger) {
    this.#messenger = messenger;

    // TODO: Change this once we introduce 1 Snap keyring per Snaps
    this.#client = this.#getKeyringClientFromSnapId(
      'npm:@metamask/solana-wallet-snap',
    );
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
    const keyringAccount = await this.#client.createAccount(opts);

    // Actually get the associated `InternalAccount`.
    const account = this.#messenger.call(
      'AccountsController:getAccount',
      keyringAccount.id,
    );

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
