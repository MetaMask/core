import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import { BtcAccountType, BtcScope } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { traceFallback } from '../analytics';
import type { MultichainAccountServiceMessenger } from '../types';
import { SnapAccountProvider } from './SnapAccountProvider';
import type { SnapAccountProviderConfig } from './SnapAccountProvider';

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
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: true,
  },
};

export class BtcAccountProvider extends SnapAccountProvider {
  static NAME = BTC_ACCOUNT_PROVIDER_NAME;

  static BTC_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap' as SnapId;

  // TODO: Remove once the Snap is fully v2 — discovery is then driven by the
  // Snap's own supported scopes via `createAccounts({ bip44:discover })`.
  protected readonly v1DiscoveryScopes: CaipChainId[] = [BtcScope.Mainnet];

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
}
