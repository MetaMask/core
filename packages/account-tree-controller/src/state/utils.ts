import type { Struct } from '@metamask/superstruct';
import { array, integer, refine, StructError } from '@metamask/superstruct';

/**
 * A JSON-compatible representation of a `Uint8Array` as an array of integers
 * in [0, 255]. Use {@link encodeBytes} and {@link decodeBytes} to convert.
 */
export type EncodedBytes = number[];

/**
 * Superstruct struct that validates an {@link EncodedBytes} value.
 */
export const BytesStruct: Struct<EncodedBytes> = refine(
  array(integer()),
  'bytes',
  (value) => {
    const invalid = value.find((b) => b < 0 || b > 255);
    return invalid === undefined
      ? true
      : `each byte must be in [0, 255]; got ${invalid}`;
  },
);

/**
 * Encodes a `Uint8Array` as a JSON-compatible {@link EncodedBytes}.
 *
 * @param bytes - The bytes to encode.
 * @returns An array of integers in [0, 255].
 */
export function encodeBytes(bytes: Uint8Array): EncodedBytes {
  return Array.from(bytes);
}

/**
 * Decodes an {@link EncodedBytes} produced by {@link encodeBytes} back into a `Uint8Array`.
 * The caller is responsible for zeroing the result when the data is no longer needed.
 *
 * @param encoded - The encoded byte array.
 * @returns The decoded `Uint8Array`.
 */
export function decodeBytes(encoded: EncodedBytes): Uint8Array {
  return new Uint8Array(encoded);
}

/**
 * Recursively readonly view of `Value` used by snapshot filtering predicate types.
 *
 * @typeParam T - The mutable source type to expose as deeply read-only.
 */
export type DeepReadonly<Value> = Value extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

/**
 * Recursively freezes a value and its nested properties.
 *
 * @param value - Value to freeze.
 * @returns The frozen value.
 */
export function deepFreeze<Value>(value: Value): Value {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  Object.freeze(value);

  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }

  return value;
}

/**
 * Formats Superstruct validation failures into a single error message string.
 *
 * @param error - The StructError thrown during validation.
 * @returns A comma-separated list of `[path] expected: <type>` entries.
 */
export function formatValidationErrorMessages(error: StructError): string {
  return error
    .failures()
    .map(({ path, type, refinement }) => {
      const location = path.length > 0 ? path.join('.') : '<root>';
      return `[${location}] expected: ${refinement ?? type}`;
    })
    .join(', ');
}
