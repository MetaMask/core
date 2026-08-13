import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  computeChaseQuotePrice,
  computeScalePriceLadder,
  getPriceTick,
  splitScaleSizes,
} from '../../../src/utils/orderCalculations.js';

describe('orderCalculations - scale ladder', () => {
  describe('computeScalePriceLadder', () => {
    it('spreads the rungs evenly and lands on both bounds', () => {
      expect(
        computeScalePriceLadder({ minPrice: 2000, maxPrice: 3000, count: 3 }),
      ).toStrictEqual([2000, 2500, 3000]);
    });

    it('places exactly the requested number of rungs', () => {
      expect(
        computeScalePriceLadder({ minPrice: 100, maxPrice: 200, count: 5 }),
      ).toStrictEqual([100, 125, 150, 175, 200]);
    });

    it('lands exactly on maxPrice where accumulation would drift', () => {
      const ladder = computeScalePriceLadder({
        minPrice: 0.1,
        maxPrice: 0.4,
        count: 4,
      });

      expect(ladder[0]).toBe(0.1);
      expect(ladder[ladder.length - 1]).toBe(0.4);
    });

    it.each([
      ['a single rung', 1],
      ['zero rungs', 0],
      ['a fractional count', 3.5],
      ['more rungs than supported', 21],
    ])('rejects %s', (_label, count) => {
      expect(() =>
        computeScalePriceLadder({ minPrice: 2000, maxPrice: 3000, count }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID);
    });

    it.each([
      ['an inverted range', 3000, 2000],
      ['a degenerate range', 2000, 2000],
      ['a non-positive lower bound', 0, 2000],
      ['a non-finite bound', 2000, NaN],
    ])('rejects %s', (_label, minPrice, maxPrice) => {
      expect(() =>
        computeScalePriceLadder({ minPrice, maxPrice, count: 3 }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
    });
  });

  describe('splitScaleSizes', () => {
    it('splits a size that divides evenly', () => {
      expect(
        splitScaleSizes({ totalSize: 0.6, count: 3, szDecimals: 4 }),
      ).toStrictEqual(['0.2', '0.2', '0.2']);
    });

    it('gives the indivisible remainder to the first rung so the total is exact', () => {
      const sizes = splitScaleSizes({
        totalSize: 1,
        count: 3,
        szDecimals: 2,
      });

      expect(sizes).toStrictEqual(['0.34', '0.33', '0.33']);
      expect(
        sizes.reduce((total, size) => total + parseFloat(size), 0),
      ).toBeCloseTo(1, 10);
    });

    it('formats slices the way every other submitted size is formatted', () => {
      expect(
        splitScaleSizes({ totalSize: 3, count: 3, szDecimals: 0 }),
      ).toStrictEqual(['1', '1', '1']);
    });

    it('rejects a total too small to give every rung a slice', () => {
      expect(() =>
        splitScaleSizes({ totalSize: 0.02, count: 3, szDecimals: 2 }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
    });
  });

  describe('splitScaleSizes - rung count', () => {
    // Exported on its own, so it cannot rely on computeScalePriceLadder having
    // vetted the count first: zero would return an empty split, and a
    // fractional count slices that do not sum to the total.
    it.each([
      ['zero', 0],
      ['negative', -3],
      ['a single rung', 1],
      ['fractional', 2.5],
      ['above the supported ladder size', 21],
    ])('rejects %s', (_label, count) => {
      expect(() =>
        splitScaleSizes({ totalSize: 1, count, szDecimals: 4 }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID);
    });
  });

  describe('computeChaseQuotePrice', () => {
    // The venue's definition: one tick above the best bid for a buy, one tick
    // below the best ask for a sell, or the touch itself when the spread is a
    // single tick. ETH-like precision (szDecimals 4) gives a 0.1 tick at ~3000.
    it('rests one tick above the best bid for a buy', () => {
      expect(
        computeChaseQuotePrice({
          bestBid: 2999,
          bestAsk: 3001,
          isBuy: true,
          szDecimals: 4,
        }),
      ).toBe('2999.1');
    });

    it('rests one tick below the best ask for a sell', () => {
      expect(
        computeChaseQuotePrice({
          bestBid: 2999,
          bestAsk: 3001,
          isBuy: false,
          szDecimals: 4,
        }),
      ).toBe('3000.9');
    });

    it.each([true, false])(
      'joins the touch on a single-tick spread (isBuy=%s)',
      (isBuy) => {
        expect(
          computeChaseQuotePrice({
            bestBid: 2999.9,
            bestAsk: 3000,
            isBuy,
            szDecimals: 4,
          }),
        ).toBe(isBuy ? '2999.9' : '3000');
      },
    );

    it('widens the tick with the price, as the venue does', () => {
      // At 50000 the five-significant-figure cap makes the tick 1, not 0.01.
      expect(
        computeChaseQuotePrice({
          bestBid: 50000,
          bestAsk: 50100,
          isBuy: true,
          szDecimals: 3,
        }),
      ).toBe('50001');
    });
  });

  describe('getPriceTick', () => {
    it.each([
      ['decimal-bound at a low price', 12, 4, 0.01],
      ['significant-figure-bound at a high price', 50000, 3, 1],
    ])('is %s', (_label, price, szDecimals, expected) => {
      expect(getPriceTick({ price, szDecimals })).toBeCloseTo(expected, 10);
    });
  });
});
