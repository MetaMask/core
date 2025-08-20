import { stringifyBalanceWithDecimals } from './stringify-balance';

describe('stringifyBalanceWithDecimals', () => {
  it('returns the balance early if it is 0', () => {
    const result = stringifyBalanceWithDecimals(0n, 18);
    expect(result).toBe('0');
  });

  it('returns a balance equal or greater than 1 as a string', () => {
    const result = stringifyBalanceWithDecimals(1000000000000000000n, 18);
    expect(result).toBe('1');
  });

  it('returns a balance lower than 1 as a string', () => {
    const result = stringifyBalanceWithDecimals(100000000000000000n, 18);
    expect(result).toBe('0.1');
  });

  it('skips decimals if balanceDecimals is 0', () => {
    const result = stringifyBalanceWithDecimals(100000000000000000n, 18, 0);
    expect(result).toBe('0');
  });
});
