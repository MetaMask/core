import {
  formatAddressToAssetId,
  formatChainIdToCaip,
  getNativeAsset,
} from './caip.js';

describe('caip helpers', () => {
  describe('formatChainIdToCaip', () => {
    it('formats numeric chain ids', () => {
      expect(formatChainIdToCaip(1)).toBe('eip155:1');
    });

    it('returns caip chain ids unchanged', () => {
      expect(formatChainIdToCaip('eip155:8453')).toBe('eip155:8453');
    });

    it('formats hex chain ids', () => {
      expect(formatChainIdToCaip('0x1')).toBe('eip155:1');
    });

    it('returns undefined for invalid hex chain ids', () => {
      expect(formatChainIdToCaip('0xzzzz')).toBeUndefined();
    });

    it('formats decimal string chain ids', () => {
      expect(formatChainIdToCaip('8453')).toBe('eip155:8453');
    });

    it('returns undefined for invalid decimal chain ids', () => {
      expect(formatChainIdToCaip('not-a-number')).toBeUndefined();
    });
  });

  describe('getNativeAsset', () => {
    it('returns native asset metadata for supported chains', () => {
      expect(getNativeAsset('0x1')).toStrictEqual({
        symbol: 'ETH',
        decimals: 18,
        assetId: 'eip155:1/slip44:60',
      });
    });

    it('returns undefined when the chain id cannot be normalized', () => {
      expect(getNativeAsset('0xzzzz')).toBeUndefined();
    });
  });

  describe('formatAddressToAssetId', () => {
    it('returns caip asset ids unchanged', () => {
      expect(
        formatAddressToAssetId(
          'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        ),
      ).toBe('eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('encodes erc20 contract addresses', () => {
      expect(
        formatAddressToAssetId(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          'eip155:1',
        ),
      ).toBe('eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
    });

    it('encodes native token addresses on supported chains', () => {
      expect(
        formatAddressToAssetId(
          '0x0000000000000000000000000000000000000000',
          'eip155:1',
        ),
      ).toBe('eip155:1/slip44:60');
    });

    it('returns undefined when chain id is omitted', () => {
      expect(
        formatAddressToAssetId('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
      ).toBeUndefined();
    });

    it('returns undefined for invalid addresses', () => {
      expect(
        formatAddressToAssetId('not-an-address', 'eip155:1'),
      ).toBeUndefined();
    });

    it('returns undefined when the chain id cannot be normalized', () => {
      expect(
        formatAddressToAssetId(
          '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          '0xzzzz',
        ),
      ).toBeUndefined();
    });
  });
});
