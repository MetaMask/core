import { describe, expect, it } from 'vitest';

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
      ['0.001234', 4],
      ['0.000463', 3],
      ['0.000001', 1],
      ['-0.001234', 4],
      ['0.0012300', 3],
      ['-$0.001234tail', 4],
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
      expect(hasExceededSignificantFigures('0.001234', 5)).toBe(false);
      expect(hasExceededSignificantFigures('0.00123456', 5)).toBe(true);
    });
  });

  describe('roundToSignificantFigures', () => {
    it.each([
      ['0.001234', 5, '0.001234'],
      ['0.000463', 5, '0.000463'],
      ['0.00123456', 5, '0.0012346'],
      ['-0.00123456', 5, '-0.0012346'],
      ['0.00012345', 4, '0.0001234'],
      ['0.000001', 1, '0.000001'],
      ['-$0.001234tail', 5, '-0.001234'],
      ['1.234e-3', 5, '0.001234'],
    ])('rounds %s to %s significant figures as %s', (input, cap, expected) => {
      expect(roundToSignificantFigures(input, cap)).toBe(expected);
    });

    it.each([
      ['123456', 3, '123456'],
      ['-12345.5', 3, '-12345'],
      ['0.999999', 5, '1'],
      ['-0.999999', 5, '-1'],
      ['9.99999', 5, '10'],
      ['0.123455', 5, '0.12345'],
      ['-0.123455', 5, '-0.12345'],
      ['5e-324', 5, '5e-324'],
      ['1e-100', 2, '1e-100'],
      ['0.000999', 0, '0'],
      ['0.000999', 0.5, '0'],
      ['0.00123456', 101, '0.00123456'],
      ['$0.00', 5, '$0.00'],
    ])(
      'preserves rounding behavior for %s at cap %s',
      (input, cap, expected) => {
        expect(roundToSignificantFigures(input, cap)).toBe(expected);
      },
    );

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
