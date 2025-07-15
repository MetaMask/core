import { AccountWalletCategory } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { RuleMatch } from './Rule';
import { BaseRule } from './Rule';
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

  getDefaultName(): string {
    return getAccountWalletNameFromKeyringType(this.type);
  }
}

export class KeyringTypeRule extends BaseRule {
  match(account: InternalAccount): RuleMatch | undefined {
    const { type } = account.metadata.keyring;

    return {
      category: AccountWalletCategory.Keyring,
      id: type,
    };
  }

  build({ id: type }: RuleMatch) {
    // We assume that `type` is really a `KeyringTypes`.
    return new KeyringTypeWallet(this.messenger, type as KeyringTypes);
  }
}
