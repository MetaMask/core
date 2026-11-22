import { describe, expect, it } from 'vitest';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import {
  normalizeHyperLiquidScalePriceLadder,
  sizeHyperLiquidScaleLadder,
} from '../../../src/utils/hyperLiquidScaleOrders.js';

describe('normalizeHyperLiquidScalePriceLadder', () => {
  it('rounds each evenly spaced rung onto the Hyperliquid grid', () => {
    expect(
      normalizeHyperLiquidScalePriceLadder({
        minPrice: 43000.12,
        maxPrice: 43005.99,
        count: 4,
        szDecimals: 5,
      }),
    ).toStrictEqual(['43000', '43002', '43004', '43006']);
  });

  it('rejects a range whose rungs collapse onto one grid price', () => {
    expect(() =>
      normalizeHyperLiquidScalePriceLadder({
        minPrice: 100.001,
        maxPrice: 100.004,
        count: 3,
        szDecimals: 4,
      }),
    ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
  });
});

describe('sizeHyperLiquidScaleLadder', () => {
  const prices = ['1900', '1950', '2000', '2050', '2100'];

  it('sizes a USD target from the skew-weighted average price, rounded up', () => {
    expect(
      sizeHyperLiquidScaleLadder({
        prices,
        sizeDecimals: 4,
        skew: 2,
        usdAmount: '1000',
      }),
    ).toStrictEqual({
      sizes: ['0.0661', '0.0827', '0.0992', '0.1157', '0.1322'],
      totalSize: '0.4959',
      totalNotional: '1000.06',
    });
  });

  it('searches for the smallest total that reaches the target when the first guess falls short', () => {
    // 1.00 splits as 0.34 / 0.33 / 0.33, worth 99.95; 1.01 is the first to reach 100.
    expect(
      sizeHyperLiquidScaleLadder({
        prices: ['95', '100', '105'],
        sizeDecimals: 2,
        usdAmount: '100',
      }),
    ).toStrictEqual({
      sizes: ['0.35', '0.33', '0.33'],
      totalSize: '1.01',
      totalNotional: '100.9',
    });
  });

  it('splits an exact size as given', () => {
    expect(
      sizeHyperLiquidScaleLadder({
        prices,
        sizeDecimals: 4,
        skew: 2,
        size: '1.5',
      }),
    ).toStrictEqual({
      sizes: ['0.2', '0.25', '0.3', '0.35', '0.4'],
      totalSize: '1.5',
      totalNotional: '3025',
    });
  });

  it('rejects an exact size off the size grid', () => {
    // Splitting 3.6 at 0 decimals would place 4 units while reporting 3.6.
    expect(() =>
      sizeHyperLiquidScaleLadder({
        prices: ['100', '200', '300'],
        sizeDecimals: 0,
        size: '3.6',
      }),
    ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_CONSERVATION_FAILED);
  });

  it('rejects an exact size that loses a grid step in number conversion', () => {
    // At one decimal, 600000000000000.3 converts to the same number as .2.
    expect(() =>
      sizeHyperLiquidScaleLadder({
        prices: ['100', '200', '300'],
        sizeDecimals: 1,
        size: '600000000000000.3',
      }),
    ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_CONSERVATION_FAILED);
    expect(
      sizeHyperLiquidScaleLadder({
        prices: ['100', '200', '300'],
        sizeDecimals: 1,
        size: '600000000000000.2',
      }).totalSize,
    ).toBe('600000000000000.2');
  });

  it('rejects a USD target beyond the safe size range without scanning it', () => {
    expect(() =>
      sizeHyperLiquidScaleLadder({
        prices: ['100', '200', '300'],
        sizeDecimals: 0,
        usdAmount: '100000000000000000000',
      }),
    ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
  });

  it('finds the smallest splittable total when the first guess starves a rung', () => {
    // The first guess, 5 units, splits 3 / 2 / 0. Four units split 2 / 1 / 1
    // and reach the target; three cannot be split.
    expect(
      sizeHyperLiquidScaleLadder({
        prices: ['100', '200', '300'],
        sizeDecimals: 0,
        skew: 0.2,
        usdAmount: '650',
      }),
    ).toStrictEqual({
      sizes: ['2', '1', '1'],
      totalSize: '4',
      totalNotional: '700',
    });
  });

  it('rejects a target too small to give every rung a size step', () => {
    expect(() =>
      sizeHyperLiquidScaleLadder({
        prices: ['95', '100', '105'],
        sizeDecimals: 0,
        usdAmount: '100',
      }),
    ).toThrow(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
  });
});
