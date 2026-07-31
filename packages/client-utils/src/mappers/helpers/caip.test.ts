import { getChainById } from 'eth-chainlist';

import {
  formatAddressToAssetId,
  formatChainIdToCaip,
  getNativeAsset,
  resolveNativeAssetId,
} from './caip.js';

jest.mock('eth-chainlist', () => ({
  ...jest.requireActual('eth-chainlist'),
  getChainById: jest.fn(),
}));

const mockGetChainById = jest.mocked(getChainById);

describe('caip helpers', () => {
  beforeEach(() => {
    mockGetChainById.mockImplementation(
      jest.requireActual('eth-chainlist').getChainById,
    );
  });

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

  describe('getNativeAsset', () => {
    it('resolves mainnet native asset from chainlist slip44', () => {
      expect(getNativeAsset('eip155:1')).toStrictEqual({
        symbol: 'ETH',
        decimals: 18,
        assetId: 'eip155:1/slip44:60',
      });
    });

    it('resolves arbitrum native asset via symbol fallback when chainlist omits slip44', () => {
      expect(getNativeAsset('eip155:42161')).toStrictEqual({
        symbol: 'ETH',
        decimals: 18,
        assetId: 'eip155:42161/slip44:60',
      });
    });

    it('ignores chainlist testnet slip44:1 and uses the native symbol coin type', () => {
      expect(getNativeAsset('eip155:11155111')).toStrictEqual({
        symbol: 'ETH',
        decimals: 18,
        assetId: 'eip155:11155111/slip44:60',
      });
    });

    it('prefers chainlist slip44 over the slip44 registry symbol mapping', () => {
      expect(getNativeAsset('eip155:43114')).toStrictEqual({
        symbol: 'AVAX',
        decimals: 18,
        assetId: 'eip155:43114/slip44:9005',
      });
    });

    it('returns undefined for unknown chains', () => {
      expect(getNativeAsset('eip155:999999991')).toBeUndefined();
    });

    it('returns undefined for non-eip155 chain ids', () => {
      expect(
        getNativeAsset('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
      ).toBeUndefined();
    });

    it('returns undefined when chainlist omits native currency symbol', () => {
      mockGetChainById.mockReturnValue({
        slip44: 60,
        nativeCurrency: { name: 'Ether', decimals: 18 },
      } as ReturnType<typeof getChainById>);

      expect(getNativeAsset('eip155:1')).toBeUndefined();
    });

    it('returns undefined when slip44 and symbol lookup both fail', () => {
      expect(getNativeAsset('eip155:1088')).toBeUndefined();
    });
  });
});
