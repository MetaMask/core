import { assertIsBip44Account, type Bip44Account } from '@metamask/account-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { BtcAccountType, BtcScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { KeyringClient } from '@metamask/keyring-snap-client';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { SnapAccountProvider } from './SnapAccountProvider';
import { withRetry, withTimeout } from './utils';
import type { MultichainAccountServiceMessenger } from '../types';

export type BtcAccountProviderConfig = {
  discovery: {
    maxAttempts: number;
    timeoutMs: number;
    backOffMs: number;
  };
};

export const BTC_ACCOUNT_PROVIDER_NAME = 'Bitcoin' as const;

export class BtcAccountProvider extends SnapAccountProvider {
  static NAME = BTC_ACCOUNT_PROVIDER_NAME;

  static BTC_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap' as SnapId;

  readonly #client: KeyringClient;

  readonly #config: BtcAccountProviderConfig;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: BtcAccountProviderConfig = {
      discovery: {
        timeoutMs: 2000,
        maxAttempts: 3,
        backOffMs: 1000,
      },
    },
  ) {
    super(BtcAccountProvider.BTC_SNAP_ID, messenger);
    this.#client = this.#getKeyringClientFromSnapId(
      BtcAccountProvider.BTC_SNAP_ID,
    );
    this.#config = config;
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
      account.metadata.keyring.type === KeyringTypes.snap &&
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
    const createAccount = await this.getRestrictedSnapAccountCreator();

    const createBitcoinAccount = async (addressType: BtcAccountType) =>
      await createAccount({
        entropySource,
        index,
        addressType,
        scope: BtcScope.Mainnet,
      });

    const [p2wpkh, p2tr] = await Promise.all([
      createBitcoinAccount(BtcAccountType.P2wpkh),
      createBitcoinAccount(BtcAccountType.P2tr),
    ]);

    assertIsBip44Account(p2wpkh);
    assertIsBip44Account(p2tr);

    return [p2wpkh, p2tr];
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
          this.#config.discovery.timeoutMs,
        ),
      {
        maxAttempts: this.#config.discovery.maxAttempts,
        backOffMs: this.#config.discovery.backOffMs,
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
