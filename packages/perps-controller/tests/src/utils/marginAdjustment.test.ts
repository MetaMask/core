import { describe, expect, it } from 'vitest';

import { MARGIN_ADJUSTMENT_CONFIG } from '../../../src/constants/perpsConfig.js';
import * as PackageEntry from '../../../src/index.js';
import {
  calculateMaxRemovableMargin,
  estimateLiquidationPriceAfterMarginChange,
} from '../../../src/utils/marginAdjustment.js';

/*
 * Characterized from Mobile `app/components/UI/Perps/utils/marginUtils.ts`
 * (metamask-mobile 491c452) and its tests; Terminal
 * `order/utils/margin-adjustment.ts` is a port of the same rules.
 */
describe('marginAdjustment', () => {
  it('is exported from the package entry', () => {
    expect(PackageEntry.calculateMaxRemovableMargin).toBe(
      calculateMaxRemovableMargin,
    );
    expect(PackageEntry.estimateLiquidationPriceAfterMarginChange).toBe(
      estimateLiquidationPriceAfterMarginChange,
    );
  });

  it('keeps 1% of notional back for price movement', () => {
    expect(MARGIN_ADJUSTMENT_CONFIG.MarginRemovalPriceMoveBuffer).toBe(0.01);
  });

  describe('calculateMaxRemovableMargin', () => {
    it.each([
      // 50x: 10% of notional (2000) beats initial margin (400); less 200 headroom
      [
        {
          currentMargin: 3000,
          positionSize: 10,
          currentPrice: 2000,
          positionLeverage: 50,
        },
        800,
      ],
      // 5x: initial margin (4000) beats 10% (2000)
      [
        {
          currentMargin: 5000,
          positionSize: 10,
          currentPrice: 2000,
          positionLeverage: 5,
        },
        800,
      ],
      // Mark price, not entry, sets the notional
      [
        {
          currentMargin: 6000,
          positionSize: 10,
          currentPrice: 2500,
          positionLeverage: 5,
        },
        750,
      ],
      [
        {
          currentMargin: 8000,
          positionSize: 10,
          currentPrice: 2000,
          positionLeverage: 50,
        },
        5800,
      ],
      [
        {
          currentMargin: 8000,
          positionSize: 10,
          currentPrice: 2000,
          positionLeverage: 50,
          priceMoveBufferRatio: 0,
        },
        6000,
      ],
      // Surplus inside the price-move headroom
      [
        {
          currentMargin: 105,
          positionSize: 0.01,
          currentPrice: 100000,
          positionLeverage: 10,
        },
        0,
      ],
      // Exactly at initial margin
      [
        {
          currentMargin: 2000,
          positionSize: 1,
          currentPrice: 10000,
          positionLeverage: 5,
        },
        0,
      ],
      // Provided notional wins over size × price, and is used without a price
      [
        {
          currentMargin: 3000,
          positionSize: 10,
          currentPrice: 0,
          positionLeverage: 50,
          notionalValue: 20000,
        },
        800,
      ],
      [
        {
          currentMargin: 3000,
          positionSize: 10,
          currentPrice: 2500,
          positionLeverage: 50,
          notionalValue: 20000,
        },
        800,
      ],
      [
        { currentMargin: 3000, positionLeverage: 50, notionalValue: 20000 },
        800,
      ],
      // A non-positive provided notional falls back to size × price
      [
        {
          currentMargin: 3000,
          positionSize: 10,
          currentPrice: 2000,
          positionLeverage: 50,
          notionalValue: 0,
        },
        800,
      ],
    ])('returns the removable margin for %o', (params, expected) => {
      expect(calculateMaxRemovableMargin(params)).toBe(expected);
    });

    it.each([
      {
        currentMargin: -1000,
        positionSize: 10,
        currentPrice: 2000,
        positionLeverage: 5,
      },
      {
        currentMargin: 3000,
        positionSize: 0,
        currentPrice: 2000,
        positionLeverage: 5,
      },
      {
        currentMargin: 3000,
        positionSize: 10,
        currentPrice: 2000,
        positionLeverage: 0,
      },
      {
        currentMargin: 3000,
        positionSize: 10,
        currentPrice: 0,
        positionLeverage: 5,
      },
      {
        currentMargin: Number.NaN,
        positionSize: 10,
        currentPrice: 2000,
        positionLeverage: 5,
      },
      { currentMargin: 3000, positionLeverage: 5 },
      // An invalid price-move buffer must not add removable margin
      {
        currentMargin: 3000,
        positionLeverage: 50,
        notionalValue: 20000,
        priceMoveBufferRatio: -0.01,
      },
      {
        currentMargin: 3000,
        positionLeverage: 50,
        notionalValue: 20000,
        priceMoveBufferRatio: Number.NaN,
      },
      {
        currentMargin: 3000,
        positionLeverage: 50,
        notionalValue: 20000,
        priceMoveBufferRatio: Number.POSITIVE_INFINITY,
      },
    ])('returns 0 for invalid input %o', (params) => {
      expect(calculateMaxRemovableMargin(params)).toBe(0);
    });
  });

  describe('estimateLiquidationPriceAfterMarginChange', () => {
    const long = {
      isLong: true,
      currentMargin: 5000,
      positionSize: 0.5,
      currentLiquidationPrice: 80000,
      maxLeverage: 20,
    };

    it('keeps the liquidation price when the margin does not change', () => {
      expect(
        estimateLiquidationPriceAfterMarginChange({ ...long, newMargin: 5000 }),
      ).toBe(80000);
    });

    it.each([
      // Long: adding moves it down by 1000 / 0.5 / 0.975
      [{ ...long, newMargin: 6000 }, 77948.72],
      [{ ...long, newMargin: 4000 }, 82051.28],
      // Short: removing moves it down by 500 / 10 / 1.025
      [
        {
          isLong: false,
          currentMargin: 1000,
          newMargin: 500,
          positionSize: 10,
          currentLiquidationPrice: 2100,
          maxLeverage: 20,
        },
        2051.22,
      ],
    ])('estimates %o as %d', (params, expected) => {
      expect(estimateLiquidationPriceAfterMarginChange(params)).toBeCloseTo(
        expected,
        2,
      );
    });

    it('drops the maintenance factor for an invalid max leverage', () => {
      expect(
        estimateLiquidationPriceAfterMarginChange({
          ...long,
          newMargin: 6000,
          maxLeverage: 0,
        }),
      ).toBe(78000);
    });

    it('treats a near-zero adjustment factor as 1', () => {
      // maxLeverage 0.5: 1 - (1 / 1) × 1 = 0
      expect(
        estimateLiquidationPriceAfterMarginChange({
          ...long,
          newMargin: 6000,
          maxLeverage: 0.5,
        }),
      ).toBe(78000);
    });

    it('never returns a negative price', () => {
      expect(
        estimateLiquidationPriceAfterMarginChange({
          ...long,
          newMargin: 500000,
        }),
      ).toBe(0);
    });

    it.each([
      { newMargin: 0 },
      { newMargin: 6000, positionSize: 0 },
      { newMargin: 6000, currentMargin: 0 },
      { newMargin: Number.NaN },
    ])(
      'returns the current liquidation price for invalid input %o',
      (change) => {
        expect(
          estimateLiquidationPriceAfterMarginChange({ ...long, ...change }),
        ).toBe(80000);
      },
    );

    it('returns the invalid current liquidation price unchanged', () => {
      expect(
        estimateLiquidationPriceAfterMarginChange({
          ...long,
          newMargin: 6000,
          currentLiquidationPrice: 0,
        }),
      ).toBe(0);
    });
  });
});
