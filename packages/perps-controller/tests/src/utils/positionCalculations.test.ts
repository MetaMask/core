import { describe, expect, it } from 'vitest';

import type { Position } from '../../../src/types/index.js';
import {
  getPositionDirection,
  recomputePositionAtPrice,
} from '../../../src/utils/positionCalculations.js';

describe('getPositionDirection', () => {
  it.each([
    ['1.5', 'long'],
    [2, 'long'],
    ['-0.2', 'short'],
    [-3, 'short'],
  ])('reads %s as %s', (size, expected) => {
    expect(getPositionDirection(size)).toBe(expected);
  });

  it.each(['0', 0, '-0', '', 'abc', Number.NaN, Number.POSITIVE_INFINITY])(
    'returns undefined for %s',
    (size) => {
      expect(getPositionDirection(size)).toBeUndefined();
    },
  );
});

describe('recomputePositionAtPrice', () => {
  const position: Position = {
    symbol: 'ETH',
    size: '-2.5',
    entryPrice: '2000',
    positionValue: '5000',
    unrealizedPnl: '0',
    marginUsed: '1000',
    leverage: { type: 'cross', value: 5 },
    liquidationPrice: '2600',
    maxLeverage: 25,
    returnOnEquity: '0',
    cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
    takeProfitCount: 0,
    stopLossCount: 0,
  };

  it('revalues a short at the live price', () => {
    expect(recomputePositionAtPrice(position, 1900)).toStrictEqual({
      ...position,
      unrealizedPnl: '250',
      returnOnEquity: '0.25',
      positionValue: '4750',
    });
  });

  it('revalues a long at a string price', () => {
    const long = {
      ...position,
      size: '1',
      leverage: { type: 'isolated' as const, value: 10 },
    };

    expect(recomputePositionAtPrice(long, '2100')).toMatchObject({
      unrealizedPnl: '100',
      returnOnEquity: '0.5',
      positionValue: '2100',
    });
  });

  it('keeps the venue return on equity while leverage is unreported', () => {
    const unreported = {
      ...position,
      returnOnEquity: '0.1',
      leverage: { type: 'cross' as const },
    };

    expect(recomputePositionAtPrice(unreported, 1900)).toMatchObject({
      unrealizedPnl: '250',
      returnOnEquity: '0.1',
      positionValue: '4750',
    });
  });

  it.each([
    ['an unreadable price', position, 'abc'],
    ['a zero price', position, 0],
    ['an unreadable entry price', { ...position, entryPrice: 'x' }, 1900],
    ['a zero size', { ...position, size: '0' }, 1900],
  ])('returns the same position for %s', (_label, input, price) => {
    expect(recomputePositionAtPrice(input, price)).toBe(input);
  });
});
