import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { BtcAccountType, BtcScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import { SnapAccountProvider } from './SnapAccountProvider';
import type { SnapAccountProviderConfig } from './SnapAccountProvider';
import { withRetry, withTimeout } from './utils';
import { traceFallback } from '../analytics';
import { TraceName } from '../constants/traces';
import type { MultichainAccountServiceMessenger } from '../types';

export type BtcAccountProviderConfig = SnapAccountProviderConfig;

export const BTC_ACCOUNT_PROVIDER_NAME = 'Bitcoin';

export const BTC_ACCOUNT_PROVIDER_DEFAULT_CONFIG: BtcAccountProviderConfig = {
  maxConcurrency: 3,
  createAccounts: {
    timeoutMs: 3000,
  },
  discovery: {
    enabled: true,
    timeoutMs: 2000,
    maxAttempts: 3,
    backOffMs: 1000,
  },
};

export class BtcAccountProvider extends SnapAccountProvider {
  static NAME = BTC_ACCOUNT_PROVIDER_NAME;

  static BTC_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap' as SnapId;

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: BtcAccountProviderConfig = BTC_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    trace: TraceCallback = traceFallback,
  ) {
    super(BtcAccountProvider.BTC_SNAP_ID, messenger, config, trace);
  }

  getName(): string {
    return BtcAccountProvider.NAME;
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
      this.accounts.add(account.id);
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
        if (!this.config.discovery.enabled) {
          return [];
        }

        const discoveredAccounts = await withRetry(
          () =>
            withTimeout(
              this.client.discoverAccounts(
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

        if (
          !Array.isArray(discoveredAccounts) ||
          discoveredAccounts.length === 0
        ) {
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
