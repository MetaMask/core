import { describe, expect, it, vi } from 'vitest';

import { OrderDiscoveryError } from '../../../src/index.js';
import { AggregatedPerpsProvider } from '../../../src/providers/AggregatedPerpsProvider.js';
import { TradingService } from '../../../src/services/TradingService.js';
import type {
  CancelOrdersParams,
  GetOrdersParams,
  GetPositionsParams,
  Order,
  PerpsProvider,
  PerpsProviderType,
  SubscribeAccountParams,
} from '../../../src/types/index.js';
import type { LighterAccountResponse } from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  buildProvider,
  finishPendingTimersAfterEach,
  ownershipController,
  fakeStreamCtor,
  StreamFakeWebSocket,
} from '../../helpers/lighterProvider.js';
import { createMockHyperLiquidProvider } from '../../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockServiceContext,
} from '../../helpers/serviceMocks.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

const otherAccountId = `eip155:1:0x${'b'.repeat(40)}` as const;

const hyperliquidOrder: Order = {
  orderId: 'hl-order',
  symbol: 'ETH',
  side: 'buy',
  orderType: 'limit',
  price: '3000',
  size: '1',
  originalSize: '1',
  filledSize: '0',
  remainingSize: '1',
  status: 'open',
  timestamp: 1,
};

/**
 * Pair a real Lighter adapter with a healthy HyperLiquid venue.
 *
 * @returns Providers, transport mocks and service infrastructure.
 */
function setup(): ReturnType<typeof buildProvider> & {
  hyperliquid: ReturnType<typeof createMockHyperLiquidProvider>;
  aggregate: AggregatedPerpsProvider;
  infrastructure: ReturnType<typeof createMockInfrastructure>;
} {
  const lighter = buildProvider();
  const hyperliquid = createMockHyperLiquidProvider();
  const infrastructure = createMockInfrastructure();
  const aggregate = new AggregatedPerpsProvider({
    providers: new Map<PerpsProviderType, PerpsProvider>([
      ['hyperliquid', hyperliquid],
      ['lighter', lighter.provider],
    ]),
    defaultProvider: 'hyperliquid',
    infrastructure,
  });
  hyperliquid.getOpenOrders.mockResolvedValue([hyperliquidOrder]);
  hyperliquid.cancelOrders?.mockResolvedValue({
    success: true,
    successCount: 1,
    failureCount: 0,
    results: [{ orderId: 'hl-order', symbol: 'ETH', success: true }],
  });
  hyperliquid.closePositions?.mockResolvedValue({
    success: true,
    successCount: 1,
    failureCount: 0,
    results: [{ symbol: 'ETH', success: true }],
  });
  return { ...lighter, hyperliquid, aggregate, infrastructure };
}

describe('aggregated account and destructive-operation discovery', () => {
  finishPendingTimersAfterEach();

  it('reports Lighter unavailable rather than subscribing the selected wallet for another account', async () => {
    const { provider, clientInstance, hyperliquid, aggregate } = setup();
    const selectedState = await provider.getAccountState();
    const callback = vi.fn();
    const cleanup = vi.fn();
    hyperliquid.subscribeToAccount.mockImplementation(
      (params: SubscribeAccountParams) => {
        params.callback({ ...selectedState, totalBalance: '250' });
        return cleanup;
      },
    );
    clientInstance.getAccountByIndex.mockClear();

    const unsubscribe = aggregate.subscribeToAccount({
      accountId: otherAccountId,
      callback,
    });

    expect(hyperliquid.subscribeToAccount).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: otherAccountId }),
    );
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        totalBalance: '250',
        providerStates: expect.objectContaining({
          lighter: expect.objectContaining({ status: 'unavailable' }),
        }),
      }),
      {
        status: 'partial',
        availableProviders: ['hyperliquid'],
        unavailableProviders: ['lighter'],
      },
    );
    expect(clientInstance.getAccountByIndex).not.toHaveBeenCalled();
    unsubscribe();
    expect(cleanup).toHaveBeenCalledOnce();
    await provider.disconnect();
  });

  it('rejects an unsupported scope on a direct Lighter subscription before opening a session', () => {
    const { provider, clientInstance } = buildProvider();
    expect(() =>
      provider.subscribeToAccount({
        accountId: otherAccountId,
        callback: vi.fn(),
      }),
    ).toThrow('selected wallet account');
    expect(clientInstance.getAccountByIndex).not.toHaveBeenCalled();
  });

  it('accepts a case-insensitive selected scope but does not leak a later selected wallet through it', async () => {
    StreamFakeWebSocket.instances = [];
    const { provider, getUserAddressMock } = buildProvider({
      webSocketCtor: fakeStreamCtor,
      registeredKey: '9c'.repeat(40),
    });
    const callback = vi.fn();
    const unsubscribe = provider.subscribeToAccount({
      accountId: `eip155:1:${String(getUserAddressMock()).toUpperCase()}`,
      callback,
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const socket = StreamFakeWebSocket.instances[0];
    socket.open();
    const frame = {
      data: JSON.stringify({
        type: 'subscribed/user_stats',
        channel: 'user_stats:28',
        stats: {
          collateral: '10000',
          portfolio_value: '11000',
          leverage: '2',
          available_balance: '6000',
          margin_usage: '40',
          buying_power: '0',
        },
      }),
    };
    socket.onmessage?.(frame);
    expect(callback).toHaveBeenLastCalledWith(
      expect.objectContaining({ totalBalance: '11000' }),
    );

    getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
    socket.onmessage?.(frame);
    expect(callback).toHaveBeenLastCalledWith(null);
    unsubscribe();
    callback.mockClear();
    socket.onmessage?.(frame);
    expect(callback).not.toHaveBeenCalled();
    await provider.disconnect();
  });

  it('keeps healthy strict discovery equivalent to existing reads', async () => {
    const { aggregate, hyperliquid } = setup();
    hyperliquid.getPositions.mockResolvedValue([]);
    expect(
      await aggregate.getPositions({ throwOnUnavailable: true }),
    ).toStrictEqual(await aggregate.getPositions());
    expect(
      await aggregate.getOpenOrders({ throwOnUnavailable: true }),
    ).toStrictEqual(await aggregate.getOpenOrders());
  });

  it('rejects strict aggregated position discovery instead of dropping an unavailable venue', async () => {
    const { aggregate, hyperliquid, clientInstance } = setup();
    hyperliquid.getPositions.mockResolvedValue([]);
    clientInstance.getAccountByIndex.mockRejectedValue(
      new Error('account transport down'),
    );
    await expect(
      aggregate.getPositions({ throwOnUnavailable: true }),
    ).rejects.toThrow('account transport down');
  });

  it.each([
    {
      failure: 'transport failure',
      readAccount: (): Promise<LighterAccountResponse> =>
        Promise.reject(new Error('account transport down')),
      error: 'account transport down',
    },
    {
      failure: 'missing account payload',
      readAccount: (): Promise<LighterAccountResponse> =>
        Promise.resolve({ code: 200, accounts: [] }),
      error: 'Lighter account 28 not returned',
    },
  ])(
    'rejects direct Lighter close-all discovery on $failure instead of reporting no positions',
    async ({ readAccount, error }) => {
      const { provider, clientInstance, infrastructure } = setup();
      await provider.getPositions();
      clientInstance.getAccountByIndex.mockImplementation(readAccount);
      const close = vi.spyOn(provider, 'closePosition');
      const trading = new TradingService(infrastructure);
      const context = createMockServiceContext({
        getPositions: (params?: GetPositionsParams) =>
          provider.getPositions(params),
      });

      await expect(
        trading.closePositions({
          provider,
          params: { closeAll: true },
          context,
        }),
      ).rejects.toThrow(error);
      expect(close).not.toHaveBeenCalled();
      // Ordinary display reads keep their established lenient behavior.
      expect(await provider.getPositions()).toStrictEqual([]);
    },
  );

  it('keeps confirmed empty direct Lighter close-all as a no-op', async () => {
    const { provider, clientInstance, infrastructure } = setup();
    clientInstance.getAccountByIndex.mockResolvedValue({
      code: 200,
      accounts: [{ ...ACCOUNT, positions: [] }],
    });
    const close = vi.spyOn(provider, 'closePosition');
    const trading = new TradingService(infrastructure);

    const result = await trading.closePositions({
      provider,
      params: { closeAll: true },
      context: createMockServiceContext({
        getPositions: (params?: GetPositionsParams) =>
          provider.getPositions(params),
      }),
    });

    expect(result).toStrictEqual({
      success: false,
      successCount: 0,
      failureCount: 0,
      results: [],
    });
    expect(close).not.toHaveBeenCalled();
  });

  it('retains successful closes while reporting a real Lighter account transport failure', async () => {
    const { aggregate, hyperliquid, clientInstance, provider } = setup();
    clientInstance.getAccountByIndex.mockRejectedValue(
      new Error('account transport down'),
    );
    const close = vi.spyOn(provider, 'closePosition');

    const result = await aggregate.closePositions({ closeAll: true });

    expect(hyperliquid.closePositions).toHaveBeenCalledWith({ closeAll: true });
    expect(result).toMatchObject({ success: true, successCount: 1 });
    expect(result.error).toBe('BATCH_INCOMPLETE');
    expect(result).toMatchObject({
      failures: [{ providerId: 'lighter', error: 'account transport down' }],
    });
    expect(close).not.toHaveBeenCalled();
  });

  it('treats a missing bound Lighter account payload as unavailable, not confirmed empty', async () => {
    const { aggregate, provider, clientInstance } = setup();
    await provider.getPositions();
    clientInstance.getAccountByIndex.mockResolvedValue({
      code: 200,
      accounts: [],
    });
    const result = await aggregate.closePositions({ closeAll: true });
    expect(result.error).toBe('BATCH_INCOMPLETE');
    expect(result).toMatchObject({
      failures: [
        { providerId: 'lighter', error: 'Lighter account 28 not returned' },
      ],
    });
    expect(result.successCount).toBe(1);
  });

  it('still treats a wallet without a Lighter account as empty for strict reads', async () => {
    const { provider, clientInstance } = buildProvider({
      configuredAccountIndex: null,
    });
    clientInstance.getAccountsByL1Address.mockResolvedValue({
      code: 200,
      l1Address: ACCOUNT.l1Address,
      subAccounts: [],
    });
    expect(
      await provider.getPositions({ throwOnUnavailable: true }),
    ).toStrictEqual([]);
    expect(
      await provider.getOpenOrders({ throwOnUnavailable: true }),
    ).toStrictEqual([]);
  });

  it('does not report a confirmed empty Lighter venue as a discovery failure', async () => {
    const { aggregate, clientInstance } = setup();
    clientInstance.getAccountByIndex.mockResolvedValue({
      code: 200,
      accounts: [{ ...ACCOUNT, positions: [] }],
    });

    const result = await aggregate.closePositions({ closeAll: true });

    expect(result).toMatchObject({
      success: true,
      successCount: 1,
      failureCount: 0,
    });
    expect(result.error).toBeUndefined();
  });

  it.each([
    {
      kind: 'scoped',
      unresolvedOrderIds: ['lighter-order'],
      params: {
        orders: [
          { orderId: 'hl-order', providerId: 'hyperliquid' },
          { orderId: 'lighter-order', providerId: 'lighter' },
        ],
      },
    },
    { kind: 'all', params: { cancelAll: true }, unresolvedOrderIds: undefined },
  ] satisfies {
    kind: string;
    params: CancelOrdersParams;
    unresolvedOrderIds: string[] | undefined;
  }[])(
    'preserves successful $kind cancellation and reports a real failed Lighter discovery',
    async ({ params, unresolvedOrderIds }) => {
      const { aggregate, provider, clientInstance, hyperliquid } = setup();
      clientInstance.getActiveOrders.mockRejectedValue(
        new Error('orders transport down'),
      );
      const cancel = vi.spyOn(provider, 'cancelOrder');
      const { controller } = ownershipController(aggregate, 'aggregated');
      const result = await controller.cancelOrders(params);

      expect(hyperliquid.cancelOrders).toHaveBeenCalledWith([
        { orderId: 'hl-order', symbol: 'ETH', providerId: 'hyperliquid' },
      ]);
      expect(result).toMatchObject({ success: true, successCount: 1 });
      expect(result.failureCount).toBeGreaterThan(0);
      expect(result.error).toBe('BATCH_INCOMPLETE');
      expect(result).toMatchObject({
        discoveryFailures: [
          expect.objectContaining({
            providerId: 'lighter',
            error: 'orders transport down',
          }),
        ],
      });
      expect(result.discoveryFailures?.[0].orderIds).toStrictEqual(
        unresolvedOrderIds,
      );
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it('exports strict discovery failures with healthy orders while leaving lenient reads compatible', async () => {
    const { aggregate, clientInstance } = setup();
    clientInstance.getActiveOrders.mockRejectedValue(new Error('orders down'));
    const read = aggregate.getOpenOrders({ throwOnUnavailable: true });
    await expect(read).rejects.toBeInstanceOf(OrderDiscoveryError);
    await expect(read).rejects.toMatchObject({
      orders: [{ ...hyperliquidOrder, providerId: 'hyperliquid' }],
      failures: [{ providerId: 'lighter', error: 'orders down' }],
    });
    expect(await aggregate.getOpenOrders()).toStrictEqual([
      { ...hyperliquidOrder, providerId: 'hyperliquid' },
    ]);
  });

  it('merges venue-internal partial orders into aggregated strict discovery', async () => {
    const { aggregate, hyperliquid, clientInstance } = setup();
    // A venue that itself aggregates DEXs (e.g. HyperLiquid HIP-3) reports the
    // orders it did fetch; the aggregate must keep them.
    hyperliquid.getOpenOrders.mockRejectedValue(
      new OrderDiscoveryError({
        orders: [hyperliquidOrder],
        failures: [{ providerId: 'hyperliquid', error: 'xyz: dex down' }],
      }),
    );
    clientInstance.getActiveOrders.mockRejectedValue(new Error('orders down'));

    const read = aggregate.getOpenOrders({ throwOnUnavailable: true });
    await expect(read).rejects.toBeInstanceOf(OrderDiscoveryError);
    await expect(read).rejects.toMatchObject({
      orders: [{ ...hyperliquidOrder, providerId: 'hyperliquid' }],
      failures: [
        { providerId: 'hyperliquid', error: 'xyz: dex down' },
        { providerId: 'lighter', error: 'orders down' },
      ],
    });
  });

  it.each(['hyperliquid', 'aggregate'] as const)(
    'does not count discovered scoped targets as failures during a partial venue outage (%s)',
    async (providerKey) => {
      const { aggregate, hyperliquid, infrastructure } = setup();
      hyperliquid.getOpenOrders.mockRejectedValue(
        new OrderDiscoveryError({
          orders: [hyperliquidOrder],
          failures: [{ providerId: 'hyperliquid', error: 'xyz: dex down' }],
        }),
      );
      const provider = { hyperliquid, aggregate }[providerKey];
      const result = await new TradingService(infrastructure).cancelOrders({
        provider,
        params: {
          orders: [{ orderId: 'hl-order', providerId: 'hyperliquid' }],
        },
        context: createMockServiceContext({
          getOpenOrders: (params?: GetOrdersParams) =>
            provider.getOpenOrders(params),
        }),
        withStreamPause: async (operation) => operation(),
      });
      expect(result).toMatchObject({
        success: true,
        successCount: 1,
        failureCount: 0,
      });
      expect(result.error).toBeUndefined();
      expect(result.discoveryFailures).toBeUndefined();
    },
  );

  it('keeps only missing scoped IDs in a partially discovered venue failure', async () => {
    const { aggregate, hyperliquid, infrastructure } = setup();
    hyperliquid.getOpenOrders.mockRejectedValue(
      new OrderDiscoveryError({
        orders: [hyperliquidOrder],
        failures: [{ providerId: 'hyperliquid', error: 'xyz down' }],
      }),
    );
    const result = await new TradingService(infrastructure).cancelOrders({
      provider: aggregate,
      params: {
        orders: [
          { orderId: 'hl-order', providerId: 'hyperliquid' },
          { orderId: 'missing', providerId: 'hyperliquid' },
        ],
      },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          aggregate.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });
    expect(result).toMatchObject({
      successCount: 1,
      failureCount: 1,
      error: 'BATCH_INCOMPLETE',
      discoveryFailures: [{ providerId: 'hyperliquid', orderIds: ['missing'] }],
    });
  });

  it('does not resolve an unavailable venue target with the same ID from another venue', async () => {
    const { aggregate, clientInstance, infrastructure } = setup();
    clientInstance.getActiveOrders.mockRejectedValue(new Error('orders down'));
    const result = await new TradingService(infrastructure).cancelOrders({
      provider: aggregate,
      params: {
        orders: [
          { orderId: 'hl-order', providerId: 'hyperliquid' },
          { orderId: 'hl-order', providerId: 'lighter' },
        ],
      },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          aggregate.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });
    expect(result).toMatchObject({
      successCount: 1,
      failureCount: 1,
      discoveryFailures: [{ providerId: 'lighter', orderIds: ['hl-order'] }],
    });
  });

  it('returns a structured cancel result when a direct venue read fails entirely', async () => {
    const { hyperliquid, infrastructure } = setup();
    hyperliquid.getOpenOrders.mockRejectedValue(new Error('HL down'));

    const result = await new TradingService(infrastructure).cancelOrders({
      provider: hyperliquid,
      params: { cancelAll: true },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          hyperliquid.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });

    expect(result).toStrictEqual({
      success: false,
      successCount: 0,
      failureCount: 1,
      error: 'BATCH_INCOMPLETE',
      discoveryFailures: [{ providerId: 'hyperliquid', error: 'HL down' }],
      results: [],
    });
    expect(hyperliquid.cancelOrders).not.toHaveBeenCalled();
  });

  it('attributes a complete direct discovery failure to every unresolved requested ID', async () => {
    const { hyperliquid, infrastructure } = setup();
    hyperliquid.getOpenOrders.mockRejectedValue(new Error('HL down'));
    const result = await new TradingService(infrastructure).cancelOrders({
      provider: hyperliquid,
      params: { orderIds: ['one', 'two', 'one'] },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          hyperliquid.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });
    expect(result).toMatchObject({
      success: false,
      failureCount: 2,
      error: 'BATCH_INCOMPLETE',
      discoveryFailures: [
        {
          providerId: 'hyperliquid',
          error: 'HL down',
          orderIds: ['one', 'two'],
        },
      ],
    });
  });

  it('does not fabricate a venue from an unknown provider protocol or tracing tags', async () => {
    const { hyperliquid, infrastructure } = setup();
    const provider = { ...hyperliquid, protocolId: 'unknown' };
    const result = await new TradingService(infrastructure).cancelOrders({
      provider,
      params: { cancelAll: true },
      context: createMockServiceContext({
        getOpenOrders: async () => {
          throw new Error('transport down');
        },
      }),
      withStreamPause: async (operation) => operation(),
    });
    expect(result).toStrictEqual({
      success: false,
      successCount: 0,
      failureCount: 1,
      error: 'BATCH_INCOMPLETE',
      results: [],
    });
  });

  it('does not report an unrelated venue failure for a healthy scoped target', async () => {
    const { aggregate, clientInstance, infrastructure } = setup();
    clientInstance.getActiveOrders.mockRejectedValue(new Error('orders down'));
    const result = await new TradingService(infrastructure).cancelOrders({
      provider: aggregate,
      params: { orders: [{ orderId: 'hl-order', providerId: 'hyperliquid' }] },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          aggregate.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });
    expect(result).toMatchObject({
      success: true,
      successCount: 1,
      failureCount: 0,
    });
    expect(result.error).toBeUndefined();
    expect(result.discoveryFailures).toBeUndefined();
  });

  it.each([{ orders: [] }, { orderIds: [] }, { symbols: [] }])(
    'does not discover or cancel anything for empty filters %j',
    async (params) => {
      const { aggregate, infrastructure } = setup();
      const getOpenOrders = vi
        .fn()
        .mockRejectedValue(new Error('must not read'));
      const result = await new TradingService(infrastructure).cancelOrders({
        provider: aggregate,
        params,
        context: createMockServiceContext({ getOpenOrders }),
        withStreamPause: async (operation) => operation(),
      });
      expect(result).toStrictEqual({
        success: false,
        successCount: 0,
        failureCount: 0,
        results: [],
      });
      expect(getOpenOrders).not.toHaveBeenCalled();
    },
  );

  it('reports scoped unresolved targets even when no venue supplies cancellable orders', async () => {
    const { aggregate, clientInstance, infrastructure, hyperliquid } = setup();
    hyperliquid.getOpenOrders.mockResolvedValue([]);
    clientInstance.getActiveOrders.mockRejectedValue(new Error('orders down'));
    const result = await new TradingService(infrastructure).cancelOrders({
      provider: aggregate,
      params: { orders: [{ orderId: 'unresolved', providerId: 'lighter' }] },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          aggregate.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });
    expect(result).toStrictEqual({
      success: false,
      successCount: 0,
      failureCount: 1,
      results: [],
      error: 'BATCH_INCOMPLETE',
      discoveryFailures: [
        {
          providerId: 'lighter',
          error: 'orders down',
          orderIds: ['unresolved'],
        },
      ],
    });
    expect(hyperliquid.cancelOrders).not.toHaveBeenCalled();
  });

  it('retains a rejecting venue read as well as Lighter lenient-read failures', async () => {
    const { aggregate, hyperliquid, infrastructure, provider } = setup();
    hyperliquid.getOpenOrders.mockRejectedValue(new Error('HL down'));
    const orders = await provider.getOpenOrders();
    expect(orders.length).toBeGreaterThan(0);
    vi.spyOn(provider, 'cancelOrder').mockResolvedValue({ success: true });
    const service = new TradingService(infrastructure);

    const result = await service.cancelOrders({
      provider: aggregate,
      params: { cancelAll: true },
      context: createMockServiceContext({
        getOpenOrders: (params?: GetOrdersParams) =>
          aggregate.getOpenOrders(params),
      }),
      withStreamPause: async (operation) => operation(),
    });

    expect(result.successCount).toBeGreaterThan(0);
    expect(result.failureCount).toBeGreaterThan(0);
    expect(result.error).toBe('BATCH_INCOMPLETE');
    expect(result.discoveryFailures).toContainEqual({
      providerId: 'hyperliquid',
      error: 'HL down',
    });
  });
});
