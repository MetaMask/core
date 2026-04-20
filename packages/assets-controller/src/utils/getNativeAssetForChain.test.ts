import type { CaipChainId } from '@metamask/utils';

import { getNativeAssetForChain } from './getNativeAssetForChain';

describe('getNativeAssetForChain', () => {
  it('returns the native assetId for Ethereum mainnet', () => {
    expect(getNativeAssetForChain('eip155:1')).toBe('eip155:1/slip44:60');
  });

  it('returns the native assetId for Ethereum mainnet when using hex chainId', () => {
    expect(getNativeAssetForChain('0x1')).toBe('eip155:1/slip44:60');
  });

  it('returns the native assetId for evm chain in which asset is not ETH', () => {
    expect(getNativeAssetForChain('eip155:137')).toBe('eip155:137/slip44:966');
  });

  it('returns the native assetId for evm chain in which the asset is not slip44', () => {
    expect(getNativeAssetForChain('eip155:97741')).toBe(
      'eip155:97741/erc20:0x0000000000000000000000000000000000000000',
    );
  });

  it('returns undefined for an unknown chain', () => {
    expect(
      getNativeAssetForChain('eip155:999999' as CaipChainId),
    ).toBeUndefined();
  });

  describe('with knownNativeAssets', () => {
    const knownNativeAssets: Record<string, string> = {
      'eip155:1': 'eip155:1/slip44:60',
      'eip155:42161': 'eip155:42161/slip44:60',
    };

    it('returns asset from knownNativeAssets when available', () => {
      expect(getNativeAssetForChain('eip155:1', knownNativeAssets)).toBe(
        'eip155:1/slip44:60',
      );
    });

    it('falls back to SPOT_PRICES_SUPPORT_INFO when not in knownNativeAssets', () => {
      expect(getNativeAssetForChain('eip155:137', knownNativeAssets)).toBe(
        'eip155:137/slip44:966',
      );
    });

    it('returns undefined for unknown chain even with knownNativeAssets', () => {
      expect(
        getNativeAssetForChain('eip155:999999' as CaipChainId, knownNativeAssets),
      ).toBeUndefined();
    });

    it('ignores knownNativeAssets for hex chain IDs (no CAIP-2 key available)', () => {
      expect(getNativeAssetForChain('0x1', knownNativeAssets)).toBe(
        'eip155:1/slip44:60',
      );
    });
  });
});
