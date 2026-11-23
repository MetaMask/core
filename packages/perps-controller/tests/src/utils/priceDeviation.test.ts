import { assert, describe, expect, it } from 'vitest';

import {
  getPriceDeviationBand,
  isPriceOutsideDeviationBand,
} from '../../../src/utils/priceDeviation.js';

describe('getPriceDeviationBand', () => {
  it('spans from (1 - limit) times the reference to the reference over it', () => {
    const band = getPriceDeviationBand(2000, 0.95);

    expect(band?.min).toBeCloseTo(100, 9);
    expect(band?.max).toBeCloseTo(40000, 6);
  });

  it.each([
    [0, 0.95],
    [-1, 0.95],
    [Number.NaN, 0.95],
    [2000, 0],
    [2000, 1],
    [2000, Number.NaN],
  ])('returns undefined for reference %d and limit %d', (reference, limit) => {
    expect(getPriceDeviationBand(reference, limit)).toBeUndefined();
  });
});

describe('isPriceOutsideDeviationBand', () => {
  it.each([
    [50, true],
    [150, false],
    [39000, false],
    [41000, true],
  ])('price %d against 2000 at 95%% is outside: %s', (price, expected) => {
    expect(isPriceOutsideDeviationBand(price, 2000, 0.95)).toBe(expected);
  });

  it('keeps both exact bounds inside the band', () => {
    // 1 - 0.95 is just above 0.05 in binary floats.
    expect(isPriceOutsideDeviationBand(100, 2000, 0.95)).toBe(false);
    expect(isPriceOutsideDeviationBand(40000, 2000, 0.95)).toBe(false);
    expect(isPriceOutsideDeviationBand(99.99, 2000, 0.95)).toBe(true);
    expect(isPriceOutsideDeviationBand(40000.01, 2000, 0.95)).toBe(true);
  });

  // 1 / 0.3 rounds up to 3.3333333333333335 as a number.
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
    expect(isPriceOutsideDeviationBand(1, 2000, 1)).toBe(false);
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
