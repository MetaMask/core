import {
  HYPERLIQUID_ASSET_NAMES,
  HYPERLIQUID_CONFIG,
  getHyperLiquidAssetName,
} from '../../../src/constants/hyperLiquidConfig.js';
import type {
  AllMidsResponse,
  PerpsAssetCtx,
  PerpsUniverse,
} from '../../../src/types/hyperliquid-types.js';
import type { MarketDataFormatters } from '../../../src/types/index.js';
import {
  isMarketTradable,
  transformMarketData,
} from '../../../src/utils/marketDataTransform.js';

// Mock formatters matching the MarketDataFormatters interface
const mockFormatters: MarketDataFormatters = {
  formatVolume: (value: number) => `$${value.toFixed(0)}`,
  formatPerpsFiat: (value: number) => `$${value.toFixed(2)}`,
  formatPercentage: (percent: number) => `${percent.toFixed(2)}%`,
  priceRangesUniversal: [],
};

/**
 * Build a minimal HyperLiquid universe entry. Only the fields read by
 * transformMarketData are meaningful; the rest satisfy the SDK type.
 *
 * @param name - Asset symbol (bare for crypto, `dex:SYMBOL` for HIP-3).
 * @returns A PerpsUniverse fixture.
 */
function makeUniverseEntry(name: string): PerpsUniverse {
  return { name, szDecimals: 2, maxLeverage: 10, marginTableId: 1 };
}

describe('marketDataTransform', () => {
  describe('isMarketTradable', () => {
    it('is tradable when mid and oracle prices are equal', () => {
      expect(isMarketTradable({ midPrice: 50000, oraclePrice: 50000 })).toBe(
        true,
      );
    });

    it('is tradable for small deviations well within the limit', () => {
      // 0.2% deviation
      expect(isMarketTradable({ midPrice: 50100, oraclePrice: 50000 })).toBe(
        true,
      );
    });

    it('is tradable exactly at the deviation limit (inclusive boundary)', () => {
      // 95% above the oracle price -> deviation === limit
      expect(
        isMarketTradable({ midPrice: 50000 * 1.95, oraclePrice: 50000 }),
      ).toBe(true);
    });

    it('is untradable when the mid price is more than 95% above the oracle price', () => {
      // 96% above the oracle price -> deviation > limit
      expect(
        isMarketTradable({ midPrice: 50000 * 1.96, oraclePrice: 50000 }),
      ).toBe(false);
    });

    it('is untradable when the mid price is more than 95% below the oracle price', () => {
      // Mid price near zero relative to oracle -> ~100% deviation
      expect(isMarketTradable({ midPrice: 1, oraclePrice: 50000 })).toBe(false);
    });

    it('respects a custom deviation limit', () => {
      // 20% deviation with a 10% limit -> untradable
      expect(
        isMarketTradable({
          midPrice: 120,
          oraclePrice: 100,
          deviationLimit: 0.1,
        }),
      ).toBe(false);
      // Same deviation with a 50% limit -> tradable
      expect(
        isMarketTradable({
          midPrice: 120,
          oraclePrice: 100,
          deviationLimit: 0.5,
        }),
      ).toBe(true);
    });

    it('uses the HyperLiquid 0.95 default when no limit is provided', () => {
      expect(HYPERLIQUID_CONFIG.OraclePriceDeviationLimit).toBe(0.95);
      // Just over 95% -> untradable with the default limit
      expect(isMarketTradable({ midPrice: 1.96, oraclePrice: 1 })).toBe(false);
    });

    it.each([
      ['mid price undefined', { midPrice: undefined, oraclePrice: 50000 }],
      ['oracle price undefined', { midPrice: 50000, oraclePrice: undefined }],
      ['mid price NaN', { midPrice: NaN, oraclePrice: 50000 }],
      ['oracle price NaN', { midPrice: 50000, oraclePrice: NaN }],
      ['mid price zero', { midPrice: 0, oraclePrice: 50000 }],
      ['oracle price zero', { midPrice: 50000, oraclePrice: 0 }],
      ['oracle price negative', { midPrice: 50000, oraclePrice: -1 }],
    ])('defaults to tradable when %s', (_label, params) => {
      expect(isMarketTradable(params)).toBe(true);
    });
  });
});

describe('getHyperLiquidAssetName', () => {
  it('returns the human-readable name for a mapped main-DEX crypto symbol', () => {
    expect(getHyperLiquidAssetName('BTC')).toBe('Bitcoin');
    expect(getHyperLiquidAssetName('ETH')).toBe('Ethereum');
  });

  it('returns the human-readable name for a mapped HIP-3 symbol', () => {
    expect(getHyperLiquidAssetName('xyz:TSLA')).toBe('Tesla');
    expect(getHyperLiquidAssetName('xyz:GOLD')).toBe('Gold');
  });

  it('falls back to the ticker symbol for an unmapped asset', () => {
    expect(getHyperLiquidAssetName('FOO')).toBe('FOO');
    expect(getHyperLiquidAssetName('unknown:BAR')).toBe('unknown:BAR');
  });

  it('uses an injected name map when provided', () => {
    const names = { BTC: 'Bitcoin Override', NEW: 'Brand New' };
    expect(getHyperLiquidAssetName('BTC', names)).toBe('Bitcoin Override');
    expect(getHyperLiquidAssetName('NEW', names)).toBe('Brand New');
    // Falls back to symbol when missing from the injected map.
    expect(getHyperLiquidAssetName('ETH', names)).toBe('ETH');
  });

  it('maps every bundled symbol to a non-empty name', () => {
    for (const [symbol, name] of Object.entries(HYPERLIQUID_ASSET_NAMES)) {
      expect(typeof symbol).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('transformMarketData - human-readable names', () => {
  it('populates name from the bundled map for crypto and HIP-3 markets', () => {
    const universe: PerpsUniverse[] = [
      makeUniverseEntry('BTC'),
      makeUniverseEntry('xyz:AAPL'),
    ];
    const allMids: AllMidsResponse = { BTC: '50000', 'xyz:AAPL': '200' };

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
    );

    expect(result[0]).toMatchObject({ symbol: 'BTC', name: 'Bitcoin' });
    expect(result[1]).toMatchObject({ symbol: 'xyz:AAPL', name: 'Apple' });
  });

  it('falls back to the symbol when an asset is not mapped', () => {
    const universe: PerpsUniverse[] = [makeUniverseEntry('zzz:UNKNOWN')];
    const allMids: AllMidsResponse = { 'zzz:UNKNOWN': '1' };

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
    );

    expect(result[0]).toMatchObject({
      symbol: 'zzz:UNKNOWN',
      name: 'zzz:UNKNOWN',
    });
  });

  it('respects an injected assetNames map over the bundled defaults', () => {
    const universe: PerpsUniverse[] = [makeUniverseEntry('BTC')];
    const allMids: AllMidsResponse = { BTC: '50000' };

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
      undefined,
      { BTC: 'Custom Bitcoin' },
    );

    expect(result[0].name).toBe('Custom Bitcoin');
  });

  it('still reads asset context data alongside the resolved name', () => {
    const universe: PerpsUniverse[] = [makeUniverseEntry('BTC')];
    const allMids: AllMidsResponse = { BTC: '50000' };
    const assetCtxs = [
      {
        funding: '0.0001',
        openInterest: '1000',
        prevDayPx: '49000',
        dayNtlVlm: '1000000',
        markPx: '50000',
        midPx: '50000',
        oraclePx: '50000',
        premium: '0',
        impactPxs: ['49990', '50010'],
        dayBaseVlm: '20',
      },
    ] as unknown as PerpsAssetCtx[];

    const result = transformMarketData(
      { universe, assetCtxs, allMids },
      mockFormatters,
    );

    expect(result[0].name).toBe('Bitcoin');
    expect(result[0].volume).toBe('$1000000');
  });
});

// Terminal metadata enrichment is handled by MarketDataService.#enrichWithTerminalMetadata
// and tested in MarketDataService.test.ts — not by transformMarketData.
