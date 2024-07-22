import { BigNumber } from 'bignumber.js';
type FormatOptions = {
    decimalPlaces?: number;
    shouldEllipse?: boolean;
};
/**
 * Calculates the token amount based on the given value and decimals.
 *
 * @param value - The value to calculate the token amount from.
 * @param decimals - The number of decimals to use for the calculation.
 * @returns The calculated token amount.
 */
export declare function calcTokenAmount(value: string, decimals: number): BigNumber;
/**
 * Calculates the number of leading zeros in the fractional part of a number.
 *
 * This function converts a number or a string representation of a number into
 * its decimal form and then counts the number of leading zeros present in the
 * fractional part of the number. This is useful for determining the precision
 * of very small numbers.
 *
 * @param num - The number to analyze, which can be in the form
 * of a number or a string.
 * @returns The count of leading zeros in the fractional part of the number.
 */
export declare const getLeadingZeroCount: (num: number | string) => number;
/**
 * This formats a number using Intl
 * It abbreviates large numbers (using K, M, B, T)
 * And abbreviates small numbers in 2 ways:
 * - Will format to the given number of decimal places
 * - Will format up to 4 decimal places
 * - Will ellipse the number if longer than given decimal places
 *
 * @param numericAmount - The number to format
 * @param opts - The options to use when formatting
 * @returns The formatted number
 */
export declare const formatAmount: (numericAmount: number, opts?: FormatOptions) => string;
export declare const getAmount: (amount: string, decimals: string, options?: FormatOptions) => string;
export {};
//# sourceMappingURL=get-notification-data.d.ts.map