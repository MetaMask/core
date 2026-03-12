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
  KeyringAccountEntropyTypeOption,
  SolAccountType,
  SolScope,
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
    v2: false, // For now, the Snap is not fully v2 compliant.
    timeoutMs: 3000,
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

  #getDerivationpath(groupIndex: number): string {
    return `m/44'/501'/${groupIndex}'/0'`;
  }

  #toBip44Account({
    account,
    entropySource,
    groupIndex,
  }: {
    account: KeyringAccount;
    entropySource: EntropySourceId;
    groupIndex: number;
  }): Bip44Account<KeyringAccount> {
    // Ensure entropy is present before type assertion validation
    account.options.entropy = {
      type: KeyringAccountEntropyTypeOption.Mnemonic,
      id: entropySource,
      groupIndex,
      derivationPath: this.#getDerivationpath(groupIndex),
    };

    assertIsBip44Account(account);

    return account;
  }

  async #createAccounts(
    keyring: RestrictedSnapKeyring,
    options:
      | CreateAccountBip44DeriveIndexOptions
      | CreateAccountBip44DeriveIndexRangeOptions,
  ): Promise<Bip44Account<KeyringAccount>[]> {
    return this.withMaxConcurrency(async () => {
      let groupIndexOffset = 0;
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

          // Create accounts one by one (async flow + using Snap keyring events).
          for (
            let groupIndex = range.from;
            groupIndex <= range.to;
            groupIndex++
          ) {
            const snapAccount = await withTimeout(
              keyring.createAccount({
                entropySource,
                derivationPath: this.#getDerivationpath(groupIndex),
              }),
              this.config.createAccounts.timeoutMs,
            );

            snapAccounts.push(snapAccount);
          }
        }

        // Group indices are sequential, so we just need the starting index.
        groupIndexOffset = options.range.from;
      } else {
        if (v2) {
          // Create account using new v2-like flow (no async flow + no Snap keyring events).
          const [snapAccount] = await withTimeout(
            keyring.createAccounts(options),
            this.config.createAccounts.timeoutMs,
          );

          snapAccounts = [snapAccount];
        } else {
          const { groupIndex } = options;

          // Create account (async flow + using Snap keyring events).
          const snapAccount = await withTimeout(
            keyring.createAccount({
              entropySource,
              derivationPath: this.#getDerivationpath(groupIndex),
            }),
            this.config.createAccounts.timeoutMs,
          );

          snapAccounts = [snapAccount];
        }

        // For single account, there will only be 1 account, so we can use the
        // provided group index directly.
        groupIndexOffset = options.groupIndex;
      }

      // NOTE: We still need to convert accounts to proper BIP-44 accounts for now.
      return snapAccounts.map((snapAccount, index) => {
        const groupIndex = groupIndexOffset + index;
        const account = this.#toBip44Account({
          account: snapAccount,
          entropySource,
          groupIndex,
        });

        // Finally, we can add the account to the provider's account set.
        this.accounts.add(snapAccount.id);

        return account;
      });
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
