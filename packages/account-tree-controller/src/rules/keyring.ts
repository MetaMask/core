import {
  AccountWalletCategory,
  toAccountGroupId,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type {
  AccountGroupObject,
  AccountWalletKeyringMetadata,
} from 'src/types';

import type { AccountWalletObject } from '..';
import type { AccountTreeRuleResult } from '../rule';
import { AccountTreeRule } from '../rule';

/**
 * Get wallet name from a keyring type.
 *
 * @param type - Keyring's type.
 * @returns Wallet name.
 */
export function getAccountWalletNameFromKeyringType(type: KeyringTypes) {
  switch (type) {
    case KeyringTypes.simple: {
      return 'Imported accounts';
    }
    case KeyringTypes.trezor: {
      return 'Trezor';
    }
    case KeyringTypes.oneKey: {
      return 'OneKey';
    }
    case KeyringTypes.ledger: {
      return 'Ledger';
    }
    case KeyringTypes.lattice: {
      return 'Lattice';
    }
    case KeyringTypes.qr: {
      return 'QR';
    }
    // Those keyrings should never really be used in such context since they
    // should be used by other grouping rules.
    case KeyringTypes.hd: {
      return 'HD Wallet';
    }
    case KeyringTypes.snap: {
      return 'Snap Wallet';
    }
    // ------------------------------------------------------------------------
    default: {
      return 'Unknown';
    }
  }
}

export class KeyringRule extends AccountTreeRule {
  readonly category = AccountWalletCategory.Keyring;

  match(account: InternalAccount): AccountTreeRuleResult | undefined {
    // We assume that `type` is really a `KeyringTypes`.
    const type = account.metadata.keyring.type as KeyringTypes;

    const wallet: AccountTreeRuleResult['wallet'] = {
      id: toAccountWalletId(this.category, type),
      metadata: {
        type: AccountWalletCategory.Keyring,
        keyring: {
          type,
        },
      },
    };

    const group: AccountTreeRuleResult['group'] = {
      id: toAccountGroupId(wallet.id, account.address),
    };

    // This rule cannot fail.
    return {
      wallet,
      group,
    };
  }

  getDefaultAccountWalletName(wallet: AccountWalletObject): string {
    // Precondition: We assume the AccountTreeController will always use
    // the proper wallet instance.
    const metadata = wallet.metadata as AccountWalletKeyringMetadata;

    return getAccountWalletNameFromKeyringType(metadata.keyring.type);
  }

  getDefaultAccountGroupName(group: AccountGroupObject): string {
    // Precondition: This account group should contain only 1 account.
    return this.getOnlyAccountFrom(group).metadata.name;
  }
}
