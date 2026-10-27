import { describe, expect, it, vi } from 'vitest';

import { LIGHTER_TX_TYPE_CREATE_ORDER } from '../../../src/constants/lighterConfig.js';
import type { OrderParams } from '../../../src/types/index.js';
import {
  BTC_MARKET,
  buildProvider,
  finishPendingTimersAfterEach,
} from '../../helpers/lighterProvider.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    // Only the service class is doubled; convertKeysToCamelCase stays real so
    // the WebSocket message router operates on faithfully camelized payloads.
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

describe('Lighter post-only placement', () => {
  finishPendingTimersAfterEach();

  const intent: OrderParams = {
    symbol: 'BTC',
    isBuy: true,
    orderType: 'limit',
    timeInForce: 'ALO',
    size: '0.001',
    price: '100000',
  };
  it('validates and signs ALO as native limit TIF2 with resting expiry', async () => {
    const built = buildProvider();
    expect(await built.provider.validateOrder(intent)).toStrictEqual({
      isValid: true,
    });
    expect(built.calls).toHaveLength(0);
    const result = await built.provider.placeOrder(intent);
    expect(result.success).toBe(true);
    const create = built.calls.find(
      (call) => call.function === '_signCreateOrder',
    );
    expect(create?.params.slice(3, 11)).toStrictEqual([
      '100',
      '1000000',
      0,
      0,
      2,
      0,
      '0',
      -1,
    ]);
    expect(built.clientInstance.getOrderBookOrders).toHaveBeenCalledTimes(3);
  });
  it.each([
    { isBuy: true, price: '100001' },
    { isBuy: false, price: '99999' },
  ])('refuses crossing $isBuy before signer setup', async (side) => {
    const built = buildProvider();
    const params = { ...intent, ...side };
    expect(await built.provider.validateOrder(params)).toMatchObject({
      isValid: false,
      error: expect.stringContaining('cross') as string,
    });
    expect(await built.provider.placeOrder(params)).toMatchObject({
      success: false,
      error: expect.stringContaining('cross') as string,
    });
    expect(built.calls).toHaveLength(0);
    expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
  });
  it('refuses market ALO and inactive markets without signer setup', async () => {
    const built = buildProvider();
    expect(
      await built.provider.placeOrder({ ...intent, orderType: 'market' }),
    ).toMatchObject({
      success: false,
      error: expect.stringContaining('limit') as string,
    });
    built.clientInstance.getOrderBooks.mockResolvedValue([
      { ...BTC_MARKET, status: 'inactive' },
    ]);
    expect(await built.provider.placeOrder(intent)).toMatchObject({
      success: false,
      error: expect.stringContaining('active') as string,
    });
    expect(built.calls).toHaveLength(0);
  });
  it.each([{ size: '0.00001' }, { size: '0.001001' }, { price: '0.01' }])(
    'refuses invalid size/price/minimum %s without signer setup',
    async (override) => {
      const built = buildProvider();
      expect(
        (await built.provider.validateOrder({ ...intent, ...override }))
          .isValid,
      ).toBe(false);
      expect(
        (await built.provider.placeOrder({ ...intent, ...override })).success,
      ).toBe(false);
      expect(built.calls).toHaveLength(0);
    },
  );
  it('refuses a delayed or failed book before signer setup', async () => {
    const built = buildProvider();
    const now = vi.spyOn(Date, 'now');
    const started = Date.now();
    built.clientInstance.getOrderBookOrders.mockImplementation(async () => {
      now.mockReturnValue(started + 6000);
      return { code: 200, totalBids: 0, totalAsks: 0, bids: [], asks: [] };
    });
    expect(await built.provider.placeOrder(intent)).toMatchObject({
      success: false,
      error: expect.stringContaining('stale') as string,
    });
    expect(built.calls).toHaveLength(0);
    now.mockRestore();
    built.clientInstance.getOrderBookOrders.mockRejectedValue(
      new Error('book unavailable'),
    );
    expect(await built.provider.placeOrder(intent)).toMatchObject({
      success: false,
      error: 'book unavailable',
    });
  });
  it('fences an account switch during book preflight', async () => {
    const built = buildProvider();
    built.clientInstance.getOrderBookOrders.mockImplementation(async () => {
      built.getUserAddressMock.mockReturnValue('0xother');
      return { code: 200, totalBids: 0, totalAsks: 0, bids: [], asks: [] };
    });
    expect((await built.provider.placeOrder(intent)).success).toBe(false);
    expect(built.calls).toHaveLength(0);
  });
  it('rechecks crossing before signing after setup', async () => {
    const built = buildProvider();
    built.clientInstance.getOrderBookOrders
      .mockResolvedValueOnce({
        code: 200,
        totalBids: 0,
        totalAsks: 0,
        bids: [],
        asks: [],
      })
      .mockResolvedValue({
        code: 200,
        totalBids: 0,
        totalAsks: 1,
        bids: [],
        asks: [
          {
            orderId: '2',
            orderIndex: 2,
            ownerAccountIndex: 99,
            initialBaseAmount: '1',
            remainingBaseAmount: '1',
            price: '100000',
            orderExpiry: 0,
            transactionTime: 1,
          },
        ],
      });
    expect(await built.provider.placeOrder(intent)).toMatchObject({
      success: false,
      error: expect.stringContaining('cross') as string,
    });
    expect(
      built.calls.some((call) => call.function === '_signCreateOrder'),
    ).toBe(false);
  });
  it.each(['disconnect', 'account switch'] as const)(
    'fences %s during ALO signing before send',
    async (change) => {
      const built = buildProvider();
      const execute = vi.spyOn(built.bridge, 'execute').getMockImplementation();
      if (!execute) {
        throw new Error('Missing bridge implementation');
      }
      vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
        const result = await execute(call);
        if (call.function === '_signCreateOrder') {
          if (change === 'disconnect') {
            await built.provider.disconnect();
          } else {
            built.getUserAddressMock.mockReturnValue('0xother');
          }
        }
        return result;
      });
      expect((await built.provider.placeOrder(intent)).success).toBe(false);
      expect(
        built.clientInstance.sendTx.mock.calls.filter(([kind]) => kind === 14),
      ).toHaveLength(0);
    },
  );
  it('snapshots caller intent before the asynchronous book read', async () => {
    const built = buildProvider();
    const params = { ...intent };
    built.clientInstance.getOrderBookOrders.mockImplementation(async () => {
      params.isBuy = false;
      params.price = '90000';
      params.size = '0.1';
      return { code: 200, totalBids: 0, totalAsks: 0, bids: [], asks: [] };
    });
    expect((await built.provider.placeOrder(params)).success).toBe(true);
    expect(
      built.calls
        .find((call) => call.function === '_signCreateOrder')
        ?.params.slice(3, 8),
    ).toStrictEqual(['100', '1000000', 0, 0, 2]);
  });
  it.each([
    { chaseIntervalMs: 1000 },
    { clientOrderId: '123' },
    { takeProfitSize: '0.001' },
  ])('refuses unsupported ALO intent %s before setup', async (field) => {
    const built = buildProvider();
    expect(
      (await built.provider.validateOrder({ ...intent, ...field })).isValid,
    ).toBe(false);
    expect(
      (await built.provider.placeOrder({ ...intent, ...field })).success,
    ).toBe(false);
    expect(built.calls).toHaveLength(0);
  });
  it('preserves the exact client handle and quarantines response loss across restart', async () => {
    const deps = createMockInfrastructure();
    const disk = new Map<string, string>();
    vi.spyOn(deps.diskCache, 'getItem').mockImplementation(
      async (key: string) => disk.get(key) ?? null,
    );
    vi.spyOn(deps.diskCache, 'setItem').mockImplementation(
      async (key: string, value: string) => {
        disk.set(key, value);
      },
    );
    const built = buildProvider({ platformDependencies: deps });
    built.clientInstance.sendTx.mockImplementation(async (kind: number) => {
      if (kind === LIGHTER_TX_TYPE_CREATE_ORDER) {
        throw new Error('response lost');
      }
      return { code: 200, txHash: 'registered' };
    });
    const result = await built.provider.placeOrder(intent);
    expect(result).toMatchObject({
      success: false,
      orderId: expect.any(String) as string,
      providerId: 'lighter',
      error: expect.stringContaining('response lost') as string,
    });
    expect([...disk.values()].join(' ')).toContain(
      `placeOrder:BTC:${result.orderId}`,
    );
    const restarted = buildProvider({ platformDependencies: deps });
    expect((await restarted.provider.placeOrder(intent)).success).toBe(false);
    expect(
      restarted.calls.some((call) => call.function === '_signCreateOrder'),
    ).toBe(false);
  });
});
