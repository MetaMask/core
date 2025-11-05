import { assertIsBip44Account, type Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { BtcAccountType, BtcScope } from '@metamask/keyring-api';
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
import type { MultichainAccountServiceMessenger } from '../types';

export type BtcAccountProviderConfig = SnapAccountProviderConfig;

export const BTC_ACCOUNT_PROVIDER_NAME = 'Bitcoin' as const;

export class BtcAccountProvider extends SnapAccountProvider {
  static NAME = BTC_ACCOUNT_PROVIDER_NAME;

  static BTC_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap' as SnapId;

  readonly #client: KeyringClient;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: BtcAccountProviderConfig = {
      maxConcurrency: 3,
      createAccounts: {
        timeoutMs: 3000,
      },
      discovery: {
        timeoutMs: 2000,
        maxAttempts: 3,
        backOffMs: 1000,
      },
    },
  ) {
    super(BtcAccountProvider.BTC_SNAP_ID, messenger, config);
    this.#client = this.#getKeyringClientFromSnapId(
      BtcAccountProvider.BTC_SNAP_ID,
    );
  }

  getName(): string {
    return BtcAccountProvider.NAME;
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
      account.type === BtcAccountType.P2wpkh &&
      Object.values<string>(BtcAccountType).includes(account.type)
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
          addressType: BtcAccountType.P2wpkh,
          scope: BtcScope.Mainnet,
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
  }) {
    const discoveredAccounts = await withRetry(
      () =>
        withTimeout(
          this.#client.discoverAccounts(
            [BtcScope.Mainnet],
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

    if (!Array.isArray(discoveredAccounts) || discoveredAccounts.length === 0) {
      return [];
    }

    const createdAccounts = await this.createAccounts({
      entropySource,
      groupIndex,
    });

    return createdAccounts;
  }
}
