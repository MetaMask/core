import { add0x, assertIsHexString } from './hex';
import { assert } from './assert';

/**
 * Convert a number to a hexadecimal string. This verifies that the number is a
 * non-negative safe integer.
 *
 * To convert a `bigint` to a hexadecimal string instead, use
 * {@link bigIntToHex}.
 *
 * @example
 * ```typescript
 * numberToHex(0); // '0x0'
 * numberToHex(1); // '0x1'
 * numberToHex(16); // '0x10'
 * ```
 * @param value - The number to convert to a hexadecimal string.
 * @returns The hexadecimal string, with the "0x"-prefix.
 * @throws If the number is not a non-negative safe integer.
 */
export const numberToHex = (value: number): string => {
  assert(typeof value === 'number', 'Value must be a number.');
  assert(value >= 0, 'Value must be a non-negative number.');
  assert(
    Number.isSafeInteger(value),
    'Value is not a safe integer. Use `bigIntToHex` instead.',
  );

  return add0x(value.toString(16));
};

/**
 * Convert a `bigint` to a hexadecimal string. This verifies that the `bigint`
 * is a non-negative integer.
 *
 * To convert a number to a hexadecimal string instead, use {@link numberToHex}.
 *
 * @example
 * ```typescript
 * bigIntToHex(0n); // '0x0'
 * bigIntToHex(1n); // '0x1'
 * bigIntToHex(16n); // '0x10'
 * ```
 * @param value - The `bigint` to convert to a hexadecimal string.
 * @returns The hexadecimal string, with the "0x"-prefix.
 * @throws If the `bigint` is not a non-negative integer.
 */
export const bigIntToHex = (value: bigint): string => {
  assert(typeof value === 'bigint', 'Value must be a bigint.');
  assert(value >= 0, 'Value must be a non-negative bigint.');

  return add0x(value.toString(16));
};

/**
 * Convert a hexadecimal string to a number. This verifies that the string is a
 * valid hex string, and that the resulting number is a safe integer. Both
 * "0x"-prefixed and unprefixed strings are supported.
 *
 * To convert a hexadecimal string to a `bigint` instead, use
 * {@link hexToBigInt}.
 *
 * @example
 * ```typescript
 * hexToNumber('0x0'); // 0
 * hexToNumber('0x1'); // 1
 * hexToNumber('0x10'); // 16
 * ```
 * @param value - The hexadecimal string to convert to a number.
 * @returns The number.
 * @throws If the value is not a valid hexadecimal string, or if the resulting
 * number is not a safe integer.
 */
export const hexToNumber = (value: string): number => {
  assertIsHexString(value);

  // `parseInt` accepts values without the "0x"-prefix, whereas `Number` does
  // not. Using this is slightly faster than `Number(add0x(value))`.
  const numberValue = parseInt(value, 16);

  assert(
    Number.isSafeInteger(numberValue),
    'Value is not a safe integer. Use `hexToBigInt` instead.',
  );

  return numberValue;
};

/**
 * Convert a hexadecimal string to a `bigint`. This verifies that the string is
 * a valid hex string. Both "0x"-prefixed and unprefixed strings are supported.
 *
 * To convert a hexadecimal string to a number instead, use {@link hexToNumber}.
 *
 * @example
 * ```typescript
 * hexToBigInt('0x0'); // 0n
 * hexToBigInt('0x1'); // 1n
 * hexToBigInt('0x10'); // 16n
 * ```
 * @param value - The hexadecimal string to convert to a `bigint`.
 * @returns The `bigint`.
 * @throws If the value is not a valid hexadecimal string.
 */
export const hexToBigInt = (value: string): bigint => {
  assertIsHexString(value);

  // The `BigInt` constructor requires the "0x"-prefix to parse a hex string.
  return BigInt(add0x(value));
};
