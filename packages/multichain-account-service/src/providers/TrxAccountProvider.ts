import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type {
  CreateAccountOptions,
  EntropySourceId,
  KeyringAccount,
  KeyringCapabilities,
} from '@metamask/keyring-api';
import {
  AccountCreationType,
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

  async #createAccounts({
    keyring,
    entropySource,
    groupIndex: index,
  }: {
    keyring: RestrictedSnapKeyring;
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withMaxConcurrency(async () => {
      const account = await withTimeout(
        keyring.createAccount({
          entropySource,
          index,
          addressType: TrxAccountType.Eoa,
          scope: TrxScope.Mainnet,
        }),
        this.config.createAccounts.timeoutMs,
      );

      assertIsBip44Account(account);
      this.accounts.add(account.id);
      return [account];
    });
  }

  async createAccounts(
    options: CreateAccountOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    if (options.type !== AccountCreationType.Bip44DeriveIndex) {
      throw new Error(
        `Unsupported account creation type: "${options.type}". Only "bip44:derive-index" is supported.`,
      );
    }

    const { entropySource, groupIndex } = options;

    return this.withSnap(async ({ keyring }) => {
      return this.#createAccounts({
        keyring,
        entropySource,
        groupIndex,
      });
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

          const createdAccounts = await this.#createAccounts({
            keyring,
            entropySource,
            groupIndex,
          });

          return createdAccounts;
        },
      );
    });
  }
}
