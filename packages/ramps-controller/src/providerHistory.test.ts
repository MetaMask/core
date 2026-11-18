import { describe, expect, it } from 'vitest';

import {
  findFirstProviderById,
  getPreviouslyUsedProviders,
} from './providerHistory.js';
import type { Provider, RampsOrder } from './RampsService.js';
import { RampsOrderStatus } from './RampsService.js';

const makeProvider = (id: string): Provider => ({
  id,
  name: id,
  environmentType: 'PRODUCTION',
  description: '',
  hqAddress: '',
  links: [],
  logos: { light: '', dark: '', height: 0, width: 0 },
});

const makeOrder = (
  providerId: string | undefined,
  createdAt: number | string,
  overrides: Partial<RampsOrder> = {},
): RampsOrder =>
  ({
    provider: providerId === undefined ? undefined : makeProvider(providerId),
    createdAt,
    status: RampsOrderStatus.Completed,
    orderType: 'BUY',
    ...overrides,
  }) as RampsOrder;

const moonpay = makeProvider('moonpay');
const paypal = makeProvider('paypal');
const robinhood = makeProvider('robinhood');
const transak = makeProvider('/providers/transak');
const providers = [transak, paypal, robinhood, moonpay];

describe('findFirstProviderById', () => {
  it('returns the first match in id order, ignoring the prefix and case', () => {
    expect(
      findFirstProviderById(providers, ['unknown', '/providers/PayPal']),
    ).toBe(paypal);
    expect(findFirstProviderById(providers, ['transak', 'moonpay'])).toBe(
      transak,
    );
  });

  it('returns undefined when nothing matches', () => {
    expect(findFirstProviderById(providers, ['unknown'])).toBeUndefined();
    expect(findFirstProviderById(providers, [])).toBeUndefined();
  });
});

describe('getPreviouslyUsedProviders', () => {
  it('returns providers of completed buys, most recent first, without duplicates', () => {
    const orders = [
      makeOrder('/providers/PayPal', '2026-06-15T10:00:00.000Z'),
      makeOrder('moonpay', Date.parse('2026-10-10')),
      makeOrder('paypal', Date.parse('2026-01-01')),
    ];

    expect(getPreviouslyUsedProviders({ providers, orders })).toStrictEqual([
      moonpay,
      paypal,
    ]);
  });

  it('ignores sells, orders that are not completed and orders without a provider', () => {
    const orders = [
      makeOrder('moonpay', 3, { orderType: 'SELL' }),
      makeOrder('paypal', 2, { status: RampsOrderStatus.Pending }),
      makeOrder(undefined, 1),
      makeOrder('robinhood', 0, { orderType: 'DEPOSIT' }),
    ];

    expect(getPreviouslyUsedProviders({ providers, orders })).toStrictEqual([
      robinhood,
    ]);
  });

  it('merges extraHistory by date and skips providers that are not listed', () => {
    const orders = [makeOrder('paypal', Date.parse('2026-10-10'))];

    expect(
      getPreviouslyUsedProviders({
        providers,
        orders,
        extraHistory: [
          { providerId: 'transak', completedAt: '1793000000000' },
          { providerId: 'not-listed', completedAt: Date.parse('2027-01-01') },
          { providerId: '', completedAt: Date.parse('2027-01-01') },
        ],
      }),
    ).toStrictEqual([transak, paypal]);
  });

  it('sorts an order with an unreadable date last', () => {
    const orders = [
      makeOrder('robinhood', 'not a date'),
      makeOrder('moonpay', Date.parse('2020-01-01')),
    ];

    expect(getPreviouslyUsedProviders({ providers, orders })).toStrictEqual([
      moonpay,
      robinhood,
    ]);
  });
});
