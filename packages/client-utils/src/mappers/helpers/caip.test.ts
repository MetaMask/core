import {
  formatAddressToAssetId,
  formatChainIdToCaip,
  resolveNativeAssetId,
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

    it('returns undefined for an empty chain id instead of eip155:0', () => {
      expect(formatChainIdToCaip('')).toBeUndefined();
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

    it('returns undefined for native sentinel addresses instead of erc20:0x0', () => {
      expect(
        formatAddressToAssetId(
          '0x0000000000000000000000000000000000000000',
          'eip155:1',
        ),
      ).toBeUndefined();
      expect(formatAddressToAssetId('0x0', 'eip155:4663')).toBeUndefined();
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

  describe('resolveNativeAssetId', () => {
    it('resolves ETH via slip44', () => {
      expect(resolveNativeAssetId('eip155:1', 'ETH')).toBe(
        'eip155:1/slip44:60',
      );
    });

    it('resolves POL via the MATIC slip44 entry', () => {
      expect(resolveNativeAssetId('eip155:137', 'POL')).toBe(
        'eip155:137/slip44:966',
      );
    });

    it('returns undefined without a symbol', () => {
      expect(resolveNativeAssetId('eip155:8453', undefined)).toBeUndefined();
      expect(resolveNativeAssetId('eip155:4663', undefined)).toBeUndefined();
    });

    it('returns undefined for unknown symbols', () => {
      expect(
        resolveNativeAssetId('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'NOPE'),
      ).toBeUndefined();
    });

    it('returns undefined when the chain id cannot be normalized', () => {
      expect(resolveNativeAssetId('0xzzzz', 'ETH')).toBeUndefined();
    });
  });
});
