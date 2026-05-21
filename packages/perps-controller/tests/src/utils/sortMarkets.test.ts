import { MARKET_SORTING_CONFIG } from '../../../src/constants/perpsConfig';
import type { PerpsMarketData } from '../../../src/types';
import { parseVolume, sortMarkets } from '../../../src/utils/sortMarkets';

const market = (overrides: Partial<PerpsMarketData>): PerpsMarketData =>
  ({
    name: 'BTC',
    symbol: 'BTC',
    price: '50000',
    volume: '$1M',
    openInterest: '$1M',
    change24hPercent: '+1.00%',
    fundingRate: 0,
    ...overrides,
  }) as PerpsMarketData;

describe('sortMarkets utilities', () => {
  describe('parseVolume', () => {
    it.each([
      [undefined, -1],
      ['-', -1],
      ['$<1', 0.5],
      ['$1.5K', 1_500],
      ['$2.25M', 2_250_000],
      ['$3.5B', 3_500_000_000],
      ['$4T', 4_000_000_000_000],
      ['$1,234.56', 1234.56],
      ['not-a-number', -1],
    ])('parses %s as %s', (input, expected) => {
      expect(parseVolume(input)).toBe(expected);
    });
  });

  it('sorts by volume descending by default without mutating input', () => {
    const markets = [
      market({ name: 'low', volume: '$1M' }),
      market({ name: 'high', volume: '$2M' }),
    ];

    const result = sortMarkets({
      markets,
      sortBy: MARKET_SORTING_CONFIG.SortFields.Volume,
    });

    expect(result.map(({ name }) => name)).toStrictEqual(['high', 'low']);
    expect(markets.map(({ name }) => name)).toStrictEqual(['low', 'high']);
  });

  it('sorts price change, funding rate, and open interest ascending', () => {
    const markets = [
      market({
        name: 'a',
        change24hPercent: '+10.00%',
        fundingRate: 0.02,
        openInterest: '$3M',
      }),
      market({
        name: 'b',
        change24hPercent: '-5.00%',
        fundingRate: -0.01,
        openInterest: '$1M',
      }),
    ];

    expect(
      sortMarkets({
        markets,
        sortBy: MARKET_SORTING_CONFIG.SortFields.PriceChange,
        direction: 'asc',
      }).map(({ name }) => name),
    ).toStrictEqual(['b', 'a']);
    expect(
      sortMarkets({
        markets,
        sortBy: MARKET_SORTING_CONFIG.SortFields.FundingRate,
        direction: 'asc',
      }).map(({ name }) => name),
    ).toStrictEqual(['b', 'a']);
    expect(
      sortMarkets({
        markets,
        sortBy: MARKET_SORTING_CONFIG.SortFields.OpenInterest,
        direction: 'asc',
      }).map(({ name }) => name),
    ).toStrictEqual(['b', 'a']);
  });
});
