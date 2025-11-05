import { assertIsBip44Account, type Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { TrxAccountType, TrxScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import {
  SnapAccountProvider,
  type SnapAccountProviderConfig,
} from './SnapAccountProvider';
import { withRetry, withTimeout } from './utils';
import { traceFallback } from '../analytics';
import { TraceName } from '../constants/traces';
import type { MultichainAccountServiceMessenger } from '../types';

export type TrxAccountProviderConfig = SnapAccountProviderConfig;

export const TRX_ACCOUNT_PROVIDER_NAME = 'Tron' as const;

export class TrxAccountProvider extends SnapAccountProvider {
  static NAME = TRX_ACCOUNT_PROVIDER_NAME;

  static TRX_SNAP_ID = 'npm:@metamask/tron-wallet-snap' as SnapId;

  readonly #client: KeyringClient;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: TrxAccountProviderConfig = {
      maxConcurrency: 3,
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
    super(TrxAccountProvider.TRX_SNAP_ID, messenger, config, trace);
    this.#client = this.#getKeyringClientFromSnapId(
      TrxAccountProvider.TRX_SNAP_ID,
    );
  }

  getName(): string {
    return TrxAccountProvider.NAME;
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
      account.type === TrxAccountType.Eoa &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }

  async createAccounts({
    entropySource,
    groupIndex: index,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withMaxConcurrency(async () => {
      const createAccount = await this.getRestrictedSnapAccountCreator();

      const account = await withTimeout(
        createAccount({
          entropySource,
          index,
          addressType: TrxAccountType.Eoa,
          scope: TrxScope.Mainnet,
        }),
        this.config.createAccounts.timeoutMs,
      );

      assertIsBip44Account(account);
      return [account];
    });
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
                [TrxScope.Mainnet],
                entropySource,
                groupIndex,
              ),
              this.config.discovery.timeoutMs,
            ),
          {
            maxAttempts: this.config.discovery.maxAttempts,
            backOffMs: this.config.discovery.backOffMs,
          },
        );

        if (!discoveredAccounts.length) {
          return [];
        }

        const createdAccounts = await this.createAccounts({
          entropySource,
          groupIndex,
        });

        return createdAccounts;
      },
    );
  }
}
