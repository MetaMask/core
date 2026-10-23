/* eslint-disable */
vi.mock('@nktkas/hyperliquid', () => ({}));

import type { CaipAssetId, Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockedClass, MockedFunction } from 'vitest';

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
import * as hyperLiquidAdapterModule from '../../../src/utils/hyperLiquidAdapter.js';
import {
  validateAssetSupport,
  validateBalance,
  validateCoinExists,
  validateDepositParams,
  validateOrderParams,
  validateWithdrawalParams,
} from '../../../src/utils/hyperLiquidValidation.js';
import * as hyperLiquidValidationModule from '../../../src/utils/hyperLiquidValidation.js';
import { createStandaloneInfoClient } from '../../../src/utils/standaloneInfoClient.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks.js';

vi.mock('../../../src/services/HyperLiquidClientService');
vi.mock('../../../src/services/HyperLiquidWalletService');
vi.mock('../../../src/services/HyperLiquidSubscriptionService');
// Mock stream manager - will be set up in test
let mockStreamManagerInstance: any;
const mockGetStreamManagerInstance = vi.fn(() => mockStreamManagerInstance);
vi.mock('../../../../components/UI/Perps/providers/PerpsStreamManager', () => ({
  getStreamManagerInstance: mockGetStreamManagerInstance,
}));

// Mock standalone info client for standalone mode tests
let mockStandaloneInfoClient: any;
vi.mock(
  import('../../../src/utils/standaloneInfoClient'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    createStandaloneInfoClient: vi.fn(() => mockStandaloneInfoClient),
  }),
);

vi.mock('../../../src/utils/hyperLiquidValidation', () => ({
  validateOrderParams: vi.fn(),
  validateWithdrawalParams: vi.fn(),
  validateDepositParams: vi.fn(),
  validateCoinExists: vi.fn(),
  validateAssetSupport: vi.fn(),
  validateBalance: vi.fn(),
  getSupportedPaths: vi
    .fn()
    .mockReturnValue([
      'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
      'eip155:1/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/default',
    ]),
  getBridgeInfo: vi.fn().mockReturnValue({
    chainId: 'eip155:42161',
    contractAddress: '0x1234567890123456789012345678901234567890',
  }),
  createErrorResult: vi.fn((error, defaultResponse) => ({
    ...defaultResponse,
    success: false,
    error: error instanceof Error ? error.message : String(error),
  })),
}));

// Mock adapter functions
vi.mock('../../../src/utils/hyperLiquidAdapter', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/utils/hyperLiquidAdapter.js')
    >();
  return {
    ...actual,
    adaptHyperLiquidLedgerUpdateToUserHistoryItem: vi.fn((updates) => {
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
vi.mock('../../../src/services/TradingReadinessCache');

const MockedHyperLiquidClientService = HyperLiquidClientService as MockedClass<
  typeof HyperLiquidClientService
>;
const MockedHyperLiquidWalletService = HyperLiquidWalletService as MockedClass<
  typeof HyperLiquidWalletService
>;
const MockedHyperLiquidSubscriptionService =
  HyperLiquidSubscriptionService as MockedClass<
    typeof HyperLiquidSubscriptionService
  >;
const mockValidateOrderParams = validateOrderParams as MockedFunction<
  typeof validateOrderParams
>;
const mockValidateWithdrawalParams = validateWithdrawalParams as MockedFunction<
  typeof validateWithdrawalParams
>;
const mockValidateDepositParams = validateDepositParams as MockedFunction<
  typeof validateDepositParams
>;
const mockValidateCoinExists = validateCoinExists as MockedFunction<
  typeof validateCoinExists
>;
const mockValidateAssetSupport = validateAssetSupport as MockedFunction<
  typeof validateAssetSupport
>;
const mockValidateBalance = validateBalance as MockedFunction<
  typeof validateBalance
>;

// Mock factory functions - defined once, reused everywhere
// These reduce duplication and make tests more maintainable
const createMockInfoClient = (overrides: Record<string, unknown> = {}) => ({
  clearinghouseState: vi.fn().mockResolvedValue({
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
  spotClearinghouseState: vi.fn().mockResolvedValue({
    balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
  }),
  // Mode-aware fold gate reads userAbstraction; default to unifiedAccount
  // so tests that predated the gate still see spot folded into spendable/withdrawable.
  userAbstraction: vi.fn().mockResolvedValue('unifiedAccount'),
  meta: vi.fn().mockResolvedValue({
    universe: [
      { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
      { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
    ],
  }),
  metaAndAssetCtxs: vi.fn().mockResolvedValue([
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
  perpDexs: vi.fn().mockResolvedValue([null]),
  allMids: vi.fn().mockResolvedValue({ BTC: '50000', ETH: '3000' }),
  frontendOpenOrders: vi.fn().mockResolvedValue([]),
  referral: vi.fn().mockResolvedValue({
    referrerState: {
      stage: 'ready',
      data: { code: 'MMCSI' },
    },
  }),
  maxBuilderFee: vi.fn().mockResolvedValue(1),
  userFees: vi.fn().mockResolvedValue({
    feeSchedule: {
      cross: '0.00030',
      add: '0.00010',
      spotCross: '0.00040',
      spotAdd: '0.00020',
    },
    dailyUserVlm: [],
  }),
  userNonFundingLedgerUpdates: vi.fn().mockResolvedValue([
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
  portfolio: vi.fn().mockResolvedValue([
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
  spotMeta: vi.fn().mockResolvedValue({
    tokens: [
      { name: 'USDC', tokenId: '0xdef456', index: 0 },
      { name: 'USDT', tokenId: '0x789abc', index: 1 },
    ],
    universe: [],
  }),
  historicalOrders: vi.fn().mockResolvedValue([]),
  userFills: vi.fn().mockResolvedValue([]),
  userFillsByTime: vi.fn().mockResolvedValue([]),
  userFunding: vi.fn().mockResolvedValue([]),
  ...overrides,
});

const createMockExchangeClient = (overrides: Record<string, unknown> = {}) => ({
  order: vi.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: [{ resting: { oid: 123 } }] } },
  }),
  modify: vi.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: [{ resting: { oid: '123' } }] } },
  }),
  cancel: vi.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: ['success'] } },
  }),
  withdraw3: vi.fn().mockResolvedValue({
    status: 'ok',
  }),
  updateLeverage: vi.fn().mockResolvedValue({
    status: 'ok',
  }),
  approveBuilderFee: vi.fn().mockResolvedValue({
    status: 'ok',
  }),
  setReferrer: vi.fn().mockResolvedValue({
    status: 'ok',
  }),
  sendAsset: vi.fn().mockResolvedValue({
    status: 'ok',
  }),
  agentSetAbstraction: vi.fn().mockResolvedValue({
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
  let mockClientService: Mocked<HyperLiquidClientService>;
  let mockWalletService: Mocked<HyperLiquidWalletService>;
  let mockSubscriptionService: Mocked<HyperLiquidSubscriptionService>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    (
      mockPlatformDependencies.marketDataFormatters.formatVolume as Mock
    ).mockImplementation((value: number) => '$' + value.toFixed(0));
    (
      mockPlatformDependencies.marketDataFormatters.formatPerpsFiat as Mock
    ).mockImplementation((value: number) => '$' + value.toFixed(2));
    (
      mockPlatformDependencies.marketDataFormatters.formatPercentage as Mock
    ).mockImplementation((value: number) => `${value.toFixed(2)}%`);
    (
      mockPlatformDependencies.featureFlags.validateVersionGated as Mock
    ).mockReturnValue(undefined);
    (mockPlatformDependencies.metrics.isEnabled as Mock).mockReturnValue(true);

    // Reset TradingReadinessCache mock state (using imported mocked module)
    const mockedCache = TradingReadinessCache as Mocked<
      typeof TradingReadinessCache
    >;
    mockedCache.get.mockReturnValue(undefined);
    mockedCache.getBuilderFee.mockReturnValue(undefined);
    mockedCache.getReferral.mockReturnValue(undefined);
    mockedCache.isInFlight.mockReturnValue(undefined);
    mockedCache.setInFlight.mockReturnValue(vi.fn());

    // Initialize mock stream manager instance
    mockStreamManagerInstance = {
      clearAllChannels: vi.fn(),
    };

    // Create mocked service instances using factory functions
    mockClientService = {
      initialize: vi.fn(),
      isInitialized: vi.fn().mockReturnValue(true),
      isTestnetMode: vi.fn().mockReturnValue(false),
      ensureInitialized: vi.fn(),
      getExchangeClient: vi.fn().mockReturnValue(createMockExchangeClient()),
      getInfoClient: vi.fn().mockReturnValue(createMockInfoClient()),
      fetchHistoricalOrders: vi.fn().mockResolvedValue([]),
      disconnect: vi.fn().mockResolvedValue(undefined),
      toggleTestnet: vi.fn(),
      setTestnetMode: vi.fn(),
      getNetwork: vi.fn().mockReturnValue('mainnet'),
      ensureSubscriptionClient: vi.fn().mockResolvedValue(undefined),
      getSubscriptionClient: vi.fn(),
      setOnReconnectCallback: vi.fn(),
      setOnTerminateCallback: vi.fn(),
      getConnectionState: vi.fn().mockReturnValue('connected'),
    } as Partial<HyperLiquidClientService> as Mocked<HyperLiquidClientService>;

    mockWalletService = {
      setTestnetMode: vi.fn(),
      getCurrentAccountId: vi
        .fn()
        .mockReturnValue(
          'eip155:42161:0x1234567890123456789012345678901234567890',
        ),
      createWalletAdapter: vi.fn().mockReturnValue({
        request: vi
          .fn()
          .mockResolvedValue(['0x1234567890123456789012345678901234567890']),
      }),
      getUserAddress: vi
        .fn()
        .mockReturnValue('0x1234567890123456789012345678901234567890'),
      getUserAddressWithDefault: vi
        .fn()
        .mockResolvedValue('0x1234567890123456789012345678901234567890'),
      isMainAccountSignerReady: vi.fn().mockReturnValue(true),
      requiresSignatureConfirmation: vi.fn().mockReturnValue(false),
    } as Partial<HyperLiquidWalletService> as Mocked<HyperLiquidWalletService>;

    mockSubscriptionService = {
      subscribeToPrices: vi.fn().mockResolvedValue(vi.fn()), // Returns Promise
      subscribeToPositions: vi.fn().mockReturnValue(vi.fn()), // Returns function directly
      subscribeToOrderFills: vi.fn().mockReturnValue(vi.fn()), // Returns function directly
      clearAll: vi.fn(),
      isPositionsCacheInitialized: vi.fn().mockReturnValue(false),
      getCachedPositions: vi.fn().mockReturnValue([]),
      getFreshPositionsForAllDexs: vi.fn().mockReturnValue(null),
      getCachedPositionsForDex: vi.fn().mockReturnValue(null),
      updateFeatureFlags: vi.fn().mockResolvedValue(undefined),
      // Cache methods used by buildAssetMapping optimization
      setDexMetaCache: vi.fn(),
      setDexAssetCtxsCache: vi.fn(),
      getDexAssetCtxsCache: vi.fn().mockReturnValue(undefined),
      // Price cache used by placeOrder, editOrder, closePosition optimizations
      getCachedPrice: vi.fn().mockImplementation((symbol: string) => {
        const prices: Record<string, string> = { BTC: '50000', ETH: '3000' };
        return prices[symbol];
      }),
      getLastAllMidsSnapshot: vi.fn().mockReturnValue(null),
      // Orders cache used by updatePositionTPSL and getOpenOrders
      isOrdersCacheInitialized: vi.fn().mockReturnValue(false),
      getCachedOrders: vi.fn().mockReturnValue([]),
      // Atomic getter - returns null when cache not initialized (prevents race condition)
      getOrdersCacheIfInitialized: vi.fn().mockReturnValue(null),
      // Abstraction-mode resolved-mode setter (unified account migration)
      setUserAbstractionMode: vi.fn(),
    } as Partial<HyperLiquidSubscriptionService> as Mocked<HyperLiquidSubscriptionService>;

    // Mock constructors
    MockedHyperLiquidClientService.mockImplementation(function () {
      return mockClientService;
    });
    MockedHyperLiquidWalletService.mockImplementation(function () {
      return mockWalletService;
    });
    MockedHyperLiquidSubscriptionService.mockImplementation(function () {
      return mockSubscriptionService;
    });

    // Mock validation
    mockValidateOrderParams.mockReturnValue({ isValid: true });
    mockValidateWithdrawalParams.mockReturnValue({ isValid: true });
    mockValidateDepositParams.mockReturnValue({ isValid: true });
    mockValidateCoinExists.mockReturnValue({ isValid: true });
    mockValidateAssetSupport.mockReturnValue({ isValid: true });
    mockValidateBalance.mockReturnValue({ isValid: true });
    const hyperLiquidValidation =
      hyperLiquidValidationModule as unknown as Record<string, Mock>;
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
    const hyperLiquidAdapter = hyperLiquidAdapterModule as unknown as Record<
      string,
      Mock
    >;
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
      mockClientService.fetchHistoricalCandles = vi
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
      mockClientService.fetchHistoricalCandles = vi
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
      const mockUserFunding = vi.fn().mockResolvedValue(records);
      mockClientService.getInfoClient = vi
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

      const mockUserFunding = vi
        .fn()
        .mockResolvedValueOnce(capRecords)
        .mockResolvedValueOnce(leftHalfRecords)
        .mockResolvedValueOnce(rightHalfRecords);

      mockClientService.getInfoClient = vi
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
      const mockUserFunding = vi.fn().mockResolvedValue(capRecords);
      mockClientService.getInfoClient = vi
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
      const mockUserFunding = vi.fn().mockResolvedValue([]);
      mockClientService.getInfoClient = vi
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
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          perpDexs: vi.fn().mockRejectedValue(new Error('Network timeout')),
        }),
      );
      MockedHyperLiquidClientService.mockImplementation(function () {
        return mockClientService;
      });

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
      mockClientService.getExchangeClient = vi.fn(() => {
        throw bomb;
      });
      await expect(provider.getExchangeClient()).rejects.toBe(bomb);
    });
  });
});
