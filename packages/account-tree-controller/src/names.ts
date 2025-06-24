import { KeyringTypes } from '@metamask/keyring-controller';

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
