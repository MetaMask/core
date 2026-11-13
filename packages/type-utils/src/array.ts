/**
 * Like {@link Array}, but always non-empty.
 *
 * @template Element - The non-empty array member type.
 */
export type NonEmptyArray<Element> = [Element, ...Element[]];

/**
 * A {@link NonEmptyArray} type guard.
 *
 * @template Element - The non-empty array member type.
 * @param value - The value to check.
 * @returns Whether the value is a non-empty array.
 */
export function isNonEmptyArray<Element>(
  value: Element[],
): value is NonEmptyArray<Element> {
  return Array.isArray(value) && value.length > 0;
}
