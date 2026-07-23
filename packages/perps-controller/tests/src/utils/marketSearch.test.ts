import type { PerpsMarketData } from '../../../src/types/index.js';
import {
  MarketMatchRank,
  getMarketMatchRank,
  rankMarketsByQuery,
} from '../../../src/utils/marketSearch.js';

/**
 * Build a minimal market fixture. Only `symbol`, `name`, and optional
 * `keywords` drive search; the remaining fields satisfy the PerpsMarketData type.
 *
 * @param symbol - Ticker symbol (bare for crypto, `dex:SYMBOL` for HIP-3).
 * @param name - Human-readable name.
 * @param keywords - Optional keyword array from Terminal API metadata.
 * @returns A PerpsMarketData fixture.
 */
function makeMarket(
  symbol: string,
  name: string,
  keywords?: string[],
): PerpsMarketData {
  return {
    symbol,
    name,
    maxLeverage: '10x',
    price: '$1.00',
    change24h: '$0.00',
    change24hPercent: '0.00%',
    volume: '$0',
    ...(keywords !== undefined && { keywords }),
  };
}

describe('getMarketMatchRank', () => {
  const btc = makeMarket('BTC', 'Bitcoin');

  it('ranks an exact symbol or name match as Exact', () => {
    expect(getMarketMatchRank(btc, 'BTC')).toBe(MarketMatchRank.Exact);
    expect(getMarketMatchRank(btc, 'Bitcoin')).toBe(MarketMatchRank.Exact);
  });

  it('ranks a leading match as Prefix', () => {
    expect(getMarketMatchRank(btc, 'bit')).toBe(MarketMatchRank.Prefix);
    expect(getMarketMatchRank(btc, 'bt')).toBe(MarketMatchRank.Prefix);
  });

  it('ranks an interior match as Substring', () => {
    expect(getMarketMatchRank(btc, 'itco')).toBe(MarketMatchRank.Substring);
  });

  it('is case-insensitive and trims the query', () => {
    expect(getMarketMatchRank(btc, '  BITCOIN  ')).toBe(MarketMatchRank.Exact);
  });

  it('returns null when nothing matches', () => {
    expect(getMarketMatchRank(btc, 'ethereum')).toBeNull();
  });

  it('returns null for an empty or whitespace query', () => {
    expect(getMarketMatchRank(btc, '')).toBeNull();
    expect(getMarketMatchRank(btc, '   ')).toBeNull();
  });

  it('matches HIP-3 markets by name and by symbol substring', () => {
    const tsla = makeMarket('xyz:TSLA', 'Tesla');
    // Full name -> Exact.
    expect(getMarketMatchRank(tsla, 'tesla')).toBe(MarketMatchRank.Exact);
    // Leading fragment of the name -> Prefix.
    expect(getMarketMatchRank(tsla, 'tes')).toBe(MarketMatchRank.Prefix);
    // "tsla" only appears inside the dex-prefixed symbol -> Substring.
    expect(getMarketMatchRank(tsla, 'tsla')).toBe(MarketMatchRank.Substring);
  });
});

describe('rankMarketsByQuery', () => {
  it('returns the markets unchanged for an empty or whitespace query', () => {
    const markets = [
      makeMarket('BTC', 'Bitcoin'),
      makeMarket('ETH', 'Ethereum'),
    ];
    expect(rankMarketsByQuery(markets, '')).toBe(markets);
    expect(rankMarketsByQuery(markets, '   ')).toBe(markets);
  });

  it('drops non-matching markets', () => {
    const markets = [
      makeMarket('BTC', 'Bitcoin'),
      makeMarket('ETH', 'Ethereum'),
    ];
    const result = rankMarketsByQuery(markets, 'bitcoin');
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('BTC');
  });

  it('orders results exact, then prefix, then substring', () => {
    const markets = [
      makeMarket('WETH', 'Wrapped Ether'), // substring of "weth"
      makeMarket('ETHFI', 'Ether.fi'), // prefix of "ethfi"
      makeMarket('ETH', 'Ethereum'), // exact symbol
    ];
    const result = rankMarketsByQuery(markets, 'eth').map(
      (market) => market.symbol,
    );
    expect(result).toStrictEqual(['ETH', 'ETHFI', 'WETH']);
  });

  it('keeps input order for markets sharing the same rank (stable)', () => {
    const markets = [
      makeMarket('BTC', 'Bitcoin'), // name prefix "bit"
      makeMarket('BCH', 'Bitcoin Cash'), // name prefix "bit"
    ];
    const result = rankMarketsByQuery(markets, 'bit').map(
      (market) => market.symbol,
    );
    expect(result).toStrictEqual(['BTC', 'BCH']);
  });

  it('finds markets by human-readable name (the TAT-2413 case)', () => {
    const markets = [
      makeMarket('BTC', 'Bitcoin'),
      makeMarket('xyz:AAPL', 'Apple'),
      makeMarket('xyz:GOLD', 'Gold'),
    ];
    expect(
      rankMarketsByQuery(markets, 'apple').map((market) => market.symbol),
    ).toStrictEqual(['xyz:AAPL']);
    expect(
      rankMarketsByQuery(markets, 'gold').map((market) => market.symbol),
    ).toStrictEqual(['xyz:GOLD']);
  });
});

describe('keyword matching (Terminal API metadata)', () => {
  it('matches against keywords for exact, prefix, and substring', () => {
    const market = makeMarket('BTC', 'Bitcoin', ['layer-1', 'pow', 'defi']);

    expect(getMarketMatchRank(market, 'defi')).toBe(MarketMatchRank.Exact);
    expect(getMarketMatchRank(market, 'layer')).toBe(MarketMatchRank.Prefix);
    expect(getMarketMatchRank(market, 'ayer')).toBe(MarketMatchRank.Substring);
  });

  it('keyword match does not override a better symbol or name match', () => {
    const market = makeMarket('BTC', 'Bitcoin', ['crypto']);
    expect(getMarketMatchRank(market, 'btc')).toBe(MarketMatchRank.Exact);
  });

  it('returns keyword rank when symbol and name do not match', () => {
    const market = makeMarket('BTC', 'Bitcoin', ['digital-gold']);
    expect(getMarketMatchRank(market, 'digital-gold')).toBe(
      MarketMatchRank.Exact,
    );
  });

  it('returns null when keywords also do not match', () => {
    const market = makeMarket('BTC', 'Bitcoin', ['crypto', 'layer-1']);
    expect(getMarketMatchRank(market, 'forex')).toBeNull();
  });

  it('handles markets without keywords gracefully', () => {
    const market = makeMarket('ETH', 'Ethereum');
    expect(getMarketMatchRank(market, 'defi')).toBeNull();
  });

  it('rankMarketsByQuery includes keyword-matched markets', () => {
    const markets = [
      makeMarket('BTC', 'Bitcoin', ['digital-gold']),
      makeMarket('xyz:GOLD', 'Gold'),
      makeMarket('ETH', 'Ethereum'),
    ];

    const result = rankMarketsByQuery(markets, 'gold').map(
      (market) => market.symbol,
    );
    expect(result).toContain('BTC');
    expect(result).toContain('xyz:GOLD');
    expect(result).not.toContain('ETH');
  });
});
