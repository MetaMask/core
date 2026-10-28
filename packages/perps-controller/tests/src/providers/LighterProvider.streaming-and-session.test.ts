import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { LighterApiError } from '../../../src/services/LighterClientService.js';
import type { Order, OrderFill } from '../../../src/types/index.js';
import type {
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
  LighterWebSocketCtor,
  LighterWebSocketLike,
} from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  BTC_MARKET,
  buildProvider,
  fakeStreamCtor,
  finishPendingTimersAfterEach,
  StreamFakeWebSocket,
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

describe('LighterProvider', () => {
  finishPendingTimersAfterEach();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('price streaming', () => {
    class FakeWebSocket implements LighterWebSocketLike {
      static instances: FakeWebSocket[] = [];

      readyState = 0;

      sent: string[] = [];

      onopen: (() => void) | null = null;

      onmessage: ((event: { data: unknown }) => void) | null = null;

      onclose: (() => void) | null = null;

      onerror: (() => void) | null = null;

      url: string;

      constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
      }

      send = (data: string): void => {
        this.sent.push(data);
      };

      close = (): void => {
        this.readyState = 3;
        this.onclose?.();
      };

      open = (): void => {
        this.readyState = 1;
        this.onopen?.();
      };

      receive = (message: unknown): void => {
        this.onmessage?.({ data: JSON.stringify(message) });
      };
    }

    const fakeCtor = FakeWebSocket as unknown as LighterWebSocketCtor;

    beforeEach(() => {
      FakeWebSocket.instances = [];
    });

    const wsStat = (
      symbol: string,
      marketId: number,
      midPrice: string,
    ): Record<string, unknown> => ({
      symbol,
      market_id: marketId,
      index_price: midPrice,
      mark_price: midPrice,
      mid_price: midPrice,
      best_ask_price: midPrice,
      best_bid_price: midPrice,
      last_trade_price: midPrice,
      open_interest: '1000',
      open_interest_limit: '100000',
      funding_rate: '0.0012',
      daily_quote_token_volume: 5,
      daily_price_change: 0.5,
    });

    it('subscribes to market_stats/all and dispatches snapshot + updates', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback,
      });

      const socket = FakeWebSocket.instances[0];
      socket.open();
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' }),
      );

      socket.receive({
        type: 'subscribed/market_stats',
        channel: 'market_stats:all',
        market_stats: { '1': wsStat('BTC', 1, '63000.5') },
        timestamp: 123,
      });
      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          price: '63000.5',
          markPrice: '63000.5',
          timestamp: 123,
        }),
      ]);

      socket.receive({
        type: 'update/market_stats',
        channel: 'market_stats:all',
        market_stats: { '2': wsStat('SOL', 2, '75.1') },
        timestamp: 456,
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'SOL', price: '75.1' }),
      ]);
      unsubscribe();
      await provider.disconnect();
    });

    it('does not log every price-stream frame', async () => {
      const infra = createMockInfrastructure();
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        platformDependencies: infra,
      });
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      const socket = FakeWebSocket.instances[0];
      socket.open();

      socket.receive({
        type: 'subscribed/market_stats',
        market_stats: { '1': wsStat('BTC', 1, '63000.5') },
      });
      socket.receive({
        type: 'update/market_stats',
        market_stats: { '1': wsStat('BTC', 1, '63001.5') },
      });

      expect(infra.debugLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[LighterProvider] price stream cycle='),
      );
      unsubscribe();
      await provider.disconnect();
    });

    it('replays the merged snapshot to late subscribers with symbol filters', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const unsubscribeFirst = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({
        type: 'subscribed/market_stats',
        market_stats: { '1': wsStat('BTC', 1, '63000.5') },
      });
      // A later delta must not evict BTC from the replay cache.
      socket.receive({
        type: 'update/market_stats',
        market_stats: { '2': wsStat('SOL', 2, '75.1') },
      });

      const late = vi.fn();
      const unsubscribeLate = provider.subscribeToPrices({
        symbols: ['BTC'],
        callback: late,
      });
      expect(late).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC' }),
      ]);
      unsubscribeFirst();
      unsubscribeLate();
      await provider.disconnect();
    });

    it('streams user_stats and account_all_positions into their subscribers', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 100000,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
          {
            ...BTC_MARKET,
            symbol: 'SOL',
            marketId: 2,
            lastTradePrice: 100,
            minInitialMarginFraction: 400,
            maintenanceMarginFraction: 240,
          },
        ],
      });
      const accountCallback = vi.fn();
      const positionsCallback = vi.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      // Let account-channel setup resolve (account index + auth token).
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      const socket = FakeWebSocket.instances[0];
      socket.open();
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
      );
      expect(socket.sent).toContainEqual(
        JSON.stringify({
          type: 'subscribe',
          channel: 'account_all_positions/28',
        }),
      );

      socket.receive({
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
      });
      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalBalance: '11000',
          spendableBalance: '6000',
          marginUsed: '4000',
          unrealizedPnl: '1000',
        }),
      );

      socket.receive({
        type: 'subscribed/account_all_positions',
        channel: 'account_all_positions:28',
        positions: {
          '1': {
            market_id: 1,
            symbol: 'BTC',
            initial_margin_fraction: '5.00',
            open_order_count: 0,
            sign: -1,
            position: '0.5',
            avg_entry_price: '60000',
            position_value: '30000',
            unrealized_pnl: '100',
            realized_pnl: '0',
            liquidation_price: '90000',
          },
        },
      });
      expect(positionsCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '-0.5' }),
      ]);
      unsubscribeAccount();
      unsubscribePositions();
      await provider.disconnect();
    });

    it('applies position snapshots and deltas transactionally', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 100000,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
          {
            ...BTC_MARKET,
            symbol: 'SOL',
            marketId: 2,
            lastTradePrice: 100,
            minInitialMarginFraction: 400,
            maintenanceMarginFraction: 240,
          },
        ],
      });
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToPositions({ callback });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      const position = {
        market_id: 1,
        symbol: 'BTC',
        initial_margin_fraction: '5.00',
        open_order_count: 0,
        sign: 1,
        position: '0.5',
        avg_entry_price: '60000',
        position_value: '30000',
        unrealized_pnl: '100',
        realized_pnl: '0',
        liquidation_price: '40000',
      };
      socket.receive({
        type: 'subscribed/account_all_positions',
        positions: { '1': position },
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '0.5' }),
      ]);
      callback.mockClear();

      socket.receive({
        type: 'subscribed/account_all_positions',
        positions: {
          '2': { ...position, market_id: 2, symbol: 'SOL', position: '1' },
          '3': {
            ...position,
            market_id: 3,
            symbol: 'ETH',
            position: '0.2oops',
          },
        },
      });
      expect(callback).not.toHaveBeenCalled();

      socket.receive({
        type: 'update/account_all_positions',
        positions: {
          '2': { ...position, market_id: 2, symbol: 'SOL', position: '1' },
        },
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '0.5' }),
        expect.objectContaining({ symbol: 'SOL', size: '1' }),
      ]);

      const late = vi.fn();
      const unsubscribeLate = provider.subscribeToPositions({ callback: late });
      expect(late).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '0.5' }),
        expect.objectContaining({ symbol: 'SOL', size: '1' }),
      ]);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('preserves parked protection warnings from another key slot of the same wallet', async () => {
      const infra = createMockInfrastructure();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:19:BTC`;
      const otherWalletKey = '0xbbbb:28:19:ETH';
      const storage = new Map<string, string>([
        [
          'lighterTpslManualIndex:testnet',
          JSON.stringify([settlementKey, otherWalletKey]),
        ],
        [
          `lighterTpslManual:testnet:${settlementKey}`,
          JSON.stringify({
            version: 1,
            settlementKey,
            symbol: 'BTC',
            reason: 'Protection needs review',
            priorIntent: 'replace',
            priorTriggers: [],
            survivingOrderIds: ['777'],
            operationId: 'public-test-operation',
            recordedAt: 5,
          }),
        ],
      ]);
      const getItem = vi.spyOn(infra.diskCache, 'getItem');
      const removeItem = vi.spyOn(infra.diskCache, 'removeItem');
      getItem.mockImplementation(async (key) => storage.get(key) ?? null);
      const { provider } = buildProvider({
        platformDependencies: infra,
        registeredKey: '9c'.repeat(40),
      });

      const pending = await provider.getPendingManualRecoveries();

      expect(pending.map((entry) => entry.settlementKey)).toStrictEqual([
        settlementKey,
      ]);
      expect(getItem).not.toHaveBeenCalledWith(
        `lighterTpslManual:testnet:${otherWalletKey}`,
      );
      expect(removeItem).not.toHaveBeenCalled();
      expect(pending[0].actionNeeded).toContain(
        'Initialize the wallet trading key',
      );
      expect(pending[0].actionNeeded).not.toContain('previous trading key');

      await provider.getOrders();
      const initializedPending = await provider.getPendingManualRecoveries();
      expect(
        initializedPending.map((entry) => entry.settlementKey),
      ).toStrictEqual([settlementKey]);
      expect(initializedPending[0].actionNeeded).toContain(
        'current trading key',
      );
      expect(initializedPending[0].actionNeeded).toContain(
        'explicit TP/SL update or removal',
      );
      expect(removeItem).not.toHaveBeenCalled();
    });

    it('replays an authenticated empty orders snapshot to late subscribers', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const unsubscribe = provider.subscribeToOrders({ callback: vi.fn() });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({
        type: 'subscribed/account_all_orders',
        channel: 'account_all_orders:28',
        orders: {},
      });
      const late = vi.fn();

      const unsubscribeLate = provider.subscribeToOrders({ callback: late });

      expect(late).toHaveBeenCalledWith([]);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it.each([0, true, null, [], 'invalid', { '1': false }])(
      'does not authorize late replay from malformed trades container %j',
      async (trades) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        // Positions initialize the shared authenticated trade channel without a fill subscriber.
        const unsubscribe = provider.subscribeToPositions({
          callback: vi.fn(),
        });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.receive({ type: 'subscribed/account_all_trades', trades });
        const late = vi.fn();
        const unsubscribeLate = provider.subscribeToOrderFills({
          callback: late,
        });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        expect(late).not.toHaveBeenCalled();
        unsubscribeLate();
        unsubscribe();
        await provider.disconnect();
      },
    );

    it.each([false, true])(
      'invalidates fills replay for null rows after populated=%s snapshot',
      async (populated) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        const unsubscribe = provider.subscribeToOrderFills({
          callback: vi.fn(),
        });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        const trade = {
          trade_id: 1,
          market_id: 1,
          size: '0.001',
          price: '90000',
          ask_id: 1,
          bid_id: 2,
          ask_account_id: 28,
          bid_account_id: 7,
          is_maker_ask: false,
          timestamp: 1700000000000,
          taker_position_size_before: '0',
        };
        socket.receive({
          type: 'subscribed/account_all_trades',
          trades: populated ? { '1': [trade] } : {},
        });
        socket.receive({
          type: 'update/account_all_trades',
          trades: { '1': [null] },
        });
        const late = vi.fn();
        const stop = provider.subscribeToOrderFills({ callback: late });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        expect(late).not.toHaveBeenCalled();
        stop();
        unsubscribe();
        await provider.disconnect();
      },
    );

    it.each([
      ['subscribed', 'venue-added-state'],
      ['update', 'venue-added-state'],
      ['subscribed', undefined],
      ['update', undefined],
    ])(
      'revokes empty order replay after %s adapter rejection with status=%s and restores it on a valid snapshot',
      async (frame, status) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        const callback = vi.fn();
        const unsubscribe = provider.subscribeToOrders({ callback });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.receive({ type: 'subscribed/account_all_orders', orders: {} });
        callback.mockClear();
        socket.receive({
          type: `${frame}/account_all_orders`,
          orders: { '1': [{ status }] },
        });
        expect(callback).not.toHaveBeenCalled();
        const late = vi.fn();
        const stop = provider.subscribeToOrders({ callback: late });
        expect(late).not.toHaveBeenCalled();
        socket.receive({ type: 'subscribed/account_all_orders', orders: {} });
        expect(late).toHaveBeenCalledWith([]);
        const restored = vi.fn();
        const stopRestored = provider.subscribeToOrders({ callback: restored });
        expect(restored).toHaveBeenCalledWith([]);
        stopRestored();
        stop();
        unsubscribe();
        await provider.disconnect();
      },
    );

    it.each(['none', 'empty', 'populated'])(
      'ignores omitted orders after %s state without extra delivery',
      async (state) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        const callback = vi.fn<(...args: [Order[]]) => void>();
        const unsubscribe = provider.subscribeToOrders({ callback });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        if (state !== 'none') {
          socket.receive({
            type: 'subscribed/account_all_orders',
            orders:
              state === 'empty'
                ? {}
                : {
                    '1': [
                      {
                        order_index: 555,
                        client_order_index: 1,
                        market_index: 1,
                        owner_account_index: 28,
                        initial_base_amount: '0.001',
                        remaining_base_amount: '0.001',
                        price: '90000',
                        is_ask: false,
                        type: 'limit',
                        time_in_force: 'good-till-time',
                        reduce_only: 0,
                        status: 'open',
                        order_expiry: 0,
                        timestamp: 1700000000000,
                      },
                    ],
                  },
          });
        }
        const previousCalls = [...callback.mock.calls];
        callback.mockClear();
        socket.receive({ type: 'subscribed/account_all_orders' });
        socket.receive({ type: 'update/account_all_orders' });
        expect(callback).not.toHaveBeenCalled();
        const late = vi.fn();
        const stop = provider.subscribeToOrders({ callback: late });
        expect(late.mock.calls).toStrictEqual(previousCalls);
        stop();
        unsubscribe();
        await provider.disconnect();
      },
    );

    it.each([true, [], { '1': false }, { '1': [null] }])(
      'rejects malformed order containers %j before late replay',
      async (orders) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        const unsubscribe = provider.subscribeToOrders({ callback: vi.fn() });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        socket.receive({ type: 'subscribed/account_all_orders', orders });
        const late = vi.fn();
        const stop = provider.subscribeToOrders({ callback: late });
        expect(late).not.toHaveBeenCalled();
        stop();
        unsubscribe();
        await provider.disconnect();
      },
    );

    it.each(['account', 'auth'])(
      'isolates throwing error subscribers on %s setup failure and retries',
      async (stage) => {
        const built = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
          configuredAccountIndex: null,
        });
        if (stage === 'account') {
          built.clientInstance.getAccountsByL1Address.mockRejectedValue(
            new Error('setup failed'),
          );
        } else {
          built.clientInstance.getApiKeys.mockRejectedValue(
            new Error('setup failed'),
          );
        }
        const stopFirst = built.provider.subscribeToOrders({
          callback: vi.fn(),
          onError: () => {
            throw new Error('listener failed');
          },
        });
        const sibling = vi.fn();
        const stopSibling = built.provider.subscribeToOrderFills({
          callback: vi.fn(),
          onError: sibling,
        });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        expect(sibling).toHaveBeenCalled();
        sibling.mockClear();
        const retry = built.provider.subscribeToOrders({ callback: vi.fn() });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        expect(sibling).toHaveBeenCalled();
        retry();
        stopSibling();
        stopFirst();
        await built.provider.disconnect();
      },
    );

    it('replays the newest 100 unique fills after a repeated fill and older delta', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const unsubscribe = provider.subscribeToOrderFills({
        callback: vi.fn(),
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      const trades = Array.from({ length: 105 }, (_, index) => ({
        trade_id: index + 1,
        market_id: 1,
        size: '0.001',
        price: '90000',
        ask_id: 1,
        bid_id: 2,
        ask_account_id: 28,
        bid_account_id: 7,
        is_maker_ask: false,
        timestamp: 1700000000000 + index * 1000,
        taker_position_size_before: '0',
      }));
      socket.receive({
        type: 'subscribed/account_all_trades',
        trades: { '1': trades },
      });
      socket.receive({
        type: 'update/account_all_trades',
        trades: {
          '1': [
            { ...trades[104], price: '91000' },
            { ...trades[0], trade_id: 200, timestamp: 1699999000000 },
          ],
        },
      });
      const late = vi.fn<(...args: [OrderFill[], boolean?]) => void>();
      const unsubscribeLate = provider.subscribeToOrderFills({
        callback: late,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const replay = late.mock.calls[0][0];
      expect(replay.map((fill) => fill.fillId)).toStrictEqual(
        Array.from({ length: 100 }, (_, index) => String(105 - index)),
      );
      expect(replay[0].price).toBe('91000');
      expect(late.mock.calls[0][1]).toBe(true);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('replays closing fills with omitted pnl without losing authenticated history', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const callback = vi.fn();
      const onError = vi.fn();
      const unsubscribe = provider.subscribeToOrderFills({ callback, onError });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({ type: 'subscribed/account_all_trades', trades: {} });
      const trade = {
        trade_id: 91650,
        market_id: 1,
        size: '0.001',
        price: '90000',
        ask_id: 1,
        bid_id: 2,
        ask_account_id: 28,
        bid_account_id: 7,
        is_maker_ask: false,
        timestamp: 1700000000000,
        taker_position_size_before: '0.001',
        taker_position_sign_changed: true,
      };

      socket.receive({
        type: 'update/account_all_trades',
        trades: { '1': [trade] },
      });
      const late = vi.fn<(...args: [OrderFill[], boolean?]) => void>();
      const unsubscribeLate = provider.subscribeToOrderFills({
        callback: late,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(onError).not.toHaveBeenCalled();
      expect(late).toHaveBeenCalledWith(
        [expect.objectContaining({ fillId: '91650', direction: 'Close Long' })],
        true,
      );
      expect(late.mock.calls[0][0][0]).not.toHaveProperty('pnl');
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it.each(
      ['subscribed', 'update'].flatMap((frameType) =>
        ['none', 'empty', 'filled'].map((prior) => ({ frameType, prior })),
      ),
    )(
      'withholds full fill replay after invalid $frameType fills with $prior prior history',
      async ({ frameType, prior }) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        const callback = vi.fn();
        const unsubscribe = provider.subscribeToOrderFills({ callback });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        const trade = {
          trade_id: 1,
          market_id: 1,
          size: '0.001',
          price: '90000',
          ask_id: 1,
          bid_id: 2,
          ask_account_id: 28,
          bid_account_id: 7,
          is_maker_ask: false,
          timestamp: 1700000000000,
          taker_position_size_before: '0',
        };
        if (prior !== 'none') {
          socket.receive({
            type: 'subscribed/account_all_trades',
            trades: prior === 'empty' ? {} : { '1': [trade] },
          });
        }
        callback.mockClear();
        socket.receive({
          type: `${frameType}/account_all_trades`,
          trades: { '1': [{ ...trade, size: 'invalid' }] },
        });
        expect(callback).not.toHaveBeenCalled();
        socket.receive({
          type: 'update/account_all_trades',
          trades: { '1': [{ ...trade, trade_id: 2 }] },
        });
        expect(callback).toHaveBeenLastCalledWith(
          [expect.objectContaining({ fillId: '2' })],
          false,
        );
        const late = vi.fn();
        const unsubscribeLate = provider.subscribeToOrderFills({
          callback: late,
        });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        expect(late).not.toHaveBeenCalled();
        // Only a new validated complete snapshot can restore replay authority.
        socket.receive({ type: 'subscribed/account_all_trades', trades: {} });
        const restored = vi.fn();
        const unsubscribeRestored = provider.subscribeToOrderFills({
          callback: restored,
        });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        expect(restored).toHaveBeenCalledWith([], true);
        unsubscribeRestored();
        unsubscribeLate();
        unsubscribe();
        await provider.disconnect();
      },
    );

    it('does not promote a delta before the initial fills snapshot to full replay', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const unsubscribe = provider.subscribeToOrderFills({
        callback: vi.fn(),
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({
        type: 'update/account_all_trades',
        trades: {
          '1': [
            {
              trade_id: 1,
              market_id: 1,
              size: '0.001',
              price: '90000',
              ask_id: 1,
              bid_id: 2,
              ask_account_id: 28,
              bid_account_id: 7,
              is_maker_ask: false,
              timestamp: 1700000000000,
              taker_position_size_before: '0',
            },
          ],
        },
      });
      const late = vi.fn();
      const unsubscribeLate = provider.subscribeToOrderFills({
        callback: late,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      expect(late).not.toHaveBeenCalled();
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('does not retain complete fill replay after the wallet session changes', async () => {
      const { provider, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const unsubscribe = provider.subscribeToOrderFills({
        callback: vi.fn(),
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({ type: 'subscribed/account_all_trades', trades: {} });
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState().catch(() => undefined);
      const late = vi.fn();
      const unsubscribeLate = provider.subscribeToOrderFills({
        callback: late,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      expect(late).not.toHaveBeenCalled();
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('reports current-wallet account discovery failures to both trading subscriptions', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeCtor,
        configuredAccountIndex: null,
      });
      const failure = new Error('Account discovery transport unavailable');
      clientInstance.getAccountsByL1Address.mockRejectedValue(failure);
      const onOrderError = vi.fn();
      const onFillError = vi.fn();
      const orders = vi.fn();
      const fills = vi.fn();
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: orders,
        onError: onOrderError,
      });
      const unsubscribeFills = provider.subscribeToOrderFills({
        callback: fills,
        onError: onFillError,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      expect(onOrderError).toHaveBeenCalledWith(failure);
      expect(onFillError).toHaveBeenCalledWith(failure);
      expect(orders).not.toHaveBeenCalled();
      expect(fills).not.toHaveBeenCalled();
      unsubscribeOrders();
      unsubscribeFills();
      await provider.disconnect();
    });

    it('does not report an old-wallet account discovery failure to a replacement session', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeCtor,
        configuredAccountIndex: null,
      });
      const failure = new Error('Old-wallet discovery unavailable');
      let failLookup: (error: Error) => void = () => undefined;
      let lookupStarted: () => void = () => undefined;
      const started = new Promise<void>((resolveStarted) => {
        lookupStarted = resolveStarted;
      });
      clientInstance.getAccountsByL1Address.mockImplementationOnce(() => {
        lookupStarted();
        return new Promise((_resolve, reject) => {
          failLookup = reject;
        });
      });
      const onOrderError = vi.fn();
      const onFillError = vi.fn();
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: vi.fn(),
        onError: onOrderError,
      });
      const unsubscribeFills = provider.subscribeToOrderFills({
        callback: vi.fn(),
        onError: onFillError,
      });
      await started;
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState().catch(() => undefined);
      failLookup(failure);
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      expect(onOrderError).not.toHaveBeenCalledWith(failure);
      expect(onFillError).not.toHaveBeenCalledWith(failure);
      unsubscribeOrders();
      unsubscribeFills();
      await provider.disconnect();
    });

    it.each(
      ['subscribed', 'update'].flatMap((frameType) =>
        ['none', 'empty', 'filled'].map((prior) => ({ frameType, prior })),
      ),
    )(
      'ignores omitted $frameType trades with $prior prior history',
      async ({ frameType, prior }) => {
        const { provider } = buildProvider({
          webSocketCtor: fakeCtor,
          registeredKey: '9c'.repeat(40),
        });
        const callback = vi.fn();
        const unsubscribe = provider.subscribeToOrderFills({ callback });
        await new Promise((resolveTick) => setImmediate(resolveTick));
        await new Promise((resolveTick) => setImmediate(resolveTick));
        const socket = FakeWebSocket.instances[0];
        socket.open();
        let unsubscribeLate = (): void => undefined;
        try {
          const trade = {
            trade_id: 1,
            market_id: 1,
            size: '0.001',
            price: '90000',
            ask_id: 1,
            bid_id: 2,
            ask_account_id: 28,
            bid_account_id: 7,
            is_maker_ask: false,
            timestamp: 1700000000000,
            taker_position_size_before: '0',
          };
          if (prior !== 'none') {
            socket.receive({
              type: 'subscribed/account_all_trades',
              trades: prior === 'empty' ? {} : { '1': [trade] },
            });
          }
          callback.mockClear();
          socket.receive({
            type: `${frameType}/account_all_trades`,
            channel: 'account_all_trades:28',
          });
          expect(callback).not.toHaveBeenCalled();
          const late = vi.fn();
          unsubscribeLate = provider.subscribeToOrderFills({ callback: late });
          await new Promise((resolveTick) => setImmediate(resolveTick));
          const firstFill: unknown = expect.objectContaining({ fillId: '1' });
          const expectedPrior =
            prior === 'none'
              ? []
              : [[prior === 'empty' ? [] : [firstFill], true]];
          expect(late.mock.calls).toStrictEqual(expectedPrior);
          const secondFill: unknown = expect.objectContaining({ fillId: '2' });
          for (const populated of [false, true]) {
            callback.mockClear();
            late.mockClear();
            socket.receive({
              type: 'subscribed/account_all_trades',
              trades: populated ? { '1': [{ ...trade, trade_id: 2 }] } : {},
            });
            const expected = populated ? [secondFill] : [];
            expect(callback).toHaveBeenCalledWith(expected, true);
            expect(late).toHaveBeenCalledWith(expected, true);
          }
        } finally {
          unsubscribeLate();
          unsubscribe();
          await provider.disconnect();
        }
      },
    );

    it('replays a confirmed empty fills snapshot to late authenticated subscribers', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const unsubscribe = provider.subscribeToOrders({ callback: vi.fn() });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({
        type: 'subscribed/account_all_trades',
        channel: 'account_all_trades:28',
        trades: {},
      });
      const late = vi.fn();

      const unsubscribeLate = provider.subscribeToOrderFills({
        callback: late,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(late).toHaveBeenCalledWith([], true);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('keeps the previous orders snapshot when a new snapshot is malformed', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToOrders({ callback });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      const validOrder = {
        order_index: 555,
        client_order_index: 1,
        market_index: 1,
        owner_account_index: 28,
        initial_base_amount: '0.001',
        remaining_base_amount: '0.001',
        price: '90000',
        is_ask: false,
        type: 'limit',
        time_in_force: 'good-till-time',
        reduce_only: 0,
        status: 'open',
        order_expiry: 0,
        timestamp: 1700000000000,
      };
      socket.receive({
        type: 'subscribed/account_all_orders',
        channel: 'account_all_orders:28',
        orders: { '1': [validOrder] },
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ orderId: '555' }),
      ]);
      callback.mockClear();

      socket.receive({
        type: 'subscribed/account_all_orders',
        channel: 'account_all_orders:28',
        orders: {
          '1': [{ ...validOrder, status: 'venue-added-state' }],
        },
      });
      expect(callback).not.toHaveBeenCalled();

      const late = vi.fn();
      const unsubscribeLate = provider.subscribeToOrders({ callback: late });
      expect(late).toHaveBeenCalledWith([
        expect.objectContaining({ orderId: '555' }),
      ]);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('drops malformed user_stats numbers without throwing or emitting a partial account state', async () => {
      const infra = createMockInfrastructure();
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
        platformDependencies: infra,
      });
      const accountCallback = vi.fn();
      const unsubscribe = provider.subscribeToAccount({
        callback: accountCallback,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      accountCallback.mockClear();

      expect(() =>
        socket.receive({
          type: 'update/user_stats',
          channel: 'user_stats:28',
          stats: {
            collateral: '10000USD',
            portfolio_value: '11000',
            leverage: '2',
            available_balance: '6000',
            margin_usage: '40',
            buying_power: '0',
          },
        }),
      ).not.toThrow();
      expect(accountCallback).not.toHaveBeenCalled();
      expect(infra.debugLogger.log).toHaveBeenCalledWith(
        '[LighterProvider] dropped malformed WebSocket frame',
        expect.objectContaining({
          error: expect.stringContaining(
            'Invalid Lighter venue data',
          ) as string,
        }),
      );

      unsubscribe();
      await provider.disconnect();
    });

    it('does not emit authoritative empty state when account-channel discovery fails', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockRejectedValue(
        new Error('Invalid Lighter venue data: malformed account discovery'),
      );
      const accountCallback = vi.fn();
      const positionsCallback = vi.fn();
      const ordersCallback = vi.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(accountCallback).not.toHaveBeenCalled();
      expect(positionsCallback).not.toHaveBeenCalled();
      expect(ordersCallback).not.toHaveBeenCalled();
      unsubscribeAccount();
      unsubscribePositions();
      unsubscribeOrders();
      await provider.disconnect();
    });

    it('emits authoritative empty state when the selected wallet has no Lighter account', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockRejectedValue(
        new LighterApiError('account not found', 21100),
      );
      const accountCallback = vi.fn();
      const positionsCallback = vi.fn();
      const ordersCallback = vi.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });

      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalBalance: '0',
          spendableBalance: '0',
          providerId: 'lighter',
        }),
      );
      expect(positionsCallback).toHaveBeenCalledWith([]);
      expect(ordersCallback).toHaveBeenCalledWith([]);
      unsubscribeAccount();
      unsubscribePositions();
      unsubscribeOrders();
      await provider.disconnect();
    });

    it('also settles account subscribers when discovery succeeds with no accounts', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [],
      });
      const positionsCallback = vi.fn();
      const ordersCallback = vi.fn();
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });

      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(positionsCallback).toHaveBeenCalledWith([]);
      expect(ordersCallback).toHaveBeenCalledWith([]);
      unsubscribePositions();
      unsubscribeOrders();
      await provider.disconnect();
    });

    it('reports a same-wallet signer creation failure to orders and fills subscribers', async () => {
      const { provider, bridge } = buildProvider({ webSocketCtor: fakeCtor });
      const failure = new Error('Lighter signer setup failed');
      (bridge.createClient as Mock).mockRejectedValue(failure);
      const onOrderError = vi.fn();
      const onFillError = vi.fn();
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: vi.fn(),
        onError: onOrderError,
      });
      const unsubscribeFills = provider.subscribeToOrderFills({
        callback: vi.fn(),
        onError: onFillError,
      });

      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(onOrderError).toHaveBeenCalledWith(failure);
      expect(onFillError).toHaveBeenCalledWith(failure);
      unsubscribeOrders();
      unsubscribeFills();
      await provider.disconnect();
    });

    it('does not clear orders when authenticated channel setup fails', async () => {
      const { provider, bridge } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: '9c'.repeat(40),
      });
      const mockedExecute = vi.spyOn(bridge, 'execute');
      const realExecute = mockedExecute.getMockImplementation()?.bind(bridge);
      if (!realExecute) {
        throw new Error('Missing bridge mock implementation');
      }
      mockedExecute.mockImplementation(async (call: LighterWasmCall) => {
        if (call.function === '_createAuthToken') {
          throw new Error(
            'Invalid Lighter venue data: malformed auth-token response',
          );
        }
        return await realExecute(call);
      });
      const ordersCallback = vi.fn();
      const onError = vi.fn();
      const unsubscribe = provider.subscribeToOrders({
        callback: ordersCallback,
        onError,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid Lighter venue data: malformed auth-token response',
        }),
      );
      expect(ordersCallback).not.toHaveBeenCalledWith([]);
      expect(ordersCallback).not.toHaveBeenCalled();
      unsubscribe();
      await provider.disconnect();
    });

    it('tears down the socket when the last subscriber unsubscribes', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      const socket = FakeWebSocket.instances[0];
      socket.open();
      unsubscribe();
      expect(socket.readyState).toBe(3);
      await provider.disconnect();
    });

    it('reports connection-state transitions and supports manual reconnect', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const transitions: string[] = [];
      const unsubscribeState = provider.subscribeToConnectionState((state) => {
        transitions.push(state);
      });
      expect(transitions).toStrictEqual(['disconnected']);

      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      FakeWebSocket.instances[0].open();
      expect(transitions).toStrictEqual([
        'disconnected',
        'connecting',
        'connected',
      ]);
      expect(provider.getWebSocketConnectionState()).toBe('connected');

      await provider.reconnect();
      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.instances[1].open();
      expect(transitions.slice(3)).toStrictEqual([
        'disconnected',
        'connecting',
        'connected',
      ]);
      // The replacement socket re-subscribes the wanted channels.
      expect(FakeWebSocket.instances[1].sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' }),
      );

      unsubscribeState();
      unsubscribe();
      expect(provider.getWebSocketConnectionState()).toBe('disconnected');
    });

    it('falls back to REST polling when no WebSocket implementation exists', async () => {
      vi.useFakeTimers();
      try {
        const { provider, clientInstance } = buildProvider({
          webSocketCtor: null,
        });
        expect(provider.getWebSocketConnectionState()).toBe('disconnected');
        const callback = vi.fn();
        const unsubscribe = provider.subscribeToPrices({
          symbols: [],
          callback,
        });
        expect(provider.getWebSocketConnectionState()).toBe('connected');
        await Promise.resolve();
        await Promise.resolve();
        expect(callback).toHaveBeenCalledWith([
          expect.objectContaining({ symbol: 'BTC', price: '100000' }),
        ]);

        await vi.advanceTimersByTimeAsync(10_500);
        expect(
          clientInstance.getOrderBookDetails.mock.calls.length,
        ).toBeGreaterThanOrEqual(3);

        unsubscribe();
        expect(provider.getWebSocketConnectionState()).toBe('disconnected');
        const callsAfter = clientInstance.getOrderBookDetails.mock.calls.length;
        await vi.advanceTimersByTimeAsync(20_000);
        expect(clientInstance.getOrderBookDetails.mock.calls).toHaveLength(
          callsAfter,
        );
        await provider.disconnect();
        expect(provider.getWebSocketConnectionState()).toBe('disconnected');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('session binding', () => {
    it('re-arms one signer reset listener after wallet deselection and reselection', async () => {
      const {
        provider,
        calls,
        fireReset,
        getUserAddressMock,
        resetListenerCount,
      } = buildProvider({ registeredKey: '9c'.repeat(40) });
      expect((await provider.isReadyToTrade()).ready).toBe(true);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(1);

      getUserAddressMock.mockImplementation(() => {
        throw new Error('no selected wallet account');
      });
      await provider.getAccountState();
      expect(resetListenerCount()).toBe(0);

      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      await provider.getAccountState();
      expect(resetListenerCount()).toBe(1);
      fireReset();

      expect((await provider.isReadyToTrade()).ready).toBe(true);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(2);
      await provider.disconnect();
      expect(resetListenerCount()).toBe(0);
    });

    it('replaces the signer reset listener on account rebind and removes it on disconnect', async () => {
      const {
        provider,
        getUserAddressMock,
        resetListenerCount,
        resetUnsubscribe,
      } = buildProvider();
      expect(resetListenerCount()).toBe(1);
      await provider.getAccountState();
      getUserAddressMock.mockReturnValue(
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      );
      await provider.getAccountState().catch(() => undefined);
      expect(resetUnsubscribe).toHaveBeenCalledTimes(1);
      expect(resetListenerCount()).toBe(1);
      await provider.disconnect();
      expect(resetUnsubscribe).toHaveBeenCalledTimes(2);
      expect(resetListenerCount()).toBe(0);
    });

    it('does not let a stale account lookup poison the session after an account switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      const accountA = { ...ACCOUNT, index: 28 };
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      // Account A's lookup is slow; B's resolves immediately.
      let resolveLookupA: (value: unknown) => void = () => undefined;
      clientInstance.getAccountsByL1Address
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveLookupA = resolve;
            }),
        )
        .mockResolvedValue({
          code: 200,
          l1Address: '0xbbbb',
          subAccounts: [accountB],
        });

      // Start a read under account A (lookup hangs in flight).
      const readUnderA = provider.getAccountState();
      // Wallet switches to account B; a new read rebinds the session and
      // resolves B's index.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      // A's lookup finally resolves — it must NOT overwrite B's session.
      resolveLookupA({
        code: 200,
        l1Address: accountA.l1Address,
        subAccounts: [accountA],
      });
      await readUnderA;

      const accountReads = clientInstance.getAccountByIndex.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(accountReads).not.toContain(28);
      expect(accountReads).toContain(900);
    });

    it('rebuilds stream channels for the NEW account after a switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      StreamFakeWebSocket.instances = [];
      const accountCallback = vi.fn();
      const positionsCallback = vi.fn();
      const ordersCallback = vi.fn();
      const unsubscribePrices = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      StreamFakeWebSocket.instances[0].open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(StreamFakeWebSocket.instances[0].sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
      );

      // Wallet switches accounts; any session-bound call triggers rebind.
      accountCallback.mockClear();
      positionsCallback.mockClear();
      ordersCallback.mockClear();
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalBalance: '0',
          spendableBalance: '0',
          providerId: 'lighter',
        }),
      );
      expect(positionsCallback).toHaveBeenCalledWith([]);
      expect(ordersCallback).toHaveBeenCalledWith([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const replacement =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      expect(StreamFakeWebSocket.instances.length).toBeGreaterThan(1);
      replacement.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(replacement.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' }),
      );
      // The account channels target account B's exact index — never A's.
      expect(replacement.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/900' }),
      );
      expect(
        replacement.sent.some((frame) => frame.includes('user_stats/28')),
      ).toBe(false);

      unsubscribePrices();
      unsubscribeAccount();
      unsubscribePositions();
      unsubscribeOrders();
    });

    it('cancels a queued write when the wallet switches accounts first', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      // Hold the write chain busy with a slow nonce fetch so the next write
      // queues behind it.
      let releaseNonce: (value: unknown) => void = () => undefined;
      clientInstance.getNextNonce.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseNonce = resolve;
          }),
      );
      const firstWrite = provider.cancelOrder({ orderId: '1', symbol: 'BTC' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const queuedWrite = provider.cancelOrder({ orderId: '2', symbol: 'BTC' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Account switch happens while the second write sits in the queue.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState().catch(() => undefined);
      releaseNonce({ code: 200, nonce: 42 });
      await firstWrite;
      const queuedResult = await queuedWrite;
      expect(queuedResult.success).toBe(false);
      expect(queuedResult.error).toContain('switched accounts');
    });
  });

  describe('session races (reviewer scenarios)', () => {
    it('a stalled account-A _createClient aborts and account B ends as the actual signer', async () => {
      // Serialized design: A's setup enters the lock and stalls INSIDE
      // _createClient; B's setup must remain pending behind the lock; on
      // release, A aborts (generation fence) and only then B creates.
      const { provider, clientInstance, getUserAddressMock, calls, bridge } =
        buildProvider({
          configuredAccountIndex: null,
          registeredKey: '9c'.repeat(40),
        });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      // Capture the ORIGINAL implementation, not the mock reference —
      // delegating to the mock itself would recurse forever.
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseCreateA: () => void = () => undefined;
      let createARequested: () => void = () => undefined;
      const createAPaused = new Promise<void>((resolve) => {
        createARequested = resolve;
      });
      let stalledOnce = false;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createClient' && !stalledOnce) {
            stalledOnce = true;
            createARequested();
            await new Promise<void>((resolve) => {
              releaseCreateA = resolve;
            });
          }
          return realImplementation(call);
        },
      );

      const setupUnderA = provider.isReadyToTrade();
      await createAPaused;
      // Switch to B and start B's setup: it must queue behind A's lock.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      let setupBSettled = false;
      const setupUnderB = provider.isReadyToTrade().then((result) => {
        setupBSettled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setupBSettled).toBe(false);
      // The recorded `calls` list only captures delegated (completed)
      // executions; count issued creates on the wrapper itself.
      const issuedCreates = (bridge.execute as Mock).mock.calls.filter(
        ([call]: LighterWasmCall[]) => call.function === '_createClient',
      );
      expect(issuedCreates).toHaveLength(1);

      // Release A: it aborts at the post-createClient fence; B then runs.
      releaseCreateA();
      const readyA = await setupUnderA;
      const readyB = await setupUnderB;
      expect(readyA.ready).toBe(false);
      expect(readyB.ready).toBe(true);
      const createCalls = calls.filter(
        (call) => call.function === '_createClient',
      );
      // Exactly two creates, and the LAST client created belongs to B — B
      // is the actual signer left in the bridge.
      expect(createCalls).toHaveLength(2);
      expect(createCalls[1].params[1]).toBe(900);
      // A never registered or submitted anything.
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('an account-A write paused inside the lock never signs after B initializes', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({
          configuredAccountIndex: null,
          registeredKey: '9c'.repeat(40),
        });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      // Warm A's signer FIRST so the deferred nonce below is definitively
      // the cancel write's nonce, not signer setup's.
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      let releaseNonce: (value: unknown) => void = () => undefined;
      let nonceRequested: () => void = () => undefined;
      const noncePaused = new Promise<void>((resolve) => {
        nonceRequested = resolve;
      });
      clientInstance.getNextNonce.mockImplementationOnce(() => {
        nonceRequested();
        return new Promise((resolve) => {
          releaseNonce = resolve;
        });
      });
      const writeUnderA = provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      await noncePaused;
      // While A's write holds the lock: switch to B and start B's signer
      // setup — it must QUEUE behind A's critical section.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      let setupBSettled = false;
      const setupUnderB = provider.isReadyToTrade().then((result) => {
        setupBSettled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setupBSettled).toBe(false);

      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
      // A's cancel never signed or submitted.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      // B's signer completes once the lock frees.
      const readyB = await setupUnderB;
      expect(readyB.ready).toBe(true);
    });

    it('ignores frames from the pre-switch WebSocket after a rebind', async () => {
      const { provider, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      StreamFakeWebSocket.instances = [];
      const callback = vi.fn();
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback,
      });
      // Bind the session under account A first — without a previous binding
      // an account call merely binds, it does not rebuild anything.
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const staleSocket = StreamFakeWebSocket.instances[0];
      staleSocket.open();
      // Rebind to another account: the socket is replaced. (The read
      // itself now rejects — 0xbbbb does not own configured account 28 —
      // but the rebind happens at entry, which is all this test needs.)
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState().catch(() => undefined);
      callback.mockClear();
      // A late frame from the OLD socket must not reach subscribers.
      staleSocket.onmessage?.({
        data: JSON.stringify({
          type: 'update/market_stats',
          channel: 'market_stats:all',
          market_stats: {
            '1': {
              symbol: 'BTC',
              market_id: 1,
              index_price: '1',
              mark_price: '1',
              mid_price: '1',
              last_trade_price: '1',
            },
          },
        }),
      });
      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('closePosition aborts before trading when the account switches after the position read', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      // Stall the position read (getAccountByIndex) under A.
      let releasePositions: (value: unknown) => void = () => undefined;
      clientInstance.getAccountByIndex
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releasePositions = resolve;
            }),
        )
        .mockResolvedValue({ code: 200, accounts: [accountB] });
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      const closeUnderA = provider.closePosition({ symbol: 'BTC' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      releasePositions({ code: 200, accounts: [ACCOUNT] });
      const result = await closeUnderA;
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
    });

    it('updatePositionTPSL cancels nothing when the account switches mid-sequence', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      // A reduce-only trigger order exists so the replace path would cancel.
      clientInstance.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [
          {
            orderIndex: 999,
            clientOrderIndex: 9,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.1',
            remainingBaseAmount: '0.1',
            price: '80000',
            isAsk: true,
            type: 'stop_loss',
            timeInForce: 'immediate-or-cancel',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: 1700000000000,
          },
        ],
      });
      // Stall the open-orders read; switch while it is in flight.
      let releaseOrders: (value: unknown) => void = () => undefined;
      clientInstance.getActiveOrders.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOrders = resolve;
          }),
      );
      const tpslUnderA = provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      releaseOrders({
        code: 200,
        orders: [
          {
            orderIndex: 999,
            clientOrderIndex: 9,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.1',
            remainingBaseAmount: '0.1',
            price: '80000',
            isAsk: true,
            type: 'stop_loss',
            timeInForce: 'immediate-or-cancel',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: 1700000000000,
          },
        ],
      });
      const result = await tpslUnderA;
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
      // No cancel and no grouped order ever reached signing.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(
        calls.filter((call) => call.function === '_signCreateGroupedOrders'),
      ).toHaveLength(0);
    });
  });

  describe('account-type gate', () => {
    it('refuses Premium (nonzero-fee) accounts across the account surface', async () => {
      const { provider, clientInstance } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      // Capability gates SURFACE: no plausible empty state that hides why.
      await expect(provider.getAccountState()).rejects.toThrow('Premium');
      const ready = await provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      expect(ready.error).toContain('Premium');
    });

    it('verifies a configured account index is Standard before using it', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      const ready = await provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      expect(ready.error).toContain('Premium');
    });

    it('fails closed when the account type cannot be verified', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [],
      });
      const ready = await provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      expect(ready.error).toContain('could not be verified');
    });

    it('gates calculateFees for non-Standard accounts', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      await expect(
        provider.calculateFees({
          orderType: 'market',
          symbol: 'BTC',
          amount: '100',
        }),
      ).rejects.toThrow('Premium');
    });
  });

  describe('UpdateLeverage signing contract', () => {
    it('signs exactly [accountIndex, marketId, imfHundredths, marginMode, nonce]', async () => {
      // Regression: a patch artifact once injected a 6th argument before
      // the nonce, shifting it and mis-signing every leverage-changing
      // placement.
      const { provider, bridge } = buildProvider();
      const realImplementation = (
        bridge.execute as Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signUpdateLeverage') {
            return {
              txInfo: JSON.stringify({
                updateLeverage: true,
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: 'eeee999900000001',
            };
          }
          return realImplementation(call);
        },
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(true);
      const leverageCall = (
        bridge.execute as Mock<
          (
            ...args: [LighterWasmCall]
          ) => Promise<LighterSignerResult<LighterSignerOperation>>
        >
      ).mock.calls.find(
        ([call]: LighterWasmCall[]) => call.function === '_signUpdateLeverage',
      )?.[0] as LighterWasmCall;
      expect(leverageCall).toBeDefined();
      expect(leverageCall.params).toHaveLength(5);
      expect(leverageCall.params[0]).toBe(28);
      expect(leverageCall.params[1]).toBe(1);
      expect(leverageCall.params[2]).toBe(1000);
      expect(leverageCall.params[3]).toBe(0);
      // Fifth param is the nonce from the shared write lock: 43 because
      // the setup ChangePubKey dispatched 42 and reservations are
      // session-global.
      expect(leverageCall.params[4]).toBe(43);
    });
  });
});
