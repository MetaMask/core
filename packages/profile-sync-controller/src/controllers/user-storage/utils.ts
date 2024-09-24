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

/**
 *
 * Waits for a value to be returned from a getter function.
 *
 * @param getter - Function that returns the value to check
 * @param expectedValue - The value to wait for
 * @param timeout - The time to wait before timing out
 * @returns A promise that resolves when the expected value is returned
 * or rejects if the timeout is reached.
 */
export function waitForExpectedValue<TVariable>(
  getter: () => TVariable,
  expectedValue: TVariable,
  timeout = 1000,
): Promise<TVariable> {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const value = getter();
      if (value === expectedValue) {
        clearInterval(interval);
        resolve(value);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for expected value'));
    }, timeout);
  });
}
