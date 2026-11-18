import { BigNumber } from 'bignumber.js';
import { describe, expect, it } from 'vitest';

import type { OrderBookLevel } from '../../../src/types/index.js';
import {
  aggregateOrderBookLevels,
  groupOrderBook,
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
