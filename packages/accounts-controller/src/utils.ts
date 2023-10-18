import { type KeyringTypes, KeyringType } from '@metamask/keyring-controller';
import { sha256FromString } from 'ethereumjs-util';
import { v4 as uuid } from 'uuid';

/**
 * Returns the name of the keyring type.
 *
 * @param keyringType - The type of the keyring.
 * @returns The name of the keyring type.
 */
export function keyringTypeToName(keyringType: KeyringTypes) {
  switch (keyringType) {
    case KeyringType.simple: {
      return 'Account';
    }
    case KeyringType.hd: {
      return 'Account';
    }
    case KeyringType.trezor: {
      return 'Trezor';
    }
    case KeyringType.ledger: {
      return 'Ledger';
    }
    case KeyringType.lattice: {
      return 'Lattice';
    }
    case KeyringType.qr: {
      return 'QR';
    }
    case KeyringType.snap: {
      return 'Snap Account';
    }
    case KeyringType.custody: {
      return 'Custody';
    }
    default: {
      throw new Error(`Unknown keyring ${keyringType}`);
    }
  }
}

/**
 * Generates a UUID from a given Ethereum address.
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The generated UUID.
 */
export function getUUIDFromAddressOfNormalAccount(address: string): string {
  const v4options = {
    random: sha256FromString(address).slice(0, 16),
  };

  return uuid(v4options);
}
