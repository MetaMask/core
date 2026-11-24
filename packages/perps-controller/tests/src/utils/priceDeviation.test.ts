import { assert, describe, expect, it } from 'vitest';

import { isMarketTradable } from '../../../src/utils/marketDataTransform.js';
import {
  getPriceDeviationBand,
  isPriceOutsideDeviationBand,
} from '../../../src/utils/priceDeviation.js';

describe('getPriceDeviationBand', () => {
  it('spans limit times the reference on either side of it', () => {
    expect(getPriceDeviationBand(2000, 0.95)).toStrictEqual({
      min: 100,
      max: 3900,
    });
  });

  it('never reports a negative lower bound', () => {
    expect(getPriceDeviationBand(2000, 1.5)).toStrictEqual({
      min: 0,
      max: 5000,
    });
  });

  it.each([
    [0, 0.95],
    [-1, 0.95],
    [Number.NaN, 0.95],
    [2000, 0],
    [2000, -0.5],
    [2000, Number.NaN],
  ])('returns undefined for reference %d and limit %d', (reference, limit) => {
    expect(getPriceDeviationBand(reference, limit)).toBeUndefined();
  });
});

describe('isPriceOutsideDeviationBand', () => {
  it.each([
    [50, true],
    [150, false],
    [3800, false],
    [5000, true],
  ])('price %d against 2000 at 95%% is outside: %s', (price, expected) => {
    expect(isPriceOutsideDeviationBand(price, 2000, 0.95)).toBe(expected);
  });

  it('keeps both exact bounds inside the band', () => {
    // 1 - 0.95 is just above 0.05 in binary floats.
    expect(isPriceOutsideDeviationBand(100, 2000, 0.95)).toBe(false);
    expect(isPriceOutsideDeviationBand(3900, 2000, 0.95)).toBe(false);
    expect(isPriceOutsideDeviationBand(99.99, 2000, 0.95)).toBe(true);
    expect(isPriceOutsideDeviationBand(3900.01, 2000, 0.95)).toBe(true);
  });

  it.each([
    [1, 0.7],
    [2000, 0.95],
    [3, 0.9],
  ])(
    'keeps the bounds getPriceDeviationBand returns inside the band (%d, %d)',
    (reference, limit) => {
      const band = getPriceDeviationBand(reference, limit);
      assert(band);

      expect(isPriceOutsideDeviationBand(band.min, reference, limit)).toBe(
        false,
      );
      expect(isPriceOutsideDeviationBand(band.max, reference, limit)).toBe(
        false,
      );
    },
  );

  it('never blocks on an unusable limit', () => {
    expect(isPriceOutsideDeviationBand(1, 2000, 0)).toBe(false);
    expect(isPriceOutsideDeviationBand(1, 2000, Number.NaN)).toBe(false);
  });

  it.each([
    [Number.NaN, 2000],
    [0, 2000],
    [100, 0],
    [100, Number.NaN],
  ])(
    'never blocks on unusable price %d or reference %d',
    (price, reference) => {
      expect(isPriceOutsideDeviationBand(price, reference, 0.95)).toBe(false);
    },
  );
});

describe('isMarketTradable and the deviation band', () => {
  it.each([0.04, 0.05, 1, 1.95, 1.96, 2.5])(
    'agree for a price %d times the oracle',
    (multiple) => {
      const oraclePrice = 2000;
      const midPrice = oraclePrice * multiple;

      expect(isMarketTradable({ midPrice, oraclePrice })).toBe(
        !isPriceOutsideDeviationBand(midPrice, oraclePrice, 0.95),
      );
    },
  );

  it('reads a market 2.5 times its oracle as untradable and outside the band', () => {
    expect(isMarketTradable({ midPrice: 5000, oraclePrice: 2000 })).toBe(false);
    expect(isPriceOutsideDeviationBand(5000, 2000, 0.95)).toBe(true);
  });
});
