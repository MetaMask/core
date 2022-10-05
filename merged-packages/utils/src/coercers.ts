import {
  bigint,
  coerce,
  create,
  Infer,
  instance,
  number,
  string,
  StructError,
  union,
} from 'superstruct';
import { Hex, StrictHexStruct } from './hex';
import { assert } from './assert';
import { bytesToHex, hexToBytes } from './bytes';

const NumberLikeStruct = union([number(), bigint(), string(), StrictHexStruct]);
const NumberCoercer = coerce(number(), NumberLikeStruct, Number);
const BigIntCoercer = coerce(bigint(), NumberLikeStruct, BigInt);

const BytesLikeStruct = union([StrictHexStruct, instance(Uint8Array)]);
const BytesCoercer = coerce(
  instance(Uint8Array),
  union([StrictHexStruct]),
  hexToBytes,
);

const HexCoercer = coerce(StrictHexStruct, instance(Uint8Array), bytesToHex);

export type NumberLike = Infer<typeof NumberLikeStruct>;
export type BytesLike = Infer<typeof BytesLikeStruct>;

/**
 * Create a number from a number-like value.
 *
 * - If the value is a number, it is returned as-is.
 * - If the value is a `bigint`, it is converted to a number.
 * - If the value is a string, it is interpreted as a decimal number.
 * - If the value is a hex string (i.e., it starts with "0x"), it is
 * interpreted as a hexadecimal number.
 *
 * This validates that the value is a number-like value, and that the resulting
 * number is not `NaN` or `Infinity`.
 *
 * @example
 * ```typescript
 * const value = createNumber('0x010203');
 * console.log(value); // 66051
 *
 * const otherValue = createNumber(123n);
 * console.log(otherValue); // 123
 * ```
 * @param value - The value to create the number from.
 * @returns The created number.
 * @throws If the value is not a number-like value, or if the resulting number
 * is `NaN` or `Infinity`.
 */
export function createNumber(value: NumberLike): number {
  try {
    const result = create(value, NumberCoercer);

    assert(
      Number.isFinite(result),
      `Expected a number-like value, got "${value}".`,
    );

    return result;
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(`Expected a number-like value, got "${value}".`);
    }

    /* istanbul ignore next */
    throw error;
  }
}

/**
 * Create a `bigint` from a number-like value.
 *
 * - If the value is a number, it is converted to a `bigint`.
 * - If the value is a `bigint`, it is returned as-is.
 * - If the value is a string, it is interpreted as a decimal number and
 * converted to a `bigint`.
 * - If the value is a hex string (i.e., it starts with "0x"), it is
 * interpreted as a hexadecimal number and converted to a `bigint`.
 *
 * @example
 * ```typescript
 * const value = createBigInt('0x010203');
 * console.log(value); // 16909060n
 *
 * const otherValue = createBigInt(123);
 * console.log(otherValue); // 123n
 * ```
 * @param value - The value to create the bigint from.
 * @returns The created bigint.
 * @throws If the value is not a number-like value.
 */
export function createBigInt(value: NumberLike): bigint {
  try {
    // The `BigInt` constructor throws if the value is not a number-like value.
    // There is no need to validate the value manually.
    return create(value, BigIntCoercer);
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(`Expected a number-like value, got "${error.value}".`);
    }

    /* istanbul ignore next */
    throw error;
  }
}

/**
 * Create a byte array from a bytes-like value.
 *
 * - If the value is a byte array, it is returned as-is.
 * - If the value is a hex string (i.e., it starts with "0x"), it is interpreted
 * as a hexadecimal number and converted to a byte array.
 *
 * @example
 * ```typescript
 * const value = createBytes('0x010203');
 * console.log(value); // Uint8Array [ 1, 2, 3 ]
 *
 * const otherValue = createBytes('0x010203');
 * console.log(otherValue); // Uint8Array [ 1, 2, 3 ]
 * ```
 * @param value - The value to create the byte array from.
 * @returns The created byte array.
 * @throws If the value is not a bytes-like value.
 */
export function createBytes(value: BytesLike): Uint8Array {
  if (typeof value === 'string' && value.toLowerCase() === '0x') {
    return new Uint8Array();
  }

  try {
    return create(value, BytesCoercer);
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(`Expected a bytes-like value, got "${error.value}".`);
    }

    /* istanbul ignore next */
    throw error;
  }
}

/**
 * Create a hexadecimal string from a bytes-like value.
 *
 * - If the value is a hex string (i.e., it starts with "0x"), it is returned
 * as-is.
 * - If the value is a `Uint8Array`, it is converted to a hex string.
 *
 * @example
 * ```typescript
 * const value = createHex(new Uint8Array([1, 2, 3]));
 * console.log(value); // '0x010203'
 *
 * const otherValue = createHex('0x010203');
 * console.log(otherValue); // '0x010203'
 * ```
 * @param value - The value to create the hex string from.
 * @returns The created hex string.
 * @throws If the value is not a bytes-like value.
 */
export function createHex(value: BytesLike): Hex {
  if (
    (value instanceof Uint8Array && value.length === 0) ||
    (typeof value === 'string' && value.toLowerCase() === '0x')
  ) {
    return '0x';
  }

  try {
    return create(value, HexCoercer);
  } catch (error) {
    if (error instanceof StructError) {
      throw new Error(`Expected a bytes-like value, got "${error.value}".`);
    }

    /* istanbul ignore next */
    throw error;
  }
}
