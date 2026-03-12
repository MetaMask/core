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
  TrxAccountType,
  TrxScope,
} from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
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

export type TrxAccountProviderConfig = SnapAccountProviderConfig;

export const TRX_ACCOUNT_PROVIDER_NAME = 'Tron';

export const TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG: TrxAccountProviderConfig = {
  maxConcurrency: 3,
  discovery: {
    enabled: true,
    timeoutMs: 2000,
    maxAttempts: 3,
    backOffMs: 1000,
  },
  createAccounts: {
    v2: false, // For now, the Snap is not fully v2 compliant.
    timeoutMs: 3000,
  },
};

export class TrxAccountProvider extends SnapAccountProvider {
  static NAME = TRX_ACCOUNT_PROVIDER_NAME;

  static TRX_SNAP_ID = 'npm:@metamask/tron-wallet-snap' as SnapId;

  readonly capabilities: KeyringCapabilities = {
    scopes: [TrxScope.Mainnet, TrxScope.Shasta],
    bip44: {
      deriveIndex: true,
      deriveIndexRange: true,
    },
  };

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: TrxAccountProviderConfig = TRX_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    trace: TraceCallback = traceFallback,
  ) {
    super(TrxAccountProvider.TRX_SNAP_ID, messenger, config, trace);
  }

  getName(): string {
    return TrxAccountProvider.NAME;
  }

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === TrxAccountType.Eoa &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
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
                addressType: TrxAccountType.Eoa,
                scope: TrxScope.Mainnet,
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
            addressType: TrxAccountType.Eoa,
            scope: TrxScope.Mainnet,
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
