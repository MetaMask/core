import { BUILDER_FEE_CONFIG } from '../../../src/constants/hyperLiquidConfig.js';
import {
  CHASE_ORDER_CONFIG,
  CHASE_ORDER_STATUS,
  HYPERLIQUID_TWAP_LIMITS,
  PERFORMANCE_CONFIG,
  PROVIDER_CONFIG,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import { TradingReadinessCache } from '../../../src/services/TradingReadinessCache.js';
import type {
  CancelOrderResult,
  ChaseOrderMaxDistanceReached,
  Order,
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
  createDeferred,
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

type MockClearinghouseBalance = {
  marginSummary: {
    totalMarginUsed: string;
    accountValue: string;
  };
  withdrawable: string;
  assetPositions: never[];
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
  };
};

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
  twapHistory: jest.fn().mockResolvedValue([]),
  userFills: jest.fn().mockResolvedValue([]),
  userFillsByTime: jest.fn().mockResolvedValue([]),
  userFunding: jest.fn().mockResolvedValue([]),
  userTwapSliceFills: jest.fn().mockResolvedValue([]),
  ...overrides,
});

/**
 * Build the write-side client the provider signs through.
 *
 * @param overrides - Methods to replace or add for a single test.
 * @returns The mock exchange client.
 */
const createMockExchangeClient = (overrides: MockClient = {}): MockClient => ({
  order: jest.fn().mockImplementation((request: { orders: unknown[] }) =>
    Promise.resolve({
      status: 'ok',
      response: {
        data: {
          statuses: request.orders.map((_order, index) => ({
            resting: { oid: 123 + index },
          })),
        },
      },
    }),
  ),
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

let mockMessenger = createMockMessenger();

/**
 * Build a provider backed by the mock services above.
 *
 * @param options - Provider construction options.
 * @param options.isTestnet - Whether the provider runs against testnet.
 * @param options.initialAssetMapping - Pre-seeded symbol-to-asset-ID entries.
 * @param options.hip3Enabled - Whether HIP-3 routes are enabled.
 * @param options.allowlistMarkets - HIP-3 market allowlist.
 * @param options.blocklistMarkets - HIP-3 market blocklist.
 * @param options.useUnifiedAccount - Whether HIP-3 orders use unified collateral.
 * @param options.onChaseOrderMaxDistanceReached - Chase boundary callback.
 * @returns The provider under test.
 */
const createTestProvider = (
  options: {
    isTestnet?: boolean;
    initialAssetMapping?: [string, number][];
    hip3Enabled?: boolean;
    allowlistMarkets?: string[];
    blocklistMarkets?: string[];
    useUnifiedAccount?: boolean;
    onChaseOrderMaxDistanceReached?: (
      event: ChaseOrderMaxDistanceReached,
    ) => void;
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
    mockMessenger = createMockMessenger();
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
      // A Chase reads liveness before re-pricing. Tests that cancel a child
      // override this with the final canceled remainder when it matters.
      orderStatus: jest.fn().mockResolvedValue({
        status: 'order',
        order: {
          status: 'open',
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

  const useHip3Capabilities = (
    infoOverrides: MockClient = {},
    providerOptions: {
      hip3Enabled?: boolean;
      allowlistMarkets?: string[];
      blocklistMarkets?: string[];
    } = {},
  ): {
    capabilityProvider: HyperLiquidProvider;
    infoClient: MockClient;
  } => {
    const { infoClient } = useStrategyClients({
      info: {
        perpDexs: jest.fn().mockResolvedValue([null, { name: 'xyz' }]),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          collateralToken: 0,
        }),
        ...infoOverrides,
      },
    });
    return {
      capabilityProvider: createTestProvider({
        hip3Enabled: true,
        ...providerOptions,
        allowlistMarkets: providerOptions.allowlistMarkets ?? ['xyz:*'],
      }),
      infoClient,
    };
  };

  const baseOrder = {
    symbol: 'ETH',
    isBuy: true,
    size: '1',
    usdAmount: '3000',
    currentPrice: 3000,
    providerId: PROVIDER_CONFIG.DefaultProvider,
  };

  const activeEthTwapHistory = [
    {
      time: 1_700_000_030,
      twapId: 987,
      state: {
        coin: 'ETH',
        executedNtl: '0',
        executedSz: '0',
        minutes: 30,
        randomize: false,
        reduceOnly: false,
        side: 'B',
        sz: '1',
        timestamp: 1_700_000_000_000,
        user: '0x1234567890123456789012345678901234567890',
      },
      status: { status: 'activated' },
    },
  ];

  const createClearinghouseBalance = (
    withdrawable: string,
  ): MockClearinghouseBalance => ({
    marginSummary: {
      totalMarginUsed: '0',
      accountValue: withdrawable,
    },
    withdrawable,
    assetPositions: [],
    crossMarginSummary: {
      accountValue: withdrawable,
      totalMarginUsed: '0',
    },
  });

  describe('Builder fee policy', () => {
    it('applies one builder context to a default parent and TP/SL batch', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      } satisfies OrderParams);

      expect(exchangeClient.order.mock.calls[0][0]).toMatchObject({
        orders: expect.any(Array),
        builder: {
          b: BUILDER_FEE_CONFIG.MainnetBuilder,
          f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
        },
      });
      expect(exchangeClient.order.mock.calls[0][0].orders).toHaveLength(3);
    });

    it('applies one builder context to a position TP/SL batch', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order.mock.calls[0][0].builder).toStrictEqual({
        b: BUILDER_FEE_CONFIG.MainnetBuilder,
        f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
      });
    });

    it('keeps existing protection when builder approval fails', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          approveBuilderFee: jest
            .fn()
            .mockRejectedValue(new Error('Builder approval failed')),
        },
        info: {
          maxBuilderFee: jest.fn().mockResolvedValue(0),
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalled();
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('does not replace whole-position protection when pre-cancel is refused', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: { statuses: [{ error: 'Invalid nonce' }] },
            },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['456'],
      });
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('reports lost protection when the old cancel outcome is unknown', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success'] } },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
            {
              coin: 'ETH',
              oid: 457,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: ['456', '457'],
      });
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('restores whole-position protection when replacement fails after pre-cancel', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 456 }],
      });
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'positionTpsl',
        orders: [
          {
            a: 1,
            b: false,
            p: '3400',
            s: '0',
            r: true,
            t: {
              trigger: {
                isMarket: false,
                triggerPx: '3400',
                tpsl: 'tp',
              },
            },
          },
        ],
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        order.mock.invocationCallOrder[0],
      );
      expect(order.mock.invocationCallOrder[0]).toBeLessThan(
        order.mock.invocationCallOrder[1],
      );
    });

    it.each([
      {
        label: 'returns a rejected status',
        restoreResult: {
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected restoration' }] },
          },
        },
      },
      {
        label: 'throws',
        restoreResult: new Error('Restoration unavailable'),
      },
    ])(
      'reports lost protection when restoration $label',
      async ({ restoreResult }) => {
        const order = jest.fn().mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        });
        if (restoreResult instanceof Error) {
          order.mockRejectedValueOnce(restoreResult);
        } else {
          order.mockResolvedValueOnce(restoreResult);
        }
        useStrategyClients({
          exchange: { order },
          info: {
            frontendOpenOrders: jest.fn().mockResolvedValue([
              {
                coin: 'ETH',
                side: 'A',
                limitPx: '3400',
                sz: '0',
                origSz: '0',
                oid: 456,
                timestamp: 1_700_000_000_000,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                triggerCondition: 'Price above 3400',
                triggerPx: '3400',
                orderType: 'Take Profit Limit',
                children: [],
              },
            ]),
          },
        });

        const result = await provider.updatePositionTPSL({
          symbol: 'ETH',
          takeProfitPrice: '3500',
        });

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
          childOrderIds: [],
        });
        expect(order).toHaveBeenCalledTimes(2);
      },
    );

    it('reports recreated protection IDs when restoration is incomplete', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: [
                { error: 'Rejected take profit' },
                { error: 'Rejected stop loss' },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      useStrategyClients({
        exchange: {
          order,
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success'] } },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 457,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2400',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: ['789'],
      });
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('restores only the order confirmed cancelled when replacement fails', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: [
                { error: 'Rejected take profit' },
                { error: 'Rejected stop loss' },
              ],
            },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      useStrategyClients({
        exchange: {
          order,
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
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 457,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2400',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'positionTpsl',
        orders: [
          {
            a: 1,
            b: false,
            p: '2450',
            s: '0',
            r: true,
            t: {
              trigger: {
                isMarket: true,
                triggerPx: '2500',
                tpsl: 'sl',
              },
            },
          },
        ],
      });
      expect(order.mock.calls[1][0].orders).toHaveLength(1);
    });

    it('restores a standalone trigger with its remaining size and builder fee', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          maxBuilderFee: jest
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(BUILDER_FEE_CONFIG.MaxFeeDecimal),
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0.4',
              origSz: '0.6',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: false,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledWith({
        builder: BUILDER_FEE_CONFIG.MainnetBuilder,
        maxFeeRate: BUILDER_FEE_CONFIG.MaxFeeRate,
      });
      expect(order.mock.calls[0][0]).toHaveProperty('builder');
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'na',
        builder: {
          b: BUILDER_FEE_CONFIG.MainnetBuilder,
          f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
        },
        orders: [
          expect.objectContaining({
            p: '2450',
            s: '0.4',
            t: {
              trigger: {
                isMarket: true,
                triggerPx: '2500',
                tpsl: 'sl',
              },
            },
          }),
        ],
      });
    });

    it('accepts an old TP/SL order that is already gone before replacement', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  {
                    error:
                      'Order was never placed, already canceled, or filled.',
                  },
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
      });

      expect(result).toStrictEqual({
        success: true,
        orderId: 'TP/SL orders placed',
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        exchangeClient.order.mock.invocationCallOrder[0],
      );
    });

    it('rejects a TP/SL batch with one failed placement status', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
    });

    it('returns a recoverable ID when partial-placement cleanup is refused', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ error: 'Invalid nonce' }] } },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['123'],
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
    });

    it('reports lost protection when whole-position cleanup is refused', async () => {
      const cancel = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success', 'success'] } },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ error: 'Invalid nonce' }] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel,
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              oid: 456,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Take Profit Limit',
              children: [],
            },
            {
              coin: 'ETH',
              oid: 457,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_PROTECTION_LOST,
        childOrderIds: ['123'],
      });
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
    });

    it('reports a filled partial trigger without trying to cancel it', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { filled: { oid: 123 } },
                  { error: 'Rejected stop loss' },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
        stopLossPrice: '2500',
        stopLossSize: '0.6',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['123'],
      });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
    });

    it('restores protection removed by a mixed old pre-cancel without placing the replacement', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: ['success', { error: 'Invalid nonce' }],
              },
            },
          }),
        },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '2450',
              sz: '0',
              origSz: '0',
              oid: 457,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price below 2500',
              triggerPx: '2500',
              orderType: 'Stop Market',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        childOrderIds: ['457', '123'],
      });
      expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
        }),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({ method: 'updatePositionTPSL' }),
          }),
        }),
      );
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 456 },
          { a: 1, o: 457 },
        ],
      });
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.order).toHaveBeenCalledWith(
        expect.objectContaining({
          grouping: 'positionTpsl',
          orders: [expect.objectContaining({ p: '3400' })],
        }),
      );
    });

    it('accepts one successful placement status per TP/SL order', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 123 } },
                  { resting: { oid: 124 } },
                ],
              },
            },
          }),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order.mock.calls[0][0].orders).toHaveLength(2);
    });

    it('cancels old protection before placing partial TP/SL', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledWith(
        expect.objectContaining({ grouping: 'na' }),
      );
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 456 }],
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        exchangeClient.order.mock.invocationCallOrder[0],
      );
    });

    it('restores old protection when a partial TP/SL replacement fails', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Rejected replacement' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ resting: { oid: 789 } }] },
          },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'ETH',
              side: 'A',
              limitPx: '3400',
              sz: '0',
              origSz: '0',
              oid: 456,
              timestamp: 1_700_000_000_000,
              reduceOnly: true,
              isTrigger: true,
              isPositionTpsl: true,
              triggerCondition: 'Price above 3400',
              triggerPx: '3400',
              orderType: 'Take Profit Limit',
              children: [],
            },
          ]),
        },
      });

      const result = await provider.updatePositionTPSL({
        symbol: 'ETH',
        takeProfitPrice: '3500',
        takeProfitSize: '0.4',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.TPSL_UPDATE_FAILED,
      });
      expect(exchangeClient.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        order.mock.invocationCallOrder[0],
      );
      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0]).toMatchObject({
        grouping: 'positionTpsl',
        orders: [expect.objectContaining({ p: '3400', s: '0' })],
      });
    });
  });

  describe('TWAP placement', () => {
    it('does not request builder-fee approval', async () => {
      const { exchangeClient } = useStrategyClients({
        info: { maxBuilderFee: jest.fn().mockResolvedValue(0) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      });

      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(exchangeClient.twapOrder).toHaveBeenCalledWith({
        twap: expect.objectContaining({ a: 1, m: 30 }),
      });
    });

    it('approves the builder fee when a standard order follows a TWAP', async () => {
      const { exchangeClient } = useStrategyClients({
        info: { maxBuilderFee: jest.fn().mockResolvedValue(0) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      });
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      });

      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
    });

    it.each([
      [undefined, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_REQUIRED],
      [1.5, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID],
      [0, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID],
      [
        HYPERLIQUID_TWAP_LIMITS.MaxDurationMinutes + 1,
        PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
      ],
      [2 ** 53, PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID],
    ])(
      'rejects provider-level TWAP duration %p before submission',
      async (twapDuration, expectedError) => {
        const { exchangeClient } = useStrategyClients();

        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'twap',
          twapDuration,
        } satisfies OrderParams);

        expect(result.error).toBe(expectedError);
        expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
      },
    );

    it('still approves the builder fee when a standard order joins TWAP setup', async () => {
      const spotMetaRequestStarted = createDeferred<void>();
      const pendingSpotMeta = createDeferred<{
        tokens: { name: string; tokenId: string; index: number }[];
        universe: never[];
      }>();
      const { exchangeClient } = useStrategyClients({
        info: {
          maxBuilderFee: jest.fn().mockResolvedValue(0),
          perpDexs: jest.fn().mockResolvedValue([null]),
          spotMeta: jest.fn().mockImplementation(() => {
            spotMetaRequestStarted.resolve();
            return pendingSpotMeta.promise;
          }),
        },
      });
      provider = createTestProvider({ hip3Enabled: true });

      const twapOrder = provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      });
      await spotMetaRequestStarted.promise;
      const standardOrder = provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      });
      pendingSpotMeta.resolve({
        tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
        universe: [],
      });

      await Promise.all([twapOrder, standardOrder]);
      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
    });

    it('does not restore spot metadata after disconnect', async () => {
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const spotMetaRequestStarted = createDeferred<void>();
      const pendingSpotMeta = createDeferred<{
        tokens: { name: string; tokenId: string; index: number }[];
        universe: never[];
      }>();
      const spotMeta = jest
        .fn()
        .mockImplementationOnce(() => {
          spotMetaRequestStarted.resolve();
          return pendingSpotMeta.promise;
        })
        .mockResolvedValue({
          tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
          universe: [],
        });
      useStrategyClients({ info: { spotMeta } });

      const staleOrder = provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      });
      await spotMetaRequestStarted.promise;
      const disconnectPromise = provider.disconnect();
      pendingSpotMeta.resolve({
        tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
        universe: [],
      });

      expect(await staleOrder).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(await disconnectPromise).toStrictEqual({ success: true });

      expect(await provider.initialize()).toMatchObject({
        success: true,
      });
      expect(
        await provider.placeOrder({
          ...baseOrder,
          orderType: 'market',
        }),
      ).toMatchObject({ success: true });
      expect(spotMeta).toHaveBeenCalledTimes(2);
    });

    it('submits the venue TWAP action rather than an order', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
        twapRandomize: true,
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient margin');
    });

    it.each(['987', Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
      'rejects malformed TWAP response id %p',
      async (twapId) => {
        useStrategyClients({
          exchange: {
            twapOrder: jest.fn().mockResolvedValue({
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId } } },
              },
            }),
          },
        });

        const result = await provider.placeOrder({
          ...baseOrder,
          orderType: 'twap',
          twapDuration: 30,
        } satisfies OrderParams);

        expect(result.success).toBe(false);
        expect(result.orderId).toBeUndefined();
        expect(result.error).toBe('TWAP order rejected');
      },
    );
  });

  describe('TWAP cancellation', () => {
    it('uses the TWAP cancel endpoint, never the order cancel endpoint', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          twapHistory: jest.fn().mockResolvedValue(activeEthTwapHistory),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it.each(['987junk', 'NaN', '-1', '1.5', '9007199254740992'])(
      'rejects malformed TWAP handle %p before signing',
      async (orderId) => {
        const { exchangeClient } = useStrategyClients();

        const result = await provider.cancelOrder({
          orderId,
          symbol: 'ETH',
          orderType: 'twap',
          providerId: 'hyperliquid',
        });

        expect(result).toStrictEqual({
          success: false,
          orderId,
          error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
        });
        expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
        expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      },
    );

    it('treats an already-finished TWAP cancel as successful', async () => {
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
        info: {
          twapHistory: jest.fn().mockResolvedValue(activeEthTwapHistory),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
    });

    it('reports a refused TWAP cancel as a failure', async () => {
      useStrategyClients({
        exchange: {
          twapCancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: 'Invalid nonce' } },
            },
          }),
        },
        info: {
          twapHistory: jest.fn().mockResolvedValue(activeEthTwapHistory),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.EXCHANGE_INVALID_NONCE);
    });

    it('rejects a handle that neither tracking nor venue history can authenticate', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.cancelOrder({
        orderId: '654321',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '654321',
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
    });

    it('cancels an untracked TWAP when venue history is temporarily unavailable', async () => {
      const { exchangeClient } = useStrategyClients({
        info: {
          twapHistory: jest
            .fn()
            .mockRejectedValue(new Error('History unavailable')),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({ success: true, orderId: '987' });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
    });

    it('does not authenticate an unknown TWAP through a failed history read', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          twapCancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              type: 'twapCancel',
              data: { status: { error: 'Twap not found' } },
            },
          }),
        },
        info: {
          twapHistory: jest
            .fn()
            .mockRejectedValue(new Error('History unavailable')),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '987',
        symbol: 'ETH',
        orderType: 'twap',
        providerId: 'hyperliquid',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '987',
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
    });

    it('preserves handle ownership across provider recreation', async () => {
      const { exchangeClient } = useStrategyClients();
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await provider.disconnect();
      const recreatedProvider = createTestProvider({
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
        ],
      });

      expect(
        await recreatedProvider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'BTC',
          orderType: 'twap',
          providerId: 'hyperliquid',
        }),
      ).toStrictEqual({
        success: false,
        orderId: placed.orderId,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();

      expect(
        await recreatedProvider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'twap',
          providerId: 'hyperliquid',
        }),
      ).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
    });

    it('leaves an ordinary cancel on the order endpoint', async () => {
      const { exchangeClient } = useStrategyClients();

      await provider.cancelOrder({ orderId: '123', symbol: 'ETH' });

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 123 }],
      });
      expect(exchangeClient.twapCancel).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it('retains the requested exchange ID when an ordinary cancel rejects', async () => {
      useStrategyClients({
        exchange: {
          cancel: jest.fn().mockRejectedValue(new Error('Cancel unavailable')),
        },
      });

      const result = await provider.cancelOrder({
        orderId: '123',
        symbol: 'ETH',
      });

      expect(result).toStrictEqual({
        success: false,
        orderId: '123',
        error: 'Cancel unavailable',
      });
    });

    it('reports malformed and missing batch cancel statuses as failures', async () => {
      useStrategyClients({
        exchange: {
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{}, 'unexpected'] } },
          }),
        },
      });

      const result = await provider.cancelOrders([
        { orderId: '123', symbol: 'ETH' },
        { orderId: '456', symbol: 'BTC' },
        { orderId: '789', symbol: 'ETH' },
      ]);

      expect(result).toStrictEqual({
        success: false,
        successCount: 0,
        failureCount: 3,
        results: [
          {
            orderId: '123',
            symbol: 'ETH',
            success: false,
            error: PERPS_ERROR_CODES.BATCH_CANCEL_FAILED,
          },
          {
            orderId: '456',
            symbol: 'BTC',
            success: false,
            error: PERPS_ERROR_CODES.BATCH_CANCEL_FAILED,
          },
          {
            orderId: '789',
            symbol: 'ETH',
            success: false,
            error: PERPS_ERROR_CODES.BATCH_CANCEL_FAILED,
          },
        ],
      });
    });
  });

  describe('TWAP lifecycle', () => {
    const userAddress = '0x1234567890123456789012345678901234567890';
    const startedAt = 1_700_000_000_000;

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(startedAt + 5 * 60_000);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('adapts active progress and slice fills from the venue', async () => {
      const { infoClient } = useStrategyClients({
        info: {
          twapHistory: jest.fn().mockResolvedValue([
            {
              time: 1_700_000_030,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '1200',
                executedSz: '0.4',
                minutes: 10,
                randomize: true,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'activated' },
            },
          ]),
          userTwapSliceFills: jest.fn().mockResolvedValue([
            {
              twapId: 987,
              fill: {
                coin: 'ETH',
                px: '3000',
                sz: '0.4',
                side: 'B',
                time: startedAt + 2 * 60_000,
                startPosition: '0',
                dir: 'Open Long',
                closedPnl: '0',
                hash: '0xabc',
                oid: 321,
                crossed: true,
                fee: '1.20',
                tid: 456,
                feeToken: 'USDC',
                twapId: 987,
              },
            },
          ]),
        },
      });

      expect(await provider.getTwapOrders()).toStrictEqual([
        {
          orderId: '987',
          symbol: 'ETH',
          side: 'buy',
          size: '1',
          executedSize: '0.4',
          remainingSize: '0.6',
          executedNotional: '1200',
          averagePrice: '3000',
          fillProgressBps: 4000,
          timeProgressBps: 5000,
          elapsedTimeMilliseconds: 300_000,
          durationMinutes: 10,
          randomize: true,
          reduceOnly: false,
          status: 'active',
          startedAt,
          lastUpdated: startedAt + 2 * 60_000,
          fills: [
            {
              fillId: '456',
              orderId: '321',
              side: 'buy',
              price: '3000',
              size: '0.4',
              fee: '1.20',
              feeToken: 'USDC',
              timestamp: startedAt + 2 * 60_000,
              transactionHash: '0xabc',
            },
          ],
        },
      ]);
      expect(infoClient.twapHistory).toHaveBeenCalledWith({
        user: userAddress,
      });
      expect(infoClient.userTwapSliceFills).toHaveBeenCalledWith({
        user: userAddress,
      });
    });

    it('deduplicates history and distinguishes an underfilled completion', async () => {
      useStrategyClients({
        info: {
          twapHistory: jest.fn().mockResolvedValue([
            {
              time: 1_700_000_001,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '0',
                executedSz: '0',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'A',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'activated' },
            },
            {
              time: 1_700_000_600,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '2400',
                executedSz: '0.8',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'A',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'finished' },
            },
          ]),
        },
      });

      const orders = await provider.getTwapOrders();

      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        orderId: '987',
        side: 'sell',
        status: 'completed_underfilled',
        executedSize: '0.8',
        remainingSize: '0.2',
        averagePrice: '3000',
        fillProgressBps: 8000,
        timeProgressBps: 10000,
        elapsedTimeMilliseconds: 600_000,
      });
    });

    it.each([
      ['waitingForTrigger', 'active'],
      ['stopped', 'canceled'],
      ['futureStatus', 'active'],
    ] as const)('maps the venue %s status to %s', async (status, expected) => {
      useStrategyClients({
        info: {
          twapHistory: jest.fn().mockResolvedValue([
            {
              time: 1_700_000_030,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: '0',
                executedSz: '0',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status },
            },
          ]),
        },
      });

      expect(await provider.getTwapOrders()).toContainEqual(
        expect.objectContaining({ orderId: '987', status: expected }),
      );
    });

    it('omits a TWAP with malformed venue decimals', async () => {
      useStrategyClients({
        info: {
          twapHistory: jest.fn().mockResolvedValue([
            {
              time: 1_700_000_030,
              twapId: 987,
              state: {
                coin: 'ETH',
                executedNtl: 'NaN',
                executedSz: '0',
                minutes: 10,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'activated' },
            },
          ]),
        },
      });

      expect(await provider.getTwapOrders()).toStrictEqual([]);
    });

    it('coalesces concurrent HIP-3 TWAP collateral cleanup', async () => {
      let twapPlaced = false;
      const clearinghouseState = jest.fn().mockImplementation(({ dex }) => {
        let withdrawable = '1000';
        if (dex === 'xyz') {
          withdrawable = twapPlaced ? '20' : '0';
        }
        return Promise.resolve(createClearinghouseBalance(withdrawable));
      });
      useStrategyClients({
        exchange: {
          twapOrder: jest.fn().mockImplementation(async () => {
            twapPlaced = true;
            return {
              status: 'ok',
              response: {
                type: 'twapOrder',
                data: { status: { running: { twapId: 987 } } },
              },
            };
          }),
        },
        info: {
          clearinghouseState,
          perpDexs: jest.fn().mockResolvedValue([null, { name: 'xyz' }]),
          meta: jest.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
            collateralToken: 0,
          }),
          allMids: jest.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
          twapHistory: jest.fn().mockResolvedValue([
            {
              time: 1_700_000_600,
              twapId: 987,
              state: {
                coin: 'xyz:TSLA',
                executedNtl: '3000',
                executedSz: '1',
                minutes: 30,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'finished' },
            },
          ]),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });
      const cleanupStarted = createDeferred<void>();
      const pendingCleanup = createDeferred<{ success: boolean }>();
      const transfer = jest
        .spyOn(provider, 'transferBetweenDexs')
        .mockResolvedValueOnce({ success: true })
        .mockImplementationOnce(() => {
          cleanupStarted.resolve();
          return pendingCleanup.promise;
        });

      expect(
        await provider.placeOrder({
          ...baseOrder,
          symbol: 'xyz:TSLA',
          orderType: 'twap',
          twapDuration: 30,
        } satisfies OrderParams),
      ).toMatchObject({ success: true, orderId: '987' });

      const reads = [provider.getTwapOrders(), provider.getTwapOrders()];
      await cleanupStarted.promise;
      expect(transfer).toHaveBeenCalledTimes(2);
      pendingCleanup.resolve({ success: true });
      await Promise.all(reads);

      expect(transfer).toHaveBeenCalledTimes(2);
    });

    it('retries a failed HIP-3 collateral rebalance after provider recreation', async () => {
      let twapPlaced = false;
      const clearinghouseState = jest.fn().mockImplementation(({ dex }) => {
        let withdrawable = '1000';
        if (dex === 'xyz') {
          withdrawable = twapPlaced ? '20' : '0';
        }
        return Promise.resolve(createClearinghouseBalance(withdrawable));
      });
      const twapOrder = jest.fn().mockImplementation(async () => {
        twapPlaced = true;
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      useStrategyClients({
        exchange: { twapOrder },
        info: {
          clearinghouseState,
          perpDexs: jest.fn().mockResolvedValue([null, { name: 'xyz' }]),
          meta: jest.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
            collateralToken: 0,
          }),
          allMids: jest.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
          twapHistory: jest.fn().mockResolvedValue([
            {
              time: 1_700_000_600,
              twapId: 987,
              state: {
                coin: 'xyz:TSLA',
                executedNtl: '3000',
                executedSz: '1',
                minutes: 30,
                randomize: false,
                reduceOnly: false,
                side: 'B',
                sz: '1',
                timestamp: startedAt,
                user: userAddress,
              },
              status: { status: 'finished' },
            },
          ]),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });
      const initialTransfer = jest
        .spyOn(provider, 'transferBetweenDexs')
        .mockResolvedValue({ success: true });

      expect(
        await provider.placeOrder({
          ...baseOrder,
          symbol: 'xyz:TSLA',
          orderType: 'twap',
          twapDuration: 30,
        } satisfies OrderParams),
      ).toMatchObject({ success: true, orderId: '987' });
      expect(initialTransfer).toHaveBeenCalledTimes(1);
      await provider.disconnect();

      const recreatedProvider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });
      const rebalance = jest
        .spyOn(recreatedProvider, 'transferBetweenDexs')
        .mockResolvedValueOnce({ success: false, error: 'transfer failed' })
        .mockResolvedValue({ success: true });

      await recreatedProvider.getTwapOrders();
      expect(rebalance).toHaveBeenCalledTimes(1);

      await recreatedProvider.getTwapOrders();
      expect(rebalance).toHaveBeenCalledTimes(2);

      await recreatedProvider.getTwapOrders();
      expect(rebalance).toHaveBeenCalledTimes(2);
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
      } satisfies OrderParams);

      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(submitted.grouping).toBe('na');
      expect(submitted.orders).toHaveLength(3);
      expect(submitted.builder).toStrictEqual({
        b: BUILDER_FEE_CONFIG.MainnetBuilder,
        f: BUILDER_FEE_CONFIG.MaxFeeTenthsBps,
      });
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(result.childOrderIds).toStrictEqual(['11', '22', '33']);
      expect(result.orderId).toMatch(/^scale:/u);
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
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_REJECTED);
    });

    it('reports filled rungs but keeps only resting rungs in a recovery group', async () => {
      const cancel = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'multi-sig required' }] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { filled: { oid: 11 } },
                  { resting: { oid: 22 } },
                  { error: 'Insufficient margin' },
                ],
              },
            },
          }),
          cancel,
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
        childOrderIds: ['11', '22'],
      });
      expect(placed.orderId).toMatch(/^scale:/u);
      if (!placed.orderId) {
        throw new Error('Expected a recovery group handle');
      }

      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(cancelled.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 22 }],
      });
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
      } satisfies OrderParams);
      exchangeClient.approveBuilderFee.mockClear();

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
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
    });

    it('does not restore a canceled group from a stale open-order cache', async () => {
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
      } satisfies OrderParams);
      if (!placed.orderId) {
        throw new Error('Expected a Scale group handle');
      }

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'scale',
        }),
      ).toStrictEqual({ success: true, orderId: placed.orderId });

      const staleOrder = {
        orderId: '11',
        symbol: 'ETH',
        side: 'buy',
        orderType: 'limit',
        size: '1',
        originalSize: '1',
        price: '2000',
        filledSize: '0',
        remainingSize: '1',
        status: 'open',
        timestamp: 1_700_000_000_000,
        strategyGroupId: placed.orderId,
      } satisfies Order;
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([
        staleOrder,
      ]);
      await provider.getOpenOrders();

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'scale',
        }),
      ).toStrictEqual({
        success: false,
        orderId: placed.orderId,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_HANDLE_UNKNOWN,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      const submitted = exchangeClient.order.mock.calls[0][0];
      expect(submitted.orders).toHaveLength(1);
      // One tick above the best bid, which is how the venue defines a chase: a
      // post-only buy that improves the bid rather than joining the queue at it.
      // ETH's tick at ~3000 is 0.1.
      expect(submitted.orders[0].p).toBe('2999.1');
      expect(submitted.orders[0].t).toStrictEqual({ limit: { tif: 'Alo' } });
    });

    it('refreshes the touch and retries an initial post-only rejection', async () => {
      const order = jest
        .fn()
        .mockRejectedValueOnce(
          new Error('Post only order would have immediately matched'),
        )
        .mockResolvedValue(chaseRested);
      const l2Book = jest
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
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.order.mock.calls[1][0].orders[0].p).toBe('2998.1');
    });

    it('refreshes the touch and retries an initial oracle-distance rejection', async () => {
      const order = jest
        .fn()
        .mockRejectedValueOnce(new Error('Price too far from oracle'))
        .mockResolvedValue(chaseRested);
      const l2Book = jest
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
            [{ px: '2997', sz: '10', n: 1 }],
            [{ px: '3001', sz: '10', n: 1 }],
          ],
        });
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.order).toHaveBeenCalledTimes(2);
      expect(exchangeClient.order.mock.calls[1][0].orders[0].p).toBe('2997.1');
    });

    it('stops after three retryable initial-placement rejections', async () => {
      const order = jest
        .fn()
        .mockRejectedValue(
          new Error('Post only order would have immediately matched'),
        );
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(exchangeClient.order).toHaveBeenCalledTimes(3);
    });

    it('does not retry a non-retryable initial-placement rejection', async () => {
      const order = jest
        .fn()
        .mockRejectedValue(new Error('insufficient margin'));
      const { exchangeClient } = useStrategyClients({ exchange: { order } });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(result.success).toBe(false);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
    });

    it('rests at the best ask for a sell', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        isBuy: false,
        orderType: 'chase',
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      expect(result.success).toBe(true);
      expect(result.orderId).toMatch(/^chase-/u);
      expect(result.childOrderIds).toStrictEqual(['55']);
    });

    it('exposes the running session state needed by clients', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseMaxDistanceBps: 100,
      } as OrderParams);

      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: result.orderId,
          symbol: 'ETH',
          side: 'buy',
          originalSize: '1',
          remainingSize: '1',
          arrivalPrice: '2999.1',
          restingPrice: '2999.1',
          restingOrderId: '55',
          distanceChasedBps: 0,
          maxDistanceBps: 100,
          repricings: 0,
          status: 'active',
        }),
      ]);
    });

    it('refreshes the snapshot remaining size after a partial fill', async () => {
      const { infoClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({
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
            tif: 'Alo',
            cloid: null,
          },
        },
      });

      const firstSnapshots = await provider.getChaseOrders();
      const cachedSnapshots = await provider.getChaseOrders();

      expect(firstSnapshots).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0.2',
        }),
      );
      expect(cachedSnapshots).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0.2',
        }),
      );
    });

    it('retries a temporarily unknown child before refreshing Chase state', async () => {
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({ status: 'unknownOid' });

      const snapshots = await provider.getChaseOrders();

      expect(snapshots).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '1',
          restingOrderId: '55',
          status: 'active',
        }),
      );
      expect(infoClient.orderStatus).toHaveBeenCalledTimes(2);

      expect(
        await provider.cancelOrder({
          orderId: result.orderId,
          symbol: 'ETH',
          orderType: 'chase',
        }),
      ).toStrictEqual({ success: true, orderId: result.orderId });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
    });

    it('marks a confirmed fill and stops the Chase timer', async () => {
      jest.useFakeTimers();
      const order = jest.fn().mockResolvedValue(chaseRested);
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'filled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
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
      });

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0',
          restingOrderId: null,
          status: 'filled',
        }),
      );

      await jest.advanceTimersByTimeAsync(5000);

      expect(order).toHaveBeenCalledTimes(1);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does not report an externally cancelled child as filled', async () => {
      const { infoClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'canceled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
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
      });

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0.4',
          restingOrderId: null,
          status: CHASE_ORDER_STATUS.Canceled,
        }),
      );
    });

    it('backgrounds every active session without cancelling its resting child', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      const backgrounded = await provider.suspendChaseOrders();

      expect(backgrounded).toStrictEqual([
        expect.objectContaining({
          handle: result.orderId,
          restingOrderId: '55',
          status: 'backgrounded',
        }),
      ]);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(await provider.getChaseOrders()).toStrictEqual(backgrounded);
    });

    it('retains HIP-3 collateral while a Chase child rests and retries cleanup', async () => {
      let chasePlaced = false;
      const clearinghouseState = jest.fn().mockImplementation(({ dex }) => {
        let withdrawable = '1000';
        if (dex === 'xyz') {
          withdrawable = chasePlaced ? '20' : '0';
        }
        return Promise.resolve(createClearinghouseBalance(withdrawable));
      });
      useStrategyClients({
        exchange: {
          order: jest.fn().mockImplementation(async () => {
            chasePlaced = true;
            return chaseRested;
          }),
        },
        info: {
          clearinghouseState,
          perpDexs: jest.fn().mockResolvedValue([null, { name: 'xyz' }]),
          meta: jest.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
            collateralToken: 0,
          }),
          allMids: jest.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: false,
        initialAssetMapping: [['xyz:TSLA', 110000]],
      });
      const transfer = jest
        .spyOn(provider, 'transferBetweenDexs')
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Transfer failed' })
        .mockResolvedValue({ success: true });

      const placed = await provider.placeOrder({
        ...baseOrder,
        symbol: 'xyz:TSLA',
        orderType: 'chase',
      } satisfies OrderParams);

      expect(placed.success).toBe(true);
      expect(transfer).toHaveBeenCalledTimes(1);

      await provider.suspendChaseOrders();

      expect(transfer).toHaveBeenCalledTimes(1);
      await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'xyz:TSLA',
        orderType: 'chase',
      });
      expect(transfer).toHaveBeenCalledTimes(2);
      await provider.getChaseOrders();
      expect(transfer).toHaveBeenCalledTimes(3);
      await provider.getChaseOrders();
      expect(transfer).toHaveBeenCalledTimes(3);
    });

    it('reports a backgrounded child that later fills as filled', async () => {
      jest.useFakeTimers();
      const { infoClient } = useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });
      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

      await provider.suspendChaseOrders();
      infoClient.orderStatus.mockResolvedValueOnce({
        status: 'order',
        order: {
          status: 'filled',
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
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
      });
      await jest.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.DefaultIntervalMs);

      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          handle: result.orderId,
          remainingSize: '0',
          restingOrderId: null,
          status: 'filled',
        }),
      );
      jest.useRealTimers();
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });

      // Retrying a completed termination is idempotent. Mobile can receive a
      // stale lifecycle snapshot while the first request is settling.
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent termination of the same Chase', async () => {
      const cancel = jest.fn().mockResolvedValue({
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

      const first = provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      const second = provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      const results = await Promise.all([first, second]);

      expect(results).toStrictEqual([
        { success: true, orderId: placed.orderId },
        { success: true, orderId: placed.orderId },
      ]);
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('stops the owning session when its child is cancelled directly', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);

      expect(
        await provider.cancelOrder({ orderId: '55', symbol: 'ETH' }),
      ).toStrictEqual({ success: true, orderId: '55' });
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('returns an error result when child cancellation setup fails', async () => {
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      mockWalletService.getUserAddressWithDefault.mockRejectedValueOnce(
        new Error('Trading setup failed'),
      );

      const result = await provider.cancelOrder({
        orderId: '55',
        symbol: 'ETH',
      });

      expect(result).toStrictEqual({
        success: false,
        error: 'Trading setup failed',
        orderId: '55',
      });
    });

    it('backgrounds an admitted placement while blocking newer placements', async () => {
      let settleOrder: ((value: typeof chaseRested) => void) | undefined;
      let notifyOrderStarted: (() => void) | undefined;
      const orderStarted = new Promise<void>((resolve) => {
        notifyOrderStarted = resolve;
      });
      const order = jest.fn().mockImplementation(async () => {
        notifyOrderStarted?.();
        return await new Promise<typeof chaseRested>((resolve) => {
          settleOrder = resolve;
        });
      });
      useStrategyClients({ exchange: { order } });

      const admitted = provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      await orderStarted;
      const suspension = provider.suspendChaseOrders();
      const blocked = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      settleOrder?.(chaseRested);

      const admittedResult = await admitted;
      const backgrounded = await suspension;
      expect(blocked.success).toBe(false);
      expect(blocked.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(admittedResult.success).toBe(true);
      expect(backgrounded).toStrictEqual([
        expect.objectContaining({
          handle: admittedResult.orderId,
          restingOrderId: '55',
          status: 'backgrounded',
        }),
      ]);
      expect(await provider.getChaseOrders()).toStrictEqual(backgrounded);
      expect(order).toHaveBeenCalledTimes(1);
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
      } satisfies OrderParams);

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(first.success).toBe(false);
      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          restingOrderId: '55',
          status: 'termination_pending',
        }),
      ]);

      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });
      expect(second.success).toBe(true);
    });

    it('keeps the terminal reason when cancelling a stopped Chase fails', async () => {
      jest.useFakeTimers();
      const cancel = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ error: 'multi-sig required' }] } },
      });
      useStrategyClients({
        exchange: { order: jest.fn().mockResolvedValue(chaseRested), cancel },
      });
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDurationMs: 1000,
      } as OrderParams);
      await jest.advanceTimersByTimeAsync(1000);

      const result = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'chase',
      });

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      });
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          status: 'duration_reached',
        }),
      ]);
      jest.useRealTimers();
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

  describe('Placement validation', () => {
    it('does not reach the exchange when shared validation rejects', async () => {
      const { exchangeClient, infoClient } = useStrategyClients();
      mockValidateOrderParams.mockReturnValue({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TWAP_DURATION_INVALID,
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(exchangeClient.order).not.toHaveBeenCalled();
      expect(exchangeClient.twapOrder).not.toHaveBeenCalled();
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(infoClient.l2Book).not.toHaveBeenCalled();
    });

    it.each([
      ['twap', { orderType: 'twap', twapDuration: 30 }],
      [
        'scale',
        {
          orderType: 'scale',
          scaleMinPrice: '2900',
          scaleMaxPrice: '3100',
          scaleNumOrders: 3,
        },
      ],
      ['chase', { orderType: 'chase' }],
    ] as const)(
      'places a %s strategy on a HIP-3 market',
      async (_, strategy) => {
        provider = createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:*'],
          initialAssetMapping: [['xyz:TSLA', 110000]],
        });
        const { exchangeClient } = useStrategyClients({
          info: {
            meta: jest.fn().mockResolvedValue({
              universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
              collateralToken: 0,
            }),
            perpDexs: jest.fn().mockResolvedValue([null, { name: 'xyz' }]),
            allMids: jest.fn().mockResolvedValue({ 'xyz:TSLA': '3000' }),
          },
        });

        const result = await provider.placeOrder({
          ...baseOrder,
          ...strategy,
          symbol: 'xyz:TSLA',
        } satisfies OrderParams);

        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        const isTwap = strategy.orderType === 'twap';
        expect(exchangeClient.twapOrder).toHaveBeenCalledTimes(isTwap ? 1 : 0);
        expect(exchangeClient.order).toHaveBeenCalledTimes(isTwap ? 0 : 1);

        const assetIds = isTwap
          ? exchangeClient.twapOrder.mock.calls.map(
              ([request]) => request.twap.a,
            )
          : exchangeClient.order.mock.calls.flatMap(([request]) =>
              request.orders.map((order) => order.a),
            );
        expect(assetIds).toContain(110000);
      },
    );
  });

  describe('Existing order types are unaffected', () => {
    it('still routes a market order through the order action', async () => {
      const { exchangeClient } = useStrategyClients();

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'market',
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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

    it('does not replace a child cancelled directly during a reprice', async () => {
      let settleCancel: ((value: Record<string, unknown>) => void) | undefined;
      let notifyCancelStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        notifyCancelStarted = resolve;
      });
      const cancel = jest.fn().mockImplementation(async () => {
        notifyCancelStarted?.();
        return await new Promise<Record<string, unknown>>((resolve) => {
          settleCancel = resolve;
        });
      });
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      const ticking = jest.advanceTimersByTimeAsync(1000);
      await cancelStarted;
      const directCancellation = provider.cancelOrder({
        orderId: '55',
        symbol: 'ETH',
      });
      settleCancel?.({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });

      await ticking;
      expect(await directCancellation).toMatchObject({ success: true });
      expect(order).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('does not replace a Chase child cancelled in a batch during a reprice', async () => {
      let settleCancel: ((value: Record<string, unknown>) => void) | undefined;
      let notifyCancelStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        notifyCancelStarted = resolve;
      });
      const cancel = jest.fn().mockImplementation(async () => {
        notifyCancelStarted?.();
        return await new Promise<Record<string, unknown>>((resolve) => {
          settleCancel = resolve;
        });
      });
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      const ticking = jest.advanceTimersByTimeAsync(1000);
      await cancelStarted;
      const batchCancellation = provider.cancelOrders([
        { orderId: '55', symbol: 'ETH' },
      ]);
      settleCancel?.({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });

      await ticking;
      expect(await batchCancellation).toStrictEqual({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ orderId: '55', symbol: 'ETH', success: true }],
      });
      expect(order).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    });

    it('finishes an admitted reprice before suspending its replacement', async () => {
      let settleCancel: ((value: Record<string, unknown>) => void) | undefined;
      let notifyCancelStarted: (() => void) | undefined;
      const cancelStarted = new Promise<void>((resolve) => {
        notifyCancelStarted = resolve;
      });
      const cancel = jest.fn().mockImplementation(async () => {
        notifyCancelStarted?.();
        return await new Promise<Record<string, unknown>>((resolve) => {
          settleCancel = resolve;
        });
      });
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order, cancel },
        info: { l2Book: bookWalkingBids(['2999', '2998']) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      const ticking = jest.advanceTimersByTimeAsync(1000);
      await cancelStarted;

      const suspension = provider.suspendChaseOrders();
      settleCancel?.({
        status: 'ok',
        response: { data: { statuses: ['success'] } },
      });

      await ticking;
      expect(await suspension).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          restingOrderId: '66',
          status: 'backgrounded',
        }),
      ]);
      expect(order).toHaveBeenCalledTimes(2);
      expect(cancel).toHaveBeenCalledTimes(1);
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
      } satisfies OrderParams);

      await jest.advanceTimersByTimeAsync(3000);

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);
    });

    it('uses the throttled default interval when none is supplied', async () => {
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
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(
        CHASE_ORDER_CONFIG.DefaultIntervalMs - 1,
      );
      expect(exchangeClient.cancel).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('defers re-pricing while another Chase placement is in flight', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValueOnce(chaseRested(66));
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2998', '2998']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      let finishBookRead: (() => void) | undefined;
      infoClient.l2Book.mockImplementationOnce(
        (): Promise<Record<string, unknown>> =>
          new Promise<Record<string, unknown>>((resolve) => {
            finishBookRead = (): void =>
              resolve({
                coin: 'ETH',
                levels: [
                  [{ px: '2998', sz: '10', n: 1 }],
                  [{ px: '3001', sz: '10', n: 1 }],
                ],
              });
          }),
      );
      const secondPlacement = provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      await jest.advanceTimersByTimeAsync(0);
      for (let turn = 0; turn < 20; turn += 1) {
        if (finishBookRead !== undefined) {
          break;
        }
        await Promise.resolve();
      }
      expect(finishBookRead).toBeDefined();

      await jest.advanceTimersByTimeAsync(1000);

      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);

      finishBookRead?.();
      expect(await secondPlacement).toMatchObject({ success: true });
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('drains an in-flight re-price before starting another Chase placement', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValueOnce(chaseRested(66))
        .mockResolvedValueOnce(chaseRested(77));
      const { infoClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);

      let finishTickBookRead: (() => void) | undefined;
      infoClient.l2Book.mockImplementationOnce(
        (): Promise<Record<string, unknown>> =>
          new Promise<Record<string, unknown>>((resolve) => {
            finishTickBookRead = (): void =>
              resolve({
                coin: 'ETH',
                levels: [
                  [{ px: '2998', sz: '10', n: 1 }],
                  [{ px: '3001', sz: '10', n: 1 }],
                ],
              });
          }),
      );
      await jest.advanceTimersByTimeAsync(1000);
      expect(finishTickBookRead).toBeDefined();

      const secondPlacement = provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } as OrderParams);
      await jest.advanceTimersByTimeAsync(0);

      expect(order).toHaveBeenCalledTimes(1);

      finishTickBookRead?.();
      expect(await secondPlacement).toMatchObject({ success: true });
      expect(order).toHaveBeenCalledTimes(3);
    });

    it('stops chasing once the order is no longer resting', async () => {
      const order = jest.fn().mockResolvedValue(chaseRested(55));
      const { exchangeClient, infoClient } = useStrategyClients({
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
                [
                  { px: '2999.1', sz: '10', n: 1 },
                  { px: '2998', sz: '10', n: 1 },
                ],
                [{ px: '3001', sz: '10', n: 1 }],
              ],
            }),
          orderStatus: jest.fn().mockResolvedValue({ status: 'unknownOid' }),
        },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      // No replacement was rested after the failed cancel.
      expect(order).toHaveBeenCalledTimes(1);
      expect(infoClient.orderStatus).toHaveBeenCalledTimes(3);
      expect(await provider.getChaseOrders()).toContainEqual(
        expect.objectContaining({
          restingOrderId: null,
          status: CHASE_ORDER_STATUS.Failed,
        }),
      );
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      await jest.advanceTimersByTimeAsync(10_000);

      // Ticks at 1s and 2s; the 2s tick finds the deadline reached and stops,
      // so only the first one re-prices.
      expect(order).toHaveBeenCalledTimes(2);
    });

    it('rests at the configured max-distance boundary and stops chasing', async () => {
      const onChaseOrderMaxDistanceReached = jest.fn();
      provider = createTestProvider({ onChaseOrderMaxDistanceReached });
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '3040']) },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDistanceBps: 100,
      } satisfies OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(order.mock.calls[1][0].orders[0].p).toBe('3029');
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          handle: placed.orderId,
          restingOrderId: '66',
          restingPrice: '3029',
          distanceChasedBps: 100,
          status: 'max_distance_reached',
        }),
      ]);
      expect(onChaseOrderMaxDistanceReached).toHaveBeenCalledWith({
        handle: placed.orderId,
        symbol: 'ETH',
        side: 'buy',
        restingOrderId: '66',
        restingPrice: '3029',
        maxDistanceBps: 100,
        timestamp: expect.any(Number),
        providerId: 'hyperliquid',
      });
    });

    it('keeps chasing when the touch moves favorably beyond max distance', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce(chaseRested(55))
        .mockResolvedValue(chaseRested(66));
      useStrategyClients({
        exchange: { order },
        info: { l2Book: bookWalkingBids(['2999', '2900']) },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
        chaseMaxDistanceBps: 100,
      } as OrderParams);

      await jest.advanceTimersByTimeAsync(1000);

      expect(order).toHaveBeenCalledTimes(2);
      expect(await provider.getChaseOrders()).toStrictEqual([
        expect.objectContaining({
          status: 'active',
          restingPrice: '2900.1',
          distanceChasedBps: 0,
        }),
      ]);
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
      } satisfies OrderParams);

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

    it('retracts every rung when the ladder only partly rests', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue(partlyRested),
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success'] } },
          }),
        },
      });

      const result = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(result).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_REJECTED,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
    });

    it('keeps an incomplete cleanup recoverable by its group handle', async () => {
      const cancel = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: [{ error: 'Invalid nonce' }, 'success'] },
          },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        });
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue(partlyRested),
          cancel,
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
        childOrderIds: ['11'],
      });

      const retried = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(retried.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenNthCalledWith(1, {
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
      expect(exchangeClient.cancel).toHaveBeenNthCalledWith(2, {
        cancels: [{ a: 1, o: 11 }],
      });
    });

    it('accepts filled rungs but exposes only resting rungs for cancellation', async () => {
      const { exchangeClient } = useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: {
              data: {
                statuses: [
                  { resting: { oid: 11 } },
                  { filled: { oid: 22 } },
                  { resting: { oid: 33 } },
                ],
              },
            },
          }),
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['success', 'success'] } },
          }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      expect(placed).toMatchObject({
        success: true,
        childOrderIds: ['11', '33'],
        submittedSize: '1',
      });

      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(cancelled.success).toBe(true);
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
    });

    it.each([
      ['negative', -1],
      ['fractional', 22.5],
      ['unsafe', Number.MAX_SAFE_INTEGER + 1],
      ['non-numeric', '22'],
    ])(
      'rejects a %s scale order ID and retracts valid rungs',
      async (_label, oid) => {
        const { exchangeClient } = useStrategyClients({
          exchange: {
            order: jest.fn().mockResolvedValue({
              status: 'ok',
              response: {
                data: {
                  statuses: [
                    { resting: { oid: 11 } },
                    { resting: { oid } },
                    { error: 'Insufficient margin' },
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
        } satisfies OrderParams);

        expect(placed).toMatchObject({
          success: false,
          error: PERPS_ERROR_CODES.ORDER_REJECTED,
        });
        expect(exchangeClient.cancel).toHaveBeenCalledWith({
          cancels: [{ a: 1, o: 11 }],
        });
      },
    );
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
      } satisfies OrderParams);
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
      } satisfies OrderParams);
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
      } satisfies OrderParams);
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
      expect(second).toStrictEqual({ success: true, orderId: placed.orderId });
    });
  });

  describe('Fee quoting for strategy placements', () => {
    const configuredOrderTypes = [
      ['market', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['limit', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['stop_market', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['stop_limit', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['take_profit_market', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['take_profit_limit', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['twap', 0],
      ['scale', BUILDER_FEE_CONFIG.MaxFeeDecimal],
      ['chase', BUILDER_FEE_CONFIG.MaxFeeDecimal],
    ] as const satisfies readonly (readonly [OrderType, number])[];

    it.each(configuredOrderTypes)(
      'quotes %s with its provider-owned builder fee policy',
      async (orderType, expectedMetamaskFeeRate) => {
        useStrategyClients();

        const fees = await provider.calculateFees({
          orderType,
          amount: '1000',
          symbol: 'ETH',
        });

        expect(fees.metamaskFeeRate).toBe(expectedMetamaskFeeRate);
      },
    );

    it.each(['future_order', 'constructor', 'toString', '__proto__'] as const)(
      'uses the safe builder fee for unknown runtime order type %s',
      async (orderType) => {
        useStrategyClients();

        const fees = await provider.calculateFees({
          // @ts-expect-error Runtime fallback protects JavaScript consumers.
          orderType,
          amount: '1000',
          symbol: 'ETH',
        });

        expect(fees.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
        expect(mockPlatformDependencies.debugLogger.log).toHaveBeenCalledWith(
          'HyperLiquid: Unknown order type used the safe builder-fee policy',
          { orderType },
        );
      },
    );

    it('keeps a discounted TWAP quote at zero MetaMask builder fee', async () => {
      useStrategyClients();
      provider.setUserFeeDiscount(5000);

      const fees = await provider.calculateFees({
        orderType: 'twap',
        amount: '1000',
        symbol: 'ETH',
      });

      expect(fees.metamaskFeeRate).toBe(0);
      expect(fees.metamaskFeeAmount).toBe(0);
    });

    it('returns zero fee amounts for a zero notional quote', async () => {
      useStrategyClients();

      const fees = await provider.calculateFees({
        orderType: 'market',
        amount: '0',
        symbol: 'ETH',
      });

      expect(fees.feeAmount).toBe(0);
      expect(fees.protocolFeeAmount).toBe(0);
      expect(fees.metamaskFeeAmount).toBe(0);
    });

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
      expect(chase.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
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
      expect(scale.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
    });

    it('quotes a TWAP at the taker protocol rate without a builder fee', async () => {
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

      expect(twap.protocolFeeRate).toBe(market.protocolFeeRate);
      expect(twap.metamaskFeeRate).toBe(0);
      expect(twap.metamaskFeeAmount).toBe(0);
      expect(twap.feeRate).toBe(twap.protocolFeeRate);
      expect(twap.feeAmount).toBe(twap.protocolFeeAmount);
      expect(market.metamaskFeeRate).toBe(BUILDER_FEE_CONFIG.MaxFeeDecimal);
    });
  });

  describe('Order capabilities', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('advertises the strategies supported for a routed market', async () => {
      useStrategyClients();

      const capabilities = await provider.getOrderCapabilities({
        symbol: 'ETH',
      });

      expect(capabilities).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(Object.isFrozen(capabilities)).toBe(true);
      expect(Object.isFrozen(capabilities.supportedStrategies)).toBe(true);
    });

    it('resolves support before the asset mapping is populated', async () => {
      useStrategyClients();
      const coldProvider = createTestProvider();

      expect(
        await coldProvider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
    });

    it('advertises strategies for an existing HIP-3 market', async () => {
      const { capabilityProvider, infoClient } = useHip3Capabilities();

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledWith({ dex: 'xyz' });
    });

    it.each([
      ['the HIP-3 kill switch is off', { hip3Enabled: false }],
      ['the market is blocklisted', { blocklistMarkets: ['xyz:TSLA'] }],
    ])('does not advertise a HIP-3 market when %s', async (_, options) => {
      const { capabilityProvider } = useHip3Capabilities({}, options);

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
    });

    it('does not advertise a non-USDC-collateral HIP-3 market', async () => {
      const { capabilityProvider } = useHip3Capabilities({
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          collateralToken: 1,
        }),
      });

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
    });

    it('reports a missing HIP-3 market after checking its DEX metadata', async () => {
      const { capabilityProvider, infoClient } = useHip3Capabilities();

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:FAKE' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
      expect(infoClient.meta).toHaveBeenCalledWith({ dex: 'xyz' });
    });

    it('reports a disconnected HIP-3 provider as unavailable', async () => {
      const { capabilityProvider } = useHip3Capabilities();
      await capabilityProvider.disconnect();

      expect(
        await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
    });

    it('keeps delisted main-DEX discovery aligned with placement', async () => {
      useStrategyClients({
        info: {
          meta: jest.fn().mockResolvedValue({
            universe: [
              {
                name: 'ETH',
                szDecimals: 4,
                maxLeverage: 50,
                isDelisted: true,
              },
            ],
          }),
        },
      });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
    });

    it('reports an empty symbol as invalid', async () => {
      const { infoClient } = useStrategyClients();

      expect(await provider.getOrderCapabilities({ symbol: '' })).toStrictEqual(
        {
          status: 'unavailable',
          providerId: 'hyperliquid',
          reason: 'invalid_symbol',
        },
      );
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it('reports a route missing its market as invalid', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getOrderCapabilities({ symbol: 'BTC:' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'invalid_symbol',
      });
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it('reports a route missing its DEX as invalid', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getOrderCapabilities({ symbol: ':BTC' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'invalid_symbol',
      });
      expect(infoClient.meta).not.toHaveBeenCalled();
    });

    it.each([' ETH', 'ETH ', 'ETH BTC', 'a:b:c'])(
      'reports malformed symbol %p as invalid',
      async (symbol) => {
        const { infoClient } = useStrategyClients();

        expect(await provider.getOrderCapabilities({ symbol })).toStrictEqual({
          status: 'unavailable',
          providerId: 'hyperliquid',
          reason: 'invalid_symbol',
        });
        expect(infoClient.meta).not.toHaveBeenCalled();
      },
    );

    it('reports an unknown main-DEX market as unavailable', async () => {
      const { infoClient } = useStrategyClients();

      expect(
        await provider.getOrderCapabilities({ symbol: 'DOGE' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('refreshes metadata at the freshness boundary', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getOrderCapabilities({ symbol: 'DOGE' });
      jest.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs - 1,
      );
      await provider.getOrderCapabilities({ symbol: 'ETH' });

      expect(infoClient.meta).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      await provider.getOrderCapabilities({ symbol: 'ETH' });

      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('shares fresh metadata across unrelated symbols', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getOrderCapabilities({ symbol: 'DOGE' });
      infoClient.meta.mockResolvedValueOnce({
        universe: [
          { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
          { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
          { name: 'PUMP', szDecimals: 0, maxLeverage: 20 },
        ],
      });
      jest.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );

      await provider.getOrderCapabilities({ symbol: 'DOGE' });

      expect(
        await provider.getOrderCapabilities({ symbol: 'PUMP' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('does not reuse session-long metadata for capability discovery', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getMaxLeverage('ETH');

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('ages capability metadata from request completion', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const meta = jest
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingMeta.promise;
        })
        .mockResolvedValueOnce({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
        });
      const { infoClient } = useStrategyClients({ info: { meta } });

      const capabilities = provider.getOrderCapabilities({ symbol: 'ETH' });
      await requestStarted.promise;
      jest.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
      });
      expect(await capabilities).toMatchObject({ status: 'ready' });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({ status: 'ready' });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({ status: 'ready' });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('isolates capability metadata from overlapping shared cache writes', async () => {
      const sharedRequestStarted = createDeferred<void>();
      const pendingSharedMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: jest
            .fn()
            .mockImplementationOnce(() => {
              sharedRequestStarted.resolve();
              return pendingSharedMeta.promise;
            })
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });

      const sharedRead = provider.getMaxLeverage('PUMP');
      await sharedRequestStarted.promise;
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });

      pendingSharedMeta.resolve({
        universe: [{ name: 'PUMP', szDecimals: 0, maxLeverage: 20 }],
      });
      await sharedRead;

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent metadata refreshes', async () => {
      const metaRequestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: jest.fn().mockImplementation(() => {
            metaRequestStarted.resolve();
            return pendingMeta.promise;
          }),
        },
      });

      const reads = [
        provider.getOrderCapabilities({ symbol: 'BTC' }),
        provider.getOrderCapabilities({ symbol: 'ETH' }),
      ];
      await metaRequestStarted.promise;

      expect(infoClient.meta).toHaveBeenCalledTimes(1);
      pendingMeta.resolve({
        universe: [
          { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
          { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
        ],
      });
      expect(await Promise.all(reads)).toStrictEqual([
        {
          status: 'ready',
          providerId: 'hyperliquid',
          supportedStrategies: ['twap', 'scale', 'chase'],
        },
        {
          status: 'ready',
          providerId: 'hyperliquid',
          supportedStrategies: ['twap', 'scale', 'chase'],
        },
      ]);
    });

    it('refreshes and coalesces capability metadata per HIP-3 DEX', async () => {
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
        collateralToken: number;
      }>();
      const meta = jest
        .fn()
        .mockReturnValueOnce(pendingMeta.promise)
        .mockResolvedValue({
          universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          collateralToken: 0,
        });
      const { capabilityProvider, infoClient } = useHip3Capabilities({ meta });

      const reads = [
        capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' }),
        capabilityProvider.getOrderCapabilities({ symbol: 'xyz:XYZ100' }),
      ];
      pendingMeta.resolve({
        universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
        collateralToken: 0,
      });
      await Promise.all(reads);

      expect(infoClient.meta).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(
        PERFORMANCE_CONFIG.OrderCapabilitiesMetaFreshnessMs,
      );
      await capabilityProvider.getOrderCapabilities({ symbol: 'xyz:TSLA' });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('refreshes metadata after reconnect', async () => {
      const { infoClient } = useStrategyClients();

      await provider.getOrderCapabilities({ symbol: 'ETH' });
      await provider.disconnect();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      await provider.getOrderCapabilities({ symbol: 'ETH' });

      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('reports capabilities unavailable during disconnect', async () => {
      const { infoClient } = useStrategyClients();
      const disconnectStarted = createDeferred<void>();
      const pendingDisconnect = createDeferred<void>();
      mockClientService.disconnect.mockImplementationOnce(() => {
        disconnectStarted.resolve();
        return pendingDisconnect.promise;
      });

      const disconnectPromise = provider.disconnect();
      await disconnectStarted.promise;
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      pendingDisconnect.resolve();
      await disconnectPromise;

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('does not reconnect when initialization overlaps a disconnect', async () => {
      const initializeStarted = createDeferred<void>();
      const pendingInitialize = createDeferred<void>();
      const clientDisconnectStarted = createDeferred<void>();
      const pendingClientDisconnect = createDeferred<void>();
      mockClientService.initialize.mockImplementationOnce(() => {
        initializeStarted.resolve();
        return pendingInitialize.promise;
      });
      mockClientService.disconnect.mockImplementationOnce(() => {
        clientDisconnectStarted.resolve();
        return pendingClientDisconnect.promise;
      });

      const initializeResult = provider.initialize();
      await initializeStarted.promise;
      const disconnectResult = provider.disconnect();
      pendingInitialize.resolve();

      expect(await initializeResult).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      await clientDisconnectStarted.promise;
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });

      pendingClientDisconnect.resolve();
      expect(await disconnectResult).toStrictEqual({ success: true });
    });

    it('does not initialize while a disconnect is in progress', async () => {
      useStrategyClients();
      const clientDisconnectStarted = createDeferred<void>();
      const pendingClientDisconnect = createDeferred<void>();
      mockClientService.disconnect.mockImplementationOnce(() => {
        clientDisconnectStarted.resolve();
        return pendingClientDisconnect.promise;
      });

      const disconnectResult = provider.disconnect();
      await clientDisconnectStarted.promise;

      expect(await provider.initialize()).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(mockClientService.initialize).not.toHaveBeenCalled();

      pendingClientDisconnect.resolve();
      expect(await disconnectResult).toStrictEqual({ success: true });
      expect(await provider.initialize()).toStrictEqual({
        success: true,
        chainId: '42161',
      });
    });

    it('shares one teardown between overlapping disconnects', async () => {
      const { infoClient } = useStrategyClients();
      const disconnectStarted = createDeferred<void>();
      const pendingDisconnect = createDeferred<void>();
      mockClientService.disconnect.mockImplementationOnce(() => {
        disconnectStarted.resolve();
        return pendingDisconnect.promise;
      });

      const firstResult = provider.disconnect();
      const secondResult = provider.disconnect();

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });

      await disconnectStarted.promise;
      expect(mockClientService.disconnect).toHaveBeenCalledTimes(1);
      pendingDisconnect.resolve();
      expect(await Promise.all([firstResult, secondResult])).toStrictEqual([
        { success: true },
        { success: true },
      ]);

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('invalidates an in-flight refresh when client disconnect fails', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: jest
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMeta.promise;
            })
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });
      mockClientService.disconnect.mockRejectedValueOnce(
        new Error('disconnect failed'),
      );

      const staleRead = provider.getOrderCapabilities({ symbol: 'ETH' });
      await requestStarted.promise;
      const disconnectResult = await provider.disconnect();
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
      });

      expect(disconnectResult).toStrictEqual({
        success: false,
        error: 'disconnect failed',
      });
      expect(await staleRead).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('retries immediately after a metadata refresh failure', async () => {
      const { infoClient } = useStrategyClients({
        info: {
          meta: jest
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('discards an in-flight main-DEX refresh after disconnect', async () => {
      const universe = [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }];
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{ universe: typeof universe }>();
      const meta = jest
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingMeta.promise;
        })
        .mockResolvedValueOnce({ universe });
      const { infoClient } = useStrategyClients({ info: { meta } });

      const capabilitiesPromise = provider.getOrderCapabilities({
        symbol: 'ETH',
      });
      await requestStarted.promise;
      await provider.disconnect();
      pendingMeta.resolve({ universe });

      expect(await capabilitiesPromise).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      await provider.initialize();
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('does not cache capability metadata that resolves after disconnect', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: jest
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMeta.promise;
            })
            .mockResolvedValueOnce({
              universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
            }),
        },
      });

      const capabilitiesPromise = provider.getOrderCapabilities({
        symbol: 'ETH',
      });
      await requestStarted.promise;
      await provider.disconnect();
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 99 }],
      });

      expect(await capabilitiesPromise).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(await provider.getMaxLeverage('ETH')).toBe(50);
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('does not cache general metadata that resolves after disconnect', async () => {
      const universe = [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }];
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{ universe: typeof universe }>();
      const { infoClient } = useStrategyClients({
        info: {
          meta: jest
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMeta.promise;
            })
            .mockResolvedValueOnce({ universe }),
        },
      });

      const staleLeverage = provider.getMaxLeverage('ETH');
      await requestStarted.promise;
      const disconnectResult = provider.disconnect();
      pendingMeta.resolve({ universe });

      expect(await staleLeverage).toBe(50);
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      expect(await disconnectResult).toStrictEqual({ success: true });
      await provider.initialize();
      expect(await provider.getMaxLeverage('ETH')).toBe(50);
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('returns market data that finishes during disconnect without caching it', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMids = createDeferred<Record<string, string>>();
      const { infoClient } = useStrategyClients({
        info: {
          allMids: jest
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingMids.promise;
            })
            .mockResolvedValue({ ETH: '3000' }),
        },
      });

      const marketDataPromise = provider.getMarketDataWithPrices();
      await requestStarted.promise;
      await provider.disconnect();
      pendingMids.resolve({ ETH: '3000' });

      expect(await marketDataPromise).toStrictEqual(
        expect.arrayContaining([expect.objectContaining({ symbol: 'ETH' })]),
      );
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();

      const callsAfterStaleRead = infoClient.metaAndAssetCtxs.mock.calls.length;
      await provider.initialize();
      await provider.getMarketDataWithPrices();
      expect(infoClient.metaAndAssetCtxs.mock.calls.length).toBeGreaterThan(
        callsAfterStaleRead,
      );
    });

    it('does not cache Perp DEX metadata that resolves after disconnect', async () => {
      const requestStarted = createDeferred<void>();
      const pendingPerpDexs =
        createDeferred<(null | { name: string; deployerFeeScale: string })[]>();
      const { infoClient } = useStrategyClients({
        info: {
          perpDexs: jest
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingPerpDexs.promise;
            })
            .mockResolvedValueOnce([
              null,
              { name: 'xyz', deployerFeeScale: '1' },
            ]),
          meta: jest.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          }),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'xyz:TSLA',
      };

      const staleFees = provider.calculateFees(params);
      await requestStarted.promise;
      const disconnectPromise = provider.disconnect();
      pendingPerpDexs.resolve([null, { name: 'xyz', deployerFeeScale: '0.5' }]);

      await expect(staleFees).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(await disconnectPromise).toStrictEqual({ success: true });
      await provider.initialize();
      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0009,
      );
      expect(infoClient.perpDexs).toHaveBeenCalledTimes(2);
    });

    it('clears cached capability metadata when the network changes', async () => {
      const meta = jest
        .fn()
        .mockResolvedValueOnce({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
        })
        .mockResolvedValueOnce({
          universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }],
        });
      const { infoClient } = useStrategyClients({ info: { meta } });

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({ status: 'ready' });
      await provider.toggleTestnet();

      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'market_not_found',
      });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('retries client setup after initialization fails during a network toggle', async () => {
      const { infoClient } = useStrategyClients();
      mockClientService.initialize
        .mockRejectedValueOnce(new Error('initialization failed'))
        .mockResolvedValueOnce(undefined);

      expect(await provider.toggleTestnet()).toMatchObject({
        success: false,
        error: 'initialization failed',
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toMatchObject({
        status: 'ready',
        providerId: 'hyperliquid',
      });
      expect(mockClientService.initialize).toHaveBeenCalledTimes(2);
      expect(infoClient.meta).toHaveBeenCalledTimes(1);
    });

    it('does not cache capability metadata that resolves after a network change', async () => {
      const requestStarted = createDeferred<void>();
      const pendingMeta = createDeferred<{
        universe: { name: string; szDecimals: number; maxLeverage: number }[];
      }>();
      const meta = jest
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingMeta.promise;
        })
        .mockResolvedValueOnce({
          universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }],
        });
      const { infoClient } = useStrategyClients({ info: { meta } });

      const staleCapabilities = provider.getOrderCapabilities({
        symbol: 'ETH',
      });
      await requestStarted.promise;
      await provider.toggleTestnet();
      pendingMeta.resolve({
        universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
      });

      expect(await staleCapabilities).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(
        await provider.getOrderCapabilities({ symbol: 'BTC' }),
      ).toMatchObject({ status: 'ready' });
      expect(infoClient.meta).toHaveBeenCalledTimes(2);
    });

    it('reports unavailable when market metadata cannot be loaded', async () => {
      useStrategyClients({
        info: { meta: jest.fn().mockRejectedValue(new Error('offline')) },
      });
      const coldProvider = createTestProvider();

      expect(
        await coldProvider.getOrderCapabilities({ symbol: 'ETH' }),
      ).toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
    });
  });

  describe('Network-scoped fee cache', () => {
    const mainnetFees = {
      userCrossRate: '0.00030',
      userAddRate: '0.00010',
      userSpotCrossRate: '0.00040',
      userSpotAddRate: '0.00020',
      activeReferralDiscount: '0',
      dailyUserVlm: [],
    };
    const testnetFees = {
      ...mainnetFees,
      userCrossRate: '0.00060',
      userAddRate: '0.00020',
    };

    it('clears cached user fee rates when the network changes', async () => {
      const userFees = jest
        .fn()
        .mockResolvedValueOnce(mainnetFees)
        .mockResolvedValueOnce(testnetFees);
      const { infoClient } = useStrategyClients({ info: { userFees } });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'ETH',
      };

      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0003,
      );
      await provider.toggleTestnet();

      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0006,
      );
      expect(infoClient.userFees).toHaveBeenCalledTimes(2);
    });

    it('does not cache user fee rates that resolve after a network change', async () => {
      const requestStarted = createDeferred<void>();
      const pendingUserFees = createDeferred<typeof mainnetFees>();
      const userFees = jest
        .fn()
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return pendingUserFees.promise;
        })
        .mockResolvedValueOnce(testnetFees);
      const { infoClient } = useStrategyClients({ info: { userFees } });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'ETH',
      };

      const staleFees = provider.calculateFees(params);
      await requestStarted.promise;
      await provider.toggleTestnet();
      pendingUserFees.resolve(mainnetFees);
      await expect(staleFees).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );

      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0006,
      );
      expect(infoClient.userFees).toHaveBeenCalledTimes(2);
    });

    it('does not cache Perp DEX metadata that resolves after a network change', async () => {
      const requestStarted = createDeferred<void>();
      const pendingPerpDexs =
        createDeferred<(null | { name: string; deployerFeeScale: string })[]>();
      const { infoClient } = useStrategyClients({
        info: {
          perpDexs: jest
            .fn()
            .mockImplementationOnce(() => {
              requestStarted.resolve();
              return pendingPerpDexs.promise;
            })
            .mockResolvedValueOnce([
              null,
              { name: 'xyz', deployerFeeScale: '1' },
            ]),
          meta: jest.fn().mockResolvedValue({
            universe: [{ name: 'xyz:TSLA', szDecimals: 3, maxLeverage: 20 }],
          }),
        },
      });
      provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const params = {
        orderType: 'market' as const,
        amount: '1000',
        symbol: 'xyz:TSLA',
      };

      const staleFees = provider.calculateFees(params);
      await requestStarted.promise;
      await provider.toggleTestnet();
      pendingPerpDexs.resolve([null, { name: 'xyz', deployerFeeScale: '0.5' }]);

      await expect(staleFees).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect((await provider.calculateFees(params)).protocolFeeRate).toBe(
        0.0009,
      );
      expect(infoClient.perpDexs).toHaveBeenCalledTimes(2);
    });

    it('retains confirmed builder approval that finishes after disconnect', async () => {
      let cachedBuilderFee:
        | { attempted: boolean; success: boolean }
        | undefined;
      const mockedCache = jest.mocked(TradingReadinessCache);
      mockedCache.getBuilderFee.mockImplementation(() => cachedBuilderFee);
      mockedCache.setBuilderFee.mockImplementation(
        (_network, _userAddress, status) => {
          cachedBuilderFee = status;
        },
      );
      const verificationStarted = createDeferred<void>();
      const pendingVerification = createDeferred<number>();
      const maxBuilderFee = jest
        .fn()
        .mockResolvedValueOnce(0)
        .mockImplementationOnce(() => {
          verificationStarted.resolve();
          return pendingVerification.promise;
        })
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      const { exchangeClient } = useStrategyClients({
        info: { maxBuilderFee },
      });
      const params = {
        ...baseOrder,
        orderType: 'market',
      } satisfies OrderParams;

      const stalePlacement = provider.placeOrder(params);
      await verificationStarted.promise;
      const disconnect = provider.disconnect();
      pendingVerification.resolve(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      await Promise.all([stalePlacement, disconnect]);

      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);

      await provider.initialize();
      await provider.placeOrder(params);

      expect(exchangeClient.approveBuilderFee).toHaveBeenCalledTimes(1);
    });

    it('does not share pending builder setup across accounts', async () => {
      const firstAccount = '0x1234567890123456789012345678901234567890';
      const secondAccount = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      let selectedAccount = firstAccount;
      mockWalletService.getUserAddressWithDefault.mockImplementation(() =>
        Promise.resolve(selectedAccount),
      );

      const firstApprovalStarted = createDeferred<void>();
      const pendingFirstApproval = createDeferred<number>();
      const maxBuilderFee = jest
        .fn()
        .mockImplementationOnce(() => {
          firstApprovalStarted.resolve();
          return pendingFirstApproval.promise;
        })
        .mockResolvedValue(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      useStrategyClients({ info: { maxBuilderFee } });
      const params = {
        ...baseOrder,
        orderType: 'market' as const,
      };

      const firstPlacement = provider.placeOrder(params);
      await firstApprovalStarted.promise;
      selectedAccount = secondAccount;
      const secondPlacement = provider.placeOrder(params);
      await new Promise<void>((resolve) => setImmediate(resolve));
      const approvalChecksBeforeFirstResolved = maxBuilderFee.mock.calls.length;

      pendingFirstApproval.resolve(BUILDER_FEE_CONFIG.MaxFeeDecimal);
      await Promise.all([firstPlacement, secondPlacement]);

      expect(approvalChecksBeforeFirstResolved).toBe(2);
      expect(maxBuilderFee).toHaveBeenNthCalledWith(1, {
        user: firstAccount,
        builder: BUILDER_FEE_CONFIG.MainnetBuilder,
      });
      expect(maxBuilderFee).toHaveBeenNthCalledWith(2, {
        user: secondAccount,
        builder: BUILDER_FEE_CONFIG.MainnetBuilder,
      });
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('leaves a chase on the ordinary per-order minimum', async () => {
      useStrategyClients();

      const result = await provider.validateOrder({
        ...baseOrder,
        usdAmount: '20',
        orderType: 'chase',
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      expect(second).toStrictEqual({ success: true, orderId: placed.orderId });
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
      } satisfies OrderParams);

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
      expect(second).toStrictEqual({ success: true, orderId: placed.orderId });
    });

    it('completes a chase cancel when the SDK throws that its child is gone', async () => {
      useStrategyClients({
        exchange: {
          order: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 55 } }] } },
          }),
          cancel: jest
            .fn()
            .mockRejectedValue(
              new Error('Order was never placed, already canceled, or filled.'),
            ),
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

      expect(result).toStrictEqual({ success: true, orderId: placed.orderId });
      expect(await provider.getChaseOrders()).toStrictEqual([]);
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
      } satisfies OrderParams);

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

    it.each([
      [
        'a non-ok response',
        {
          status: 'err',
          response: {
            data: { statuses: ['success', 'success', 'success'] },
          },
        },
      ],
      [
        'a truncated response',
        {
          status: 'ok',
          response: { data: { statuses: ['success'] } },
        },
      ],
    ])('retains every scale child after %s', async (_label, failedCancel) => {
      const cancel = jest
        .fn()
        .mockResolvedValueOnce(failedCancel)
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: { statuses: ['success', 'success', 'success'] },
          },
        });
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
          cancel,
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);

      const first = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });
      const second = await provider.cancelOrder({
        orderId: placed.orderId,
        symbol: 'ETH',
        orderType: 'scale',
      });

      expect(first.error).toBe(
        PERPS_ERROR_CODES.ORDER_STRATEGY_CANCEL_INCOMPLETE,
      );
      expect(second).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(cancel).toHaveBeenNthCalledWith(2, {
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 22 },
          { a: 1, o: 33 },
        ],
      });
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
          newOrder: { ...baseOrder, orderType } satisfies OrderParams,
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);
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
            status: callOrder.includes('cancel') ? 'canceled' : 'open',
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
      } satisfies OrderParams);

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
          orderStatus: jest
            .fn()
            .mockResolvedValueOnce({
              status: 'order',
              order: {
                status: 'open',
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
            })
            .mockResolvedValue({
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
      } satisfies OrderParams);
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
      } satisfies OrderParams);

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

    it('does not reprice when the resting child stays unknown after retries', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const { exchangeClient, infoClient } = useStrategyClients({
        exchange: { order },
        info: {
          l2Book: bookThatMoves(),
          orderStatus: jest.fn().mockResolvedValue({ status: 'unknownOid' }),
        },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);

      await jest.advanceTimersByTimeAsync(5000);

      expect(infoClient.orderStatus).toHaveBeenCalledTimes(3);
      expect(exchangeClient.cancel).not.toHaveBeenCalled();
      expect(order).toHaveBeenCalledTimes(1);
      const snapshots = provider.getChaseOrders();
      await jest.advanceTimersByTimeAsync(300);
      expect(await snapshots).toContainEqual(
        expect.objectContaining({
          restingOrderId: '55',
          status: CHASE_ORDER_STATUS.Failed,
        }),
      );
      expect(infoClient.orderStatus).toHaveBeenCalledTimes(6);

      expect(
        await provider.cancelOrder({
          orderId: placed.orderId,
          symbol: 'ETH',
          orderType: 'chase',
        }),
      ).toStrictEqual({
        success: true,
        orderId: placed.orderId,
      });
      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
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
      } satisfies OrderParams);

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
      } satisfies OrderParams);

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
      } satisfies OrderParams);
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
        } satisfies OrderParams);
        expect(result.success).toBe(true);
      }

      const overflow = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } satisfies OrderParams);

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
        } satisfies OrderParams);
      }
      (exchangeClient.updateLeverage as jest.Mock).mockClear();

      const overflow = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        leverage: 5,
      } satisfies OrderParams);

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
          } satisfies OrderParams),
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
      } satisfies OrderParams);
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
      } satisfies OrderParams);
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

    it('retries a transient unknown status before replacing the child', async () => {
      const order = jest
        .fn()
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 55 } }] } },
        })
        .mockResolvedValueOnce({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: 66 } }] } },
        });
      const cancelledOrderStatus = {
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
      const orderStatus = jest
        .fn()
        .mockResolvedValueOnce({
          ...cancelledOrderStatus,
          order: { ...cancelledOrderStatus.order, status: 'open' },
        })
        .mockResolvedValueOnce({ status: 'unknownOid' })
        .mockResolvedValueOnce(cancelledOrderStatus);
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
      } satisfies OrderParams);

      await jest.advanceTimersByTimeAsync(1100);

      expect(orderStatus).toHaveBeenCalledTimes(3);
      expect(order).toHaveBeenCalledTimes(2);
      expect(placed.success).toBe(true);
      expect(order.mock.calls[1][0].orders[0]).toMatchObject({ s: '1' });
    });

    it('does not retain the cancelled child as a Chase route after a fill', async () => {
      const order = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 55 } }] } },
      });
      const orderStatus = (
        status: 'open' | 'filled',
        size: string,
      ): Record<string, unknown> => ({
        status: 'order',
        order: {
          status,
          order: {
            coin: 'ETH',
            side: 'B',
            limitPx: '2999.1',
            sz: size,
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
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: {
          orderStatus: jest
            .fn()
            .mockResolvedValueOnce(orderStatus('open', '1'))
            .mockResolvedValueOnce(orderStatus('filled', '0')),
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

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
      await jest.advanceTimersByTimeAsync(1000);

      await provider.cancelOrder({ orderId: '55', symbol: 'ETH' });

      expect(exchangeClient.cancel).toHaveBeenCalledTimes(2);
      expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
        cancels: [{ a: 1, o: 55 }],
      });
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
      } satisfies OrderParams);

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
          } satisfies OrderParams),
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
      } satisfies OrderParams);

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

  describe('Strategy placement racing a disconnect', () => {
    it('retracts a TWAP that finishes after teardown through its captured client', async () => {
      let disconnected: Promise<unknown> | undefined;
      const twapOrder = jest.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      const twapCancel = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { type: 'twapCancel', data: { status: 'success' } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { twapOrder, twapCancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await disconnected;

      expect(exchangeClient.twapCancel).toHaveBeenCalledWith({ a: 1, t: 987 });
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        submittedSize: '1',
      });
      expect(placed.orderId).toBeUndefined();
    });

    it('treats an already-finished stale TWAP as retracted', async () => {
      let disconnected: Promise<unknown> | undefined;
      const twapOrder = jest.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            type: 'twapOrder',
            data: { status: { running: { twapId: 987 } } },
          },
        };
      });
      const twapCancel = jest.fn().mockResolvedValue({
        status: 'ok',
        response: {
          type: 'twapCancel',
          data: { status: { error: 'Twap not found' } },
        },
      });
      useStrategyClients({ exchange: { twapOrder, twapCancel } });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'twap',
        twapDuration: 30,
      } satisfies OrderParams);
      await disconnected;

      expect(placed).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
        submittedSize: '1',
      });
    });

    it('retracts resting scale rungs and registers no stale group after teardown', async () => {
      let disconnected: Promise<unknown> | undefined;
      const order = jest.fn().mockImplementation(async () => {
        disconnected = provider.disconnect();
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error(PERPS_ERROR_CODES.EXCHANGE_CLIENT_NOT_AVAILABLE);
        });
        await Promise.resolve();
        return {
          status: 'ok',
          response: {
            data: {
              statuses: [
                { resting: { oid: 11 } },
                { filled: { oid: 22 } },
                { resting: { oid: 33 } },
              ],
            },
          },
        };
      });
      const cancel = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: ['success', 'success'] } },
      });
      const { exchangeClient } = useStrategyClients({
        exchange: { order, cancel },
      });

      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'scale',
        scaleMinPrice: '2000',
        scaleMaxPrice: '3000',
        scaleNumOrders: 3,
      } satisfies OrderParams);
      await disconnected;

      expect(exchangeClient.cancel).toHaveBeenCalledWith({
        cancels: [
          { a: 1, o: 11 },
          { a: 1, o: 33 },
        ],
      });
      expect(placed).toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(placed.orderId).toBeUndefined();
      expect(placed.childOrderIds).toStrictEqual(['22']);
    });
  });

  describe('Chase placement racing a disconnect', () => {
    it('keeps placement blocked until every overlapping lifecycle owner exits', async () => {
      let releaseDisconnect: (() => void) | undefined;
      mockClientService.disconnect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseDisconnect = resolve;
          }),
      );
      const { exchangeClient } = useStrategyClients();

      const disconnecting = provider.disconnect();
      await provider.suspendChaseOrders();
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      releaseDisconnect?.();
      await disconnecting;

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('rejects a placement admitted after disconnect starts', async () => {
      const { exchangeClient } = useStrategyClients();

      const disconnecting = provider.disconnect();
      const placed = await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
      } as OrderParams);
      await disconnecting;

      expect(placed.success).toBe(false);
      expect(placed.error).toBe(PERPS_ERROR_CODES.ORDER_CHASE_ABANDONED);
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

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
      } satisfies OrderParams);
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
      await provider.initialize();
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
      } satisfies OrderParams);
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
      } satisfies OrderParams);
      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      } satisfies OrderParams);
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
      } satisfies OrderParams);
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
