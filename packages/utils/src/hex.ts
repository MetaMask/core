import {
  Hex,
  HEX_REGEX,
  remove0x,
  STRICT_HEX_REGEX,
} from '@metamask/byte-utils';
import { pattern, string } from '@metamask/superstruct';
import type { Struct } from '@metamask/superstruct';
import { assert } from '@metamask/type-utils';
import { keccak_256 as keccak256 } from '@noble/hashes/sha3';
import memoize from 'lodash/memoize.js';

const HEX_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/u;
const HEX_CHECKSUM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/u;

export const HexStruct = pattern(string(), HEX_REGEX);
export const StrictHexStruct = pattern(string(), STRICT_HEX_REGEX) as Struct<
  Hex,
  null
>;
export const HexAddressStruct = pattern(string(), HEX_ADDRESS_REGEX) as Struct<
  Hex,
  null
>;
export const HexChecksumAddressStruct = pattern(
  string(),
  HEX_CHECKSUM_ADDRESS_REGEX,
) as Struct<Hex, null>;

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * Check if a string is a valid hex address.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid hex address.
 */
export function isHexAddress(value: unknown): value is Hex {
  return isString(value) && HEX_ADDRESS_REGEX.test(value);
}

/**
 * Check if a string is a valid hex checksum address.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid hex checksum address.
 */
export function isHexChecksumAddress(value: unknown): value is Hex {
  return isString(value) && HEX_CHECKSUM_ADDRESS_REGEX.test(value);
}

/**
 * Encode a passed hex string as an ERC-55 mixed-case checksum address.
 * This is the unmemoized version, primarily used for testing.
 *
 * @param hexAddress - The hex address to encode.
 * @returns The address encoded according to ERC-55.
 * @see https://eips.ethereum.org/EIPS/eip-55
 */
export function getChecksumAddressUnmemoized(hexAddress: Hex): Hex {
  assert(isHexChecksumAddress(hexAddress), 'Invalid hex address.');
  const address = remove0x(hexAddress).toLowerCase();

  const hashBytes = keccak256(address);
  const { length } = address;
  const result = new Array(length); // Pre-allocate array

  for (let i = 0; i < length; i++) {
    /* eslint-disable no-bitwise */
    const byteIndex = i >> 1; // Faster than Math.floor(i / 2)
    const nibbleIndex = i & 1; // Faster than i % 2
    const byte = hashBytes[byteIndex] as number;
    const nibble = nibbleIndex === 0 ? byte >> 4 : byte & 0x0f;
    /* eslint-enable no-bitwise */

    result[i] = nibble >= 8 ? (address[i] as string).toUpperCase() : address[i];
  }

  return `0x${result.join('')}`;
}

/**
 * Encode a passed hex string as an ERC-55 mixed-case checksum address.
 * This function is memoized for performance.
 *
 * @param hexAddress - The hex address to encode.
 * @returns The address encoded according to ERC-55.
 * @see https://eips.ethereum.org/EIPS/eip-55
 */
export const getChecksumAddress = memoize(getChecksumAddressUnmemoized);

/**
 * Validate that the passed hex string is a valid ERC-55 mixed-case
 * checksum address.
 *
 * @param possibleChecksum - The hex address to check.
 * @returns True if the address is a checksum address.
 */
export function isValidChecksumAddressUnmemoized(
  possibleChecksum: Hex,
): boolean {
  if (!isHexChecksumAddress(possibleChecksum)) {
    return false;
  }

  return getChecksumAddress(possibleChecksum) === possibleChecksum;
}

/**
 * Validate that the passed hex string is a valid ERC-55 mixed-case
 * checksum address.
 *
 * @param possibleChecksum - The hex address to check.
 * @returns True if the address is a checksum address.
 */
export const isValidChecksumAddress = memoize(isValidChecksumAddressUnmemoized);

/**
 * Validate that the passed prefixed hex string is an all-lowercase
 * hex address, or a valid mixed-case checksum address.
 *
 * @param possibleAddress - Input parameter to check against.
 * @returns Whether or not the input is a valid hex address.
 */
export function isValidHexAddressUnmemoized(possibleAddress: Hex): boolean {
  return (
    isHexAddress(possibleAddress) || isValidChecksumAddress(possibleAddress)
  );
}

/**
 * Validate that the passed prefixed hex string is an all-lowercase
 * hex address, or a valid mixed-case checksum address.
 *
 * @param possibleAddress - Input parameter to check against.
 * @returns Whether or not the input is a valid hex address.
 */
export const isValidHexAddress = memoize(isValidHexAddressUnmemoized);
