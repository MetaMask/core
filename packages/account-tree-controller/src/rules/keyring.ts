import { AccountGroupType } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import { toAccountGroupId, toAccountWalletId } from '@metamask/account-api';
import { KeyringType } from '@metamask/keyring-api/v2';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObjectOf } from '../group.js';
import { BaseRule } from '../rule.js';
import type { Rule, RuleResult } from '../rule.js';
import type { AccountWalletObjectOf } from '../wallet.js';

/**
 * Get wallet name from a keyring type.
 *
 * @param type - Keyring's type.
 * @returns Wallet name.
 */
export function getAccountWalletNameFromKeyringType(
  type: KeyringTypes | KeyringType,
): string {
  switch (type) {
    case KeyringType.PrivateKey:
    case KeyringTypes.simple: {
      return 'Imported accounts';
    }
    case KeyringType.Trezor:
    case KeyringTypes.trezor: {
      return 'Trezor';
    }
    case KeyringType.OneKey:
    case KeyringTypes.oneKey: {
      return 'OneKey';
    }
    case KeyringType.Ledger:
    case KeyringTypes.ledger: {
      return 'Ledger';
    }
    case KeyringType.Lattice:
    case KeyringTypes.lattice: {
      return 'Lattice';
    }
    case KeyringType.Qr:
    case KeyringTypes.qr: {
      return 'QR';
    }
    // Those keyrings should never really be used in such context since they
    // should be used by other grouping rules.
    case KeyringType.Hd:
    case KeyringTypes.hd: {
      return 'HD Wallet';
    }
    case KeyringType.Snap:
    case KeyringTypes.snap: {
      return 'Snap Wallet';
    }
    // ------------------------------------------------------------------------
    default: {
      return 'Unknown';
    }
  }
}

/**
 * Get group name prefix from a keyring type.
 *
 * @param type - Keyring's type.
 * @returns Wallet name.
 */
export function getAccountGroupPrefixFromKeyringType(
  type: KeyringTypes | KeyringType,
): string {
  switch (type) {
    case KeyringType.PrivateKey:
    case KeyringTypes.simple: {
      return 'Imported Account';
    }
    case KeyringType.Trezor:
    case KeyringTypes.trezor: {
      return 'Trezor Account';
    }
    case KeyringType.OneKey:
    case KeyringTypes.oneKey: {
      return 'OneKey Account';
    }
    case KeyringType.Ledger:
    case KeyringTypes.ledger: {
      return 'Ledger Account';
    }
    case KeyringType.Lattice:
    case KeyringTypes.lattice: {
      return 'Lattice Account';
    }
    case KeyringType.Qr:
    case KeyringTypes.qr: {
      return 'QR Account';
    }
    // Those keyrings should never really be used in such context since they
    // should be used by other grouping rules.
    case KeyringType.Hd:
    case KeyringTypes.hd: {
      return 'Account';
    }
    case KeyringType.Snap:
    case KeyringTypes.snap: {
      return 'Snap Account';
    }
    // ------------------------------------------------------------------------
    default: {
      return 'Unknown Account';
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
        metadata: {
          pinned: false,
          hidden: false,
          lastSelected: 0,
        },
      },
    };
  }

  getDefaultAccountWalletName(
    wallet: AccountWalletObjectOf<AccountWalletType.Keyring>,
  ): string {
    return getAccountWalletNameFromKeyringType(wallet.metadata.keyring.type);
  }

  getComputedAccountGroupName(
    group: AccountGroupObjectOf<AccountGroupType.SingleAccount>,
  ): string {
    return super.getComputedAccountGroupName(group);
  }

  getDefaultAccountGroupPrefix(
    wallet: AccountWalletObjectOf<AccountWalletType.Keyring>,
  ): string {
    return getAccountGroupPrefixFromKeyringType(wallet.metadata.keyring.type);
  }
}
