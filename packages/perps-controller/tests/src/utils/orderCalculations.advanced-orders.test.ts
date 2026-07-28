import { ORDER_SLIPPAGE_CONFIG } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { OrderType } from '../../../src/types/perps-types.js';
import {
  buildOrdersArray,
  calculateOrderPriceAndSize,
} from '../../../src/utils/orderCalculations.js';

const SZ_DECIMALS = 3;

const baseBuildParams = {
  assetId: 0,
  isBuy: true,
  formattedPrice: '50000',
  formattedSize: '0.1',
  reduceOnly: false,
  orderType: 'market' as OrderType,
  szDecimals: SZ_DECIMALS,
};

describe('orderCalculations - advanced order types', () => {
  describe('calculateOrderPriceAndSize', () => {
    it('prices a stop limit order at the limit price', () => {
      const result = calculateOrderPriceAndSize({
        orderType: 'stop_limit',
        isBuy: false,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        limitPrice: '44000',
        triggerPrice: '45000',
        szDecimals: SZ_DECIMALS,
      });

      expect(result.orderPrice).toBe(44000);
      expect(result.formattedSize).toBe('0.1');
    });

    it('caps a stop market sell at the trigger price minus TP/SL slippage', () => {
      const slippage = ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps / 10_000;

      const result = calculateOrderPriceAndSize({
        orderType: 'stop_market',
        isBuy: false,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        triggerPrice: '45000',
        szDecimals: SZ_DECIMALS,
      });

      expect(result.orderPrice).toBeCloseTo(45000 * (1 - slippage), 6);
    });

    it('caps a take profit market buy at the trigger price plus TP/SL slippage', () => {
      const slippage = ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps / 10_000;

      const result = calculateOrderPriceAndSize({
        orderType: 'take_profit_market',
        isBuy: true,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        triggerPrice: '55000',
        szDecimals: SZ_DECIMALS,
      });

      expect(result.orderPrice).toBeCloseTo(55000 * (1 + slippage), 6);
    });

    it('honours the caller slippage tolerance on a market-executing trigger', () => {
      const result = calculateOrderPriceAndSize({
        orderType: 'stop_market',
        isBuy: false,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        triggerPrice: '45000',
        maxSlippageBps: 100,
        szDecimals: SZ_DECIMALS,
      });

      // 100 bps below the trigger, not the 10% TP/SL default
      expect(result.orderPrice).toBeCloseTo(45000 * (1 - 0.01), 6);
    });

    it('falls back to the TP/SL slippage default when none is supplied', () => {
      const slippage = ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps / 10_000;

      const result = calculateOrderPriceAndSize({
        orderType: 'take_profit_market',
        isBuy: true,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        triggerPrice: '55000',
        szDecimals: SZ_DECIMALS,
      });

      expect(result.orderPrice).toBeCloseTo(55000 * (1 + slippage), 6);
    });

    it('ignores the slippage setting for limit-executing triggers', () => {
      const result = calculateOrderPriceAndSize({
        orderType: 'stop_limit',
        isBuy: false,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        limitPrice: '44500',
        triggerPrice: '45000',
        maxSlippageBps: 100,
        szDecimals: SZ_DECIMALS,
      });

      expect(result.orderPrice).toBe(44500);
    });

    it('throws a typed error when a trigger placement has no trigger price', () => {
      expect(() =>
        calculateOrderPriceAndSize({
          orderType: 'stop_market',
          isBuy: false,
          finalPositionSize: 0.1,
          currentPrice: 50000,
          szDecimals: SZ_DECIMALS,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
    });

    it('throws a typed error when the trigger price is not positive', () => {
      expect(() =>
        calculateOrderPriceAndSize({
          orderType: 'take_profit_limit',
          isBuy: false,
          finalPositionSize: 0.1,
          currentPrice: 50000,
          limitPrice: '55000',
          triggerPrice: '0',
          szDecimals: SZ_DECIMALS,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE);
    });

    it('throws a typed error when a limit-executing trigger has no limit price', () => {
      expect(() =>
        calculateOrderPriceAndSize({
          orderType: 'stop_limit',
          isBuy: false,
          finalPositionSize: 0.1,
          currentPrice: 50000,
          triggerPrice: '45000',
          szDecimals: SZ_DECIMALS,
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_LIMIT_PRICE_REQUIRED);
    });

    it('leaves plain market and limit pricing untouched', () => {
      const market = calculateOrderPriceAndSize({
        orderType: 'market',
        isBuy: true,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        maxSlippageBps: 100,
        szDecimals: SZ_DECIMALS,
      });
      expect(market.orderPrice).toBeCloseTo(50000 * 1.01, 6);

      const limit = calculateOrderPriceAndSize({
        orderType: 'limit',
        isBuy: true,
        finalPositionSize: 0.1,
        currentPrice: 50000,
        limitPrice: '49000',
        szDecimals: SZ_DECIMALS,
      });
      expect(limit.orderPrice).toBe(49000);
    });
  });

  describe('buildOrdersArray', () => {
    it.each([
      ['stop_market', { isMarket: true, tpsl: 'sl' }],
      ['stop_limit', { isMarket: false, tpsl: 'sl' }],
      ['take_profit_market', { isMarket: true, tpsl: 'tp' }],
      ['take_profit_limit', { isMarket: false, tpsl: 'tp' }],
    ] as [OrderType, { isMarket: boolean; tpsl: string }][])(
      'maps %s onto the SDK trigger shape',
      (orderType, expected) => {
        const { orders, grouping } = buildOrdersArray({
          ...baseBuildParams,
          orderType,
          triggerPrice: '45000',
        });

        expect(orders).toHaveLength(1);
        expect(orders[0].t).toStrictEqual({
          trigger: {
            isMarket: expected.isMarket,
            triggerPx: '45000',
            tpsl: expected.tpsl,
          },
        });
        // A standalone trigger order has no attached children
        expect(grouping).toBe('na');
      },
    );

    it('passes the reduce-only flag through for trigger placements', () => {
      const { orders } = buildOrdersArray({
        ...baseBuildParams,
        orderType: 'stop_market',
        triggerPrice: '45000',
        reduceOnly: true,
      });

      expect(orders[0].r).toBe(true);
    });

    it('formats the trigger price to the asset precision', () => {
      const { orders } = buildOrdersArray({
        ...baseBuildParams,
        orderType: 'stop_limit',
        triggerPrice: '45.123456789',
      });

      expect(orders[0].t).toStrictEqual({
        trigger: {
          isMarket: false,
          triggerPx: '45.123',
          tpsl: 'sl',
        },
      });
    });

    it('throws a typed error when a trigger placement has no trigger price', () => {
      expect(() =>
        buildOrdersArray({
          ...baseBuildParams,
          orderType: 'take_profit_limit',
        }),
      ).toThrow(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
    });

    it('keeps market and limit orders on the existing TIF mapping', () => {
      expect(
        buildOrdersArray({ ...baseBuildParams, orderType: 'market' }).orders[0]
          .t,
      ).toStrictEqual({ limit: { tif: 'FrontendMarket' } });
      expect(
        buildOrdersArray({ ...baseBuildParams, orderType: 'limit' }).orders[0]
          .t,
      ).toStrictEqual({ limit: { tif: 'Gtc' } });
    });

    it('scopes attached TP/SL orders to their partial sizes', () => {
      const { orders, grouping } = buildOrdersArray({
        ...baseBuildParams,
        formattedSize: '1',
        takeProfitPrice: '60000',
        takeProfitSize: '0.4',
        stopLossPrice: '45000',
        stopLossSize: '0.6',
      });

      expect(grouping).toBe('normalTpsl');
      expect(orders).toHaveLength(3);
      expect(orders[1].s).toBe('0.4');
      expect(orders[2].s).toBe('0.6');
    });

    it('defaults attached TP/SL orders to the full order size', () => {
      const { orders } = buildOrdersArray({
        ...baseBuildParams,
        formattedSize: '1',
        takeProfitPrice: '60000',
        stopLossPrice: '45000',
      });

      expect(orders[1].s).toBe('1');
      expect(orders[2].s).toBe('1');
    });

    it('formats partial TP/SL sizes to the asset precision', () => {
      const { orders } = buildOrdersArray({
        ...baseBuildParams,
        formattedSize: '1',
        takeProfitPrice: '60000',
        takeProfitSize: '0.123456',
      });

      expect(orders[1].s).toBe('0.123');
    });
  });
});
