import { describe, expect, it } from 'vitest';

import {
  getFillAggregationKey,
  getOrderFillKey,
} from '../../../src/utils/orderFills.js';

const fill = {
  orderId: '42',
  symbol: 'ETH',
  direction: 'Close Long',
  timestamp: 1700000000999,
  size: '0.5',
  price: '2000',
};

describe('getOrderFillKey', () => {
  it('falls back to the fill content without an execution id', () => {
    expect(getOrderFillKey(fill)).toBe('42-1700000000999-0.5-2000');
  });

  it('uses the execution id when present', () => {
    expect(getOrderFillKey({ ...fill, fillId: 'ETH-1-9' })).toBe('ETH-1-9');
  });

  it('scopes the execution id by provider', () => {
    expect(
      getOrderFillKey({ ...fill, fillId: 'ETH-1-9', providerId: 'lighter' }),
    ).toBe('lighter:ETH-1-9');
  });

  it('scopes the content key by provider', () => {
    expect(getOrderFillKey({ ...fill, providerId: 'hyperliquid' })).not.toBe(
      getOrderFillKey({ ...fill, providerId: 'lighter' }),
    );
    expect(getOrderFillKey({ ...fill, providerId: 'lighter' })).toBe(
      'lighter:42-1700000000999-0.5-2000',
    );
  });

  it('keeps partial fills of one order apart by execution id', () => {
    expect(getOrderFillKey({ ...fill, fillId: 'a' })).not.toBe(
      getOrderFillKey({ ...fill, fillId: 'b' }),
    );
  });
});

describe('getFillAggregationKey', () => {
  it.each([
    ['Close Long', 'ETH-Close Long-second-1700000000'],
    ['Close Short', 'ETH-Close Short-second-1700000000'],
    ['Sell', 'ETH-Sell-second-1700000000'],
    ['Auto-Deleveraging', 'ETH-Auto-Deleveraging-second-1700000000'],
    ['Open Long', 'ETH-Open Long-order-42'],
    ['Buy', 'ETH-Buy-order-42'],
    ['Long > Short', 'ETH-Long > Short-order-42'],
  ])('groups %s as %s', (direction, expected) => {
    expect(getFillAggregationKey({ ...fill, direction })).toBe(expected);
  });

  it('keeps two venues closing one symbol in the same second apart', () => {
    const hyperliquid = getFillAggregationKey({
      ...fill,
      providerId: 'hyperliquid',
    });
    const lighter = getFillAggregationKey({ ...fill, providerId: 'lighter' });

    expect(hyperliquid).toBe('hyperliquid:ETH-Close Long-second-1700000000');
    expect(lighter).toBe('lighter:ETH-Close Long-second-1700000000');
  });

  it('keys an order fill without an order id by its timestamp', () => {
    expect(
      getFillAggregationKey({ ...fill, direction: 'Open Short', orderId: '' }),
    ).toBe('ETH-Open Short-order-solo-1700000000999');
  });

  it.each(['', 'Spot Dust Conversion', 'Liquidation'])(
    'does not group direction %s',
    (direction) => {
      expect(getFillAggregationKey({ ...fill, direction })).toBeUndefined();
    },
  );
});
