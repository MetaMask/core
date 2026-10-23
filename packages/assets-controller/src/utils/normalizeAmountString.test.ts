import { normalizeAmountString } from './normalizeAmountString.js';

describe('normalizeAmountString', () => {
  describe('with decimals=18 (e.g. ETH/most ERC20)', () => {
    it('converts scientific notation to plain decimal', () => {
      expect(normalizeAmountString('1e-18', 18)).toBe('0.000000000000000001');
      expect(normalizeAmountString('1e-6', 18)).toBe('0.000001');
    });

    it('passes plain decimals through with trailing zeros trimmed', () => {
      expect(normalizeAmountString('1.5', 18)).toBe('1.5');
      expect(normalizeAmountString('1.500', 18)).toBe('1.5');
      expect(normalizeAmountString('1', 18)).toBe('1');
      expect(normalizeAmountString('0', 18)).toBe('0');
    });

    it('truncates (does not round) excess fractional digits', () => {
      // 19 fractional digits — last is dropped, no rounding up.
      expect(normalizeAmountString('1.2345678901234567899', 18)).toBe(
        '1.234567890123456789',
      );
    });

    it('handles uppercase-E and signed exponents', () => {
      expect(normalizeAmountString('1E+5', 18)).toBe('100000');
      expect(normalizeAmountString('2.5E2', 18)).toBe('250');
    });

    it('preserves the sign of negative exponent-form values', () => {
      expect(normalizeAmountString('-1e-10', 18)).toBe('-0.0000000001');
    });
  });

  describe('with decimals=0 (e.g. ERC721, integer-only assets)', () => {
    it('truncates any fractional part to the integer portion', () => {
      expect(normalizeAmountString('1.5', 0)).toBe('1');
      expect(normalizeAmountString('1e-18', 0)).toBe('0');
      expect(normalizeAmountString('0.999', 0)).toBe('0');
    });

    it('preserves integer amounts unchanged', () => {
      expect(normalizeAmountString('1000000000', 0)).toBe('1000000000');
    });
  });

  describe('with decimals=6 (e.g. USDC)', () => {
    it('truncates to 6 fractional digits', () => {
      expect(normalizeAmountString('1.1234567890', 6)).toBe('1.123456');
    });

    it('expands tiny exponent form to 6-digit precision', () => {
      expect(normalizeAmountString('5e-6', 6)).toBe('0.000005');
      expect(normalizeAmountString('5e-7', 6)).toBe('0');
    });
  });

  describe('without decimals (metadata unknown)', () => {
    it('preserves fractional balances at their natural precision', () => {
      // Regression: balances seeded before metadata arrived must not be
      // truncated to integers when other updates trigger a re-pass.
      expect(normalizeAmountString('0.5')).toBe('0.5');
      expect(normalizeAmountString('1.234567890123456789')).toBe(
        '1.234567890123456789',
      );
    });

    it('still defeats scientific notation', () => {
      expect(normalizeAmountString('1e-18')).toBe('0.000000000000000001');
      expect(normalizeAmountString('1E+5')).toBe('100000');
    });

    it('passes integers through unchanged', () => {
      expect(normalizeAmountString('1000000000')).toBe('1000000000');
      expect(normalizeAmountString('0')).toBe('0');
    });
  });

  describe('invalid input', () => {
    it('returns "0" for non-finite values', () => {
      expect(normalizeAmountString('NaN', 18)).toBe('0');
      expect(normalizeAmountString('Infinity', 18)).toBe('0');
      expect(normalizeAmountString('-Infinity', 18)).toBe('0');
    });

    it('returns "0" for non-string or empty input', () => {
      expect(normalizeAmountString(undefined, 18)).toBe('0');
      expect(normalizeAmountString(null, 18)).toBe('0');
      expect(normalizeAmountString(1, 18)).toBe('0');
      expect(normalizeAmountString('', 18)).toBe('0');
    });

    it('treats negative or non-finite decimals as unknown precision', () => {
      // No truncation — same behavior as omitting the argument.
      expect(normalizeAmountString('1.5', -3)).toBe('1.5');
      expect(normalizeAmountString('1.5', NaN)).toBe('1.5');
    });

    it('floors fractional decimals to an integer precision', () => {
      expect(normalizeAmountString('1.234567', 2.9)).toBe('1.23');
    });
  });
});
