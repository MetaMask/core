import { chainIdToHex, weiToHumanReadable } from './parsing';

describe('parsing utilities', () => {
  describe('weiToHumanReadable', () => {
    it('converts 1 wei to "0.000000000000000001" with 18 decimals', () => {
      expect(weiToHumanReadable('1', 18)).toBe('0.000000000000000001');
    });

    it('converts 1.5 ETH (18 decimals) to "1.5"', () => {
      expect(weiToHumanReadable('1500000000000000000', 18)).toBe('1.5');
    });

    it('converts whole number wei to integer string', () => {
      expect(weiToHumanReadable('1000000000000000000', 18)).toBe('1');
    });

    it('trims trailing zeros in fractional part', () => {
      expect(weiToHumanReadable('1500000000000000000', 18)).toBe('1.5');
      expect(weiToHumanReadable('1005000000000000000', 18)).toBe('1.005');
    });

    it('returns "0" for zero wei', () => {
      expect(weiToHumanReadable('0', 18)).toBe('0');
    });

    it('handles small decimals (e.g. 6)', () => {
      expect(weiToHumanReadable('1500000', 6)).toBe('1.5');
    });

    it('handles single digit wei below one unit', () => {
      expect(weiToHumanReadable('5', 18)).toBe('0.000000000000000005');
    });

    it('accepts bigint and converts to human-readable', () => {
      expect(weiToHumanReadable(1500000000000000000n, 18)).toBe('1.5');
      expect(weiToHumanReadable(0n, 18)).toBe('0');
    });
  });

  describe('chainIdToHex', () => {
    it('converts CAIP-2 eip155:1 to 0x1', () => {
      expect(chainIdToHex('eip155:1')).toBe('0x1');
    });

    it('converts CAIP-2 eip155:137 to 0x89', () => {
      expect(chainIdToHex('eip155:137')).toBe('0x89');
    });

    it('returns hex chain ID unchanged', () => {
      expect(chainIdToHex('0x1')).toBe('0x1');
      expect(chainIdToHex('0x88bb0')).toBe('0x88bb0');
    });

    it('converts CAIP-2 eip155:560048 to 0x88bb0', () => {
      expect(chainIdToHex('eip155:560048')).toBe('0x88bb0');
    });
  });
});
