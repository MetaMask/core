import { is, pattern, string, Struct } from 'superstruct';

import { assert } from './assert';

export type Hex = `0x${string}`;

export const HexStruct = pattern(string(), /^(?:0x)?[0-9a-f]+$/iu);
export const StrictHexStruct = pattern(string(), /^0x[0-9a-f]+$/iu) as Struct<
  Hex,
  null
>;

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
 * Strictly check if a string is a valid hex string. A valid hex string must
 * start with the "0x"-prefix.
 *
 * @param value - The value to check.
 * @returns Whether the value is a valid hex string.
 */
export function isStrictHexString(value: unknown): value is Hex {
  return is(value, StrictHexStruct);
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
 * Assert that a value is a valid hex string. A valid hex string must start with
 * the "0x"-prefix.
 *
 * @param value - The value to check.
 * @throws If the value is not a valid hex string.
 */
export function assertIsStrictHexString(value: unknown): asserts value is Hex {
  assert(
    isStrictHexString(value),
    'Value must be a hexadecimal string, starting with "0x".',
  );
}

/**
 * Add the `0x`-prefix to a hexadecimal string. If the string already has the
 * prefix, it is returned as-is.
 *
 * @param hexadecimal - The hexadecimal string to add the prefix to.
 * @returns The prefixed hexadecimal string.
 */
export function add0x(hexadecimal: string): Hex {
  if (hexadecimal.startsWith('0x')) {
    return hexadecimal as Hex;
  }

  if (hexadecimal.startsWith('0X')) {
    return `0x${hexadecimal.substring(2)}`;
  }

  return `0x${hexadecimal}`;
}

/**
 * Remove the `0x`-prefix from a hexadecimal string. If the string doesn't have
 * the prefix, it is returned as-is.
 *
 * @param hexadecimal - The hexadecimal string to remove the prefix from.
 * @returns The un-prefixed hexadecimal string.
 */
export function remove0x(hexadecimal: string): string {
  if (hexadecimal.startsWith('0x') || hexadecimal.startsWith('0X')) {
    return hexadecimal.substring(2);
  }

  return hexadecimal;
}
