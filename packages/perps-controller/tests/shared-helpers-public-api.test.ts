import { describe, expect, it } from 'vitest';

// Shared helpers clients used to copy, checked through the package entrypoint
// so a dropped or renamed export fails here.
import { buildProviderCacheKey } from '../src/index.js';

describe('shared Perps helpers public API', () => {
  it('exports buildProviderCacheKey', () => {
    expect(buildProviderCacheKey('hyperliquid', false)).toBe(
      'hyperliquid:mainnet',
    );
    expect(buildProviderCacheKey('hyperliquid', true)).toBe(
      'hyperliquid:testnet',
    );
  });
});
