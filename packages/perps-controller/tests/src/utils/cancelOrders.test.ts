import { describe, expect, it } from 'vitest';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type {
  CancelOrdersParams,
  PerpsProvider,
  PerpsProviderType,
} from '../../../src/types/index.js';
import {
  getUnroutedCancelOrdersRefusal,
  resolveCancelSelection,
} from '../../../src/utils/cancelOrders.js';

const orders = [{ orderId: 'one', providerId: 'hyperliquid' as const }];

describe('resolveCancelSelection', () => {
  it.each([
    [{}, { kind: 'all' }],
    [{ cancelAll: false }, { kind: 'all' }],
    [
      { cancelAll: true, orders: [], orderIds: [], symbols: [] },
      { kind: 'all' },
    ],
    [
      { orders, orderIds: ['ignored'], symbols: ['ignored'] },
      { kind: 'orders', orders },
    ],
    [{ orders: [], orderIds: ['ignored'] }, { kind: 'none' }],
    [
      { orderIds: ['one'], symbols: ['ignored'] },
      { kind: 'orderIds', orderIds: ['one'] },
    ],
    [{ orderIds: [], symbols: ['ignored'] }, { kind: 'none' }],
    [{ symbols: ['BTC'] }, { kind: 'symbols', symbols: ['BTC'] }],
    [{ symbols: [] }, { kind: 'none' }],
  ] satisfies [CancelOrdersParams, unknown][])(
    'resolves %j to %j',
    (params, expected) => {
      expect(resolveCancelSelection(params)).toStrictEqual(expected);
    },
  );
});

describe('getUnroutedCancelOrdersRefusal', () => {
  const multiVenueProvider = {
    protocolId: 'aggregated',
    getProviderIds: () => ['hyperliquid', 'lighter'],
  } as PerpsProvider;
  it.each([{ orderIds: ['one'] }, { symbols: ['BTC'] }])(
    'refuses non-empty legacy filters %j',
    (params) => {
      expect(
        getUnroutedCancelOrdersRefusal(
          multiVenueProvider,
          resolveCancelSelection(params),
        ),
      ).toStrictEqual({
        success: false,
        successCount: 0,
        failureCount: 0,
        results: [],
        error: PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED,
      });
    },
  );
  it.each([
    { cancelAll: true },
    {},
    { orders },
    { orders: [] },
    { orderIds: [] },
    { symbols: [] },
  ])('allows unambiguous selections %j', (params) => {
    expect(
      getUnroutedCancelOrdersRefusal(
        multiVenueProvider,
        resolveCancelSelection(params),
      ),
    ).toBeUndefined();
  });
  it.each([
    { protocolId: 'hyperliquid' },
    {
      protocolId: 'aggregated',
      getProviderIds: (): PerpsProviderType[] => ['hyperliquid'],
    },
  ])('allows legacy filters with one execution venue', (provider) => {
    expect(
      getUnroutedCancelOrdersRefusal(
        provider as PerpsProvider,
        resolveCancelSelection({ orderIds: ['one'] }),
      ),
    ).toBeUndefined();
  });
  it('fails closed for an aggregated wrapper with unknown membership', () => {
    expect(
      getUnroutedCancelOrdersRefusal(
        { protocolId: 'aggregated' } as PerpsProvider,
        resolveCancelSelection({ symbols: ['BTC'] }),
      )?.error,
    ).toBe(PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED);
  });
});
