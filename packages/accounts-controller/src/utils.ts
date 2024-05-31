import { toBuffer } from '@ethereumjs/util';
import { isCustodyKeyring, KeyringTypes } from '@metamask/keyring-controller';
import { deepClone } from '@metamask/snaps-utils';
import { sha256 } from 'ethereum-cryptography/sha256';
import type { Draft } from 'immer';
import type { V4Options } from 'uuid';
import { v4 as uuid } from 'uuid';

import type { AccountsControllerState } from './AccountsController';

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
 * Generates a UUID v4 options from a given Ethereum address.
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The UUID v4 options.
 */
export function getUUIDOptionsFromAddressOfNormalAccount(
  address: string,
): V4Options {
  const v4options = {
    random: sha256(toBuffer(address)).slice(0, 16),
  };

  return v4options;
}

/**
 * Generates a UUID from a given Ethereum address.
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The generated UUID.
 */
export function getUUIDFromAddressOfNormalAccount(address: string): string {
  return uuid(getUUIDOptionsFromAddressOfNormalAccount(address));
}

/**
 * Check if a keyring type is considered a "normal" keyring.
 * @param keyringType - The account's keyring type.
 * @returns True if the keyring type is considered a "normal" keyring, false otherwise.
 */
export function isNormalKeyringType(keyringType: KeyringTypes): boolean {
  // Right now, we only have to "exclude" Snap accounts, but this might need to be
  // adapted later on if we have new kind of keyrings!
  return keyringType !== KeyringTypes.snap;
}

/**
 * WARNING: To be removed once type issue is fixed. https://github.com/MetaMask/utils/issues/168
 *
 * Creates a deep clone of the given object.
 * This is to get around error `Type instantiation is excessively deep and possibly infinite.`
 *
 * @param obj - The object to be cloned.
 * @returns The deep clone of the object.
 */
export function deepCloneDraft(
  obj: Draft<AccountsControllerState>,
): AccountsControllerState {
  // We use unknown here because the type inference when using structured clone leads to the same type error.
  return deepClone(obj) as unknown as AccountsControllerState;
}
