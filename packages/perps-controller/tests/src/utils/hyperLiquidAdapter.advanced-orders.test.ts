import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { FrontendOrder } from '../../../src/types/hyperliquid-types.js';
import type { OrderParams } from '../../../src/types/index.js';
import type {
  TpslLinkage,
  TriggerOrderType,
} from '../../../src/types/perps-types.js';
import {
  adaptOrderFromSDK,
  adaptOrderToSDK,
  adaptPositionTriggerOrderFromSDK,
  adaptTpslLinkageToGrouping,
  adaptTriggerOrderTypeFromSDK,
} from '../../../src/utils/hyperLiquidAdapter.js';

/**
 * Builds a minimal valid `FrontendOrder` fixture, overridable per test.
 *
 * @param overrides - Fields to override on the base fixture.
 * @returns A `FrontendOrder` fixture.
 */
function buildFrontendOrder(
  overrides: Partial<FrontendOrder> = {},
): FrontendOrder {
  return {
    coin: 'BTC',
    side: 'B',
    limitPx: '50000',
    sz: '0.1',
    oid: 12345,
    timestamp: 1_700_000_000_000,
    origSz: '0.1',
    triggerCondition: 'N/A',
    isTrigger: false,
    triggerPx: '',
    children: [],
    isPositionTpsl: false,
    reduceOnly: false,
    orderType: 'Limit',
    ...overrides,
  } as FrontendOrder;
}

const buildOrderParams = (
  overrides: Partial<OrderParams> = {},
): OrderParams => ({
  symbol: 'BTC',
  isBuy: true,
  size: '0.1',
  orderType: 'market',
  ...overrides,
});

describe('hyperLiquidAdapter - advanced order types', () => {
  describe('adaptTriggerOrderTypeFromSDK', () => {
    it.each([
      ['Stop Market', 'stop_market'],
      ['Stop Limit', 'stop_limit'],
      ['Take Profit Market', 'take_profit_market'],
      ['Take Profit Limit', 'take_profit_limit'],
    ] as [string, TriggerOrderType][])(
      'maps %s to %s',
      (detailedOrderType, expected) => {
        expect(adaptTriggerOrderTypeFromSDK(detailedOrderType)).toBe(expected);
      },
    );

    it.each([undefined, '', 'Limit', 'Market', 'Trigger'])(
      'returns undefined for %s',
      (detailedOrderType) => {
        expect(adaptTriggerOrderTypeFromSDK(detailedOrderType)).toBeUndefined();
      },
    );
  });

  describe('adaptOrderFromSDK', () => {
    it('round-trips a stop market order with its trigger data', () => {
      const result = adaptOrderFromSDK(
        buildFrontendOrder({
          orderType: 'Stop Market',
          isTrigger: true,
          triggerPx: '45000',
          limitPx: '40500',
          reduceOnly: true,
        }),
      );

      expect(result.triggerOrderType).toBe('stop_market');
      expect(result.triggerPrice).toBe('45000');
      expect(result.reduceOnly).toBe(true);
      expect(result.isTrigger).toBe(true);
    });

    it('round-trips a take profit limit order', () => {
      const result = adaptOrderFromSDK(
        buildFrontendOrder({
          orderType: 'Take Profit Limit',
          isTrigger: true,
          triggerPx: '60000',
          limitPx: '60000',
          sz: '0.04',
          origSz: '0.04',
        }),
      );

      expect(result.triggerOrderType).toBe('take_profit_limit');
      expect(result.triggerPrice).toBe('60000');
      // Partial quantity is carried by the order size itself
      expect(result.size).toBe('0.04');
    });

    it('leaves triggerOrderType unset for plain orders', () => {
      const result = adaptOrderFromSDK(buildFrontendOrder());

      expect(result.triggerOrderType).toBeUndefined();
    });
  });

  describe('adaptOrderToSDK', () => {
    const symbolToAssetId = new Map([['BTC', 0]]);

    it.each([
      ['GTC', 'Gtc'],
      ['IOC', 'Ioc'],
      ['ALO', 'Alo'],
    ] as const)('maps %s time in force onto a limit order', (timeInForce, tif) => {
      const result = adaptOrderToSDK(
        buildOrderParams({ orderType: 'limit', timeInForce }),
        symbolToAssetId,
      );

      expect(result.t).toStrictEqual({ limit: { tif } });
    });

    it.each([
      ['stop_market', { isMarket: true, tpsl: 'sl' }],
      ['stop_limit', { isMarket: false, tpsl: 'sl' }],
      ['take_profit_market', { isMarket: true, tpsl: 'tp' }],
      ['take_profit_limit', { isMarket: false, tpsl: 'tp' }],
    ] as [TriggerOrderType, { isMarket: boolean; tpsl: string }][])(
      'maps %s onto the SDK trigger shape',
      (orderType, expected) => {
        const result = adaptOrderToSDK(
          buildOrderParams({ orderType, triggerPrice: '45000' }),
          symbolToAssetId,
        );

        expect(result.t).toStrictEqual({
          trigger: {
            isMarket: expected.isMarket,
            triggerPx: '45000',
            tpsl: expected.tpsl,
          },
        });
      },
    );

    it('throws a typed error when a trigger placement has no trigger price', () => {
      expect(() =>
        adaptOrderToSDK(
          buildOrderParams({ orderType: 'stop_limit', price: '44000' }),
          symbolToAssetId,
        ),
      ).toThrow(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
    });

    it('keeps the existing mapping for market and limit orders', () => {
      expect(
        adaptOrderToSDK(buildOrderParams(), symbolToAssetId).t,
      ).toStrictEqual({ limit: { tif: 'FrontendMarket' } });
      expect(
        adaptOrderToSDK(
          buildOrderParams({ orderType: 'limit', price: '49000' }),
          symbolToAssetId,
        ).t,
      ).toStrictEqual({ limit: { tif: 'Gtc' } });
    });
  });

  describe('adaptPositionTriggerOrderFromSDK', () => {
    it('reports a partial trigger order against the position size', () => {
      const result = adaptPositionTriggerOrderFromSDK({
        rawOrder: buildFrontendOrder({
          oid: 999,
          orderType: 'Take Profit Limit',
          triggerPx: '60000',
          sz: '0.4',
          reduceOnly: true,
        }),
        positionSize: '1',
      });

      expect(result).toStrictEqual({
        orderId: '999',
        orderType: 'take_profit_limit',
        triggerPrice: '60000',
        size: '0.4',
        isPartial: true,
        reduceOnly: true,
      });
    });

    it('resolves a position-bound trigger (size 0) to the position size', () => {
      const result = adaptPositionTriggerOrderFromSDK({
        rawOrder: buildFrontendOrder({
          orderType: 'Stop Market',
          triggerPx: '45000',
          sz: '0',
          reduceOnly: true,
        }),
        positionSize: '-2',
      });

      expect(result?.size).toBe('2');
      expect(result?.isPartial).toBe(false);
    });

    it('falls back to limitPx when HyperLiquid omits the trigger price', () => {
      const result = adaptPositionTriggerOrderFromSDK({
        rawOrder: buildFrontendOrder({
          orderType: 'Stop Limit',
          triggerPx: '',
          limitPx: '44000',
          sz: '1',
        }),
        positionSize: '1',
      });

      expect(result?.triggerPrice).toBe('44000');
    });

    it('returns undefined for non-trigger orders', () => {
      expect(
        adaptPositionTriggerOrderFromSDK({
          rawOrder: buildFrontendOrder(),
          positionSize: '1',
        }),
      ).toBeUndefined();
    });
  });

  describe('adaptTpslLinkageToGrouping', () => {
    it.each([
      ['none', 'na'],
      ['order', 'normalTpsl'],
      ['position', 'positionTpsl'],
    ] as [TpslLinkage, string][])('maps %s to %s', (linkage, expected) => {
      expect(adaptTpslLinkageToGrouping(linkage)).toBe(expected);
    });
  });
});
