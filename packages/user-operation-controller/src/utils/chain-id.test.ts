import { toEip155ChainId } from './chain-id';

describe('chain-id', () => {
  describe('toEip155ChainId', () => {
    it('converts hex to integer number', () => {
      expect(toEip155ChainId('0x1')).toBe('1');
    });

    it('converts integer number back to their original reprensentation', () => {
      expect(toEip155ChainId('1')).toBe('1');
    });

    it("uses the original chain id if it's not a number", () => {
      const chainId = 'not-a-number';
      expect(toEip155ChainId(chainId)).toBe(chainId);
    });
  });
});
