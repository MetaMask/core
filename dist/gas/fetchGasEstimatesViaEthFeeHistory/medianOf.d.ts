/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
/**
 * Finds the median among a list of numbers. Note that this is different from the implementation
 * in the MetaSwap API, as we want to hold to using BN as much as possible.
 *
 * @param numbers - A list of numbers, as BNs. Will be sorted automatically if unsorted.
 * @returns The median number.
 */
export default function medianOf(numbers: BN[]): BN;
