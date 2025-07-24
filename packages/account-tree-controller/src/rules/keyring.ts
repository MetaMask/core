import {
  AccountWalletCategory,
  toAccountGroupId,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { AccountContext } from 'src/types';

import { Rule } from './rule';
import type { AccountTreeGroup, AccountTreeWallet } from '..';

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

export class KeyringRule extends Rule {
  readonly category = AccountWalletCategory.Keyring;

  match(account: InternalAccount): AccountContext | undefined {
    // We assume that `type` is really a `KeyringTypes`.
    const type = account.metadata.keyring.type as KeyringTypes;

    const walletId = toAccountWalletId(this.category, type);
    const groupId = toAccountGroupId(walletId, account.address);

    // This rule cannot fail.
    return {
      walletId,
      groupId,
    };
  }

  getDefaultAccountWalletName(wallet: AccountTreeWallet): string {
    // Precondition: This method is invoked only if there was a match for
    // this rule.
    const account = wallet.getAnyAccount();

    return getAccountWalletNameFromKeyringType(
      account.metadata.keyring.type as KeyringTypes,
    );
  }

  getDefaultAccountGroupName(group: AccountTreeGroup): string {
    // Precondition: This method is invoked only if there was a match for
    // this rule. Also, each of those account groups should contain
    // only 1 account.
    const account = group.getOnlyAccount();

    // We only have 1 account for this kind of rule.
    return account.metadata.name;
  }
}
