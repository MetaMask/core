import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import {
  AccountCreationType,
  KeyringAccountEntropyTypeOption,
  SolAccountType,
  SolScope,
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

export type SolAccountProviderConfig = SnapAccountProviderConfig;

export const SOL_ACCOUNT_PROVIDER_NAME = 'Solana';

export const SOL_ACCOUNT_PROVIDER_DEFAULT_CONFIG: SnapAccountProviderConfig = {
  maxConcurrency: 3,
  discovery: {
    enabled: true,
    timeoutMs: 2000,
    maxAttempts: 3,
    backOffMs: 1000,
  },
  createAccounts: {
    batched: false, // For now, the Snap is not fully v2 compliant.
    timeoutMs: 3000,
  },
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: true,
  },
};

export class SolAccountProvider extends SnapAccountProvider {
  static NAME = SOL_ACCOUNT_PROVIDER_NAME;

  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  readonly capabilities: KeyringCapabilities = {
    scopes: [SolScope.Mainnet, SolScope.Devnet, SolScope.Testnet],
    bip44: {
      deriveIndex: true,
      deriveIndexRange: true,
    },
  };

  constructor(
    messenger: MultichainAccountServiceMessenger,
    config: SolAccountProviderConfig = SOL_ACCOUNT_PROVIDER_DEFAULT_CONFIG,
    trace: TraceCallback = traceFallback,
  ) {
    super(SolAccountProvider.SOLANA_SNAP_ID, messenger, config, trace);
  }

  getName(): string {
    return SolAccountProvider.NAME;
  }

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === SolAccountType.DataAccount &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }

  #getDerivationPath(groupIndex: number): string {
    return `m/44'/501'/${groupIndex}'/0'`;
  }

  protected override async createAccountV1(
    keyring: RestrictedSnapKeyring,
    {
      entropySource,
      groupIndex,
    }: { entropySource: EntropySourceId; groupIndex: number },
  ): Promise<KeyringAccount> {
    return keyring.createAccount({
      entropySource,
      derivationPath: this.#getDerivationPath(groupIndex),
    });
  }

  protected override toBip44Account(
    account: KeyringAccount,
    {
      entropySource,
      groupIndex,
    }: { entropySource: EntropySourceId; groupIndex: number },
  ): Bip44Account<KeyringAccount> {
    // Ensure entropy is present before type assertion validation
    account.options.entropy = {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: entropySource,
      groupIndex,
      derivationPath: this.#getDerivationPath(groupIndex),
    };

    assertIsBip44Account(account);

    return account;
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
                    [SolScope.Mainnet],
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

          // NOTE: We know the Solana Snap only return 1 account per group index during discovery. Also,
          // we do not use the returned `derivationPath` on purpose. Instead we just create the account
          // for this group index and that's all.
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
