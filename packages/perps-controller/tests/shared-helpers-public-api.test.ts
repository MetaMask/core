import { describe, expect, it } from 'vitest';

// Shared helpers clients used to copy, checked through the package entrypoint
// so a dropped or renamed export fails here.
import { buildProviderCacheKey, roundPerpsPrice } from '../src/index.js';

describe('shared Perps helpers public API', () => {
  it('exports buildProviderCacheKey', () => {
    expect(buildProviderCacheKey('hyperliquid', false)).toBe(
      'hyperliquid:mainnet',
    );
    expect(buildProviderCacheKey('hyperliquid', true)).toBe(
      'hyperliquid:testnet',
    );
  });

  it('exports roundPerpsPrice', () => {
    expect(
      roundPerpsPrice({
        price: '2.345678',
        pricePrecision: {
          type: 'fixed_decimals',
          decimals: 2,
          tickSize: '0.01',
        },
      }),
    ).toBe('2.35');
  });
});
