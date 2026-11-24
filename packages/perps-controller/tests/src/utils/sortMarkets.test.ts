import { describe, expect, it } from 'vitest';

import { MARKET_SORTING_CONFIG } from '../../../src/constants/perpsConfig.js';
import type { PerpsMarketData } from '../../../src/types/index.js';
import { parseVolume, sortMarkets } from '../../../src/utils/sortMarkets.js';

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

  it('sorts on numeric values instead of the display strings', () => {
    const markets = [
      market({
        name: 'a',
        volume: '$1.5M',
        numericValues: { volume: 1_400_000 },
      }),
      market({
        name: 'b',
        volume: '$1.5M',
        numericValues: { volume: 1_450_000 },
      }),
    ];

    expect(
      sortMarkets({ markets, sortBy: 'volume' }).map(({ name }) => name),
    ).toStrictEqual(['b', 'a']);
  });

  it.each([
    ['asc', ['low', 'high', 'missing']],
    ['desc', ['high', 'low', 'missing']],
  ] as const)(
    'sorts markets without a value last when %s',
    (direction, expected) => {
      const markets = [
        market({ name: 'missing', numericValues: {}, volume: '-' }),
        market({ name: 'low', numericValues: { volume: 1 } }),
        market({ name: 'high', numericValues: { volume: 2 } }),
      ];

      expect(
        sortMarkets({ markets, sortBy: 'volume', direction }).map(
          ({ name }) => name,
        ),
      ).toStrictEqual(expected);
    },
  );

  it('sorts funding rate and price change with missing values last', () => {
    const markets = [
      market({
        name: 'none',
        fundingRate: undefined,
        change24hPercent: 'n/a',
      }),
      market({ name: 'negative', fundingRate: -0.01, change24hPercent: '-2%' }),
    ];

    expect(
      sortMarkets({ markets, sortBy: 'fundingRate', direction: 'asc' }).map(
        ({ name }) => name,
      ),
    ).toStrictEqual(['negative', 'none']);
    expect(
      sortMarkets({ markets, sortBy: 'priceChange', direction: 'asc' }).map(
        ({ name }) => name,
      ),
    ).toStrictEqual(['negative', 'none']);
  });

  it('sorts by price from numeric values or the display price', () => {
    const markets = [
      market({ name: 'display', price: '$1,200.50' }),
      market({ name: 'numeric', price: '$9', numericValues: { price: 900 } }),
      market({ name: 'missing', price: '-' }),
    ];

    expect(
      sortMarkets({ markets, sortBy: 'price' }).map(({ name }) => name),
    ).toStrictEqual(['display', 'numeric', 'missing']);
  });

  it('sorts by display symbol, case-insensitive, then full symbol', () => {
    const markets = [
      market({ name: 'Bitcoin', symbol: 'xyz:BTC' }),
      market({ name: 'Arbitrum', symbol: 'arb' }),
      market({ name: 'Bitcoin', symbol: 'BTC' }),
      market({ name: 'Apple', symbol: 'xyz:AAPL' }),
    ];

    expect(
      sortMarkets({ markets, sortBy: 'name', direction: 'asc' }).map(
        ({ symbol }) => symbol,
      ),
    ).toStrictEqual(['xyz:AAPL', 'arb', 'BTC', 'xyz:BTC']);
  });

  it('sorts identically formatted volumes by their raw value', () => {
    const markets = [
      market({ name: 'a', volume: '$1.5M', numericValues: { volume: 1.5e6 } }),
      market({ name: 'b', volume: '$1.5M', numericValues: { volume: 1.54e6 } }),
    ];

    expect(
      sortMarkets({
        markets,
        sortBy: 'volume',
        direction: 'asc',
        missing: 'last',
      }).map(({ name }) => name),
    ).toStrictEqual(['a', 'b']);
  });

  it.each([
    ['asc', 'priceChange', ['low', 'high', 'hlNoPrice', 'hlNaN', 'lighter']],
    ['desc', 'priceChange', ['high', 'low', 'hlNoPrice', 'hlNaN', 'lighter']],
    ['asc', 'price', ['low', 'high', 'hlNoPrice', 'hlNaN', 'lighter']],
    ['desc', 'price', ['high', 'low', 'hlNoPrice', 'hlNaN', 'lighter']],
  ] as const)(
    'ignores producer placeholders when numeric values exist (%s %s)',
    (direction, sortBy, expected) => {
      const markets = [
        market({
          name: 'hlNoPrice',
          price: '$0',
          change24hPercent: '-100.00%',
          numericValues: {},
        }),
        market({
          name: 'hlNaN',
          price: '$0',
          change24hPercent: '0.00%',
          numericValues: {},
        }),
        market({
          name: 'lighter',
          price: '$0',
          change24hPercent: '+0.00%',
          numericValues: {},
        }),
        market({
          name: 'low',
          numericValues: { price: 1, change24hPercent: -5 },
        }),
        market({
          name: 'high',
          numericValues: { price: 2, change24hPercent: 5 },
        }),
      ];

      expect(
        sortMarkets({ markets, sortBy, direction }).map(({ name }) => name),
      ).toStrictEqual(expected);
    },
  );

  it('sorts a non-finite numeric price change last', () => {
    const markets = [
      market({ name: 'nan', numericValues: { change24hPercent: Number.NaN } }),
      market({
        name: 'infinite',
        numericValues: { change24hPercent: Number.POSITIVE_INFINITY },
      }),
      market({ name: 'finite', numericValues: { change24hPercent: -1 } }),
    ];

    expect(
      sortMarkets({ markets, sortBy: 'priceChange' }).map(({ name }) => name),
    ).toStrictEqual(['finite', 'nan', 'infinite']);
  });

  it('sorts by name ascending when no direction is given', () => {
    const markets = [
      market({ name: 'Ethereum', symbol: 'ETH' }),
      market({ name: 'Bitcoin', symbol: 'BTC' }),
    ];

    expect(
      sortMarkets({ markets, sortBy: 'name' }).map(({ symbol }) => symbol),
    ).toStrictEqual(['BTC', 'ETH']);
    expect(
      sortMarkets({ markets, sortBy: 'name', direction: 'desc' }).map(
        ({ symbol }) => symbol,
      ),
    ).toStrictEqual(['ETH', 'BTC']);
  });

  it.each(['asc', 'desc'] as const)(
    "puts markets without a value last with missing: 'last' (%s)",
    (direction) => {
      const markets = [
        market({ name: 'missing', numericValues: {}, volume: '-' }),
        market({ name: 'present', numericValues: { volume: 1 } }),
      ];

      expect(
        sortMarkets({
          markets,
          sortBy: 'volume',
          direction,
          missing: 'last',
        }).map(({ name }) => name),
      ).toStrictEqual(['present', 'missing']);
    },
  );
});
