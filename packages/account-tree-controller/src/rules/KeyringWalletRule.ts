import type { AccountWalletId } from '@metamask/account-api';
import {
  AccountWalletCategory,
  toAccountWalletId,
} from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { WalletRuleMatch } from './WalletRule';
import { BaseWalletRule } from './WalletRule';
import type { AccountTreeControllerMessenger } from '../AccountTreeController';
import { MutableAccountTreeWallet } from '../AccountTreeWallet';

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

class KeyringTypeWallet extends MutableAccountTreeWallet {
  readonly type: KeyringTypes;

  constructor(messenger: AccountTreeControllerMessenger, type: KeyringTypes) {
    super(messenger, AccountWalletCategory.Keyring, type);
    this.type = type;
  }

  static toAccountWalletId(type: KeyringTypes) {
    return toAccountWalletId(AccountWalletCategory.Keyring, type);
  }

  getDefaultName(): string {
    return getAccountWalletNameFromKeyringType(this.type);
  }
}

export class KeyringWalletRule extends BaseWalletRule {
  readonly #wallets: Map<AccountWalletId, KeyringTypeWallet>;

  constructor(messenger: AccountTreeControllerMessenger) {
    super(messenger);

    this.#wallets = new Map();
  }

  match(account: InternalAccount): WalletRuleMatch | undefined {
    const { type } = account.metadata.keyring;
    // We assume that `type` is really a `KeyringTypes`.
    const keyringType = type as KeyringTypes;

    // Check if a wallet already exists for that keyring type.
    let wallet = this.#wallets.get(
      KeyringTypeWallet.toAccountWalletId(keyringType),
    );
    if (!wallet) {
      wallet = new KeyringTypeWallet(this.messenger, keyringType);
    }

    // This will automatically creates the group if it's missing.
    const group = wallet.addAccount(account);

    return {
      wallet,
      group,
    };
  }
}
