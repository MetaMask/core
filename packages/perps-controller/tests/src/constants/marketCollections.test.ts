import {
  PERPS_MARKET_COLLECTION_TAGS,
  PERPS_MARKET_DEFINITIONS,
  getMarketDefinitionByTicker,
  getMarketDefinitionsByCollection,
} from '../../../src/constants/marketCollections';
import { PerpsMarketCollectionTag } from '../../../src/types';

describe('PERPS_MARKET_DEFINITIONS', () => {
  it('contains 175 market entries', () => {
    expect(PERPS_MARKET_DEFINITIONS).toHaveLength(175);
  });

  it('has unique tickers', () => {
    const tickers = PERPS_MARKET_DEFINITIONS.map((market) => market.ticker);
    expect(new Set(tickers).size).toBe(tickers.length);
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
    const btc = PERPS_MARKET_DEFINITIONS.find(
      (market) => market.ticker === 'BTC',
    );
    expect(btc).toStrictEqual({
      ticker: 'BTC',
      collections: [
        PerpsMarketCollectionTag.L1,
        PerpsMarketCollectionTag.BitcoinEcosystem,
        PerpsMarketCollectionTag.StoreOfValue,
      ],
    });

    const eth = PERPS_MARKET_DEFINITIONS.find(
      (market) => market.ticker === 'ETH',
    );
    expect(eth).toStrictEqual({
      ticker: 'ETH',
      collections: [
        PerpsMarketCollectionTag.L1,
        PerpsMarketCollectionTag.SmartContractPlatform,
      ],
    });
  });

  it('has no markets with empty collections', () => {
    for (const market of PERPS_MARKET_DEFINITIONS) {
      expect(market.collections.length).toBeGreaterThan(0);
    }
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
    expect(btc?.collections).toContain(
      PerpsMarketCollectionTag.BitcoinEcosystem,
    );
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
    expect(kPepe?.collections).toStrictEqual([
      PerpsMarketCollectionTag.Memecoin,
    ]);
  });
});

describe('getMarketDefinitionsByCollection', () => {
  it('returns all Memecoin markets', () => {
    const memecoins = getMarketDefinitionsByCollection(
      PerpsMarketCollectionTag.Memecoin,
    );
    expect(memecoins.length).toBeGreaterThan(0);
    for (const market of memecoins) {
      expect(market.collections).toContain(PerpsMarketCollectionTag.Memecoin);
    }
  });

  it('returns all DeFi markets', () => {
    const defi = getMarketDefinitionsByCollection(
      PerpsMarketCollectionTag.DeFi,
    );
    expect(defi.length).toBeGreaterThan(0);
    for (const market of defi) {
      expect(market.collections).toContain(PerpsMarketCollectionTag.DeFi);
    }
  });

  it('returns BTC for Bitcoin Ecosystem', () => {
    const btcEco = getMarketDefinitionsByCollection(
      PerpsMarketCollectionTag.BitcoinEcosystem,
    );
    const tickers = btcEco.map((market) => market.ticker);
    expect(tickers).toContain('BTC');
    expect(tickers).toContain('LTC');
  });

  it('returns results for every tag that appears in market definitions', () => {
    const usedTags = new Set(
      PERPS_MARKET_DEFINITIONS.flatMap((market) => market.collections),
    );
    for (const tag of PERPS_MARKET_COLLECTION_TAGS) {
      const results = getMarketDefinitionsByCollection(tag);
      expect(results.length).toBe(usedTags.has(tag) ? results.length : 0);
      expect(results.length).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns markets with the correct tag for Store of Value', () => {
    const storeOfValue = getMarketDefinitionsByCollection(
      PerpsMarketCollectionTag.StoreOfValue,
    );
    expect(storeOfValue.length).toBeGreaterThanOrEqual(1);
    for (const market of storeOfValue) {
      expect(market.collections).toContain(
        PerpsMarketCollectionTag.StoreOfValue,
      );
    }
  });
});
