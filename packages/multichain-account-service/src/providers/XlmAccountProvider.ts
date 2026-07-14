import type { Bip44Account } from '@metamask/account-api';
import type { TraceCallback } from '@metamask/controller-utils';
import { XlmAccountType, XlmScope } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';
import type { CaipChainId } from '@metamask/utils';

import { traceFallback } from '../analytics';
import type { MultichainAccountServiceMessenger } from '../types';
import { SnapAccountProvider } from './SnapAccountProvider';
import type { SnapAccountProviderConfig } from './SnapAccountProvider';

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
    timeoutMs: 10000,
  },
  resyncAccounts: {
    autoRemoveExtraSnapAccounts: true,
  },
};

export class XlmAccountProvider extends SnapAccountProvider {
  static NAME = XLM_ACCOUNT_PROVIDER_NAME;

  static XLM_SNAP_ID = 'npm:@metamask/stellar-wallet-snap' as SnapId;

  // TODO: Remove once the Snap is fully v2 — discovery is then driven by the
  // Snap's own supported scopes via `createAccounts({ bip44:discover })`.
  protected readonly v1DiscoveryScopes: CaipChainId[] = [XlmScope.Pubnet];

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
}
