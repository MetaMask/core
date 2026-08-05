import type { Order } from '../../../src/types/index.js';
import type {
  OrderType,
  TriggerOrderType,
} from '../../../src/types/perps-types.js';
import {
  TRIGGER_ORDER_TYPES,
  hashTriggerOrders,
  toSDKTimeInForce,
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

  describe('hashTriggerOrders', () => {
    const trigger = {
      orderId: '1',
      direction: 'stop' as const,
      orderType: 'stop_market' as const,
      triggerPrice: '45000',
      size: '0.5',
      isPartial: false,
      reduceOnly: true,
    };

    it('treats empty and absent the same', () => {
      expect(hashTriggerOrders([])).toBe('0');
      expect(hashTriggerOrders(undefined)).toBe('0');
    });

    it('changes the hash when a trigger is added', () => {
      // Streamed positions only re-emit when this string moves.
      expect(hashTriggerOrders([trigger])).not.toBe('0');
    });

    it.each([
      ['repriced', [{ ...trigger, triggerPrice: '46000' }]],
      ['resized', [{ ...trigger, size: '0.25' }]],
      ['partial', [{ ...trigger, isPartial: true }]],
      ['replaced', [{ ...trigger, orderId: '2' }]],
      // A trigger modified in place keeps its order ID, price, and size, so
      // execution semantics are the only thing that moves.
      [
        'switched from market to limit execution',
        [{ ...trigger, orderType: 'stop_limit' as const }],
      ],
    ])('changes the hash when a trigger is %s', (_label, orders) => {
      expect(hashTriggerOrders(orders)).not.toBe(hashTriggerOrders([trigger]));
    });

    it('is stable for unchanged input', () => {
      expect(hashTriggerOrders([trigger])).toBe(hashTriggerOrders([trigger]));
    });
  });

  describe('toSDKTimeInForce', () => {
    it.each([
      ['GTC', 'Gtc'],
      ['IOC', 'Ioc'],
      ['ALO', 'Alo'],
      [undefined, 'Gtc'],
    ] as [('GTC' | 'IOC' | 'ALO') | undefined, string][])(
      'maps %s to %s',
      (timeInForce, expected) => {
        expect(toSDKTimeInForce(timeInForce)).toBe(expected);
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
        direction: 'take_profit',
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

    it.each([
      ['grown', '2', '2'],
      ['shrunk', '0.5', '0.5'],
    ])(
      're-resolves a position-bound trigger against a position that has %s',
      (_label, positionSize, expectedSize) => {
        // adaptOrderFromSDK already collapsed the exchange's size 0 against the
        // position as it stood then, so the size carried here is stale. The
        // position-bound flag, not the number, says what the trigger covers.
        const result = buildPositionTriggerOrderFromOrder({
          order: createOrder({
            isTrigger: true,
            triggerOrderType: 'take_profit_market',
            triggerPrice: '60000',
            size: '1',
            reduceOnly: true,
            isPositionTpsl: true,
          }),
          positionSize,
        });

        expect(result?.size).toBe(expectedSize);
        // A position-bound TP/SL always covers the whole position, however it
        // has been resized.
        expect(result?.isPartial).toBe(false);
      },
    );

    it.each([
      ['long', '1', '60000', 'take_profit'],
      ['long', '1', '40000', 'stop'],
      ['short', '-1', '40000', 'take_profit'],
      ['short', '-1', '60000', 'stop'],
    ])(
      'classifies an unnamed trigger on a %s position at %s by price',
      (_side, positionSize, triggerPrice, expectedDirection) => {
        // HyperLiquid's bare 'Trigger' names no direction and no execution.
        // The direction is still recoverable from the trigger price against
        // the entry, and that is what decides which array the order joins.
        const result = buildPositionTriggerOrderFromOrder({
          order: createOrder({
            isTrigger: true,
            triggerPrice,
            size: '1',
            reduceOnly: true,
          }),
          positionSize,
          entryPrice: '50000',
        });

        expect(result?.direction).toBe(expectedDirection);
        // The execution mode is genuinely unknown, so it is left unstated
        // rather than guessed.
        expect(result?.orderType).toBeUndefined();
      },
    );

    it.each([
      ['long', '1', 'stop'],
      ['short', '-1', 'stop'],
    ])(
      'classifies a %s trigger sitting exactly at entry as a stop',
      (_side, positionSize, expectedDirection) => {
        // The legacy price fallback treats trigger == entry as a stop on both
        // sides. Classifying it as a take profit here would put the order in
        // takeProfitOrders while the scalar stopLossPrice still called it a
        // stop — the two disagreeing about the same order.
        const result = buildPositionTriggerOrderFromOrder({
          order: createOrder({
            isTrigger: true,
            triggerPrice: '50000',
            size: '1',
            reduceOnly: true,
          }),
          positionSize,
          entryPrice: '50000',
        });

        expect(result?.direction).toBe(expectedDirection);
      },
    );

    it('states the direction alongside a named placement type', () => {
      const result = buildPositionTriggerOrderFromOrder({
        order: createOrder({
          isTrigger: true,
          triggerOrderType: 'take_profit_limit',
          triggerPrice: '60000',
          size: '1',
        }),
        positionSize: '1',
      });

      expect(result?.direction).toBe('take_profit');
      expect(result?.orderType).toBe('take_profit_limit');
    });

    it('returns undefined for an unnamed trigger with no position to classify against', () => {
      expect(
        buildPositionTriggerOrderFromOrder({
          order: createOrder({ isTrigger: true, triggerPrice: '60000' }),
          positionSize: '1',
        }),
      ).toBeUndefined();
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
