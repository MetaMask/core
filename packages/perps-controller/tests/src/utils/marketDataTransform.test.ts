import {
  HYPERLIQUID_ASSET_NAMES,
  getHyperLiquidAssetName,
} from '../../../src/constants/hyperLiquidConfig';
import type { TerminalAssetMetadata } from '../../../src/services/TerminalMarketService';
import type { MarketDataFormatters, MarketType } from '../../../src/types';
import type {
  AllMidsResponse,
  PerpsAssetCtx,
  PerpsUniverse,
} from '../../../src/types/hyperliquid-types';
import { transformMarketData } from '../../../src/utils/marketDataTransform';

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

describe('transformMarketData - terminal metadata', () => {
  it('overrides name and marketType from terminal metadata', () => {
    const universe: PerpsUniverse[] = [
      makeUniverseEntry('BTC'),
      makeUniverseEntry('xyz:TSLA'),
    ];
    const allMids: AllMidsResponse = { BTC: '50000', 'xyz:TSLA': '200' };
    const staticMarketTypes: Record<string, MarketType> = {
      'xyz:TSLA': 'stock',
    };

    const terminalMeta = new Map<string, TerminalAssetMetadata>([
      ['BTC', { name: 'Bitcoin (Terminal)', marketType: 'crypto' }],
      ['xyz:TSLA', { name: 'Tesla Inc.', marketType: 'stock' }],
    ]);

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
      staticMarketTypes,
      undefined,
      terminalMeta,
    );

    expect(result[0]).toMatchObject({
      symbol: 'BTC',
      name: 'Bitcoin (Terminal)',
      marketType: 'crypto',
    });
    expect(result[1]).toMatchObject({
      symbol: 'xyz:TSLA',
      name: 'Tesla Inc.',
      marketType: 'stock',
    });
  });

  it('carries keywords, tags, and categories from terminal metadata', () => {
    const universe: PerpsUniverse[] = [makeUniverseEntry('BTC')];
    const allMids: AllMidsResponse = { BTC: '50000' };

    const terminalMeta = new Map<string, TerminalAssetMetadata>([
      [
        'BTC',
        {
          name: 'Bitcoin',
          keywords: ['crypto', 'layer-1', 'pow'],
          tags: ['top-10', 'blue-chip'],
          categories: ['crypto', 'major'],
        },
      ],
    ]);

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
      undefined,
      undefined,
      terminalMeta,
    );

    expect(result[0]?.keywords).toStrictEqual(['crypto', 'layer-1', 'pow']);
    expect(result[0]?.tags).toStrictEqual(['top-10', 'blue-chip']);
    expect(result[0]?.categories).toStrictEqual(['crypto', 'major']);
  });

  it('falls back to static maps when symbol is absent from terminal metadata', () => {
    const universe: PerpsUniverse[] = [
      makeUniverseEntry('BTC'),
      makeUniverseEntry('UNMAPPED'),
    ];
    const allMids: AllMidsResponse = { BTC: '50000', UNMAPPED: '10' };

    const terminalMeta = new Map<string, TerminalAssetMetadata>([
      ['BTC', { name: 'Bitcoin (Terminal)' }],
    ]);

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
      undefined,
      { BTC: 'Bitcoin Static' },
      terminalMeta,
    );

    expect(result[0]?.name).toBe('Bitcoin (Terminal)');
    expect(result[1]?.name).toBe('UNMAPPED');
    expect(result[1]?.keywords).toBeUndefined();
  });

  it('terminal marketType takes priority over static assetMarketTypes', () => {
    const universe: PerpsUniverse[] = [makeUniverseEntry('xyz:GOLD')];
    const allMids: AllMidsResponse = { 'xyz:GOLD': '2000' };
    const staticTypes: Record<string, MarketType> = {
      'xyz:GOLD': 'commodity',
    };

    const terminalMeta = new Map<string, TerminalAssetMetadata>([
      ['xyz:GOLD', { name: 'Gold', marketType: 'commodity' }],
    ]);

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
      staticTypes,
      undefined,
      terminalMeta,
    );

    expect(result[0]?.marketType).toBe('commodity');
    expect(result[0]?.isNewMarket).toBe(false);
  });

  it('does not add keywords/tags/categories when terminal metadata has none', () => {
    const universe: PerpsUniverse[] = [makeUniverseEntry('ETH')];
    const allMids: AllMidsResponse = { ETH: '3000' };

    const terminalMeta = new Map<string, TerminalAssetMetadata>([
      ['ETH', { name: 'Ethereum' }],
    ]);

    const result = transformMarketData(
      { universe, assetCtxs: [], allMids },
      mockFormatters,
      undefined,
      undefined,
      terminalMeta,
    );

    expect(result[0]?.name).toBe('Ethereum');
    expect(result[0]?.keywords).toBeUndefined();
    expect(result[0]?.tags).toBeUndefined();
    expect(result[0]?.categories).toBeUndefined();
  });
});
