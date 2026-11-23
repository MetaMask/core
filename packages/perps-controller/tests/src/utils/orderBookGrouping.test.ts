import { BigNumber } from 'bignumber.js';
import { describe, expect, it } from 'vitest';

import type { OrderBookLevel } from '../../../src/types/index.js';
import {
  aggregateOrderBookLevels,
  calculateOrderBookAggregationParams,
  calculateOrderBookGroupingOptions,
  calculateOrderBookSpread,
  groupOrderBook,
  selectDefaultOrderBookGrouping,
} from '../../../src/utils/orderBookGrouping.js';

const level = (price: string, size: string): OrderBookLevel => ({
  price,
  size,
  total: '0',
  notional: new BigNumber(price).times(size).toFixed(),
  totalNotional: '0',
});

describe('aggregateOrderBookLevels', () => {
  it('keeps a price that sits on the grid in its own bucket (100.1 at 0.1)', () => {
    expect(
      aggregateOrderBookLevels([level('100.1', '2')], 0.1, 'bid'),
    ).toStrictEqual([
      {
        price: '100.1',
        size: '2',
        total: '2',
        notional: '200.20',
        totalNotional: '200.20',
      },
    ]);
    expect(
      aggregateOrderBookLevels([level('100.1', '2')], 0.1, 'ask')[0].price,
    ).toBe('100.1');
  });

  it.each([
    ['0.3', 0.1, '0.3'],
    ['1.15', 0.05, '1.15'],
    ['0.000003', 0.000001, '0.000003'],
  ])('keeps %s on a %s grid', (price, grouping, expected) => {
    expect(
      aggregateOrderBookLevels([level(price, '1')], grouping, 'bid')[0].price,
    ).toBe(expected);
  });

  it('rounds bids down and asks up to the bucket', () => {
    const levels = [level('100.05', '1')];

    expect(aggregateOrderBookLevels(levels, 0.1, 'bid')[0].price).toBe('100');
    expect(aggregateOrderBookLevels(levels, 0.1, 'ask')[0].price).toBe('100.1');
  });

  it.each([
    ['0.999999999999999999999', 'bid', '0'],
    ['1.000000000000000000001', 'ask', '2'],
    ['-1.000000000000000000001', 'bid', '-2'],
    ['-0.999999999999999999999', 'ask', '0'],
  ] as const)(
    'buckets %s on the %s side without rounding the quotient',
    (price, side, expected) => {
      expect(
        aggregateOrderBookLevels([level(price, '1')], '1', side)[0].price,
      ).toBe(expected);
    },
  );

  it('sums each bucket and rebuilds cumulative totals best price first', () => {
    const bids = aggregateOrderBookLevels(
      [
        level('99.95', '3'),
        level('100.12', '1'),
        level('100.18', '2'),
        level('100.05', '0.5'),
      ],
      0.1,
      'bid',
    );

    expect(
      bids.map(({ price, size, total }) => [price, size, total]),
    ).toStrictEqual([
      ['100.1', '3', '3'],
      ['100', '0.5', '3.5'],
      ['99.9', '3', '6.5'],
    ]);
    expect(bids[0].notional).toBe('300.48');
    expect(bids[2].totalNotional).toBe('650.36');
  });

  it('orders asks from the lowest bucket', () => {
    const asks = aggregateOrderBookLevels(
      [level('101.2', '1'), level('100.01', '2')],
      1,
      'ask',
    );

    expect(asks.map(({ price, total }) => [price, total])).toStrictEqual([
      ['101', '2'],
      ['102', '3'],
    ]);
  });

  it('accepts the grouping as a decimal string', () => {
    expect(
      aggregateOrderBookLevels([level('100.1', '1')], '0.1', 'bid')[0].price,
    ).toBe('100.1');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns the levels unchanged for grouping %s',
    (grouping) => {
      const levels = [level('100.05', '1')];

      expect(aggregateOrderBookLevels(levels, grouping, 'bid')).toStrictEqual(
        levels,
      );
    },
  );

  it('skips a level whose numbers cannot be parsed', () => {
    expect(
      aggregateOrderBookLevels(
        [level('100', '1'), { ...level('101', '1'), size: 'abc' }],
        1,
        'ask',
      ),
    ).toHaveLength(1);
  });

  it('counts price times size for a level whose notional cannot be parsed', () => {
    expect(
      aggregateOrderBookLevels(
        [level('100', '1'), { ...level('100.5', '2'), notional: 'abc' }],
        1,
        'bid',
      ),
    ).toStrictEqual([
      {
        price: '100',
        size: '3',
        total: '3',
        notional: '301.00',
        totalNotional: '301.00',
      },
    ]);
  });

  it('returns an empty side as empty', () => {
    expect(aggregateOrderBookLevels([], 1, 'bid')).toStrictEqual([]);
  });
});

describe('groupOrderBook', () => {
  const book = {
    bids: [level('100.1', '2'), level('100.05', '1'), level('99.2', '4')],
    asks: [level('100.2', '1'), level('100.25', '5')],
  };

  it('regroups both sides, trims them and reports depth-bar denominators', () => {
    const grouped = groupOrderBook(book, 0.1, 2);

    expect(grouped.bids.map(({ price }) => price)).toStrictEqual([
      '100.1',
      '100',
    ]);
    expect(grouped.asks.map(({ price }) => price)).toStrictEqual([
      '100.2',
      '100.3',
    ]);
    expect(grouped.maxTotal).toBe(6);
    expect(grouped.maxSize).toBe(5);
  });

  it('only trims when the grouping is null', () => {
    const grouped = groupOrderBook(book, null, 1);

    expect(grouped.bids).toStrictEqual([book.bids[0]]);
    expect(grouped.asks).toStrictEqual([book.asks[0]]);
    expect(grouped.maxTotal).toBe(0);
    expect(grouped.maxSize).toBe(2);
  });
});

describe('calculateOrderBookGroupingOptions', () => {
  it.each([
    [2450, [0.1, 0.2, 0.5, 1, 10, 100]],
    [98765, [1, 2, 5, 10, 100, 1000]],
    [3.21, [0.0001, 0.0002, 0.0005, 0.001, 0.01, 0.1]],
    [87.6, [0.001, 0.002, 0.005, 0.01, 0.1, 1]],
  ])('builds the ladder for a mid of %d', (mid, expected) => {
    expect(calculateOrderBookGroupingOptions({ midPrice: mid })).toStrictEqual(
      expected,
    );
  });

  it('drops widths that round below six decimals', () => {
    // Base 1e-8: only 100 and 1000 times it survive the rounding.
    expect(
      calculateOrderBookGroupingOptions({ midPrice: 0.00012345 }),
    ).toStrictEqual([0.000001, 0.00001]);
  });

  it('falls back to the smallest price step when every width rounds away', () => {
    expect(
      calculateOrderBookGroupingOptions({ midPrice: 0.0000001 }),
    ).toStrictEqual([0.000001]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns the fallback ladder for mid %d',
    (mid) => {
      expect(
        calculateOrderBookGroupingOptions({ midPrice: mid }),
      ).toStrictEqual([0.01, 0.1, 1]);
    },
  );
});

describe('calculateOrderBookGroupingOptions tick ladder', () => {
  it.each([
    ['BTC', 87000, 1, [1, 2, 5, 10, 20, 50]],
    ['ETH', 2450, 0.1, [0.1, 0.2, 0.5, 1, 2, 5]],
  ])(
    'builds the %s ladder from its tick',
    (_market, midPrice, tickSize, expected) => {
      expect(
        calculateOrderBookGroupingOptions({ midPrice, tickSize }),
      ).toStrictEqual(expected);
      expect(
        calculateOrderBookGroupingOptions({
          midPrice,
          tickSize,
          ladder: 'tick',
        }),
      ).toStrictEqual(expected);
    },
  );

  it('keeps only widths a venue bucket divides into', () => {
    // At 87000, a width of 0.2 streams at five significant figures: 1-wide
    // buckets, so 0.1 to 0.5 cannot be built and only 1 and up remain.
    const options = calculateOrderBookGroupingOptions({
      midPrice: 87000,
      tickSize: 0.1,
    });

    expect(options).toStrictEqual([1, 2, 5]);
    // Each streams in buckets of exactly its own width at 87000.
    expect(
      options.map((option) =>
        calculateOrderBookAggregationParams(option, 87000),
      ),
    ).toStrictEqual([
      { nSigFigs: 5 },
      { nSigFigs: 5, mantissa: 2 },
      { nSigFigs: 5, mantissa: 5 },
    ]);
  });

  it('keeps the decade ladder for a number or ladder: decade', () => {
    expect(calculateOrderBookGroupingOptions(2450)).toStrictEqual([
      0.1, 0.2, 0.5, 1, 10, 100,
    ]);
    expect(
      calculateOrderBookGroupingOptions({
        midPrice: 2450,
        tickSize: 0.1,
        ladder: 'decade',
      }),
    ).toStrictEqual([0.1, 0.2, 0.5, 1, 10, 100]);
  });

  it.each([undefined, 0, -1, Number.NaN])(
    'falls back for the tick ladder without a usable tick (%s)',
    (tickSize) => {
      expect(
        calculateOrderBookGroupingOptions({
          midPrice: 100,
          tickSize,
          ladder: 'tick',
        }),
      ).toStrictEqual([0.01, 0.1, 1]);
    },
  );
});

describe('selectDefaultOrderBookGrouping', () => {
  it('picks the fourth option', () => {
    expect(selectDefaultOrderBookGrouping([0.1, 0.2, 0.5, 1, 10, 100])).toBe(1);
  });

  it('picks the middle option of a shorter ladder', () => {
    expect(selectDefaultOrderBookGrouping([0.01, 0.1, 1])).toBe(0.1);
  });

  it('returns undefined for no options', () => {
    expect(selectDefaultOrderBookGrouping([])).toBeUndefined();
  });
});

describe('calculateOrderBookAggregationParams', () => {
  it.each([
    [0.1, 2450, { nSigFigs: 5 }],
    [0.2, 2450, { nSigFigs: 5, mantissa: 2 }],
    [0.5, 2450, { nSigFigs: 5, mantissa: 5 }],
    [1, 2450, { nSigFigs: 4 }],
    [10, 2450, { nSigFigs: 3 }],
    [100, 2450, { nSigFigs: 2 }],
    [1000, 2450, { nSigFigs: 2 }],
  ])('maps grouping %d at %d', (grouping, price, expected) => {
    expect(calculateOrderBookAggregationParams(grouping, price)).toStrictEqual(
      expected,
    );
  });

  it.each([
    [0, 100],
    [1, 0],
    [Number.NaN, 100],
    [1, Number.NaN],
    [-1, 100],
  ])(
    'uses five significant figures for unusable input (%d, %d)',
    (grouping, price) => {
      expect(
        calculateOrderBookAggregationParams(grouping, price),
      ).toStrictEqual({
        nSigFigs: 5,
      });
    },
  );
});

describe('calculateOrderBookSpread', () => {
  it('computes spread, mid and percent without float noise', () => {
    expect(
      calculateOrderBookSpread({ bestBid: '99.9', bestAsk: '100.1' }),
    ).toStrictEqual({ spread: 0.2, midPrice: 100, spreadPercentage: 0.2 });
  });

  it('accepts numbers', () => {
    expect(calculateOrderBookSpread({ bestBid: 1, bestAsk: 3 })).toStrictEqual({
      spread: 2,
      midPrice: 2,
      spreadPercentage: 100,
    });
  });

  it.each([
    [undefined, '100'],
    ['100', undefined],
    ['0', '100'],
    ['abc', '100'],
    ['100', '-1'],
  ])('returns undefined for bid %s and ask %s', (bestBid, bestAsk) => {
    expect(calculateOrderBookSpread({ bestBid, bestAsk })).toBeUndefined();
  });
});
