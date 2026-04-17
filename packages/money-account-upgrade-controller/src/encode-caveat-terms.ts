import type { Hex } from '@metamask/utils';

/**
 * Encodes caveat terms by concatenating hex values (ABI-style),
 * left-padding each value to 32 bytes.
 *
 * @param values - The hex values to pack.
 * @returns The concatenated hex string.
 */
export function encodeCaveatTerms(...values: Hex[]): Hex {
  return `0x${values.map((val) => val.slice(2).padStart(64, '0')).join('')}`;
}
