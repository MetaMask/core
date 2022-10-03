import { assert } from './assert';
import { add0x, assertIsHexString, remove0x } from './hex';

// '0'.charCodeAt(0) === 48
const HEX_MINIMUM_NUMBER_CHARACTER = 48;

// '9'.charCodeAt(0) === 57
const HEX_MAXIMUM_NUMBER_CHARACTER = 58;
const HEX_CHARACTER_OFFSET = 87;

export type Bytes = bigint | number | string | Uint8Array;

/**
 * Memoized function that returns an array to be used as a lookup table for
 * converting bytes to hexadecimal values.
 *
 * The array is created lazily and then cached for future use. The benefit of
 * this approach is that the performance of converting bytes to hex is much
 * better than if we were to call `toString(16)` on each byte.
 *
 * The downside is that the array is created once and then never garbage
 * collected. This is not a problem in practice because the array is only 256
 * elements long.
 *
 * @returns A function that returns the lookup table.
 */
function getPrecomputedHexValuesBuilder(): () => string[] {
  // To avoid issues with tree shaking, we need to use a function to return the
  // array. This is because the array is only used in the `bytesToHex` function
  // and if we were to use a global variable, the array might be removed by the
  // tree shaker.
  const lookupTable: string[] = [];

  return () => {
    if (lookupTable.length === 0) {
      for (let i = 0; i < 256; i++) {
        lookupTable.push(i.toString(16).padStart(2, '0'));
      }
    }

    return lookupTable;
  };
}

/**
 * Function implementation of the {@link getPrecomputedHexValuesBuilder}
 * function.
 */
const getPrecomputedHexValues = getPrecomputedHexValuesBuilder();

/**
 * Check if a value is a `Uint8Array`.
 *
 * @param value - The value to check.
 * @returns Whether the value is a `Uint8Array`.
 */
export function isBytes(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}

/**
 * Assert that a value is a `Uint8Array`.
 *
 * @param value - The value to check.
 * @throws If the value is not a `Uint8Array`.
 */
export function assertIsBytes(value: unknown): asserts value is Uint8Array {
  assert(isBytes(value), 'Value must be a Uint8Array.');
}

/**
 * Convert a `Uint8Array` to a hexadecimal string.
 *
 * @param bytes - The bytes to convert to a hexadecimal string.
 * @returns The hexadecimal string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  assertIsBytes(bytes);

  const lookupTable = getPrecomputedHexValues();
  const hex = new Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    hex[i] = lookupTable[bytes[i]!];
  }

  return add0x(hex.join(''));
}

/**
 * Convert a `Uint8Array` to a `bigint`.
 *
 * To convert a `Uint8Array` to a `number` instead, use {@link bytesToNumber}.
 * To convert a two's complement encoded `Uint8Array` to a `bigint`, use
 * {@link bytesToSignedBigInt}.
 *
 * @param bytes - The bytes to convert to a `bigint`.
 * @returns The `bigint`.
 */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  assertIsBytes(bytes);

  const hex = bytesToHex(bytes);
  return BigInt(hex);
}

/**
 * Convert a `Uint8Array` to a signed `bigint`. This assumes that the bytes are
 * encoded in two's complement.
 *
 * To convert a `Uint8Array` to an unsigned `bigint` instead, use
 * {@link bytesToBigInt}.
 *
 * @see https://en.wikipedia.org/wiki/Two%27s_complement
 * @param bytes - The bytes to convert to a signed `bigint`.
 * @returns The signed `bigint`.
 */
export function bytesToSignedBigInt(bytes: Uint8Array): bigint {
  assertIsBytes(bytes);

  let value = BigInt(0);
  for (const byte of bytes) {
    // eslint-disable-next-line no-bitwise
    value = (value << BigInt(8)) + BigInt(byte);
  }

  return BigInt.asIntN(bytes.length * 8, value);
}

/**
 * Convert a `Uint8Array` to a `number`.
 *
 * To convert a `Uint8Array` to a `bigint` instead, use {@link bytesToBigInt}.
 *
 * @param bytes - The bytes to convert to a number.
 * @returns The number.
 * @throws If the resulting number is not a safe integer.
 */
export function bytesToNumber(bytes: Uint8Array): number {
  assertIsBytes(bytes);

  const bigint = bytesToBigInt(bytes);

  assert(
    bigint <= BigInt(Number.MAX_SAFE_INTEGER),
    'Number is not a safe integer. Use `bytesToBigInt` instead.',
  );

  return Number(bigint);
}

/**
 * Convert a UTF-8 encoded `Uint8Array` to a `string`.
 *
 * @param bytes - The bytes to convert to a string.
 * @returns The string.
 */
export function bytesToString(bytes: Uint8Array): string {
  assertIsBytes(bytes);

  return new TextDecoder(undefined).decode(bytes);
}

/**
 * Convert a hexadecimal string to a `Uint8Array`. The string can optionally be
 * prefixed with `0x`. It accepts even and odd length strings.
 *
 * @param value - The hexadecimal string to convert to bytes.
 * @returns The bytes as `Uint8Array`.
 */
export function hexToBytes(value: string): Uint8Array {
  assertIsHexString(value);

  // Remove the `0x` prefix if it exists, and pad the string to have an even
  // number of characters.
  const strippedValue = remove0x(value).toLowerCase();
  const normalizedValue =
    strippedValue.length % 2 === 0 ? strippedValue : `0${strippedValue}`;
  const bytes = new Uint8Array(normalizedValue.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    // While this is not the prettiest way to convert a hexadecimal string to a
    // `Uint8Array`, it is a lot faster than using `parseInt` to convert each
    // character.
    const c1 = normalizedValue.charCodeAt(i * 2);
    const c2 = normalizedValue.charCodeAt(i * 2 + 1);
    const n1 =
      c1 -
      (c1 < HEX_MAXIMUM_NUMBER_CHARACTER
        ? HEX_MINIMUM_NUMBER_CHARACTER
        : HEX_CHARACTER_OFFSET);
    const n2 =
      c2 -
      (c2 < HEX_MAXIMUM_NUMBER_CHARACTER
        ? HEX_MINIMUM_NUMBER_CHARACTER
        : HEX_CHARACTER_OFFSET);

    bytes[i] = n1 * 16 + n2;
  }

  return bytes;
}

/**
 * Convert a `bigint` to a `Uint8Array`.
 *
 * This assumes that the `bigint` is an unsigned integer. To convert a signed
 * `bigint` instead, use {@link signedBigIntToBytes}.
 *
 * @param value - The bigint to convert to bytes.
 * @returns The bytes as `Uint8Array`.
 */
export function bigIntToBytes(value: bigint): Uint8Array {
  assert(typeof value === 'bigint', 'Value must be a bigint.');
  assert(value >= BigInt(0), 'Value must be a non-negative bigint.');

  const hex = value.toString(16);
  return hexToBytes(hex);
}

/**
 * Check if a `bigint` fits in a certain number of bytes.
 *
 * @param value - The `bigint` to check.
 * @param bytes - The number of bytes.
 * @returns Whether the `bigint` fits in the number of bytes.
 */
function bigIntFits(value: bigint, bytes: number): boolean {
  assert(bytes > 0);

  /* eslint-disable no-bitwise */
  const mask = value >> BigInt(31);
  return !(((~value & mask) + (value & ~mask)) >> BigInt(bytes * 8 + ~0));
  /* eslint-enable no-bitwise */
}

/**
 * Convert a signed `bigint` to a `Uint8Array`. This uses two's complement
 * encoding to represent negative numbers.
 *
 * To convert an unsigned `bigint` to a `Uint8Array` instead, use
 * {@link bigIntToBytes}.
 *
 * @see https://en.wikipedia.org/wiki/Two%27s_complement
 * @param value - The number to convert to bytes.
 * @param byteLength - The length of the resulting `Uint8Array`. If the number
 * is larger than the maximum value that can be represented by the given length,
 * an error is thrown.
 * @returns The bytes as `Uint8Array`.
 */
export function signedBigIntToBytes(
  value: bigint,
  byteLength: number,
): Uint8Array {
  assert(typeof value === 'bigint', 'Value must be a bigint.');
  assert(typeof byteLength === 'number', 'Byte length must be a number.');
  assert(byteLength > 0, 'Byte length must be greater than 0.');
  assert(
    bigIntFits(value, byteLength),
    'Byte length is too small to represent the given value.',
  );

  // ESLint doesn't like mutating function parameters, so to avoid having to
  // disable the rule, we create a new variable.
  let numberValue = value;
  const bytes = new Uint8Array(byteLength);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number(BigInt.asUintN(8, numberValue));
    // eslint-disable-next-line no-bitwise
    numberValue >>= BigInt(8);
  }

  return bytes.reverse();
}

/**
 * Convert a `number` to a `Uint8Array`.
 *
 * @param value - The number to convert to bytes.
 * @returns The bytes as `Uint8Array`.
 * @throws If the number is not a safe integer.
 */
export function numberToBytes(value: number): Uint8Array {
  assert(typeof value === 'number', 'Value must be a number.');
  assert(value >= 0, 'Value must be a non-negative number.');
  assert(
    Number.isSafeInteger(value),
    'Value is not a safe integer. Use `bigIntToBytes` instead.',
  );

  const hex = value.toString(16);
  return hexToBytes(hex);
}

/**
 * Convert a `string` to a UTF-8 encoded `Uint8Array`.
 *
 * @param value - The string to convert to bytes.
 * @returns The bytes as `Uint8Array`.
 */
export function stringToBytes(value: string): Uint8Array {
  assert(typeof value === 'string', 'Value must be a string.');

  return new TextEncoder().encode(value);
}

/**
 * Convert a byte-like value to a `Uint8Array`. The value can be a `Uint8Array`,
 * a `bigint`, a `number`, or a `string`.
 *
 * If the value is a `string`, and it is prefixed with `0x`, it will be
 * interpreted as a hexadecimal string. Otherwise, it will be interpreted as a
 * UTF-8 string. To convert a hexadecimal string to bytes without interpreting
 * it as a UTF-8 string, use {@link hexToBytes} instead.
 *
 * If the value is a `bigint`, it is assumed to be unsigned. To convert a signed
 * `bigint` to bytes, use {@link signedBigIntToBytes} instead.
 *
 * If the value is a `Uint8Array`, it will be returned as-is.
 *
 * @param value - The value to convert to bytes.
 * @returns The bytes as `Uint8Array`.
 */
export function valueToBytes(value: Bytes): Uint8Array {
  if (typeof value === 'bigint') {
    return bigIntToBytes(value);
  }

  if (typeof value === 'number') {
    return numberToBytes(value);
  }

  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      return hexToBytes(value);
    }

    return stringToBytes(value);
  }

  if (isBytes(value)) {
    return value;
  }

  throw new TypeError(`Unsupported value type: "${typeof value}".`);
}

/**
 * Concatenate multiple byte-like values into a single `Uint8Array`. The values
 * can be `Uint8Array`, `bigint`, `number`, or `string`. This uses
 * {@link valueToBytes} under the hood to convert each value to bytes. Refer to
 * the documentation of that function for more information.
 *
 * @param values - The values to concatenate.
 * @returns The concatenated bytes as `Uint8Array`.
 */
export function concatBytes(values: Bytes[]): Uint8Array {
  const normalizedValues = new Array(values.length);
  let byteLength = 0;

  for (let i = 0; i < values.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const value = valueToBytes(values[i]!);

    normalizedValues[i] = value;
    byteLength += value.length;
  }

  const bytes = new Uint8Array(byteLength);
  for (let i = 0, offset = 0; i < normalizedValues.length; i++) {
    // While we could simply spread the values into an array and use
    // `Uint8Array.from`, that is a lot slower than using `Uint8Array.set`.
    bytes.set(normalizedValues[i], offset);
    offset += normalizedValues[i].length;
  }

  return bytes;
}
