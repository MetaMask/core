import { sumHexes } from '.';

describe('Bridge utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sumHexes', () => {
    it('returns 0x0 for empty input', () => {
      expect(sumHexes()).toBe('0x0');
    });

    it('returns same value for single input', () => {
      expect(sumHexes('0xff')).toBe('0xff');
      expect(sumHexes('0x0')).toBe('0x0');
      expect(sumHexes('0x1')).toBe('0x1');
    });

    it('correctly sums two hex values', () => {
      expect(sumHexes('0x1', '0x1')).toBe('0x2');
      expect(sumHexes('0xff', '0x1')).toBe('0x100');
      expect(sumHexes('0x0', '0xff')).toBe('0xff');
    });

    it('correctly sums multiple hex values', () => {
      expect(sumHexes('0x1', '0x2', '0x3')).toBe('0x6');
      expect(sumHexes('0xff', '0xff', '0x2')).toBe('0x200');
      expect(sumHexes('0x0', '0x0', '0x0')).toBe('0x0');
    });

    it('handles large numbers', () => {
      expect(sumHexes('0xffffffff', '0x1')).toBe('0x100000000');
      expect(sumHexes('0xffffffff', '0xffffffff')).toBe('0x1fffffffe');
    });

    it('throws for invalid hex strings', () => {
      expect(() => sumHexes('0xg')).toThrow('Cannot convert 0xg to a BigInt');
    });
  });
});
