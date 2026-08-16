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
      // Capture the ORIGINAL implementation, not the mock reference —
      // delegating to the mock itself would recurse forever.
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseCreateA: () => void = () => undefined;
      let createARequested: () => void = () => undefined;
      const createAPaused = new Promise<void>((resolve) => {
        createARequested = resolve;
      });
      let stalledOnce = false;
      (bridge.execute as jest.Mock).mockImplementation(
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
      const issuedCreates = (bridge.execute as jest.Mock).mock.calls.filter(
        ([call]: [LighterWasmCall]) => call.function === '_createClient',
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
      expect(createCalls[1].params[2]).toBe(900);
      // A never registered or submitted anything.
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('an account-A write paused inside the lock never signs after B initializes', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({
          configuredAccountIndex: null,
          registeredKey: '9c'.repeat(40),
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
      const callback = jest.fn();
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
      const accountB = { ...ACCOUNT, index: 900 };
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
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signUpdateLeverage') {
            return { txInfo: '{"updateLeverage":true}' };
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
      const leverageCall = (bridge.execute as jest.Mock).mock.calls.find(
        ([call]: [LighterWasmCall]) => call.function === '_signUpdateLeverage',
      )?.[0] as LighterWasmCall;
      expect(leverageCall).toBeDefined();
      expect(leverageCall.params).toHaveLength(5);
      expect(leverageCall.params[0]).toBe(28);
      expect(leverageCall.params[1]).toBe(1);
      expect(leverageCall.params[2]).toBe(1000);
      expect(leverageCall.params[3]).toBe(0);
      // Fifth param is the nonce from the shared write lock.
      expect(leverageCall.params[4]).toBe(42);
    });
  });

  describe('client order index allocation', () => {
    it('parallel placements draw unique random uint48 ids within venue bounds', async () => {
      const { provider, calls } = buildProvider();
      const results = await Promise.all([
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        }),
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90002',
        }),
      ]);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
      const ids = calls
        .filter((call) => call.function === '_signCreateOrder')
        .map((call) => call.params[2] as number);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(2 ** 48);
      }
    });

    it('a colliding random draw is retried until the id is unique', async () => {
      const { provider, calls } = buildProvider();
      // Two 24-bit draws per candidate. Force the second placement's first
      // candidate to collide with the first placement's id, then verify the
      // allocator retries with a fresh draw instead of reusing the id.
      // jest.spyOn falls through to the real Math.random once the queued
      // values are exhausted, so the retry loop cannot spin forever even if
      // this sequence is wrong.
      const randomSpy = jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.25)
        .mockReturnValueOnce(0.25);
      try {
        const first = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        const second = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        });
        expect(first.success).toBe(true);
        expect(second.success).toBe(true);
        const ids = calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call) => call.params[2] as number);
        const half = Math.floor(0.5 * 2 ** 24);
        const quarter = Math.floor(0.25 * 2 ** 24);
        expect(ids).toStrictEqual([
          half * 2 ** 24 + half,
          quarter * 2 ** 24 + quarter,
        ]);
        // Six draws prove the colliding candidate was rejected and redrawn.
        expect(randomSpy).toHaveBeenCalledTimes(6);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('a zero draw is rejected and redrawn, never issued as a client id', async () => {
      const { provider, calls } = buildProvider();
      const randomSpy = jest
        .spyOn(Math, 'random')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(0.75)
        .mockReturnValueOnce(0.75);
      try {
        const result = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(result.success).toBe(true);
        const ids = calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call) => call.params[2] as number);
        const threeQuarters = Math.floor(0.75 * 2 ** 24);
        expect(ids).toStrictEqual([threeQuarters * 2 ** 24 + threeQuarters]);
        expect(randomSpy).toHaveBeenCalledTimes(4);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('grouped TP/SL ids are unique against each other and prior placements', async () => {
      const { provider, calls } = buildProvider();
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '80000',
      });
      const orderId = calls.find((call) => call.function === '_signCreateOrder')
        ?.params[2] as number;
      const groupedCall = calls.find(
        (call) => call.function === '_signCreateGroupedOrders',
      );
      expect(groupedCall).toBeDefined();
      // Grouped params: [accountIndex, groupingType, orderCount, ...orders,
      // nonce] where each order is 10 elements with the client id at offset 1.
      const groupedParams = groupedCall?.params as (string | number)[];
      const takeProfitId = groupedParams[4] as number;
      const stopLossId = groupedParams[14] as number;
      const allIds = [orderId, takeProfitId, stopLossId];
      for (const id of allIds) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(2 ** 48);
      }
      expect(new Set(allIds).size).toBe(3);
    });
  });

  describe('full-close precision and validate/execute parity', () => {
    const dustPosition = (
      position: string,
    ): { code: number; accounts: (typeof ACCOUNT)[] } => ({
      code: 200,
      accounts: [
        {
          ...ACCOUNT,
          positions: [{ ...ACCOUNT.positions[0], position }],
        },
      ],
    });

    it('a deliberate 99% partial dust close is rejected, never bumped to 100%', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.0001'),
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.000099',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
    });

    it('an exact-size dust close still bumps to the venue minimum', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.0001'),
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.0001',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall?.params[3]).toBe('20');
    });

    it('validateOrder matches placement: an isFullClose lie without reduceOnly is invalid', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'market',
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
    });

    it('validateOrder approves a live-verified reduce-only full close like placement', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.00001'),
      );
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('validateClosePosition rejects the shapes closePosition refuses', async () => {
      const { provider } = buildProvider();
      expect(
        await provider.validateClosePosition({
          symbol: 'BTC',
          orderType: 'limit',
        }),
      ).toMatchObject({
        isValid: false,
        error: 'Limit close requires a price',
      });
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            usdAmount: '-5',
          })
        ).isValid,
      ).toBe(false);
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            size: '0',
          })
        ).isValid,
      ).toBe(false);
      expect(
        await provider.validateClosePosition({ symbol: 'BTC' }),
      ).toStrictEqual({ isValid: true });
    });

    it('validateClosePosition agrees with execution on live sizing', async () => {
      const { provider, clientInstance } = buildProvider();
      const dust = {
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.0001' }],
          },
        ],
      };
      clientInstance.getAccountByIndex.mockResolvedValue(dust);
      // Explicit below-min PARTIAL: both validator and execution reject.
      const partialValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.000099',
        currentPrice: 90000,
      });
      expect(partialValidation.isValid).toBe(false);
      expect(partialValidation.error).toContain('below the Lighter minimum');
      const partialExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.000099',
        currentPrice: 90000,
      });
      expect(partialExecution.success).toBe(false);
      // Exact dust full close: both approve.
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            size: '0.0001',
            currentPrice: 90000,
          })
        ).isValid,
      ).toBe(true);
      const exactExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.0001',
        currentPrice: 90000,
      });
      expect(exactExecution.success).toBe(true);
    });

    it('validates limit closes at the caller price and rejects 0/NaN prices', async () => {
      const { provider } = buildProvider();
      for (const price of ['0', 'abc']) {
        const result = await provider.validateClosePosition({
          symbol: 'BTC',
          orderType: 'limit',
          price,
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid limit price');
      }
    });

    it('sizes market close validation at the FRESH venue price, not a stale snapshot', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      // Discriminating stale price: at the caller's HIGH snapshot of
      // 1,000,000 the close of 0.00005 BTC = $50, which stale-price
      // validation would APPROVE. At the fresh venue price of 100,000 it is
      // $5 — below the $10 minimum — so fresh-price validation rejects.
      const result = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.00005',
        currentPrice: 1_000_000,
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
      // Execution parity: the same request fails the same way.
      const execution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.00005',
        currentPrice: 1_000_000,
      });
      expect(execution.success).toBe(false);
      expect(execution.error).toContain('below the Lighter minimum');
    });

    it('fails market close validation closed when the fresh venue price is missing or zero', async () => {
      for (const orderBookDetails of [
        [],
        [{ symbol: 'BTC', lastTradePrice: 0 }],
      ]) {
        const { provider, clientInstance } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
            },
          ],
        });
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails,
        });
        const result = await provider.validateClosePosition({
          symbol: 'BTC',
          size: '0.0005',
          currentPrice: 100000,
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('No live venue price available');
        // Execution parity: closePosition refuses with the same error.
        const execution = await provider.closePosition({
          symbol: 'BTC',
          size: '0.0005',
          currentPrice: 100000,
        });
        expect(execution.success).toBe(false);
        expect(execution.error).toContain('No live venue price available');
      }
    });

    it('rejects a market close when the fresh price drifted beyond tolerance, in validation and execution', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      // Sized at 90,000 but the fresh venue price is 100,000: ~11.1% move
      // against a 5% default tolerance. Size $50 at the fresh price, so
      // ONLY the drift check can be the rejection.
      const request = {
        symbol: 'BTC',
        size: '0.0005',
        currentPrice: 90000,
        priceAtCalculation: 90000,
      };
      const result = await provider.validateClosePosition(request);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('slippage tolerance since sizing');
      const execution = await provider.closePosition(request);
      expect(execution.success).toBe(false);
      expect(execution.error).toContain('slippage tolerance since sizing');
    });

    it("rejects an 'Infinity' limit price in validators and placement alike", async () => {
      const { provider, calls } = buildProvider();
      // parseFloat('Infinity') === Infinity, which passes a bare > 0 check;
      // all three surfaces must refuse it before integerization/signing.
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('Invalid limit price');
      const orderValidation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(orderValidation.isValid).toBe(false);
      expect(orderValidation.error).toContain('Invalid limit price');
      const placement = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(placement.success).toBe(false);
      expect(placement.error).toContain(
        'Unable to resolve a finite execution price',
      );
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      // Parity in the OTHER direction: a MARKET order ignores params.price
      // (placement sizes at the fresh venue price), so an irrelevant
      // 'Infinity' must not fail validation for an order placement accepts.
      const marketValidation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
        price: 'Infinity',
      });
      expect(marketValidation.isValid).toBe(true);
      const marketPlacement = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
        price: 'Infinity',
        currentPrice: 100000,
      });
      expect(marketPlacement.success).toBe(true);
    });

    it('preserves subscriber state when channel setup hits a capability gate', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      // The bound wallet resolves to a Premium account.
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      StreamFakeWebSocket.instances = [];
      const accountCallback = jest.fn();
      const ordersCallback = jest.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Capability gates are not "no data": no false-empty emissions.
      expect(accountCallback).not.toHaveBeenCalled();
      expect(ordersCallback).not.toHaveBeenCalled();
      unsubscribeAccount();
      unsubscribeOrders();
    });

    it('withholds a fills snapshot containing unsupported (nonzero-fee) fills', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      StreamFakeWebSocket.instances = [];
      const fillsCallback = jest.fn();
      const unsubscribe = provider.subscribeToOrderFills({
        callback: fillsCallback,
      });
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fillsCallback.mockClear();
      // Snapshot with one supported and one unsupported (nonzero-fee) fill:
      // emitting the partial remainder would overwrite valid history.
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/account_all_trades',
          channel: 'account_all_trades:28',
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
              },
              {
                trade_id: 2,
                market_id: 1,
                size: '0.001',
                price: '90000',
                ask_id: 3,
                bid_id: 4,
                ask_account_id: 28,
                bid_account_id: 7,
                is_maker_ask: false,
                timestamp: 1700000001000,
                taker_fee: 45000,
              },
            ],
          },
        }),
      });
      expect(fillsCallback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('validateClosePosition rejects a close with no open position', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, positions: [] }],
      });
      const result = await provider.validateClosePosition({ symbol: 'BTC' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No open Lighter position');
    });
  });

  describe('round-4 session races', () => {
    const accountB = { ...ACCOUNT, index: 900 };
    const perAddressLookup =
      () =>
      (
        address: string,
      ): Promise<{
        code: number;
        l1Address: string;
        subAccounts: (typeof ACCOUNT)[];
      }> =>
        Promise.resolve(
          address.toLowerCase() === '0xbbbb'
            ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
            : {
                code: 200,
                l1Address: ACCOUNT.l1Address,
                subAccounts: [ACCOUNT],
              },
        );

    it('a delayed getAccountState response never surfaces as the new account', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      let releaseResponse: (value: unknown) => void = () => undefined;
      clientInstance.getAccountByIndex.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseResponse = resolve;
          }),
      );
      const delayedRead = provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // External switch: nothing else observes it before the response lands.
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseResponse({ code: 200, accounts: [ACCOUNT] });
      const result = await delayedRead;
      // Cancelled → empty state, never account A's balances.
      expect(result.totalBalance).toBe('0');
    });

    it('getOpenOrders returns nothing when the account switches between index and token', async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({ configuredAccountIndex: null });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      // Stall the auth-token mint (the step between index and token use).
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseToken: () => void = () => undefined;
      let stallOnce = true;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && stallOnce) {
            stallOnce = false;
            await new Promise<void>((resolve) => {
              releaseToken = resolve;
            });
          }
          return realImplementation(call);
        },
      );
      const readUnderA = provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseToken();
      const orders = await readUnderA;
      expect(orders).toStrictEqual([]);
      // The A index + fresh token pairing never reached the venue.
      expect(clientInstance.getActiveOrders).not.toHaveBeenCalled();
    });

    it("getOrders never merges one account's history with another's open orders", async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      // Historical leg resolves under A; the OPEN leg stalls and the wallet
      // switches while it is in flight.
      let releaseOpen: (value: unknown) => void = () => undefined;
      clientInstance.getActiveOrders.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOpen = resolve;
          }),
      );
      const mergedRead = provider.getOrders();
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseOpen({ code: 200, orders: [] });
      const orders = await mergedRead;
      // The merge is refused outright — no A-historical leakage.
      expect(orders).toStrictEqual([]);
    });

    it('a paused write never signs after ALL accounts are deselected', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      // Warming registered the venue key; only post-deselection sends count.
      clientInstance.sendTx.mockClear();
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
      // All accounts deselected while the write is paused at its nonce.
      getUserAddressMock.mockImplementation(() => {
        throw new Error('NO_ACCOUNT_SELECTED');
      });
      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('a paused write never submits after provider disconnect', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      clientInstance.sendTx.mockClear();
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
      // The provider is disconnected (e.g. venue switch) mid-write.
      await provider.disconnect();
      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('a configured account index without a bound wallet requests no user channels', async () => {
      const { provider, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: 28,
      });
      // No wallet account selected at mount time.
      getUserAddressMock.mockImplementation(() => {
        throw new Error('NO_ACCOUNT_SELECTED');
      });
      StreamFakeWebSocket.instances = [];
      const unsubscribe = provider.subscribeToAccount({ callback: jest.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket = StreamFakeWebSocket.instances[0];
      socket?.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The configured index alone must never subscribe user channels.
      expect(
        (socket?.sent ?? []).some((frame) => frame.includes('user_stats/')),
      ).toBe(false);

      // A NON-OWNER wallet is then selected: the configured account (owned
      // by 0x8d7f…) must be rejected, never subscribed for wallet 0xbbbb.
      getUserAddressMock.mockImplementation(() => '0xbbbb');
      await expect(provider.getAccountState()).rejects.toThrow(
        'not owned by the selected wallet',
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketsAfterMismatch = StreamFakeWebSocket.instances.map(
        (instance) => instance.sent,
      );
      expect(
        socketsAfterMismatch
          .flat()
          .some((frame) => frame.includes('user_stats/')),
      ).toBe(false);

      // The OWNER wallet is selected: channels for the account appear.
      getUserAddressMock.mockImplementation(() => ACCOUNT.l1Address);
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const lastSocket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      lastSocket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        lastSocket.sent.some((frame) => frame.includes('user_stats/28')),
      ).toBe(true);
      unsubscribe();
    });

    it("an aborted setup auth failure never blanks the new session's order subscribers", async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({
          webSocketCtor: fakeStreamCtor,
          configuredAccountIndex: null,
        });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      const ordersCallback = jest.fn();
      // Stall then FAIL account A's auth-token mint.
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let failAuthA: () => void = () => undefined;
      let stallOnce = true;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && stallOnce) {
            stallOnce = false;
            await new Promise<void>((_resolve, reject) => {
              failAuthA = (): void => reject(new Error('auth backend down'));
            });
          }
          return realImplementation(call);
        },
      );
      const unsubscribe = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await provider.getAccountState(); // bind under A; channel setup stalls at auth
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Switch to B; its own setup runs with working auth.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      ordersCallback.mockClear();
      // A's stalled auth finally FAILS: its inner catch must not blank B.
      failAuthA();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ordersCallback).not.toHaveBeenCalledWith([], expect.anything());
      expect(ordersCallback).not.toHaveBeenCalledWith([]);
      unsubscribe();
    });

    it('routes no account frame after an unobserved external switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      const accountCallback = jest.fn();
      const unsubscribe = provider.subscribeToAccount({
        callback: accountCallback,
      });
      await provider.getAccountState(); // bind under A
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketA =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socketA.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      accountCallback.mockClear();
      // EXTERNAL switch: no provider call observes it before the frame.
      getUserAddressMock.mockReturnValue('0xbbbb');
      socketA.onmessage?.({
        data: JSON.stringify({
          type: 'update/user_stats',
          channel: 'user_stats:28',
          stats: { portfolio_value: '9999', available_balance: '9999' },
        }),
      });
      // The frame itself is the first observer: it must be dropped, and
      // the rebind replaces the socket for account B.
      expect(accountCallback).not.toHaveBeenCalled();
      const socketB =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      expect(socketB).not.toBe(socketA);
      unsubscribe();
    });

    it('a deferred onopen auth continuation never reinserts a stale channel after a switch', async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({
          webSocketCtor: fakeStreamCtor,
          configuredAccountIndex: null,
        });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      // Orders subscription wants the authenticated channel.
      const unsubscribe = provider.subscribeToOrders({ callback: jest.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketA =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      // The channel setup cached a fresh (+600s) token; expire it so socket
      // A's onopen genuinely enters the deferred re-mint branch.
      // Restored in the finally below so a failed assertion cannot poison
      // later tests with a frozen clock.
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 700_000);
      try {
        const realImplementation = (
          bridge.execute as jest.Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        let stallNext = true;
        let releaseToken: () => void = () => undefined;
        let stallEntered: () => void = () => undefined;
        const refreshEntered = new Promise<void>((resolve) => {
          stallEntered = resolve;
        });
        (bridge.execute as jest.Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_createAuthToken' && stallNext) {
              stallNext = false;
              stallEntered();
              await new Promise<void>((resolve) => {
                releaseToken = resolve;
              });
            }
            return realImplementation(call);
          },
        );
        socketA.open();
        // The deferred re-mint MUST have started, or this test proves nothing.
        await refreshEntered;
        await new Promise((resolve) => setTimeout(resolve, 0));
        // Switch to B: rebind replaces the socket and the channel set.
        getUserAddressMock.mockReturnValue('0xbbbb');
        await provider.getAccountState();
        const socketB =
          StreamFakeWebSocket.instances[
            StreamFakeWebSocket.instances.length - 1
          ];
        expect(socketB).not.toBe(socketA);
        socketB.open();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const framesBefore = socketB.sent.length;
        // The stale continuation resolves AFTER the switch.
        releaseToken();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        // No account-A channel was sent on B's socket by the stale continuation.
        const framesAfter = socketB.sent.slice(framesBefore);
        expect(
          framesAfter.some((frame) => frame.includes('account_all_orders/28')),
        ).toBe(false);
        expect(
          socketB.sent.some((frame) => frame.includes('account_all_orders/28')),
        ).toBe(false);
        // The deferred mint really ran exactly once through the stall.
        expect(stallNext).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
      unsubscribe();
    });
  });

  describe('validateOrder usd sizing', () => {
    it('validates a USD-sized order through the min-size calculation', async () => {
      // Regression: this path read `usdAmount` outside its declaring block
      // (a runtime ReferenceError under plain TS) — a valid usdAmount with
      // a positive reference price must reach the min-size check and pass.
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0',
        usdAmount: '5000',
        orderType: 'limit',
        price: '100000',
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('rejects a USD-sized order below the venue minimum', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0',
        // $5 at $100k → 0.00005 BTC, below min base 0.0002.
        usdAmount: '5',
        orderType: 'limit',
        price: '100000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
    });

    it('rejects an invalid usdAmount before any sizing math', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '1',
        usdAmount: '-5',
        orderType: 'limit',
        price: '100000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid usdAmount');
    });
  });

  describe('closePosition semantics', () => {
    it('routes a limit close with the requested price, not a market order', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        size: '0.05',
        orderType: 'limit',
        price: '120000',
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // Limit type (0), GTT, and the requested price scaled by decimals.
      expect(orderCall?.params[6]).toBe(0);
      expect(orderCall?.params[4]).toBe('1200000');
      expect(orderCall?.params[8]).toBe(1);
    });

    it('rejects a limit close without a price', async () => {
      const { provider } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        orderType: 'limit',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a price');
    });

    it('honors usdAmount sizing and slippage on a market close', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        usdAmount: '5000',
        maxSlippageBps: 100,
        priceAtCalculation: 100000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // usdAmount / fresh reference (100000) = 0.05 → sized at reference,
      // not at the protection price.
      expect(orderCall?.params[3]).toBe('5000');
      // Sell-side protection price offset by 1% (100 bps): 99000.
      expect(orderCall?.params[4]).toBe('990000');
    });

    it('refuses drifted market closes beyond the slippage tolerance', async () => {
      const { provider } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        usdAmount: '5000',
        maxSlippageBps: 100,
        // Fresh venue price is 100000; a 90000 snapshot is >1% away.
        priceAtCalculation: 90000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('slippage tolerance');
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

    it('gates the historical portfolio instead of returning false zeros', async () => {
      const { provider } = buildProvider();
      await expect(provider.getHistoricalPortfolio()).rejects.toThrow(
        'unavailable',
      );
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
      // Maintenance fraction: venue fallback (no margin data mocked).
      expect(
        await provider.calculateMaintenanceMargin({} as never),
      ).toBeCloseTo(1 / (2 * 50));
      // The liquidation preview is capability-gated: Lighter cross-margin
      // liquidation needs account-level inputs, so a plausible per-position
      // number would be wrong. Clients render their explicit fallback.
      await expect(
        provider.calculateLiquidationPrice({
          entryPrice: 100,
          leverage: 10,
          direction: 'long',
        }),
      ).rejects.toThrow('unavailable');
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
