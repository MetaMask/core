import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LIGHTER_CHASE_CANCEL_SETTLEMENT_WINDOW_MS,
  LIGHTER_NATIVE_PROBE_CANCEL_LIMIT,
  LIGHTER_TRANSACTION_STATUS,
  LIGHTER_TX_EXPIRY_SLACK_MS,
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_CREATE_ORDER,
} from '../../../src/constants/lighterConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { AggregatedPerpsProvider } from '../../../src/providers/AggregatedPerpsProvider.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import type { LighterChaseRecord } from '../../../src/services/LighterChaseService.js';
import { LighterClientService } from '../../../src/services/LighterClientService.js';
import type {
  GetChaseOrderOwnershipParams,
  OrderParams,
  PerpsProvider,
  PerpsProviderType,
  ReconcileChaseOrderCancellationParams,
} from '../../../src/types/index.js';
import type {
  LighterApiOrder,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  BTC_MARKET,
  buildProvider,
  finishPendingTimersAfterEach,
  ownershipController,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';
import {
  createDeferred,
  createKeyringlessMessenger,
  createMockInfrastructure,
  keyringCalls,
} from '../../helpers/serviceMocks.js';

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

describe('Lighter bounded Chase provider probe', () => {
  finishPendingTimersAfterEach();

  type ExactLookup = LighterClientService['getOrdersByClientIds'];
  type TxLookup = LighterClientService['getTx'];
  const intent: OrderParams = {
    symbol: 'BTC',
    isBuy: true,
    orderType: 'chase',
    size: '0.0002',
    leverage: 1,
    chaseIntervalMs: 1000,
    chaseMaxDurationMs: 60000,
    chaseMaxRepricings: 1,
    chaseMaxDistanceBps: 100,
  };
  const setup = (
    options: Parameters<typeof buildProvider>[0] = {},
  ): BuiltProvider => {
    const built = buildProvider({
      ...options,
      chaseTestnetProbe: true,
      nativeTwapTestnetProbe: true,
      registeredKey: '9c'.repeat(40),
    });
    const expiry = Date.now() + 100000;
    built.clientInstance.getAccountByIndex.mockResolvedValue({
      code: 200,
      accounts: [
        {
          ...ACCOUNT,
          positions: [
            {
              ...ACCOUNT.positions[0],
              position: '0',
              positionValue: '0',
              initialMarginFraction: '100',
            },
          ],
        },
      ],
    });
    built.clientInstance.getActiveOrders.mockResolvedValue({
      code: 200,
      orders: [],
    });
    built.clientInstance.getOrderBookOrders.mockResolvedValue({
      code: 200,
      totalBids: 1,
      totalAsks: 1,
      bids: [
        {
          orderIndex: 10,
          orderId: '10',
          ownerAccountIndex: 99,
          initialBaseAmount: '1',
          remainingBaseAmount: '1',
          price: '99999.8',
          orderExpiry: 0,
          transactionTime: 1,
        },
      ],
      asks: [
        {
          orderIndex: 11,
          orderId: '11',
          ownerAccountIndex: 99,
          initialBaseAmount: '1',
          remainingBaseAmount: '1',
          price: '100001',
          orderExpiry: 0,
          transactionTime: 1,
        },
      ],
    });
    built.clientInstance.getTrades.mockResolvedValue({ code: 200, trades: [] });
    built.clientInstance.getTx.mockImplementation(async (hash: string) => ({
      code: 200,
      hash,
      accountIndex: 28,
      apiKeyIndex: 7,
      nonce: Number(
        [...built.calls]
          .reverse()
          .find((call) => call.function === '_signCancelOrder')?.params[3],
      ),
      status: 2,
    }));
    built.clientInstance.getOrdersByClientIds.mockImplementation(
      async (_account: number, _token: string, ids: string[]) => {
        const creates = built.calls.filter(
          (call) => call.function === '_signCreateOrder',
        );
        const childIndex = creates.findIndex(
          (call) => String(call.params[2]) === ids[0],
        );
        const orderId = String(9001 + childIndex);
        const create = built.calls.find(
          (call) =>
            call.function === '_signCreateOrder' &&
            String(call.params[2]) === ids[0],
        );
        if (!create) {
          return { code: 200, orders: [] };
        }
        const canceled = built.calls.some(
          (call) =>
            call.function === '_signCancelOrder' &&
            String(call.params[2]) === orderId,
        );
        return {
          code: 200,
          orders: [
            {
              orderIndex: Number(orderId),
              orderId,
              clientOrderIndex: Number(ids[0]),
              clientOrderId: ids[0],
              marketIndex: 1,
              ownerAccountIndex: 28,
              initialBaseAmount: '0.0002',
              remainingBaseAmount: '0.0002',
              filledBaseAmount: '0',
              filledQuoteAmount: '0',
              price: String(Number(create.params[4]) / 10),
              isAsk: false,
              type: 'limit',
              timeInForce: 'post-only',
              reduceOnly: 0,
              status: canceled ? 'canceled' : 'open',
              orderExpiry: expiry,
              timestamp: 1,
              nonce: 2075941,
            },
          ],
        };
      },
    );
    return built;
  };
  it.each(['chase', 'twap'] as const)(
    'excludes a second native probe across strategies after %s dispatch',
    async (first) => {
      vi.useFakeTimers();
      const built = setup();
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 90000,
            defaultInitialMarginFraction: 100,
            minInitialMarginFraction: 100,
            maintenanceMarginFraction: 50,
          },
        ],
      });
      const twap: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        orderType: 'twap',
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      };
      try {
        await built.provider.placeOrder(first === 'chase' ? intent : twap);
        const creates = built.calls.filter(
          (call) => call.function === '_signCreateOrder',
        ).length;
        expect(creates).toBe(1);
        const result = await built.provider.placeOrder(
          first === 'chase' ? twap : intent,
        );
        expect(result.success).toBe(false);
        expect(result.error).toContain('native probe remains unresolved');
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(creates);
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it.each([
    { usdAmount: '19' },
    { usdAmount: '21' },
    { usdAmount: '0' },
    { usdAmount: 'NaN' },
    { usdAmount: '20', size: '0.0001' },
    { usdAmount: '20', currentPrice: 200000 },
    { usdAmount: '20', priceAtCalculation: 200000 },
  ])(
    'rejects contradictory Mobile Chase sizing %j before setup',
    async (override) => {
      const built = setup();
      expect(
        (await built.provider.placeOrder({ ...intent, ...override })).success,
      ).toBe(false);
      expect(built.calls).toHaveLength(0);
    },
  );
  it('floors the Mobile Chase size while retaining its explicit USD budget', async () => {
    vi.useFakeTimers();
    const built = setup();
    try {
      const result = await built.provider.placeOrder({
        ...intent,
        size: '0.000209',
        usdAmount: '20',
        currentPrice: 100000,
      });
      expect(result.success).toBe(true);
      expect(result.submittedSize).toBe('0.0002');
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it('leaves Chase unadvertised without the probe or an injected signer', async () => {
    const disabled = buildProvider();
    const readOnly = setup({ withBridge: false });
    expect(
      await disabled.provider.getOrderCapabilities({ symbol: 'BTC' }),
    ).toMatchObject({ supportedStrategies: ['scale'] });
    expect(
      await readOnly.provider.getOrderCapabilities({ symbol: 'BTC' }),
    ).toMatchObject({ supportedStrategies: ['scale'] });
  });
  it('accepts the Mobile Chase USD request and advertises the enabled testnet probe', async () => {
    vi.useFakeTimers();
    const built = setup();
    try {
      const result = await built.provider.placeOrder({
        ...intent,
        usdAmount: '20',
        currentPrice: 100000,
        priceAtCalculation: 100000,
      });
      expect(result.success).toBe(true);
      expect(result.submittedSize).toBe('0.0002');
      expect(
        await built.provider.getOrderCapabilities({ symbol: 'BTC' }),
      ).toMatchObject({ supportedStrategies: ['scale', 'chase'] });
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it('advertises only the enabled testnet Chase probe and rejects mainnet probe construction', async () => {
    expect(() =>
      buildProvider({ chaseTestnetProbe: true, isTestnet: false }),
    ).toThrow('testnet-only');
    const built = setup();
    expect(
      await built.provider.getOrderCapabilities({ symbol: 'BTC' }),
    ).toMatchObject({ supportedStrategies: ['scale', 'chase'] });
    expect((await buildProvider().provider.placeOrder(intent)).success).toBe(
      false,
    );
  });
  it('rejects over-budget, leverage and unbounded options before signer setup', async () => {
    const built = setup();
    for (const override of [
      { size: '0.001' },
      { leverage: 2 },
      { chaseMaxRepricings: 21 },
      { chaseMaxDurationMs: 301000 },
    ]) {
      expect(
        (await built.provider.placeOrder({ ...intent, ...override })).success,
      ).toBe(false);
    }
    expect(built.calls).toHaveLength(0);
  });
  it('refuses a mismatched provider route before any signer setup', async () => {
    const built = setup();
    expect(
      (
        await built.provider.placeOrder({
          ...intent,
          providerId: 'hyperliquid',
        })
      ).success,
    ).toBe(false);
    expect(built.calls).toHaveLength(0);
  });
  it('serializes one native cancel/reprice and then terminates at its count bound', async () => {
    vi.useFakeTimers();
    const built = setup();
    try {
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async (_account: number, _token: string, ids: string[]) => {
          const creates = built.calls.filter(
            (call) => call.function === '_signCreateOrder',
          );
          const index = creates.findIndex(
            (call) => String(call.params[2]) === ids[0],
          );
          const create = creates[index];
          if (!create) {
            return { code: 200, orders: [] };
          }
          const orderId = String(9001 + index);
          const canceled = built.calls.some(
            (call) =>
              call.function === '_signCancelOrder' &&
              String(call.params[2]) === orderId,
          );
          return {
            code: 200,
            orders: [
              {
                orderIndex: Number(orderId),
                orderId,
                clientOrderIndex: Number(ids[0]),
                clientOrderId: ids[0],
                marketIndex: 1,
                ownerAccountIndex: 28,
                initialBaseAmount: '0.0002',
                remainingBaseAmount: '0.0002',
                filledBaseAmount: '0',
                filledQuoteAmount: '0',
                price: String(Number(create.params[4]) / 10),
                isAsk: false,
                type: 'limit',
                timeInForce: 'post-only',
                reduceOnly: 0,
                status: canceled ? 'canceled' : 'open',
                orderExpiry: 9999999999999,
                timestamp: 1,
                nonce: 2075941,
              },
            ],
          };
        },
      );
      const first = await built.provider.placeOrder(intent);
      expect(first.success).toBe(true);
      built.clientInstance.getOrderBookOrders.mockResolvedValue({
        code: 200,
        totalBids: 1,
        totalAsks: 1,
        bids: [
          {
            orderIndex: 10,
            orderId: '10',
            ownerAccountIndex: 99,
            initialBaseAmount: '1',
            remainingBaseAmount: '1',
            price: '99999.9',
            orderExpiry: 0,
            transactionTime: 1,
          },
        ],
        asks: [
          {
            orderIndex: 11,
            orderId: '11',
            ownerAccountIndex: 99,
            initialBaseAmount: '1',
            remainingBaseAmount: '1',
            price: '100001',
            orderExpiry: 0,
            transactionTime: 1,
          },
        ],
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        built.calls
          .filter((call) =>
            ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
          )
          .map((call) => call.function),
      ).toStrictEqual([
        '_signCreateOrder',
        '_signCancelOrder',
        '_signCreateOrder',
      ]);
      expect((await built.provider.getChaseOrders())[0].repricings).toBe(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await built.provider.getChaseOrders())[0].status).toBe(
        'canceled',
      );
      expect((await built.provider.getNativeChaseRecords())[0].stopReason).toBe(
        'repricing_limit_reached',
      );
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it('places an exact owned native ALO child and exposes its public management handle', async () => {
    const built = setup();
    const result = await built.provider.placeOrder(intent);
    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.success).toBe(true);
    expect(result.providerId).toBe('lighter');
    expect(result.orderId).toMatch(/^lighter-chase:/u);
    expect(result.childOrderIds).toStrictEqual(['9001']);
    expect(
      built.calls
        .find((call) => call.function === '_signCreateOrder')
        ?.params.slice(6, 8),
    ).toStrictEqual([0, 2]);
    const orders = await built.provider.getChaseOrders();
    expect(orders[0].handle).toBe(result.orderId);
    expect(orders[0].status).toBe('active');
    await built.provider.disconnect();
  });
  it('suspends in-flight work and never repeats placement after disconnect', async () => {
    const built = setup();
    const result = await built.provider.placeOrder(intent);
    if (!result.success) {
      throw new Error(result.error);
    }
    expect(result.success).toBe(true);
    await built.provider.suspendChaseOrders();
    const creates = built.calls.filter(
      (call) => call.function === '_signCreateOrder',
    ).length;
    expect((await built.provider.getChaseOrders())[0]).toMatchObject({
      status: 'canceled',
      restingOrderId: null,
    });
    expect((await built.provider.getNativeChaseRecords())[0].stopReason).toBe(
      'backgrounded',
    );
    expect(
      built.calls.filter((call) => call.function === '_signCreateOrder'),
    ).toHaveLength(creates);
    await built.provider.disconnect();
  });
  const diskDependencies = (): ReturnType<typeof createMockInfrastructure> => {
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
    return deps;
  };
  describe('public Chase ownership', () => {
    const journalKey = `lighterChase:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28])}`;
    const accountsKey = `lighterRecoveryAccounts:testnet:${ACCOUNT.l1Address.toLowerCase()}`;
    const route = (handle: string): GetChaseOrderOwnershipParams => ({
      handle,
      providerId: 'lighter' as const,
    });
    const stored = async (
      deps: ReturnType<typeof diskDependencies>,
    ): Promise<{ version: 1; records: LighterChaseRecord[] }> => {
      const raw = await deps.diskCache.getItem(journalKey);
      if (!raw) {
        throw new Error('Missing test journal');
      }
      return JSON.parse(raw) as { version: 1; records: LighterChaseRecord[] };
    };
    type BoundarySnapshot = {
      wasm: LighterWasmCall[];
      bridge: number[];
      client: number[];
      writes: number;
      removes: number;
      timers: number;
    };
    const boundaries = (
      built: BuiltProvider,
      deps: ReturnType<typeof diskDependencies>,
    ): BoundarySnapshot => ({
      wasm: [...built.calls],
      bridge: Object.values(built.bridge)
        .filter((value) => vi.isMockFunction(value))
        .map((mock) => mock.mock.calls.length),
      client: Object.values(built.clientInstance)
        .filter((value) => vi.isMockFunction(value))
        .map((mock) => mock.mock.calls.length),
      writes: vi.spyOn(deps.diskCache, 'setItem').mock.calls.length,
      removes: vi.spyOn(deps.diskCache, 'removeItem').mock.calls.length,
      timers: vi.getTimerCount(),
    });
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('retains every exact child after multiple reprices and current-child replacement through the public messenger', async () => {
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      const { controller, host } = ownershipController(built.provider);
      try {
        await controller.init();
        const book =
          (await built.clientInstance.getOrderBookOrders()) as Awaited<
            ReturnType<LighterClientService['getOrderBookOrders']>
          >;
        built.clientInstance.getOrderBookOrders.mockResolvedValue({
          ...book,
          bids: [{ ...book.bids[0], price: '99999.6' }],
        });
        const placed = await built.provider.placeOrder({
          ...intent,
          chaseMaxRepricings: 3,
        });
        expect(placed.success).toBe(true);
        const handle = placed.orderId as string;
        for (const price of ['99999.7', '99999.8']) {
          built.clientInstance.getOrderBookOrders.mockResolvedValue({
            ...book,
            bids: [{ ...book.bids[0], price }],
          });
          await vi.advanceTimersByTimeAsync(1000);
        }
        const journal = await stored(deps);
        expect(journal.records[0].children).toHaveLength(3);
        const before = boundaries(built, deps);

        const snapshot = await host.messenger.call(
          'PerpsController:getChaseOrderOwnership',
          route(handle),
        );

        expect(snapshot.status).toBe('available');
        if (snapshot.status !== 'available') {
          throw new Error('Missing ownership');
        }
        expect(snapshot.owner).toStrictEqual({
          providerId: 'lighter',
          walletAddress: ACCOUNT.l1Address.toLowerCase(),
          network: 'testnet',
          accountIndex: 28,
          apiKeyIndex: 7,
        });
        expect(snapshot.handle).toBe(handle);
        expect(snapshot.order).toMatchObject({
          handle,
          restingOrderId: '9003',
          repricings: 2,
        });
        expect(
          snapshot.children.map((child) => child.clientOrderId),
        ).toStrictEqual(
          journal.records[0].children.map((child) => child.clientOrderId),
        );
        expect(
          snapshot.children.map((child) => child.observation),
        ).toStrictEqual(
          journal.records[0].children.map((child) => child.observation),
        );
        expect(
          snapshot.children.map((child) => child.observation?.orderId),
        ).toStrictEqual(['9001', '9002', '9003']);
        expect(
          snapshot.children.map((child) => child.observation?.terminal),
        ).toStrictEqual([true, true, false]);
        expect(boundaries(built, deps)).toStrictEqual(before);
        expect(keyringCalls(host.call)).toStrictEqual([]);
        expect(await stored(deps)).toStrictEqual(journal);
        expect(
          await controller.getChaseOrderOwnership({
            ...route(handle),
            owner: snapshot.owner,
          }),
        ).toStrictEqual(snapshot);
      } finally {
        await built.provider.disconnect();
      }
    });

    it('preserves response loss and unknown child ownership after a signerless absent-authority restart', async () => {
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      original.clientInstance.sendTx.mockRejectedValueOnce(
        new Error('response lost'),
      );
      const placed = await original.provider.placeOrder(intent);
      expect(placed.success).toBe(false);
      expect(placed.orderId).toStrictEqual(expect.any(String));
      await original.provider.disconnect();
      const restarted = buildProvider({
        platformDependencies: deps,
        withBridge: false,
        apiKeyIndex: 8,
        configuredAccountIndex: null,
      });
      restarted.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        subAccounts: [],
      });
      const { controller, host } = ownershipController(restarted.provider);
      try {
        const journal = await stored(deps);
        const before = boundaries(restarted, deps);

        const snapshot = await controller.getChaseOrderOwnership(
          route(placed.orderId as string),
        );

        expect(snapshot).toMatchObject({
          status: 'available',
          owner: { apiKeyIndex: 7, accountIndex: 28 },
          order: { status: 'termination_pending', restingOrderId: null },
          children: [{ placement: { phase: 'attempted' } }],
        });
        if (snapshot.status !== 'available') {
          throw new Error('Missing ownership');
        }
        expect(snapshot.children[0].observation).toBeUndefined();
        expect(snapshot.children[0].clientOrderId).toBe(
          journal.records[0].children[0].clientOrderId,
        );
        const publicPlacement = { ...journal.records[0].children[0].placement };
        Reflect.deleteProperty(publicPlacement, 'acknowledged');
        expect(snapshot.children[0].placement).toStrictEqual(publicPlacement);
        expect(boundaries(restarted, deps)).toStrictEqual(before);
        expect(keyringCalls(host.call)).toStrictEqual([]);
        expect(await stored(deps)).toStrictEqual(journal);
        await vi.advanceTimersByTimeAsync(60000);
        expect(boundaries(restarted, deps)).toStrictEqual({
          ...before,
          timers: 0,
        });
        expect(
          await controller.getChaseOrderOwnership({
            ...route(placed.orderId as string),
            owner: { ...snapshot.owner, apiKeyIndex: 8 },
          }),
        ).toMatchObject({ status: 'unavailable', reason: 'owner_mismatch' });
      } finally {
        await restarted.provider.disconnect();
      }
    });

    it('preserves exact observed quantities and excludes private journal extensions', async () => {
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const placed = await original.provider.placeOrder(intent);
      await original.provider.disconnect();
      const journal = await stored(deps);
      const child = journal.records[0].children[0];
      journal.records[0].error = 'secret-error-auth';
      child.observation = {
        orderId: '9001',
        terminal: false,
        filledSize: '0.000010',
        filledNotional: '0.9999900',
        remainingSize: '0.000190',
      };
      Object.assign(child, {
        privateKey: 'secret-private-key',
        authToken: 'secret-auth',
        signedPayload: 'secret-payload',
      });
      Object.assign(child.placement, {
        txInfo: 'secret-transaction',
        signature: 'secret-signature',
      });
      await deps.diskCache.setItem(journalKey, JSON.stringify(journal));
      const restarted = buildProvider({
        platformDependencies: deps,
        withBridge: false,
      });
      const { controller } = ownershipController(restarted.provider);
      const before = boundaries(restarted, deps);
      try {
        const snapshot = await controller.getChaseOrderOwnership(
          route(placed.orderId as string),
        );
        expect(snapshot.status).toBe('available');
        if (snapshot.status !== 'available') {
          throw new Error('Missing ownership');
        }
        expect(snapshot.children[0].observation).toStrictEqual(
          child.observation,
        );
        expect(snapshot.executedSize).toBe('0.00001');
        expect(snapshot.executedNotional).toBe('0.99999');
        expect(JSON.stringify(snapshot)).not.toContain('secret-');
        expect(boundaries(restarted, deps)).toStrictEqual(before);
        expect(await stored(deps)).toStrictEqual(journal);
      } finally {
        await restarted.provider.disconnect();
      }
    });

    it.each(['wallet', 'network', 'account', 'key', 'provider'] as const)(
      'fences a mismatched expected %s owner without acquiring cleanup authority',
      async (field) => {
        const deps = diskDependencies();
        const original = setup({ platformDependencies: deps });
        const placed = await original.provider.placeOrder(intent);
        await original.provider.disconnect();
        const restarted = buildProvider({
          platformDependencies: deps,
          apiKeyIndex: 8,
        });
        const { controller } = ownershipController(restarted.provider);
        try {
          const snapshot = await controller.getChaseOrderOwnership(
            route(placed.orderId as string),
          );
          if (snapshot.status !== 'available') {
            throw new Error('Missing ownership');
          }
          const owner = { ...snapshot.owner };
          if (field === 'wallet') {
            owner.walletAddress = '0xforeign';
          } else if (field === 'network') {
            owner.network = 'mainnet';
          } else if (field === 'account') {
            owner.accountIndex = 29;
          } else if (field === 'key') {
            owner.apiKeyIndex = 8;
          } else {
            owner.providerId = 'hyperliquid';
          }
          const before = boundaries(restarted, deps);
          expect(
            await controller.getChaseOrderOwnership({
              ...route(placed.orderId as string),
              owner,
            }),
          ).toMatchObject({ status: 'unavailable', reason: 'owner_mismatch' });
          expect(boundaries(restarted, deps)).toStrictEqual(before);
          const canceled = await restarted.provider.cancelOrder({
            orderId: snapshot.handle,
            symbol: 'BTC',
            orderType: 'chase',
            providerId: 'lighter',
          });
          expect(canceled.success).toBe(false);
          expect(
            restarted.calls.filter(
              (call) => call.function === '_signCancelOrder',
            ),
          ).toHaveLength(0);
          expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await restarted.provider.disconnect();
        }
      },
    );

    it.each(['prepared', 'signed', 'acknowledged', 'failed'] as const)(
      'observes %s durable children without retiring or replaying them',
      async (phase) => {
        const deps = diskDependencies();
        const original = setup({ platformDependencies: deps });
        const placed = await original.provider.placeOrder(intent);
        await original.provider.disconnect();
        const journal = await stored(deps);
        const child = journal.records[0].children[0];
        child.placement.phase = phase;
        delete child.placement.acknowledged;
        delete child.observation;
        await deps.diskCache.setItem(journalKey, JSON.stringify(journal));
        const restarted = buildProvider({
          platformDependencies: deps,
          withBridge: false,
        });
        const { controller } = ownershipController(restarted.provider);
        const before = boundaries(restarted, deps);
        try {
          const snapshot = await controller.getChaseOrderOwnership(
            route(placed.orderId as string),
          );
          expect(snapshot).toMatchObject({
            status: 'available',
            children: [{ placement: { phase } }],
          });
          expect(boundaries(restarted, deps)).toStrictEqual(before);
          expect(await stored(deps)).toStrictEqual(journal);
        } finally {
          await restarted.provider.disconnect();
        }
      },
    );

    it.each([
      'foreign handle',
      'missing journal',
      'empty journal',
      'missing account index',
      'foreign wallet',
      'foreign network',
    ] as const)(
      'returns unavailable for %s without claiming an empty complete inventory',
      async (condition) => {
        const deps = diskDependencies();
        const original = setup({ platformDependencies: deps });
        const placed = await original.provider.placeOrder(intent);
        await original.provider.disconnect();
        if (condition === 'missing journal') {
          const read = vi
            .spyOn(deps.diskCache, 'getItem')
            .getMockImplementation();
          if (!read) {
            throw new Error('Missing test read');
          }
          vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (key) =>
            key === journalKey ? null : await read(key),
          );
        } else if (condition === 'empty journal') {
          await deps.diskCache.setItem(
            journalKey,
            JSON.stringify({ version: 1, records: [] }),
          );
        } else if (condition === 'missing account index') {
          await deps.diskCache.setItem(accountsKey, '[]');
        }
        const restarted = buildProvider({
          platformDependencies: deps,
          withBridge: false,
          isTestnet: condition !== 'foreign network',
        });
        const { controller, host } = ownershipController(restarted.provider);
        if (condition === 'foreign wallet') {
          restarted.getUserAddressMock.mockReturnValue('0xother');
          host.selectAccount('0xother');
        } else if (condition === 'foreign network') {
          controller.changeContext({ isTestnet: false });
        }
        try {
          const before = boundaries(restarted, deps);
          const snapshot = await controller.getChaseOrderOwnership(
            route(
              condition === 'foreign handle'
                ? 'foreign:opaque'
                : (placed.orderId as string),
            ),
          );
          expect(snapshot).toMatchObject({
            status: 'unavailable',
            reason: 'not_found',
          });
          expect(snapshot).not.toHaveProperty('children');
          expect(boundaries(restarted, deps)).toStrictEqual(before);
        } finally {
          await restarted.provider.disconnect();
        }
      },
    );

    it.each([
      'invalid JSON',
      'dangling child',
      'corrupt account index',
      'foreign journal owner',
      'ambiguous handle',
    ] as const)(
      'rejects %s through the public controller without side effects',
      async (condition) => {
        const deps = diskDependencies();
        const original = setup({ platformDependencies: deps });
        const placed = await original.provider.placeOrder(intent);
        await original.provider.disconnect();
        const journal = await stored(deps);
        if (condition === 'invalid JSON') {
          await deps.diskCache.setItem(journalKey, '{broken');
        } else if (condition === 'corrupt account index') {
          await deps.diskCache.setItem(accountsKey, '[28,28]');
        } else {
          if (condition === 'dangling child') {
            journal.records[0].children[0].clientOrderId = 'not-an-id';
          } else if (condition === 'foreign journal owner') {
            journal.records[0].intent.owner.wallet = '0xforeign';
          } else {
            await deps.diskCache.setItem(accountsKey, '[28,29]');
            const duplicate = structuredClone(journal);
            duplicate.records[0].intent.owner.accountIndex = 29;
            await deps.diskCache.setItem(
              `lighterChase:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 29])}`,
              JSON.stringify(duplicate),
            );
          }
          await deps.diskCache.setItem(journalKey, JSON.stringify(journal));
        }
        const restarted = buildProvider({
          platformDependencies: deps,
          withBridge: false,
        });
        const { controller } = ownershipController(restarted.provider);
        const before = boundaries(restarted, deps);
        try {
          await expect(
            controller.getChaseOrderOwnership(route(placed.orderId as string)),
          ).rejects.toThrow(
            {
              'invalid JSON': /JSON/u,
              'dangling child': /persisted child identity/u,
              'corrupt account index': /account index is corrupt/u,
              'foreign journal owner': /persisted ownership/u,
              'ambiguous handle': /ambiguous durable ownership/u,
            }[condition],
          );
          expect(boundaries(restarted, deps)).toStrictEqual(before);
        } finally {
          await restarted.provider.disconnect();
        }
      },
    );

    it.each(['account', 'network', 'provider', 'instance'] as const)(
      'rejects %s changes at controller readiness before calling the provider',
      async (condition) => {
        const deps = diskDependencies();
        const built = buildProvider({
          platformDependencies: deps,
          withBridge: false,
        });
        const { controller, host } = ownershipController(built.provider);
        const inspect = vi.spyOn(built.provider, 'getChaseOrderOwnership');
        const before = boundaries(built, deps);
        const result = controller.getChaseOrderOwnership(
          route('opaque-handle'),
        );
        if (condition === 'account') {
          host.selectAccount('0xother');
        } else if (condition === 'network') {
          controller.changeContext({ isTestnet: false });
        } else if (condition === 'provider') {
          controller.changeContext({ activeProvider: 'hyperliquid' });
        } else {
          controller.activate(buildProvider().provider);
        }
        try {
          await expect(result).rejects.toThrow(
            PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
          );
          expect(inspect).not.toHaveBeenCalled();
          expect(boundaries(built, deps)).toStrictEqual(before);
        } finally {
          await built.provider.disconnect();
        }
      },
    );

    it('refuses foreign provider routes before any storage or authority work', async () => {
      const deps = diskDependencies();
      const built = buildProvider({
        platformDependencies: deps,
        withBridge: false,
      });
      const { controller } = ownershipController(built.provider);
      const before = boundaries(built, deps);
      const reads = vi.spyOn(deps.diskCache, 'getItem').mock.calls.length;
      try {
        await expect(
          controller.getChaseOrderOwnership({
            handle: 'opaque',
            providerId: 'hyperliquid',
          }),
        ).rejects.toThrow('provider does not match');
        await expect(
          built.provider.getChaseOrderOwnership({
            handle: 'opaque',
            providerId: 'hyperliquid',
          }),
        ).rejects.toThrow('matching provider');
        expect(vi.spyOn(deps.diskCache, 'getItem').mock.calls).toHaveLength(
          reads,
        );
        expect(boundaries(built, deps)).toStrictEqual(before);
      } finally {
        await built.provider.disconnect();
      }
    });

    it.each([
      'account',
      'account round trip',
      'network',
      'provider',
      'instance',
      'signer reset',
      'disconnect',
    ] as const)(
      'fences %s changes while durable storage awaits',
      async (condition) => {
        const deps = diskDependencies();
        const original = setup({ platformDependencies: deps });
        const placed = await original.provider.placeOrder(intent);
        await original.provider.disconnect();
        const restarted = buildProvider({ platformDependencies: deps });
        const { controller, host } = ownershipController(restarted.provider);
        const entered = createDeferred<void>();
        const pending = createDeferred<void>();
        const read = vi
          .spyOn(deps.diskCache, 'getItem')
          .getMockImplementation();
        if (!read) {
          throw new Error('Missing storage read');
        }
        vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (key) => {
          if (key === journalKey) {
            entered.resolve();
            await pending.promise;
          }
          return await read(key);
        });
        const before = boundaries(restarted, deps);
        const result = controller.getChaseOrderOwnership(
          route(placed.orderId as string),
        );
        const settled = result.then(
          () => undefined,
          (error: unknown) => error,
        );
        await entered.promise;
        if (condition === 'account') {
          host.selectAccount('0xother');
          restarted.getUserAddressMock.mockReturnValue('0xother');
        } else if (condition === 'account round trip') {
          host.selectAccount('0xother');
          restarted.getUserAddressMock.mockReturnValue('0xother');
          host.rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            host.rootMessenger.call('AccountsController:getSelectedAccount'),
          );
          host.selectAccount(ACCOUNT.l1Address as `0x${string}`);
          restarted.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
          host.rootMessenger.publish(
            'AccountsController:selectedAccountChange',
            host.rootMessenger.call('AccountsController:getSelectedAccount'),
          );
        } else if (condition === 'network') {
          controller.changeContext({ isTestnet: false });
        } else if (condition === 'provider') {
          controller.changeContext({ activeProvider: 'hyperliquid' });
        } else if (condition === 'instance') {
          controller.activate(buildProvider().provider);
        } else if (condition === 'signer reset') {
          restarted.fireReset();
        } else {
          await controller.disconnect();
        }
        const afterChange = boundaries(restarted, deps);
        pending.resolve();
        try {
          expect(await settled).toBeInstanceOf(Error);
          expect(boundaries(restarted, deps)).toStrictEqual(afterChange);
          expect(afterChange.writes).toBe(before.writes);
          expect(keyringCalls(host.call)).toStrictEqual([]);
        } finally {
          pending.resolve();
          await restarted.provider.disconnect();
        }
      },
    );

    it('rejects an aggregate route replaced during a real Lighter storage read', async () => {
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const placed = await original.provider.placeOrder(intent);
      await original.provider.disconnect();
      const restarted = buildProvider({
        platformDependencies: deps,
        withBridge: false,
      });
      const providers = new Map<PerpsProviderType, PerpsProvider>([
        ['lighter', restarted.provider],
      ]);
      const aggregate = new AggregatedPerpsProvider({
        providers,
        defaultProvider: 'lighter',
        infrastructure: deps,
      });
      const { controller } = ownershipController(aggregate, 'aggregated');
      const entered = createDeferred<void>();
      const pending = createDeferred<void>();
      const read = vi.spyOn(deps.diskCache, 'getItem').getMockImplementation();
      if (!read) {
        throw new Error('Missing test read');
      }
      vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (key) => {
        if (key === journalKey) {
          entered.resolve();
          await pending.promise;
        }
        return await read(key);
      });
      const before = boundaries(restarted, deps);
      const result = controller.getChaseOrderOwnership(
        route(placed.orderId as string),
      );
      const settled = result.then(
        () => undefined,
        (error: unknown) => error,
      );
      await entered.promise;
      const replacement = buildProvider({ withBridge: false });
      const replacementRead = vi.spyOn(
        replacement.provider,
        'getChaseOrderOwnership',
      );
      providers.set('lighter', replacement.provider);
      pending.resolve();
      try {
        expect(await settled).toStrictEqual(
          new Error(PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE),
        );
        expect(replacementRead).not.toHaveBeenCalled();
        expect(boundaries(restarted, deps)).toStrictEqual(before);
      } finally {
        pending.resolve();
        await restarted.provider.disconnect();
        await aggregate.disconnect();
      }
    });

    it('routes the public aggregate read only to Lighter and reports HyperLiquid unsupported without reading Chase sessions', async () => {
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      const placed = await built.provider.placeOrder(intent);
      const hyperliquid = new HyperLiquidProvider({
        platformDependencies: createMockInfrastructure(),
        isTestnet: true,
        messenger: createKeyringlessMessenger().messenger,
      });
      const legacyRead = vi.spyOn(hyperliquid, 'getChaseOrders');
      const aggregate = new AggregatedPerpsProvider({
        providers: new Map<PerpsProviderType, PerpsProvider>([
          ['lighter', built.provider],
          ['hyperliquid', hyperliquid],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: deps,
      });
      const { controller } = ownershipController(aggregate, 'aggregated');
      try {
        const before = boundaries(built, deps);
        expect(
          await controller.getChaseOrderOwnership(
            route(placed.orderId as string),
          ),
        ).toMatchObject({ status: 'available', providerId: 'lighter' });
        expect(
          await controller.getChaseOrderOwnership({
            providerId: 'hyperliquid',
            handle: 'opaque-hl-handle',
          }),
        ).toMatchObject({ status: 'unsupported', providerId: 'hyperliquid' });
        expect(legacyRead).not.toHaveBeenCalled();
        expect(boundaries(built, deps)).toStrictEqual(before);
        await deps.diskCache.setItem(journalKey, '{broken');
        const afterCorruption = boundaries(built, deps);
        await expect(
          controller.getChaseOrderOwnership(route(placed.orderId as string)),
        ).rejects.toThrow(/JSON/u);
        expect(boundaries(built, deps)).toStrictEqual(afterCorruption);
      } finally {
        await aggregate.disconnect();
      }
    });
  });
  const cancelParams = (
    orderId: string,
  ): {
    symbol: string;
    orderId: string;
    orderType: 'chase';
    providerId: 'lighter';
  } => ({ symbol: 'BTC', orderId, orderType: 'chase', providerId: 'lighter' });
  describe('bounded Chase provider settlement', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it.each(['live', 'missing'] as const)(
      'reports success after delayed exact %s cancellation visibility',
      async (visibility) => {
        const built = setup();
        try {
          const placed = await built.provider.placeOrder({
            ...intent,
            chaseIntervalMs: 120000,
            chaseMaxDurationMs: 180000,
          });
          const original =
            built.clientInstance.getOrdersByClientIds.getMockImplementation() as
              | ExactLookup
              | undefined;
          if (!original) {
            throw new Error('Missing exact lookup');
          }
          let observedAt: number | undefined;
          built.clientInstance.getOrdersByClientIds.mockImplementation(
            async (...args: Parameters<ExactLookup>) => {
              const result = await original(...args);
              if (
                built.calls.some((call) => call.function === '_signCancelOrder')
              ) {
                observedAt ??= Date.now() + 2000;
                if (Date.now() < observedAt) {
                  return {
                    ...result,
                    orders:
                      visibility === 'missing'
                        ? []
                        : result.orders.map((row) => ({
                            ...row,
                            status: 'open',
                          })),
                  };
                }
              }
              return result;
            },
          );
          const canceling = built.provider.cancelOrder(
            cancelParams(String(placed.orderId)),
          );
          await vi.advanceTimersByTimeAsync(2500);
          expect(await canceling).toMatchObject({ success: true });
          const record = (await built.provider.getNativeChaseRecords())[0];
          expect(record).toMatchObject({
            status: 'canceled',
            executedSize: '0',
            executedNotional: '0',
          });
          expect(record.children).toHaveLength(1);
          expect(record.children[0].cancellations).toHaveLength(1);
          expect(record.children[0].cancellations[0].nonce).toBe(
            Number(record.children[0].placement.nonce) + 1,
          );
          expect(
            built.calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(1);
          expect(
            built.calls.filter((call) => call.function === '_signCancelOrder'),
          ).toHaveLength(1);
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
          expect(
            await built.provider.cancelOrder(
              cancelParams(String(placed.orderId)),
            ),
          ).toMatchObject({ success: true });
          expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
        } finally {
          await built.provider.disconnect();
        }
      },
    );

    it('preserves foreign cancellation transaction errors without treating them as indexer lag', async () => {
      const built = setup();
      try {
        const placed = await built.provider.placeOrder(intent);
        const tx = built.clientInstance.getTx.getMockImplementation() as
          | TxLookup
          | undefined;
        if (!tx) {
          throw new Error('Missing transaction lookup');
        }
        built.clientInstance.getTx.mockImplementation(async (hash: string) => ({
          ...(await tx(hash)),
          accountIndex: 99,
        }));
        expect(
          await built.provider.cancelOrder(
            cancelParams(String(placed.orderId)),
          ),
        ).toMatchObject({
          success: false,
          error: 'Lighter Chase transaction identity mismatch',
        });
        const reads =
          built.clientInstance.getOrdersByClientIds.mock.calls.length;
        await vi.advanceTimersByTimeAsync(10000);
        expect(built.clientInstance.getOrdersByClientIds).toHaveBeenCalledTimes(
          reads,
        );
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(2);
        expect(
          (await built.provider.getNativeChaseRecords())[0].children[0]
            .cancellations,
        ).toHaveLength(1);
      } finally {
        await built.provider.disconnect();
      }
    });
  });

  describe('late Chase quote preparation', () => {
    type Book = Awaited<ReturnType<LighterClientService['getOrderBookOrders']>>;
    const finalBook = async (
      built: BuiltProvider,
      change: (book: Book) => Book,
    ): Promise<void> => {
      const book = (await built.clientInstance.getOrderBookOrders(1)) as Book;
      let reads = 0;
      built.clientInstance.getOrderBookOrders.mockImplementation(async () => {
        reads += 1;
        return reads >= 4 ? change(structuredClone(book)) : book;
      });
    };
    it('places and cancels one exact child after cumulative slow preparation with a fresh final quote', async () => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      const start = Date.now();
      let preparing = false;
      let reads = 0;
      const advance = (ms: number): void => {
        vi.setSystemTime(Date.now() + ms);
      };
      const book = (await built.clientInstance.getOrderBookOrders(1)) as Book;
      built.clientInstance.getOrderBookOrders.mockImplementation(async () => {
        reads += 1;
        if (reads === 3) {
          preparing = true;
        }
        if (preparing) {
          advance(50);
        }
        return book;
      });
      const delayed =
        <Args extends unknown[], Result>(
          original: (...args: Args) => Promise<Result>,
          ms: number,
        ): ((...args: Args) => Promise<Result>) =>
        async (...args) => {
          if (preparing) {
            advance(ms);
          }
          return await original(...args);
        };
      const markets =
        built.clientInstance.getOrderBooks.getMockImplementation();
      const account =
        built.clientInstance.getAccountByIndex.getMockImplementation();
      const active =
        built.clientInstance.getActiveOrders.getMockImplementation();
      const nonce = built.clientInstance.getNextNonce.getMockImplementation();
      const read = vi.spyOn(deps.diskCache, 'getItem').getMockImplementation();
      const write = vi.spyOn(deps.diskCache, 'setItem').getMockImplementation();
      const execute = vi.spyOn(built.bridge, 'execute').getMockImplementation();
      if (
        !markets ||
        !account ||
        !active ||
        !nonce ||
        !read ||
        !write ||
        !execute
      ) {
        throw new Error('Missing Chase latency collaborators');
      }
      built.clientInstance.getOrderBooks.mockImplementation(
        delayed(markets, 1100),
      );
      built.clientInstance.getAccountByIndex.mockImplementation(
        delayed(account, 700),
      );
      built.clientInstance.getActiveOrders.mockImplementation(
        delayed(active, 400),
      );
      built.clientInstance.getNextNonce.mockImplementation(delayed(nonce, 200));
      vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (key) => {
        if (preparing && key.startsWith('lighterNonceLedger:')) {
          advance(5);
        }
        return await read(key);
      });
      vi.spyOn(deps.diskCache, 'setItem').mockImplementation(
        async (key, value) => {
          if (preparing) {
            advance(key.startsWith('lighterNonceLedger:') ? 200 : 100);
          }
          return await write(key, value);
        },
      );
      vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
        if (call.function === '_signCreateOrder') {
          advance(400);
        }
        return await execute(call);
      });
      try {
        const result = await built.provider.placeOrder(intent);
        expect(Date.now() - start).toBeGreaterThan(5000);
        expect({
          result,
          signingCalls: built.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ).length,
          transportCalls: built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
          ).length,
        }).toMatchObject({
          result: { success: true, childOrderIds: ['9001'] },
          signingCalls: 1,
          transportCalls: 1,
        });
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(
          built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
          ),
        ).toHaveLength(1);
        const record = (await built.provider.getNativeChaseRecords())[0];
        expect(
          record.children[0].quotedAt - record.intent.startedAt,
        ).toBeGreaterThan(3000);
        preparing = false;
        built.clientInstance.getOrderBookOrders.mockRejectedValue(
          new Error('price feed unavailable'),
        );
        expect(
          (
            await built.provider.cancelOrder(
              cancelParams(result.orderId as string),
            )
          ).success,
        ).toBe(true);
        expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject(
          {
            status: 'canceled',
            children: [{ observation: { terminal: true } }],
          },
        );
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    });
    it('signs and persists the genuine final price rather than relabeling the early quote', async () => {
      vi.useFakeTimers();
      const built = setup();
      await finalBook(built, (book) => ({
        ...book,
        bids: book.bids.map((row) => ({ ...row, price: '99999.6' })),
      }));
      try {
        expect((await built.provider.placeOrder(intent)).success).toBe(true);
        const create = built.calls.filter(
          (call) => call.function === '_signCreateOrder',
        );
        expect(create).toHaveLength(1);
        expect(create[0].params[4]).toBe('999997');
        expect(
          (await built.provider.getNativeChaseRecords())[0].children[0].price,
        ).toBe('99999.7');
        expect(
          built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
          ),
        ).toHaveLength(1);
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    });
    it.each(['distance', 'notional', 'incomplete same-side book'] as const)(
      'refuses a final quote violating %s before signing or transport',
      async (condition) => {
        vi.useFakeTimers();
        const built = setup();
        await finalBook(built, (book) =>
          condition === 'incomplete same-side book'
            ? { ...book, totalBids: 2, bids: [] }
            : {
                ...book,
                bids: book.bids.map((row) => ({
                  ...row,
                  price: condition === 'distance' ? '103000' : '100000',
                })),
                asks: book.asks.map((row) => ({ ...row, price: '104000' })),
              },
        );
        try {
          const result = await built.provider.placeOrder(intent);
          expect(result.success).toBe(false);
          expect(result.error).toContain(
            {
              distance: 'maximum distance',
              notional: 'aggregate budget',
              'incomplete same-side book': 'book is incomplete',
            }[condition],
          );
          expect(
            built.calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(0);
          expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await built.provider.disconnect();
          vi.useRealTimers();
        }
      },
    );
    it.each(['missing', 'malformed', 'crossed', 'stale', 'backwards'] as const)(
      'refuses a %s final book before signing or transport',
      async (condition) => {
        vi.useFakeTimers();
        const built = setup();
        await finalBook(built, (book) => {
          if (condition === 'stale' || condition === 'backwards') {
            vi.setSystemTime(Date.now() + (condition === 'stale' ? 5001 : -1));
            return book;
          }
          if (condition === 'missing') {
            return { ...book, totalBids: 0, bids: [] };
          }
          return {
            ...book,
            bids: book.bids.map((row) => ({
              ...row,
              price: condition === 'malformed' ? 'NaN' : '100002',
            })),
          };
        });
        try {
          const result = await built.provider.placeOrder(intent);
          expect(result.success).toBe(false);
          expect(
            built.calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(0);
          expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await built.provider.disconnect();
          vi.useRealTimers();
        }
      },
    );
    it.each(['account', 'signer reset'] as const)(
      'refuses %s changes during final quote acquisition',
      async (condition) => {
        vi.useFakeTimers();
        const built = setup();
        await finalBook(built, (book) => {
          if (condition === 'account') {
            built.getUserAddressMock.mockReturnValue('0xother');
          } else {
            built.fireReset();
          }
          return book;
        });
        try {
          expect((await built.provider.placeOrder(intent)).success).toBe(false);
          expect(
            built.calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(0);
          expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await built.provider.disconnect();
          vi.useRealTimers();
        }
      },
    );
    it.each(['final exposure', 'nonce append', 'attempted journal'] as const)(
      'retains stale-quote refusal after slow %s and retires only the proven-unsent nonce',
      async (condition) => {
        vi.useFakeTimers();
        const deps = diskDependencies();
        const built = setup({ platformDependencies: deps });
        let signed = false;
        let delayed = false;
        const execute = vi
          .spyOn(built.bridge, 'execute')
          .getMockImplementation();
        const write = vi
          .spyOn(deps.diskCache, 'setItem')
          .getMockImplementation();
        const account =
          built.clientInstance.getAccountByIndex.getMockImplementation() as
            | LighterClientService['getAccountByIndex']
            | undefined;
        if (!execute || !write || !account) {
          throw new Error('Missing dispatch collaborators');
        }
        vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
          const result = await execute(call);
          if (call.function === '_signCreateOrder') {
            signed = true;
          }
          return result;
        });
        built.clientInstance.getAccountByIndex.mockImplementation(
          async (
            ...args: Parameters<LighterClientService['getAccountByIndex']>
          ) => {
            if (signed && !delayed && condition === 'final exposure') {
              delayed = true;
              vi.setSystemTime(Date.now() + 5001);
            }
            return await account(...args);
          },
        );
        vi.spyOn(deps.diskCache, 'setItem').mockImplementation(
          async (key, value) => {
            if (
              signed &&
              !delayed &&
              ((condition === 'nonce append' &&
                key.startsWith('lighterNonceLedger:') &&
                !value.includes('"entries":[]')) ||
                (condition === 'attempted journal' &&
                  key.startsWith('lighterChase:') &&
                  value.includes('"phase":"attempted"')))
            ) {
              delayed = true;
              vi.setSystemTime(Date.now() + 5001);
            }
            return await write(key, value);
          },
        );
        try {
          const result = await built.provider.placeOrder(intent);
          expect(result).toMatchObject({
            success: false,
            error: 'Lighter Chase quote is stale before dispatch',
          });
          expect(delayed).toBe(true);
          expect(
            built.calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(1);
          expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
          const child = (await built.provider.getNativeChaseRecords())[0]
            .children[0];
          expect(child.placement).toMatchObject({
            phase: 'failed',
            nonce: expect.any(Number) as number,
            txHash: expect.any(String) as string,
          });
          const ledger = await deps.diskCache.getItem(
            'lighterNonceLedger:testnet:28:7',
          );
          expect(ledger).toContain('"entries":[]');
          expect(
            built.clientInstance.getNextNonce.mock.results.at(-1)?.value,
          ).toBeDefined();
        } finally {
          await built.provider.disconnect();
          vi.useRealTimers();
        }
      },
    );
    it('retains the frozen parent refusal when signing alone ages a fresh quote', async () => {
      vi.useFakeTimers();
      const built = setup();
      const execute = vi.spyOn(built.bridge, 'execute').getMockImplementation();
      if (!execute) {
        throw new Error('Missing signer implementation');
      }
      vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
        if (call.function === '_signCreateOrder') {
          vi.setSystemTime(Date.now() + 5001);
        }
        return await execute(call);
      });
      try {
        const result = await built.provider.placeOrder(intent);
        expect(result).toMatchObject({
          success: false,
          error: 'Lighter Chase quote is stale before dispatch',
        });
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    });
  });
  it.each(['preparation', 'readiness', 'account exclusion'] as const)(
    'rejects a Chase start suspended during deferred %s before service registration',
    async (boundary) => {
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      const entered = createDeferred<void>();
      const pending = createDeferred<void>();
      if (boundary === 'preparation') {
        const original =
          built.clientInstance.getOrderBookOrders.getMockImplementation() as
            | LighterClientService['getOrderBookOrders']
            | undefined;
        if (!original) {
          throw new Error('Missing book implementation');
        }
        built.clientInstance.getOrderBookOrders.mockImplementationOnce(
          async (
            ...args: Parameters<LighterClientService['getOrderBookOrders']>
          ) => {
            entered.resolve();
            await pending.promise;
            return await original(...args);
          },
        );
      } else if (boundary === 'readiness') {
        const original = vi
          .spyOn(built.bridge, 'createClient')
          .getMockImplementation();
        if (!original) {
          throw new Error('Missing signer readiness implementation');
        }
        vi.spyOn(built.bridge, 'createClient').mockImplementationOnce(
          async (params) => {
            entered.resolve();
            await pending.promise;
            return await original(params);
          },
        );
      } else {
        const original = vi
          .spyOn(deps.diskCache, 'getItem')
          .getMockImplementation();
        if (!original) {
          throw new Error('Missing disk read implementation');
        }
        vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (key) => {
          if (key.startsWith('lighterNativeTwap:')) {
            entered.resolve();
            await pending.promise;
          }
          return await original(key);
        });
      }
      try {
        const starting = built.provider.placeOrder(intent);
        await entered.promise;
        expect(await built.provider.suspendChaseOrders()).toStrictEqual([]);
        pending.resolve();

        const result = await starting;

        expect(result).toMatchObject({
          success: false,
          error: expect.stringContaining('interrupted') as string,
        });
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(0);
        expect(await built.provider.getChaseOrders()).toStrictEqual([]);
        expect((await built.provider.placeOrder(intent)).success).toBe(true);
      } finally {
        pending.resolve();
        await built.provider.disconnect();
      }
    },
  );
  it('keeps a wrong-symbol Chase cancellation under its original duration owner', async () => {
    vi.useFakeTimers();
    const built = setup();
    try {
      const result = await built.provider.placeOrder({
        ...intent,
        chaseIntervalMs: 120000,
        chaseMaxDurationMs: 180000,
      });
      if (!result.orderId) {
        throw new Error('Missing Chase handle');
      }

      const refusal = await built.provider.cancelOrder({
        ...cancelParams(result.orderId),
        symbol: 'ETH',
      });

      expect(refusal.success).toBe(false);
      expect((await built.provider.getChaseOrders())[0]).toMatchObject({
        status: 'active',
        restingOrderId: '9001',
      });
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(179999);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(1);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject({
        status: 'canceled',
        stopReason: 'duration_reached',
      });
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  const restartAbsentChase = async (
    state: 'empty' | 'retained' | 'other-wallet' | 'other-network',
  ): Promise<BuiltProvider> => {
    const deps = diskDependencies();
    if (state !== 'empty') {
      const original = setup({
        platformDependencies: deps,
        configuredAccountIndex: null,
      });
      const result = await original.provider.placeOrder(intent);
      if (!result.success) {
        throw new Error(result.error);
      }
      await original.provider.disconnect();
    }
    const restarted = buildProvider({
      platformDependencies: deps,
      configuredAccountIndex: null,
      isTestnet: state !== 'other-network',
    });
    if (state === 'other-wallet') {
      restarted.getUserAddressMock.mockReturnValue('0xother');
    }
    restarted.clientInstance.getAccountsByL1Address.mockResolvedValue({
      code: 200,
      l1Address: ACCOUNT.l1Address,
      subAccounts: [],
    });
    return restarted;
  };
  it('preserves remembered Chase ownership after absent-account restart: retained', async () => {
    const restarted = await restartAbsentChase('retained');
    try {
      const orders = await restarted.provider.getChaseOrders();
      const suspended = await restarted.provider.suspendChaseOrders();

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        status: 'termination_pending',
        restingOrderId: '9001',
      });
      expect(suspended).toHaveLength(1);
      expect(suspended[0]).toMatchObject({
        handle: orders[0].handle,
        status: 'termination_pending',
        restingOrderId: '9001',
      });
      const cancellation = await restarted.provider.cancelOrder(
        cancelParams(orders[0].handle),
      );
      expect(cancellation).toMatchObject({
        success: false,
        error: expect.any(String) as string,
      });
      expect(
        (await restarted.provider.getNativeChaseRecords())[0].stopReason,
      ).toBe('backgrounded');
      expect(restarted.calls).toHaveLength(0);
      expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(restarted.clientInstance.getApiKeys).not.toHaveBeenCalled();
    } finally {
      await restarted.provider.disconnect();
    }
  });
  const absentChase = (
    deps: ReturnType<typeof createMockInfrastructure>,
  ): BuiltProvider => {
    const built = buildProvider({
      platformDependencies: deps,
      configuredAccountIndex: null,
    });
    built.clientInstance.getAccountsByL1Address.mockResolvedValue({
      code: 200,
      l1Address: ACCOUNT.l1Address,
      subAccounts: [],
    });
    return built;
  };
  const bindRetainedChaseLookup = (
    built: BuiltProvider,
    record: LighterChaseRecord,
    terminal: () => boolean = () =>
      built.calls.some(
        (call) =>
          call.function === '_signCancelOrder' &&
          String(call.params[2]) === record.children[0].observation?.orderId,
      ),
  ): void => {
    const child = record.children[0];
    const orderExpiry = Date.now() + 100000;
    built.clientInstance.getOrdersByClientIds.mockImplementation(
      async (_account: number, _token: string, ids: string[]) => ({
        code: 200,
        orders: ids.includes(child.clientOrderId)
          ? [
              {
                orderIndex: Number(child.observation?.orderId),
                orderId: child.observation?.orderId ?? '',
                clientOrderIndex: Number(child.clientOrderId),
                clientOrderId: child.clientOrderId,
                marketIndex: record.intent.marketId,
                ownerAccountIndex: record.intent.owner.accountIndex,
                initialBaseAmount: child.size,
                remainingBaseAmount: child.size,
                filledBaseAmount: '0',
                filledQuoteAmount: '0',
                price: child.price,
                isAsk: !record.intent.isBuy,
                type: 'limit',
                timeInForce: 'post-only',
                reduceOnly: 0,
                status: terminal() ? 'canceled' : 'open',
                orderExpiry,
                timestamp: 1,
                nonce: 2075941,
              },
            ]
          : [],
      }),
    );
  };
  describe('public Chase cancellation reconciliation without dispatch', () => {
    const journalKey = `lighterChase:${JSON.stringify(['testnet', ACCOUNT.l1Address.toLowerCase(), 28])}`;
    const settled = async <Result>(
      pending: Promise<Result>,
    ): Promise<Result> => {
      const outcome = pending.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      await vi.advanceTimersByTimeAsync(
        LIGHTER_CHASE_CANCEL_SETTLEMENT_WINDOW_MS + 1,
      );
      const result = await outcome;
      if ('error' in result) {
        throw result.error;
      }
      return result.value;
    };
    const retainedCancellation = async (
      acknowledged = true,
    ): Promise<{
      deps: ReturnType<typeof diskDependencies>;
      original: BuiltProvider;
      restored: BuiltProvider;
      retained: LighterChaseRecord;
      params: ReconcileChaseOrderCancellationParams;
    }> => {
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const placed = await original.provider.placeOrder({
        ...intent,
        chaseIntervalMs: 120000,
        chaseMaxDurationMs: 180000,
      });
      if (!placed.success || !placed.orderId) {
        throw new Error(placed.error ?? 'Missing placement');
      }
      const initial = (await original.provider.getNativeChaseRecords())[0];
      bindRetainedChaseLookup(original, initial, () => false);
      if (!acknowledged) {
        original.clientInstance.getTx.mockResolvedValue(null);
        original.clientInstance.sendTx.mockRejectedValueOnce(
          new Error('cancel reply lost'),
        );
      }
      expect(
        (
          await settled(
            original.provider.cancelOrder(cancelParams(placed.orderId)),
          )
        ).success,
      ).toBe(false);
      const retained = (await original.provider.getNativeChaseRecords())[0];
      const child = retained.children[0];
      const cancellation = child.cancellations[0];
      if (
        cancellation.nonce === undefined ||
        !cancellation.txHash ||
        !cancellation.expiresAt
      ) {
        throw new Error('Missing original cancellation identity');
      }
      const params: ReconcileChaseOrderCancellationParams = {
        providerId: 'lighter',
        handle: placed.orderId,
        owner: {
          providerId: 'lighter',
          walletAddress: retained.intent.owner.wallet,
          network: retained.intent.owner.network,
          accountIndex: retained.intent.owner.accountIndex,
          apiKeyIndex: retained.intent.owner.apiKeyIndex,
        },
        clientOrderId: child.clientOrderId,
        cancellation: {
          nonce: cancellation.nonce,
          txHash: cancellation.txHash,
          expiresAt: cancellation.expiresAt,
        },
      };
      await original.provider.disconnect();
      const restored = setup({ platformDependencies: deps });
      bindRetainedChaseLookup(restored, retained, () => false);
      restored.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: cancellation.txHash,
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: cancellation.nonce,
        status: 2,
      });
      return { deps, original, restored, retained, params };
    };
    const expectNoDispatch = (built: BuiltProvider): void => {
      expect(
        built.calls.filter((call) => call.function.startsWith('_sign')),
      ).toStrictEqual([]);
      expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
      expect(
        built.calls.filter((call) => call.function === '_signChangePubKey'),
      ).toStrictEqual([]);
    };
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('retains one original cancellation when exact getTx failure downgrades acknowledgement and the child remains open', async () => {
      const env = await retainedCancellation();
      env.restored.clientInstance.getTx.mockResolvedValue({
        code: 200,
        hash: env.params.cancellation.txHash,
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: env.params.cancellation.nonce,
        status: LIGHTER_TRANSACTION_STATUS.Failed,
      });
      const { controller, host } = ownershipController(env.restored.provider);
      try {
        await controller.init();
        const result = await settled(
          host.messenger.call(
            'PerpsController:reconcileChaseOrderCancellation',
            env.params,
          ),
        );
        expect(result).toMatchObject({
          status: 'unresolved',
          order: { status: 'termination_pending', restingOrderId: '9001' },
        });
        const current = (
          await env.restored.provider.getNativeChaseRecords()
        )[0];
        expect(current.children[0].cancellations).toStrictEqual([
          { ...env.retained.children[0].cancellations[0], phase: 'failed' },
        ]);
        expectNoDispatch(env.restored);
        // Ordinary explicit cancellation retains its existing financial behavior.
        bindRetainedChaseLookup(env.restored, current);
        env.restored.clientInstance.getTx.mockImplementation(
          async (hash: string) => ({
            code: 200,
            hash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: Number(
              env.restored.calls.find(
                (call) => call.function === '_signCancelOrder',
              )?.params[3],
            ),
            status: 2,
          }),
        );
        expect(
          (
            await settled(
              env.restored.provider.cancelOrder(
                cancelParams(env.params.handle),
              ),
            )
          ).success,
        ).toBe(true);
        expect(
          env.restored.calls.filter(
            (call) => call.function === '_signCancelOrder',
          ),
        ).toHaveLength(1);
        expect(env.restored.clientInstance.sendTx).toHaveBeenCalledTimes(1);
      } finally {
        await env.restored.provider.disconnect();
      }
    });
    it('settles delayed terminal evidence through the public messenger with unchanged original inventory', async () => {
      const env = await retainedCancellation();
      const visibleAt = Date.now() + 2000;
      bindRetainedChaseLookup(
        env.restored,
        env.retained,
        () => Date.now() >= visibleAt,
      );
      const { controller, host } = ownershipController(env.restored.provider);
      try {
        await controller.init();
        expect(
          await settled(
            host.messenger.call(
              'PerpsController:reconcileChaseOrderCancellation',
              env.params,
            ),
          ),
        ).toMatchObject({
          status: 'settled',
          providerId: 'lighter',
          handle: env.params.handle,
          order: { status: 'canceled', restingOrderId: null },
        });
        expect(
          (await env.restored.provider.getNativeChaseRecords())[0].children[0]
            .cancellations,
        ).toStrictEqual(env.retained.children[0].cancellations);
        expectNoDispatch(env.restored);
      } finally {
        await env.restored.provider.disconnect();
      }
    });
    it.each([undefined, false])(
      'keeps attempted cancellation with acknowledgement %s unresolved without replay',
      async (acknowledged) => {
        const env = await retainedCancellation(false);
        env.retained.children[0].cancellations[0].acknowledged = acknowledged;
        await env.deps.diskCache.setItem(
          journalKey,
          JSON.stringify({ version: 1, records: [env.retained] }),
        );
        env.restored.clientInstance.getTx.mockResolvedValue(null);
        try {
          expect(
            await settled(
              env.restored.provider.reconcileChaseOrderCancellation(env.params),
            ),
          ).toMatchObject({ status: 'unresolved' });
          expect(
            (await env.restored.provider.getNativeChaseRecords())[0].children[0]
              .cancellations,
          ).toHaveLength(1);
          expectNoDispatch(env.restored);
        } finally {
          await env.restored.provider.disconnect();
        }
      },
    );
    it('keeps a lost exact venue reply unresolved without changing original inventory', async () => {
      const env = await retainedCancellation();
      env.restored.clientInstance.getTx.mockRejectedValue(
        new Error('reconciliation reply lost'),
      );
      try {
        expect(
          await settled(
            env.restored.provider.reconcileChaseOrderCancellation(env.params),
          ),
        ).toMatchObject({ status: 'unresolved' });
        expect(
          (await env.restored.provider.getNativeChaseRecords())[0].children[0]
            .cancellations,
        ).toStrictEqual(env.retained.children[0].cancellations);
        expectNoDispatch(env.restored);
      } finally {
        await env.restored.provider.disconnect();
      }
    });
    it.each([
      'provider',
      'wallet',
      'network',
      'account',
      'key',
      'handle',
      'child',
      'nonce',
      'hash',
      'expiry',
    ] as const)(
      'rejects wrong original %s without signing or transport',
      async (field) => {
        const env = await retainedCancellation();
        const params = structuredClone(env.params);
        if (field === 'provider') {
          params.providerId = 'hyperliquid';
        }
        if (field === 'wallet') {
          params.owner.walletAddress = `0x${'f'.repeat(40)}`;
        }
        if (field === 'network') {
          params.owner.network = 'mainnet';
        }
        if (field === 'account') {
          params.owner.accountIndex = 99;
        }
        if (field === 'key') {
          params.owner.apiKeyIndex = 8;
        }
        if (field === 'handle') {
          params.handle = 'lighter-chase:unknown';
        }
        if (field === 'child') {
          params.clientOrderId = '102';
        }
        if (field === 'nonce') {
          params.cancellation.nonce += 1;
        }
        if (field === 'hash') {
          params.cancellation.txHash = 'c'.repeat(64);
        }
        if (field === 'expiry') {
          params.cancellation.expiresAt += 1;
        }
        try {
          await expect(
            env.restored.provider.reconcileChaseOrderCancellation(params),
          ).rejects.toThrow(/JSON|Chase/u);
          expect(env.restored.clientInstance.getTx).not.toHaveBeenCalled();
          expectNoDispatch(env.restored);
        } finally {
          await env.restored.provider.disconnect();
        }
      },
    );
    it.each([
      'missing cancellation',
      'malformed inventory',
      'missing record',
      'active chase',
    ] as const)(
      'rejects %s without venue observation or new cancellation',
      async (failure) => {
        const env = await retainedCancellation();
        if (failure === 'missing cancellation') {
          env.retained.children[0].cancellations = [];
        }
        if (failure === 'active chase') {
          env.retained.status = 'active';
          delete env.retained.stopReason;
        }
        await env.deps.diskCache.setItem(
          journalKey,
          failure === 'malformed inventory'
            ? '{broken'
            : JSON.stringify({
                version: 1,
                records: failure === 'missing record' ? [] : [env.retained],
              }),
        );
        try {
          await expect(
            env.restored.provider.reconcileChaseOrderCancellation(env.params),
          ).rejects.toThrow(/JSON|Chase/u);
          expect(env.restored.clientInstance.getTx).not.toHaveBeenCalled();
          expectNoDispatch(env.restored);
        } finally {
          await env.restored.provider.disconnect();
        }
      },
    );
    it('rejects a wallet switch during exact venue reconciliation and preserves pending state', async () => {
      const env = await retainedCancellation();
      env.restored.clientInstance.getTx.mockImplementation(async () => {
        env.restored.getUserAddressMock.mockReturnValue(`0x${'f'.repeat(40)}`);
        return {
          code: 200,
          hash: env.params.cancellation.txHash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: env.params.cancellation.nonce,
          status: 2,
        };
      });
      try {
        await expect(
          env.restored.provider.reconcileChaseOrderCancellation(env.params),
        ).rejects.toThrow(/session|owner|context|switched/iu);
        const saved = JSON.parse(
          (await env.deps.diskCache.getItem(journalKey)) ?? '',
        ) as { records: LighterChaseRecord[] };
        expect(saved.records[0].status).toBe('termination_pending');
        expect(saved.records[0].children[0].cancellations).toStrictEqual(
          env.retained.children[0].cancellations,
        );
        expectNoDispatch(env.restored);
      } finally {
        await env.restored.provider.disconnect();
      }
    });
  });
  type AbsentChaseStops = {
    deps: ReturnType<typeof createMockInfrastructure>;
    orderId: string;
    retained: LighterChaseRecord;
    local: LighterChaseRecord;
  };
  const repeatAbsentChaseStops = async (
    first: 'suspension' | 'cancellation',
  ): Promise<AbsentChaseStops> => {
    const deps = diskDependencies();
    const original = setup({
      platformDependencies: deps,
      configuredAccountIndex: null,
    });
    const placed = await original.provider.placeOrder(intent);
    if (!placed.orderId || !placed.success) {
      throw new Error(placed.error ?? 'Missing Chase placement');
    }
    const retained = (await original.provider.getNativeChaseRecords())[0];
    await original.provider.disconnect();
    let local = retained;
    for (let restart = 0; restart < 2; restart += 1) {
      const absent = absentChase(deps);
      try {
        for (
          let stop = 0;
          stop <= LIGHTER_NATIVE_PROBE_CANCEL_LIMIT;
          stop += 1
        ) {
          const suspension = (stop % 2 === 0) === (first === 'suspension');
          const result = suspension
            ? (await absent.provider.suspendChaseOrders())[0]
            : await absent.provider.cancelOrder(cancelParams(placed.orderId));
          const expected = suspension
            ? {
                handle: placed.orderId,
                status: 'termination_pending',
                restingOrderId: '9001',
              }
            : { success: false, error: expect.any(String) as string };
          expect(result).toMatchObject(expected);
        }
        local = (await absent.provider.getNativeChaseRecords())[0];
        expect(absent.calls).toStrictEqual([]);
        expect(absent.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(absent.clientInstance.getApiKeys).not.toHaveBeenCalled();
        expect(
          absent.clientInstance.getOrdersByClientIds,
        ).not.toHaveBeenCalled();
        expect(local.stopReason).toBe(
          first === 'suspension' ? 'backgrounded' : 'canceled',
        );
      } finally {
        await absent.provider.disconnect();
      }
    }
    return { deps, orderId: placed.orderId, retained, local };
  };
  const assertRestoredChaseCleanup = async ({
    deps,
    orderId,
    retained,
    local,
  }: AbsentChaseStops): Promise<void> => {
    const restored = setup({
      platformDependencies: deps,
      configuredAccountIndex: null,
    });
    bindRetainedChaseLookup(restored, retained);
    try {
      const cleanup = await restored.provider.cancelOrder(
        cancelParams(orderId),
      );
      if (!cleanup.success) {
        throw new Error(cleanup.error);
      }
      expect(cleanup.success).toBe(true);
      expect(local.children).toStrictEqual(retained.children);
      expect(local.error).toContain('authority is unavailable');
      const cancel = restored.calls.filter(
        (call) => call.function === '_signCancelOrder',
      );
      expect(cancel).toHaveLength(1);
      expect(cancel[0].params.slice(0, 3)).toStrictEqual([28, 1, '9001']);
      expect(
        restored.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      expect(
        restored.clientInstance.sendTx.mock.calls.filter(
          ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
        ),
      ).toHaveLength(1);
      expect(
        (await restored.provider.getNativeChaseRecords())[0],
      ).toMatchObject({
        intent: retained.intent,
        status: 'canceled',
        stopReason: local.stopReason,
      });
      expect(
        (await restored.provider.getChaseOrders())[0].restingOrderId,
      ).toBeNull();
    } finally {
      await restored.provider.disconnect();
    }
  };
  it('preserves cancellation capacity after repeated local suspension across restart', async () => {
    const stopped = await repeatAbsentChaseStops('suspension');

    expect(stopped.local.children).toStrictEqual(stopped.retained.children);
    await assertRestoredChaseCleanup(stopped);
  });
  it('restores exact cleanup after repeated local cancellation across restart', async () => {
    const stopped = await repeatAbsentChaseStops('cancellation');

    await assertRestoredChaseCleanup(stopped);
    expect(stopped.local.children).toStrictEqual(stopped.retained.children);
  });
  it.each([
    'conflict',
    'advanced nonce',
    'invalid nonce',
    'missing order',
    'unknown remaining',
    'legacy unknown',
  ] as const)(
    'retains uncertain Chase cancellation after %s and expired absence across restart',
    async (evidence) => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      try {
        const placed = await original.provider.placeOrder(intent);
        if (!placed.success || !placed.orderId) {
          throw new Error('Missing Chase placement');
        }
        const record = (await original.provider.getNativeChaseRecords())[0];
        bindRetainedChaseLookup(original, record, () => false);
        original.clientInstance.sendTx.mockRejectedValueOnce(
          new Error('response lost'),
        );
        original.clientInstance.getTx.mockImplementation(
          async (hash: string) => {
            const signed = original.calls.find(
              (call) => call.function === '_signCancelOrder',
            );
            return evidence === 'conflict' && signed
              ? {
                  code: 200,
                  hash,
                  accountIndex: 99,
                  apiKeyIndex: 7,
                  nonce: Number(signed.params[3]),
                  status: 1,
                }
              : null;
          },
        );
        const first = original.provider.cancelOrder(
          cancelParams(placed.orderId),
        );
        await vi.advanceTimersByTimeAsync(10000);
        expect((await first).success).toBe(false);
        const retained = (await original.provider.getNativeChaseRecords())[0];
        const attempt = retained.children[0].cancellations[0];
        await original.provider.disconnect();
        if (evidence === 'legacy unknown') {
          const key = `lighterChase:${JSON.stringify([retained.intent.owner.network, retained.intent.owner.wallet, retained.intent.owner.accountIndex])}`;
          // A version-1 record without acknowledgment evidence is unknown.
          const legacy = JSON.parse(
            JSON.stringify(retained),
          ) as LighterChaseRecord;
          Reflect.deleteProperty(
            legacy.children[0].cancellations[0],
            'acknowledged',
          );
          await deps.diskCache.setItem(
            key,
            JSON.stringify({ version: 1, records: [legacy] }),
          );
        }
        vi.setSystemTime(
          (attempt.expiresAt ?? 0) + LIGHTER_TX_EXPIRY_SLACK_MS + 1,
        );
        const restored = setup({ platformDependencies: deps });
        bindRetainedChaseLookup(restored, retained, () => false);
        restored.clientInstance.getTx.mockResolvedValue(null);
        restored.clientInstance.getNextNonce.mockResolvedValue({
          code: 200,
          nonce:
            evidence === 'invalid nonce'
              ? Number.NaN
              : (attempt.nonce ?? 0) + (evidence === 'advanced nonce' ? 1 : 0),
        });
        if (evidence === 'missing order') {
          restored.clientInstance.getOrdersByClientIds.mockResolvedValue({
            code: 200,
            orders: [],
          });
        } else if (evidence === 'unknown remaining') {
          const lookup =
            restored.clientInstance.getOrdersByClientIds.getMockImplementation() as ExactLookup;
          restored.clientInstance.getOrdersByClientIds.mockImplementation(
            async (...args: Parameters<ExactLookup>) => {
              const exact = await lookup(...args);
              return {
                ...exact,
                orders: exact.orders.map((row) => ({
                  ...row,
                  remainingBaseAmount: '',
                })),
              };
            },
          );
        }
        try {
          const stopping = restored.provider.cancelOrder(
            cancelParams(placed.orderId),
          );
          await vi.advanceTimersByTimeAsync(10000);
          expect((await stopping).success).toBe(false);
          expect(
            restored.calls.filter(
              (call) => call.function === '_signCancelOrder',
            ),
          ).toHaveLength(0);
          expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
          const current = (await restored.provider.getNativeChaseRecords())[0];
          expect(current.children[0].cancellations).toHaveLength(1);
          expect(current.children[0].cancellations[0].phase).toBe('attempted');
          expect(current.status).toBe('termination_pending');
        } finally {
          await restored.provider.disconnect();
        }
      } finally {
        await original.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it('retains unknown Chase evidence when conflict persistence fails after an owner switch', async () => {
    vi.useFakeTimers();
    const deps = diskDependencies();
    const original = setup({ platformDependencies: deps });
    const held = createDeferred<void>();
    const entered = createDeferred<void>();
    const write = vi.spyOn(deps.diskCache, 'setItem').getMockImplementation();
    if (!write) {
      throw new Error('Missing journal storage');
    }
    try {
      const placed = await original.provider.placeOrder(intent);
      const record = (await original.provider.getNativeChaseRecords())[0];
      bindRetainedChaseLookup(original, record, () => false);
      original.clientInstance.getTx.mockResolvedValue(null);
      original.clientInstance.sendTx.mockRejectedValueOnce(
        new Error('response lost'),
      );
      const first = original.provider.cancelOrder(
        cancelParams(placed.orderId ?? ''),
      );
      await vi.advanceTimersByTimeAsync(10000);
      expect((await first).success).toBe(false);
      const retained = (await original.provider.getNativeChaseRecords())[0];
      const dispatch = retained.children[0].cancellations[0];
      expect(dispatch.acknowledged).toBe(false);
      original.clientInstance.getTx.mockImplementationOnce(async () => {
        entered.resolve();
        await held.promise;
        return {
          code: 200,
          hash: dispatch.txHash ?? '',
          accountIndex: 99,
          apiKeyIndex: 7,
          nonce: dispatch.nonce ?? -1,
          status: 1,
        };
      });
      const stopping = original.provider.cancelOrder(
        cancelParams(placed.orderId ?? ''),
      );
      await entered.promise;
      original.getUserAddressMock.mockReturnValue(
        '0x0000000000000000000000000000000000000099',
      );
      vi.spyOn(deps.diskCache, 'setItem').mockRejectedValue(
        new Error('completion storage unavailable'),
      );
      held.resolve();
      expect((await stopping).success).toBe(false);
      await original.provider.disconnect();
      vi.spyOn(deps.diskCache, 'setItem').mockImplementation(write);
      vi.setSystemTime(
        (dispatch.expiresAt ?? 0) + LIGHTER_TX_EXPIRY_SLACK_MS + 1,
      );
      const restored = setup({ platformDependencies: deps });
      bindRetainedChaseLookup(restored, retained, () => false);
      restored.clientInstance.getTx.mockResolvedValue(null);
      try {
        const saved = (await restored.provider.getNativeChaseRecords())[0];
        expect(saved.children[0].cancellations[0].acknowledged).toBeUndefined();
        const cleanup = restored.provider.cancelOrder(
          cancelParams(placed.orderId ?? ''),
        );
        await vi.advanceTimersByTimeAsync(10000);
        expect((await cleanup).success).toBe(false);
        expect(
          restored.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(0);
        expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
      } finally {
        await restored.provider.disconnect();
      }
    } finally {
      held.resolve();
      await original.provider.disconnect();
      vi.spyOn(deps.diskCache, 'setItem').mockImplementation(write);
      vi.useRealTimers();
    }
  });
  it.each(
    (['place', 'cancel'] as const).flatMap((operation) =>
      (['read', 'parse', 'matching'] as const).map((failure) => ({
        operation,
        failure,
      })),
    ),
  )(
    'retains accepted Chase $operation and its nonce after completion $failure failure across restart',
    async ({ operation, failure }) => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const read = vi.spyOn(deps.diskCache, 'getItem').getMockImplementation();
      if (!read) {
        throw new Error('Missing journal storage');
      }
      let armed = false;
      let injected = false;
      let attempted: LighterChaseRecord | undefined;
      vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (key) => {
        const raw = await read(key);
        if (!armed || !key.startsWith('lighterChase:')) {
          return raw;
        }
        armed = false;
        injected = true;
        const journal = JSON.parse(raw ?? '') as {
          records: LighterChaseRecord[];
        };
        attempted = structuredClone(journal.records[0]);
        if (failure === 'read') {
          throw new Error('completion read failed');
        }
        if (failure === 'parse') {
          return '{"version":1,';
        }
        const child = journal.records[0].children[0];
        const dispatch =
          operation === 'place' ? child.placement : child.cancellations[0];
        if (dispatch.nonce === undefined) {
          throw new Error('Missing captured signed nonce');
        }
        dispatch.nonce += 1;
        return JSON.stringify(journal);
      });
      try {
        let handle = '';
        if (operation === 'cancel') {
          const placed = await original.provider.placeOrder(intent);
          handle = placed.orderId ?? '';
          const record = (await original.provider.getNativeChaseRecords())[0];
          bindRetainedChaseLookup(original, record, () => false);
        } else {
          original.clientInstance.getOrdersByClientIds.mockResolvedValue({
            code: 200,
            orders: [],
          });
        }
        original.clientInstance.getTx.mockResolvedValue(null);
        original.clientInstance.sendTx.mockImplementationOnce(async () => {
          armed = true;
          return { code: 200, txHash: 'accepted' };
        });
        const pending =
          operation === 'place'
            ? original.provider.placeOrder(intent)
            : original.provider.cancelOrder(cancelParams(handle));
        await vi.advanceTimersByTimeAsync(10000);
        expect((await pending).success).toBe(false);
        expect(injected).toBe(true);
        if (!attempted) {
          throw new Error('Missing captured original attempt');
        }
        const saved = (await original.provider.getNativeChaseRecords())[0];
        expect(saved.intent).toStrictEqual(attempted.intent);
        expect(saved.status).toBe('termination_pending');
        const dispatch =
          operation === 'place'
            ? saved.children[0].placement
            : saved.children[0].cancellations[0];
        const originalDispatch =
          operation === 'place'
            ? attempted.children[0].placement
            : attempted.children[0].cancellations[0];
        expect(dispatch).toStrictEqual({
          ...originalDispatch,
          phase: 'acknowledged',
          acknowledged: true,
        });
        const ledgerKey = 'lighterNonceLedger:testnet:28:7';
        const ledger = JSON.parse(
          (await deps.diskCache.getItem(ledgerKey)) ?? '',
        ) as {
          entries: unknown[];
        };
        expect(ledger.entries).toHaveLength(1);
        expect(
          original.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(
          original.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(operation === 'cancel' ? 1 : 0);
        expect(original.clientInstance.sendTx).toHaveBeenCalledTimes(
          operation === 'cancel' ? 2 : 1,
        );
        await original.provider.disconnect();
        vi.setSystemTime(
          (dispatch.expiresAt ?? 0) + LIGHTER_TX_EXPIRY_SLACK_MS + 1,
        );
        const restored = setup({ platformDependencies: deps });
        restored.clientInstance.getTx.mockResolvedValue(null);
        if (operation === 'cancel') {
          bindRetainedChaseLookup(restored, saved, () => false);
        } else {
          restored.clientInstance.getOrdersByClientIds.mockResolvedValue({
            code: 200,
            orders: [],
          });
        }
        try {
          expect(
            (await restored.provider.getNativeChaseRecords())[0],
          ).toStrictEqual(saved);
          const cleanup = restored.provider.cancelOrder(
            cancelParams(saved.intent.handle),
          );
          await vi.advanceTimersByTimeAsync(10000);
          expect((await cleanup).success).toBe(false);
          const retained = (await restored.provider.getNativeChaseRecords())[0];
          expect(retained.status).toBe('termination_pending');
          expect(
            operation === 'place'
              ? retained.children[0].placement
              : retained.children[0].cancellations[0],
          ).toStrictEqual(dispatch);
          expect(
            restored.calls.filter((call) =>
              ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
            ),
          ).toHaveLength(0);
          expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
          const retainedLedger = JSON.parse(
            (await deps.diskCache.getItem(ledgerKey)) ?? '',
          ) as { entries: unknown[] };
          expect(retainedLedger.entries).toStrictEqual(ledger.entries);
        } finally {
          await restored.provider.disconnect();
        }
      } finally {
        await original.provider.disconnect();
        vi.spyOn(deps.diskCache, 'getItem').mockImplementation(read);
        vi.useRealTimers();
      }
    },
  );
  it.each(
    (['place', 'cancel'] as const).flatMap((operation) =>
      (
        [
          'account switch',
          'network switch',
          'reset',
          'storage failure',
        ] as const
      ).map((boundary) => ({ operation, boundary })),
    ),
  )(
    'saves accepted Chase $operation before $boundary and nonce retirement',
    async ({ operation, boundary }) => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const entered = createDeferred<void>();
      const held = createDeferred<void>();
      let switchedInventory: LighterChaseRecord[] = [];
      let switchedCallCount = 0;
      let captured: LighterChaseRecord | undefined;
      const write = vi.spyOn(deps.diskCache, 'setItem').getMockImplementation();
      if (!write) {
        throw new Error('Missing journal storage');
      }
      vi.spyOn(deps.diskCache, 'setItem').mockImplementation(
        async (key, value) => {
          if (key.startsWith('lighterChase:')) {
            const journal = JSON.parse(value) as {
              records: LighterChaseRecord[];
            };
            captured = journal.records[0];
            const dispatch =
              operation === 'place'
                ? captured.children[0]?.placement
                : captured.children[0]?.cancellations.at(-1);
            if (
              boundary === 'storage failure' &&
              dispatch?.phase === 'acknowledged'
            ) {
              throw new Error('acknowledgment storage unavailable');
            }
          }
          await write(key, value);
        },
      );
      try {
        let handle = '';
        if (operation === 'cancel') {
          const placed = await original.provider.placeOrder(intent);
          handle = placed.orderId ?? '';
          const record = (await original.provider.getNativeChaseRecords())[0];
          bindRetainedChaseLookup(original, record, () => false);
        }
        original.clientInstance.getTx.mockResolvedValue(null);
        original.clientInstance.sendTx.mockImplementationOnce(async () => {
          entered.resolve();
          await held.promise;
          return { code: 200, txHash: 'accepted' };
        });
        const pending =
          operation === 'place'
            ? original.provider.placeOrder(intent)
            : original.provider.cancelOrder(cancelParams(handle));
        await entered.promise;
        if (boundary === 'account switch') {
          original.getUserAddressMock.mockReturnValue(
            '0x0000000000000000000000000000000000000099',
          );
        } else if (boundary === 'network switch') {
          await original.provider.disconnect();
          const mainnet = buildProvider({
            platformDependencies: deps,
            isTestnet: false,
            chaseTestnetProbe: false,
            nativeTwapTestnetProbe: false,
          });
          switchedInventory = await mainnet.provider.getNativeChaseRecords();
          switchedCallCount = mainnet.calls.length;
          await mainnet.provider.disconnect();
        } else if (boundary === 'reset') {
          original.fireReset();
        }
        held.resolve();
        await vi.advanceTimersByTimeAsync(10000);
        expect((await pending).success).toBe(false);
        expect(switchedInventory).toStrictEqual([]);
        expect(switchedCallCount).toBe(0);
        if (!captured) {
          throw new Error('Missing captured original owner');
        }
        const key = `lighterChase:${JSON.stringify([captured.intent.owner.network, captured.intent.owner.wallet, captured.intent.owner.accountIndex])}`;
        const raw = await deps.diskCache.getItem(key);
        const saved = (
          JSON.parse(raw ?? '') as { records: LighterChaseRecord[] }
        ).records[0];
        const dispatch =
          operation === 'place'
            ? saved.children[0].placement
            : saved.children[0].cancellations[0];
        expect(dispatch.phase).toBe(
          boundary === 'storage failure' ? 'attempted' : 'acknowledged',
        );
        const ledger = JSON.parse(
          (await deps.diskCache.getItem('lighterNonceLedger:testnet:28:7')) ??
            '',
        ) as { entries: unknown[] };
        expect(ledger.entries).toHaveLength(
          boundary === 'storage failure' ? 1 : 0,
        );
        await original.provider.disconnect();
        vi.spyOn(deps.diskCache, 'setItem').mockImplementation(write);
        vi.setSystemTime(
          (dispatch.expiresAt ?? 0) + LIGHTER_TX_EXPIRY_SLACK_MS + 1,
        );
        const restored = setup({ platformDependencies: deps });
        restored.clientInstance.getTx.mockResolvedValue(null);
        if (operation === 'cancel') {
          bindRetainedChaseLookup(restored, saved, () => false);
        } else {
          restored.clientInstance.getOrdersByClientIds.mockResolvedValue({
            code: 200,
            orders: [],
          });
        }
        try {
          const cleanup = restored.provider.cancelOrder(
            cancelParams(saved.intent.handle),
          );
          await vi.advanceTimersByTimeAsync(10000);
          expect((await cleanup).success).toBe(false);
          expect(
            (await restored.provider.getNativeChaseRecords())[0].status,
          ).toBe('termination_pending');
          expect(
            restored.calls.filter((call) =>
              ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
            ),
          ).toHaveLength(0);
          expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await restored.provider.disconnect();
        }
      } finally {
        held.resolve();
        await original.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it('retries an unacknowledged Chase cancellation only with complete never-landed proof', async () => {
    vi.useFakeTimers();
    const deps = diskDependencies();
    const original = setup({ platformDependencies: deps });
    try {
      const placed = await original.provider.placeOrder(intent);
      const record = (await original.provider.getNativeChaseRecords())[0];
      bindRetainedChaseLookup(original, record, () => false);
      original.clientInstance.getTx.mockResolvedValue(null);
      original.clientInstance.sendTx.mockRejectedValueOnce(
        new Error('response lost'),
      );
      const first = original.provider.cancelOrder(
        cancelParams(placed.orderId ?? ''),
      );
      await vi.advanceTimersByTimeAsync(10000);
      expect((await first).success).toBe(false);
      const retained = (await original.provider.getNativeChaseRecords())[0];
      const dispatch = retained.children[0].cancellations[0];
      expect(dispatch).toMatchObject({
        phase: 'attempted',
        acknowledged: false,
      });
      await original.provider.disconnect();
      vi.setSystemTime(
        (dispatch.expiresAt ?? 0) + LIGHTER_TX_EXPIRY_SLACK_MS + 1,
      );
      const restored = setup({ platformDependencies: deps });
      bindRetainedChaseLookup(restored, retained);
      restored.clientInstance.getTx.mockResolvedValue(null);
      restored.clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: dispatch.nonce ?? -1,
      });
      try {
        expect(
          await restored.provider.cancelOrder(
            cancelParams(placed.orderId ?? ''),
          ),
        ).toMatchObject({ success: true });
        const settled = (await restored.provider.getNativeChaseRecords())[0];
        expect(settled.children[0].cancellations).toHaveLength(2);
        expect(settled.children[0].cancellations[0].phase).toBe('failed');
        expect(
          restored.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
        expect(
          restored.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
          ),
        ).toHaveLength(1);
      } finally {
        await restored.provider.disconnect();
      }
    } finally {
      await original.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it.each(['place', 'cancel'] as const)(
    'saves exact-seen Chase %s acceptance across an owner switch',
    async (operation) => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const held = createDeferred<void>();
      const entered = createDeferred<void>();
      try {
        let handle: string;
        let initialSuccess: boolean | undefined;
        if (operation === 'place') {
          original.clientInstance.getOrdersByClientIds.mockResolvedValue({
            code: 200,
            orders: [],
          });
          original.clientInstance.getTx.mockResolvedValue(null);
          original.clientInstance.sendTx.mockRejectedValueOnce(
            new Error('response lost'),
          );
          const placed = await original.provider.placeOrder(intent);
          handle = placed.orderId ?? '';
          initialSuccess = placed.success;
        } else {
          const placed = await original.provider.placeOrder(intent);
          handle = placed.orderId ?? '';
          const record = (await original.provider.getNativeChaseRecords())[0];
          bindRetainedChaseLookup(original, record, () => false);
          original.clientInstance.getTx.mockResolvedValue(null);
          original.clientInstance.sendTx.mockRejectedValueOnce(
            new Error('response lost'),
          );
          const first = original.provider.cancelOrder(cancelParams(handle));
          await vi.advanceTimersByTimeAsync(10000);
          initialSuccess = (await first).success;
        }
        expect(initialSuccess).toBe(false);
        const retained = (await original.provider.getNativeChaseRecords())[0];
        const dispatch =
          operation === 'place'
            ? retained.children[0].placement
            : retained.children[0].cancellations[0];
        original.clientInstance.getTx.mockImplementationOnce(async () => {
          entered.resolve();
          await held.promise;
          return {
            code: 200,
            hash: dispatch.txHash ?? '',
            accountIndex: retained.intent.owner.accountIndex,
            apiKeyIndex: retained.intent.owner.apiKeyIndex,
            nonce: dispatch.nonce ?? -1,
            status: LIGHTER_TRANSACTION_STATUS.Pending,
          };
        });
        const stopping = original.provider.cancelOrder(cancelParams(handle));
        await entered.promise;
        original.getUserAddressMock.mockReturnValue(
          '0x0000000000000000000000000000000000000099',
        );
        held.resolve();
        expect((await stopping).success).toBe(false);
        await original.provider.disconnect();
        vi.setSystemTime(
          (dispatch.expiresAt ?? 0) + LIGHTER_TX_EXPIRY_SLACK_MS + 1,
        );
        const restored = setup({ platformDependencies: deps });
        restored.clientInstance.getTx.mockResolvedValue(null);
        if (operation === 'cancel') {
          bindRetainedChaseLookup(restored, retained, () => false);
        } else {
          restored.clientInstance.getOrdersByClientIds.mockResolvedValue({
            code: 200,
            orders: [],
          });
        }
        try {
          const record = (await restored.provider.getNativeChaseRecords())[0];
          expect(
            operation === 'place'
              ? record.children[0].placement
              : record.children[0].cancellations[0],
          ).toMatchObject({ phase: 'acknowledged', acknowledged: true });
          const cleanup = restored.provider.cancelOrder(cancelParams(handle));
          await vi.advanceTimersByTimeAsync(10000);
          expect((await cleanup).success).toBe(false);
          expect(
            restored.calls.filter((call) =>
              ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
            ),
          ).toHaveLength(0);
          expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await restored.provider.disconnect();
        }
      } finally {
        held.resolve();
        await original.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it.each([
    LIGHTER_TRANSACTION_STATUS.Pending,
    LIGHTER_TRANSACTION_STATUS.PendingFinal,
    LIGHTER_TRANSACTION_STATUS.Executed,
  ])(
    'keeps exact-seen Chase acceptance after response loss, expired absence and restart outcome=%s',
    async (outcome) => {
      vi.useFakeTimers();
      try {
        const deps = diskDependencies();
        const original = setup({
          platformDependencies: deps,
          configuredAccountIndex: null,
        });
        const placed = await original.provider.placeOrder(intent);
        if (!placed.orderId || !placed.success) {
          throw new Error(placed.error ?? 'Missing Chase placement');
        }
        const handle = placed.orderId;
        const retained = (await original.provider.getNativeChaseRecords())[0];
        bindRetainedChaseLookup(original, retained, () => false);
        original.clientInstance.getTx.mockResolvedValue(null);
        original.clientInstance.sendTx.mockRejectedValueOnce(
          new Error('cancel response lost'),
        );
        const cancel = (): ReturnType<typeof original.provider.cancelOrder> =>
          original.provider.cancelOrder(cancelParams(handle));
        const firstCancellation = cancel();
        await vi.advanceTimersByTimeAsync(10000);
        expect((await firstCancellation).success).toBe(false);
        const attempted = (await original.provider.getNativeChaseRecords())[0];
        const dispatch = attempted.children[0].cancellations[0];
        if (
          !dispatch.expiresAt ||
          !dispatch.txHash ||
          dispatch.nonce === undefined
        ) {
          throw new Error('Missing Chase cancellation identity');
        }
        expect(dispatch.phase).toBe('attempted');
        original.clientInstance.getTx.mockResolvedValue({
          code: 200,
          hash: dispatch.txHash,
          accountIndex: attempted.intent.owner.accountIndex,
          apiKeyIndex: attempted.intent.owner.apiKeyIndex,
          nonce: dispatch.nonce,
          status: outcome,
        });
        const observingAcceptance = cancel();
        await vi.advanceTimersByTimeAsync(10000);
        expect((await observingAcceptance).success).toBe(false);
        const seen = (await original.provider.getNativeChaseRecords())[0];
        await original.provider.disconnect();
        await vi.advanceTimersByTimeAsync(
          dispatch.expiresAt + LIGHTER_TX_EXPIRY_SLACK_MS - Date.now() + 1,
        );
        for (let restart = 0; restart < 2; restart += 1) {
          const restored = setup({
            platformDependencies: deps,
            configuredAccountIndex: null,
          });
          bindRetainedChaseLookup(restored, attempted, () => false);
          restored.clientInstance.getTx.mockResolvedValue(null);
          try {
            const cancellation = restored.provider.cancelOrder(
              cancelParams(placed.orderId),
            );
            await vi.advanceTimersByTimeAsync(10000);
            expect((await cancellation).success).toBe(false);
            const current = (
              await restored.provider.getNativeChaseRecords()
            )[0];
            expect(current.children[0].cancellations).toStrictEqual([
              { ...dispatch, phase: 'acknowledged', acknowledged: true },
            ]);
            expect(current.executedSize).toBe(attempted.executedSize);
            expect(current.executedNotional).toBe(attempted.executedNotional);
            expect(
              restored.calls.filter(
                (call) => call.function === '_signCancelOrder',
              ),
            ).toStrictEqual([]);
            expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
          } finally {
            await restored.provider.disconnect();
          }
        }
        expect(seen.children[0].cancellations).toStrictEqual([
          { ...dispatch, phase: 'acknowledged', acknowledged: true },
        ]);
        expect(
          original.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
        expect(
          original.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
          ),
        ).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('preserves a real attempted cancellation through absent stops and refuses an unknown duplicate after restart', async () => {
    vi.useFakeTimers();
    try {
      const deps = diskDependencies();
      const original = setup({
        platformDependencies: deps,
        configuredAccountIndex: null,
      });
      const placed = await original.provider.placeOrder(intent);
      if (!placed.orderId || !placed.success) {
        throw new Error(placed.error ?? 'Missing Chase placement');
      }
      const retained = (await original.provider.getNativeChaseRecords())[0];
      bindRetainedChaseLookup(original, retained, () => false);
      original.clientInstance.getTx.mockResolvedValue(null);
      original.clientInstance.sendTx.mockRejectedValueOnce(
        new Error('cancel response lost'),
      );
      const firstCancellation = original.provider.cancelOrder(
        cancelParams(placed.orderId),
      );
      await vi.advanceTimersByTimeAsync(10000);
      expect((await firstCancellation).success).toBe(false);
      const attempted = (await original.provider.getNativeChaseRecords())[0];
      expect(attempted.children[0].cancellations[0]).toMatchObject({
        phase: 'attempted',
        txHash: expect.any(String) as string,
      });
      expect(
        original.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(1);
      expect(
        original.clientInstance.sendTx.mock.calls.filter(
          ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
        ),
      ).toHaveLength(1);
      await original.provider.disconnect();
      for (let restart = 0; restart < 2; restart += 1) {
        const absent = absentChase(deps);
        try {
          for (
            let stop = 0;
            stop <= LIGHTER_NATIVE_PROBE_CANCEL_LIMIT;
            stop += 1
          ) {
            await absent.provider.suspendChaseOrders();
            await absent.provider.cancelOrder(cancelParams(placed.orderId));
          }
          expect(
            (await absent.provider.getNativeChaseRecords())[0].children,
          ).toStrictEqual(attempted.children);
          expect(absent.calls).toStrictEqual([]);
          expect(absent.clientInstance.sendTx).not.toHaveBeenCalled();
        } finally {
          await absent.provider.disconnect();
        }
      }
      const restored = setup({
        platformDependencies: deps,
        configuredAccountIndex: null,
      });
      let terminal = false;
      bindRetainedChaseLookup(restored, attempted, () => terminal);
      const dispatch = attempted.children[0].cancellations[0];
      restored.clientInstance.getTx.mockImplementation(
        async (hash: string) => ({
          code: 200,
          hash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: dispatch.nonce,
          status: terminal ? 2 : 1,
        }),
      );
      try {
        const retainedCancellation = restored.provider.cancelOrder(
          cancelParams(placed.orderId),
        );
        await vi.advanceTimersByTimeAsync(10000);
        expect((await retainedCancellation).success).toBe(false);
        expect(
          (await restored.provider.getNativeChaseRecords())[0].children[0]
            .cancellations,
        ).toStrictEqual([
          { ...dispatch, phase: 'acknowledged', acknowledged: true },
        ]);
        terminal = true;
        expect(
          (await restored.provider.cancelOrder(cancelParams(placed.orderId)))
            .success,
        ).toBe(true);
        expect(
          restored.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(0);
        expect(restored.clientInstance.sendTx).not.toHaveBeenCalled();
      } finally {
        await restored.provider.disconnect();
      }
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['empty', 'other-wallet', 'other-network'] as const)(
    'isolates remembered Chase ownership after absent-account restart: %s',
    async (state) => {
      const restarted = await restartAbsentChase(state);
      try {
        const orders = await restarted.provider.getChaseOrders();
        const suspended = await restarted.provider.suspendChaseOrders();

        expect(orders).toStrictEqual([]);
        expect(suspended).toStrictEqual([]);
        expect(restarted.calls).toHaveLength(0);
        expect(restarted.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(restarted.clientInstance.getApiKeys).not.toHaveBeenCalled();
      } finally {
        await restarted.provider.disconnect();
      }
    },
  );
  it.each(['malformed JSON', 'duplicate identity', 'unreadable'] as const)(
    'refuses a %s remembered Chase identity after absent-account restart',
    async (state) => {
      const deps = diskDependencies();
      const key = `lighterRecoveryAccounts:testnet:${ACCOUNT.l1Address.toLowerCase()}`;
      await deps.diskCache.setItem(
        key,
        state === 'malformed JSON' ? '{' : JSON.stringify([28, 28]),
      );
      if (state === 'unreadable') {
        const original = vi
          .spyOn(deps.diskCache, 'getItem')
          .getMockImplementation();
        if (!original) {
          throw new Error('Missing disk read implementation');
        }
        vi.spyOn(deps.diskCache, 'getItem').mockImplementation(async (name) => {
          if (name === key) {
            throw new Error('remembered Chase identity storage unavailable');
          }
          return await original(name);
        });
      }
      const built = buildProvider({
        platformDependencies: deps,
        configuredAccountIndex: null,
      });
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [],
      });
      const expected = {
        'malformed JSON': /JSON|property|position/u,
        'duplicate identity': 'recovery account index is corrupt',
        unreadable: 'remembered Chase identity storage unavailable',
      }[state];
      try {
        await expect(built.provider.getChaseOrders()).rejects.toThrow(expected);
        await expect(built.provider.suspendChaseOrders()).rejects.toThrow(
          expected,
        );
        expect(built.calls).toStrictEqual([]);
        expect(built.clientInstance.sendTx).not.toHaveBeenCalled();
        expect(built.clientInstance.getApiKeys).not.toHaveBeenCalled();
      } finally {
        await built.provider.disconnect();
      }
    },
  );
  it.each(['settled', 'later-settled', 'unresolved'] as const)(
    'reports the requested Chase cleanup independently of its earlier failure: %s',
    async (state) => {
      vi.useFakeTimers();
      const built = setup();
      const original =
        built.clientInstance.getOrdersByClientIds.getMockImplementation() as
          | ExactLookup
          | undefined;
      if (!original) {
        throw new Error('Missing exact child implementation');
      }
      let terminal = state === 'settled';
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async (...args: Parameters<ExactLookup>) => {
          const response = await original(...args);
          return terminal
            ? response
            : {
                ...response,
                orders: response.orders.map((order) => ({
                  ...order,
                  status: 'open',
                })),
              };
        },
      );
      try {
        const placed = await built.provider.placeOrder(intent);
        if (!placed.orderId) {
          throw new Error('Missing handle');
        }
        built.clientInstance.getOrderBookOrders.mockRejectedValue(
          new Error('quote unavailable'),
        );
        await vi.advanceTimersByTimeAsync(11000);
        const before = (await built.provider.getNativeChaseRecords())[0];
        expect(before.stopReason).toBe('failed');
        if (state === 'later-settled') {
          terminal = true;
        }

        const cancellation = built.provider.cancelOrder(
          cancelParams(placed.orderId),
        );
        await vi.advanceTimersByTimeAsync(10000);
        const receipt = await cancellation;

        const after = (await built.provider.getNativeChaseRecords())[0];
        expect(after.stopReason).toBe('failed');
        const pendingError =
          'Lighter Chase exact cancellation remains unresolved';
        expect(receipt).toStrictEqual({
          success: state !== 'unresolved',
          orderId: placed.orderId,
          providerId: 'lighter',
          ...(state === 'unresolved' ? { error: pendingError } : {}),
        });
        expect(after.status).toBe(
          state === 'unresolved' ? 'termination_pending' : 'failed',
        );
        expect(after.error).toBe(
          state === 'unresolved' ? pendingError : before.error,
        );
        expect((await built.provider.getChaseOrders())[0].restingOrderId).toBe(
          state === 'unresolved' ? '9001' : null,
        );
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it.each(['absent', 'unbound'] as const)(
    'returns empty default-off Chase management for an %s wallet',
    async (state) => {
      const built = buildProvider({ configuredAccountIndex: null });
      if (state === 'absent') {
        built.clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          l1Address: ACCOUNT.l1Address,
          subAccounts: [],
        });
      } else {
        built.getUserAddressMock.mockImplementation(() => {
          throw new Error('No selected wallet');
        });
      }
      expect(await built.provider.getChaseOrders()).toStrictEqual([]);
      expect(await built.provider.suspendChaseOrders()).toStrictEqual([]);
      expect(
        await built.provider.cancelOrder(cancelParams('lighter-chase:unknown')),
      ).toMatchObject({ success: false });
      expect(built.calls).toHaveLength(0);
      await built.provider.disconnect();
    },
  );
  it('retains an accepted placement through exact-row indexer lag and observes it on the next tick', async () => {
    vi.useFakeTimers();
    const built = setup();
    const exact =
      built.clientInstance.getOrdersByClientIds.getMockImplementation() as
        | ExactLookup
        | undefined;
    if (!exact) {
      throw new Error('Missing exact lookup');
    }
    let visible = false;
    built.clientInstance.getOrdersByClientIds.mockImplementation(
      async (...args: Parameters<ExactLookup>) =>
        visible ? await exact(...args) : { code: 200, orders: [] },
    );
    built.clientInstance.getTx.mockResolvedValue(null);
    try {
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(true);
      expect((await built.provider.getChaseOrders())[0].status).toBe('active');
      visible = true;
      await vi.advanceTimersByTimeAsync(1000);
      expect((await built.provider.getChaseOrders())[0]).toMatchObject({
        status: 'active',
        restingOrderId: '9001',
      });
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it.each(['open', 'canceled'] as const)(
    'recovers a legacy nonce-mismatch Chase child that is now %s without replacing it',
    async (status) => {
      const deps = diskDependencies();
      const original = setup({ platformDependencies: deps });
      const placed = await original.provider.placeOrder(intent);
      if (!placed.orderId || !placed.success) {
        throw new Error('Missing placed Chase handle');
      }
      const record = (await original.provider.getNativeChaseRecords())[0];
      const child = record.children[0];
      const lookup =
        original.clientInstance.getOrdersByClientIds.getMockImplementation() as
          | ExactLookup
          | undefined;
      if (!lookup) {
        throw new Error('Missing exact lookup');
      }
      const exact = await lookup(
        record.intent.owner.accountIndex,
        'test-token',
        [child.clientOrderId],
      );
      await original.provider.disconnect();
      const key = `lighterChase:${JSON.stringify([
        record.intent.owner.network,
        record.intent.owner.wallet,
        record.intent.owner.accountIndex,
      ])}`;
      delete child.observation;
      record.status = 'termination_pending';
      record.stopReason = 'failed';
      record.error = 'Lighter Chase child identity mismatch';
      await deps.diskCache.setItem(
        key,
        JSON.stringify({ version: 1, records: [record] }),
      );
      const restarted = setup({ platformDependencies: deps });
      restarted.clientInstance.getOrdersByClientIds.mockImplementation(
        async () => ({
          code: 200,
          orders: exact.orders.map((row) => ({
            ...row,
            status: restarted.calls.some(
              (call) => call.function === '_signCancelOrder',
            )
              ? 'canceled'
              : status,
          })),
        }),
      );
      try {
        expect(
          await restarted.provider.cancelOrder(cancelParams(placed.orderId)),
        ).toMatchObject({ success: true });
        expect(
          (await restarted.provider.getNativeChaseRecords())[0],
        ).toMatchObject({
          status: 'failed',
          stopReason: 'failed',
          executedSize: '0',
          children: [{ observation: { orderId: '9001', terminal: true } }],
        });
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ),
        ).toHaveLength(0);
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCancelOrder',
          ),
        ).toHaveLength(status === 'open' ? 1 : 0);
      } finally {
        await restarted.provider.disconnect();
      }
    },
  );
  it.each(['hash', 'accountIndex', 'apiKeyIndex', 'nonce'] as const)(
    'refuses a foreign %s in Chase placement transaction evidence',
    async (field) => {
      const built = setup();
      built.clientInstance.getOrdersByClientIds.mockResolvedValue({
        code: 200,
        orders: [],
      });
      built.clientInstance.getTx.mockImplementation(async (hash: string) => {
        const create = built.calls.find(
          (call) => call.function === '_signCreateOrder',
        );
        if (!create) {
          throw new Error('Missing signed create order');
        }
        const transaction = {
          code: 200,
          hash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: Number(create.params[11]),
          status: 2,
        };
        return {
          ...transaction,
          [field]: field === 'hash' ? 'foreign' : transaction[field] + 1,
        };
      });
      try {
        const result = await built.provider.placeOrder(intent);
        expect(result.success).toBe(false);
        expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject(
          {
            status: 'termination_pending',
            error: 'Lighter Chase transaction identity mismatch',
          },
        );
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(0);
      } finally {
        await built.provider.disconnect();
      }
    },
  );
  it.each(['failed', 'expired'] as const)(
    'settles a %s never-landed Chase placement across restart',
    async (outcome) => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      built.clientInstance.sendTx.mockImplementation(async (kind: number) => {
        if (kind === LIGHTER_TX_TYPE_CREATE_ORDER) {
          throw new Error('response lost');
        }
        return { code: 200, txHash: 'registered' };
      });
      try {
        const result = await built.provider.placeOrder(intent);
        expect(result.success).toBe(false);
        await built.provider.disconnect();
        const restarted = setup({ platformDependencies: deps });
        const restartedExact =
          restarted.clientInstance.getOrdersByClientIds.getMockImplementation() as
            | ExactLookup
            | undefined;
        restarted.clientInstance.getOrdersByClientIds.mockResolvedValue({
          code: 200,
          orders: [],
        });
        const record = (await restarted.provider.getNativeChaseRecords())[0];
        const dispatch = record.children[0].placement;
        restarted.clientInstance.getTx.mockImplementation(
          async (hash: string) =>
            hash === dispatch.txHash && outcome === 'failed'
              ? {
                  code: 200,
                  hash,
                  accountIndex: 28,
                  apiKeyIndex: 7,
                  nonce: dispatch.nonce,
                  status: 0,
                }
              : null,
        );
        if (outcome === 'expired') {
          vi.setSystemTime((dispatch.expiresAt ?? 0) + 30001);
        }
        expect(
          await restarted.provider.cancelOrder(
            cancelParams(result.orderId ?? ''),
          ),
        ).toMatchObject({ success: true });
        expect(
          (await restarted.provider.getNativeChaseRecords())[0],
        ).toMatchObject({
          status: 'canceled',
          children: [{ placement: { phase: 'failed' }, cancellations: [] }],
        });
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCancelOrder',
          ),
        ).toHaveLength(0);
        if (!restartedExact) {
          throw new Error('Missing exact lookup');
        }
        restarted.clientInstance.getOrdersByClientIds.mockImplementation(
          restartedExact,
        );
        expect(await restarted.provider.placeOrder(intent)).toMatchObject({
          success: true,
        });
        await restarted.provider.disconnect();
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it.each([0, 3, null] as const)(
    'settles a terminal child independently of cancellation outcome %s',
    async (outcome) => {
      vi.useFakeTimers();
      const built = setup();
      try {
        const result = await built.provider.placeOrder(intent);
        const tx = built.clientInstance.getTx.getMockImplementation() as
          | TxLookup
          | undefined;
        if (!tx) {
          throw new Error('Missing transaction lookup');
        }
        built.clientInstance.getTx.mockImplementation(async (hash: string) =>
          outcome === null ? null : { ...(await tx(hash)), status: outcome },
        );
        if (outcome === null) {
          built.clientInstance.sendTx.mockImplementation(
            async (kind: number) => {
              if (kind === LIGHTER_TX_TYPE_CANCEL_ORDER) {
                throw new Error('rejected cancel');
              }
              return { code: 200, txHash: 'registered' };
            },
          );
        }
        const canceled = await built.provider.cancelOrder(
          cancelParams(result.orderId ?? ''),
        );
        expect(canceled.success).toBe(true);
        expect((await built.provider.getChaseOrders())[0]).toMatchObject({
          status: 'canceled',
          restingOrderId: null,
        });
        if (outcome === null) {
          const cancel = (await built.provider.getNativeChaseRecords())[0]
            .children[0].cancellations[0];
          vi.setSystemTime((cancel.expiresAt ?? 0) + 30001);
        }
        expect(await built.provider.placeOrder(intent)).toMatchObject({
          success: true,
        });
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it.each(['failed', 'unknown'] as const)(
    'allows cleanup retry only for a definitively %s cancellation despite unavailable fills',
    async (outcome) => {
      vi.useFakeTimers();
      try {
        const deps = diskDependencies();
        const built = setup({ platformDependencies: deps });
        const exact =
          built.clientInstance.getOrdersByClientIds.getMockImplementation() as
            | ExactLookup
            | undefined;
        if (!exact) {
          throw new Error('Missing exact lookup');
        }
        built.clientInstance.getOrdersByClientIds.mockImplementation(
          async (...args: Parameters<ExactLookup>) => {
            const result = (await exact(...args)) as {
              code: number;
              orders: LighterApiOrder[];
            };
            return {
              ...result,
              orders: result.orders.map((row) => ({ ...row, status: 'open' })),
            };
          },
        );
        const placed = await built.provider.placeOrder(intent);
        const cancellation = built.provider.cancelOrder(
          cancelParams(placed.orderId ?? ''),
        );
        await vi.advanceTimersByTimeAsync(10000);
        expect((await cancellation).success).toBe(false);
        const original = (await built.provider.getNativeChaseRecords())[0];
        await built.provider.disconnect();
        const restarted = setup({ platformDependencies: deps });
        restarted.clientInstance.getOrdersByClientIds.mockImplementation(
          async (_account: number, _token: string, ids: string[]) => ({
            code: 200,
            orders: [
              {
                orderIndex: 9001,
                orderId: '9001',
                clientOrderIndex: Number(ids[0]),
                clientOrderId: ids[0],
                marketIndex: 1,
                ownerAccountIndex: 28,
                initialBaseAmount: original.children[0].size,
                remainingBaseAmount: original.children[0].size,
                filledBaseAmount: '0',
                filledQuoteAmount: '0',
                price: original.children[0].price,
                isAsk: false,
                type: 'limit',
                timeInForce: 'post-only',
                reduceOnly: 0,
                status: 'open',
                orderExpiry: Date.now() + 100000,
                timestamp: 1,
                nonce: 2075941,
              },
            ],
          }),
        );
        restarted.clientInstance.getTrades.mockRejectedValue(
          new Error('fills unavailable'),
        );
        const previous = original.children[0].cancellations[0];
        restarted.clientInstance.getTx.mockImplementation(
          async (hash: string) =>
            hash === previous.txHash
              ? {
                  code: 200,
                  hash,
                  accountIndex: 28,
                  apiKeyIndex: 7,
                  nonce: previous.nonce,
                  status: outcome === 'failed' ? 0 : 1,
                }
              : null,
        );
        await restarted.provider.cancelOrder(
          cancelParams(placed.orderId ?? ''),
        );
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCancelOrder',
          ),
        ).toHaveLength(outcome === 'failed' ? 1 : 0);
        const updated = (await restarted.provider.getNativeChaseRecords())[0];
        expect(updated.children[0].cancellations).toHaveLength(
          outcome === 'failed' ? 2 : 1,
        );
        expect(updated.status).toBe('termination_pending');
        await restarted.provider.cancelOrder(
          cancelParams(placed.orderId ?? ''),
        );
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCancelOrder',
          ),
        ).toHaveLength(outcome === 'failed' ? 1 : 0);
        await restarted.provider.disconnect();
      } finally {
        vi.useRealTimers();
      }
    },
  );
  it('cleans up at an absolute non-divisible deadline', async () => {
    vi.useFakeTimers();
    const built = setup();
    try {
      await built.provider.placeOrder({
        ...intent,
        chaseIntervalMs: 120000,
        chaseMaxDurationMs: 180000,
        chaseMaxRepricings: 5,
      });
      await vi.advanceTimersByTimeAsync(179999);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(1);
      expect((await built.provider.getChaseOrders())[0]).toMatchObject({
        status: 'canceled',
        restingOrderId: null,
      });
      expect((await built.provider.getNativeChaseRecords())[0].stopReason).toBe(
        'duration_reached',
      );
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it.each(['quote', 'sign'] as const)(
    'invalidates a replacement before queued discovery while %s is pending',
    async (phase) => {
      vi.useFakeTimers();
      const built = setup();
      const pending = createDeferred<void>();
      const entered = createDeferred<void>();
      try {
        const placed = await built.provider.placeOrder(intent);
        const book =
          built.clientInstance.getOrderBookOrders.getMockImplementation();
        const snapshot = (await built.clientInstance.getOrderBookOrders(1)) as {
          code: number;
          totalBids: number;
          totalAsks: number;
          bids: { price: string }[];
          asks: { price: string }[];
        };
        built.clientInstance.getOrderBookOrders.mockImplementation(async () => {
          if (phase === 'quote') {
            entered.resolve();
            await pending.promise;
          }
          return {
            ...snapshot,
            bids: snapshot.bids.map((row) => ({ ...row, price: '99999.9' })),
          };
        });
        if (phase === 'sign') {
          const executeSpy = vi.spyOn(built.bridge, 'execute');
          const execute = executeSpy.getMockImplementation();
          if (!execute) {
            throw new Error('Missing signer implementation');
          }
          vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
            if (call.function === '_signCreateOrder') {
              entered.resolve();
              await pending.promise;
            }
            return await execute(call);
          });
        }
        const ticking = vi.advanceTimersByTimeAsync(1000);
        await entered.promise;
        const canceling = built.provider.cancelOrder(
          cancelParams(placed.orderId ?? ''),
        );
        pending.resolve();
        await ticking;
        await canceling;
        expect(
          built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
          ),
        ).toHaveLength(1);
        expect((await built.provider.getChaseOrders())[0]).toMatchObject({
          status: 'canceled',
          restingOrderId: null,
        });
        expect(
          (await built.provider.getNativeChaseRecords())[0].children[0]
            .cancellations,
        ).toHaveLength(1);
        if (book) {
          built.clientInstance.getOrderBookOrders.mockImplementation(book);
        }
      } finally {
        pending.resolve();
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it.each(['chase', 'twap'] as const)(
    'serializes concurrent opposite-strategy starts across live instances with %s first',
    async (first) => {
      const deps = diskDependencies();
      const a = setup({ platformDependencies: deps });
      const b = setup({ platformDependencies: deps });
      for (const built of [a, b]) {
        built.clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              ...BTC_MARKET,
              lastTradePrice: 90000,
              defaultInitialMarginFraction: 100,
              minInitialMarginFraction: 100,
              maintenanceMarginFraction: 50,
            },
          ],
        });
      }
      const twap: OrderParams = {
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: true,
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      };
      try {
        const results = await Promise.all([
          a.provider.placeOrder(first === 'chase' ? intent : twap),
          b.provider.placeOrder(first === 'chase' ? twap : intent),
        ]);
        const aCreates = a.clientInstance.sendTx.mock.calls.filter(
          ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
        ).length;
        const bCreates = b.clientInstance.sendTx.mock.calls.filter(
          ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
        ).length;
        expect(aCreates + bCreates).toBe(1);
        expect(results).toStrictEqual(
          expect.arrayContaining([
            expect.objectContaining({
              success: false,
              error: expect.stringContaining(
                'native probe remains unresolved',
              ) as string,
            }),
          ]),
        );
      } finally {
        await a.provider.disconnect();
        await b.provider.disconnect();
      }
    },
  );
  it.each([0, 3, null] as const)(
    'settles fill-wins-cancel race with %s transaction outcome and unequal trades across pages',
    async (outcome) => {
      const built = setup();
      const original =
        built.clientInstance.getOrdersByClientIds.getMockImplementation() as
          | ExactLookup
          | undefined;
      if (!original) {
        throw new Error('Missing exact lookup');
      }
      let filled = false;
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async (...args: Parameters<ExactLookup>) => {
          const result = (await original(...args)) as {
            code: number;
            orders: LighterApiOrder[];
          };
          return {
            ...result,
            orders: result.orders.map((row) =>
              filled
                ? {
                    ...row,
                    status: 'filled',
                    filledBaseAmount: '0.0002',
                    filledQuoteAmount: '19.99998',
                    remainingBaseAmount: '0',
                  }
                : row,
            ),
          };
        },
      );
      built.clientInstance.getTrades.mockImplementation(
        async (
          _account: number,
          _token: string,
          options: { cursor?: string },
        ) =>
          filled
            ? {
                code: 200,
                trades: [
                  {
                    tradeId: options.cursor ? 2 : 1,
                    txHash: options.cursor ? 'cdefcdef' : 'abcdabcd',
                    marketId: 1,
                    size: options.cursor ? '0.00015' : '0.00005',
                    price: '99999.9',
                    usdAmount: options.cursor ? '14.999985' : '4.999995',
                    bidId: 9001,
                    askId: 9002,
                    bidAccountId: 28,
                    askAccountId: 99,
                    isMakerAsk: false,
                    timestamp: 100001,
                    type: 'trade',
                    takerPositionSizeBefore: '0',
                    makerPositionSizeBefore: '0',
                  },
                ],
                ...(options.cursor ? {} : { nextCursor: 'fill-page-2' }),
              }
            : { code: 200, trades: [] },
      );
      built.clientInstance.sendTx.mockImplementation(async (kind: number) => {
        if (kind === LIGHTER_TX_TYPE_CANCEL_ORDER) {
          filled = true;
          if (outcome === null) {
            throw new Error('response lost after fill');
          }
        }
        return { code: 200, txHash: 'accepted' };
      });
      const tx = built.clientInstance.getTx.getMockImplementation() as
        | TxLookup
        | undefined;
      if (!tx) {
        throw new Error('Missing transaction lookup');
      }
      built.clientInstance.getTx.mockImplementation(async (hash: string) =>
        outcome === null ? null : { ...(await tx(hash)), status: outcome },
      );
      try {
        const result = await built.provider.placeOrder(intent);
        const canceled = await built.provider.cancelOrder(
          cancelParams(result.orderId ?? ''),
        );
        if (!canceled.success) {
          throw new Error(canceled.error);
        }
        expect(canceled.success).toBe(true);
        expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject(
          {
            status: 'filled',
            executedSize: '0.0002',
            executedNotional: '19.99998',
          },
        );
        expect((await built.provider.getChaseOrders())[0]).toMatchObject({
          status: 'filled',
          restingOrderId: null,
          remainingSize: '0',
        });
        const tradeCalls = built.clientInstance.getTrades.mock
          .calls as Parameters<LighterClientService['getTrades']>[];
        expect(
          tradeCalls.some((args) => args[2].cursor === 'fill-page-2'),
        ).toBe(true);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      } finally {
        await built.provider.disconnect();
      }
    },
  );
  it.each(['repeat', 'capacity'] as const)(
    'keeps incomplete %s Chase trade pagination pending',
    async (mode) => {
      const built = setup();
      const placed = await built.provider.placeOrder(intent);
      let page = 0;
      built.clientInstance.getTrades.mockImplementation(async () => {
        page += 1;
        return {
          code: 200,
          trades: [{ tradeId: page }],
          nextCursor: mode === 'repeat' ? 'repeat' : String(page),
        };
      });
      expect(
        (await built.provider.cancelOrder(cancelParams(placed.orderId ?? '')))
          .success,
      ).toBe(false);
      expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject({
        status: 'termination_pending',
        error: expect.stringContaining(
          mode === 'repeat' ? 'pagination is incomplete' : 'bounded collector',
        ) as string,
      });
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(1);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      await built.provider.disconnect();
    },
  );
  it.each(['owner', 'order', 'client', 'market', 'reread'] as const)(
    'refuses a changed %s snapshot without settling or replacing',
    async (mode) => {
      const built = setup();
      const placed = await built.provider.placeOrder(intent);
      const exact =
        built.clientInstance.getOrdersByClientIds.getMockImplementation() as
          | ExactLookup
          | undefined;
      if (!exact) {
        throw new Error('Missing exact lookup');
      }
      let reads = 0;
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async (...args: Parameters<ExactLookup>) => {
          reads += 1;
          const result = (await exact(...args)) as {
            code: number;
            orders: LighterApiOrder[];
          };
          return {
            ...result,
            orders: result.orders.map((row) => {
              switch (mode) {
                case 'owner':
                  return { ...row, ownerAccountIndex: 29 };
                case 'order':
                  return { ...row, orderIndex: 9002, orderId: '9002' };
                case 'client':
                  return {
                    ...row,
                    clientOrderIndex: 101,
                    clientOrderId: '101',
                  };
                case 'market':
                  return { ...row, marketIndex: 2 };
                default:
                  return {
                    ...row,
                    timestamp: row.timestamp + Number(reads % 2 === 0),
                  };
              }
            }),
          };
        },
      );
      expect(
        (await built.provider.cancelOrder(cancelParams(placed.orderId ?? '')))
          .success,
      ).toBe(false);
      expect((await built.provider.getNativeChaseRecords())[0].status).toBe(
        'termination_pending',
      );
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
        ),
      ).toHaveLength(1);
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
        ),
      ).toHaveLength(mode === 'reread' ? 1 : 0);
      await built.provider.disconnect();
    },
  );
  it.each(['sign', 'dispatch'] as const)(
    'fences exact Chase cancellation against signer session movement at %s',
    async (phase) => {
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      const placed = await built.provider.placeOrder(intent);
      const pending = createDeferred<void>();
      const entered = createDeferred<void>();
      if (phase === 'sign') {
        const executeSpy = vi.spyOn(built.bridge, 'execute');
        const execute = executeSpy.getMockImplementation();
        if (!execute) {
          throw new Error('Missing signer implementation');
        }
        vi.spyOn(built.bridge, 'execute').mockImplementation(async (call) => {
          const result = await execute(call);
          if (call.function === '_signCancelOrder') {
            entered.resolve();
            await pending.promise;
          }
          return result;
        });
      } else {
        const writeSpy = vi.spyOn(deps.diskCache, 'setItem');
        const write = writeSpy.getMockImplementation();
        if (!write) {
          throw new Error('Missing disk implementation');
        }
        vi.spyOn(deps.diskCache, 'setItem').mockImplementation(
          async (key, value) => {
            await write(key, value);
            if (
              key.startsWith('lighterChase:') &&
              value.includes('"cancellations":[{"phase":"attempted"')
            ) {
              entered.resolve();
              await pending.promise;
            }
          },
        );
      }
      try {
        const canceling = built.provider.cancelOrder(
          cancelParams(placed.orderId ?? ''),
        );
        await entered.promise;
        built.fireReset();
        pending.resolve();
        expect((await canceling).success).toBe(false);
        expect(
          built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
          ),
        ).toHaveLength(0);
        expect(
          built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CREATE_ORDER,
          ),
        ).toHaveLength(1);
      } finally {
        pending.resolve();
        await built.provider.disconnect();
      }
    },
  );
  it.each(['initial', 'tick'] as const)(
    'uses the absolute deadline with delayed %s observation',
    async (phase) => {
      vi.useFakeTimers();
      const built = setup();
      const exact =
        built.clientInstance.getOrdersByClientIds.getMockImplementation() as
          | ExactLookup
          | undefined;
      if (!exact) {
        throw new Error('Missing exact lookup');
      }
      const started = Date.now();
      let delayed = false;
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async (...args: Parameters<ExactLookup>) => {
          if (
            !delayed &&
            (phase === 'initial' || Date.now() >= started + 120000)
          ) {
            delayed = true;
            vi.setSystemTime(started + (phase === 'initial' ? 150000 : 181000));
          }
          return await exact(...args);
        },
      );
      try {
        const result = await built.provider.placeOrder({
          ...intent,
          chaseIntervalMs: 120000,
          chaseMaxDurationMs: 180000,
          chaseMaxRepricings: 5,
        });
        expect(result.success).toBe(true);
        await vi.advanceTimersByTimeAsync(phase === 'initial' ? 30000 : 120000);
        expect(
          built.calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
        expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject(
          { status: 'canceled', stopReason: 'duration_reached' },
        );
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );
  it('prepares Chase reference and duration after slow signer readiness', async () => {
    vi.useFakeTimers();
    const built = setup();
    const create = vi
      .spyOn(built.bridge, 'createClient')
      .getMockImplementation();
    if (!create) {
      throw new Error('Missing client creation');
    }
    const readyAt = Date.now() + 70000;
    vi.spyOn(built.bridge, 'createClient').mockImplementation(
      async (params) => {
        vi.setSystemTime(readyAt);
        return await create(params);
      },
    );
    try {
      const result = await built.provider.placeOrder(intent);
      expect(result.success).toBe(true);
      expect(
        (await built.provider.getNativeChaseRecords())[0].intent.startedAt,
      ).toBe(readyAt);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
  it('keeps original-slot Chase cleanup pending when only another signing slot is available', async () => {
    const deps = diskDependencies();
    const original = setup({ platformDependencies: deps });
    const placed = await original.provider.placeOrder(intent);
    const exact =
      original.clientInstance.getOrdersByClientIds.getMockImplementation() as
        | ExactLookup
        | undefined;
    if (!exact) {
      throw new Error('Missing exact lookup');
    }
    await original.provider.disconnect();
    const moved = setup({ platformDependencies: deps, apiKeyIndex: 2 });
    moved.clientInstance.getApiKeys.mockResolvedValue({
      code: 200,
      apiKeys: [
        {
          accountIndex: 28,
          apiKeyIndex: 2,
          nonce: 1,
          publicKey: '9c'.repeat(40),
        },
      ],
    });
    moved.clientInstance.getOrdersByClientIds.mockImplementation(exact);
    try {
      expect(
        (await moved.provider.cancelOrder(cancelParams(placed.orderId ?? '')))
          .success,
      ).toBe(false);
      expect((await moved.provider.getNativeChaseRecords())[0]).toMatchObject({
        intent: { owner: { apiKeyIndex: 7 } },
        status: 'termination_pending',
      });
      expect(
        moved.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(moved.clientInstance.sendTx).not.toHaveBeenCalled();
    } finally {
      await moved.provider.disconnect();
    }
  });
  it.each(['active', 'history'] as const)(
    'keeps expired TWAP exclusion across restart and both strategies after incomplete %s reads',
    async (failure) => {
      vi.useFakeTimers();
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 90000,
            defaultInitialMarginFraction: 100,
            minInitialMarginFraction: 100,
            maintenanceMarginFraction: 50,
          },
        ],
      });
      const exact =
        built.clientInstance.getOrdersByClientIds.getMockImplementation() as
          | ExactLookup
          | undefined;
      if (!exact) {
        throw new Error('Missing exact lookup');
      }
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async (...args: Parameters<ExactLookup>) => {
          const result = await exact(...args);
          return {
            ...result,
            orders: result.orders.map((row) => ({
              ...row,
              type: 'twap',
              timeInForce: 'good-till-time',
              status: 'in-progress',
            })),
          };
        },
      );
      const twap: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        orderType: 'twap',
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      };
      try {
        await built.provider.placeOrder(twap);
        const [record] = await built.provider.getNativeTwapObservations();
        vi.setSystemTime((record.record.placement.expiresAt ?? 0) + 30001);
        built.clientInstance.getTx.mockResolvedValue(null);
        if (failure === 'active') {
          built.clientInstance.getActiveOrders.mockRejectedValue(
            new Error('active read unavailable'),
          );
        } else {
          built.clientInstance.getInactiveOrders.mockResolvedValue({
            code: 200,
            orders: [],
            nextCursor: 'incomplete',
          });
        }
        const [uncertain] = await built.provider.getNativeTwapObservations();
        expect(uncertain.record.placement.phase).not.toBe('failed');
        await built.provider.disconnect();
        const restarted = setup({ platformDependencies: deps });
        restarted.clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              ...BTC_MARKET,
              lastTradePrice: 90000,
              defaultInitialMarginFraction: 100,
              minInitialMarginFraction: 100,
              maintenanceMarginFraction: 50,
            },
          ],
        });
        const chase = await restarted.provider.placeOrder(intent);
        const another = await restarted.provider.placeOrder(twap);
        expect(chase).toMatchObject({
          success: false,
          error: expect.stringContaining(
            'native probe remains unresolved',
          ) as string,
        });
        expect(another).toMatchObject({
          success: false,
          error: expect.stringContaining('unresolved') as string,
        });
        expect(
          restarted.calls.filter(
            (call) => call.function === '_signCreateOrder',
          ),
        ).toHaveLength(0);
        await restarted.provider.disconnect();
      } finally {
        await built.provider.disconnect();
        vi.useRealTimers();
      }
    },
  );

  it.each(['sign', 'dispatch'] as const)(
    'fences TWAP cancellation with unavailable history across original-session %s movement',
    async (phase) => {
      const deps = diskDependencies();
      const built = setup({ platformDependencies: deps });
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 90000,
            defaultInitialMarginFraction: 100,
            minInitialMarginFraction: 100,
            maintenanceMarginFraction: 50,
          },
        ],
      });
      const parentRows = (): LighterApiOrder[] => {
        const create = built.calls.find(
          (call) => call.function === '_signCreateOrder',
        );
        if (!create) {
          return [];
        }
        return [
          {
            orderIndex: 9001,
            orderId: '9001',
            clientOrderIndex: Number(create.params[2]),
            clientOrderId: String(create.params[2]),
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.00020',
            remainingBaseAmount: '0.00020',
            filledBaseAmount: '0',
            filledQuoteAmount: '0',
            price: String(Number(create.params[4]) / 10),
            isAsk: false,
            type: 'twap',
            timeInForce: 'good-till-time',
            reduceOnly: false,
            status: 'in-progress',
            orderExpiry: Number(create.params[10]),
            timestamp: Math.floor((Number(create.params[10]) - 60000) / 1000),
            nonce: Number(create.params[11]),
          },
        ];
      };
      built.clientInstance.getOrdersByClientIds.mockImplementation(
        async () => ({ code: 200, orders: parentRows() }),
      );
      built.clientInstance.getActiveOrders.mockImplementation(async () => ({
        code: 200,
        orders: parentRows(),
      }));
      built.clientInstance.getInactiveOrders.mockResolvedValue({
        code: 200,
        orders: [],
      });
      built.clientInstance.getTx.mockImplementation(async (hash: string) => ({
        code: 200,
        hash,
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: hash.startsWith('aaaa') ? 42 : 43,
        status: 2,
      }));
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        orderType: 'twap',
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      });
      expect(placed).toMatchObject({ success: true, orderId: '9001' });
      built.clientInstance.getInactiveOrders.mockRejectedValue(
        new Error('history unavailable'),
      );
      const pending = createDeferred<void>();
      const entered = createDeferred<void>();
      if (phase === 'sign') {
        const executeSpy = vi.spyOn(built.bridge, 'execute');
        const execute = executeSpy.getMockImplementation();
        if (!execute) {
          throw new Error('Missing signer implementation');
        }
        executeSpy.mockImplementation(async (call) => {
          const result = await execute(call);
          if (call.function === '_signCancelOrder') {
            entered.resolve();
            await pending.promise;
          }
          return result;
        });
      } else {
        const writeSpy = vi.spyOn(deps.diskCache, 'setItem');
        const write = writeSpy.getMockImplementation();
        if (!write) {
          throw new Error('Missing disk implementation');
        }
        writeSpy.mockImplementation(async (key, value) => {
          await write(key, value);
          if (
            key.startsWith('lighterNativeTwap:') &&
            value.includes('"cancellations":[{"phase":"attempted"')
          ) {
            entered.resolve();
            await pending.promise;
          }
        });
      }
      try {
        const cancellation = built.provider.cancelOrder({
          symbol: 'BTC',
          orderType: 'twap',
          orderId: '9001',
        });
        await entered.promise;
        built.fireReset();
        pending.resolve();
        expect((await cancellation).success).toBe(false);
        expect(
          built.clientInstance.sendTx.mock.calls.filter(
            ([kind]) => kind === LIGHTER_TX_TYPE_CANCEL_ORDER,
          ),
        ).toHaveLength(0);
        const [observation] = await built.provider.getNativeTwapObservations();
        expect(observation.record.intent.owner.apiKeyIndex).toBe(7);
        expect(observation.record.terminalConfirmed).toBe(false);
        expect(
          built.calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      } finally {
        pending.resolve();
        await built.provider.disconnect();
      }
    },
  );
  it('logs and persists a scheduler journal read failure without continuing', async () => {
    vi.useFakeTimers();
    const deps = diskDependencies();
    const built = setup({ platformDependencies: deps });
    try {
      expect(await built.provider.placeOrder(intent)).toMatchObject({
        success: true,
      });
      const readSpy = vi.spyOn(deps.diskCache, 'getItem');
      const read = readSpy.getMockImplementation();
      if (!read) {
        throw new Error('Missing disk read');
      }
      let failNext = true;
      readSpy.mockImplementation(async (key) => {
        if (failNext && key.startsWith('lighterChase:')) {
          failNext = false;
          throw new Error('journal read failed');
        }
        return await read(key);
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(vi.spyOn(deps.debugLogger, 'log')).toHaveBeenCalledWith(
        '[LighterProvider] Chase tick failed',
        expect.objectContaining({ error: 'journal read failed' }),
      );
      expect((await built.provider.getNativeChaseRecords())[0]).toMatchObject({
        status: 'termination_pending',
        error: 'journal read failed',
      });
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect(
        built.calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
    } finally {
      await built.provider.disconnect();
      vi.useRealTimers();
    }
  });
});
