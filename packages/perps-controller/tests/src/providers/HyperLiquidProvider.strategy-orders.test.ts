import {
  CHASE_ORDER_CONFIG,
  HYPERLIQUID_TWAP_LIMITS,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import { TradingReadinessCache } from '../../../src/services/TradingReadinessCache.js';
import type {
  CancelOrderResult,
  PerpsPlatformDependencies,
  OrderParams,
  OrderResult,
} from '../../../src/types/index.js';
import type { OrderType } from '../../../src/types/perps-types.js';
import {
  validateAssetSupport,
  validateBalance,
  validateCoinExists,
  validateDepositParams,
  validateOrderParams,
  validateWithdrawalParams,
} from '../../../src/utils/hyperLiquidValidation.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

// The HyperLiquid SDK is never exercised directly: every exchange and info call
// goes through the mocked client service below.
jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidWalletService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');

jest.mock('../../../src/utils/hyperLiquidValidation', () => ({
  validateOrderParams: jest.fn(),
  validateWithdrawalParams: jest.fn(),
  validateDepositParams: jest.fn(),
  validateCoinExists: jest.fn(),
  validateAssetSupport: jest.fn(),
  validateBalance: jest.fn(),
  getSupportedPaths: jest
    .fn()
    .mockReturnValue([
      'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
      'eip155:1/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
    ]),
  getBridgeInfo: jest.fn().mockReturnValue({
    chainId: 'eip155:42161',
    contractAddress: '0x1234567890123456789012345678901234567890',
  }),
  createErrorResult: jest.fn((error, defaultResponse) => ({
    ...defaultResponse,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  })),
}));

// Mock adapter functions
jest.mock('../../../src/utils/hyperLiquidAdapter', () => {
  const actual = jest.requireActual('../../../src/utils/hyperLiquidAdapter');
  return {
    ...actual,
    adaptHyperLiquidLedgerUpdateToUserHistoryItem: jest.fn((updates) => {
      // Return mock history items based on input
      if (!updates || !Array.isArray(updates) || updates.length === 0) {
        return [];
      }
      return updates.map((_update: unknown) => ({
        type: 'deposit' as const,
        amount: '100',
        timestamp: Date.now(),
        hash: '0x123',
      }));
    }),
  };
});

// Mock TradingReadinessCache - global singleton for signing operation caching
// Use jest.createMockFromModule for proper mock creation
jest.mock('../../../src/services/TradingReadinessCache');

const MockedHyperLiquidClientService =
  HyperLiquidClientService as jest.MockedClass<typeof HyperLiquidClientService>;
const MockedHyperLiquidWalletService =
  HyperLiquidWalletService as jest.MockedClass<typeof HyperLiquidWalletService>;
const MockedHyperLiquidSubscriptionService =
  HyperLiquidSubscriptionService as jest.MockedClass<
    typeof HyperLiquidSubscriptionService
  >;
const mockValidateOrderParams = validateOrderParams as jest.MockedFunction<
  typeof validateOrderParams
>;
const mockValidateWithdrawalParams =
  validateWithdrawalParams as jest.MockedFunction<
    typeof validateWithdrawalParams
  >;
const mockValidateDepositParams = validateDepositParams as jest.MockedFunction<
  typeof validateDepositParams
>;
const mockValidateCoinExists = validateCoinExists as jest.MockedFunction<
  typeof validateCoinExists
>;
const mockValidateAssetSupport = validateAssetSupport as jest.MockedFunction<
  typeof validateAssetSupport
>;
const mockValidateBalance = validateBalance as jest.MockedFunction<
  typeof validateBalance
>;

/** Every method on the mocked info and exchange clients is a jest mock. */
type MockClient = Record<string, jest.Mock>;

/**
 * Build the read-side client the provider queries.
 *
 * @param overrides - Methods to replace or add for a single test.
 * @returns The mock info client.
 */
const createMockInfoClient = (overrides: MockClient = {}): MockClient => ({
  clearinghouseState: jest.fn().mockResolvedValue({
    marginSummary: {
      totalMarginUsed: '500',
      accountValue: '10500',
    },
    withdrawable: '9500',
    assetPositions: [
      {
        position: {
          coin: 'BTC',
          szi: '0.1',
          entryPx: '50000',
          positionValue: '5000',
          unrealizedPnl: '100',
          marginUsed: '500',
          leverage: { type: 'cross', value: 10 },
          liquidationPx: '45000',
          maxLeverage: 50,
          returnOnEquity: '20',
          cumFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
        },
        type: 'oneWay',
      },
      {
        position: {
          coin: 'ETH',
          szi: '1.5',
          entryPx: '3000',
          positionValue: '4500',
          unrealizedPnl: '50',
          marginUsed: '450',
          leverage: { type: 'cross', value: 10 },
          liquidationPx: '2700',
          maxLeverage: 50,
          returnOnEquity: '10',
          cumFunding: { allTime: '5', sinceOpen: '2', sinceChange: '1' },
        },
        type: 'oneWay',
      },
    ],
    crossMarginSummary: {
      accountValue: '10000',
      totalMarginUsed: '5000',
    },
  }),
  spotClearinghouseState: jest.fn().mockResolvedValue({
    balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
  }),
  // Mode-aware fold gate reads userAbstraction; default to unifiedAccount
  // so tests that predated the gate still see spot folded into spendable/withdrawable.
  userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
  meta: jest.fn().mockResolvedValue({
    universe: [
      { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
      { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
    ],
  }),
  metaAndAssetCtxs: jest.fn().mockResolvedValue([
    {
      universe: [
        { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
      ],
    },
    [
      {
        funding: '0.0001',
        openInterest: '1000',
        prevDayPx: '49000',
        dayNtlVlm: '1000000',
        markPx: '50000',
        midPx: '50000',
        oraclePx: '50000',
      },
      {
        funding: '0.0001',
        openInterest: '500',
        prevDayPx: '2900',
        dayNtlVlm: '500000',
        markPx: '3000',
        midPx: '3000',
        oraclePx: '3000',
      },
    ],
  ]),
  perpDexs: jest.fn().mockResolvedValue([null]),
  allMids: jest.fn().mockResolvedValue({ BTC: '50000', ETH: '3000' }),
  // editOrder verifies the resting order's placement type before modifying it,
  // so the account lists the plain limit order the edit tests target.
  frontendOpenOrders: jest.fn().mockResolvedValue([
    {
      coin: 'BTC',
      side: 'B',
      limitPx: '50000',
      sz: '0.1',
      origSz: '0.1',
      oid: 123,
      timestamp: 1_700_000_000_000,
      isTrigger: false,
      triggerCondition: 'N/A',
      triggerPx: '0',
      children: [],
      isPositionTpsl: false,
      reduceOnly: false,
      orderType: 'Limit',
    },
  ]),
  referral: jest.fn().mockResolvedValue({
    referrerState: {
      stage: 'ready',
      data: { code: 'MMCSI' },
    },
  }),
  maxBuilderFee: jest.fn().mockResolvedValue(1),
  userFees: jest.fn().mockResolvedValue({
    feeSchedule: {
      cross: '0.00030',
      add: '0.00010',
      spotCross: '0.00040',
      spotAdd: '0.00020',
    },
    dailyUserVlm: [],
  }),
  userNonFundingLedgerUpdates: jest.fn().mockResolvedValue([
    {
      delta: { type: 'deposit', usdc: '100' },
      time: Date.now(),
      hash: '0x123abc',
    },
    {
      delta: { type: 'withdraw', usdc: '50' },
      time: Date.now() - 3600000,
      hash: '0x456def',
    },
  ]),
  portfolio: jest.fn().mockResolvedValue([
    null,
    [
      null,
      {
        accountValueHistory: [
          [Date.now() - 86400000, '10000'], // 24h ago
          [Date.now() - 172800000, '9500'], // 48h ago
          [Date.now() - 259200000, '9000'], // 72h ago
        ],
      },
    ],
  ]),
  spotMeta: jest.fn().mockResolvedValue({
    tokens: [
      { name: 'USDC', tokenId: '0xdef456', index: 0 },
      { name: 'USDT', tokenId: '0x789abc', index: 1 },
    ],
    universe: [],
  }),
  historicalOrders: jest.fn().mockResolvedValue([]),
  userFills: jest.fn().mockResolvedValue([]),
  userFillsByTime: jest.fn().mockResolvedValue([]),
  userFunding: jest.fn().mockResolvedValue([]),
  ...overrides,
});

/**
 * Build the write-side client the provider signs through.
 *
 * @param overrides - Methods to replace or add for a single test.
 * @returns The mock exchange client.
 */
const createMockExchangeClient = (overrides: MockClient = {}): MockClient => ({
  order: jest.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: [{ resting: { oid: 123 } }] } },
  }),
  modify: jest.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: [{ resting: { oid: '123' } }] } },
  }),
  cancel: jest.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: ['success'] } },
  }),
  withdraw3: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  updateLeverage: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  approveBuilderFee: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  setReferrer: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  sendAsset: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  agentSetAbstraction: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  userSetAbstraction: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  ...overrides,
});

// Create shared mock platform dependencies for provider tests
const mockPlatformDependencies: PerpsPlatformDependencies =
  createMockInfrastructure();

const mockMessenger = createMockMessenger();

/**
 * Build a provider backed by the mock services above.
 *
 * @param options - Provider construction options.
 * @param options.isTestnet - Whether the provider runs against testnet.
 * @param options.initialAssetMapping - Pre-seeded symbol-to-asset-ID entries.
 * @returns The provider under test.
 */
const createTestProvider = (
  options: {
    isTestnet?: boolean;
    initialAssetMapping?: [string, number][];
  } = {},
): HyperLiquidProvider =>
  new HyperLiquidProvider({
    ...options,
    platformDependencies: mockPlatformDependencies,
    messenger: mockMessenger,
  });

describe('HyperLiquidProvider - strategy order types', () => {
  let provider: HyperLiquidProvider;
  let mockClientService: jest.Mocked<HyperLiquidClientService>;
  let mockWalletService: jest.Mocked<HyperLiquidWalletService>;
  let mockSubscriptionService: jest.Mocked<HyperLiquidSubscriptionService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    (
      mockPlatformDependencies.marketDataFormatters.formatVolume as jest.Mock
    ).mockImplementation((value: number) => `$${value.toFixed(0)}`);
    (
      mockPlatformDependencies.marketDataFormatters.formatPerpsFiat as jest.Mock
    ).mockImplementation((value: number) => `$${value.toFixed(2)}`);
    (
      mockPlatformDependencies.marketDataFormatters
        .formatPercentage as jest.Mock
    ).mockImplementation((value: number) => `${value.toFixed(2)}%`);
    (
      mockPlatformDependencies.featureFlags.validateVersionGated as jest.Mock
    ).mockReturnValue(undefined);
    (mockPlatformDependencies.metrics.isEnabled as jest.Mock).mockReturnValue(
      true,
    );

    // Reset TradingReadinessCache mock state (using imported mocked module)
    const mockedCache = TradingReadinessCache as jest.Mocked<
      typeof TradingReadinessCache
    >;
    mockedCache.get.mockReturnValue(undefined);
    mockedCache.getBuilderFee.mockReturnValue(undefined);
    mockedCache.getReferral.mockReturnValue(undefined);
    mockedCache.isInFlight.mockReturnValue(undefined);
    mockedCache.setInFlight.mockReturnValue(jest.fn());

    // Initialize mock stream manager instance
    mockStreamManagerInstance = {
      clearAllChannels: jest.fn(),
    };

    // Create mocked service instances using factory functions
    mockClientService = {
      initialize: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
      isTestnetMode: jest.fn().mockReturnValue(false),
      ensureInitialized: jest.fn(),
      getExchangeClient: jest.fn().mockReturnValue(createMockExchangeClient()),
      getInfoClient: jest.fn().mockReturnValue(createMockInfoClient()),
      fetchHistoricalOrders: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn().mockResolvedValue(undefined),
      toggleTestnet: jest.fn(),
      setTestnetMode: jest.fn(),
      getNetwork: jest.fn().mockReturnValue('mainnet'),
      ensureSubscriptionClient: jest.fn().mockResolvedValue(undefined),
      getSubscriptionClient: jest.fn(),
      setOnReconnectCallback: jest.fn(),
      setOnTerminateCallback: jest.fn(),
      getConnectionState: jest.fn().mockReturnValue('connected'),
    } as Partial<HyperLiquidClientService> as jest.Mocked<HyperLiquidClientService>;

    mockWalletService = {
      setTestnetMode: jest.fn(),
      getCurrentAccountId: jest
        .fn()
        .mockReturnValue(
          'eip155:42161:0x1234567890123456789012345678901234567890',
        ),
      createWalletAdapter: jest.fn().mockReturnValue({
        request: jest
          .fn()
          .mockResolvedValue(['0x1234567890123456789012345678901234567890']),
      }),
      getUserAddress: jest
        .fn()
        .mockReturnValue('0x1234567890123456789012345678901234567890'),
      getUserAddressWithDefault: jest
        .fn()
        .mockResolvedValue('0x1234567890123456789012345678901234567890'),
      isKeyringUnlocked: jest.fn().mockReturnValue(true),
      isSelectedHardwareWallet: jest.fn().mockReturnValue(false),
    } as Partial<HyperLiquidWalletService> as jest.Mocked<HyperLiquidWalletService>;

    mockSubscriptionService = {
      subscribeToPrices: jest.fn().mockResolvedValue(jest.fn()), // Returns Promise
      subscribeToPositions: jest.fn().mockReturnValue(jest.fn()), // Returns function directly
      subscribeToOrderFills: jest.fn().mockReturnValue(jest.fn()), // Returns function directly
      clearAll: jest.fn(),
      isPositionsCacheInitialized: jest.fn().mockReturnValue(false),
      getCachedPositions: jest.fn().mockReturnValue([]),
      updateFeatureFlags: jest.fn().mockResolvedValue(undefined),
      // Cache methods used by buildAssetMapping optimization
      setDexMetaCache: jest.fn(),
      setDexAssetCtxsCache: jest.fn(),
      getDexAssetCtxsCache: jest.fn().mockReturnValue(undefined),
      // Price cache used by placeOrder, editOrder, closePosition optimizations
      getCachedPrice: jest.fn().mockImplementation((symbol: string) => {
        const prices: Record<string, string> = { BTC: '50000', ETH: '3000' };
        return prices[symbol];
      }),
      getLastAllMidsSnapshot: jest.fn().mockReturnValue(null),
      // Orders cache used by updatePositionTPSL and getOpenOrders
      isOrdersCacheInitialized: jest.fn().mockReturnValue(false),
      getCachedOrders: jest.fn().mockReturnValue([]),
      // Atomic getter - returns null when cache not initialized (prevents race condition)
      getOrdersCacheIfInitialized: jest.fn().mockReturnValue(null),
      // Abstraction-mode resolved-mode setter (unified account migration)
      setUserAbstractionMode: jest.fn(),
    } as Partial<HyperLiquidSubscriptionService> as jest.Mocked<HyperLiquidSubscriptionService>;

    // Mock constructors
    MockedHyperLiquidClientService.mockImplementation(() => mockClientService);
    MockedHyperLiquidWalletService.mockImplementation(() => mockWalletService);
    MockedHyperLiquidSubscriptionService.mockImplementation(
      () => mockSubscriptionService,
    );

    // Mock validation
    mockValidateOrderParams.mockReturnValue({ isValid: true });
    mockValidateWithdrawalParams.mockReturnValue({ isValid: true });
    mockValidateDepositParams.mockReturnValue({ isValid: true });
    mockValidateCoinExists.mockReturnValue({ isValid: true });
    mockValidateAssetSupport.mockReturnValue({ isValid: true });
    mockValidateBalance.mockReturnValue({ isValid: true });
    const hyperLiquidValidation = jest.requireMock(
      '../../../src/utils/hyperLiquidValidation',
    );
    hyperLiquidValidation.getSupportedPaths.mockReturnValue([
      'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
      'eip155:1/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
    ]);
    hyperLiquidValidation.getBridgeInfo.mockReturnValue({
      chainId: 'eip155:42161',
      contractAddress: '0x1234567890123456789012345678901234567890',
    });
    hyperLiquidValidation.createErrorResult.mockImplementation(
      (error: unknown, defaultResponse: Record<string, unknown>) => ({
        ...defaultResponse,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    const hyperLiquidAdapter = jest.requireMock(
      '../../../src/utils/hyperLiquidAdapter',
    );
    hyperLiquidAdapter.adaptHyperLiquidLedgerUpdateToUserHistoryItem.mockImplementation(
      (updates: unknown[]) => {
        if (!updates || !Array.isArray(updates) || updates.length === 0) {
          return [];
        }
        return updates.map(() => ({
          type: 'deposit' as const,
          amount: '100',
          timestamp: Date.now(),
          hash: '0x123',
        }));
      },
    );

    provider = createTestProvider({
      initialAssetMapping: [
        ['BTC', 0],
        ['ETH', 1],
      ],
    });
  });

  /**
   * Swap in exchange/info clients carrying the strategy endpoints, which the
   * shared factories above do not define.
   *
   * @param overrides - Per-client method overrides.
   * @param overrides.exchange - Exchange client overrides.
   * @param overrides.info - Info client overrides.
   * @returns The installed mock clients.
   */
  const useStrategyClients = (
    overrides: { exchange?: MockClient; info?: MockClient } = {},
  ): { exchangeClient: MockClient; infoClient: MockClient } => {
    const exchangeClient = createMockExchangeClient({
      twapOrder: jest.fn().mockResolvedValue({
        status: 'ok',
        response: {
          type: 'twapOrder',
          data: { status: { running: { twapId: 987 } } },
        },
      }),
      twapCancel: jest.fn().mockResolvedValue({
        status: 'ok',
        response: { type: 'twapCancel', data: { status: 'success' } },
      }),
      ...overrides.exchange,
    });
    const infoClient = createMockInfoClient({
      // A chase reads what its cancelled order left unfilled before re-placing.
      // Nothing filled by default; the partial-fill tests override this.
      orderStatus: jest.fn().mockResolvedValue({
        status: 'order',
        order: {
          status: 'canceled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999',
            sz: '1',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
          },
        },
      }),
      l2Book: jest.fn().mockResolvedValue({
        coin: 'ETH',
        levels: [
          [{ px: '2999', sz: '10', n: 1 }],
          [{ px: '3001', sz: '10', n: 1 }],
        ],
      }),
      ...overrides.info,
    });

    mockClientService.getExchangeClient.mockReturnValue(
      exchangeClient as never,
    );
    mockClientService.getInfoClient.mockReturnValue(infoClient as never);

    return { exchangeClient, infoClient };
  };

  const baseOrder = {
    symbol: 'ETH',
    isBuy: true,
    size: '1',
    usdAmount: '3000',
    currentPrice: 3000,
  };

  describe('TWAP placement', () => {
    it('submits the venue TWAP action rather than an order', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
        twapRandomize: true,
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.twapOrder).toHaveBeenCalledWith({
        twap: {
          a: 1,
          b: true,
          s: '1',
          r: false,
          m: 30,
          t: true,
        },
      });
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('returns the venue TWAP id as the handle', async () => {
      useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } as OrderParams);

      expect(result).toMatchObject({
        success: true,
        orderId: '987',
        submittedSize: '1',
      });
    });

    it('defaults randomize and reduce-only to false', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 5,
      } as OrderParams);

      expect(exchangeClient.twapOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          twap: expect.objectContaining({ r: false, t: false }),
        }),
      );
    });

    it('surfaces a venue rejection as a failed result', async () => {
      useStrategyClients({
        exchange: {
          twapOrder: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapOrder',
              data: { status: { error: 'Insufficient margin' } },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient margin');
    });
  });

  describe('TWAP cancellation', () => {
    it('uses the TWAP cancel endpoint, never the order cancel endpoint', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('reports a rejected TWAP cancel as a failure', async () => {
      useStrategyClients({
        exchange: {
          twapCancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: 'Twap not found' } },
            },
          }),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
      });

      expect(result.success).toBe(false);
    });

    it('leaves an ordinary cancel on the order endpoint', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.cancelOrder({ orderId: '123', symbol: 'ETH' });

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
    });
  });

  describe('Scale placement', () => {
    const scaleStatuses = {
      status: 'ok',
      response: {
        data: {
          statuses: [
            { resting: { oid: 11 } },
            { resting: { oid: 22 } },
            { resting: { oid: 33 } },
          ],
        },
      },
    };

    it('fans out one order per rung, spread across the range', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(submitted.grouping).toBe('na');
      expect(submitted.orders).toHaveLength(3);
      expect(
        submitted.orders.map((order: { p: string }) => order.p),
      ).toStrictEqual(['2000', '2500', '3000']);
    });

    it('splits the size across the rungs so the total is preserved', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      const sizes = submitted.orders.map((order: { s: string }) => order.s);
      expect(sizes).toStrictEqual(['0.3334', '0.3333', '0.3333']);
      expect(
        sizes.reduce(
          (total: number, size: string) => total + parseFloat(size),
          0,
        ),
      ).toBeCloseTo(1, 8);
    });

    it('weights the rungs along the ladder when a skew is supplied', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 2,
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      const sizes = submitted.orders.map((order: { s: string }) => order.s);
      // The largest rung is the one at scaleMaxPrice, and the ladder still adds
      // up to the size that was validated.
      expect(sizes).toStrictEqual(['0.2222', '0.3333', '0.4445']);
      expect(
        sizes.reduce(
          (total: number, size: string) => total + parseFloat(size),
          0,
        ),
      ).toBeCloseTo(1, 8);
    });

    it('weights the bottom of the ladder for a skew below 1', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 0.5,
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((order: { s: string }) => order.s),
      ).toStrictEqual(['0.4445', '0.3333', '0.2222']);
    });

    it('splits evenly for a skew of exactly 1', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 1,
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((order: { s: string }) => order.s),
      ).toStrictEqual(['0.3334', '0.3333', '0.3333']);
    });

    it('rests every rung as a plain GTC limit order', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      submitted.orders.forEach((order: { t: unknown; b: boolean }) => {
        expect(order.t).toStrictEqual({ limit: { tif: 'Gtc' } });
        expect(order.b).toBe(true);
      });
    });

    it('returns the ladder children alongside a group handle', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(result.childOrderIds).toStrictEqual(['11', '22', '33']);
      expect(result.orderId).toMatch(/^scale-/u);
    });

    it('fails when the ladder rested nothing', async () => {
      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Insufficient margin' }] },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      expect(result.success).toBe(false);
    });

    it('cancels every child of the group in one batch', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue(scaleStatuses),
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success', 'success'] } },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 22 },
          { a: 1, o: 33 },
        ],
      });
    });

    it('reports an incomplete group cancel and keeps the handle for a retry', async () => {
      const cancel = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: ['success', { error: 'multi-sig required' }, 'success'],
            },
          },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(scaleStatuses), cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      expect(first.success).toBe(false);
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );

      // The handle still resolves, and now covers only the rung left resting.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      expect(second.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 22 }],
      });
    });

    it('rejects a cancel for a group it does not hold', async () => {
      useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: 'scale-does-not-exist',
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });
  });

  describe('Chase placement', () => {
    const chaseRested = {
      status: 'ok',
      response: { data: { statuses: [{ resting: { oid: 55 } }] } },
    };

    it('rests post-only at the near touch for a buy', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(submitted.orders).toHaveLength(1);
      // One tick above the best bid, which is how the venue defines a chase: a
      // post-only buy that improves the bid rather than joining the queue at it.
      // ETH's tick at ~3000 is 0.1.
      expect(submitted.orders[0].p).toBe('2999.1');
      expect(submitted.orders[0].t).toStrictEqual({ limit: { tif: 'Alo' } });
    });

    it('rests at the best ask for a sell', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        isBuy: false,
        orderType: 'chase',
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      // One tick below the best ask, mirroring the buy side.
      expect(submitted.orders[0].p).toBe('3000.9');
    });

    it('returns a session handle carrying the live order', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(result.orderId).toMatch(/^chase-/u);
      expect(result.childOrderIds).toStrictEqual(['55']);
    });

    it('fails when the book has no price on the side it must rest at', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
        info: {
          l2Book: jest
            .fn()
            .mockResolvedValue({ coin: 'ETH', levels: [[], []] }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_CHASE_TOUCH_UNAVAILABLE,
      );
    });

    it('cancels the live order and stops the session', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });

      // The handle is gone, so a second cancel has nothing to act on.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.success).toBe(false);
    });

    it('reports an incomplete chase cancel and keeps the handle for a retry', async () => {
      const cancel = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'multi-sig required' }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested), cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(first.success).toBe(false);
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.success).toBe(true);
    });

    it('rejects a cancel for a session it does not hold', async () => {
      useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: 'chase-does-not-exist',
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });
  });

  describe('Rejections happen before any exchange call', () => {
    it.each([
      ['twap', { orderType: 'twap', twapDuration: 0 }],
      [
        'scale',
        {
          orderType: 'scale',
          scaleMinPrice: '3000',
          scaleMaxPrice: '2000',
          scaleNumOrders: 3,
        },
      ],
    ])(
      'never reaches the exchange for an invalid %s',
      async (_label, strategyParams) => {
        const { exchangeClient, infoClient } = useStrategyClients();
        mockValidateOrderParams.mockReturnValue({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
        });

        const result = await provider.placeOrder({
          ...baseOrder,
          ...strategyParams,
        } as OrderParams);

        expect(result.success).toBe(false);
        expect(exchangeClient.order).not.toHaveBeenCalled();
        expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
        expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
        expect(infoClient.l2Book).not.toHaveBeenCalled();
      },
    );

    it('refuses a strategy placement on a sub-exchange market', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        symbol: 'xyz:TSLA',
        orderType: 'twap',
        twapDuration: 30,
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED,
      );
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });
  });

  describe('Existing order types are unaffected', () => {
    it('still routes a market order through the order action', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });

    it('still routes a limit order through the order action', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'limit',
        price: '2900',
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });
  });

  describe('Chase re-pricing loop', () => {
    /**
     * A successful single-order response resting the given exchange ID.
     *
     * @param oid - Exchange order ID to report as resting.
     * @returns The exchange response.
     */
    const chaseRested = (oid: number): Record<string, unknown> => ({
      status: 'ok',
      response: { data: { statuses: [{ resting: { oid } }] } },
    });

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Build an l2Book mock that walks through the supplied best bids.
     *
     * @param bids - Best bid for each successive read; the last repeats.
     * @returns The mock.
     */
    const bookWalkingBids = (bids: string[]): jest.Mock => {
      let call = 0;
      return jest.fn().mockImplementation(async () => {
        const px = bids[Math.min(call, bids.length - 1)];
        call += 1;
        return {
          coin: 'ETH',
          levels: [[{ px, sz: '10', n: 1 }], [{ px: '3001', sz: '10', n: 1 }]],
        };
      });
    };

    it('cancels and re-places when the touch moves', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(1000);

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('2998.1');
      expect(order.mock.calls[1][0].orders[0].t).toStrictEqual({
        limit: { tif: 'Alo' },
      });
    });

    it('leaves the order alone while the touch holds still', async () => {
      const order = jest.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(3000);

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('stops chasing once the order is no longer resting', async () => {
      const order = jest.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order,
          // A cancel the exchange refuses means the order already left the book.
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Order was never placed' }] },
            },
          }),
        },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      // No replacement was rested after the failed cancel.
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('stops re-pricing at the repricing cap', async () => {
      const order = jest.fn().mockResolvedValue(chaseRested(55));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997', '2996']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxRepricings: 1,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      // One initial placement plus exactly one re-price.
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('stops re-pricing once the window closes', async () => {
      const order = jest.fn().mockResolvedValue(chaseRested(55));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997', '2996']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDurationMs: 2000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(10_000);

      // Ticks at 1s and 2s; the 2s tick finds the deadline reached and stops,
      // so only the first one re-prices.
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('stops every running chase on disconnect', async () => {
      const order = jest.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2997']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await provider.disconnect();
      await jest.advanceTimersByTimeAsync(5000);

      // Disconnecting stops the loop; it does not cancel what is already resting.
      expect(order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });
  });

  describe('Scale ladder is not atomic', () => {
    // grouping 'na' evaluates each entry independently, so the venue can rest
    // some rungs and reject others in the same response.
    const partlyRested = {
      status: 'ok',
      response: {
        data: {
          statuses: [
            { resting: { oid: 11 } },
            { error: 'Insufficient margin' },
            { resting: { oid: 33 } },
          ],
        },
      },
    };

    it('reports only the rungs that actually rested', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(partlyRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(result.childOrderIds).toStrictEqual(['11', '33']);
      // Two of three rungs rested: 0.3334 + 0.3333, not the requested 1.
      expect(result.submittedSize).toBe('0.6667');
    });

    it('cancels only the rungs it actually holds', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(partlyRested) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
    });
  });

  describe('Chase cancel racing a re-pricing tick', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('rests nothing when a cancel lands between the tick cancelling and re-placing', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });

      let sessionId = '';
      let callerCancel: Promise<unknown> | undefined;
      let cancelCalls = 0;
      const cancel = jest.fn().mockImplementation(async () => {
        cancelCalls += 1;
        // Call 1 is the tick's own cancel: the old order is gone and its
        // replacement has not been rested yet. That is precisely the window the
        // guard closes, so the caller's cancel is fired from inside it.
        // `cancelOrder` stops the session synchronously, before its first await.
        if (cancelCalls === 1) {
          callerCancel = provider.cancelOrder({
            orderId: sessionId,
            symbol: 'ETH',
            orderType: 'chase',
          });
        }
        return {
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        };
      });

      useStrategyClients({
        exchange: { order, cancel },
        info: {
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      sessionId = placed.orderId as string;

      await jest.advanceTimersByTimeAsync(1000);
      await callerCancel;

      // Only the original placement. Without the guard the tick would rest a
      // replacement the caller has no handle for and no idea exists.
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('keeps the live child reachable when the tick cancel is refused', async () => {
      let sessionId = '';
      let callerCancel: Promise<CancelOrderResult> | undefined;
      let releasePublicCancel: (() => void) | undefined;
      let cancelCalls = 0;
      const cancel = jest.fn().mockImplementation(async () => {
        cancelCalls += 1;
        if (cancelCalls === 1) {
          mockWalletService.getUserAddressWithDefault.mockReturnValueOnce(
            new Promise((resolve) => {
              releasePublicCancel = (): void =>
                resolve('0x1234567890123456789012345678901234567890');
            }),
          );
          callerCancel = provider.cancelOrder({
            orderId: sessionId,
            symbol: 'ETH',
            orderType: 'chase',
          });
          await Promise.resolve();
          return {
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'multi-sig required' }] },
            },
          };
        }

        return cancelCalls === 2
          ? {
              status: 'ok',
              response: {
                data: { statuses: [{ error: 'multi-sig required' }] },
              },
            }
          : {
              status: 'ok',
              response: { data: { statuses: ['success'] } },
            };
      });

      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel,
        },
        info: {
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      sessionId = placed.orderId as string;

      await jest.advanceTimersByTimeAsync(1000);
      releasePublicCancel?.();

      const first = await callerCancel;
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );

      const retry = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(retry.success).toBe(true);
      expect(cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
    });
  });

  describe('Chase cancel racing the replacement placement', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('cancels the replacement when the cancel lands during its round trip', async () => {
      let sessionId = '';
      let callerCancel: Promise<CancelOrderResult> | undefined;
      let orderCalls = 0;

      const order = jest.fn().mockImplementation(async () => {
        orderCalls += 1;
        // Call 2 is the tick's replacement. Firing the caller's cancel from
        // inside its round trip is the window this closes: `session.orderId` is
        // null for the whole call, which without the fix reads as "nothing
        // rests" and lets the cancel report success and drop the handle while
        // this order is still on its way to the book.
        if (orderCalls === 2) {
          callerCancel = provider.cancelOrder({
            orderId: sessionId,
            symbol: 'ETH',
            orderType: 'chase',
          });
          await Promise.resolve();
        }
        return {
          status: 'ok',
          response: {
            data: {
              statuses: [{ resting: { oid: orderCalls === 1 ? 55 : 66 } }],
            },
          },
        };
      });

      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      sessionId = placed.orderId as string;

      await jest.advanceTimersByTimeAsync(1000);
      const result = await callerCancel;

      // The replacement must not be left live on the exchange with the caller
      // told the chase was cancelled: the cancel waits for it and cancels it.
      expect(result?.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 66 }],
      });

      // And the handle is gone, so nothing of this chase is left unreachable.
      const second = await provider.cancelOrder({
        orderId: sessionId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });
  });

  describe('Fee quoting for strategy placements', () => {
    it('quotes a chase at the maker rate even when isMaker is false', async () => {
      useStrategyClients();

      const chase = await provider.calculateFees({
        orderType: 'chase',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });
      const market = await provider.calculateFees({
        orderType: 'market',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });

      // A chase is post-only, so it can only ever fill as a maker.
      expect(chase.feeRate).toBeLessThan(market.feeRate);
    });

    it('quotes a resting scale ladder at the maker rate', async () => {
      useStrategyClients();

      const scale = await provider.calculateFees({
        orderType: 'scale',
        isMaker: true,
        amount: '1000',
        symbol: 'ETH',
      });
      const limit = await provider.calculateFees({
        orderType: 'limit',
        isMaker: true,
        amount: '1000',
        symbol: 'ETH',
      });

      expect(scale.feeRate).toBe(limit.feeRate);
    });

    it('quotes a TWAP at the taker rate, because its suborders cross', async () => {
      useStrategyClients();

      const twap = await provider.calculateFees({
        orderType: 'twap',
        isMaker: true,
        amount: '1000',
        symbol: 'ETH',
      });
      const market = await provider.calculateFees({
        orderType: 'market',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });

      expect(twap.feeRate).toBe(market.feeRate);
    });
  });

  describe('Strategy notional minimums', () => {
    // validateOrder owns the minimums it can decide without the asset's size
    // grid — the TWAP total and the ordinary per-order minimum. A scale
    // ladder's rungs depend on that grid, so they are checked in the placement
    // path instead; see "Scale ladder is validated before anything is signed".
    it("rejects a TWAP below the venue's minimum total", async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: String(HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd - 1),
        orderType: 'twap',
        twapDuration: 30,
      } as OrderParams);

      expect(result).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
      });
    });

    it("accepts a TWAP at the venue's minimum total", async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: String(HYPERLIQUID_TWAP_LIMITS.MinNotionalUsd),
        orderType: 'twap',
        twapDuration: 30,
      } as OrderParams);

      expect(result).toStrictEqual({ isValid: true });
    });

    it('never reaches the exchange for an under-funded ladder', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        usdAmount: '50',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 20,
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    // A ladder whose average rung clears the minimum can still carry a rung
    // that does not once the skew has weighted it.
    it('never reaches the exchange when a skew starves the cheapest rung', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        usdAmount: '100',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 5,
        scaleSkew: 20,
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('accepts the same ladder without the skew', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 11 } },
                  { resting: { oid: 22 } },
                  { resting: { oid: 33 } },
                  { resting: { oid: 44 } },
                  { resting: { oid: 55 } },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        usdAmount: '100',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 5,
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
    });

    it('never reaches the exchange for an invalid skew', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
        scaleSkew: 0,
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_SKEW_INVALID);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('leaves a chase on the ordinary per-order minimum', async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: '20',
        orderType: 'chase',
      } as OrderParams);

      expect(result).toStrictEqual({ isValid: true });
    });
  });

  describe('Chase tick failures', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    const rested = (oid: number): Record<string, unknown> => ({
      status: 'ok',
      response: { data: { statuses: [{ resting: { oid } }] } },
    });

    const bookAt = (bid: string): Record<string, unknown> => ({
      coin: 'ETH',
      levels: [[{ px: bid, sz: '10', n: 1 }], [{ px: '3001', sz: '10', n: 1 }]],
    });

    it('keeps chasing when a book read fails, leaving the order resting', async () => {
      const order = jest.fn().mockResolvedValue(rested(55));
      const l2Book = jest
        .fn()
        .mockResolvedValueOnce(bookAt('2999'))
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValue(bookAt('2998'));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      // Tick 1 throws on the book read; tick 2 must still happen and re-price.
      await jest.advanceTimersByTimeAsync(2000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });

      // The session survived the transient failure, so its handle still works.
      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(cancelled.success).toBe(true);
    });

    it('ends the session cleanly when the replacement fails to rest', async () => {
      // The old order is cancelled and the re-place throws: nothing is on the
      // book, so the session must not keep claiming to hold a resting order.
      const order = jest
        .fn()
        .mockResolvedValueOnce(rested(55))
        .mockRejectedValue(new Error('insufficient margin'));
      const l2Book = jest
        .fn()
        .mockResolvedValueOnce(bookAt('2999'))
        .mockResolvedValue(bookAt('2998'));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      // Two attempts: the original placement and the failed replacement. No
      // further ticks ran, so the session stopped rather than looping.
      expect(order).toHaveBeenCalledTimes(2);

      // Cancelling reports success and releases the handle, because there is
      // genuinely nothing left resting — it does not report an incomplete
      // cancel forever against the dead order id.
      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(first).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);

      // The handle is released, so a second cancel finds nothing.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });
  });

  describe('A cancel refused because the order already left the book', () => {
    // HyperLiquid answers a cancel it cannot match with this message. It is a
    // rejection of the request but a confirmation of what the caller wanted.
    const alreadyGone = {
      status: 'ok',
      response: {
        data: {
          statuses: [
            { error: 'Order was never placed, already canceled, or filled.' },
          ],
        },
      },
    };

    it('completes a chase cancel whose child had already filled', async () => {
      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel: jest.fn().mockResolvedValue(alreadyGone),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      // Nothing of the chase rests, so the cancel succeeded and the handle is
      // released rather than pinned open on a filled order forever.
      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });

    it('completes a scale cancel when one rung had already filled', async () => {
      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 11 } },
                  { resting: { oid: 22 } },
                  { resting: { oid: 33 } },
                ],
              },
            },
          }),
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  'success',
                  {
                    error:
                      'Order was never placed, already canceled, or filled.',
                  },
                  'success',
                ],
              },
            },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      expect(second.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      );
    });

    it('still reports a genuinely refused cancel as incomplete', async () => {
      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ error: 'multi-sig required' }] } },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      // The order is still on the book, so the handle must survive for a retry.
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );
    });
  });

  describe('Chase reprice when the exchange refuses the cancel', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('leaves the old order alone and retries on the next tick', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const cancel = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'multi-sig required' }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });

      useStrategyClients({
        exchange: { order, cancel },
        info: {
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      // Tick 1's cancel is refused, so no replacement may be placed — doing so
      // would double the position while the old order still rests.
      await jest.advanceTimersByTimeAsync(1000);
      expect(order).toHaveBeenCalledTimes(1);

      // Tick 2 retries and succeeds, so the chase resumes rather than ending.
      await jest.advanceTimersByTimeAsync(1000);
      expect(order).toHaveBeenCalledTimes(2);
    });
  });

  describe('editOrder rejects strategy placements', () => {
    it.each(['twap', 'scale', 'chase'] as OrderType[])(
      'refuses to modify an order into a %s',
      async (orderType) => {
        const { exchangeClient } = useStrategyClients();

        const result = await provider.editOrder({
          orderId: '123',
          newOrder: { ...baseOrder, orderType } as OrderParams,
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_EDIT_STRATEGY_UNSUPPORTED,
        });
        expect(exchangeClient.modify).not.toHaveBeenCalled();
      },
    );
  });

  describe('Scale ladder is validated before anything is signed', () => {
    /**
     * Place a scale order and report what the exchange client saw.
     *
     * @param order - Scale-specific order params.
     * @returns The placement result and the mock exchange client.
     */
    const placeLadder = async (
      order: Record<string, unknown>,
    ): Promise<{ result: OrderResult; exchangeClient: MockClient }> => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        ...order,
      } as OrderParams);

      return { result, exchangeClient };
    };

    it('rejects a range whose rungs collapse onto the same venue price', async () => {
      // ETH has 4 size decimals, so prices carry two. 3000.001 and 3000.002
      // both format to 3000, which would stack the ladder at one price instead
      // of spreading it.
      const { result, exchangeClient } = await placeLadder({
        scaleMinPrice: '3000.001',
        scaleMaxPrice: '3000.002',
        scaleNumOrders: 2,
      });

      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
      // No leverage change and no order: an invalid ladder must not cost a
      // signing prompt or a venue side effect first.
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects a total that cannot give every rung a whole size unit', async () => {
      // BTC has 3 size decimals, so one size unit is 0.001 BTC — about $50
      // here. A 0.019 BTC total is nineteen units to spread over twenty rungs:
      // every rung is worth far more than the $10 minimum, so this is reached
      // only by the grid check, not by the notional one.
      const { result, exchangeClient } = await placeLadder({
        symbol: 'BTC',
        currentPrice: 50000,
        size: '0.019',
        usdAmount: '950',
        scaleMinPrice: '40000',
        scaleMaxPrice: '60000',
        scaleNumOrders: 20,
      });

      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL);
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects a ladder whose rungs fall below the per-order minimum', async () => {
      // $50 over 20 rungs is twenty $2.50 orders; the venue rejects every one.
      const { result, exchangeClient } = await placeLadder({
        usdAmount: '50',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 20,
      });

      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects on the real grid slice, not the average one', async () => {
      // 0.0039 ETH over 20 rungs averages 1.95 size units, but the grid split
      // floors that to 1 unit on nineteen of them and puts the remainder on the
      // first. At the 60000 rung the average slice is worth $11.70 — over the
      // $10 minimum — while the slice actually submitted is worth $6. Only a
      // check against the real grid sizes catches this.
      const { result, exchangeClient } = await placeLadder({
        size: '0.0039',
        usdAmount: '11.70',
        scaleMinPrice: '60000',
        scaleMaxPrice: '70000',
        scaleNumOrders: 20,
      });

      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('submits exactly the ladder it validated', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: {
          data: {
            statuses: [
              { resting: { oid: 11 } },
              { resting: { oid: 22 } },
              { resting: { oid: 33 } },
            ],
          },
        },
      });
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } as OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(
        submitted.orders.map((entry: { p: string }) => entry.p),
      ).toStrictEqual(['2000', '2500', '3000']);
      expect(
        submitted.orders.map((entry: { s: string }) => entry.s),
      ).toStrictEqual(['0.3334', '0.3333', '0.3333']);
    });
  });

  describe('Chase replacements keep the fee they were quoted at', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reuses the placement-time builder fee after the discount is cleared', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });

      useStrategyClients({
        exchange: { order },
        info: {
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2998', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      // The rewards discount is live only around the caller's placeOrder.
      provider.setUserFeeDiscount(5000);
      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      const quotedFee = order.mock.calls[0][0].builder.f;

      // TradingService clears it as soon as placeOrder returns, which for a
      // chase is long before the re-pricing loop runs.
      provider.setUserFeeDiscount(undefined);
      await jest.advanceTimersByTimeAsync(1000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].builder.f).toBe(quotedFee);
    });
  });

  describe('Chase re-prices only what is still resting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * Build an l2Book mock whose touch moves after the first read.
     *
     * @returns The mock.
     */
    const bookThatMoves = (): jest.Mock =>
      jest
        .fn()
        .mockResolvedValueOnce({
          coin: 'ETH',
          levels: [
            [{ px: '2999', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        })
        .mockResolvedValue({
          coin: 'ETH',
          levels: [
            [{ px: '2998', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        });

    it('reads the remainder after the cancel, not before it', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const callOrder: string[] = [];
      const cancel = jest.fn().mockImplementation(async () => {
        callOrder.push('cancel');
        return { status: 'ok', response: { data: { statuses: ['success'] } } };
      });
      const orderStatus = jest.fn().mockImplementation(async () => {
        callOrder.push('orderStatus');
        return {
          status: 'order',
          order: {
            status: 'canceled',
            order: {
              coin: 'ETH',
              side: 'B',
              limitPx: '2999',
              sz: '0.4',
              origSz: '1',
              oid: 55,
              timestamp: 1_700_000_000_000,
              isTrigger: false,
              triggerCondition: 'N/A',
              triggerPx: '0',
              children: [],
              isPositionTpsl: false,
              reduceOnly: false,
              orderType: 'Limit',
            },
          },
        };
      });

      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookThatMoves(), orderStatus },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(1000);

      // Once the cancel has landed no further fills can reach the order, so the
      // remainder it reports is final. Reading first would leave a window in
      // which a fill lands and is then re-placed on top. A liveness read may
      // precede the cancel — what matters is that a read follows it.
      expect(callOrder.slice(callOrder.indexOf('cancel'))).toStrictEqual([
        'cancel',
        'orderStatus',
      ]);
    });

    it('replaces a partly filled order at its remaining size', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });

      useStrategyClients({
        exchange: { order },
        info: {
          l2Book: bookThatMoves(),
          // 0.6 of the 1 ETH had filled by the time the cancel landed.
          orderStatus: jest.fn().mockResolvedValue({
            status: 'order',
            order: {
              status: 'canceled',
              order: {
                coin: 'ETH',
                side: 'B',
                limitPx: '2999',
                sz: '0.4',
                origSz: '1',
                oid: 55,
                timestamp: 1_700_000_000_000,
                isTrigger: false,
                triggerCondition: 'N/A',
                triggerPx: '0',
                children: [],
                isPositionTpsl: false,
                reduceOnly: false,
                orderType: 'Limit',
              },
            },
          }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      expect(order.mock.calls[0][0].orders[0].s).toBe('1');

      await jest.advanceTimersByTimeAsync(1000);

      // The replacement must cover only what was left. Re-placing the original
      // size would buy 1.6 ETH in total against a 1 ETH request.
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].s).toBe('0.4');
    });

    it('ends the session without cancelling when the order already filled', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          l2Book: bookThatMoves(),
          // The order had already filled in full.
          orderStatus: jest.fn().mockResolvedValue({
            status: 'order',
            order: {
              status: 'filled',
              order: {
                coin: 'ETH',
                side: 'B',
                limitPx: '2999',
                sz: '0',
                origSz: '1',
                oid: 55,
                timestamp: 1_700_000_000_000,
                isTrigger: false,
                triggerCondition: 'N/A',
                triggerPx: '0',
                children: [],
                isPositionTpsl: false,
                reduceOnly: false,
                orderType: 'Limit',
              },
            },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      // The order's level is gone from the book, so the tick verifies it rather
      // than assuming, finds it filled, and ends the session — releasing its
      // slot against the concurrency cap without spending a cancel on an order
      // that no longer exists.
      expect(order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });
    });
  });

  describe('Strategy notional is checked against the submitted size', () => {
    it('rejects a TWAP whose size-grid rounding drops it under the venue minimum', async () => {
      const { exchangeClient } = useStrategyClients();

      // A reduce-only order may never round up — the venue rejects a close
      // larger than the position — so its size is floored onto the grid. $100.10
      // of ETH at 3000 floors to 0.0333, which is $99.90: under the venue's $100
      // TWAP minimum, even though the requested notional cleared it. Only a
      // check against the size actually being submitted catches this.
      const result = await provider.placeOrder({
        ...baseOrder,
        size: '0.0334',
        usdAmount: '100.10',
        reduceOnly: true,
        orderType: 'twap',
        twapDuration: 30,
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_TWAP_NOTIONAL_TOO_SMALL,
      );
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
    });
  });

  describe('Chase pricing against the book', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /**
     * A book with the given bid levels and a fixed ask.
     *
     * @param bids - Bid levels, best first.
     * @returns The l2Book payload.
     */
    const bookWithBids = (
      bids: { px: string; sz: string }[],
    ): Record<string, unknown> => ({
      coin: 'ETH',
      levels: [
        bids.map((level) => ({ ...level, n: 1 })),
        [{ px: '3005', sz: '10', n: 1 }],
      ],
    });

    it('joins the touch when the spread is a single tick', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      useStrategyClients({
        exchange: { order },
        info: {
          l2Book: jest.fn().mockResolvedValue({
            coin: 'ETH',
            levels: [
              [{ px: '2999.9', sz: '10', n: 1 }],
              [{ px: '3000', sz: '10', n: 1 }],
            ],
          }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      // Improving would cross, which a post-only order cannot do, so it joins
      // the bid instead of resting a tick above it.
      expect(order.mock.calls[0][0].orders[0].p).toBe('2999.9');
    });

    it('re-prices when the external touch moves behind its own order', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });

      // Tick 1: the chase's own 1 ETH at 2999.1 tops the book, with a real
      // external bid of 2999 beneath it. Tick 2: that external bid drops to
      // 2990 and only the chase's own order is left at the top.
      const l2Book = jest
        .fn()
        .mockResolvedValueOnce(bookWithBids([{ px: '2999', sz: '10' }]))
        .mockResolvedValue(
          bookWithBids([
            { px: '2999.1', sz: '1' },
            { px: '2990', sz: '10' },
          ]),
        );

      useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      expect(order.mock.calls[0][0].orders[0].p).toBe('2999.1');

      await jest.advanceTimersByTimeAsync(1000);

      // Reading the raw book would see its own 2999.1 as the best bid, conclude
      // nothing had moved, and sit there while the market walked away. Netting
      // its own size out of that level exposes the real 2990 touch.
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('2990.1');
    });
  });

  describe('Chase concurrency cap', () => {
    it("refuses a chase beyond the venue's simultaneous limit", async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      for (
        let placed = 0;
        placed < CHASE_ORDER_CONFIG.MaxActiveSessions;
        placed++
      ) {
        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'chase',
        } as OrderParams);
        expect(result.success).toBe(true);
      }

      const overflow = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(overflow.success).toBe(false);
      expect(overflow.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED);
      expect(exchangeClient.order).toHaveBeenCalledTimes(
        CHASE_ORDER_CONFIG.MaxActiveSessions,
      );
    });

    it('refuses an overflow chase before signing or changing leverage', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      for (
        let placed = 0;
        placed < CHASE_ORDER_CONFIG.MaxActiveSessions;
        placed += 1
      ) {
        await provider.placeOrder({
          ...baseOrder,
          orderType: 'chase',
        } as OrderParams);
      }
      (exchangeClient.updateLeverage as jest.Mock).mockClear();

      const overflow = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        leverage: 5,
      } as OrderParams);

      // Refused before the shared preamble, which completes the signing setup
      // and applies leverage — neither should be spent on a request that was
      // always going to be turned away.
      expect(overflow.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED);
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
    });

    it('frees a slot when a chase is cancelled', async () => {
      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      const placed = [];
      for (
        let index = 0;
        index < CHASE_ORDER_CONFIG.MaxActiveSessions;
        index++
      ) {
        placed.push(
          await provider.placeOrder({
            ...baseOrder,
            orderType: 'chase',
          } as OrderParams),
        );
      }

      await provider.cancelOrder({
        orderId: placed[0].orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      const replacement = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      expect(replacement.success).toBe(true);
    });
  });

  describe('Chase cancel racing the post-cancel remainder read', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('rests nothing when a cancel lands during the remainder read', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });

      let sessionId = '';
      let callerCancel: Promise<CancelOrderResult> | undefined;
      const orderStatus = jest.fn().mockImplementation(async () => {
        // The old order is already cancelled and the replacement has not gone
        // up. A caller cancelling here finds nothing to cancel, reports success
        // and drops the handle — so the tick must not rest anything after it.
        callerCancel = provider.cancelOrder({
          orderId: sessionId,
          symbol: 'ETH',
          orderType: 'chase',
        });
        await Promise.resolve();
        return {
          status: 'order',
          order: {
            status: 'canceled',
            order: {
              coin: 'ETH',
              side: 'B',
              limitPx: '2999.1',
              sz: '1',
              origSz: '1',
              oid: 55,
              timestamp: 1_700_000_000_000,
              isTrigger: false,
              triggerCondition: 'N/A',
              triggerPx: '0',
              children: [],
              isPositionTpsl: false,
              reduceOnly: false,
              orderType: 'Limit',
            },
          },
        };
      });

      useStrategyClients({
        exchange: { order },
        info: {
          orderStatus,
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2990', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      sessionId = placed.orderId as string;

      await jest.advanceTimersByTimeAsync(1000);
      await callerCancel;

      // Only the original placement: no unreachable replacement was left live.
      expect(order).toHaveBeenCalledTimes(1);
    });
  });

  describe('Chase state when a post-cancel read fails', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('ends the session rather than rescheduling a chase with nothing resting', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          // The cancel succeeds, then the remainder lookup fails.
          orderStatus: jest.fn().mockRejectedValue(new Error('network blip')),
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [{ px: '2990', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      // The order was cancelled, so nothing rests. Recovery must not keep
      // ticking a session that has no live order.
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      expect(order).toHaveBeenCalledTimes(1);

      // And the handle releases cleanly instead of reporting an incomplete
      // cancel against an order that is already gone.
      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });
    });
  });

  describe('Chase concurrency cap under concurrent placement', () => {
    it('does not exceed the cap when placements overlap', async () => {
      const order = jest.fn().mockImplementation(async () => {
        // Every placement is in flight at once: the cap is checked before this
        // resolves, so a check that does not reserve its slot lets them all in.
        await Promise.resolve();
        return {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        };
      });
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      const attempts = CHASE_ORDER_CONFIG.MaxActiveSessions + 3;
      const results = await Promise.all(
        Array.from({ length: attempts }, async () =>
          provider.placeOrder({
            ...baseOrder,
            orderType: 'chase',
          } as OrderParams),
        ),
      );

      const accepted = results.filter((result) => result.success);
      expect(accepted).toHaveLength(CHASE_ORDER_CONFIG.MaxActiveSessions);
      expect(exchangeClient.order).toHaveBeenCalledTimes(
        CHASE_ORDER_CONFIG.MaxActiveSessions,
      );
      results
        .filter((result) => !result.success)
        .forEach((result) => {
          expect(result.error).toBe(
            PERPS_ERROR_CODES.ORDER_CHASE_LIMIT_REACHED,
          );
        });
    });
  });

  describe('Chase netting uses the live resting size', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sees external liquidity sharing its level after a partial fill', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });

      // The chase placed 1 ETH at 2999.1 and 0.8 of it has since filled, so
      // only 0.2 is its own. The level shows 0.5 — the other 0.3 is external,
      // and it is still the best bid.
      const orderStatus = jest.fn().mockResolvedValue({
        status: 'order',
        order: {
          status: 'open',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: '0.2',
            origSz: '1',
            oid: 55,
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            triggerCondition: 'N/A',
            triggerPx: '0',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
          },
        },
      });

      useStrategyClients({
        exchange: { order },
        info: {
          orderStatus,
          l2Book: jest
            .fn()
            .mockResolvedValueOnce({
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            })
            .mockResolvedValue({
              coin: 'ETH',
              levels: [
                [
                  { px: '2999.1', sz: '0.5', n: 2 },
                  { px: '2900', sz: '10', n: 1 },
                ],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(1000);

      // Netting the live 0.2 leaves 0.3 of external size at 2999.1, so that is
      // still the best external bid and the chase improves on it by a tick.
      // Netting the stale 1 ETH would wipe the level out entirely and quote off
      // the 2900 level below — 99 dollars away from the real touch.
      expect(orderStatus).toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('2999.2');
    });
  });

  describe('Chase placement racing a disconnect', () => {
    /**
     * Tear the provider down from inside the mid-flight order submission.
     *
     * The teardown models what `HyperLiquidClientService.disconnect` does:
     * it drops the service's client reference synchronously, so every later
     * `getExchangeClient` throws, while the instance already handed out keeps
     * working. Anything the provider wants to do about its in-flight order has
     * to be done through the client it is already holding.
     *
     * @param cancel - The cancel the retraction attempt will get back.
     * @returns The placement result and the exchange client that served it.
     */
    const placeChaseTornDownMidFlight = async (
      cancel: jest.Mock,
    ): Promise<{ placed: OrderResult; exchangeClient: MockClient }> => {
      let disconnected: Promise<unknown> | undefined;
      const order = jest.fn().mockImplementation(async () => {
        // The order is on its way to the venue when the provider is torn down.
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        };
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order, cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      await disconnected;

      return { placed, exchangeClient };
    };

    it('retracts the order it could not put a strategy behind', async () => {
      const cancel = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });
      const { placed, exchangeClient } =
        await placeChaseTornDownMidFlight(cancel);

      // The placement is reported as a failure, so nothing downstream treats it
      // as an order that exists: the caches a successful placement invalidates
      // are not invalidated, and no handle names it. Leaving it resting would
      // make that report false at the venue — and the exchange id is only good
      // while this provider still points at the account that placed it, which a
      // disconnect is the usual prelude to changing. So it is taken back and the
      // failure is true on both sides.
      //
      // The teardown has already made `getExchangeClient` throw, so the cancel
      // can only have gone through the instance captured before the submission.
      // A provider that looked a client up at retraction time would never have
      // sent this request at all.
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.orderId).toBeUndefined();
      // Nothing rests, so there is no id worth handing back: naming one would
      // send the caller to cancel an order that is already gone.
      expect(placed.childOrderIds).toBeUndefined();
    });

    it('reports the resting order when it cannot be retracted', async () => {
      // The venue refuses the cancel and the order stays on the book. This is
      // the only case where the caller is left holding a live order, so it is
      // the only one that gets an id to reach it with.
      const cancel = jest.fn().mockResolvedValue({
        status: 'ok',
        response: {
          data: { statuses: [{ error: 'Order could not be found' }] },
        },
      });
      const { placed, exchangeClient } =
        await placeChaseTornDownMidFlight(cancel);

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toStrictEqual(['55']);

      // Reachable through the ordinary single-order cancel, which is the only
      // route that can name it once no session holds it. That cancel runs on a
      // provider that has since reconnected, so the service serves a client
      // again — the id is only worth anything while that client still signs as
      // the account the order was placed under.
      mockClientService.getExchangeClient.mockReturnValue(
        exchangeClient as never,
      );
      const cancelled = await provider.cancelOrder({
        orderId: (placed.childOrderIds as string[])[0],
        symbol: 'ETH',
      });
      expect(cancelled.orderId).toBe('55');
    });

    it('reports the resting order when the retraction itself fails', async () => {
      // A provider mid-teardown can fail the cancel outright rather than have
      // it refused. Best-effort by construction: the placement still resolves
      // as an abandoned chase rather than throwing the cancel's error.
      const cancel = jest.fn().mockRejectedValue(new Error('client torn down'));
      const { placed } = await placeChaseTornDownMidFlight(cancel);

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toStrictEqual(['55']);
    });

    it('places nothing when the teardown lands during the book read', async () => {
      let disconnected: Promise<unknown> | undefined;
      const { exchangeClient } = useStrategyClients({
        info: {
          // The book read is a round trip after the preamble's own checks, so
          // a disconnect can land inside it.
          l2Book: jest.fn().mockImplementation(async () => {
            disconnected = provider.disconnect();
            await Promise.resolve();
            return {
              coin: 'ETH',
              levels: [
                [{ px: '2999', sz: '10', n: 1 }],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            };
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      await disconnected;

      // Nothing is signed: the check between the book read and the submission
      // means no window between two awaits on this path ends in a fresh order
      // for a provider that has already stopped.
      expect(exchangeClient.order).not.toHaveBeenCalled();
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toBeUndefined();
    });
  });

  describe('Two chases on the same side do not leapfrog each other', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('treats another session of its own as not-external liquidity', async () => {
      let placements = 0;
      const order = jest.fn().mockImplementation(async () => {
        placements += 1;
        return {
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 54 + placements } }] },
          },
        };
      });

      // The external bid never moves. The first two reads are the placements,
      // when nothing of ours is resting yet; afterwards the book carries the
      // two chases' combined 2 ETH at 2999.1 on top of the external 2999.
      let bookReads = 0;
      const l2Book = jest.fn().mockImplementation(async () => {
        bookReads += 1;
        const bids =
          bookReads <= 2
            ? [{ px: '2999', sz: '10', n: 1 }]
            : [
                { px: '2999.1', sz: '2', n: 2 },
                { px: '2999', sz: '10', n: 1 },
              ];
        return {
          coin: 'ETH',
          levels: [bids, [{ px: '3001', sz: '10', n: 1 }]],
        };
      });

      useStrategyClients({ exchange: { order }, info: { l2Book } });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      expect(order).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(5000);

      // Netting only its own order, each session would read the other's 1 ETH
      // as external size at 2999.1, improve to 2999.2, then improve on that —
      // walking each other up an unchanged market. Netting everything this
      // provider holds leaves 2999 as the real touch, the quote unchanged, and
      // no re-price at all.
      expect(order).toHaveBeenCalledTimes(2);
    });
  });

  describe('Chase fee rate against the user schedule', () => {
    it('quotes the maker rate even when the account has its own fee tier', async () => {
      const { infoClient } = useStrategyClients({
        info: {
          // These are the fields the fee path actually reads; a `feeSchedule`
          // shape parses to NaN and falls back to the base rates, which would
          // make this test pass without ever entering the branch it is about.
          userFees: jest.fn().mockResolvedValue({
            userCrossRate: '0.00030',
            userAddRate: '0.00010',
            userSpotCrossRate: '0.00040',
            userSpotAddRate: '0.00020',
            activeReferralDiscount: '0',
            dailyUserVlm: [],
          }),
        },
      });

      const chase = await provider.calculateFees({
        orderType: 'chase',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });
      const market = await provider.calculateFees({
        orderType: 'market',
        isMaker: false,
        amount: '1000',
        symbol: 'ETH',
      });

      // The account's own schedule was consulted, not the fallback base rates.
      expect(infoClient.userFees).toHaveBeenCalled();
      // A chase is post-only whatever the caller passes, and that has to hold
      // for the account's own schedule as well as the base rates.
      expect(chase.feeRate).toBeLessThan(market.feeRate);
    });
  });

  describe('Chase placement racing a disconnect during preparation', () => {
    it('places nothing when the teardown lands during preparation', async () => {
      let disconnected: Promise<unknown> | undefined;
      const { exchangeClient } = useStrategyClients({
        exchange: {
          // The leverage update is part of the shared preamble, before the
          // chase handler is even reached.
          updateLeverage: jest.fn().mockImplementation(async () => {
            disconnected = provider.disconnect();
            await Promise.resolve();
            return { status: 'ok' };
          }),
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        leverage: 5,
        chaseIntervalMs: 1000,
      } as OrderParams);
      await disconnected;

      // The disconnect landed during the preamble, which is before the chase
      // reads the book or submits anything — so no order is created for a
      // provider that has been torn down, and there is nothing left resting to
      // report.
      expect(exchangeClient.order).not.toHaveBeenCalled();
      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(placed.childOrderIds).toBeUndefined();
    });
  });
});
