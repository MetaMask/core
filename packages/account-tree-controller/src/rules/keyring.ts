import { AccountGroupType } from '@metamask/account-api';
import { AccountWalletType } from '@metamask/account-api';
import { toAccountGroupId, toAccountWalletId } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountGroupObjectOf } from '../group';
import { BaseRule } from '../rule';
import type { Rule, RuleResult } from '../rule';
import type { AccountWalletObjectOf } from '../wallet';

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
    case KeyringTypes.mpc: {
      return 'MPC Wallet';
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
export function getAccountGroupPrefixFromKeyringType(type: KeyringTypes) {
  switch (type) {
    case KeyringTypes.simple: {
      return 'Imported Account';
    }
    case KeyringTypes.trezor: {
      return 'Trezor Account';
    }
    case KeyringTypes.oneKey: {
      return 'OneKey Account';
    }
    case KeyringTypes.ledger: {
      return 'Ledger Account';
    }
    case KeyringTypes.lattice: {
      return 'Lattice Account';
    }
    case KeyringTypes.qr: {
      return 'QR Account';
    }
    // Those keyrings should never really be used in such context since they
    // should be used by other grouping rules.
    case KeyringTypes.hd: {
      return 'Account';
    }
    case KeyringTypes.snap: {
      return 'Snap Account';
    }
    case KeyringTypes.mpc: {
      return 'MPC Account';
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

  #findKeyringIdForAccount(
    keyringType: string,
    address: string,
  ): string | undefined {
    const { keyrings } = this.messenger.call('KeyringController:getState');
    const matchingKeyrings = keyrings.filter((k) => k.type === keyringType);
    for (const keyring of matchingKeyrings) {
      if (
        keyring.accounts.some((a) => a.toLowerCase() === address.toLowerCase())
      ) {
        return keyring.metadata?.id;
      }
    }
    return undefined;
  }

  match(
    account: InternalAccount,
    // No `| undefined` return type for this rule, as it cannot fail.
  ): RuleResult<AccountWalletType.Keyring, AccountGroupType.SingleAccount> {
    // We assume that `type` is really a `KeyringTypes`.
    const keyringType = account.metadata.keyring.type as KeyringTypes;

    // For MPC keyrings, we store the keyring ID in metadata and create a separate wallet per keyring instance
    const keyringId =
      keyringType === KeyringTypes.mpc
        ? this.#findKeyringIdForAccount(keyringType, account.address)
        : undefined;

    const walletSubId = keyringId ? `${keyringType}/${keyringId}` : keyringType;
    const walletId = toAccountWalletId(this.walletType, walletSubId);
    const groupId = toAccountGroupId(walletId, account.address);

    return {
      wallet: {
        type: this.walletType,
        id: walletId,
        metadata: {
          keyring: {
            type: keyringType,
            ...(keyringId && { id: keyringId }),
          },
        },
      },

      group: {
        type: this.groupType,
        id: groupId,
        metadata: {
          pinned: false,
          hidden: false,
        },
      },
    };
  }

  getDefaultAccountWalletName(
    wallet: AccountWalletObjectOf<AccountWalletType.Keyring>,
  ): string {
    if (
      wallet.metadata.keyring.type === KeyringTypes.mpc &&
      wallet.metadata.keyring.id
    ) {
      const { keyrings } = this.messenger.call('KeyringController:getState');
      const mpcKeyrings = keyrings.filter((k) => k.type === KeyringTypes.mpc);
      const index = mpcKeyrings.findIndex(
        (k) => k.metadata?.id === wallet.metadata.keyring.id,
      );
      return `MPC Wallet ${index === -1 ? '' : index + 1}`.trim();
    }
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
