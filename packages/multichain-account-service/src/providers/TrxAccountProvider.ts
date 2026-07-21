import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import { TrxAccountType, TrxScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { traceFallback } from '../analytics';
import type { MultichainAccountServiceMessenger } from '../types';
import { SnapAccountProvider } from './SnapAccountProvider';
import type { SnapAccountProviderConfig } from './SnapAccountProvider';

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
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: true,
  },
};

export class TrxAccountProvider extends SnapAccountProvider {
  static NAME = TRX_ACCOUNT_PROVIDER_NAME;

  static TRX_SNAP_ID = 'npm:@metamask/tron-wallet-snap' as SnapId;

  // TODO: Remove once the Snap is fully v2 — discovery is then driven by the
  // Snap's own supported scopes via `createAccounts({ bip44:discover })`.
  protected readonly v1DiscoveryScopes: CaipChainId[] = [TrxScope.Mainnet];

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
}
