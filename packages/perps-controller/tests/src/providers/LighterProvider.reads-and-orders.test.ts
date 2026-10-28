import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  LIGHTER_TX_TYPE_CANCEL_ORDER,
  LIGHTER_TX_TYPE_CREATE_ORDER,
} from '../../../src/constants/lighterConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { LighterApiError } from '../../../src/services/LighterClientService.js';
import type { OrderParams } from '../../../src/types/index.js';
import type {
  LighterApiOrder,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import {
  ACCOUNT,
  BTC_MARKET,
  buildProvider,
  fakeStreamCtor,
  finishPendingTimersAfterEach,
  getLoggerErrorMock,
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

  describe('lifecycle', () => {
    it('exposes the lighter protocol id', () => {
      const { provider } = buildProvider();
      expect(provider.protocolId).toBe('lighter');
    });

    it('initializes by loading markets', async () => {
      const { provider, clientInstance } = buildProvider();
      const result = await provider.initialize();
      expect(result.success).toBe(true);
      expect(clientInstance.getOrderBooks).toHaveBeenCalledWith(true);
    });

    it('reports initialize failure without throwing', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(new Error('down'));
      const result = await provider.initialize();
      expect(result).toStrictEqual({ success: false, error: 'down' });
    });

    it('disconnects cleanly', async () => {
      const { provider, resetListenerCount, resetUnsubscribe } =
        buildProvider();
      expect(resetListenerCount()).toBe(1);
      expect(await provider.disconnect()).toStrictEqual({
        success: true,
      });
      expect(resetUnsubscribe).toHaveBeenCalledTimes(1);
      expect(resetListenerCount()).toBe(0);
    });

    it('does not rebind when a delayed account lookup resolves after disconnect', async () => {
      const { provider, clientInstance, calls, resetListenerCount } =
        buildProvider();
      let resolveAccount: (value: unknown) => void = () => undefined;
      let signalAccountLookup: () => void = () => undefined;
      const accountLookupStarted = new Promise<void>((resolve) => {
        signalAccountLookup = resolve;
      });
      clientInstance.getAccountByIndex
        .mockImplementationOnce(() => {
          signalAccountLookup();
          return new Promise((resolve) => {
            resolveAccount = resolve;
          });
        })
        .mockResolvedValue({ code: 200, accounts: [ACCOUNT] });

      provider.subscribeToAccount({ callback: vi.fn() });
      await accountLookupStarted;
      await provider.disconnect();
      expect(resetListenerCount()).toBe(0);
      resolveAccount({ code: 200, accounts: [ACCOUNT] });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(resetListenerCount()).toBe(0);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(0);
    });

    it('does not recreate the signer when a delayed auth mint resolves after disconnect', async () => {
      const { provider, bridge, calls, resetListenerCount } = buildProvider({
        registeredKey: '9c'.repeat(40),
      });
      const realExecute = (bridge.execute as Mock).getMockImplementation() as (
        call: LighterWasmCall,
      ) => Promise<unknown>;
      let releaseAuth: () => void = () => undefined;
      let signalAuthMint: () => void = () => undefined;
      const authMintStarted = new Promise<void>((resolve) => {
        signalAuthMint = resolve;
      });
      let authPaused = false;
      (bridge.execute as Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && !authPaused) {
            authPaused = true;
            signalAuthMint();
            await new Promise<void>((resolve) => {
              releaseAuth = resolve;
            });
          }
          return await realExecute(call);
        },
      );

      provider.subscribeToOrders({ callback: vi.fn() });
      await authMintStarted;
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(1);
      await provider.disconnect();
      releaseAuth();
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(resetListenerCount()).toBe(0);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(1);
    });

    it('ignores a WebSocket open that arrives after disconnect', async () => {
      StreamFakeWebSocket.instances = [];
      const { provider, calls, resetListenerCount } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      const callback = vi.fn();
      provider.subscribeToPrices({ symbols: [], callback });
      const socket = StreamFakeWebSocket.instances[0];
      await provider.disconnect();

      socket.open();

      expect(resetListenerCount()).toBe(0);
      expect(socket.readyState).toBe(3);
      expect(provider.getWebSocketConnectionState()).toBe('disconnected');
      expect(socket.sent).toStrictEqual([]);
      expect(callback).not.toHaveBeenCalled();
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(0);
    });

    it('does not repopulate the market cache when initialization resolves after disconnect', async () => {
      const { provider, clientInstance } = buildProvider();
      let resolveMarkets: (value: unknown) => void = () => undefined;
      let signalMarketRead: () => void = () => undefined;
      const marketReadStarted = new Promise<void>((resolve) => {
        signalMarketRead = resolve;
      });
      clientInstance.getOrderBooks.mockImplementationOnce(() => {
        signalMarketRead();
        return new Promise((resolve) => {
          resolveMarkets = resolve;
        });
      });
      const pendingInitialize = provider.initialize();
      await marketReadStarted;
      await provider.disconnect();

      resolveMarkets([BTC_MARKET]);
      expect(await pendingInitialize).toStrictEqual({
        success: false,
        error: 'Lighter provider is disconnected',
      });
      expect(
        await provider.fetchHistoricalCandles({
          symbol: 'BTC',
          interval: '1h',
        }),
      ).toStrictEqual({ symbol: 'BTC', interval: '1h', candles: [] });
      expect(clientInstance.getOrderBooks).toHaveBeenCalledTimes(2);
      expect(clientInstance.getCandles).not.toHaveBeenCalled();
    });

    it('does not repopulate margin metadata when a fetch resolves after disconnect', async () => {
      const { provider, clientInstance } = buildProvider();
      let resolveMargins: (value: unknown) => void = () => undefined;
      let signalMarginRead: () => void = () => undefined;
      const marginReadStarted = new Promise<void>((resolve) => {
        signalMarginRead = resolve;
      });
      clientInstance.getOrderBookDetails
        .mockImplementationOnce(() => {
          signalMarginRead();
          return new Promise((resolve) => {
            resolveMargins = resolve;
          });
        })
        .mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              symbol: 'BTC',
              lastTradePrice: 100000,
              minInitialMarginFraction: 400,
              maintenanceMarginFraction: 240,
            },
          ],
        });
      const pendingLeverage = provider.getMaxLeverage('BTC');
      await marginReadStarted;
      await provider.disconnect();

      resolveMargins({
        code: 200,
        orderBookDetails: [
          {
            symbol: 'BTC',
            lastTradePrice: 100000,
            minInitialMarginFraction: 400,
            maintenanceMarginFraction: 240,
          },
        ],
      });
      await expect(pendingLeverage).rejects.toThrow(
        'margin metadata unavailable',
      );
      await expect(provider.getMaxLeverage('BTC')).rejects.toThrow(
        'margin metadata unavailable',
      );
      expect(clientInstance.getOrderBookDetails).toHaveBeenCalledTimes(2);
    });

    it('does not revive candle state or callbacks when history resolves after disconnect', async () => {
      StreamFakeWebSocket.instances = [];
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      let resolveCandles: (value: unknown) => void = () => undefined;
      let signalCandleRead: () => void = () => undefined;
      const candleReadStarted = new Promise<void>((resolve) => {
        signalCandleRead = resolve;
      });
      clientInstance.getCandles
        .mockImplementationOnce(() => {
          signalCandleRead();
          return new Promise((resolve) => {
            resolveCandles = resolve;
          });
        })
        .mockResolvedValue({ code: 200, c: [] });
      const callback = vi.fn();
      provider.subscribeToCandles({
        symbol: 'BTC',
        interval: '1h',
        callback,
      });
      await candleReadStarted;
      await provider.disconnect();

      resolveCandles({
        code: 200,
        c: [{ t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }],
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(callback).not.toHaveBeenCalled();
      expect(StreamFakeWebSocket.instances).toHaveLength(0);
      const lateCallback = vi.fn();
      provider.subscribeToCandles({
        symbol: 'BTC',
        interval: '1h',
        callback: lateCallback,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      expect(lateCallback).not.toHaveBeenCalled();
      expect(clientInstance.getCandles).toHaveBeenCalledTimes(1);
    });

    it('does not resume delayed order-book subscription setup after disconnect', async () => {
      StreamFakeWebSocket.instances = [];
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      let rejectMarkets: (error: Error) => void = () => undefined;
      let signalMarketRead: () => void = () => undefined;
      const marketReadStarted = new Promise<void>((resolve) => {
        signalMarketRead = resolve;
      });
      clientInstance.getOrderBooks.mockImplementationOnce(() => {
        signalMarketRead();
        return new Promise((_resolve, reject) => {
          rejectMarkets = reject;
        });
      });
      const callback = vi.fn();
      const onError = vi.fn();
      provider.subscribeToOrderBook({ symbol: 'BTC', callback, onError });
      await marketReadStarted;
      await provider.disconnect();

      rejectMarkets(new Error('late market lookup failure'));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(callback).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
      expect(StreamFakeWebSocket.instances).toHaveLength(0);
    });

    it('does not repopulate price replay state when a poll resolves after disconnect', async () => {
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: null,
      });
      let resolvePrices: (value: unknown) => void = () => undefined;
      let signalPriceRead: () => void = () => undefined;
      const priceReadStarted = new Promise<void>((resolve) => {
        signalPriceRead = resolve;
      });
      clientInstance.getOrderBookDetails.mockImplementationOnce(() => {
        signalPriceRead();
        return new Promise((resolve) => {
          resolvePrices = resolve;
        });
      });
      const callback = vi.fn();
      provider.subscribeToPrices({ symbols: [], callback });
      await priceReadStarted;
      await provider.disconnect();

      resolvePrices({
        code: 200,
        orderBookDetails: [{ ...BTC_MARKET, lastTradePrice: 12345 }],
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(callback).not.toHaveBeenCalled();
      const lateCallback = vi.fn();
      provider.subscribeToPrices({ symbols: [], callback: lateCallback });
      expect(lateCallback).not.toHaveBeenCalled();
      expect(provider.getWebSocketConnectionState()).toBe('disconnected');
      expect(clientInstance.getOrderBookDetails).toHaveBeenCalledTimes(1);
    });

    it('refuses toggleTestnet', async () => {
      const { provider } = buildProvider();
      const result = await provider.toggleTestnet();
      expect(result.success).toBe(false);
      expect(result.isTestnet).toBe(true);
    });

    it('pings via the markets endpoint', async () => {
      const { provider, clientInstance } = buildProvider();
      await provider.ping();
      expect(clientInstance.getOrderBooks).toHaveBeenCalled();
    });
  });

  describe('isReadyToTrade', () => {
    it('reports not ready without a signer bridge', async () => {
      const { provider } = buildProvider({ withBridge: false });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(false);
      expect(result.error).toContain('signer bridge');
    });

    it('queries all API-key slots and registers the venue key when the configured slot is missing', async () => {
      const { provider, clientInstance, calls, bridge } = buildProvider();
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      // A direct lookup of an unused slot returns venue error 21109
      // (`api key not found`); querying all slots returns an empty list.
      expect(clientInstance.getApiKeys).toHaveBeenCalledWith(28);
      expect(bridge.createClient).toHaveBeenCalledWith({
        chainId: 300,
        accountIndex: 28,
        nonce: 42,
        apiKeyIndex: 7,
        walletAddress: ACCOUNT.l1Address.toLowerCase(),
      });
      const callNames = calls.map((call) => call.function);
      expect(callNames).toContain('_createClient');
      expect(callNames).toContain('_signChangePubKey');
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        8,
        expect.stringContaining('"changePubKey":true'),
      );
    });

    it('mainnet signer setup registers the venue key exactly like testnet (rollout gate removed)', async () => {
      // Mainnet trading is enabled: the ceremony is identical to testnet —
      // client creation, ChangePubKey signing, and dispatch all proceed.
      const { provider, calls, clientInstance } = buildProvider({
        isTestnet: false,
      });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      const callNames = calls.map((call) => call.function);
      expect(callNames).toContain('_createClient');
      expect(callNames).toContain('_signChangePubKey');
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        8,
        expect.stringContaining('"changePubKey":true'),
      );
    });

    it('mainnet AUTHENTICATED reads work when the venue key is already registered (no dispatch needed)', async () => {
      const { provider, calls, clientInstance } = buildProvider({
        isTestnet: false,
        registeredKey: '9c'.repeat(40),
      });
      const orders = await provider.getOpenOrders();
      expect(orders.length).toBeGreaterThan(0);
      expect(calls.map((call) => call.function)).toContain('_createAuthToken');
      // Nothing was dispatched to the venue.
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('skips registration when the venue key is already registered', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        registeredKey: '9c'.repeat(40),
      });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      expect(calls.map((call) => call.function)).not.toContain(
        '_signChangePubKey',
      );
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('fails closed when the venue-key lookup fails', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getApiKeys.mockRejectedValue(new Error('temporary 503'));

      const result = await provider.isReadyToTrade();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('temporary 503');
      expect(calls.map((call) => call.function)).not.toContain(
        '_signChangePubKey',
      );
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('refuses to replace a different key already registered in the configured slot', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        registeredKey: 'ab'.repeat(40),
      });

      const result = await provider.isReadyToTrade();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('supports device-key recovery');
      expect(calls.map((call) => call.function)).not.toContain(
        '_signChangePubKey',
      );
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });
  });

  describe('market reads', () => {
    it('returns adapted markets', async () => {
      const { provider } = buildProvider();
      const markets = await provider.getMarkets();
      expect(markets).toHaveLength(1);
      expect(markets[0]).toMatchObject({ name: 'BTC', providerId: 'lighter' });
    });

    it('returns empty markets on API failure', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(new Error('down'));
      expect(await provider.getMarkets()).toStrictEqual([]);
    });

    it('surfaces malformed venue market data instead of reporting no markets', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(
        new Error('Invalid Lighter venue data: malformed market'),
      );
      await expect(provider.getMarkets()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('returns adapted market data with prices', async () => {
      const { provider } = buildProvider();
      const data = await provider.getMarketDataWithPrices();
      expect(data).toHaveLength(1);
      expect(data[0].symbol).toBe('BTC');
    });

    it('omits inactive markets without usable risk metadata while preserving active markets', async () => {
      const built = buildProvider();
      const inactiveMarket = {
        ...BTC_MARKET,
        symbol: 'MKR',
        marketId: 28,
        status: 'inactive',
        minBaseAmount: '0.0000',
        minQuoteAmount: '0.000000',
      };
      const activeDetail = {
        ...BTC_MARKET,
        lastTradePrice: 100000,
        dailyTradesCount: 10,
        dailyBaseTokenVolume: 1,
        dailyQuoteTokenVolume: 100000,
        dailyPriceLow: 99000,
        dailyPriceHigh: 101000,
        dailyPriceChange: 1,
        openInterest: 1000000,
        dailyChart: {},
        minInitialMarginFraction: 200,
        maintenanceMarginFraction: 120,
      };
      built.clientInstance.getOrderBooks.mockResolvedValue([
        BTC_MARKET,
        inactiveMarket,
      ]);
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          activeDetail,
          {
            ...activeDetail,
            ...inactiveMarket,
            defaultInitialMarginFraction: 0,
            minInitialMarginFraction: 0,
            maintenanceMarginFraction: 0,
          },
        ],
      });

      const markets = await built.provider.getMarkets();
      const marketData = await built.provider.getMarketDataWithPrices();

      expect(markets.map((market) => market.name)).toStrictEqual(['BTC']);
      expect(marketData.map((market) => market.symbol)).toStrictEqual(['BTC']);
    });

    it('preserves inactive markets when their risk metadata remains usable', async () => {
      const built = buildProvider();
      const inactiveMarket = {
        ...BTC_MARKET,
        symbol: 'MKR',
        marketId: 28,
        status: 'inactive',
      };
      built.clientInstance.getOrderBooks.mockResolvedValue([inactiveMarket]);
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...inactiveMarket,
            lastTradePrice: 2500,
            dailyTradesCount: 0,
            dailyBaseTokenVolume: 0,
            dailyQuoteTokenVolume: 0,
            dailyPriceLow: 2500,
            dailyPriceHigh: 2500,
            dailyPriceChange: 0,
            openInterest: 0,
            dailyChart: {},
            minInitialMarginFraction: 500,
            maintenanceMarginFraction: 250,
          },
        ],
      });

      const markets = await built.provider.getMarkets();
      const marketData = await built.provider.getMarketDataWithPrices();

      expect(markets).toHaveLength(1);
      expect(markets[0]).toMatchObject({
        name: 'MKR',
        isDelisted: true,
        maxLeverage: 20,
      });
      expect(marketData.map((market) => market.symbol)).toStrictEqual(['MKR']);
    });

    it('continues to reject zero risk metadata for active markets', async () => {
      const built = buildProvider();
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 100000,
            dailyTradesCount: 10,
            dailyBaseTokenVolume: 1,
            dailyQuoteTokenVolume: 100000,
            dailyPriceLow: 99000,
            dailyPriceHigh: 101000,
            dailyPriceChange: 1,
            openInterest: 1000000,
            dailyChart: {},
            defaultInitialMarginFraction: 0,
            minInitialMarginFraction: 0,
            maintenanceMarginFraction: 0,
          },
        ],
      });

      await expect(built.provider.getMarkets()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
      await expect(built.provider.getMarketDataWithPrices()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('does not publish market metadata without verified per-market leverage', async () => {
      const markets = buildProvider();
      markets.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 100000 }],
      });
      await expect(markets.provider.getMarkets()).rejects.toThrow(
        'Invalid Lighter venue data',
      );

      const marketData = buildProvider();
      marketData.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 100000,
            dailyPriceChange: 1,
          },
        ],
      });
      await expect(
        marketData.provider.getMarketDataWithPrices(),
      ).rejects.toThrow('Invalid Lighter venue data');
    });

    it('rejects margin fractions that would derive leverage below 1x', async () => {
      const built = buildProvider();
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 100000,
            minInitialMarginFraction: 10001,
            maintenanceMarginFraction: 10001,
          },
        ],
      });
      await expect(built.provider.getMarkets()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
      await expect(built.provider.getPositions()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it.each([Number.MIN_VALUE, 1.5])(
      'rejects non-integer margin fraction %p through market and position reads',
      async (marginFraction) => {
        const built = buildProvider();
        built.clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              ...BTC_MARKET,
              lastTradePrice: 100000,
              minInitialMarginFraction: marginFraction,
              maintenanceMarginFraction: marginFraction,
            },
          ],
        });
        await expect(built.provider.getMarkets()).rejects.toThrow(
          'Invalid Lighter venue data',
        );
        await expect(built.provider.getPositions()).rejects.toThrow(
          'Invalid Lighter venue data',
        );
      },
    );

    it('surfaces malformed successful order-book details instead of reporting no market data', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('Invalid Lighter venue data: malformed order-book details'),
      );
      await expect(provider.getMarketDataWithPrices()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });
  });

  describe('account reads', () => {
    it('returns adapted positions', async () => {
      const { provider } = buildProvider();
      const positions = await provider.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'BTC',
        size: '0.1',
        providerId: 'lighter',
      });
    });

    it('preserves retired-market positions when risk metadata is zeroed', async () => {
      const built = buildProvider();
      const inactiveMarket = {
        ...BTC_MARKET,
        symbol: 'MKR',
        marketId: 28,
        status: 'inactive',
        minBaseAmount: '0.0000',
        minQuoteAmount: '0.000000',
      };
      built.clientInstance.getOrderBooks.mockResolvedValue([
        BTC_MARKET,
        inactiveMarket,
      ]);
      built.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            ...BTC_MARKET,
            lastTradePrice: 100000,
            minInitialMarginFraction: 200,
            maintenanceMarginFraction: 120,
          },
          {
            ...inactiveMarket,
            lastTradePrice: 0,
            minInitialMarginFraction: 0,
            maintenanceMarginFraction: 0,
          },
        ],
      });
      built.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [
              ...(ACCOUNT.positions ?? []),
              {
                ...ACCOUNT.positions?.[0],
                marketId: 28,
                symbol: 'MKR',
                initialMarginFraction: '10',
              },
            ],
          },
        ],
      });
      await built.provider.initialize();

      const positions = await built.provider.getPositions();

      expect(positions).toStrictEqual([
        expect.objectContaining({ symbol: 'BTC', maxLeverage: 50 }),
        expect.objectContaining({
          symbol: 'MKR',
          leverage: expect.objectContaining({ value: 10 }) as { value: number },
          maxLeverage: 10,
        }),
      ]);
    });

    it('surfaces margin metadata transport failures from position reads', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('margin metadata unavailable'),
      );
      await expect(provider.getPositions()).rejects.toThrow(
        'margin metadata unavailable',
      );
      expect(clientInstance.getAccountByIndex).not.toHaveBeenCalled();
    });

    it('returns adapted account state', async () => {
      const { provider } = buildProvider();
      const state = await provider.getAccountState();
      expect(state.totalBalance).toBe('10500');
      expect(state.providerId).toBe('lighter');
    });

    it('returns empty account state on failure', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockRejectedValue(new Error('down'));
      const state = await provider.getAccountState();
      expect(state.totalBalance).toBe('0');
    });

    it('attaches the cross margin summary from the account positions', async () => {
      const { provider } = buildProvider();
      const state = await provider.getAccountState();
      // BTC cross: value 10000, 20% initial and 1.2% maintenance fractions.
      expect(state.crossMarginSummary).toStrictEqual({
        accountValue: '10500',
        maintenanceMargin: '120',
        marginUsed: '2000',
        notional: '10000',
      });
    });

    it('does not load market metadata for an account without positions', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, positions: [] }],
      });
      const state = await provider.getAccountState();
      expect(state.crossMarginSummary).toStrictEqual({
        accountValue: '10000',
        maintenanceMargin: '0',
        marginUsed: '0',
        notional: '0',
      });
      expect(clientInstance.getOrderBookDetails).not.toHaveBeenCalled();
    });

    it('keeps the account state without a summary when margin metadata is unavailable', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBookDetails.mockRejectedValue(new Error('down'));
      const state = await provider.getAccountState();
      expect(state.totalBalance).toBe('10500');
      expect(state).not.toHaveProperty('crossMarginSummary');
    });

    it('surfaces a missing maintenance fraction for an open cross position', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], symbol: 'SOL' }],
          },
        ],
      });
      await expect(provider.getAccountState()).rejects.toThrow(
        'maintenance margin metadata unavailable for SOL',
      );
    });

    describe('with throwOnUnavailable', () => {
      it('returns the same state for a healthy read', async () => {
        const { provider } = buildProvider();
        expect(
          await provider.getAccountState({ throwOnUnavailable: true }),
        ).toStrictEqual(await provider.getAccountState());
      });

      it('throws ACCOUNT_STATE_FAILED with the cause instead of zeros', async () => {
        const { provider, clientInstance } = buildProvider();
        const cause = new Error('down');
        clientInstance.getAccountByIndex.mockRejectedValue(cause);
        const read = provider.getAccountState({ throwOnUnavailable: true });
        await expect(read).rejects.toThrow(
          PERPS_ERROR_CODES.ACCOUNT_STATE_FAILED,
        );
        await expect(read).rejects.toHaveProperty('cause', cause);
      });

      it('throws when the venue returns no account for the bound index', async () => {
        const { provider, clientInstance } = buildProvider();
        await provider.getAccountState(); // bind the configured index
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [],
        });
        expect((await provider.getAccountState()).totalBalance).toBe('0');
        await expect(
          provider.getAccountState({ throwOnUnavailable: true }),
        ).rejects.toThrow(PERPS_ERROR_CODES.ACCOUNT_STATE_FAILED);
      });

      it('throws when margin metadata for the summary is unavailable', async () => {
        const { provider, clientInstance } = buildProvider();
        clientInstance.getOrderBookDetails.mockRejectedValue(new Error('down'));
        await expect(
          provider.getAccountState({ throwOnUnavailable: true }),
        ).rejects.toThrow(PERPS_ERROR_CODES.ACCOUNT_STATE_FAILED);
      });

      it('still reads a wallet without a Lighter account as empty', async () => {
        const { provider, clientInstance } = buildProvider({
          configuredAccountIndex: null,
        });
        clientInstance.getAccountsByL1Address.mockResolvedValue({
          code: 200,
          l1Address: ACCOUNT.l1Address,
          subAccounts: [],
        });
        const state = await provider.getAccountState({
          throwOnUnavailable: true,
        });
        expect(state.totalBalance).toBe('0');
      });

      it('surfaces malformed venue numbers unwrapped', async () => {
        const { provider, clientInstance } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [{ ...ACCOUNT, collateral: '10000USD' }],
        });
        await expect(
          provider.getAccountState({ throwOnUnavailable: true }),
        ).rejects.toThrow('Invalid Lighter venue data');
      });
    });

    it('surfaces malformed REST account numbers instead of degrading to empty state', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, collateral: '10000USD' }],
      });

      await expect(provider.getAccountState()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('returns open orders through the auth-token path', async () => {
      const { provider, clientInstance } = buildProvider();
      await provider.initialize();
      const orders = await provider.getOpenOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        orderId: '555',
        symbol: 'BTC',
        side: 'buy',
      });
      expect(clientInstance.getActiveOrders).toHaveBeenCalledWith(
        28,
        'auth-token',
      );
    });

    it('surfaces malformed REST order state instead of returning an empty list', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [
          {
            orderIndex: 555,
            clientOrderIndex: 1,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.001',
            remainingBaseAmount: '0.001',
            price: '90000',
            isAsk: false,
            type: 'limit',
            timeInForce: 'good-till-time',
            reduceOnly: 0,
            status: 'venue-added-state',
            orderExpiry: 0,
            timestamp: 1700000000000,
          },
        ],
      });

      await expect(provider.getOpenOrders()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('builds a CAIP account id from the L1 address', async () => {
      const { provider } = buildProvider();
      expect(await provider.getCurrentAccountId()).toBe(
        'eip155:300:0x8D7f03FdE1A626223364E592740a233b72395235',
      );
    });
  });

  describe('getMarginModeLock', () => {
    it('reports cross when an open position omits its margin mode', async () => {
      const { provider } = buildProvider();

      const lock = await provider.getMarginModeLock({ symbol: 'BTC' });

      expect(lock).toStrictEqual({
        status: 'locked',
        providerId: 'lighter',
        marginMode: 'cross',
        reason: 'position',
      });
    });

    it('reports isolated when the open position is isolated', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], marginMode: 1 }],
          },
        ],
      });

      const lock = await provider.getMarginModeLock({ symbol: 'BTC' });

      expect(lock).toStrictEqual({
        status: 'locked',
        providerId: 'lighter',
        marginMode: 'isolated',
        reason: 'position',
      });
    });

    it.each([
      ['no position row', 'ETH', ACCOUNT.positions],
      [
        'a zero-size position',
        'BTC',
        [{ ...ACCOUNT.positions[0], position: '0' }],
      ],
    ])('reports unlocked for %s', async (_case, symbol, positions) => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, positions }],
      });

      const lock = await provider.getMarginModeLock({ symbol });

      expect(lock).toStrictEqual({ status: 'unlocked', providerId: 'lighter' });
    });

    it.each([
      ['no account', { code: 200, accounts: [] }],
      [
        'no positions array',
        { code: 200, accounts: [{ ...ACCOUNT, positions: undefined }] },
      ],
    ])(
      'reports unavailable when the account response has %s',
      async (_case, response) => {
        const { provider, clientInstance } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue(response);

        const lock = await provider.getMarginModeLock({ symbol: 'BTC' });

        expect(lock).toStrictEqual({
          status: 'unavailable',
          providerId: 'lighter',
          reason: 'provider_unavailable',
        });
      },
    );

    it('reports unavailable when the account read fails', async () => {
      const infra = createMockInfrastructure();
      const logSpy = vi.spyOn(infra.debugLogger, 'log');
      const { provider, clientInstance } = buildProvider({
        platformDependencies: infra,
      });
      clientInstance.getAccountByIndex.mockRejectedValue(new Error('down'));

      const lock = await provider.getMarginModeLock({ symbol: 'BTC' });

      expect(lock).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_unavailable',
      });
      expect(logSpy).toHaveBeenCalledWith(
        '[LighterProvider] getMarginModeLock unavailable',
        { symbol: 'BTC', error: 'down' },
      );
    });
  });

  describe('active spot trigger rejection', () => {
    const spotMarket = {
      ...BTC_MARKET,
      symbol: 'UNI/USDC',
      marketId: 2048,
      marketType: 'spot',
      status: 'active',
    };

    it('withholds native trigger capabilities for active spot metadata', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getOrderBooks.mockResolvedValue([spotMarket]);
      expect(
        await provider.getOrderCapabilities({ symbol: spotMarket.symbol }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'order_market_unsupported',
      });
      expect(calls).toStrictEqual([]);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      await provider.disconnect();
    });

    it.each(['market', 'limit'] as const)(
      'integration refuses attached %s protection on active spot metadata before setup',
      async (orderType) => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getOrderBooks.mockResolvedValue([spotMarket]);
        const params: OrderParams = {
          symbol: spotMarket.symbol,
          isBuy: true,
          size: '0.001',
          orderType,
          ...(orderType === 'limit' ? { price: '95100' } : {}),
          takeProfitPrice: '110000',
        };
        const validation = await provider.validateOrder(params);
        const placement = await provider.placeOrder(params);
        expect(validation).toMatchObject({
          isValid: false,
          error: expect.stringContaining('active perpetual market') as string,
        });
        expect(placement).toMatchObject({
          success: false,
          error: expect.stringContaining('active perpetual market') as string,
        });
        expect(calls).toStrictEqual([]);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
        await provider.disconnect();
      },
    );

    it('integration rejects spot Scale transport consistently with its unavailable sizing preview', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getOrderBooks.mockResolvedValue([spotMarket]);
      const params: OrderParams = {
        symbol: spotMarket.symbol,
        isBuy: true,
        size: '0.001',
        orderType: 'scale',
        scaleMinPrice: '90000',
        scaleMaxPrice: '100000',
        scaleNumOrders: 2,
      };
      expect(
        await provider.getScalePriceLadder({
          symbol: spotMarket.symbol,
          minPrice: 90000,
          maxPrice: 100000,
          count: 2,
        }),
      ).toMatchObject({ status: 'unavailable' });
      expect(await provider.validateOrder(params)).toMatchObject({
        isValid: false,
        error: expect.stringContaining('active perpetual market') as string,
      });
      expect(await provider.placeOrder(params)).toMatchObject({
        success: false,
        error: expect.stringContaining('active perpetual market') as string,
      });
      expect(calls).toStrictEqual([]);
      expect(clientInstance.getAccountByIndex).not.toHaveBeenCalled();
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      await provider.disconnect();
    });

    describe.each([
      'stop_market',
      'stop_limit',
      'take_profit_market',
      'take_profit_limit',
    ] as const)('%s', (orderType) => {
      const params: OrderParams = {
        symbol: spotMarket.symbol,
        isBuy: true,
        size: '0.001',
        orderType,
        triggerPrice: '95000',
        price: '95100',
      };

      it('rejects validation before signer setup for active spot metadata', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getOrderBooks.mockResolvedValue([spotMarket]);
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              ...spotMarket,
              lastTradePrice: 100000,
              minInitialMarginFraction: 200,
              maintenanceMarginFraction: 120,
            },
          ],
        });
        const validation = await provider.validateOrder(params);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('active perpetual market');
        expect(calls).toStrictEqual([]);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
        await provider.disconnect();
      });

      it('rejects placement before signer setup for active spot metadata', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getOrderBooks.mockResolvedValue([spotMarket]);
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              ...spotMarket,
              lastTradePrice: 100000,
              minInitialMarginFraction: 200,
              maintenanceMarginFraction: 120,
            },
          ],
        });
        const result = await provider.placeOrder(params);
        expect(result.success).toBe(false);
        expect(result.error).toContain('active perpetual market');
        expect(calls).toStrictEqual([]);
        expect(clientInstance.sendTx).not.toHaveBeenCalled();
        await provider.disconnect();
      });
    });
  });

  describe('standalone trigger orders', () => {
    describe.each([
      ['stop_market', 2, false],
      ['stop_limit', 3, true],
      ['take_profit_market', 4, false],
      ['take_profit_limit', 5, true],
    ] as const)('%s', (orderType, wireType, isLimit) => {
      it.each([
        [true, false],
        [false, false],
        [true, true],
        [false, true],
      ])(
        'preserves buy=%s and reduceOnly=%s in the native wire intent',
        async (isBuy, reduceOnly) => {
          const { provider, calls } = buildProvider();
          const params: OrderParams = {
            symbol: 'BTC',
            isBuy,
            reduceOnly,
            size: '0.001',
            orderType,
            triggerPrice: '95000',
            maxSlippageBps: 100,
            ...(isLimit && { price: '95100' }),
          };

          const validation = await provider.validateOrder(params);
          const result = await provider.placeOrder(params);

          expect(validation).toStrictEqual({ isValid: true });
          expect(result.success).toBe(true);
          const orderCall = calls.find(
            (call) => call.function === '_signCreateOrder',
          );
          const marketExecutionPrice = isBuy ? '959500' : '940500';
          expect(orderCall?.params.slice(3, 11)).toStrictEqual([
            '100',
            isLimit ? '951000' : marketExecutionPrice,
            isBuy ? 0 : 1,
            wireType,
            isLimit ? 1 : 0,
            reduceOnly ? 1 : 0,
            '950000',
            -1,
          ]);
        },
      );
    });

    it.each([
      undefined,
      '',
      '0',
      '-1',
      'NaN',
      'Infinity',
      '90000USD',
      '0.01',
      '0.11',
      '429496729.6',
    ])(
      'rejects unrepresentable trigger price %s before signer setup',
      async (triggerPrice) => {
        const { provider, calls } = buildProvider();
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'stop_market',
          triggerPrice,
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation.isValid).toBe(false);
        expect(result.success).toBe(false);
        expect(result.error).toBe(validation.error);
        expect(calls).toHaveLength(0);
      },
    );

    it.each(['stop_limit', 'take_profit_limit'] as const)(
      'rejects missing %s execution price before signer setup',
      async (orderType) => {
        const { provider, calls } = buildProvider();
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType,
          triggerPrice: '95000',
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation.isValid).toBe(false);
        expect(result.error).toBe(validation.error);
        expect(calls).toHaveLength(0);
      },
    );

    it.each([NaN, Infinity, -1, 10000])(
      'rejects trigger-market slippage %s before signer setup',
      async (maxSlippageBps) => {
        const { provider, calls } = buildProvider();
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'stop_market',
          triggerPrice: '95000',
          maxSlippageBps,
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation.isValid).toBe(false);
        expect(result.error).toBe(validation.error);
        expect(calls).toHaveLength(0);
      },
    );

    it('reports native triggers, durable Scale and pending attached lifecycle verification for a known active market', async () => {
      const { provider, calls } = buildProvider();

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'BTC',
      });

      expect(capabilities).toStrictEqual({
        status: 'ready',
        providerId: 'lighter',
        supportedStrategies: ['scale'],
        supportedMarginModes: ['cross', 'isolated'],
        attachedTpsl: {
          submission: 'native-oto-otoco',
          childCoverage: 'venue-native-zero-size',
          partialSizes: false,
          lifecycleVerification: 'pending',
          cancellation: 'explicit-exact-owned-orders',
        },
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_market',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'position-snapshot',
          partialCoverage: {
            single: true,
            pair: 'equal-quantity-oco',
            supportedPairs: ['equal-quantity-oco', 'independent'],
            replacement: 'cancel-before-create',
            recovery: 'explicit-current-position-intent',
          },
        },
        supportedTriggerOrderTypes: [
          'stop_market',
          'stop_limit',
          'take_profit_market',
          'take_profit_limit',
        ],
      });
      expect(calls).toHaveLength(0);
    });

    it('refreshes cached capability metadata before approving an inactive market', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      expect(
        (await provider.getOrderCapabilities({ symbol: 'BTC' })).status,
      ).toBe('ready');
      clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, status: 'inactive' },
      ]);
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'stop_market',
        triggerPrice: '95000',
      };

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'BTC',
      });
      const validation = await provider.validateOrder(params);
      const result = await provider.placeOrder(params);

      expect(capabilities).toMatchObject({
        status: 'unavailable',
        reason: 'order_market_unsupported',
      });
      expect(validation.isValid).toBe(false);
      expect(result.success).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it.each(['', '   '])(
      'refuses the empty capability symbol %j without metadata or signer work',
      async (symbol) => {
        const { provider, clientInstance, calls } = buildProvider();

        const result = await provider.getOrderCapabilities({ symbol });

        expect(result).toStrictEqual({
          status: 'unavailable',
          providerId: 'lighter',
          reason: 'invalid_symbol',
        });
        expect(clientInstance.getOrderBooks).not.toHaveBeenCalled();
        expect(calls).toHaveLength(0);
      },
    );

    it.each(['market', 'limit'] as const)(
      'rejects stray triggerPrice on a basic %s before signer work',
      async (orderType) => {
        const { provider, calls } = buildProvider();
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType,
          price: '95100',
          triggerPrice: '95000',
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation).toStrictEqual({
          isValid: false,
          error: 'ORDER_TRIGGER_PRICE_NOT_SUPPORTED',
        });
        expect(result.error).toBe(validation.error);
        expect(calls).toHaveLength(0);
      },
    );

    it('does not reuse an old active snapshot when native metadata refresh fails', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      expect(
        (await provider.getOrderCapabilities({ symbol: 'BTC' })).status,
      ).toBe('ready');
      clientInstance.getOrderBooks.mockRejectedValue(
        new Error('Venue metadata offline'),
      );
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'stop_market',
        triggerPrice: '95000',
      };

      const capability = await provider.getOrderCapabilities({ symbol: 'BTC' });
      const validation = await provider.validateOrder(params);
      const result = await provider.placeOrder(params);

      expect(capability).toMatchObject({
        status: 'unavailable',
        reason: 'provider_unavailable',
      });
      expect(validation).toStrictEqual({
        isValid: false,
        error: 'Venue metadata offline',
      });
      expect(result.error).toBe(validation.error);
      expect(calls).toHaveLength(0);
    });

    it.each(['GTC', 'IOC', 'ALO'] as const)(
      'rejects a caller-selected %s time-in-force on a standalone trigger',
      async (timeInForce) => {
        const { provider, calls } = buildProvider();
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'stop_limit',
          price: '95100',
          triggerPrice: '95000',
          timeInForce,
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation).toStrictEqual({
          isValid: false,
          error: 'ORDER_TIME_IN_FORCE_NOT_SUPPORTED',
        });
        expect(result.error).toBe(validation.error);
        expect(calls).toHaveLength(0);
      },
    );

    it.each([
      { takeProfitPrice: '' },
      { stopLossPrice: '90000' },
      { takeProfitSize: '0.001' },
      { tpslLinkage: 'position' as const },
      { twapDuration: 5 },
    ])('rejects extra trigger intent %j before signer setup', async (extra) => {
      const { provider, calls } = buildProvider();
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'stop_market',
        triggerPrice: '95000',
        ...extra,
      };

      const validation = await provider.validateOrder(params);
      const result = await provider.placeOrder(params);

      expect(validation.isValid).toBe(false);
      expect(result.error).toBe(validation.error);
      expect(calls).toHaveLength(0);
    });

    it('sizes a trigger-market USD order at its trigger without a live-price slippage check', async () => {
      const { provider, calls } = buildProvider();
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: 'NaN',
        usdAmount: '95',
        orderType: 'stop_market',
        triggerPrice: '95000',
        maxSlippageBps: 100,
        priceAtCalculation: 100000,
      };

      const validation = await provider.validateOrder(params);
      const result = await provider.placeOrder(params);

      expect(validation).toStrictEqual({ isValid: true });
      expect(result.success).toBe(true);
      expect(
        calls.find((call) => call.function === '_signCreateOrder')?.params[3],
      ).toBe('100');
    });

    it('enforces the maker minimum for a trigger limit before signer setup', async () => {
      const { provider, calls } = buildProvider();
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.0001',
        orderType: 'stop_limit',
        triggerPrice: '95000',
        price: '95100',
      };

      const validation = await provider.validateOrder(params);
      const result = await provider.placeOrder(params);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('below the Lighter minimum');
      expect(result.error).toBe(validation.error);
      expect(calls).toHaveLength(0);
    });

    it.each(['stop_limit', 'take_profit_limit'] as const)(
      'never enlarges a below-minimum %s even when it currently closes the full position',
      async (orderType) => {
        const { provider, calls, clientInstance } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: '0.0001' }],
            },
          ],
        });
        const params: OrderParams = {
          symbol: 'BTC',
          isBuy: false,
          size: '0.0001',
          orderType,
          triggerPrice: '95000',
          price: '95100',
          reduceOnly: true,
          isFullClose: true,
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('below the Lighter minimum');
        expect(result.error).toBe(validation.error);
        expect(calls).toHaveLength(0);
      },
    );

    it('reports metadata read failures as unavailable capabilities', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(
        new Error('Venue offline'),
      );

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'BTC',
      });

      expect(capabilities).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_unavailable',
      });
      expect(calls).toHaveLength(0);
    });

    it('refuses native trigger placement on an inactive market', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, status: 'inactive' },
      ]);
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'stop_market',
        triggerPrice: '95000',
      };

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'BTC',
      });
      const validation = await provider.validateOrder(params);
      const result = await provider.placeOrder(params);

      expect(capabilities).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'order_market_unsupported',
      });
      expect(validation.isValid).toBe(false);
      expect(result.error).toBe(validation.error);
      expect(calls).toHaveLength(0);
    });

    it('aborts a trigger intent after the wallet changes during metadata preflight', async () => {
      const { provider, clientInstance, calls, getUserAddressMock } =
        buildProvider();
      let releaseMetadata = (): void => undefined;
      const metadataGate = new Promise<void>((resolve) => {
        releaseMetadata = resolve;
      });
      clientInstance.getOrderBooks.mockImplementation(async () => {
        await metadataGate;
        return [BTC_MARKET];
      });
      const placement = provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'stop_market',
        triggerPrice: '95000',
      });
      expect(clientInstance.getOrderBooks).toHaveBeenCalled();

      getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releaseMetadata();
      const result = await placement;

      expect(result.success).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it('returns unavailable capabilities after provider teardown', async () => {
      const { provider } = buildProvider();
      await provider.initialize();

      await provider.disconnect();
      const capabilities = await provider.getOrderCapabilities({
        symbol: 'BTC',
      });

      expect(capabilities).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_unavailable',
      });
    });

    it('fences capabilities when disconnect occurs after metadata resolves', async () => {
      const { provider } = buildProvider();
      const initialize = provider.initialize.bind(provider);
      vi.spyOn(provider, 'initialize').mockImplementation(async () => {
        const result = await initialize();
        // Queue teardown between #ensureMarkets resolution and its caller.
        queueMicrotask(() => {
          provider.disconnect().catch(() => undefined);
        });
        return result;
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'BTC' }),
      ).toMatchObject({
        status: 'unavailable',
        reason: 'provider_unavailable',
      });
    });

    it('returns unavailable capabilities for a missing market', async () => {
      const { provider, calls } = buildProvider();

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'NOPE',
      });

      expect(capabilities).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'market_not_found',
      });
      expect(calls).toHaveLength(0);
    });
  });

  describe('placeOrder', () => {
    it.each(['invalid', ''] as const)(
      'rejects malformed explicit mode %s before signing',
      async (marginMode) => {
        const deps = createMockInfrastructure();
        const { provider, calls } = buildProvider({
          platformDependencies: deps,
        });
        const logError = getLoggerErrorMock(deps);
        const params = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit' as const,
          price: '90000',
          leverage: 5,
          marginMode: marginMode as OrderParams['marginMode'],
        };

        const validation = await provider.validateOrder(params);
        const result = await provider.placeOrder(params);

        expect(validation).toStrictEqual({
          isValid: false,
          error: 'ORDER_MARGIN_MODE_INVALID',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBe('ORDER_MARGIN_MODE_INVALID');
        expect(calls).toHaveLength(0);
        expect(logError).not.toHaveBeenCalled();
      },
    );

    it('signs and submits a limit order with integerized values', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('lighter');
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall).toBeDefined();
      const [accountIndex, marketId, , baseAmount, price, isAsk] =
        orderCall?.params ?? [];
      expect(accountIndex).toBe(28);
      expect(marketId).toBe(1);
      // 0.001 BTC @ 5 size decimals = 100; but the $10 minimum at $90k
      // requires 0.00020 BTC = 20 -> requested size wins (100 > 20).
      expect(baseAmount).toBe('100');
      expect(price).toBe('900000');
      expect(isAsk).toBe(0);
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        14,
        expect.stringContaining('"createOrder":true'),
      );
    });

    it('reports an underlying venue failure once with the raw message and bounded tags', async () => {
      const deps = createMockInfrastructure();
      const { provider, clientInstance } = buildProvider({
        platformDependencies: deps,
      });
      const logError = getLoggerErrorMock(deps);
      clientInstance.sendTx.mockRejectedValueOnce(
        new Error('Lighter venue unavailable'),
      );

      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });

      expect(result).toMatchObject({
        success: false,
        error: 'Lighter venue unavailable',
      });
      expect(logError).toHaveBeenCalledTimes(1);
      const [[reportedError, reportedOptions]] = logError.mock.calls;
      if (!reportedOptions) {
        throw new Error('Expected Lighter place-order error context');
      }
      expect(reportedError.message).toBe('Lighter venue unavailable');
      expect(reportedOptions.tags).toMatchObject({
        feature: 'perps',
        provider: 'LighterProvider',
        network: 'testnet',
        operation: 'order_management',
        action: 'place_order',
      });
      expect(reportedOptions.context?.name).toBe('LighterProvider.placeOrder');
      expect(reportedOptions.context?.data).toMatchObject({
        method: 'placeOrder',
        symbol: 'BTC',
      });
    });

    it('does not report a retryable keyring failure', async () => {
      const deps = createMockInfrastructure();
      const { provider, clientInstance } = buildProvider({
        platformDependencies: deps,
      });
      const logError = getLoggerErrorMock(deps);
      clientInstance.sendTx.mockRejectedValueOnce(
        new Error(PERPS_ERROR_CODES.KEYRING_LOCKED),
      );

      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(logError).not.toHaveBeenCalled();
    });

    it('does not report an unsupported explicit margin mode as a provider failure', async () => {
      const deps = createMockInfrastructure();
      const { provider, clientInstance } = buildProvider({
        platformDependencies: deps,
      });
      const logError = getLoggerErrorMock(deps);
      clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, status: 'inactive' },
      ]);

      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 5,
        marginMode: 'isolated',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_UNSUPPORTED,
      });
      expect(logError).not.toHaveBeenCalled();
    });

    it.each(['api-error', 'empty-response'] as const)(
      'does not report an address-bearing account-not-found %s',
      async (response) => {
        const deps = createMockInfrastructure();
        const { provider, clientInstance } = buildProvider({
          configuredAccountIndex: null,
          registeredKey: '9c'.repeat(40),
          platformDependencies: deps,
        });
        const logError = getLoggerErrorMock(deps);
        if (response === 'api-error') {
          clientInstance.getAccountsByL1Address.mockRejectedValue(
            new LighterApiError('account not found', 21100),
          );
        } else {
          clientInstance.getAccountsByL1Address.mockResolvedValue({
            code: 200,
            l1Address: ACCOUNT.l1Address,
            subAccounts: [],
          });
        }

        const result = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No Lighter account exists');
        expect(logError).not.toHaveBeenCalled();
      },
    );

    it('does not claim or send an isolated-margin update when leverage is omitted', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });

      expect(result.success).toBe(true);
      expect(
        calls.filter((call) => call.function === '_signUpdateLeverage'),
      ).toHaveLength(0);
    });

    it('rejects sizes below the market minimum instead of silently bumping', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
      expect(
        calls.find((call) => call.function === '_signCreateOrder'),
      ).toBeUndefined();
    });

    it('accepts a USD amount whose raw quotient lands a hair under the minimum but grid-snaps onto it', async () => {
      // Regression (found live on device): a $10.15 seed computed from a
      // slightly stale price produced a raw quotient of 0.00529… ETH against
      // a 0.0053 minimum and was rejected — even though wire integerization
      // rounds to the size grid, so the venue would have received the valid
      // minimum step. The pre-check must judge the SNAPPED size.
      const { provider, calls } = buildProvider();
      // 17.9999 / 90000 = 0.00019999988… < 0.0002 raw, snaps to 0.0002 @ 5dp.
      const validation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        usdAmount: '17.9999',
        size: '',
        orderType: 'limit',
        price: '90000',
      });
      expect(validation.isValid).toBe(true);
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        usdAmount: '17.9999',
        size: '',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      const [, , , baseAmount] = orderCall?.params ?? [];
      // 0.0002 BTC @ 5 size decimals — exactly the venue minimum step.
      expect(baseAmount).toBe('20');
    });

    it('rejects non-positive sizes and partial attached TP/SL', async () => {
      const { provider } = buildProvider();
      const negative = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '-1',
        orderType: 'limit',
        price: '90000',
      });
      expect(negative.success).toBe(false);
      expect(negative.error).toContain('positive');

      const withTpsl = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        takeProfitPrice: '100000',
        takeProfitSize: '0.0005',
      });
      expect(withTpsl.success).toBe(false);
      expect(withTpsl.error).toContain('explicit child sizes');
    });

    it('allows a below-maker-minimum market partial close without bumping it', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      expect(
        calls.find((call) => call.function === '_signCreateOrder')?.params[3],
      ).toBe('1');
    });

    it('does not apply maker minimums to a dust market full close', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      // The live position IS the dust amount being closed.
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.00001' }],
          },
        ],
      });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall?.params[3]).toBe('1');
    });

    it('rejects unknown markets', async () => {
      const { provider } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'NOPE',
        isBuy: true,
        size: '1',
        orderType: 'limit',
        price: '1',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown Lighter market');
    });

    it('rejects limit orders without a price', async () => {
      const { provider } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a price');
    });

    describe('explicit Lighter margin selection', () => {
      const request: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
        marginMode: 'cross',
      };

      it('reports both native modes for an active perpetual market', async () => {
        const { provider } = buildProvider();
        expect(
          await provider.getOrderCapabilities({ symbol: 'BTC' }),
        ).toMatchObject({
          supportedMarginModes: ['cross', 'isolated'],
        });
      });

      it.each(['cross', 'isolated'] as const)(
        'validates a flat %s selection without signer calls',
        async (marginMode) => {
          const { provider, clientInstance, calls } = buildProvider();
          clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [{ ...ACCOUNT, positions: [] }],
          });
          expect(
            await provider.validateOrder({ ...request, marginMode }),
          ).toStrictEqual({ isValid: true });
          expect(calls).toHaveLength(0);
        },
      );

      it('refuses changing the authoritative open position mode before signing', async () => {
        const { provider, calls } = buildProvider();
        const result = await provider.placeOrder({
          ...request,
          marginMode: 'isolated',
        });
        expect(result).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_POSITION_OPEN,
        });
        expect(calls).toHaveLength(0);
      });

      it('refuses changing the authoritative resting order mode before signing', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              totalOrderCount: 1,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  position: '0',
                  openOrderCount: 1,
                  marginMode: 1,
                },
              ],
            },
          ],
        });
        expect(await provider.placeOrder(request)).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN,
        });
        expect(calls).toHaveLength(0);
      });

      it('keeps an accepted mode update from placing exposure before exact execution proof', async () => {
        const { provider, calls, clientInstance } = buildProvider({
          registeredKey: '9c'.repeat(40),
        });
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [{ ...ACCOUNT, positions: [] }],
        });
        const result = await provider.placeOrder(request);
        expect(result).toMatchObject({ success: false });
        expect(result.error).toContain('margin mode update remains unresolved');
        expect(
          calls.filter((call) => call.function === '_signUpdateLeverage'),
        ).toHaveLength(1);
        expect(
          calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(0);
      });

      it.each(['cross', 'isolated'] as const)(
        'waits for pending %s mode execution before submitting exposure',
        async (marginMode) => {
          const { provider, clientInstance, calls } = buildProvider({
            registeredKey: '9c'.repeat(40),
          });
          const mode = marginMode === 'cross' ? 0 : 1;
          clientInstance.getAccountByIndex.mockResolvedValue({
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  { ...ACCOUNT.positions[0], position: '0', marginMode: mode },
                ],
              },
            ],
          });
          let reads = 0;
          clientInstance.getTx.mockImplementation(async (hash: string) => {
            reads += 1;
            const call = calls.find(
              (entry) => entry.function === '_signUpdateLeverage',
            );
            return {
              code: 200,
              hash,
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: call?.params.at(-1),
              status: reads === 1 ? 1 : 2,
            };
          });
          expect(
            await provider.placeOrder({ ...request, marginMode }),
          ).toMatchObject({ success: true });
          expect(
            calls.find((call) => call.function === '_signUpdateLeverage')
              ?.params[3],
          ).toBe(mode);
          expect(clientInstance.getTx).toHaveBeenCalledTimes(2);
          expect(clientInstance.sendTx).toHaveBeenCalledTimes(2);
          expect(
            calls.filter((call) => call.function === '_signUpdateLeverage'),
          ).toHaveLength(1);
          expect(
            calls.filter((call) => call.function === '_signCreateOrder'),
          ).toHaveLength(1);
        },
      );

      it('requires selected mode visibility after the exact mode transaction executes', async () => {
        const { provider, clientInstance, calls } = buildProvider({
          registeredKey: '9c'.repeat(40),
        });
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [
                { ...ACCOUNT.positions[0], position: '0', marginMode: 1 },
              ],
            },
          ],
        });
        clientInstance.getTx.mockImplementation(async (hash: string) => {
          const call = calls.find(
            (entry) => entry.function === '_signUpdateLeverage',
          );
          return {
            code: 200,
            hash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: call?.params.at(-1),
            status: 2,
          };
        });
        const result = await provider.placeOrder(request);
        expect(result.success).toBe(false);
        expect(result.error).toContain('selected margin mode');
        expect(
          calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(0);
      });

      it('retires a proven-unsent attached group when the selected mode changes during signing', async () => {
        const built = buildProvider({ registeredKey: '9c'.repeat(40) });
        const account = {
          ...ACCOUNT,
          positions: [{ ...ACCOUNT.positions[0], marginMode: 0 }],
        };
        built.clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [account],
        });
        built.clientInstance.getTx.mockImplementation(async (hash: string) => {
          const call = built.calls.find(
            (entry) => entry.function === '_signUpdateLeverage',
          );
          return {
            code: 200,
            hash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: call?.params.at(-1),
            status: 2,
          };
        });
        const execute = vi.spyOn(built.bridge, 'execute');
        const sign = execute.getMockImplementation();
        if (!sign) {
          throw new Error('Missing signer fixture');
        }
        execute.mockImplementation(async (call: LighterWasmCall) => {
          const result = await sign(call);
          if (call.function === '_signCreateGroupedOrders') {
            account.positions[0].marginMode = 1;
          }
          return result;
        });
        const result = await built.provider.placeOrder({
          ...request,
          takeProfitPrice: '110000',
        });
        expect(result.success).toBe(false);
        expect(built.clientInstance.sendTx).toHaveBeenCalledTimes(1);
        expect(result.attachedOrderGroup).toMatchObject({
          submission: 'canceled',
        });
        expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      });

      it('locks native pending orders even before a child rests', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              pendingOrderCount: 1,
              positions: [
                {
                  ...ACCOUNT.positions[0],
                  position: '0',
                  pendingOrderCount: 1,
                  marginMode: 1,
                },
              ],
            },
          ],
        });
        expect(await provider.placeOrder(request)).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_MARGIN_MODE_ORDER_OPEN,
        });
        expect(calls).toHaveLength(0);
      });

      it('requires explicit leverage rather than inventing the mode update IMF', async () => {
        const { provider, calls } = buildProvider();
        expect(
          await provider.validateOrder({ ...request, leverage: undefined }),
        ).toMatchObject({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_LEVERAGE_INVALID,
        });
        expect(calls).toHaveLength(0);
      });

      it('does not treat unavailable positions as a flat account', async () => {
        const { provider, clientInstance, calls } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [{ ...ACCOUNT, positions: undefined }],
        });
        expect(await provider.placeOrder(request)).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE,
        });
        expect(calls).toHaveLength(0);
      });
    });

    it('opens a FLAT market with ISOLATED margin mode; an existing position keeps its venue mode', async () => {
      // The app manages isolated positions only (no cross-margin UI): a
      // flat market opens isolated — which also makes the venue report a
      // real per-position liquidation price. The venue refuses changing
      // the mode of a market with an open position, so an existing
      // position keeps whatever mode it already has.
      const { provider, clientInstance, bridge } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.000' }],
          },
        ],
      });
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
              txHash: 'eeee999900000002',
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
      // marginMode param: 1 = isolated on a flat market.
      expect(leverageCall.params[3]).toBe(1);
    });

    it('rejects unsupported order types', async () => {
      const { provider } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'twap',
      } as never);
      expect(result.success).toBe(false);
    });

    it('fails without a signer bridge', async () => {
      const { provider } = buildProvider({ withBridge: false });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('signer bridge');
    });
  });

  describe('bounded native TWAP lifecycle probe', () => {
    it('refuses enabling probe transport on mainnet', () => {
      expect(() =>
        buildProvider({ nativeTwapTestnetProbe: true, isTestnet: false }),
      ).toThrow('testnet-only');
    });

    it('rejects missing native TWAP duration before market or account reads', async () => {
      const { provider, calls, clientInstance } = buildProvider({
        nativeTwapTestnetProbe: true,
      });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: true,
        size: '0.00020',
        leverage: 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('duration');
      expect(clientInstance.getOrderBookDetails).not.toHaveBeenCalled();
      expect(clientInstance.getAccountByIndex).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
    });

    it('checks native TWAP minimum notional against the lower protected bound before signing', async () => {
      const { provider, calls, clientInstance } = buildProvider({
        nativeTwapTestnetProbe: true,
      });
      clientInstance.getOrderBooks.mockResolvedValue([
        { ...BTC_MARKET, minQuoteAmount: '18' },
      ]);
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          { ...BTC_MARKET, lastTradePrice: 90000, minQuoteAmount: '18' },
        ],
      });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: false,
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('parent minimums');
      expect(calls).toHaveLength(0);
    });

    it.each([
      { slippage: undefined, priceAtCalculation: undefined },
      { slippage: 0.005, priceAtCalculation: undefined },
      { slippage: 0.01, priceAtCalculation: 90000 },
    ])(
      'prepares fresh native TWAP reference and duration after readiness with slippage %s',
      async ({ slippage, priceAtCalculation }) => {
        let clock = Date.now();
        let reference = 90000;
        const now = vi.spyOn(Date, 'now').mockImplementation(function () {
          return clock;
        });
        const { provider, calls, clientInstance } = buildProvider({
          nativeTwapTestnetProbe: true,
          registeredKey: '9c'.repeat(40),
        });
        clientInstance.getOrderBookDetails.mockImplementation(async () => ({
          code: 200,
          orderBookDetails: [
            {
              ...BTC_MARKET,
              lastTradePrice: reference,
              defaultInitialMarginFraction: 100,
              minInitialMarginFraction: 100,
              maintenanceMarginFraction: 50,
            },
          ],
        }));
        clientInstance.getAccountByIndex.mockImplementation(async () => {
          clock += 20000;
          reference = 88000;
          return {
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: ACCOUNT.positions.map((position) => ({
                  ...position,
                  initialMarginFraction: '100',
                })),
              },
            ],
          };
        });
        try {
          await provider.placeOrder({
            symbol: 'BTC',
            orderType: 'twap',
            isBuy: true,
            size: '0.00020',
            leverage: 1,
            twapDuration: 1,
            ...(slippage === undefined ? {} : { slippage }),
            ...(priceAtCalculation === undefined ? {} : { priceAtCalculation }),
          });
          const native = calls.find(
            (call) => call.function === '_signCreateOrder',
          );
          expect(native?.params[10]).toBe(
            priceAtCalculation === undefined ? clock + 60000 : undefined,
          );
          expect(native?.params[4]).toBe(
            priceAtCalculation === undefined
              ? String(Math.round(88000 * (1 + (slippage ?? 0.01)) * 10))
              : undefined,
          );
        } finally {
          now.mockRestore();
        }
      },
    );

    it('rejects over-budget intent before signer setup', async () => {
      const { provider, calls } = buildProvider({
        nativeTwapTestnetProbe: true,
      });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: true,
        size: '0.001',
        leverage: 1,
        twapDuration: 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('20 USD');
      expect(calls).toHaveLength(0);
    });

    it('retains schedule ownership across disconnect and reads it after restart without financial replay', async () => {
      const disk = new Map<string, string>();
      const dependencies = createMockInfrastructure();
      vi.spyOn(dependencies.diskCache, 'getItem').mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      vi.spyOn(dependencies.diskCache, 'setItem').mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      const first = buildProvider({
        nativeTwapTestnetProbe: true,
        platformDependencies: dependencies,
        registeredKey: '9c'.repeat(40),
      });
      first.clientInstance.getOrderBookDetails.mockResolvedValue({
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
      first.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: ACCOUNT.positions.map((position) => ({
              ...position,
              initialMarginFraction: '100',
            })),
          },
        ],
      });
      await first.provider.placeOrder({
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: true,
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      });
      const before = [...disk.entries()].filter(([key]) =>
        key.startsWith('lighterNativeTwap:'),
      );
      await first.provider.disconnect();
      expect(
        [...disk.entries()].filter(([key]) =>
          key.startsWith('lighterNativeTwap:'),
        ),
      ).toStrictEqual(before);
      const restarted = buildProvider({
        platformDependencies: dependencies,
        registeredKey: '9c'.repeat(40),
      });
      const observations = await restarted.provider.getNativeTwapObservations();
      expect(observations).toHaveLength(1);
      expect(observations[0].record.terminalConfirmed).toBe(false);
      expect(
        restarted.calls.filter(
          (call) =>
            call.function === '_signCreateOrder' ||
            call.function === '_signCancelOrder' ||
            call.function === '_signChangePubKey',
        ),
      ).toHaveLength(0);
    });

    it('requires observed existing 1x leverage before signer setup', async () => {
      const { provider, calls, clientInstance } = buildProvider({
        nativeTwapTestnetProbe: true,
      });
      clientInstance.getOrderBookDetails.mockResolvedValue({
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
      const result = await provider.placeOrder({
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: true,
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('existing 1x');
      expect(calls).toHaveLength(0);
    });

    it('persists the exact schedule before native type6 send and retains unresolved parent visibility', async () => {
      const disk = new Map<string, string>();
      const dependencies = createMockInfrastructure();
      vi.spyOn(dependencies.diskCache, 'getItem').mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      vi.spyOn(dependencies.diskCache, 'setItem').mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      const { provider, calls, clientInstance } = buildProvider({
        nativeTwapTestnetProbe: true,
        platformDependencies: dependencies,
        registeredKey: '9c'.repeat(40),
      });
      clientInstance.getOrderBookDetails.mockResolvedValue({
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
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: ACCOUNT.positions.map((position) => ({
              ...position,
              initialMarginFraction: '100',
            })),
          },
        ],
      });
      const persistedAtSend: boolean[] = [];
      clientInstance.sendTx.mockImplementation(async (kind: number) => {
        if (kind === LIGHTER_TX_TYPE_CREATE_ORDER) {
          persistedAtSend.push(
            [...disk.keys()].some((key) =>
              key.startsWith('lighterNativeTwap:'),
            ),
          );
        }
        return { code: 200, txHash: 'accepted' };
      });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        orderType: 'twap',
        isBuy: true,
        size: '0.00020',
        leverage: 1,
        twapDuration: 1,
      });
      const native = calls.find((call) => call.function === '_signCreateOrder');
      expect(persistedAtSend).toStrictEqual([true]);
      expect(native?.params[6]).toBe(6);
      expect(native?.params[7]).toBe(1);
      expect(native?.params[9]).toBe('0');
      expect(result.success).toBe(false);
      expect(
        [...disk.keys()].some((key) => key.startsWith('lighterNativeTwap:')),
      ).toBe(true);
      const observations = await provider.getNativeTwapObservations();
      expect(observations).toHaveLength(1);
      expect(observations[0].record.terminalConfirmed).toBe(false);
      expect(observations[0].issue).toContain('parent unavailable');
    });
  });

  describe('native TWAP exact-parent provider lifecycle', () => {
    it.each([
      { historyUnavailable: false, trailingFailure: false },
      { historyUnavailable: true, trailingFailure: false },
      { historyUnavailable: false, trailingFailure: true },
    ])(
      'returns the exact parent receipt and cancels with history unavailable=%s without duplicate dispatch',
      async ({ historyUnavailable, trailingFailure }) => {
        const { provider, calls, clientInstance } = buildProvider({
          nativeTwapTestnetProbe: true,
          registeredKey: '9c'.repeat(40),
        });
        clientInstance.getOrderBookDetails.mockResolvedValue({
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
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: ACCOUNT.positions.map((position) => ({
                ...position,
                initialMarginFraction: '100',
              })),
            },
          ],
        });
        let status = 'in-progress';
        const parentRows = (): LighterApiOrder[] => {
          const call = calls.find(
            (entry) => entry.function === '_signCreateOrder',
          );
          if (!call) {
            return [];
          }
          const values = call.params;
          return [
            {
              orderIndex: 9001,
              orderId: '9001',
              clientOrderIndex: values[2],
              clientOrderId: String(values[2]),
              marketIndex: 1,
              ownerAccountIndex: 28,
              initialBaseAmount: '0.00020',
              remainingBaseAmount: '0.00020',
              filledBaseAmount: '0',
              filledQuoteAmount: '0',
              price: String(Number(values[4]) / 10),
              isAsk: false,
              type: 'twap',
              timeInForce: 'good-till-time',
              reduceOnly: false,
              status,
              orderExpiry: values[10],
              timestamp: Math.floor((values[10] - 60_000) / 1000),
              nonce: values[11],
            },
          ];
        };
        clientInstance.getOrdersByClientIds.mockImplementation(async () => ({
          code: 200,
          orders: parentRows(),
        }));
        clientInstance.getActiveOrders.mockImplementation(async () => ({
          code: 200,
          orders: status === 'in-progress' ? parentRows() : [],
        }));
        clientInstance.getInactiveOrders.mockImplementation(async () => ({
          code: 200,
          orders: status === 'canceled' ? parentRows() : [],
        }));
        clientInstance.getTx.mockImplementation(async (hash: string) => ({
          code: 200,
          hash,
          accountIndex: 28,
          apiKeyIndex: 7,
          nonce: hash.startsWith('aaaa') ? 42 : 43,
          status: 2,
        }));
        clientInstance.sendTx.mockImplementation(async (kind: number) => {
          if (kind === LIGHTER_TX_TYPE_CANCEL_ORDER) {
            status = 'canceled';
          }
          return { code: 200, txHash: 'accepted' };
        });
        const placed = await provider.placeOrder({
          symbol: 'BTC',
          orderType: 'twap',
          isBuy: true,
          size: '0.00020',
          leverage: 1,
          twapDuration: 1,
        });
        expect(placed).toMatchObject({ success: true, orderId: '9001' });
        if (historyUnavailable) {
          clientInstance.getInactiveOrders.mockRejectedValue(
            new Error('history unavailable'),
          );
        }
        if (trailingFailure) {
          vi.spyOn(provider, 'getNativeTwapObservations').mockRejectedValueOnce(
            new Error('after cancel read failed'),
          );
        }
        const cancellation = await provider.cancelOrder({
          symbol: 'BTC',
          orderType: 'twap',
          orderId: '9001',
        });
        expect(cancellation.success).toBe(false);
        expect(cancellation.error).toContain(
          trailingFailure
            ? 'observation failed: after cancel read failed'
            : 'termination remains unverified',
        );
        const observations = await provider.getNativeTwapObservations();
        expect(observations[0]).toMatchObject(
          historyUnavailable
            ? { issue: 'history unavailable' }
            : { observation: { terminalObserved: true } },
        );
        expect(observations[0].record.terminalConfirmed).toBe(false);
        const secondCancellation = await provider.cancelOrder({
          symbol: 'BTC',
          orderType: 'twap',
          orderId: '9001',
        });
        expect(secondCancellation).toMatchObject({
          success: false,
          error: 'Lighter TWAP cancellation remains unresolved',
        });
        expect(
          calls.filter((call) => call.function === '_signCancelOrder'),
        ).toHaveLength(1);
        expect(
          calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      },
    );
  });

  describe('native TWAP unavailable lifecycle', () => {
    it('does not report an empty schedule inventory without authoritative reads', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      await expect(provider.getTwapOrders()).rejects.toThrow(
        'TWAP lifecycle is unavailable',
      );
      expect(calls).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('keeps native TWAP absent from advertised strategies', async () => {
      const { provider } = buildProvider();
      const capabilities = await provider.getOrderCapabilities({
        symbol: 'BTC',
      });
      expect(capabilities).toMatchObject({
        status: 'ready',
        supportedStrategies: ['scale'],
      });
    });

    it('rejects native placement before signer setup or submission', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'twap',
        twapDuration: 5,
        twapRandomize: false,
      });
      expect(result.success).toBe(false);
      expect(calls).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('refuses native TWAP cancellation before signer setup or submission', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
        orderType: 'twap',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('TWAP lifecycle is unavailable');
      expect(calls).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('signs and submits a cancel', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      expect(result.success).toBe(true);
      const cancelCall = calls.find(
        (call) => call.function === '_signCancelOrder',
      );
      // Nonce 43: the setup ChangePubKey dispatched with 42 and the
      // session-global reservation never reissues a dispatched nonce.
      expect(cancelCall?.params).toStrictEqual([28, 1, '555', 43]);
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        15,
        expect.stringContaining('"cancelOrder":true'),
      );
    });

    it('rejects unknown markets', async () => {
      const { provider } = buildProvider();
      const result = await provider.cancelOrder({
        orderId: '1',
        symbol: 'NOPE',
      });
      expect(result.success).toBe(false);
    });
  });
});
