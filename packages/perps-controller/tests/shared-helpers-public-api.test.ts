import { describe, expect, it } from 'vitest';

// Shared helpers clients used to copy, checked through the package entrypoint
// so a dropped or renamed export fails here.
import {
  buildProviderCacheKey,
  calculateCloseSize,
  calculateFeeNotionalUsd,
  calculateOrderBookAggregationParams,
  calculateOrderBookGroupingOptions,
  calculateOrderBookSpread,
  calculateUndiscountedFeeAmount,
  CROSS_MARGIN_RATIO_THRESHOLDS,
  estimateOrderBookSlippage,
  getCrossMarginRatioTone,
  getFillAggregationKey,
  getOrderFillKey,
  getPositionDirection,
  getPriceDeviationBand,
  HYPERLIQUID_ORDER_LIMITS,
  isPriceOutsideDeviationBand,
  getUndiscountedFeeRate,
  isTriggerPriceOnValidSide,
  ORDER_BOOK_GROUPING_CONFIG,
  roundPerpsPrice,
  selectDefaultOrderBookGrouping,
} from '../src/index.js';

describe('shared Perps helpers public API', () => {
  it('exports buildProviderCacheKey', () => {
    expect(buildProviderCacheKey('hyperliquid', false)).toBe(
      'hyperliquid:mainnet',
    );
    expect(buildProviderCacheKey('hyperliquid', true)).toBe(
      'hyperliquid:testnet',
    );
  });

  it('exports roundPerpsPrice', () => {
    expect(
      roundPerpsPrice({
        price: '2.345678',
        pricePrecision: {
          type: 'fixed_decimals',
          decimals: 2,
          tickSize: '0.01',
        },
      }),
    ).toBe('2.35');
  });

  it('exports calculateCloseSize', () => {
    expect(
      calculateCloseSize({
        positionSize: 2,
        price: 100,
        sizeDecimals: 2,
        percent: 25,
      }),
    ).toStrictEqual({ size: 0.5, usdValue: 50 });
  });

  it('exports the order-book grouping helpers', () => {
    const options = calculateOrderBookGroupingOptions(2450);

    expect(ORDER_BOOK_GROUPING_CONFIG.DefaultOptionIndex).toBe(3);
    expect(selectDefaultOrderBookGrouping(options)).toBe(1);
    expect(calculateOrderBookAggregationParams(0.5, 2450)).toStrictEqual({
      nSigFigs: 5,
      mantissa: 5,
    });
    expect(
      calculateOrderBookSpread({ bestBid: 99.9, bestAsk: 100.1 })?.spread,
    ).toBe(0.2);
  });

  it('exports the fee helpers', () => {
    const feeResult = { feeRate: 0.00145 };
    const notionalUsd = calculateFeeNotionalUsd({ size: 2, price: 500 });

    expect(notionalUsd).toBe(1000);
    expect(getUndiscountedFeeRate(feeResult)).toBe(0.00145);
    expect(calculateUndiscountedFeeAmount({ notionalUsd, feeResult })).toBe(
      1.45,
    );
  });

  it('exports isTriggerPriceOnValidSide', () => {
    expect(
      isTriggerPriceOnValidSide({
        orderType: 'take_profit_market',
        isBuy: false,
        triggerPrice: 110,
        referencePrice: 100,
      }),
    ).toBe(true);
  });

  it('exports estimateOrderBookSlippage', () => {
    expect(
      estimateOrderBookSlippage({
        orderBook: { midPrice: '100', bids: [], asks: [] },
        isBuy: true,
        sizeUsd: 10,
      }).canFill,
    ).toBe(false);
  });

  it('exports the fill identity helpers', () => {
    const fill = {
      orderId: '1',
      symbol: 'BTC',
      direction: 'Open Long',
      timestamp: 1000,
      size: '1',
      price: '2',
    };

    expect(getOrderFillKey(fill)).toBe('1-1000-1-2');
    expect(getFillAggregationKey(fill)).toBe('BTC-Open Long-order-1');
  });

  it('exports getPositionDirection', () => {
    expect(getPositionDirection('-1')).toBe('short');
  });

  it('exports the cross-margin ratio thresholds', () => {
    expect(CROSS_MARGIN_RATIO_THRESHOLDS).toStrictEqual({
      Warning: 0.5,
      Danger: 0.75,
    });
    expect(getCrossMarginRatioTone(0.6)).toBe('warning');
  });

  it('exports the oracle price deviation limit and band check', () => {
    expect(HYPERLIQUID_ORDER_LIMITS.MaxOraclePriceDeviation).toBe(0.95);
    expect(getPriceDeviationBand(100, 0.5)).toStrictEqual({
      min: 50,
      max: 200,
    });
    expect(isPriceOutsideDeviationBand(10, 100, 0.5)).toBe(true);
  });
});
