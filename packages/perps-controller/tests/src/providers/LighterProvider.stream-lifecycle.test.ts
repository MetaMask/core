import { describe, expect, it, vi } from 'vitest';

import { CandlePeriod } from '../../../src/constants/chartConfig.js';
import {
  LIGHTER_CHANNEL_RELEASE_DELAY_MS,
  LIGHTER_SOCKET_DOWN_GRACE_MS,
  LIGHTER_SOCKET_IDLE_CLOSE_MS,
} from '../../../src/constants/lighterConfig.js';
import { AggregatedPerpsProvider } from '../../../src/providers/AggregatedPerpsProvider.js';
import {
  getLighterReconnectDelayMs,
  LighterProvider,
} from '../../../src/providers/LighterProvider.js';
import { WebSocketConnectionState } from '../../../src/types/index.js';
import type {
  PerpsProvider,
  PerpsProviderHealth,
  PerpsProviderType,
  PriceUpdate,
  SubscribePricesParams,
} from '../../../src/types/index.js';
import type {
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import {
  BTC_MARKET,
  buildProvider,
  fakeStreamCtor,
  finishPendingTimersAfterEach,
  MockedClientService,
  ownershipController,
  StreamFakeWebSocket,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';
import { createMockHyperLiquidProvider } from '../../helpers/providerMocks.js';
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

const MARKET_COUNT = 20;
const MARKETS = Array.from({ length: MARKET_COUNT }, (_, index) => ({
  ...BTC_MARKET,
  symbol: `M${index}`,
  marketId: 100 + index,
}));

/**
 * Build a WebSocket provider with twenty markets on a manual fake clock.
 *
 * @param options - buildProvider overrides.
 * @returns The provider and its collaborators.
 */
function buildStreamProvider(
  options: Parameters<typeof buildProvider>[0] = {},
): BuiltProvider {
  vi.useFakeTimers();
  StreamFakeWebSocket.instances = [];
  const built = buildProvider({ ...options, webSocketCtor: fakeStreamCtor });
  built.clientInstance.getOrderBooks.mockResolvedValue(MARKETS);
  return built;
}

/**
 * The REST health hook the provider handed its client service.
 *
 * @returns The hook.
 */
const getRequestHealthHook = (): (() => void) => {
  const hook =
    MockedClientService.mock.calls.at(-1)?.[1]?.onRequestHealthChange;
  if (!hook) {
    throw new Error('LighterClientService built without a health hook');
  }
  return hook;
};

/**
 * Hold auth-token mints until the returned release is called.
 *
 * @param bridge - The provider's mock signer bridge.
 * @returns Releases the held mints.
 */
const stallAuthToken = (bridge: LighterSignerBridge): (() => void) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const execute = bridge.execute.bind(bridge);
  bridge.execute = async <Operation extends LighterSignerOperation>(
    call: LighterWasmCall<Operation>,
  ): Promise<LighterSignerResult<Operation>> => {
    if (call.function === '_createAuthToken') {
      await gate;
    }
    return await execute(call);
  };
  return () => release();
};

const latestSocket = (): StreamFakeWebSocket =>
  StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];

const receive = (socket: StreamFakeWebSocket, message: unknown): void =>
  socket.onmessage?.({ data: JSON.stringify(message) });

/**
 * Channels the venue holds for a socket, from the frames the client sent.
 *
 * @param socket - Fake socket.
 * @returns Subscribed channels, sorted.
 */
const venueChannels = (socket: StreamFakeWebSocket): string[] => {
  const channels = new Set<string>();
  for (const frame of socket.sent) {
    const { type, channel } = JSON.parse(frame) as {
      type: string;
      channel?: string;
    };
    if (channel === undefined) {
      continue;
    }
    if (type === 'subscribe') {
      channels.add(channel);
    } else if (type === 'unsubscribe') {
      channels.delete(channel);
    }
  }
  return [...channels].sort();
};

/**
 * Let async market resolution and account-channel setup finish.
 */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
};

/**
 * Open a market screen (order book + candles) and return its cleanup.
 *
 * @param provider - Provider under test.
 * @param symbol - Market symbol.
 * @param callbacks - Callbacks for the book and the candles.
 * @param callbacks.book - Order-book callback.
 * @param callbacks.candles - Candle callback.
 * @returns Leaves the screen.
 */
const openMarketScreen = (
  provider: LighterProvider,
  symbol: string,
  callbacks: { book?: () => void; candles?: () => void } = {},
): (() => void) => {
  const leaveBook = provider.subscribeToOrderBook({
    symbol,
    callback: callbacks.book ?? vi.fn(),
  });
  const leaveCandles = provider.subscribeToCandles({
    symbol,
    interval: CandlePeriod.OneMinute,
    callback: callbacks.candles ?? vi.fn(),
  });
  return () => {
    leaveBook();
    leaveCandles();
  };
};

describe('LighterProvider stream lifecycle', () => {
  finishPendingTimersAfterEach();

  describe('channel release', () => {
    it('keeps only watched channels plus the account channels after leaving 20 markets', async () => {
      const platformDependencies = createMockInfrastructure();
      const { provider } = buildStreamProvider({ platformDependencies });
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      provider.subscribeToPositions({ callback: vi.fn() });
      await settle();
      const socket = latestSocket();
      socket.open();

      for (const market of MARKETS) {
        const leave = openMarketScreen(provider, market.symbol);
        await settle();
        leave();
      }
      expect(venueChannels(socket)).toHaveLength(2 * MARKET_COUNT + 5);

      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);

      expect(venueChannels(socket)).toStrictEqual([
        'account_all_orders/28',
        'account_all_positions/28',
        'account_all_trades/28',
        'market_stats/all',
        'user_stats/28',
      ]);
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      expect(socket.readyState).toBe(1);
      // The debug log carries the count TAT-4431 measures.
      const counts = vi
        .mocked(platformDependencies.debugLogger.log)
        .mock.calls.filter(
          ([message]) => message === '[LighterProvider] stream channels',
        )
        .map(
          ([, meta]) =>
            (meta as { subscribedChannels: number }).subscribedChannels,
        );
      expect(counts.at(-1)).toBe(5);
      expect(Math.max(...counts)).toBe(2 * MARKET_COUNT + 5);
      await provider.disconnect();
    });

    it('resubscribes only channels that still have listeners after a reconnect', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const { provider } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      const leaveAccount = provider.subscribeToAccount({ callback: vi.fn() });
      await settle();
      latestSocket().open();
      const leave = openMarketScreen(provider, 'M1');
      await settle();
      expect(venueChannels(latestSocket())).toContain('user_stats/28');
      leave();
      leaveAccount();

      // The socket drops inside the release wait.
      latestSocket().close();
      await vi.advanceTimersByTimeAsync(getLighterReconnectDelayMs(1));
      const replacement = latestSocket();
      replacement.open();

      expect(StreamFakeWebSocket.instances).toHaveLength(2);
      expect(venueChannels(replacement)).toStrictEqual(['market_stats/all']);
      await provider.disconnect();
    });

    it('requests no account channel when the account resolves after its listener left', async () => {
      const { provider, clientInstance } = buildStreamProvider({
        configuredAccountIndex: null,
      });
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      await settle();
      const socket = latestSocket();
      socket.open();
      const accounts: unknown = await clientInstance.getAccountsByL1Address();
      let resolveAccounts: (value: unknown) => void = () => undefined;
      clientInstance.getAccountsByL1Address.mockImplementationOnce(
        async () =>
          await new Promise((resolve) => {
            resolveAccounts = resolve;
          }),
      );

      const leavePositions = provider.subscribeToPositions({
        callback: vi.fn(),
      });
      await settle();
      leavePositions();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      resolveAccounts(accounts);
      await settle();

      expect(venueChannels(socket)).toStrictEqual(['market_stats/all']);
      await provider.disconnect();
    });

    it('requests no orders channel when the auth token arrives after the account listener left', async () => {
      const { provider, bridge } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      await settle();
      const socket = latestSocket();
      socket.open();
      const releaseToken = stallAuthToken(bridge);

      const leavePositions = provider.subscribeToPositions({
        callback: vi.fn(),
      });
      await settle();
      expect(venueChannels(socket)).toContain('user_stats/28');
      leavePositions();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      releaseToken();
      await settle();

      expect(venueChannels(socket)).toStrictEqual(['market_stats/all']);
      await provider.disconnect();
    });

    it('drops a late account frame after the release, so the next subscriber gets no stale positions', async () => {
      const { provider } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      const leavePositions = provider.subscribeToPositions({
        callback: vi.fn(),
      });
      await settle();
      const socket = latestSocket();
      socket.open();
      leavePositions();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      expect(venueChannels(socket)).toStrictEqual(['market_stats/all']);

      receive(socket, {
        type: 'update/account_all_positions',
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
            unrealized_pnl: '0',
            realized_pnl: '0',
            liquidation_price: '1',
          },
        },
      });
      const late = vi.fn();
      provider.subscribeToPositions({ callback: late });

      expect(late).not.toHaveBeenCalled();
      await provider.disconnect();
    });

    it('drops a late price frame after the release, so the next subscriber gets no stale replay', async () => {
      const { provider } = buildStreamProvider();
      const leaveScreen = openMarketScreen(provider, 'M2');
      const leavePrices = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      await settle();
      const socket = latestSocket();
      socket.open();
      leavePrices();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      expect(venueChannels(socket)).not.toContain('market_stats/all');

      receive(socket, {
        type: 'update/market_stats',
        channel: 'market_stats:all',
        market_stats: {
          '102': {
            symbol: 'M2',
            market_id: 102,
            index_price: '1',
            mark_price: '1',
            mid_price: '1',
            last_trade_price: '1',
            open_interest: '1',
            open_interest_limit: '10',
            funding_rate: '0',
            daily_quote_token_volume: 1,
            daily_price_change: 0,
          },
        },
      });
      const late = vi.fn();
      provider.subscribeToPrices({ symbols: [], callback: late });

      expect(late).not.toHaveBeenCalled();
      leaveScreen();
      await provider.disconnect();
    });

    it('keeps a market through a quick return without new frames', async () => {
      const { provider } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      await settle();
      const socket = latestSocket();
      socket.open();
      const leave = openMarketScreen(provider, 'M2');
      await settle();
      leave();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS - 1);
      const sentBeforeReturn = socket.sent.length;
      const leaveAgain = openMarketScreen(provider, 'M2');
      await settle();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);

      expect(socket.sent).toHaveLength(sentBeforeReturn);
      expect(venueChannels(socket)).toContain('order_book/102');
      leaveAgain();
      await provider.disconnect();
    });

    it('releases the account channels once no account, position, order or fill listener is left', async () => {
      const { provider } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      const leaveAccount = provider.subscribeToAccount({ callback: vi.fn() });
      const leavePositions = provider.subscribeToPositions({
        callback: vi.fn(),
      });
      await settle();
      const socket = latestSocket();
      socket.open();
      expect(venueChannels(socket)).toContain('user_stats/28');

      leaveAccount();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      // A position listener still needs them.
      expect(venueChannels(socket)).toContain('user_stats/28');

      leavePositions();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      expect(venueChannels(socket)).toStrictEqual(['market_stats/all']);

      // The next account listener requests them again.
      provider.subscribeToOrders({ callback: vi.fn() });
      await settle();
      expect(venueChannels(socket)).toContain('account_all_positions/28');
      await provider.disconnect();
    });

    it('does no order-book or candle work for a released market', async () => {
      const { provider } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      await settle();
      const socket = latestSocket();
      socket.open();
      const book = vi.fn();
      const candles = vi.fn();
      const leave = openMarketScreen(provider, 'M3', { book, candles });
      await settle();
      receive(socket, {
        type: 'subscribed/order_book',
        channel: 'order_book:103',
        order_book: {
          nonce: 1,
          bids: [{ price: '99', size: '1' }],
          asks: [{ price: '101', size: '1' }],
        },
      });
      expect(book).toHaveBeenCalledTimes(1);
      const candleCalls = candles.mock.calls.length;
      leave();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS);
      const sentAfterRelease = socket.sent.length;

      // Late frames for the released market: a delta on an unknown book
      // would otherwise trigger an unsubscribe + subscribe resync.
      receive(socket, {
        type: 'update/order_book',
        channel: 'order_book:103',
        order_book: {
          nonce: 3,
          begin_nonce: 2,
          bids: [{ price: '98', size: '1' }],
          asks: [],
        },
      });
      receive(socket, {
        type: 'update/candle',
        channel: 'candle:103:1m',
        candles: [{ t: 1, o: 1, h: 1, l: 1, c: 1, v: 1 }],
      });

      expect(socket.sent).toHaveLength(sentAfterRelease);
      expect(book).toHaveBeenCalledTimes(1);
      expect(candles).toHaveBeenCalledTimes(candleCalls);
      expect(venueChannels(socket)).toStrictEqual(['market_stats/all']);
      await provider.disconnect();
    });
  });

  describe('idle close', () => {
    it('keeps one socket while moving between two Lighter screens', async () => {
      const { provider } = buildStreamProvider();
      const leaveFirst = openMarketScreen(provider, 'M4');
      await settle();
      const socket = latestSocket();
      socket.open();

      leaveFirst();
      const leaveSecond = openMarketScreen(provider, 'M5');
      await settle();
      leaveSecond();
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_IDLE_CLOSE_MS - 1);
      const leaveReturn = openMarketScreen(provider, 'M4');
      await settle();
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_IDLE_CLOSE_MS);

      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      expect(socket.readyState).toBe(1);
      expect(provider.getWebSocketConnectionState()).toBe('connected');
      leaveReturn();
      await provider.disconnect();
    });

    it('closes the socket after the configured idle period', async () => {
      const { provider } = buildStreamProvider({ socketIdleCloseMs: 2_000 });
      const states: string[] = [];
      provider.subscribeToConnectionState((state, attempt) =>
        states.push(`${state}:${attempt}`),
      );
      const leave = openMarketScreen(provider, 'M6');
      await settle();
      const socket = latestSocket();
      socket.open();
      leave();
      await vi.advanceTimersByTimeAsync(1_999);
      expect(socket.readyState).toBe(1);
      await vi.advanceTimersByTimeAsync(1);

      expect(socket.readyState).toBe(3);
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      // Closed by choice: attempt 0, no reconnect scheduled.
      expect(states.at(-1)).toBe('disconnected:0');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      await provider.disconnect();
    });

    it('does not reconnect a socket that drops while idle', async () => {
      const { provider } = buildStreamProvider();
      const states: string[] = [];
      provider.subscribeToConnectionState((state, attempt) =>
        states.push(`${state}:${attempt}`),
      );
      const leave = openMarketScreen(provider, 'M7');
      await settle();
      const socket = latestSocket();
      socket.open();
      leave();
      socket.close();

      expect(states.at(-1)).toBe('disconnected:0');
      await vi.advanceTimersByTimeAsync(60_000);
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      await provider.disconnect();
    });
  });

  describe('reconnect backoff', () => {
    it('grows the delay up to the cap while the socket keeps failing and resets it after an open', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const platformDependencies = createMockInfrastructure();
      const { provider } = buildStreamProvider({ platformDependencies });
      const states: string[] = [];
      provider.subscribeToConnectionState((state, attempt) =>
        states.push(`${state}:${attempt}`),
      );
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      latestSocket().open();
      latestSocket().close();

      const expectedDelays = [
        1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
      ];
      for (const delayMs of expectedDelays) {
        const count = StreamFakeWebSocket.instances.length;
        await vi.advanceTimersByTimeAsync(delayMs - 1);
        expect(StreamFakeWebSocket.instances).toHaveLength(count);
        await vi.advanceTimersByTimeAsync(1);
        expect(StreamFakeWebSocket.instances).toHaveLength(count + 1);
        // The attempt fails before it opens.
        latestSocket().close();
      }
      expect(states).toContain('disconnected:1');
      expect(states).toContain('connecting:7');
      const logged = vi
        .mocked(platformDependencies.debugLogger.log)
        .mock.calls.filter(
          ([message]) =>
            message === '[LighterProvider] price stream closed; reconnecting',
        )
        .map(([, meta]) => meta as { attempt: number; delayMs: number });
      expect(logged.map(({ delayMs }) => delayMs)).toStrictEqual([
        ...expectedDelays,
        30_000,
      ]);

      await vi.advanceTimersByTimeAsync(30_000);
      latestSocket().open();
      expect(states.at(-1)).toBe('connected:0');
      latestSocket().close();
      const count = StreamFakeWebSocket.instances.length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(StreamFakeWebSocket.instances).toHaveLength(count + 1);
      await provider.disconnect();
    });

    it('keeps the backoff when a stream subscribes while a reconnect is pending', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const { provider } = buildStreamProvider();
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      await settle();
      latestSocket().open();
      latestSocket().close();

      const leave = openMarketScreen(provider, 'M3');
      await settle();
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(getLighterReconnectDelayMs(1));
      expect(StreamFakeWebSocket.instances).toHaveLength(2);

      // A failed reconnect leaves exactly one pending attempt.
      latestSocket().close();
      await vi.advanceTimersByTimeAsync(getLighterReconnectDelayMs(2));
      expect(StreamFakeWebSocket.instances).toHaveLength(3);
      latestSocket().open();
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_IDLE_CLOSE_MS);
      expect(StreamFakeWebSocket.instances).toHaveLength(3);
      leave();
      await provider.disconnect();
    });

    it('reports attempt 0 when a reconnect attempt fails after the last listener left', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const { provider } = buildStreamProvider();
      const states: string[] = [];
      provider.subscribeToConnectionState((state, attempt) =>
        states.push(`${state}:${attempt}`),
      );
      const leave = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      await settle();
      latestSocket().open();
      latestSocket().close();
      await vi.advanceTimersByTimeAsync(getLighterReconnectDelayMs(1));
      expect(states.at(-1)).toBe('connecting:1');

      leave();
      latestSocket().close();

      expect(states.at(-1)).toBe('disconnected:0');
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_IDLE_CLOSE_MS);
      expect(states.at(-1)).toBe('disconnected:0');
      expect(StreamFakeWebSocket.instances).toHaveLength(2);
      await provider.disconnect();
    });

    it('reports attempt 0 once the idle teardown drops a pending reconnect', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);
      const { provider } = buildStreamProvider();
      const states: string[] = [];
      provider.subscribeToConnectionState((state, attempt) =>
        states.push(`${state}:${attempt}`),
      );
      const leave = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      await settle();
      latestSocket().open();
      latestSocket().close();
      expect(states.at(-1)).toBe('disconnected:1');

      leave();
      await vi.advanceTimersByTimeAsync(
        LIGHTER_CHANNEL_RELEASE_DELAY_MS + LIGHTER_SOCKET_IDLE_CLOSE_MS,
      );

      expect(states.at(-1)).toBe('disconnected:0');
      expect(StreamFakeWebSocket.instances).toHaveLength(1);
      await provider.disconnect();
    });

    it('jitters each delay within the upper half of its window', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      expect(getLighterReconnectDelayMs(1)).toBe(500);
      expect(getLighterReconnectDelayMs(6)).toBe(15_000);
      expect(getLighterReconnectDelayMs(50)).toBe(15_000);
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(getLighterReconnectDelayMs(3)).toBe(3_000);
    });
  });

  describe('provider health', () => {
    it('reports socket_down after the grace period while streams wait, and healthy after the reopen', async () => {
      const { provider } = buildStreamProvider();
      const health: PerpsProviderHealth[] = [];
      const stopHealth = provider.subscribeToProviderHealth((snapshot) =>
        health.push(snapshot),
      );
      provider.subscribeToPrices({ symbols: [], callback: vi.fn() });
      latestSocket().open();
      expect(provider.getProviderHealth()).toMatchObject({
        providerId: 'lighter',
        status: 'healthy',
        reasons: [],
        connectionState: 'connected',
      });

      latestSocket().close();
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_DOWN_GRACE_MS - 1);
      expect(provider.getProviderHealth().status).toBe('healthy');
      await vi.advanceTimersByTimeAsync(1);
      expect(provider.getProviderHealth()).toMatchObject({
        status: 'degraded',
        reasons: ['socket_down'],
      });

      await vi.advanceTimersByTimeAsync(30_000);
      latestSocket().open();
      expect(provider.getProviderHealth()).toMatchObject({
        status: 'healthy',
        reasons: [],
        reconnectionAttempt: 0,
      });
      expect(health.map(({ status }) => status)).toContain('degraded');
      expect(health.at(-1)?.status).toBe('healthy');

      // An unsubscribed listener hears nothing more.
      stopHealth();
      const reported = health.length;
      latestSocket().close();
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_DOWN_GRACE_MS);
      expect(provider.getProviderHealth().status).toBe('degraded');
      expect(health).toHaveLength(reported);
      await provider.disconnect();
    });

    it('does not report an idle close as an outage', async () => {
      const { provider } = buildStreamProvider();
      const leave = provider.subscribeToPrices({
        symbols: [],
        callback: vi.fn(),
      });
      latestSocket().open();
      leave();
      await vi.advanceTimersByTimeAsync(
        LIGHTER_SOCKET_IDLE_CLOSE_MS + LIGHTER_SOCKET_DOWN_GRACE_MS,
      );
      expect(provider.getProviderHealth()).toMatchObject({
        status: 'healthy',
        connectionState: 'disconnected',
        reconnectionAttempt: 0,
      });
      await provider.disconnect();
    });

    it('reports 5xx streaks and rate-limit cooldowns from the REST client, then recovers', async () => {
      const { provider, clientInstance } = buildStreamProvider();
      const onRequestHealthChange = getRequestHealthHook();
      const health: PerpsProviderHealth[] = [];
      provider.subscribeToProviderHealth((snapshot) => health.push(snapshot));

      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 3,
        cooldownUntil: null,
      });
      onRequestHealthChange();
      expect(health.at(-1)).toMatchObject({
        status: 'degraded',
        reasons: ['server_errors'],
      });

      const cooldownUntil = Date.now() + 2_000;
      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 0,
        cooldownUntil,
      });
      onRequestHealthChange();
      expect(health.at(-1)).toMatchObject({
        status: 'degraded',
        reasons: ['rate_limited'],
        cooldownUntil,
      });

      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 0,
        cooldownUntil: null,
      });
      await vi.advanceTimersByTimeAsync(2_001);
      expect(health.at(-1)).toMatchObject({ status: 'healthy', reasons: [] });
      await provider.disconnect();
      expect(provider.getProviderHealth().status).toBe('unavailable');
    });

    it('reports the next change to a subscriber that joins after an unreported recovery', async () => {
      const { provider, clientInstance } = buildStreamProvider();
      const onRequestHealthChange = getRequestHealthHook();
      const first = vi.fn();
      const stopFirst = provider.subscribeToProviderHealth(first);
      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 3,
        cooldownUntil: null,
      });
      onRequestHealthChange();
      expect(first).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'degraded' }),
      );
      stopFirst();

      // Recovers while nobody listens.
      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 0,
        cooldownUntil: null,
      });
      onRequestHealthChange();
      const second = vi.fn();
      provider.subscribeToProviderHealth(second);
      expect(second).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'healthy' }),
      );

      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 3,
        cooldownUntil: null,
      });
      onRequestHealthChange();
      expect(second).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'degraded',
          reasons: ['server_errors'],
        }),
      );
      await provider.disconnect();
    });

    it('keeps notifying health listeners when one throws, and reports once after disconnect', async () => {
      const platformDependencies = createMockInfrastructure();
      const { provider, clientInstance } = buildStreamProvider({
        platformDependencies,
      });
      const onRequestHealthChange = getRequestHealthHook();
      const failing = vi.fn();
      provider.subscribeToProviderHealth(failing);
      failing.mockImplementation(() => {
        throw new Error('listener failed');
      });
      const health: PerpsProviderHealth[] = [];
      provider.subscribeToProviderHealth((snapshot) => health.push(snapshot));

      // A newer cooldown replaces the pending recovery report.
      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 0,
        cooldownUntil: Date.now() + 2_000,
      });
      onRequestHealthChange();
      clientInstance.getRequestHealth.mockReturnValue({
        consecutiveServerErrors: 0,
        cooldownUntil: Date.now() + 5_000,
      });
      onRequestHealthChange();
      await vi.advanceTimersByTimeAsync(2_001);

      expect(health.at(-1)).toMatchObject({
        status: 'degraded',
        reasons: ['rate_limited'],
      });
      expect(platformDependencies.debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('provider-health'),
        expect.anything(),
      );

      // Disconnecting with the report still pending clears it.
      await provider.disconnect();
      await vi.advanceTimersByTimeAsync(5_000);
      const late = vi.fn();
      const unsubscribe = provider.subscribeToProviderHealth(late);
      expect(late).toHaveBeenCalledOnce();
      expect(late.mock.calls[0][0]).toMatchObject({ status: 'unavailable' });
      expect(unsubscribe()).toBeUndefined();
    });
  });

  describe('aggregated mode', () => {
    it('keeps HyperLiquid streaming and healthy while Lighter is degraded, then resets Lighter on recovery', async () => {
      const { provider: lighter } = buildStreamProvider();
      const hyperliquid = createMockHyperLiquidProvider();
      let hyperliquidPrices: SubscribePricesParams | undefined;
      hyperliquid.subscribeToPrices.mockImplementation((params) => {
        hyperliquidPrices = params;
        return (): void => undefined;
      });
      hyperliquid.getWebSocketConnectionState.mockReturnValue(
        WebSocketConnectionState.Connected,
      );
      hyperliquid.subscribeToConnectionState.mockImplementation((listener) => {
        listener(WebSocketConnectionState.Connected, 0);
        return (): void => undefined;
      });
      const providers = new Map<PerpsProviderType, PerpsProvider>([
        ['hyperliquid', hyperliquid],
        ['lighter', lighter],
      ]);
      const aggregated = new AggregatedPerpsProvider({
        providers,
        defaultProvider: 'lighter',
        infrastructure: createMockInfrastructure(),
        isTestnet: true,
      });
      const { controller } = ownershipController(aggregated, 'aggregated');
      controller.registerProvider('hyperliquid', hyperliquid);
      controller.registerProvider('lighter', lighter);

      const received: PriceUpdate[] = [];
      controller.subscribeToPrices({
        symbols: ['BTC'],
        callback: (updates) => received.push(...updates),
      });
      const lighterHealth: PerpsProviderHealth[] = [];
      controller.subscribeToProviderHealth({
        providerId: 'lighter',
        callback: (snapshot) => lighterHealth.push(snapshot),
      });
      latestSocket().open();

      // Lighter goes down and stays down.
      latestSocket().close();
      await vi.advanceTimersByTimeAsync(LIGHTER_SOCKET_DOWN_GRACE_MS);
      hyperliquidPrices?.callback([
        {
          symbol: 'BTC',
          price: '100000',
          timestamp: Date.now(),
          isTradable: true,
        },
      ]);

      expect(received).toContainEqual(
        expect.objectContaining({ symbol: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(controller.getProviderHealth('lighter')).toMatchObject({
        status: 'degraded',
        reasons: ['socket_down'],
      });
      expect(controller.getProviderHealth('hyperliquid')).toMatchObject({
        status: 'healthy',
        connectionState: 'connected',
      });

      await vi.advanceTimersByTimeAsync(30_000);
      latestSocket().open();
      expect(lighterHealth.at(-1)?.status).toBe('healthy');
      expect(controller.getProviderHealth('lighter').status).toBe('healthy');
      await lighter.disconnect();
    });
  });
});
