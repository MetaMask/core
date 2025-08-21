// From https://github.com/MetaMask/eth-token-tracker/blob/main/lib/util.js
// Ensures backwards compatibility with display formatting.

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
