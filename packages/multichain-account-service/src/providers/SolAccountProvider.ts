import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { SolScope } from '@metamask/keyring-api';
import {
  KeyringAccountEntropyTypeOption,
  SolAccountType,
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
    timeoutMs: 3000,
  },
};

export class SolAccountProvider extends SnapAccountProvider {
  static NAME = SOL_ACCOUNT_PROVIDER_NAME;

  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

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

  async #createAccount({
    keyring,
    entropySource,
    groupIndex,
    derivationPath,
  }: {
    keyring: RestrictedSnapKeyring;
    entropySource: EntropySourceId;
    groupIndex: number;
    derivationPath: string;
  }): Promise<Bip44Account<KeyringAccount>> {
    const account = await withTimeout(
      keyring.createAccount({ entropySource, derivationPath }),
      this.config.createAccounts.timeoutMs,
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
    return this.withSnap(async ({ keyring }) => {
      return this.withMaxConcurrency(async () => {
        const derivationPath = `m/44'/501'/${groupIndex}'/0'`;
        const account = await this.#createAccount({
          keyring,
          entropySource,
          groupIndex,
          derivationPath,
        });

        this.accounts.add(account.id);
        return [account];
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

          const createdAccounts = await Promise.all(
            discoveredAccounts.map((d) =>
              this.#createAccount({
                keyring,
                entropySource,
                groupIndex,
                derivationPath: d.derivationPath,
              }),
            ),
          );

        for (const account of createdAccounts) {
          this.accounts.add(account.id);
        }

        return createdAccounts;
      },
    );
  }
}
