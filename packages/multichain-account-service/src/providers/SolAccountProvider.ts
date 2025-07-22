import type { Bip44Account } from '@metamask/account-api';
import { SolAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { SnapId } from '@metamask/snaps-sdk';

import { BaseAccountProvider } from './BaseAccountProvider';

export class SolAccountProvider extends BaseAccountProvider {
  static SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap' as SnapId;

  isAccountCompatible(account: Bip44Account<InternalAccount>): boolean {
    return (
      account.type === SolAccountType.DataAccount &&
      account.metadata.keyring.type === (KeyringTypes.snap as string)
    );
  }
}
