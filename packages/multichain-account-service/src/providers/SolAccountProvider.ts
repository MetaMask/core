import { assertIsBip44Account, type Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
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

import { SnapAccountProvider } from './SnapAccountProvider';
import { withRetry, withTimeout } from './utils';
import { traceFallback } from '../analytics';
import { TraceName } from '../constants/traces';
import type { MultichainAccountServiceMessenger } from '../types';

export type SolAccountProviderConfig = {
  discovery: {
    maxAttempts: number;
    timeoutMs: number;
    backOffMs: number;
  };
  createAccounts: {
    timeoutMs: number;
  };
};

export const SOL_ACCOUNT_PROVIDER_NAME = 'Solana' as const;

export class SolAccountProvider extends SnapAccountProvider {
  static NAME = SOL_ACCOUNT_PROVIDER_NAME;

  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  readonly #client: KeyringClient;

  readonly #config: SolAccountProviderConfig;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: SolAccountProviderConfig = {
      discovery: {
        timeoutMs: 2000,
        maxAttempts: 3,
        backOffMs: 1000,
      },
      createAccounts: {
        timeoutMs: 3000,
      },
    },
    trace: TraceCallback = traceFallback,
  ) {
    super(SolAccountProvider.SOLANA_SNAP_ID, messenger, trace);
    this.#client = this.#getKeyringClientFromSnapId(
      SolAccountProvider.SOLANA_SNAP_ID,
    );
    this.#config = config;
  }

  getName(): string {
    return SolAccountProvider.NAME;
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

  async #createAccount({
    entropySource,
    groupIndex,
    derivationPath,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
    derivationPath: string;
  }): Promise<Bip44Account<KeyringAccount>> {
    const createAccount = await this.getRestrictedSnapAccountCreator();
    const account = await withTimeout(
      createAccount({ entropySource, derivationPath }),
      this.#config.createAccounts.timeoutMs,
    );

    // Ensure entropy is present before type assertion validation
    account.options.entropy = {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: entropySource,
      groupIndex,
      derivationPath,
    };

    assertIsBip44Account(account);
    return account;
  }

  async createAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    const derivationPath = `m/44'/501'/${groupIndex}'/0'`;
    const account = await this.#createAccount({
      entropySource,
      groupIndex,
      derivationPath,
    });

    return [account];
  }

  async discoverAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return await super.trace(
      {
        name: TraceName.SnapDiscoverAccounts,
        data: {
          provider: this.getName(),
        },
      },
      async () => {
        const discoveredAccounts = await withRetry(
          () =>
            withTimeout(
              this.#client.discoverAccounts(
                [SolScope.Mainnet],
                entropySource,
                groupIndex,
              ),
              this.#config.discovery.timeoutMs,
            ),
          {
            maxAttempts: this.#config.discovery.maxAttempts,
            backOffMs: this.#config.discovery.backOffMs,
          },
        );

        if (!discoveredAccounts.length) {
          return [];
        }

        const createdAccounts = await Promise.all(
          discoveredAccounts.map((d) =>
            this.#createAccount({
              entropySource,
              groupIndex,
              derivationPath: d.derivationPath,
            }),
          ),
        );

        return createdAccounts;
      },
    );
  }
}
