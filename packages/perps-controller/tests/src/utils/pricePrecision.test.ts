import { describe, expect, it } from 'vitest';

import type { PerpsPricePrecision } from '../../../src/types/index.js';
import { formatHyperLiquidPrice } from '../../../src/utils/hyperLiquidAdapter.js';
import { roundPerpsPrice } from '../../../src/utils/pricePrecision.js';

const hyperliquidGrid = (szDecimals: number): PerpsPricePrecision => ({
  type: 'significant_figures',
  maxSignificantFigures: 5,
  maxDecimals: 6 - szDecimals,
});

const lighterGrid: PerpsPricePrecision = {
  type: 'fixed_decimals',
  decimals: 2,
  tickSize: '0.01',
};

describe('roundPerpsPrice', () => {
  it.each([
    ['43251.67', 5],
    [43251, 5],
    ['2.345678', 2],
    [0.000123456, 0],
    ['1234.5678', 1],
    [99.995, 3],
    ['0.123456789', 4],
  ])(
    'matches formatHyperLiquidPrice on a significant_figures grid (%s, szDecimals %d)',
    (price, szDecimals) => {
      expect(
        roundPerpsPrice({ price, pricePrecision: hyperliquidGrid(szDecimals) }),
      ).toBe(formatHyperLiquidPrice({ price, szDecimals }));
    },
  );

  it('rounds half up to the tick on a fixed_decimals grid', () => {
    expect(
      roundPerpsPrice({ price: '43251.675', pricePrecision: lighterGrid }),
    ).toBe('43251.68');
    expect(roundPerpsPrice({ price: 2.344, pricePrecision: lighterGrid })).toBe(
      '2.34',
    );
    expect(roundPerpsPrice({ price: '100', pricePrecision: lighterGrid })).toBe(
      '100',
    );
  });

  it('does not apply the significant-figure cap to a fixed_decimals grid', () => {
    expect(
      roundPerpsPrice({ price: '123456.789', pricePrecision: lighterGrid }),
    ).toBe('123456.79');
  });

  it.each(['', 'abc', '0', '-5', Number.NaN, Number.POSITIVE_INFINITY])(
    'returns undefined for unusable price %s',
    (price) => {
      expect(
        roundPerpsPrice({ price, pricePrecision: lighterGrid }),
      ).toBeUndefined();
      expect(
        roundPerpsPrice({ price, pricePrecision: hyperliquidGrid(2) }),
      ).toBeUndefined();
    },
  );

  it('returns undefined when the price rounds to zero', () => {
    expect(
      roundPerpsPrice({ price: '0.004', pricePrecision: lighterGrid }),
    ).toBeUndefined();
  });

  it('reads a fixed_decimals price from its string on both sides of a half tick', () => {
    const pricePrecision = {
      type: 'fixed_decimals',
      decimals: 2,
      tickSize: '0.01',
    } as const;
    // As a float, 1.004999999999999999 is 1.005 and would round up.
    expect(
      roundPerpsPrice({ price: '1.004999999999999999', pricePrecision }),
    ).toBe('1');
    expect(roundPerpsPrice({ price: '1.005', pricePrecision })).toBe('1.01');
    // Beyond BigNumber's 20-decimal division: still just under a half tick.
    expect(
      roundPerpsPrice({ price: '1.004999999999999999999999', pricePrecision }),
    ).toBe('1');
  });

  it('rounds to a tick that is not a power of ten', () => {
    expect(
      roundPerpsPrice({
        price: '101.3',
        pricePrecision: {
          type: 'fixed_decimals',
          decimals: 1,
          tickSize: '0.5',
        },
      }),
    ).toBe('101.5');
  });

  it('returns undefined for an unusable tick', () => {
    expect(
      roundPerpsPrice({
        price: '101.3',
        pricePrecision: { type: 'fixed_decimals', decimals: 1, tickSize: '0' },
      }),
    ).toBeUndefined();
  });
});
