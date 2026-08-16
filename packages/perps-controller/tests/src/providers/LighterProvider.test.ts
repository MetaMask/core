import { LighterProvider } from '../../../src/providers/LighterProvider.js';
import { LighterClientService } from '../../../src/services/LighterClientService.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import type {
  LighterSignerBridge,
  LighterWasmCall,
  LighterWebSocketCtor,
  LighterWebSocketLike,
} from '../../../src/types/lighter-types.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

jest.mock('../../../src/services/LighterClientService', () => ({
  ...jest.requireActual('../../../src/services/LighterClientService'),
  // Only the service class is doubled; convertKeysToCamelCase stays real so
  // the WebSocket message router operates on faithfully camelized payloads.
  LighterClientService: jest.fn(),
}));
jest.mock('../../../src/services/LighterWalletService');

const MockedClientService = LighterClientService as jest.MockedClass<
  typeof LighterClientService
>;
const MockedWalletService = LighterWalletService as jest.MockedClass<
  typeof LighterWalletService
>;

const BTC_MARKET = {
  symbol: 'BTC',
  marketId: 1,
  marketType: 'perp',
  status: 'active',
  takerFee: '0.0000',
  makerFee: '0.0000',
  minBaseAmount: '0.00020',
  minQuoteAmount: '10.000000',
  supportedSizeDecimals: 5,
  supportedPriceDecimals: 1,
  supportedQuoteDecimals: 6,
};

const ACCOUNT = {
  code: 0,
  accountType: 0,
  index: 28,
  l1Address: '0x8D7f03FdE1A626223364E592740a233b72395235',
  cancelAllTime: 0,
  totalOrderCount: 0,
  pendingOrderCount: 0,
  status: 1,
  collateral: '10000',
  availableBalance: '9000',
  positions: [
    {
      marketId: 1,
      symbol: 'BTC',
      initialMarginFraction: '20',
      openOrderCount: 0,
      sign: 1,
      position: '0.1',
      avgEntryPrice: '100000',
      positionValue: '10000',
      unrealizedPnl: '500',
      realizedPnl: '0',
      liquidationPrice: '80000',
    },
  ],
};

/**
 * WASM bridge double: replays canned results per function name.
 *
 * @returns Bridge plus the recorded calls.
 */
function createMockBridge(): {
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
} {
  const calls: LighterWasmCall[] = [];
  const bridge: LighterSignerBridge = {
    execute: jest.fn(async <Result>(call: LighterWasmCall): Promise<Result> => {
      calls.push(call);
      switch (call.function) {
        case '_createClient':
          return {
            success: true,
            pk: '9c'.repeat(40),
            prv: '11'.repeat(40),
            pubKeySuccess: true,
            body: 'Register Lighter Account\n\npubkey: 0x9c...\nOnly sign this message for a trusted client!',
          } as Result;
        case '_signChangePubKey':
          return { txInfo: '{"changePubKey":true}' } as Result;
        case '_signCreateOrder':
          return {
            txInfo: '{"createOrder":true}',
            txHash: '0xorderhash',
          } as Result;
        case '_signCancelOrder':
          return {
            txInfo: '{"cancelOrder":true}',
            txHash: '0xcancelhash',
          } as Result;
        case '_createAuthToken':
          return {
            token: 'auth-token',
            deadline: Math.floor(Date.now() / 1000) + 600,
          } as Result;
        default:
          throw new Error(`Unexpected WASM call: ${call.function}`);
      }
    }),
  };
  return { bridge, calls };
}

type MockClientInstance = {
  network: string;
  getOrderBooks: jest.Mock;
  getOrderBookDetails: jest.Mock;
  getAccountsByL1Address: jest.Mock;
  getAccountByIndex: jest.Mock;
  getApiKeys: jest.Mock;
  getNextNonce: jest.Mock;
  getActiveOrders: jest.Mock;
  getInactiveOrders: jest.Mock;
  getDepositHistory: jest.Mock;
  getWithdrawHistory: jest.Mock;
  getTransferHistory: jest.Mock;
  sendTx: jest.Mock;
};

/**
 * Build a provider wired to mocked services and bridge.
 *
 * @param options - Overrides.
 * @param options.withBridge - Attach the mock WASM bridge.
 * @param options.registeredKey - Pubkey the mocked apikeys endpoint reports.
 * @param options.webSocketCtor - Transport override (null = REST polling).
 * @param options.isTestnet - Network the provider targets (defaults to testnet).
 * @param options.configuredAccountIndex - Account index override; null forces resolution via accountsByL1Address.
 * @returns Provider and its collaborators.
 */
function buildProvider(
  options: {
    withBridge?: boolean;
    registeredKey?: string;
    webSocketCtor?: LighterWebSocketCtor | null;
    isTestnet?: boolean;
    /** Pass null to force account resolution through accountsByL1Address. */
    configuredAccountIndex?: number | null;
  } = {},
): {
  provider: LighterProvider;
  clientInstance: MockClientInstance;
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
  getUserAddressMock: jest.Mock;
} {
  const {
    withBridge = true,
    registeredKey,
    webSocketCtor,
    isTestnet = true,
    configuredAccountIndex = 28,
  } = options;
  const clientInstance = {
    network: 'testnet',
    getOrderBooks: jest.fn().mockResolvedValue([BTC_MARKET]),
    getOrderBookDetails: jest.fn().mockResolvedValue({
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
        },
      ],
    }),
    getAccountsByL1Address: jest.fn().mockResolvedValue({
      code: 200,
      l1Address: ACCOUNT.l1Address,
      subAccounts: [ACCOUNT],
    }),
    getAccountByIndex: jest
      .fn()
      .mockResolvedValue({ code: 200, accounts: [ACCOUNT] }),
    getApiKeys: jest.fn().mockResolvedValue({
      code: 200,
      apiKeys: registeredKey
        ? [
            {
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: 1,
              publicKey: registeredKey,
            },
          ]
        : [],
    }),
    getNextNonce: jest.fn().mockResolvedValue({ code: 200, nonce: 42 }),
    getActiveOrders: jest.fn().mockResolvedValue({
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
          status: 'open',
          orderExpiry: 0,
          timestamp: 1700000000000,
        },
      ],
    }),
    getInactiveOrders: jest.fn().mockResolvedValue({
      code: 200,
      orders: [
        {
          orderIndex: 777,
          clientOrderIndex: 2,
          marketIndex: 1,
          ownerAccountIndex: 28,
          initialBaseAmount: '0.002',
          remainingBaseAmount: '0.000',
          price: '95000',
          isAsk: true,
          type: 'market',
          timeInForce: 'immediate-or-cancel',
          reduceOnly: 0,
          status: 'filled',
          orderExpiry: 0,
          timestamp: 1700000001000,
        },
      ],
    }),
    getDepositHistory: jest.fn().mockResolvedValue({
      code: 200,
      deposits: [
        {
          id: '1',
          assetId: 3,
          amount: '10000.000000',
          timestamp: 1700000002000,
          status: 'completed',
          l1TxHash: '0xdep',
        },
      ],
    }),
    getWithdrawHistory: jest.fn().mockResolvedValue({
      code: 200,
      withdraws: [
        {
          id: '2',
          assetId: 3,
          amount: '1.000000',
          timestamp: 1700000003000,
          status: 'claimable',
          type: 'secure',
          l1TxHash: '0xwit',
        },
      ],
    }),
    getTransferHistory: jest.fn().mockResolvedValue({
      code: 200,
      transfers: [
        {
          id: '3',
          assetId: 3,
          amount: '100.000000',
          fee: '0.000000',
          timestamp: 1700000004000,
          type: 'L2TransferOutflow',
          fromL1Address: ACCOUNT.l1Address,
          toL1Address: ACCOUNT.l1Address,
          fromAccountIndex: 28,
          toAccountIndex: 999,
          txHash: '0xtra',
        },
      ],
    }),
    sendTx: jest.fn().mockResolvedValue({ code: 200, txHash: '0xsent' }),
  };
  MockedClientService.mockImplementation(
    () => clientInstance as unknown as LighterClientService,
  );
  const getUserAddressMock = jest
    .fn()
    .mockReturnValue('0x8D7f03FdE1A626223364E592740a233b72395235');
  MockedWalletService.mockImplementation(
    () =>
      ({
        getUserAddress: getUserAddressMock,
        deriveKeySeedPlain: jest.fn().mockResolvedValue('ab'.repeat(32)),
        signPersonalMessage: jest
          .fn()
          .mockResolvedValue(`0x${'cd'.repeat(65)}`),
        network: 'testnet',
      }) as unknown as LighterWalletService,
  );

  const { bridge, calls } = createMockBridge();
  const provider = new LighterProvider({
    isTestnet,
    platformDependencies: createMockInfrastructure(),
    lighterAuthConfig: {
      ...(configuredAccountIndex === null
        ? {}
        : { accountIndex: configuredAccountIndex }),
      apiKeyIndex: 7,
    },
    // Tests default to the REST-polling transport; the WS suite injects a fake.
    webSocketCtor: webSocketCtor ?? null,
    ...(withBridge ? { signerBridge: bridge } : {}),
  });

  return { provider, clientInstance, bridge, calls, getUserAddressMock };
}

/** Module-scope WS fake for suites outside the price-streaming describe. */
class StreamFakeWebSocket implements LighterWebSocketLike {
  static instances: StreamFakeWebSocket[] = [];

  readyState = 0;

  sent: string[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  url: string;

  constructor(url: string) {
    this.url = url;
    StreamFakeWebSocket.instances.push(this);
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
}

const fakeStreamCtor = StreamFakeWebSocket as unknown as LighterWebSocketCtor;

describe('LighterProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      const { provider } = buildProvider();
      expect(await provider.disconnect()).toStrictEqual({
        success: true,
      });
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

    it('sets up the signer and registers the venue key when missing', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      const callNames = calls.map((call) => call.function);
      expect(callNames).toContain('_createClient');
      expect(callNames).toContain('_signChangePubKey');
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        8,
        '{"changePubKey":true}',
      );
    });

    it('sets up the signer on mainnet the same way as testnet', async () => {
      const { provider, calls } = buildProvider({ isTestnet: false });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      expect(calls.map((call) => call.function)).toContain('_createClient');
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

    it('returns adapted market data with prices', async () => {
      const { provider } = buildProvider();
      const data = await provider.getMarketDataWithPrices();
      expect(data).toHaveLength(1);
      expect(data[0].symbol).toBe('BTC');
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

    it('builds a CAIP account id from the L1 address', async () => {
      const { provider } = buildProvider();
      expect(await provider.getCurrentAccountId()).toBe(
        'eip155:300:0x8D7f03FdE1A626223364E592740a233b72395235',
      );
    });
  });

  describe('placeOrder', () => {
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
        '{"createOrder":true}',
      );
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

    it('rejects non-positive sizes and attached TP/SL', async () => {
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
      });
      expect(withTpsl.success).toBe(false);
      expect(withTpsl.error).toContain('updatePositionTPSL');
    });

    it('rejects an isFullClose claim that live positions do not verify', async () => {
      // Fixture position is 0.1 BTC; a 0.00001 "full close" is a lie a bump
      // would turn into an over-close.
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
      expect(result.success).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
      expect(
        calls.find((call) => call.function === '_signCreateOrder'),
      ).toBeUndefined();
    });

    it('bumps a live-verified dust full close to the venue minimum', async () => {
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
      // Bumped to the venue minimum; reduce-only clamps execution.
      expect(orderCall?.params[3]).toBe('20');
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

  describe('cancelOrder', () => {
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
      expect(cancelCall?.params).toStrictEqual([28, 1, '555', 42]);
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        15,
        '{"cancelOrder":true}',
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
      const callback = jest.fn();
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

    it('replays the merged snapshot to late subscribers with symbol filters', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const unsubscribeFirst = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
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

      const late = jest.fn();
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
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      const accountCallback = jest.fn();
      const positionsCallback = jest.fn();
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

    it('tears down the socket when the last subscriber unsubscribes', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
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
        callback: jest.fn(),
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
      jest.useFakeTimers();
      try {
        const { provider, clientInstance } = buildProvider({
          webSocketCtor: null,
        });
        const callback = jest.fn();
        const unsubscribe = provider.subscribeToPrices({
          symbols: [],
          callback,
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(callback).toHaveBeenCalledWith([
          expect.objectContaining({ symbol: 'BTC', price: '100000' }),
        ]);

        await jest.advanceTimersByTimeAsync(10_500);
        expect(
          clientInstance.getOrderBookDetails.mock.calls.length,
        ).toBeGreaterThanOrEqual(3);

        unsubscribe();
        const callsAfter = clientInstance.getOrderBookDetails.mock.calls.length;
        await jest.advanceTimersByTimeAsync(20_000);
        expect(clientInstance.getOrderBookDetails.mock.calls).toHaveLength(
          callsAfter,
        );
        await provider.disconnect();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('session binding', () => {
    it('does not let a stale account lookup poison the session after an account switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      const accountA = { ...ACCOUNT, index: 28 };
      const accountB = { ...ACCOUNT, index: 900 };
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
        (call) => call[0],
      );
      expect(accountReads).not.toContain(28);
      expect(accountReads).toContain(900);
    });

    it('rebuilds stream channels for the NEW account after a switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      const accountB = { ...ACCOUNT, index: 900 };
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
      const unsubscribePrices = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
      });
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: jest.fn(),
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      StreamFakeWebSocket.instances[0].open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(StreamFakeWebSocket.instances[0].sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
      );

      // Wallet switches accounts; any session-bound call triggers rebind.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
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

  describe('history and routes', () => {
    it('getOrders merges open orders with the historical lifecycle', async () => {
      const { provider, clientInstance } = buildProvider();
      const orders = await provider.getOrders();
      expect(clientInstance.getInactiveOrders).toHaveBeenCalled();
      expect(orders.map((order) => order.status)).toStrictEqual([
        'open',
        'filled',
      ]);
    });

    it('getUserHistory maps deposits and withdrawals with venue statuses', async () => {
      const { provider } = buildProvider();
      const history = await provider.getUserHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        type: 'withdrawal',
        amount: '1.000000',
        status: 'pending',
        asset: 'USDC',
      });
      expect(history[1]).toMatchObject({
        type: 'deposit',
        amount: '10000.000000',
        status: 'completed',
      });
    });

    it('getUserNonFundingLedgerUpdates merges signed flows newest first', async () => {
      const { provider } = buildProvider();
      const updates = await provider.getUserNonFundingLedgerUpdates();
      expect(updates.map((update) => update.delta.type)).toStrictEqual([
        'transferOut',
        'withdraw',
        'deposit',
      ]);
      expect(updates[0].delta.usdc).toBe('-100.000000');
      expect(updates[1].delta.usdc).toBe('-1.000000');
      expect(updates[2].delta.usdc).toBe('10000.000000');
    });

    it('exposes the venue bridge route per network', () => {
      const { provider } = buildProvider();
      const [testnetRoute] = provider.getDepositRoutes();
      expect(testnetRoute.contractAddress).toBe(
        '0xe034801BC49cCDC79FB683022dA0591C86077261',
      );
      expect(testnetRoute.constraints?.minAmount).toBe('1');

      const { provider: mainnetProvider } = buildProvider({
        isTestnet: false,
      });
      const [mainnetRoute] = mainnetProvider.getWithdrawalRoutes();
      expect(mainnetRoute.chainId).toBe('eip155:1');
      expect(mainnetRoute.contractAddress).toBe(
        '0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7',
      );
      expect(mainnetRoute.assetId).toContain(
        'erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      );
    });
  });

  describe('stubs', () => {
    it('returns not-supported results for unimplemented writes', async () => {
      const { provider } = buildProvider();
      const results = await Promise.all([
        provider.editOrder({} as never),
        provider.closePosition({} as never),
        provider.updatePositionTPSL({} as never),
        provider.updateMargin({} as never),
        provider.withdraw({} as never),
      ]);
      for (const result of results) {
        expect(result.success).toBe(false);
      }
      // Batch operations are deliberately absent (optional interface
      // members) so the controller falls back to per-item calls.
      const optionalBatch = provider as unknown as Record<string, unknown>;
      expect(optionalBatch.cancelOrders).toBeUndefined();
      expect(optionalBatch.closePositions).toBeUndefined();
    });

    it('returns a zeroed historical portfolio', async () => {
      const { provider } = buildProvider();
      const portfolio = await provider.getHistoricalPortfolio();
      expect(portfolio.accountValue1dAgo).toBe('0');
    });

    it('validates only simple limit/market orders', async () => {
      const { provider } = buildProvider();
      expect(
        await provider.validateOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
      ).toStrictEqual({ isValid: true });
      expect(
        await provider.validateOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
        }),
      ).toMatchObject({ isValid: false });
      expect(await provider.validateDeposit({} as never)).toMatchObject({
        isValid: false,
      });
      expect(await provider.validateClosePosition({} as never)).toMatchObject({
        isValid: false,
      });
      expect(await provider.validateWithdrawal({} as never)).toMatchObject({
        isValid: false,
      });
    });

    it('derives estimates instead of returning false zeros', async () => {
      const { provider } = buildProvider();
      // Maintenance fraction: half the initial margin at max leverage.
      expect(
        await provider.calculateMaintenanceMargin({} as never),
      ).toBeCloseTo(1 / (2 * 50));
      // Standard cross approximation: long 10x from 100 → 100*(1-0.1+0.01).
      expect(
        parseFloat(
          await provider.calculateLiquidationPrice({
            entryPrice: 100,
            leverage: 10,
            direction: 'long',
          }),
        ),
      ).toBeCloseTo(91);
      expect(await provider.calculateLiquidationPrice({} as never)).toBe('0');
      expect(await provider.getMaxLeverage('BTC')).toBeGreaterThan(0);
      // Fee rates come from the venue's per-market metadata (currently 0).
      const fees = await provider.calculateFees({
        orderType: 'market',
        symbol: 'BTC',
        amount: '100',
      });
      expect(fees.protocolFeeRate).toBe(parseFloat(BTC_MARKET.takerFee));
      expect(fees.feeAmount).toBe(100 * parseFloat(BTC_MARKET.takerFee));
    });

    it('returns immediate empty snapshots from subscriptions', async () => {
      const { provider } = buildProvider();
      const callback = jest.fn();
      const unsubscribers = [
        provider.subscribeToPrices({ symbols: ['BTC'], callback } as never),
        provider.subscribeToPositions({ callback } as never),
        provider.subscribeToOrderFills({ callback } as never),
        provider.subscribeToOrders({ callback } as never),
        provider.subscribeToAccount({ callback } as never),
        provider.subscribeToOICaps({ callback } as never),
        provider.subscribeToCandles({
          symbol: 'BTC',
          interval: '1h',
          callback,
        } as never),
        provider.subscribeToOrderBook({ callback } as never),
      ];
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(callback).toHaveBeenCalled();
      for (const unsubscribe of unsubscribers) {
        expect(() => unsubscribe()).not.toThrow();
      }
      expect(() => provider.setLiveDataConfig({})).not.toThrow();
    });

    it('returns an explorer URL', () => {
      const { provider } = buildProvider();
      expect(provider.getBlockExplorerUrl('0xabc')).toContain('/address/0xabc');
      expect(provider.getBlockExplorerUrl()).toMatch(/^https:/u);
    });
  });
});
