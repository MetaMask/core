import { LighterProvider } from '../../../src/providers/LighterProvider.js';
import { LighterClientService } from '../../../src/services/LighterClientService.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import type {
  LighterSignerBridge,
  LighterWasmCall,
} from '../../../src/types/lighter-types.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

jest.mock('../../../src/services/LighterClientService');
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
  sendTx: jest.Mock;
};

/**
 * Build a provider wired to mocked services and bridge.
 *
 * @param options - Overrides.
 * @param options.withBridge - Attach the mock WASM bridge.
 * @param options.registeredKey - Pubkey the mocked apikeys endpoint reports.
 * @returns Provider and its collaborators.
 */
function buildProvider(
  options: { withBridge?: boolean; registeredKey?: string } = {},
): {
  provider: LighterProvider;
  clientInstance: MockClientInstance;
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
} {
  const { withBridge = true, registeredKey } = options;
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
    sendTx: jest.fn().mockResolvedValue({ code: 200, txHash: '0xsent' }),
  };
  MockedClientService.mockImplementation(
    () => clientInstance as unknown as LighterClientService,
  );
  MockedWalletService.mockImplementation(
    () =>
      ({
        getUserAddress: jest
          .fn()
          .mockReturnValue('0x8D7f03FdE1A626223364E592740a233b72395235'),
        deriveKeySeedPlain: jest.fn().mockResolvedValue('ab'.repeat(32)),
        signPersonalMessage: jest
          .fn()
          .mockResolvedValue(`0x${'cd'.repeat(65)}`),
        network: 'testnet',
      }) as unknown as LighterWalletService,
  );

  const { bridge, calls } = createMockBridge();
  const provider = new LighterProvider({
    isTestnet: true,
    platformDependencies: createMockInfrastructure(),
    lighterAuthConfig: { accountIndex: 28, apiKeyIndex: 7 },
    ...(withBridge ? { signerBridge: bridge } : {}),
  });

  return { provider, clientInstance, bridge, calls };
}

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

    it('routes getOrders to open orders in the POC', async () => {
      const { provider } = buildProvider();
      await provider.initialize();
      const orders = await provider.getOrders();
      expect(orders).toHaveLength(1);
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

    it('bumps the size up to the market minimum', async () => {
      const { provider, calls } = buildProvider();
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'limit',
        price: '90000',
      });
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // min size at $90k = max(0.0002, 10/90000≈0.000112) = 0.0002 → 20.
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
      const batchResults = await Promise.all([
        provider.cancelOrders({} as never),
        provider.closePositions({} as never),
      ]);
      for (const result of batchResults) {
        expect(result).toMatchObject({ success: false, successCount: 0 });
      }
    });

    it('returns empty history results', async () => {
      const { provider } = buildProvider();
      expect(await provider.getOrderFills()).toStrictEqual([]);
      expect(await provider.getOrFetchFills()).toStrictEqual([]);
      expect(await provider.getFunding()).toStrictEqual([]);
      expect(await provider.getUserNonFundingLedgerUpdates()).toStrictEqual([]);
      expect(await provider.getUserHistory()).toStrictEqual([]);
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

    it('returns coarse calculations', async () => {
      const { provider } = buildProvider();
      expect(await provider.calculateLiquidationPrice({} as never)).toBe('0');
      expect(await provider.calculateMaintenanceMargin({} as never)).toBe(0);
      expect(await provider.getMaxLeverage('BTC')).toBeGreaterThan(0);
      const fees = await provider.calculateFees({} as never);
      expect(fees.protocolFeeRate).toBe(0);
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

    it('returns empty asset routes and an explorer URL', () => {
      const { provider } = buildProvider();
      expect(provider.getDepositRoutes()).toStrictEqual([]);
      expect(provider.getWithdrawalRoutes()).toStrictEqual([]);
      expect(provider.getBlockExplorerUrl('0xabc')).toContain('/address/0xabc');
      expect(provider.getBlockExplorerUrl()).toMatch(/^https:/u);
    });
  });
});
