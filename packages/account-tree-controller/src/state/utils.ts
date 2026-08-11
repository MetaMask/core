import { StructError } from '@metamask/superstruct';

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
