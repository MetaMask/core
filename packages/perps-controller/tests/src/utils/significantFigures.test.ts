import {
  countSignificantFigures,
  hasExceededSignificantFigures,
  roundToSignificantFigures,
} from '../../../src/utils/significantFigures.js';

describe('significantFigures utilities', () => {
  describe('countSignificantFigures', () => {
    it.each([
      ['', 0],
      ['0', 0],
      ['not-a-number', 0],
      ['$1,230.4500', 6],
      // Sub-$1 values: leading zeros before the first nonzero digit are not
      // significant, whether they sit in the integer part or the fraction.
      // 0.001234 is HyperLiquid's own canonical example of a valid perp
      // price (4 significant figures) — see https://hyperliquid.gitbook.io.
      ['0.001234', 4],
      ['0.000463', 3],
      ['0.000171', 3],
      ['1000', 1],
      ['-12.340', 4],
    ])('counts %s as %s', (input, expected) => {
      expect(countSignificantFigures(input)).toBe(expected);
    });
  });

  describe('hasExceededSignificantFigures', () => {
    it('returns false for empty, invalid, and integer values', () => {
      expect(hasExceededSignificantFigures('')).toBe(false);
      expect(hasExceededSignificantFigures('abc')).toBe(false);
      expect(hasExceededSignificantFigures('123456789')).toBe(false);
    });

    it('detects decimal values above the configured limit', () => {
      expect(hasExceededSignificantFigures('123.456', 5)).toBe(true);
      expect(hasExceededSignificantFigures('123.45', 5)).toBe(false);
    });

    it('does not flag a valid sub-$1 price as exceeding the limit', () => {
      // Regression: countSignificantFigures used to inflate 0.001234's 4 real
      // significant figures to 6 by counting the leading fractional zeros,
      // which made this documented-valid HyperLiquid price look invalid.
      expect(hasExceededSignificantFigures('0.001234', 5)).toBe(false);
      expect(hasExceededSignificantFigures('0.00123456', 5)).toBe(true);
    });
  });

  describe('roundToSignificantFigures', () => {
    it('returns the original string for empty, invalid, and zero values', () => {
      expect(roundToSignificantFigures('')).toBe('');
      expect(roundToSignificantFigures('abc')).toBe('abc');
      expect(roundToSignificantFigures('0')).toBe('0');
    });

    it('rounds decimal values to the allowed significant figures', () => {
      expect(roundToSignificantFigures('123.4567', 5)).toBe('123.46');
      expect(roundToSignificantFigures('123.4', 5)).toBe('123.4');
      expect(roundToSignificantFigures('12345.67', 3)).toBe('12346');
    });

    it('leaves a sub-$1 price within the significant-figure budget untouched', () => {
      // Regression: these used to be misclassified as 6 significant figures
      // and rounded down to 5 decimal places (0.00046/0.00017), destroying a
      // real digit of precision on a price that was already valid.
      expect(roundToSignificantFigures('0.001234', 5)).toBe('0.001234');
      expect(roundToSignificantFigures('0.000463', 5)).toBe('0.000463');
      expect(roundToSignificantFigures('0.000171', 5)).toBe('0.000171');
    });

    it('rounds a sub-$1 price that genuinely exceeds the budget', () => {
      expect(roundToSignificantFigures('0.00123456', 5)).toBe('0.0012346');
      expect(roundToSignificantFigures('0.00012345', 4)).toBe('0.0001234');
    });
  });
});
