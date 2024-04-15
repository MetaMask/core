import { toHex } from '@metamask/controller-utils';

/**
 * Normalize the given gas value to a string.
 *
 * @param gasValue - The gas value to normalize.
 * @returns The normalized gas value.
 */
export function normalizeGasValue(gasValue: string | number): string {
  if (typeof gasValue === 'number') {
    return toHex(gasValue);
  }
  return gasValue;
}
