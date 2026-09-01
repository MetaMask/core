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

  describe('splitScaleSizes - skew', () => {
    // The ticket's worked example, taken all the way onto the size grid: total
    // 100 over 5 rungs at skew 2 gives weights 1, 1.25, 1.5, 1.75, 2 and ideal
    // slices 13.33, 16.67, 20, 23.33, 26.67. The two largest discarded
    // fractions are rungs 1 and 4, so they take the two leftover units.
    it('ramps the weights linearly and lands the leftover on the largest fractions', () => {
      expect(
        splitScaleSizes({
          totalSize: 100,
          count: 5,
          szDecimals: 0,
          skew: 2,
        }),
      ).toStrictEqual(['13', '17', '20', '23', '27']);
    });

    it('weights the top of the ladder when the skew is above 1', () => {
      const sizes = splitScaleSizes({
        totalSize: 1,
        count: 5,
        szDecimals: 2,
        skew: 2,
      }).map((size) => parseFloat(size));

      // The ladder runs scaleMinPrice -> scaleMaxPrice, so the last rung is the
      // one at scaleMaxPrice.
      expect(Math.max(...sizes)).toBe(sizes[sizes.length - 1]);
      expect(sizes).toStrictEqual([0.13, 0.17, 0.2, 0.23, 0.27]);
    });

    it('weights the bottom of the ladder when the skew is below 1', () => {
      const sizes = splitScaleSizes({
        totalSize: 1,
        count: 5,
        szDecimals: 2,
        skew: 0.5,
      }).map((size) => parseFloat(size));

      expect(Math.max(...sizes)).toBe(sizes[0]);
      expect(sizes).toStrictEqual([0.27, 0.23, 0.2, 0.17, 0.13]);
    });

    // A short ladder is still built low price to high price: the skew weights
    // the range, not the direction of the trade.
    it('does not flip for a sell', () => {
      expect(
        splitScaleSizes({ totalSize: 100, count: 5, szDecimals: 0, skew: 2 }),
      ).toStrictEqual(['13', '17', '20', '23', '27']);
    });

    it('breaks a tie in the discarded fraction by the lower index', () => {
      // Weights 1 and 3 over 10 units give 2.5 and 7.5 — one leftover unit and
      // two equal fractions.
      expect(
        splitScaleSizes({ totalSize: 10, count: 2, szDecimals: 0, skew: 3 }),
      ).toStrictEqual(['3', '7']);
    });

    it.each([
      ['above 1', 2],
      ['below 1', 0.5],
      ['far above 1', 100],
      ['far below 1', 0.01],
    ])(
      'sums to the requested total in grid units with a skew %s',
      (_label, skew) => {
        const sizes = splitScaleSizes({
          totalSize: 1,
          count: 7,
          szDecimals: 3,
          skew,
        });

        const units = sizes.reduce(
          (total, size) => total + Math.round(parseFloat(size) * 1000),
          0,
        );
        expect(units).toBe(1000);
      },
    );

    it('still fills every rung under a very high skew', () => {
      // Weights 1, 50.5, 100 over 100 units: the first rung's ideal slice is
      // 0.66 of a unit, and the leftover unit is what keeps it non-zero.
      expect(
        splitScaleSizes({ totalSize: 1, count: 3, szDecimals: 2, skew: 100 }),
      ).toStrictEqual(['0.01', '0.33', '0.66']);
    });

    it('rejects a skew that starves a rung of every unit', () => {
      // Same weights, but three units to go round: the first rung's ideal slice
      // is 0.02 and there is no leftover left to round it up with.
      expect(() =>
        splitScaleSizes({
          totalSize: 0.03,
          count: 3,
          szDecimals: 2,
          skew: 100,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
    });

    it.each([
      ['zero', 0],
      ['negative', -2],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
    ])('rejects %s', (_label, skew) => {
      expect(() =>
        splitScaleSizes({ totalSize: 1, count: 3, szDecimals: 2, skew }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
    });

    it('splits exactly as an omitted skew does when the skew is 1', () => {
      const even = splitScaleSizes({ totalSize: 1, count: 3, szDecimals: 2 });

      expect(even).toStrictEqual(['0.34', '0.33', '0.33']);
      expect(
        splitScaleSizes({ totalSize: 1, count: 3, szDecimals: 2, skew: 1 }),
      ).toStrictEqual(even);
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

    // Regression: formatHyperLiquidPrice used to miscount a sub-$1 price's
    // significant figures and re-round it back down onto a coarser grid than
    // getPriceTick (used two lines above to compute `improved`) had just
    // produced. A post-only buy chase meant to rest one tick above the best
    // bid came back AT the best bid instead — resting behind the whole
    // queue — and a sell chase came back BELOW the best bid, which the venue
    // treats as crossing the book and rejects for a post-only (ALO) order.
    it('rests strictly inside the spread for a sub-$1 book (HMSTR-shaped)', () => {
      const bestBid = 0.000171;
      const bestAsk = 0.000175;

      const buyChase = computeChaseQuotePrice({
        bestBid,
        bestAsk,
        isBuy: true,
        szDecimals: 0,
      });
      expect(buyChase).toBe('0.000172');
      expect(Number(buyChase)).toBeGreaterThan(bestBid);

      const sellChase = computeChaseQuotePrice({
        bestBid,
        bestAsk,
        isBuy: false,
        szDecimals: 0,
      });
      expect(sellChase).toBe('0.000174');
      expect(Number(sellChase)).toBeLessThan(bestAsk);
      expect(Number(sellChase)).toBeGreaterThan(bestBid);
    });
  });

  describe('getPriceTick', () => {
    it.each([
      ['decimal-bound at a low price', 12, 4, 0.01],
      ['significant-figure-bound at a high price', 50000, 3, 1],
      ['significant-figure-bound at a sub-$1 price', 0.000171, 0, 0.000001],
    ])('is %s', (_label, price, szDecimals, expected) => {
      expect(getPriceTick({ price, szDecimals })).toBeCloseTo(expected, 10);
    });
  });
});
