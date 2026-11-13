import { describe, expect, it } from 'vitest';

import { calculateNumberSize, isASCII, calculateStringSize } from './index.js';

describe('miscellaneous', () => {
  describe('isASCII', () => {
    it('should return true for "A" which is the ASCII character', () => {
      expect(isASCII('A')).toBe(true);
    });

    it('should return false for "Š" which is not the ASCII character', () => {
      expect(isASCII('Š')).toBe(false);
    });
  });

  describe('calculateStringSize', () => {
    it('should return 96 for a size of ASCII string', () => {
      const str =
        '!"#$%&\'()*+,-./0123456789:;<=>?' +
        '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]' +
        '^_`abcdefghijklmnopqrstuvwxyz{|}~';
      expect(calculateStringSize(str)).toBe(96);
    });

    it('should return 10 for a size of UTF8 string', () => {
      const str = 'šđćčž';
      expect(calculateStringSize(str)).toBe(10);
    });

    it('should return 15 for a size of mixed, ASCII and UTF8 string', () => {
      const str = 'ašbđcćdčež';
      expect(calculateStringSize(str)).toBe(15);
    });

    it('should return 10 for a size of special characters', () => {
      const str = '"\\\n\r\t';
      expect(calculateStringSize(str)).toBe(10);
    });
  });

  describe('calculateNumberSize', () => {
    it('should return 3 for a "100" number size', () => {
      expect(calculateNumberSize(100)).toBe(3);
    });

    it('should return 4 for a "-100" number size', () => {
      expect(calculateNumberSize(-100)).toBe(4);
    });

    it('should return 4 for a "-0.3" number size', () => {
      expect(calculateNumberSize(-0.3)).toBe(4);
    });

    it('should return 7 for a "-123.45" number size', () => {
      expect(calculateNumberSize(-123.45)).toBe(7);
    });

    it('should return 5 for a "0.0000000005" number size', () => {
      // Because the number provided here will be changed to exponential notation
      // 5e-10 by default
      expect(calculateNumberSize(0.0000000005)).toBe(5);
    });

    it('should return 16 for a "9007199254740991" number size', () => {
      expect(calculateNumberSize(9007199254740991)).toBe(16);
    });

    it('should return 17 for a "-9007199254740991" number size', () => {
      expect(calculateNumberSize(-9007199254740991)).toBe(17);
    });

    it('should return 1 for a "0" number size', () => {
      expect(calculateNumberSize(0)).toBe(1);
    });

    it('should return 15 for a "100000.00000008" number size', () => {
      expect(calculateNumberSize(100000.00000008)).toBe(15);
    });
  });
});
