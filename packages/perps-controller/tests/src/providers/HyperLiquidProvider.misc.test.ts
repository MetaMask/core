/* eslint-disable */
jest.mock('@nktkas/hyperliquid', () => ({}));

import type { CaipAssetId, Hex } from '@metamask/utils';

import { CandlePeriod } from '../../../src/constants/chartConfig.js';
import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../../src/constants/hyperLiquidConfig.js';
import { PERPS_TRANSACTIONS_HISTORY_CONSTANTS } from '../../../src/constants/transactionsHistoryConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import { TradingReadinessCache } from '../../../src/services/TradingReadinessCache.js';
import type {
  ClosePositionParams,
  DepositParams,
  Order,
  PerpsPlatformDependencies,
  LiveDataConfig,
  OrderParams,
} from '../../../src/types/index.js';
import {
  validateAssetSupport,
  validateBalance,
  validateCoinExists,
  validateDepositParams,
  validateOrderParams,
  validateWithdrawalParams,
} from '../../../src/utils/hyperLiquidValidation.js';
import { createStandaloneInfoClient } from '../../../src/utils/standaloneInfoClient.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

jest.mock('../../../src/services/HyperLiquidClientService');
jest.mock('../../../src/services/HyperLiquidWalletService');
jest.mock('../../../src/services/HyperLiquidSubscriptionService');
// Mock stream manager - will be set up in test
let mockStreamManagerInstance: any;
const mockGetStreamManagerInstance = jest.fn(() => mockStreamManagerInstance);
jest.mock(
  '../../../../components/UI/Perps/providers/PerpsStreamManager',
  () => ({
    getStreamManagerInstance: mockGetStreamManagerInstance,
  }),
  { virtual: true },
);

// Mock standalone info client for standalone mode tests
let mockStandaloneInfoClient: any;
jest.mock('../../../src/utils/standaloneInfoClient', () => ({
  ...jest.requireActual('../../../src/utils/standaloneInfoClient'),
  createStandaloneInfoClient: jest.fn(() => mockStandaloneInfoClient),
}));

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

// Mock factory functions - defined once, reused everywhere
// These reduce duplication and make tests more maintainable
const createMockInfoClient = (overrides: Record<string, unknown> = {}) => ({
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
  frontendOpenOrders: jest.fn().mockResolvedValue([]),
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

const createMockExchangeClient = (overrides: Record<string, unknown> = {}) => ({
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
 * Helper to create HyperLiquidProvider with mock platform dependencies
 * @param options
 * @param options.isTestnet
 * @param options.hip3Enabled
 * @param options.allowlistMarkets
 * @param options.blocklistMarkets
 * @param options.useUnifiedAccount
 */
const createTestProvider = (
  options: {
    isTestnet?: boolean;
    hip3Enabled?: boolean;
    allowlistMarkets?: string[];
    blocklistMarkets?: string[];
    useUnifiedAccount?: boolean;
    initialAssetMapping?: [string, number][];
  } = {},
): HyperLiquidProvider =>
  new HyperLiquidProvider({
    ...options,
    platformDependencies: mockPlatformDependencies,
    messenger: mockMessenger,
  });

describe('HyperLiquidProvider', () => {
  let provider: HyperLiquidProvider;
  let mockClientService: jest.Mocked<HyperLiquidClientService>;
  let mockWalletService: jest.Mocked<HyperLiquidWalletService>;
  let mockSubscriptionService: jest.Mocked<HyperLiquidSubscriptionService>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    (
      mockPlatformDependencies.marketDataFormatters.formatVolume as jest.Mock
    ).mockImplementation((value: number) => '$' + value.toFixed(0));
    (
      mockPlatformDependencies.marketDataFormatters.formatPerpsFiat as jest.Mock
    ).mockImplementation((value: number) => '$' + value.toFixed(2));
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
  describe('fetchHistoricalCandles', () => {
    const options = {
      symbol: 'BTC',
      interval: CandlePeriod.OneHour,
      limit: 100,
    };

    it('returns candle data from clientService', async () => {
      // Arrange
      const mockCandles = {
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        candles: [
          {
            open: '50000',
            close: '51000',
            high: '51500',
            low: '49500',
            volume: '100',
            time: 1000,
          },
        ],
      };
      mockClientService.fetchHistoricalCandles = jest
        .fn()
        .mockResolvedValue(mockCandles);

      // Act
      const result = await provider.fetchHistoricalCandles(options);

      // Assert
      expect(mockClientService.ensureInitialized).toHaveBeenCalled();
      expect(mockClientService.fetchHistoricalCandles).toHaveBeenCalledWith(
        options,
      );
      expect(result).toStrictEqual(mockCandles);
    });

    it('returns empty candles when clientService returns null', async () => {
      // Arrange
      mockClientService.fetchHistoricalCandles = jest
        .fn()
        .mockResolvedValue(null);

      // Act
      const result = await provider.fetchHistoricalCandles(options);

      // Assert
      expect(result).toStrictEqual({
        symbol: options.symbol,
        interval: options.interval,
        candles: [],
      });
    });
  });

  describe('getFunding', () => {
    const makeFundingRecord = (time: number, coin = 'BTC') => ({
      delta: { coin, usdc: '0.001', fundingRate: '0.0001' },
      hash: `0x${time.toString(16)}`,
      time,
    });

    it('returns funding records for the default 30-day window with a single API call', async () => {
      // Arrange
      const records = [
        makeFundingRecord(Date.now() - 2000, 'ETH'),
        makeFundingRecord(Date.now() - 1000, 'BTC'),
      ];
      const mockUserFunding = jest.fn().mockResolvedValue(records);
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(
          createMockInfoClient({ userFunding: mockUserFunding }),
        );

      // Act
      const result = await provider.getFunding();

      // Assert — exactly one API call for the default 30-day window
      expect(mockUserFunding).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('ETH');
      expect(result[1].symbol).toBe('BTC');
    });

    it('auto-splits window when API returns the record cap and recovers all records from sub-windows', async () => {
      // Arrange — first call hits the cap (500 records); the function discards
      // those and refetches the two halves. Each half is under the cap.
      const apiLimit =
        PERPS_TRANSACTIONS_HISTORY_CONSTANTS.FUNDING_HISTORY_API_LIMIT;
      const capRecords = Array.from({ length: apiLimit }, (_, i) =>
        makeFundingRecord(1_700_000_000_000 + i * 1000),
      );
      const leftHalfRecords = [makeFundingRecord(1_700_000_001_000)];
      const rightHalfRecords = [
        makeFundingRecord(1_700_000_002_000),
        makeFundingRecord(1_700_000_003_000),
      ];

      const mockUserFunding = jest
        .fn()
        .mockResolvedValueOnce(capRecords)
        .mockResolvedValueOnce(leftHalfRecords)
        .mockResolvedValueOnce(rightHalfRecords);

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(
          createMockInfoClient({ userFunding: mockUserFunding }),
        );

      // Act — 2-day explicit window (> 1 h minimum) so splitting is allowed
      const endTime = 1_700_000_100_000;
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      const result = await provider.getFunding({
        startTime: endTime - twoDaysMs,
        endTime,
      });

      // Assert — 3 calls total: original window + left half + right half
      expect(mockUserFunding).toHaveBeenCalledTimes(3);
      // Combined result comes from the sub-windows (not the capped initial call)
      expect(result).toHaveLength(
        leftHalfRecords.length + rightHalfRecords.length,
      );
    });

    it('does not split when window is at or below the minimum split size', async () => {
      // Arrange — even with a full 500-record response the 1-hour window must
      // not recurse (prevents infinite recursion at the minimum boundary)
      const apiLimit =
        PERPS_TRANSACTIONS_HISTORY_CONSTANTS.FUNDING_HISTORY_API_LIMIT;
      const capRecords = Array.from({ length: apiLimit }, (_, i) =>
        makeFundingRecord(Date.now() - i * 1000),
      );
      const mockUserFunding = jest.fn().mockResolvedValue(capRecords);
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(
          createMockInfoClient({ userFunding: mockUserFunding }),
        );

      // Act — 1-hour window equals minSplitWindowMs; no split should occur
      const oneHourMs = 60 * 60 * 1000;
      const endTime = Date.now();
      await provider.getFunding({ startTime: endTime - oneHourMs, endTime });

      // Assert — exactly one call, no recursive splitting
      expect(mockUserFunding).toHaveBeenCalledTimes(1);
    });

    it('passes explicit startTime and endTime directly to the API', async () => {
      // Arrange
      const mockUserFunding = jest.fn().mockResolvedValue([]);
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(
          createMockInfoClient({ userFunding: mockUserFunding }),
        );

      // Act
      const startTime = 1_700_000_000_000;
      const endTime = 1_702_592_000_000; // startTime + 30 days
      await provider.getFunding({ startTime, endTime });

      // Assert — explicit bounds forwarded verbatim to the API
      expect(mockUserFunding).toHaveBeenCalledWith(
        expect.objectContaining({ startTime, endTime }),
      );
    });
  });

  describe('buildAssetMapping with perpDexs network failure', () => {
    it('completes asset mapping using fallback when perpDexs throws', async () => {
      // Arrange — perpDexs throws, so getValidatedDexs falls back to [null]
      const freshProvider = createTestProvider({ hip3Enabled: true });
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          perpDexs: jest.fn().mockRejectedValue(new Error('Network timeout')),
        }),
      );
      MockedHyperLiquidClientService.mockImplementation(
        () => mockClientService,
      );

      // Act — triggering ensureReady -> buildAssetMapping via getPositions
      await freshProvider.initialize();
      const markets = await freshProvider.getMarkets();

      // Assert — provider remains functional with main DEX only
      expect(Array.isArray(markets)).toBe(true);
    });
  });

  describe('getExchangeClient escape hatch', () => {
    it('delegates to the client service and resolves with the underlying ExchangeClient', async () => {
      const sentinel = mockClientService.getExchangeClient();
      await expect(provider.getExchangeClient()).resolves.toBe(sentinel);
    });

    it('propagates errors thrown by the client service', async () => {
      const bomb = new Error('client not initialized');
      mockClientService.getExchangeClient = jest.fn(() => {
        throw bomb;
      });
      await expect(provider.getExchangeClient()).rejects.toBe(bomb);
    });
  });
});
