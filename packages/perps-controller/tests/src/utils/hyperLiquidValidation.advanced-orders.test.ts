import { HYPERLIQUID_ORDER_LIMITS } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { OrderType } from '../../../src/types/perps-types.js';
import {
  getMaxOrderValue,
  validateOrderParams,
} from '../../../src/utils/hyperLiquidValidation.js';

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
