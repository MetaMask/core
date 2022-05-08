"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Finds the median among a list of numbers. Note that this is different from the implementation
 * in the MetaSwap API, as we want to hold to using BN as much as possible.
 *
 * @param numbers - A list of numbers, as BNs. Will be sorted automatically if unsorted.
 * @returns The median number.
 */
function medianOf(numbers) {
    const sortedNumbers = numbers.slice().sort((a, b) => a.cmp(b));
    const len = sortedNumbers.length;
    const index = Math.floor((len - 1) / 2);
    return sortedNumbers[index];
}
exports.default = medianOf;
//# sourceMappingURL=medianOf.js.map