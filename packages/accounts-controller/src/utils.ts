import type { KeyringObject } from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import { hexToBytes } from '@metamask/utils';
import { sha256 } from 'ethereum-cryptography/sha256';
import type { V4Options } from 'uuid';
import { v4 as uuid } from 'uuid';

/**
 * Returns the name of the keyring type.
 *
 * @param keyringType - The type of the keyring.
 * @returns The name of the keyring type.
 */
export function keyringTypeToName(keyringType: string): string {
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
    case KeyringTypes.snap: {
      return 'Snap Account';
    }
    default: {
      throw new Error(`Unknown keyring ${keyringType}`);
    }
  }
}

/**
 * Generates a UUID v4 options from a given Ethereum address.
 *
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The UUID v4 options.
 */
export function getUUIDOptionsFromAddressOfNormalAccount(
  address: string,
): V4Options {
  const v4options = {
    random: sha256(hexToBytes(address)).slice(0, 16),
  };

  return v4options;
}

/**
 * Generates a UUID from a given Ethereum address.
 *
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The generated UUID.
 */
export function getUUIDFromAddressOfNormalAccount(address: string): string {
  return uuid(getUUIDOptionsFromAddressOfNormalAccount(address));
}

/**
 * Check if a keyring type is a Snap keyring.
 *
 * @param keyringType - The account's keyring type.
 * @returns True if the keyring type is considered a Snap keyring, false otherwise.
 */
export function isSnapKeyringType(keyringType: KeyringTypes | string): boolean {
  return keyringType === (KeyringTypes.snap as string);
}

/**
 * Check if a keyring type is a simple keyring.
 *
 * @param keyringType - The account's keyring type.
 * @returns True if the keyring type is considered a simple keyring, false otherwise.
 */
export function isSimpleKeyringType(
  keyringType: KeyringTypes | string,
): boolean {
  return keyringType === (KeyringTypes.simple as string);
}

/**
 * Check if a keyring type is considered a "normal" keyring.
 *
 * @param keyringType - The account's keyring type.
 * @returns True if the keyring type is considered a "normal" keyring, false otherwise.
 */
export function isNormalKeyringType(
  keyringType: KeyringTypes | string,
): boolean {
  // Right now, we only have to "exclude" Snap accounts, but this might need to be
  // adapted later on if we have new kind of keyrings!
  return keyringType !== (KeyringTypes.snap as string);
}

/**
 * Check if a keyring is a HD keyring.
 *
 * @param keyringType - The account's keyring type.
 * @returns True if the keyring is a HD keyring, false otherwise.
 */
export function isHdKeyringType(keyringType: KeyringTypes | string): boolean {
  return keyringType === (KeyringTypes.hd as string);
}

/**
 * Get the derivation path for the index of an account within a HD keyring.
 *
 * @param index - The account index.
 * @returns The derivation path.
 */
export function getDerivationPathForIndex(index: number): string {
  return `m/44'/60'/0'/0/${index}`;
}

/**
 * Get the group index from a keyring object (HD keyring only) and an address.
 *
 * @param keyring - The keyring object.
 * @param address - The address to match.
 * @returns The group index for that address, undefined if not able to match the address.
 */
export function getGroupIndexFromAddress(
  keyring: KeyringObject,
  address: string,
): number | undefined {
  // NOTE: We mostly put that logic in a separate function so we can easily add coverage
  // for (supposedly) unreachable code path.

  if (!isHdKeyringType(keyring.type)) {
    // We cannot extract the group index from non-HD keyrings.
    return undefined;
  }

  // We need to find the account index from its HD keyring. We assume those
  // accounts are ordered, thus we can use their index to compute their
  // derivation path and group index.
  const groupIndex = keyring.accounts.findIndex(
    (accountAddress) => accountAddress === address,
  );

  // If for some reason, we cannot find this address, then the caller made a mistake
  // and it did not use the proper keyring object. For now, we do not fail and just
  // consider this account as "simple account".
  if (groupIndex === -1) {
    console.warn(`! Unable to get group index for HD account: "${address}"`);
    return undefined;
  }

  return groupIndex;
}
