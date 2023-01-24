/**
 * This is an alternative implementation of {@link Object.fromEntries}, which
 * works in older browsers.
 *
 * It takes an array of tuples, where the first element of each tuple is the key
 * and the second element is the value. It returns an object with the keys and
 * values from the tuples.
 *
 * @example
 * ```typescript
 * const entries = [
 *   ['foo', 'bar'],
 *   ['baz', 'qux'],
 * ];
 *
 * const object = objectFromEntries(entries);
 * console.log(object);
 * // {
 * //   foo: 'bar',
 * //   baz: 'qux',
 * // }
 * ```
 * @param entries - The entries to convert to an object.
 * @returns The object.
 */
export function objectFromEntries<Key extends string, Value>(
  entries: readonly (readonly [Key, Value])[],
): Record<Key, Value> {
  return entries.reduce<Record<string, Value>>(
    (acc, [key, value]) => ({ ...acc, [key]: value }),
    {},
  );
}

/**
 * Convert an array of tuples, where the first element of each tuple is the key
 * and the second element is the value, to an array. It omits the keys, and
 * returns an array of the values.
 *
 * @example
 * ```typescript
 * const entries = [
 *   ['0', 'bar'],
 *   ['1', 'qux'],
 * ];
 *
 * const array = arrayFromEntries(entries);
 * console.log(array);
 * // ['bar', 'qux']
 * ```
 * @param entries - The entries to convert to an array.
 * @returns The array.
 */
export function arrayFromEntries<Key extends string, Value>(
  entries: readonly (readonly [Key, Value])[],
): Value[] {
  return entries.map(([, value]) => value);
}
