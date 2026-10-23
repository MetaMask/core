import type { Caip19AssetId } from '../types.js';
import {
  clearNormalizeAssetIdCacheForTesting,
  normalizeAssetId,
} from './normalizeAssetId.js';

describe('normalizeAssetId', () => {
  afterEach(() => {
    clearNormalizeAssetIdCacheForTesting();
  });

  it('checksums EVM ERC-20 asset references', () => {
    const input =
      'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
    const expected =
      'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

    expect(normalizeAssetId(input)).toBe(expected);
  });

  it('returns non-EVM asset IDs unchanged', () => {
    const solanaId =
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;

    expect(normalizeAssetId(solanaId)).toBe(solanaId);
  });

  it('memoizes results for the same asset ID', () => {
    const input =
      'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;

    const first = normalizeAssetId(input);
    const second = normalizeAssetId(input);

    expect(second).toBe(first);
  });
});
