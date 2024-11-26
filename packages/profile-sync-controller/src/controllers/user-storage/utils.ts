import encryption from '../../shared/encryption';
import { areAllUInt8ArraysUnique } from '../../shared/encryption/utils';
import type { GetUserStorageAllFeatureEntriesResponse } from './services';

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
 * Returns a boolean indicating if the entries have different salts.
 *
 * @param entries - User Storage Entries
 * @returns A boolean indicating if the entries have different salts.
 */
export function getIfEntriesHaveDifferentSalts(
  entries: GetUserStorageAllFeatureEntriesResponse,
): boolean {
  const salts = entries
    .map((e) => {
      try {
        return encryption.getSalt(e.Data);
      } catch {
        return undefined;
      }
    })
    .filter((s): s is Uint8Array => s !== undefined);

  return areAllUInt8ArraysUnique(salts);
}
