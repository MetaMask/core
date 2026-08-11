import { HYPERLIQUID_TWAP_LIMITS } from '../../../src/constants/perpsConfig.js';
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
      // Best bid, not the mid: a post-only buy has to sit on the bid side.
      expect(submitted.orders[0].p).toBe('2999');
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
      expect(submitted.orders[0].p).toBe('3001');
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
      expect(order.mock.calls[1][0].orders[0].p).toBe('2998');
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
    // validateOrder runs the real minimum checks; the mocked param validator
    // only covers the sync shape rules.
    it('rejects a ladder whose rungs fall below the per-order minimum', async () => {
      useStrategyClients();

      // $50 over 20 rungs is twenty $2.50 orders; the venue rejects every one.
      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: '50',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 20,
      } as OrderParams);

      expect(result).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      });
    });

    it('accepts a ladder whose rungs each clear the minimum', async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: '400',
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 20,
      } as OrderParams);

      expect(result).toStrictEqual({ isValid: true });
    });

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

  describe('Scale notional is bounded by the cheapest rung', () => {
    it('rejects a ladder resting below spot whose rungs fall short', async () => {
      useStrategyClients();

      // $220 over 20 rungs is $11 a rung at spot (3000) — above the $10
      // minimum — but the rungs rest at 1000..1200, where the cheapest is
      // worth about $3.67. The venue would reject it.
      const result = await provider.validateOrder({
        ...baseOrder,
        size: '0.0733',
        usdAmount: '220',
        orderType: 'scale',
        scaleMinPrice: '1000',
        scaleMaxPrice: '1200',
        scaleNumOrders: 20,
      } as OrderParams);

      expect(result).toStrictEqual({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_NOTIONAL_TOO_SMALL,
      });
    });

    it('accepts a ladder whose cheapest rung clears the minimum', async () => {
      useStrategyClients();

      // Same ladder, sized so the rung at 1000 is worth $10.
      const result = await provider.validateOrder({
        ...baseOrder,
        size: '0.2',
        usdAmount: '600',
        orderType: 'scale',
        scaleMinPrice: '1000',
        scaleMaxPrice: '1200',
        scaleNumOrders: 20,
      } as OrderParams);

      expect(result).toStrictEqual({ isValid: true });
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
});
