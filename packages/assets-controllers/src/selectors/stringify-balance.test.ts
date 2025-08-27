import { bigIntToHex } from '@metamask/utils';
import {
  stringifyBalanceWithDecimals,
  parseBalanceWithDecimals,
} from './stringify-balance';

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

describe('parseBalanceWithDecimals', () => {
  describe('basic functionality', () => {
    it('converts integer string with decimals', () => {
      const result = parseBalanceWithDecimals('123', 18);
      expect(result).toBe(bigIntToHex(123000000000000000000n));
    });

    it('converts decimal string with exact decimals', () => {
      const result = parseBalanceWithDecimals('123.456', 3);
      expect(result).toBe(bigIntToHex(123456n));
    });

    it('converts decimal string with fewer decimals than needed (pads with zeros)', () => {
      const result = parseBalanceWithDecimals('123.45', 6);
      expect(result).toBe(bigIntToHex(123450000n));
    });

    it('converts decimal string with more decimals than needed (truncates)', () => {
      const result = parseBalanceWithDecimals('123.456789', 3);
      expect(result).toBe(bigIntToHex(123456n));
    });

    it('handles zero decimals parameter', () => {
      const result = parseBalanceWithDecimals('123.456', 0);
      expect(result).toBe(bigIntToHex(123n));
    });

    it('handles zero balance', () => {
      const result = parseBalanceWithDecimals('0', 18);
      expect(result).toBe(bigIntToHex(0n));
    });

    it('handles zero with decimals', () => {
      const result = parseBalanceWithDecimals('0.000', 18);
      expect(result).toBe(bigIntToHex(0n));
    });

    it('handles very small decimal values', () => {
      const result = parseBalanceWithDecimals('0.001', 18);
      expect(result).toBe(bigIntToHex(1000000000000000n));
    });

    it('handles leading zeros in integer part', () => {
      const result = parseBalanceWithDecimals('000123.456', 3);
      expect(result).toBe(bigIntToHex(123456n));
    });
  });

  describe('input validation', () => {
    it('returns undefined for empty string', () => {
      const result = parseBalanceWithDecimals('', 18);
      expect(result).toBeUndefined();
    });

    it('returns undefined for whitespace-only string', () => {
      const result = parseBalanceWithDecimals('   ', 18);
      expect(result).toBeUndefined();
    });

    it('returns undefined for negative numbers', () => {
      const result = parseBalanceWithDecimals('-123.456', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for non-numeric characters', () => {
      const result = parseBalanceWithDecimals('abc', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for mixed alphanumeric', () => {
      const result = parseBalanceWithDecimals('123abc', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for multiple decimal points', () => {
      const result = parseBalanceWithDecimals('123.45.67', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for trailing decimal point only', () => {
      const result = parseBalanceWithDecimals('123.', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for scientific notation', () => {
      const result = parseBalanceWithDecimals('1e10', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for hexadecimal numbers', () => {
      const result = parseBalanceWithDecimals('0x123', 3);
      expect(result).toBeUndefined();
    });

    it('returns undefined for decimal-only numbers (starting with dot)', () => {
      const result = parseBalanceWithDecimals('.123', 6);
      expect(result).toBeUndefined();
    });

    it('returns undefined for string with leading/trailing whitespace', () => {
      const result = parseBalanceWithDecimals('  123.456  ', 3);
      expect(result).toBeUndefined();
    });
  });
});
