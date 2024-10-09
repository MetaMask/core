/**
 * Returns the difference between 2 sets.
 * NOTE - this is temporary until we can support Set().difference method
 * @param a - First Set
 * @param b - Second Set
 * @returns The difference between the first and second set.
 */
export function setDifference<TItem>(a: Set<TItem>, b: Set<TItem>): Set<TItem> {
  const difference = new Set<TItem>();
  a.forEach((e) => !b.has(e) && difference.add(e));
  return difference;
}

/**
 * Returns the intersection between 2 sets.
 * NOTE - this is temporary until we can support Set().intersection method
 * @param a - First Set
 * @param b - Second Set
 * @returns The intersection between the first and second set.
 */
export function setIntersection<TItem>(
  a: Set<TItem>,
  b: Set<TItem>,
): Set<TItem> {
  const intersection = new Set<TItem>();
  a.forEach((e) => b.has(e) && intersection.add(e));
  return intersection;
}
