import { is, pattern, string } from 'superstruct';
import { assert } from './assert';

const HexStruct = pattern(string(), /^(?:0x)?[0-9a-f]+$/iu);

/**
 * Check if a string is a valid hex string.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid hex string.
 */
export function isHexString(value: unknown): value is string {
  return is(value, HexStruct);
}

/**
 * Assert that a value is a valid hex string.
 *
 * @param value - The value to check.
 * @throws If the value is not a valid hex string.
 */
export function assertIsHexString(value: unknown): asserts value is string {
  assert(isHexString(value), 'Value must be a hexadecimal string.');
}

/**
 * Add the `0x`-prefix to a hexadecimal string. If the string already has the
 * prefix, it is returned as-is.
 *
 * @param hex - The hexadecimal string to add the prefix to.
 * @returns The prefixed hexadecimal string.
 */
export function add0x(hex: string): string {
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    return hex;
  }

  return `0x${hex}`;
}

/**
 * Remove the `0x`-prefix from a hexadecimal string. If the string doesn't have
 * the prefix, it is returned as-is.
 *
 * @param hex - The hexadecimal string to remove the prefix from.
 * @returns The un-prefixed hexadecimal string.
 */
export function remove0x(hex: string): string {
  if (hex.startsWith('0x') || hex.startsWith('0X')) {
    return hex.substring(2);
  }

  return hex;
}
