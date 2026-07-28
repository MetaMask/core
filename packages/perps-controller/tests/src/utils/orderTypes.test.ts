import type { Order } from '../../../src/types/index.js';
import type {
  OrderType,
  TriggerOrderType,
} from '../../../src/types/perps-types.js';
import {
  TRIGGER_ORDER_TYPES,
  buildPositionTriggerOrderFromOrder,
  buildTriggerOrderType,
  getTriggerDirection,
  getTriggerExecution,
  isLimitExecutionOrderType,
  isTriggerOrderType,
} from '../../../src/utils/orderTypes.js';

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  orderId: '111',
  symbol: 'BTC',
  side: 'sell',
  orderType: 'market',
  size: '0.5',
  originalSize: '0.5',
  price: '50000',
  filledSize: '0',
  remainingSize: '0.5',
  status: 'open',
  timestamp: 1_700_000_000_000,
  ...overrides,
});

describe('orderTypes', () => {
  describe('TRIGGER_ORDER_TYPES', () => {
    it('lists every trigger placement type', () => {
      expect(TRIGGER_ORDER_TYPES).toStrictEqual([
        'stop_market',
        'stop_limit',
        'take_profit_market',
        'take_profit_limit',
      ]);
    });
  });

  describe('isTriggerOrderType', () => {
    it.each(TRIGGER_ORDER_TYPES)('returns true for %s', (orderType) => {
      expect(isTriggerOrderType(orderType)).toBe(true);
    });

    it.each(['market', 'limit'] as OrderType[])(
      'returns false for %s',
      (orderType) => {
        expect(isTriggerOrderType(orderType)).toBe(false);
      },
    );
  });

  describe('isLimitExecutionOrderType', () => {
    it.each([
      ['limit', true],
      ['stop_limit', true],
      ['take_profit_limit', true],
      ['market', false],
      ['stop_market', false],
      ['take_profit_market', false],
    ] as [OrderType, boolean][])('maps %s to %s', (orderType, expected) => {
      expect(isLimitExecutionOrderType(orderType)).toBe(expected);
    });
  });

  describe('getTriggerExecution', () => {
    it.each([
      ['stop_market', 'market'],
      ['stop_limit', 'limit'],
      ['take_profit_market', 'market'],
      ['take_profit_limit', 'limit'],
      ['market', 'market'],
      ['limit', 'limit'],
    ] as [OrderType, string][])('maps %s to %s', (orderType, expected) => {
      expect(getTriggerExecution(orderType)).toBe(expected);
    });
  });

  describe('getTriggerDirection', () => {
    it.each([
      ['stop_market', 'stop'],
      ['stop_limit', 'stop'],
      ['take_profit_market', 'take_profit'],
      ['take_profit_limit', 'take_profit'],
    ] as [TriggerOrderType, string][])(
      'maps %s to %s',
      (orderType, expected) => {
        expect(getTriggerDirection(orderType)).toBe(expected);
      },
    );
  });

  describe('buildTriggerOrderType', () => {
    it.each([
      [{ direction: 'stop', execution: 'market' }, 'stop_market'],
      [{ direction: 'stop', execution: 'limit' }, 'stop_limit'],
      [{ direction: 'take_profit', execution: 'market' }, 'take_profit_market'],
      [{ direction: 'take_profit', execution: 'limit' }, 'take_profit_limit'],
    ] as [Parameters<typeof buildTriggerOrderType>[0], TriggerOrderType][])(
      'builds %o into %s',
      (params, expected) => {
        expect(buildTriggerOrderType(params)).toBe(expected);
      },
    );
  });

  describe('buildPositionTriggerOrderFromOrder', () => {
    it('returns undefined for a non-trigger order', () => {
      expect(
        buildPositionTriggerOrderFromOrder({
          order: createOrder(),
          positionSize: '1',
        }),
      ).toBeUndefined();
    });

    it('returns undefined when the placement type is unknown', () => {
      expect(
        buildPositionTriggerOrderFromOrder({
          order: createOrder({ isTrigger: true }),
          positionSize: '1',
        }),
      ).toBeUndefined();
    });

    it('marks a quantity-scoped trigger as partial', () => {
      const result = buildPositionTriggerOrderFromOrder({
        order: createOrder({
          orderId: '222',
          isTrigger: true,
          triggerOrderType: 'take_profit_limit',
          triggerPrice: '60000',
          size: '0.4',
          reduceOnly: true,
        }),
        positionSize: '1',
      });

      expect(result).toStrictEqual({
        orderId: '222',
        orderType: 'take_profit_limit',
        triggerPrice: '60000',
        size: '0.4',
        isPartial: true,
        reduceOnly: true,
      });
    });

    it('resolves a whole-position trigger (size 0) against the position size', () => {
      const result = buildPositionTriggerOrderFromOrder({
        order: createOrder({
          isTrigger: true,
          triggerOrderType: 'stop_market',
          triggerPrice: '40000',
          size: '0',
          reduceOnly: true,
        }),
        // Short position: the absolute size is what the trigger closes
        positionSize: '-1.5',
      });

      expect(result?.size).toBe('1.5');
      expect(result?.isPartial).toBe(false);
    });

    it('falls back to the order price when no trigger price is present', () => {
      const result = buildPositionTriggerOrderFromOrder({
        order: createOrder({
          isTrigger: true,
          triggerOrderType: 'stop_limit',
          price: '45000',
          size: '1',
        }),
        positionSize: '1',
      });

      expect(result?.triggerPrice).toBe('45000');
      expect(result?.isPartial).toBe(false);
      expect(result?.reduceOnly).toBe(false);
    });
  });
});
