import { HYPERLIQUID_ORDER_LIMITS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { OrderType, TpslLinkage } from '../../../src/types/perps-types.js';
import {
  getMaxOrderValue,
  validateOrderParams,
} from '../../../src/utils/hyperLiquidValidation.js';
import { isTriggerOrderType } from '../../../src/utils/orderTypes.js';

describe('hyperLiquidValidation - advanced order types', () => {
  describe('validateOrderParams', () => {
    it.each([
      'stop_market',
      'stop_limit',
      'take_profit_market',
      'take_profit_limit',
    ] as OrderType[])('requires a trigger price for %s', (orderType) => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '0.1',
          price: '50000',
          orderType,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED,
      });
    });

    it.each(['0', '-1', 'abc'])(
      'rejects a non-positive trigger price (%s)',
      (triggerPrice) => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '0.1',
            orderType: 'stop_market',
            triggerPrice,
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE,
        });
      },
    );

    it.each(['stop_limit', 'take_profit_limit'] as OrderType[])(
      'requires a limit price for %s',
      (orderType) => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '0.1',
            orderType,
            triggerPrice: '45000',
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_LIMIT_PRICE_REQUIRED,
        });
      },
    );

    it.each(['stop_market', 'take_profit_market'] as OrderType[])(
      'accepts %s without a limit price',
      (orderType) => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '0.1',
            orderType,
            triggerPrice: '45000',
          }),
        ).toStrictEqual({ isValid: true });
      },
    );

    it.each(['market', 'limit'] as OrderType[])(
      'rejects a trigger price on %s instead of ignoring it',
      (orderType) => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '0.1',
            price: '50000',
            orderType,
            triggerPrice: '45000',
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED,
        });
      },
    );

    it('rejects a falsy-but-present trigger price on a market order', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '0.1',
          orderType: 'market',
          triggerPrice: '',
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED,
      });
    });

    it('rejects attached TP/SL on a trigger placement', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '0.1',
          orderType: 'stop_market',
          triggerPrice: '45000',
          takeProfitPrice: '60000',
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TRIGGER_TPSL_UNSUPPORTED,
      });

      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '0.1',
          orderType: 'take_profit_market',
          triggerPrice: '60000',
          stopLossPrice: '45000',
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TRIGGER_TPSL_UNSUPPORTED,
      });
    });

    it('keeps market and limit orders valid without trigger fields', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '0.1',
          orderType: 'market',
        }),
      ).toStrictEqual({ isValid: true });

      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '0.1',
          price: '50000',
          orderType: 'limit',
        }),
      ).toStrictEqual({ isValid: true });
    });

    describe('partial TP/SL sizes', () => {
      it('accepts a partial size smaller than the order size', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            takeProfitPrice: '60000',
            takeProfitSize: '0.4',
            stopLossPrice: '45000',
            stopLossSize: '0.6',
          }),
        ).toStrictEqual({ isValid: true });
      });

      it('accepts a partial size equal to the order size', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            takeProfitPrice: '60000',
            takeProfitSize: '1',
          }),
        ).toStrictEqual({ isValid: true });
      });

      it('rejects a take profit size without a take profit price', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            takeProfitSize: '0.4',
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID,
        });
      });

      it('rejects a stop loss size without a stop loss price', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            stopLossSize: '0.4',
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID,
        });
      });

      it.each(['0', '-0.1', 'abc'])(
        'rejects a non-positive partial size (%s)',
        (takeProfitSize) => {
          expect(
            validateOrderParams({
              coin: 'BTC',
              size: '1',
              orderType: 'market',
              takeProfitPrice: '60000',
              takeProfitSize,
            }),
          ).toStrictEqual({
            isValid: false,
            error: PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID,
          });
        },
      );

      it('rejects a partial size larger than the order size', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            stopLossPrice: '45000',
            stopLossSize: '1.5',
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID,
        });
      });

      it('compares against the absolute order size for short orders', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '-1',
            orderType: 'market',
            stopLossPrice: '55000',
            stopLossSize: '0.5',
          }),
        ).toStrictEqual({ isValid: true });
      });

      it('skips the upper bound when no order size is known', () => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            orderType: 'market',
            takeProfitPrice: '60000',
            takeProfitSize: '99',
          }),
        ).toStrictEqual({ isValid: true });
      });
    });
  });

  describe('TP/SL linkage', () => {
    it('accepts the provider-agnostic linkage on its own', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          orderType: 'market',
          takeProfitPrice: '60000',
          tpslLinkage: 'order',
        }),
      ).toStrictEqual({ isValid: true });
    });

    it('accepts the deprecated grouping on its own', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          orderType: 'market',
          takeProfitPrice: '60000',
          grouping: 'normalTpsl',
        }),
      ).toStrictEqual({ isValid: true });
    });

    it.each([
      { tpslLinkage: 'position' as TpslLinkage },
      { grouping: 'positionTpsl' as const },
    ])(
      'rejects position linkage on an order that carries its own TP/SL (%o)',
      (linkage) => {
        // A positionTpsl batch may only contain trigger orders, but the parent
        // being placed is an ordinary market/limit order — HyperLiquid rejects
        // the whole batch, so the combination is refused up front.
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            takeProfitPrice: '60000',
            ...linkage,
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED,
        });
      },
    );

    it.each([
      { tpslLinkage: 'none' as TpslLinkage },
      { grouping: 'na' as const },
    ])(
      'rejects an order that carries its own TP/SL with no linkage (%o)',
      (linkage) => {
        // 'na' grouping submits the TP/SL as standalone triggers tied to
        // neither the parent order nor the resulting position, so they outlive
        // an unfilled parent as orphan reduce-only triggers.
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            takeProfitPrice: '60000',
            ...linkage,
          }),
        ).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TPSL_LINKAGE_REQUIRED,
        });
      },
    );

    it('accepts no linkage when no TP/SL is attached to the order', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          orderType: 'market',
          tpslLinkage: 'none',
        }),
      ).toStrictEqual({ isValid: true });
    });

    it.each([
      { tpslLinkage: 'position' as TpslLinkage },
      { grouping: 'positionTpsl' as const },
      {
        tpslLinkage: 'position' as TpslLinkage,
        grouping: 'positionTpsl' as const,
      },
    ])('rejects position linkage with nothing to link (%o)', (linkage) => {
      // Without an attached TP/SL the batch is just the ordinary parent order
      // carrying `positionTpsl` grouping, which HyperLiquid rejects for the
      // same reason as the attached case: every order in that batch must be a
      // trigger. There is no shape of `placeOrder` request the linkage works
      // on, so it is refused outright.
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          orderType: 'market',
          ...linkage,
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TPSL_POSITION_LINKAGE_UNSUPPORTED,
      });
    });

    // 'position'/'positionTpsl' is covered by the rejection cases below: the
    // spellings agree, but the linkage itself is unsupported on this path.
    it.each([
      ['none', 'na'],
      ['order', 'normalTpsl'],
    ] as [TpslLinkage, 'na' | 'normalTpsl' | 'positionTpsl'][])(
      'accepts %s alongside the equivalent grouping %s',
      (tpslLinkage, grouping) => {
        expect(
          validateOrderParams({
            coin: 'BTC',
            size: '1',
            orderType: 'market',
            tpslLinkage,
            grouping,
          }),
        ).toStrictEqual({ isValid: true });
      },
    );

    it('rejects a linkage that disagrees with the deprecated grouping', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          orderType: 'market',
          tpslLinkage: 'position',
          grouping: 'normalTpsl',
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TPSL_LINKAGE_CONFLICT,
      });
    });
  });

  describe('time in force', () => {
    it('accepts a time in force on a plain limit order', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          price: '50000',
          orderType: 'limit',
          timeInForce: 'ALO',
        }),
      ).toStrictEqual({ isValid: true });
    });

    it.each([
      'market',
      'stop_market',
      'stop_limit',
      'take_profit_market',
      'take_profit_limit',
    ] as OrderType[])('rejects a time in force on %s', (orderType) => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          price: '50000',
          orderType,
          triggerPrice: isTriggerOrderType(orderType) ? '45000' : undefined,
          timeInForce: 'IOC',
        }),
      ).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TIME_IN_FORCE_NOT_SUPPORTED,
      });
    });

    it('leaves orders without a time in force untouched', () => {
      expect(
        validateOrderParams({
          coin: 'BTC',
          size: '1',
          orderType: 'market',
        }),
      ).toStrictEqual({ isValid: true });
    });
  });

  describe('getMaxOrderValue', () => {
    it('applies the limit multiplier to limit-executing trigger types', () => {
      const marketLimit = getMaxOrderValue(50, 'market');

      expect(getMaxOrderValue(50, 'stop_limit')).toBe(
        marketLimit * HYPERLIQUID_ORDER_LIMITS.LimitOrderMultiplier,
      );
      expect(getMaxOrderValue(50, 'take_profit_limit')).toBe(
        getMaxOrderValue(50, 'limit'),
      );
    });

    it('treats market-executing trigger types as market orders', () => {
      expect(getMaxOrderValue(50, 'stop_market')).toBe(
        getMaxOrderValue(50, 'market'),
      );
      expect(getMaxOrderValue(50, 'take_profit_market')).toBe(
        getMaxOrderValue(50, 'market'),
      );
    });
  });
});
