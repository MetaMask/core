import { define, object, optional, union } from '@metamask/superstruct';

/**
 * Superstruct schema for an empty array [].
 * Validates that the value is an array with zero elements.
 */
export const EmptyArrayStruct = define<[]>('EmptyArray', (value) =>
  Array.isArray(value) && value.length === 0
    ? true
    : 'Expected an empty array',
);

/**
 * Superstruct schema for JSON-RPC methods that expect no parameters.
 *
 * Different JSON-RPC clients may send "no params" in different ways:
 * - Omitted entirely (undefined)
 * - Empty array []
 * - Empty object {}
 *
 * This struct accepts all three forms for maximum compatibility.
 */
export const NoParamsStruct = optional(union([object({}), EmptyArrayStruct]));
