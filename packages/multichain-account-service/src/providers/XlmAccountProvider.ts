import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import {
  AccountCreationType,
  XlmAccountType,
  XlmScope,
} from '@metamask/keyring-api';
import type { KeyringCapabilities } from '@metamask/keyring-api/v2';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import { traceFallback } from '../analytics';
import { TraceName } from '../analytics/traces';
import type { MultichainAccountServiceMessenger } from '../types';
import { SnapAccountProvider } from './SnapAccountProvider';
import type {
  RestrictedSnapKeyring,
  SnapAccountProviderConfig,
} from './SnapAccountProvider';
import { withRetry, withTimeout } from './utils';

export type XlmAccountProviderConfig = SnapAccountProviderConfig;

export const XLM_ACCOUNT_PROVIDER_NAME = 'Stellar';

export const XLM_ACCOUNT_PROVIDER_DEFAULT_CONFIG: XlmAccountProviderConfig = {
  maxConcurrency: 3,
  discovery: {
    enabled: true,
    timeoutMs: 2000,
    maxAttempts: 3,
    backOffMs: 1000,
  },
  createAccounts: {
    batched: true,
    timeoutMs: 10000,
  },
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: true,
  },
};

export class XlmAccountProvider extends SnapAccountProvider {
  static NAME = XLM_ACCOUNT_PROVIDER_NAME;

  static XLM_SNAP_ID = 'npm:@metamask/stellar-wallet-snap' as SnapId;

  readonly capabilities: KeyringCapabilities = {
    scopes: [XlmScope.Pubnet, XlmScope.Testnet],
    bip44: {
      deriveIndex: true,
      deriveIndexRange: true,
    },
  };

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: XlmAccountProviderConfig = XLM_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    trace: TraceCallback = traceFallback,
  ) {
    super(XlmAccountProvider.XLM_SNAP_ID, messenger, config, trace);
  }

  getName(): string {
    return XlmAccountProvider.NAME;
  }

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === XlmAccountType.Account &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }

  protected override createAccountV1(
    keyring: RestrictedSnapKeyring,
    {
      entropySource,
      groupIndex,
    }: { entropySource: EntropySourceId; groupIndex: number },
  ): Promise<KeyringAccount> {
    return keyring.createAccount({
      entropySource,
      index: groupIndex,
      addressType: XlmAccountType.Account,
      scope: XlmScope.Pubnet,
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
                () =>
                  client.discoverAccounts(
                    [XlmScope.Pubnet],
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

          return await this.createBip44Accounts(keyring, {
            type: AccountCreationType.Bip44DeriveIndex,
            entropySource,
            groupIndex,
          });
        },
      );
    });
  }
}
