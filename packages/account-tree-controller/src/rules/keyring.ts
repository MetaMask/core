import { AccountGroupType } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountWalletObjectOf } from 'src/wallet';

import { BaseRule, type Rule, type RuleResult } from '../rule';
import { toAccountGroupId, toAccountWalletId } from '../typing';

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

export class KeyringRule
  extends BaseRule
  implements Rule<AccountWalletType.Keyring, AccountGroupType.SingleAccount>
{
  readonly walletType = AccountWalletType.Keyring;

  readonly groupType = AccountGroupType.SingleAccount;

  match(
    account: InternalAccount,
    // No `| undefined` return type for this rule, as it cannot fail.
  ): RuleResult<AccountWalletType.Keyring, AccountGroupType.SingleAccount> {
    // We assume that `type` is really a `KeyringTypes`.
    const keyringType = account.metadata.keyring.type as KeyringTypes;

    const walletId = toAccountWalletId(this.walletType, keyringType);
    const groupId = toAccountGroupId(walletId, account.address);

    return {
      wallet: {
        type: this.walletType,
        id: walletId,
        metadata: {
          keyring: {
            type: keyringType,
          },
        },
      },

      group: {
        type: this.groupType,
        id: groupId,
        metadata: {},
      },
    };
  }

  getDefaultAccountWalletName(
    wallet: AccountWalletObjectOf<AccountWalletType.Keyring>,
  ): string {
    return getAccountWalletNameFromKeyringType(wallet.metadata.keyring.type);
  }
}
