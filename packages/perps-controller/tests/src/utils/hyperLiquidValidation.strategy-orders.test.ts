import { PERPS_EVENT_VALUE } from '../../../src/constants/eventNames.js';
import {
  CHASE_ORDER_CONFIG,
  HYPERLIQUID_ORDER_LIMITS,
  HYPERLIQUID_TWAP_LIMITS,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type {
  OrderType,
  StrategyOrderType,
} from '../../../src/types/perps-types.js';
import {
  getMaxOrderValue,
  validateOrderParams,
} from '../../../src/utils/hyperLiquidValidation.js';
import {
  getTriggerExecution,
  isStrategyOrderType,
  isTriggerOrderType,
  STRATEGY_ORDER_TYPES,
} from '../../../src/utils/orderTypes.js';

/** The smallest params that make each strategy valid on its own. */
const VALID_STRATEGY_PARAMS: Record<
  StrategyOrderType,
  Record<string, unknown>
> = {
  twap: { twapDuration: 30 },
  scale: {
    scaleMinPrice: '2000',
    scaleMaxPrice: '3000',
    scaleNumOrders: 3,
  },
  chase: {},
};

describe('hyperLiquidValidation - strategy order types', () => {
  describe('order type classification', () => {
    it.each(STRATEGY_ORDER_TYPES)(
      'classifies %s as a strategy',
      (orderType) => {
        expect(isStrategyOrderType(orderType)).toBe(true);
      },
    );

    it.each([
      'market',
      'limit',
      'stop_market',
      'stop_limit',
      'take_profit_market',
      'take_profit_limit',
    ] as OrderType[])('does not classify %s as a strategy', (orderType) => {
      expect(isStrategyOrderType(orderType)).toBe(false);
    });

    // TriggerOrderType used to be Exclude<OrderType, 'market' | 'limit'>, which
    // would have swallowed the strategy types and demanded a trigger price from
    // them.
    it.each(STRATEGY_ORDER_TYPES)(
      'does not classify %s as a trigger placement',
      (orderType) => {
        expect(isTriggerOrderType(orderType)).toBe(false);
      },
    );

    it.each([0.5, 9999.5])(
      'accepts a fractional %s bps max distance below the upper boundary',
      (chaseMaxDistanceBps) => {
        expect(
          validateOrderParams({
            coin: 'ETH',
            size: '1',
            orderType: 'chase',
            chaseMaxDistanceBps,
          }),
        ).toStrictEqual({ isValid: true });
      },
    );
  });

  describe('validateOrderParams - accepted strategies', () => {
    it.each(STRATEGY_ORDER_TYPES)('accepts a well-formed %s', (orderType) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType,
          ...VALID_STRATEGY_PARAMS[orderType],
        }),
      ).toStrictEqual({ isValid: true });
    });

    it('accepts a randomized TWAP', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'twap',
          twapDuration: HYPERLIQUID_TWAP_LIMITS.MinDurationMinutes,
          twapRandomize: true,
        }),
      ).toStrictEqual({ isValid: true });
    });

    it('accepts an explicitly configured chase', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'chase',
          chaseIntervalMs: CHASE_ORDER_CONFIG.MinIntervalMs,
          chaseMaxDurationMs: CHASE_ORDER_CONFIG.MinIntervalMs * 10,
          chaseMaxRepricings: 5,
        }),
      ).toStrictEqual({ isValid: true });
    });

    it('accepts the exported unbounded Chase defaults', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'chase',
          chaseMaxDurationMs: CHASE_ORDER_CONFIG.DefaultMaxDurationMs,
          chaseMaxRepricings: CHASE_ORDER_CONFIG.DefaultMaxRepricings,
        }),
      ).toStrictEqual({ isValid: true });
    });
  });

  describe('validateOrderParams - TWAP', () => {
    it('requires a duration', () => {
      expect(
        validateOrderParams({ coin: 'ETH', size: '1', orderType: 'twap' }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_REQUIRED,
      });
    });

    it.each([
      ['zero', 0],
      ['negative', -5],
      [
        'below the venue minimum',
        HYPERLIQUID_TWAP_LIMITS.MinDurationMinutes - 1,
      ],
      [
        'above the venue maximum',
        HYPERLIQUID_TWAP_LIMITS.MaxDurationMinutes + 1,
      ],
      ['fractional', 10.5],
      ['not a number', NaN],
    ])('rejects a %s duration', (_label, twapDuration) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'twap',
          twapDuration,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
      });
    });

    it.each([
      HYPERLIQUID_TWAP_LIMITS.MinDurationMinutes,
      HYPERLIQUID_TWAP_LIMITS.MaxDurationMinutes,
    ])('accepts the boundary duration %s', (twapDuration) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'twap',
          twapDuration,
        }),
      ).toStrictEqual({ isValid: true });
    });
  });

  describe('validateOrderParams - scale', () => {
    it.each([
      ['no bounds', {}],
      ['only a lower bound', { scaleMinPrice: '2000' }],
      ['only an upper bound', { scaleMaxPrice: '3000' }],
    ])('requires both ladder bounds (%s)', (_label, bounds) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          scaleNumOrders: 3,
          ...bounds,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_REQUIRED,
      });
    });

    it('rejects an inverted range', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          scaleMinPrice: '3000',
          scaleMaxPrice: '2000',
          scaleNumOrders: 3,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
      });
    });

    it.each([
      ['a degenerate range', { scaleMinPrice: '2000', scaleMaxPrice: '2000' }],
      [
        'a non-positive lower bound',
        { scaleMinPrice: '0', scaleMaxPrice: '1' },
      ],
      ['an unparseable bound', { scaleMinPrice: 'abc', scaleMaxPrice: '3000' }],
    ])('rejects %s', (_label, bounds) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          scaleNumOrders: 3,
          ...bounds,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
      });
    });

    it.each([
      ['missing', undefined],
      ['a single rung', 1],
      ['zero', 0],
      ['fractional', 2.5],
      ['above the supported ladder size', 21],
    ])('rejects %s order counts', (_label, scaleNumOrders) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          scaleMinPrice: '2000',
          scaleMaxPrice: '3000',
          scaleNumOrders,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
      });
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
    ])('rejects a %s skew before anything is signed', (_label, scaleSkew) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          ...VALID_STRATEGY_PARAMS.scale,
          scaleSkew,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
      });
    });

    it('accepts an omitted skew', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          ...VALID_STRATEGY_PARAMS.scale,
        }),
      ).toStrictEqual({ isValid: true });
    });

    // The client coerces its input to two decimals; nothing here re-rounds it.
    it.each([
      ['above 1', 2.35],
      ['below 1', 0.25],
      ['exactly 1', 1],
      ['far above 1', 100],
      ['far below 1', 0.01],
    ])('accepts a skew %s', (_label, scaleSkew) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'scale',
          ...VALID_STRATEGY_PARAMS.scale,
          scaleSkew,
        }),
      ).toStrictEqual({ isValid: true });
    });
  });

  describe('validateOrderParams - chase', () => {
    it('rejects a poll interval below the floor', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'chase',
          chaseIntervalMs: CHASE_ORDER_CONFIG.MinIntervalMs - 1,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_CHASE_INTERVAL_INVALID,
      });
    });

    it('rejects a window shorter than one poll', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'chase',
          chaseIntervalMs: 5000,
          chaseMaxDurationMs: 4999,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_CHASE_DURATION_INVALID,
      });
    });

    it.each([0, -1, 1.5])(
      'rejects a %s repricing cap',
      (chaseMaxRepricings) => {
        expect(
          validateOrderParams({
            coin: 'ETH',
            size: '1',
            orderType: 'chase',
            chaseMaxRepricings,
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_CHASE_DURATION_INVALID,
        });
      },
    );

    it.each([0, -1, 10_000, 10_001, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects an invalid %s bps max distance',
      (chaseMaxDistanceBps) => {
        expect(
          validateOrderParams({
            coin: 'ETH',
            size: '1',
            orderType: 'chase',
            chaseMaxDistanceBps,
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_CHASE_MAX_DISTANCE_INVALID,
        });
      },
    );
  });

  describe('validateOrderParams - fields that do not belong', () => {
    it.each([
      ['twapDuration', { twapDuration: 30 }],
      ['twapRandomize', { twapRandomize: true }],
      ['scaleMinPrice', { scaleMinPrice: '2000' }],
      ['scaleNumOrders', { scaleNumOrders: 3 }],
      ['scaleSkew', { scaleSkew: 2 }],
      ['chaseIntervalMs', { chaseIntervalMs: 3000 }],
      ['chaseMaxDistanceBps', { chaseMaxDistanceBps: 100 }],
    ])('rejects %s on a market order', (_label, strategyField) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'market',
          ...strategyField,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_PARAMS_NOT_SUPPORTED,
      });
    });

    it("rejects another strategy's fields", () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'twap',
          twapDuration: 30,
          scaleNumOrders: 3,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_PARAMS_NOT_SUPPORTED,
      });
    });

    it.each([
      ['a limit price', { price: '2500' }],
      ['a trigger price', { triggerPrice: '2500' }],
      ['a time in force', { timeInForce: 'GTC' as const }],
      ['an attached take profit', { takeProfitPrice: '3500' }],
      ['an attached stop loss', { stopLossPrice: '1500' }],
      ['a partial take profit size', { takeProfitSize: '0.5' }],
      ['a partial stop loss size', { stopLossSize: '0.5' }],
      // A strategy is many orders over time, or none on the book at all; one
      // client id cannot name any of them, so it is refused rather than dropped.
      ['a client order id', { clientOrderId: '0xabc' }],
    ])('rejects %s on a strategy placement', (_label, field) => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'twap',
          twapDuration: 30,
          ...field,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_FIELD_UNSUPPORTED,
      });
    });
  });

  describe('validateOrderParams - existing order types are unaffected', () => {
    it('still accepts a plain limit order', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'limit',
          price: '2500',
          timeInForce: 'ALO',
        }),
      ).toStrictEqual({ isValid: true });
    });

    it('still accepts a trigger placement', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'stop_market',
          triggerPrice: '2000',
        }),
      ).toStrictEqual({ isValid: true });
    });

    it('still rejects a market order carrying a trigger price', () => {
      expect(
        validateOrderParams({
          coin: 'ETH',
          size: '1',
          orderType: 'market',
          triggerPrice: '2000',
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED,
      });
    });

    it('still requires a coin before anything else', () => {
      expect(
        validateOrderParams({ orderType: 'twap', twapDuration: 30 }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_COIN_REQUIRED,
      });
    });
  });

  describe('execution classification', () => {
    // A scale ladder rests GTC limits and a chase rests an ALO post-only limit,
    // so both execute as limit orders even though neither carries an
    // OrderParams.price. A TWAP's suborders cross the book.
    it.each([
      ['scale', 'limit'],
      ['chase', 'limit'],
      ['twap', 'market'],
    ] as [OrderType, 'limit' | 'market'][])(
      'classifies %s execution as %s',
      (orderType, execution) => {
        expect(getTriggerExecution(orderType)).toBe(execution);
      },
    );

    it.each(['scale', 'chase'] as OrderType[])(
      'gives %s the limit-order max value, not the tighter market cap',
      (orderType) => {
        const marketCap = getMaxOrderValue(50, 'market');

        expect(getMaxOrderValue(50, orderType)).toBe(
          marketCap * HYPERLIQUID_ORDER_LIMITS.LimitOrderMultiplier,
        );
      },
    );

    it('leaves twap on the market-order max value', () => {
      expect(getMaxOrderValue(50, 'twap')).toBe(getMaxOrderValue(50, 'market'));
    });
  });

  describe('analytics order_type values', () => {
    // TradingService emits `order_type` verbatim, so a placement type missing
    // from this enum shows up in dashboards as an unmapped value.
    it.each(STRATEGY_ORDER_TYPES)('enumerates %s', (orderType) => {
      expect(Object.values(PERPS_EVENT_VALUE.ORDER_TYPE)).toContain(orderType);
    });
  });
});
