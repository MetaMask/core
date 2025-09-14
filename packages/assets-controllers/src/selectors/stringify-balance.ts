// From https://github.com/MetaMask/eth-token-tracker/blob/main/lib/util.js
// Ensures backwards compatibility with display formatting.

import { bigIntToHex, type Hex } from '@metamask/utils';

/**
 * @param balance - The balance to stringify as a decimal string
 * @param decimals - The number of decimals of the balance
 * @param balanceDecimals - The number of decimals to display
 * @returns The stringified balance with the specified number of decimals
 */
export function stringifyBalanceWithDecimals(
  balance: bigint,
  decimals: number,
  balanceDecimals = 5,
) {
  if (balance === 0n || decimals === 0) {
    return balance.toString();
  }

  let bal = balance.toString();
  let len = bal.length;
  let decimalIndex = len - decimals;
  let prefix = '';

  if (decimalIndex <= 0) {
    while (prefix.length <= decimalIndex * -1) {
      prefix += '0';
      len += 1;
    }
    bal = prefix + bal;
    decimalIndex = 1;
  }

  const whole = bal.slice(0, len - decimals);

  if (balanceDecimals === 0) {
    return whole;
  }

  const fractional = bal.slice(decimalIndex, decimalIndex + balanceDecimals);
  if (/0+$/u.test(fractional)) {
    let withOnlySigZeroes = bal.slice(decimalIndex).replace(/0+$/u, '');
    if (withOnlySigZeroes.length > 0) {
      withOnlySigZeroes = `.${withOnlySigZeroes}`;
    }
    return `${whole}${withOnlySigZeroes}`;
  }
  return `${whole}.${fractional}`;
}

/**
 * Converts a decimal string representation back to a Hex balance.
 * This is the inverse operation of stringifyBalanceWithDecimals.
 *
 * @param balanceString - The decimal string representation (e.g., "123.456")
 * @param decimals - The number of decimals to apply (shifts decimal point right)
 * @returns The balance as a Hex string
 *
 * @example
 * parseBalanceWithDecimals("123.456", 18) // Returns '0x6B14BD1E6EEA00000'
 * parseBalanceWithDecimals("0.001", 18)   // Returns '0x38D7EA4C68000'
 * parseBalanceWithDecimals("123", 18)     // Returns '0x6AAF7C8516D0C0000'
 */
export function parseBalanceWithDecimals(
  balanceString: string,
  decimals: number,
): Hex | undefined {
  // Allows: "123", "123.456", "0.123", but not: "-123", "123.", "abc", "12.34.56"
  if (!/^\d+(\.\d+)?$/u.test(balanceString)) {
    return undefined;
  }

  const [integerPart, fractionalPart = ''] = balanceString.split('.');

  if (decimals === 0) {
    return bigIntToHex(BigInt(integerPart));
  }

  if (fractionalPart.length >= decimals) {
    return bigIntToHex(
      BigInt(`${integerPart}${fractionalPart.slice(0, decimals)}`),
    );
  }

  return bigIntToHex(
    BigInt(
      `${integerPart}${fractionalPart}${'0'.repeat(
        decimals - fractionalPart.length,
      )}`,
    ),
  );
}
