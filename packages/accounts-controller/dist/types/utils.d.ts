import { KeyringTypes } from '@metamask/keyring-controller';
import type { V4Options } from 'uuid';
/**
 * Returns the name of the keyring type.
 *
 * @param keyringType - The type of the keyring.
 * @returns The name of the keyring type.
 */
export declare function keyringTypeToName(keyringType: string): string;
/**
 * Generates a UUID v4 options from a given Ethereum address.
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The UUID v4 options.
 */
export declare function getUUIDOptionsFromAddressOfNormalAccount(address: string): V4Options;
/**
 * Generates a UUID from a given Ethereum address.
 * @param address - The Ethereum address to generate the UUID from.
 * @returns The generated UUID.
 */
export declare function getUUIDFromAddressOfNormalAccount(address: string): string;
/**
 * Check if a keyring type is considered a "normal" keyring.
 * @param keyringType - The account's keyring type.
 * @returns True if the keyring type is considered a "normal" keyring, false otherwise.
 */
export declare function isNormalKeyringType(keyringType: KeyringTypes): boolean;
//# sourceMappingURL=utils.d.ts.map