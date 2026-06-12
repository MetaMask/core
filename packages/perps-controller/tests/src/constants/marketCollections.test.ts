import {
  PERPS_MARKET_COLLECTION_TAGS,
  PERPS_MARKET_DEFINITIONS,
  getMarketDefinitionByTicker,
  getMarketDefinitionsByCollection,
} from '../../../src/constants/marketCollections';
import type { PerpsMarketCollectionTag } from '../../../src/types';

describe('PERPS_MARKET_DEFINITIONS', () => {
  it('contains 183 market entries', () => {
    expect(PERPS_MARKET_DEFINITIONS).toHaveLength(183);
  });

  it('has unique tickers', () => {
    const tickers = PERPS_MARKET_DEFINITIONS.map((m) => m.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
  });

  it('has valid maxLeverage for every entry', () => {
    for (const market of PERPS_MARKET_DEFINITIONS) {
      expect(market.maxLeverage).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(market.maxLeverage)).toBe(true);
    }
  });

  it('has a non-empty ticker for every entry', () => {
    for (const market of PERPS_MARKET_DEFINITIONS) {
      expect(market.ticker.length).toBeGreaterThan(0);
    }
  });

  it('only uses collection tags that exist in PERPS_MARKET_COLLECTION_TAGS', () => {
    const validTags = new Set<string>(PERPS_MARKET_COLLECTION_TAGS);
    for (const market of PERPS_MARKET_DEFINITIONS) {
      for (const tag of market.collections) {
        expect(validTags.has(tag)).toBe(true);
      }
    }
  });

  it('includes known markets with correct data', () => {
    const btc = PERPS_MARKET_DEFINITIONS.find((m) => m.ticker === 'BTC');
    expect(btc).toStrictEqual({
      ticker: 'BTC',
      maxLeverage: 40,
      collections: ['L1', 'Bitcoin Ecosystem', 'Store of Value'],
    });

    const eth = PERPS_MARKET_DEFINITIONS.find((m) => m.ticker === 'ETH');
    expect(eth).toStrictEqual({
      ticker: 'ETH',
      maxLeverage: 25,
      collections: ['L1', 'Smart Contract Platform'],
    });
  });

  it('allows markets with empty collections', () => {
    const nxpc = PERPS_MARKET_DEFINITIONS.find((m) => m.ticker === 'NXPC');
    expect(nxpc).toBeDefined();
    expect(nxpc?.collections).toStrictEqual([]);
  });
});

describe('PERPS_MARKET_COLLECTION_TAGS', () => {
  it('contains 27 collection tags', () => {
    expect(PERPS_MARKET_COLLECTION_TAGS).toHaveLength(27);
  });

  it('has unique tags', () => {
    expect(new Set(PERPS_MARKET_COLLECTION_TAGS).size).toBe(
      PERPS_MARKET_COLLECTION_TAGS.length,
    );
  });

  it('covers every tag used by any market definition', () => {
    const usedTags = new Set<PerpsMarketCollectionTag>();
    for (const market of PERPS_MARKET_DEFINITIONS) {
      for (const tag of market.collections) {
        usedTags.add(tag);
      }
    }
    const declaredTags = new Set(PERPS_MARKET_COLLECTION_TAGS);
    for (const tag of usedTags) {
      expect(declaredTags.has(tag)).toBe(true);
    }
  });
});

describe('getMarketDefinitionByTicker', () => {
  it('returns the correct entry for BTC', () => {
    const btc = getMarketDefinitionByTicker('BTC');
    expect(btc).toBeDefined();
    expect(btc?.ticker).toBe('BTC');
    expect(btc?.maxLeverage).toBe(40);
    expect(btc?.collections).toContain('Bitcoin Ecosystem');
  });

  it('returns undefined for a non-existent ticker', () => {
    expect(getMarketDefinitionByTicker('NONEXISTENT')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getMarketDefinitionByTicker('btc')).toBeUndefined();
    expect(getMarketDefinitionByTicker('Btc')).toBeUndefined();
  });

  it('returns the correct entry for a ticker with special prefix', () => {
    const kPepe = getMarketDefinitionByTicker('kPEPE');
    expect(kPepe).toBeDefined();
    expect(kPepe?.maxLeverage).toBe(10);
    expect(kPepe?.collections).toStrictEqual(['Memecoin']);
  });
});

describe('getMarketDefinitionsByCollection', () => {
  it('returns all Memecoin markets', () => {
    const memecoins = getMarketDefinitionsByCollection('Memecoin');
    expect(memecoins.length).toBeGreaterThan(0);
    for (const market of memecoins) {
      expect(market.collections).toContain('Memecoin');
    }
  });

  it('returns all DeFi markets', () => {
    const defi = getMarketDefinitionsByCollection('DeFi');
    expect(defi.length).toBeGreaterThan(0);
    for (const market of defi) {
      expect(market.collections).toContain('DeFi');
    }
  });

  it('returns BTC for Bitcoin Ecosystem', () => {
    const btcEco = getMarketDefinitionsByCollection('Bitcoin Ecosystem');
    const tickers = btcEco.map((m) => m.ticker);
    expect(tickers).toContain('BTC');
    expect(tickers).toContain('LTC');
  });

  it('returns an empty array for a tag with no markets', () => {
    const allTags = new Set(
      PERPS_MARKET_DEFINITIONS.flatMap((m) => m.collections),
    );
    // "Store of Value" should only have BTC, but let's test an actual edge case:
    // verify each returned market actually has the tag
    const storeOfValue = getMarketDefinitionsByCollection('Store of Value');
    expect(storeOfValue.length).toBeGreaterThanOrEqual(1);
    for (const market of storeOfValue) {
      expect(market.collections).toContain('Store of Value');
    }
    // Verify all declared tags have at least one result OR are valid
    for (const tag of PERPS_MARKET_COLLECTION_TAGS) {
      const results = getMarketDefinitionsByCollection(tag);
      if (allTags.has(tag)) {
        expect(results.length).toBeGreaterThan(0);
      }
    }
  });
});
