import * as util from './utils';

describe('utils', () => {
  describe('normalizeTransactionParams', () => {
    it('ensures data is even length prefixed hex string', () => {
      const output = util.normalizeTransactionParams({
        from: '0xfrom',
        data: '123',
      });
      expect(output.data).toBe('0x0123');
    });
  });

  describe('padHexToEvenLength', () => {
    it('returns same value if already even length and has prefix', () => {
      expect(util.padHexToEvenLength('0x1234')).toBe('0x1234');
    });

    it('returns same value if already even length and no prefix', () => {
      expect(util.padHexToEvenLength('1234')).toBe('1234');
    });

    it('returns padded value if not even length and has prefix', () => {
      expect(util.padHexToEvenLength('0x123')).toBe('0x0123');
    });

    it('returns padded value if not even length and no prefix', () => {
      expect(util.padHexToEvenLength('123')).toBe('0123');
    });
  });
});
