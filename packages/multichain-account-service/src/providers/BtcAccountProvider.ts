import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type {
  CreateAccountBip44DeriveIndexOptions,
  CreateAccountBip44DeriveIndexRangeOptions,
  CreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
  KeyringCapabilities,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
  assertCreateAccountOptionIsSupported,
  BtcAccountType,
  BtcScope,
} from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import { SnapAccountProvider } from './SnapAccountProvider';
import type {
  RestrictedSnapKeyring,
  SnapAccountProviderConfig,
} from './SnapAccountProvider';
import { withRetry, withTimeout } from './utils';
import { traceFallback } from '../analytics';
import { TraceName } from '../constants/traces';
import type { MultichainAccountServiceMessenger } from '../types';

export type BtcAccountProviderConfig = SnapAccountProviderConfig;

export const BTC_ACCOUNT_PROVIDER_NAME = 'Bitcoin';

export const BTC_ACCOUNT_PROVIDER_DEFAULT_CONFIG: BtcAccountProviderConfig = {
  maxConcurrency: 3,
  createAccounts: {
    v2: false, // For now, the Snap is not fully v2 compliant.
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

  readonly capabilities: KeyringCapabilities = {
    scopes: [BtcScope.Mainnet, BtcScope.Testnet],
    bip44: {
      deriveIndex: true,
      deriveIndexRange: true,
    },
  };

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

  async #createAccounts(
    keyring: RestrictedSnapKeyring,
    options:
      | CreateAccountBip44DeriveIndexOptions
      | CreateAccountBip44DeriveIndexRangeOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withMaxConcurrency(async () => {
      let snapAccounts: KeyringAccount[] = [];

      const v2 = this.config.createAccounts.v2 ?? false;

      const { entropySource } = options;

      if (options.type === `${AccountCreationType.Bip44DeriveIndexRange}`) {
        if (v2) {
          // Batch account creations.
          snapAccounts = await withTimeout(
            keyring.createAccounts(options),
            this.config.createAccounts.timeoutMs,
          );
        } else {
          const { range } = options;

          // Create accounts one by one.
          for (
            let groupIndex = range.from;
            groupIndex <= range.to;
            groupIndex++
          ) {
            const snapAccount = await withTimeout(
              keyring.createAccount({
                entropySource,
                index: groupIndex,
                addressType: BtcAccountType.P2wpkh,
                scope: BtcScope.Mainnet,
              }),
              this.config.createAccounts.timeoutMs,
            );

            snapAccounts.push(snapAccount);
          }
        }
      } else if (v2) {
        // Create account using new v2-like flow (no async flow + no Snap keyring events).
        const [snapAccount] = await withTimeout(
          keyring.createAccounts(options),
          this.config.createAccounts.timeoutMs,
        );

        snapAccounts = [snapAccount];
      } else {
        const { groupIndex } = options;

        // Create account using the existing v1 flow.
        const snapAccount = await withTimeout(
          keyring.createAccount({
            entropySource,
            index: groupIndex,
            addressType: BtcAccountType.P2wpkh,
            scope: BtcScope.Mainnet,
          }),
          this.config.createAccounts.timeoutMs,
        );

        snapAccounts = [snapAccount];
      }

      const accounts: Bip44Account<KeyringAccount>[] = [];
      for (const snapAccount of snapAccounts) {
        assertIsBip44Account(snapAccount);
        this.accounts.add(snapAccount.id);
        accounts.push(snapAccount);
      }
      return accounts;
    });
  }

  async createAccounts(
    options: CreateAccountOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    assertCreateAccountOptionIsSupported(options, [
      `${AccountCreationType.Bip44DeriveIndex}`,
      `${AccountCreationType.Bip44DeriveIndexRange}`,
    ]);

    return this.withSnap(async ({ keyring }) => {
      return this.#createAccounts(keyring, options);
    });
  }

  async discoverAccounts({
    entropySource,
    groupIndex,
  }: {
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withSnap(async ({ client, keyring }) => {
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
                client.discoverAccounts(
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

          return await this.#createAccounts(keyring, {
            type: AccountCreationType.Bip44DeriveIndex,
            entropySource,
            groupIndex,
          });
        },
      );
    });
  }
}
