import { assertIsBip44Account } from '@metamask/account-api';
import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import {
  KeyringAccountEntropyTypeOption,
  SolAccountType,
  SolScope,
} from '@metamask/keyring-api';
import type { EntropySourceId, KeyringAccount } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { traceFallback } from '../analytics/index.js';
import type { MultichainAccountServiceMessenger } from '../types.js';
import { SnapAccountProvider } from './SnapAccountProvider.js';
import type { SnapAccountProviderConfig } from './SnapAccountProvider.js';

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
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: true,
  },
};

export class SolAccountProvider extends SnapAccountProvider {
  static NAME = SOL_ACCOUNT_PROVIDER_NAME;

  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  // TODO: Remove once the Snap is fully v2 — discovery is then driven by the
  // Snap's own supported scopes via `createAccounts({ bip44:discover })`.
  protected readonly v1DiscoveryScopes: CaipChainId[] = [SolScope.Mainnet];

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
}
