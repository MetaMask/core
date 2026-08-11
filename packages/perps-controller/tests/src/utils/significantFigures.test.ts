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
      ['0.001234', 6],
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
  });
});
