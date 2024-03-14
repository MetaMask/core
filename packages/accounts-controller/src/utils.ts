import { toBuffer } from '@ethereumjs/util';
import { isCustodyKeyring, KeyringTypes } from '@metamask/keyring-controller';
import { sha256 } from 'ethereum-cryptography/sha256';
import { v4 as uuid } from 'uuid';

/**
 * Returns the name of the keyring type.
 *
 * @param keyringType - The type of the keyring.
 * @returns The name of the keyring type.
 */
export function keyringTypeToName(keyringType: string): string {
  // Custody keyrings are a special case, as they are not a single type
  // they just start with the prefix `Custody`
  if (isCustodyKeyring(keyringType)) {
    return 'Custody';
  }

  switch (keyringType) {
    case KeyringTypes.simple: {
      return 'Account';
    }
    case KeyringTypes.hd: {
      return 'Account';
    }
    case KeyringTypes.trezor: {
      return 'Trezor';
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
    case KeyringTypes.snap: {
      return 'Snap Account';
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
    random: sha256(toBuffer(address)).slice(0, 16),
  };

  return uuid(v4options);
}
