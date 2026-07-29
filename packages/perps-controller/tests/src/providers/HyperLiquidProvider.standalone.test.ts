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
  describe('WebSocket connection state methods', () => {
    // Import actual enum to ensure type compatibility
    const { WebSocketConnectionState } = jest.requireActual(
      '../../../src/services/HyperLiquidClientService',
    );

    beforeEach(() => {
      // Add WebSocket methods to mock client service
      mockClientService.getConnectionState = jest
        .fn()
        .mockReturnValue(WebSocketConnectionState.Connected);
      mockClientService.subscribeToConnectionState = jest
        .fn()
        .mockReturnValue(jest.fn());
      mockClientService.reconnect = jest.fn().mockResolvedValue(undefined);
    });

    it('getWebSocketConnectionState delegates to clientService', () => {
      // Arrange
      mockClientService.getConnectionState.mockReturnValue(
        WebSocketConnectionState.Connected,
      );

      // Act
      const result = provider.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Connected);
      expect(mockClientService.getConnectionState).toHaveBeenCalled();
    });

    it('subscribeToConnectionState delegates to clientService', () => {
      // Arrange
      const mockUnsubscribe = jest.fn();
      mockClientService.subscribeToConnectionState.mockReturnValue(
        mockUnsubscribe,
      );
      const listener = jest.fn();

      // Act
      const unsubscribe = provider.subscribeToConnectionState(listener);

      // Assert
      expect(mockClientService.subscribeToConnectionState).toHaveBeenCalledWith(
        listener,
      );
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it('reconnect delegates to clientService', async () => {
      // Arrange
      mockClientService.reconnect.mockResolvedValue(undefined);

      // Act
      await provider.reconnect();

      // Assert
      expect(mockClientService.reconnect).toHaveBeenCalled();
    });
  });

  describe('getOrFetchFills - Cache-First Pattern', () => {
    const mockFills = [
      {
        orderId: '123',
        symbol: 'BTC',
        side: 'buy' as const,
        size: '0.1',
        price: '50000',
        fee: '5',
        feeToken: 'USDC',
        timestamp: Date.now(),
        pnl: '100',
        direction: 'Open Long',
        success: true,
      },
      {
        orderId: '124',
        symbol: 'ETH',
        side: 'sell' as const,
        size: '1.0',
        price: '3000',
        fee: '3',
        feeToken: 'USDC',
        timestamp: Date.now() - 1000,
        pnl: '-50',
        direction: 'Close Short',
        success: true,
      },
    ];

    it('uses cached fills when cache is initialized', async () => {
      // Arrange
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue(mockFills);

      // Act
      const result = await provider.getOrFetchFills({});

      // Assert
      expect(result).toEqual(mockFills);
      expect(
        mockSubscriptionService.getFillsCacheIfInitialized,
      ).toHaveBeenCalled();
      // Should NOT call REST API
      expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
    });

    it('falls back to REST API when cache returns null', async () => {
      // Arrange - cache not initialized
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue(null);

      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        userFills: jest.fn().mockResolvedValue([
          {
            oid: 125,
            coin: 'BTC',
            side: 'B',
            sz: '0.5',
            px: '49000',
            fee: '2',
            feeToken: 'USDC',
            time: Date.now(),
            closedPnl: '50',
            dir: 'Open Long',
          },
        ]),
      });

      // Act
      const result = await provider.getOrFetchFills({});

      // Assert
      expect(
        mockSubscriptionService.getFillsCacheIfInitialized,
      ).toHaveBeenCalled();
      expect(mockClientService.getInfoClient).toHaveBeenCalled();
      expect(result.length).toBe(1);
      expect(result[0].symbol).toBe('BTC');
    });

    it('filters cached fills by startTime', async () => {
      // Arrange
      const now = Date.now();
      const fillsWithDifferentTimes = [
        { ...mockFills[0], timestamp: now },
        { ...mockFills[1], timestamp: now - 100000 }, // Older fill
      ];
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue(fillsWithDifferentTimes);

      // Act - filter to only include recent fills
      const result = await provider.getOrFetchFills({ startTime: now - 50000 });

      // Assert - should only include the more recent fill
      expect(result.length).toBe(1);
      expect(result[0].timestamp).toBe(now);
    });

    it('filters cached fills by symbol', async () => {
      // Arrange
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue(mockFills);

      // Act - filter to only BTC fills
      const result = await provider.getOrFetchFills({ symbol: 'BTC' });

      // Assert - should only include BTC fill
      expect(result.length).toBe(1);
      expect(result[0].symbol).toBe('BTC');
    });

    it('filters cached fills by both startTime and symbol', async () => {
      // Arrange
      const now = Date.now();
      const fillsWithDifferentTimesAndSymbols = [
        { ...mockFills[0], symbol: 'BTC', timestamp: now },
        { ...mockFills[0], symbol: 'BTC', timestamp: now - 100000 },
        { ...mockFills[0], symbol: 'ETH', timestamp: now },
      ];
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue(fillsWithDifferentTimesAndSymbols);

      // Act - filter to recent BTC fills only
      const result = await provider.getOrFetchFills({
        startTime: now - 50000,
        symbol: 'BTC',
      });

      // Assert - should only include recent BTC fill
      expect(result.length).toBe(1);
      expect(result[0].symbol).toBe('BTC');
      expect(result[0].timestamp).toBe(now);
    });

    it('returns all fills when no filter params provided', async () => {
      // Arrange
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue(mockFills);

      // Act - no filter params
      const result = await provider.getOrFetchFills();

      // Assert - should return all fills
      expect(result).toEqual(mockFills);
    });

    it('returns empty array when cache is initialized but empty', async () => {
      // Arrange - cache initialized but no fills
      mockSubscriptionService.getFillsCacheIfInitialized = jest
        .fn()
        .mockReturnValue([]);

      // Act
      const result = await provider.getOrFetchFills({});

      // Assert
      expect(result).toEqual([]);
      // Should NOT call REST API since cache is initialized
      expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
    });
  });

  describe('standalone mode', () => {
    const mockUserAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    const mockCreateStandaloneInfoClient =
      createStandaloneInfoClient as jest.MockedFunction<
        typeof createStandaloneInfoClient
      >;

    beforeEach(() => {
      // Reset standalone client mock
      mockStandaloneInfoClient = {
        clearinghouseState: jest.fn(),
        frontendOpenOrders: jest.fn(),
        perpDexs: jest.fn().mockResolvedValue([null]),
        spotClearinghouseState: jest.fn().mockResolvedValue({ balances: [] }),
        // Mode-aware fold gate requires userAbstraction on standalone info
        // clients as well; default to unifiedAccount for pre-existing tests.
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
      };
      mockCreateStandaloneInfoClient.mockImplementation(
        () => mockStandaloneInfoClient,
      );
    });

    describe('getPositions with standalone mode', () => {
      it('returns positions via standalone client when standalone mode enabled', async () => {
        // Arrange
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '0.5',
                entryPx: '45000',
                positionValue: '22500',
                unrealizedPnl: '500',
                marginUsed: '2250',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '40000',
                maxLeverage: 50,
                returnOnEquity: '22.22',
                cumFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
              },
              type: 'oneWay',
            },
          ],
          marginSummary: {
            totalMarginUsed: '2250',
            accountValue: '25000',
          },
        });

        // Act
        const positions = await provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(mockCreateStandaloneInfoClient).toHaveBeenCalledWith({
          isTestnet: false,
        });
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledWith({ user: mockUserAddress });
        expect(positions).toHaveLength(1);
        expect(positions[0].symbol).toBe('BTC');
        expect(positions[0].size).toBe('0.5');
      });

      it('filters zero-size positions in standalone mode', async () => {
        // Arrange - include positions with zero size
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '0.5',
                entryPx: '45000',
                positionValue: '22500',
                unrealizedPnl: '500',
                marginUsed: '2250',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '40000',
                maxLeverage: 50,
                returnOnEquity: '22.22',
                cumFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
              },
              type: 'oneWay',
            },
            {
              position: {
                coin: 'ETH',
                szi: '0', // Zero size - should be filtered out
                entryPx: '3000',
                positionValue: '0',
                unrealizedPnl: '0',
                marginUsed: '0',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '0',
                maxLeverage: 50,
                returnOnEquity: '0',
                cumFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
              },
              type: 'oneWay',
            },
          ],
          marginSummary: {
            totalMarginUsed: '2250',
            accountValue: '25000',
          },
        });

        // Act
        const positions = await provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - ETH position with zero size should be filtered out
        expect(positions).toHaveLength(1);
        expect(positions[0].symbol).toBe('BTC');
      });

      it('uses testnet endpoint when provider is in testnet mode', async () => {
        // Arrange - override isTestnetMode to return true for this test
        mockClientService.isTestnetMode.mockReturnValue(true);
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
        });

        // Act
        await provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(mockCreateStandaloneInfoClient).toHaveBeenCalledWith({
          isTestnet: true,
        });
      });

      it('returns empty array when standalone client fails', async () => {
        // Arrange - getPositions catches errors and returns empty array
        mockStandaloneInfoClient.clearinghouseState.mockRejectedValue(
          new Error('Network error'),
        );

        // Act
        const positions = await provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - returns empty array instead of throwing (matches implementation)
        expect(positions).toEqual([]);
      });
    });

    describe('getAccountState with standalone mode', () => {
      it('returns account state via standalone client when standalone mode enabled', async () => {
        // Arrange
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: {
            totalMarginUsed: '1000',
            accountValue: '50000',
          },
          withdrawable: '45000',
          crossMarginSummary: {
            accountValue: '50000',
            totalMarginUsed: '1000',
          },
        });

        // Act
        const accountState = await provider.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(mockCreateStandaloneInfoClient).toHaveBeenCalledWith({
          isTestnet: false,
        });
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledWith({ user: mockUserAddress });
        expect(accountState.totalBalance).toBeDefined();
      });

      it('uses testnet endpoint when provider is in testnet mode', async () => {
        // Arrange - override isTestnetMode to return true for this test
        mockClientService.isTestnetMode.mockReturnValue(true);
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
          withdrawable: '0',
          crossMarginSummary: { accountValue: '0', totalMarginUsed: '0' },
        });

        // Act
        await provider.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(mockCreateStandaloneInfoClient).toHaveBeenCalledWith({
          isTestnet: true,
        });
      });

      it('returns fallback account state when standalone client fails', async () => {
        // Arrange
        mockStandaloneInfoClient.clearinghouseState.mockRejectedValue(
          new Error('API unavailable'),
        );

        // Act
        const result = await provider.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert — all DEX queries failed, aggregateAccountStates([]) returns fallback
        expect(result).toEqual({
          spendableBalance: '--',
          withdrawableBalance: '--',
          totalBalance: '--',
          marginUsed: '--',
          unrealizedPnl: '--',
          returnOnEquity: '--',
        });
      });
    });

    describe('getOpenOrders with standalone mode', () => {
      it('returns orders via standalone client when standalone mode enabled', async () => {
        // Arrange - mock with all required FrontendOrder fields for adaptOrderFromSDK
        mockStandaloneInfoClient.frontendOpenOrders.mockResolvedValue([
          {
            coin: 'BTC',
            oid: 12345,
            side: 'B',
            limitPx: '50000',
            sz: '0.1',
            origSz: '0.1',
            timestamp: Date.now(),
            orderType: 'Limit',
            isTrigger: false,
            reduceOnly: false,
            isPositionTpsl: false,
            cloid: undefined,
            children: [],
          },
        ]);

        // Act
        const orders = await provider.getOpenOrders({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(mockCreateStandaloneInfoClient).toHaveBeenCalledWith({
          isTestnet: false,
        });
        expect(
          mockStandaloneInfoClient.frontendOpenOrders,
        ).toHaveBeenCalledWith({ user: mockUserAddress });
        expect(orders).toHaveLength(1);
        expect(orders[0].symbol).toBe('BTC');
        expect(orders[0].side).toBe('buy');
      });

      it('returns empty array when standalone client fails', async () => {
        // Arrange
        mockStandaloneInfoClient.frontendOpenOrders.mockRejectedValue(
          new Error('API unavailable'),
        );

        // Act
        const orders = await provider.getOpenOrders({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert — all DEX queries failed, flatMap([]) returns empty
        expect(orders).toEqual([]);
      });
    });

    describe('multi-DEX standalone mode (HIP-3)', () => {
      let hip3Provider: HyperLiquidProvider;

      beforeEach(() => {
        hip3Provider = createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:*'],
        });

        // Mock perpDexs to return main DEX + HIP-3 DEX
        mockStandaloneInfoClient.perpDexs.mockResolvedValue([
          null, // main DEX
          { name: 'xyz' },
        ]);
      });

      it('returns positions from both main DEX and HIP-3 DEXs', async () => {
        // Arrange: main DEX has BTC, xyz DEX has TSLA
        mockStandaloneInfoClient.clearinghouseState
          .mockResolvedValueOnce({
            assetPositions: [
              {
                position: {
                  coin: 'BTC',
                  szi: '0.5',
                  entryPx: '45000',
                  positionValue: '22500',
                  unrealizedPnl: '500',
                  marginUsed: '2250',
                  leverage: { type: 'cross', value: 10 },
                  liquidationPx: '40000',
                  maxLeverage: 50,
                  returnOnEquity: '22.22',
                  cumFunding: {
                    allTime: '10',
                    sinceOpen: '5',
                    sinceChange: '2',
                  },
                },
                type: 'oneWay',
              },
            ],
            marginSummary: {
              totalMarginUsed: '2250',
              accountValue: '25000',
            },
          })
          .mockResolvedValueOnce({
            assetPositions: [
              {
                position: {
                  coin: 'TSLA',
                  szi: '10',
                  entryPx: '250',
                  positionValue: '2500',
                  unrealizedPnl: '100',
                  marginUsed: '500',
                  leverage: { type: 'cross', value: 5 },
                  liquidationPx: '200',
                  maxLeverage: 20,
                  returnOnEquity: '20',
                  cumFunding: {
                    allTime: '1',
                    sinceOpen: '0.5',
                    sinceChange: '0.1',
                  },
                },
                type: 'oneWay',
              },
            ],
            marginSummary: {
              totalMarginUsed: '500',
              accountValue: '2600',
            },
          });

        // Act
        const positions = await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - should have positions from both DEXs
        expect(positions).toHaveLength(2);
        expect(positions[0].symbol).toBe('BTC');
        expect(positions[1].symbol).toBe('TSLA');
        // Main DEX called without dex param, HIP-3 called with dex param
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledWith({ user: mockUserAddress });
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledWith({ user: mockUserAddress, dex: 'xyz' });
      });

      it('falls back to main DEX only when perpDexs() fails', async () => {
        // Arrange: perpDexs fails
        mockStandaloneInfoClient.perpDexs.mockRejectedValue(
          new Error('Network error'),
        );
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '1',
                entryPx: '45000',
                positionValue: '45000',
                unrealizedPnl: '0',
                marginUsed: '4500',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '40000',
                maxLeverage: 50,
                returnOnEquity: '0',
                cumFunding: {
                  allTime: '0',
                  sinceOpen: '0',
                  sinceChange: '0',
                },
              },
              type: 'oneWay',
            },
          ],
          marginSummary: {
            totalMarginUsed: '4500',
            accountValue: '45000',
          },
        });

        // Act
        const positions = await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - should fall back to main DEX only
        expect(positions).toHaveLength(1);
        expect(positions[0].symbol).toBe('BTC');
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledTimes(1);
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledWith({ user: mockUserAddress });

        // Verify cache was NOT poisoned: a subsequent call should retry perpDexs()
        mockStandaloneInfoClient.perpDexs.mockResolvedValue([
          null,
          { name: 'xyz' },
        ]);
        mockStandaloneInfoClient.clearinghouseState
          .mockResolvedValueOnce({
            assetPositions: [
              {
                position: {
                  coin: 'BTC',
                  szi: '1',
                  entryPx: '45000',
                  positionValue: '45000',
                  unrealizedPnl: '0',
                  marginUsed: '4500',
                  leverage: { type: 'cross', value: 10 },
                  liquidationPx: '40000',
                  maxLeverage: 50,
                  returnOnEquity: '0',
                  cumFunding: {
                    allTime: '0',
                    sinceOpen: '0',
                    sinceChange: '0',
                  },
                },
                type: 'oneWay',
              },
            ],
            marginSummary: {
              totalMarginUsed: '4500',
              accountValue: '45000',
            },
          })
          .mockResolvedValueOnce({
            assetPositions: [
              {
                position: {
                  coin: 'TSLA',
                  szi: '10',
                  entryPx: '200',
                  positionValue: '2000',
                  unrealizedPnl: '50',
                  marginUsed: '200',
                  leverage: { type: 'cross', value: 10 },
                  liquidationPx: '180',
                  maxLeverage: 50,
                  returnOnEquity: '25',
                  cumFunding: {
                    allTime: '0',
                    sinceOpen: '0',
                    sinceChange: '0',
                  },
                },
                type: 'oneWay',
              },
            ],
            marginSummary: {
              totalMarginUsed: '200',
              accountValue: '2000',
            },
          });

        const retryPositions = await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // perpDexs should have been called again (retry after transient failure)
        expect(mockStandaloneInfoClient.perpDexs).toHaveBeenCalledTimes(2);
        // Should now see positions from both DEXs
        expect(retryPositions).toHaveLength(2);
        const symbols = retryPositions.map((p) => p.symbol).sort();
        expect(symbols).toEqual(['BTC', 'TSLA']);
      });

      it('returns only main DEX positions when hip3Enabled is false', async () => {
        // Arrange: use provider with HIP-3 disabled
        const disabledProvider = createTestProvider({
          hip3Enabled: false,
        });
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [
            {
              position: {
                coin: 'ETH',
                szi: '5',
                entryPx: '3000',
                positionValue: '15000',
                unrealizedPnl: '200',
                marginUsed: '1500',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '2500',
                maxLeverage: 50,
                returnOnEquity: '13.33',
                cumFunding: {
                  allTime: '5',
                  sinceOpen: '2',
                  sinceChange: '1',
                },
              },
              type: 'oneWay',
            },
          ],
          marginSummary: {
            totalMarginUsed: '1500',
            accountValue: '15200',
          },
        });

        // Act
        const positions = await disabledProvider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - perpDexs should NOT be called
        expect(mockStandaloneInfoClient.perpDexs).not.toHaveBeenCalled();
        expect(positions).toHaveLength(1);
        expect(positions[0].symbol).toBe('ETH');
      });

      it('caches validated DEXs across multiple readonly calls', async () => {
        // Arrange
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
          withdrawable: '0',
        });

        // Act - call getPositions twice on same provider instance
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - perpDexs should only be called once (cached on second call)
        expect(mockStandaloneInfoClient.perpDexs).toHaveBeenCalledTimes(1);
      });

      it('aggregates account state across multiple DEXs in standalone mode', async () => {
        // Arrange: main DEX + xyz DEX both have balances
        mockStandaloneInfoClient.clearinghouseState
          .mockResolvedValueOnce({
            assetPositions: [],
            marginSummary: {
              totalMarginUsed: '1000',
              accountValue: '50000',
            },
            withdrawable: '45000',
          })
          .mockResolvedValueOnce({
            assetPositions: [],
            marginSummary: {
              totalMarginUsed: '500',
              accountValue: '5000',
            },
            withdrawable: '4000',
          });

        // Act
        const accountState = await hip3Provider.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - balances should be aggregated
        expect(parseFloat(accountState.totalBalance)).toBe(55000);
        expect(parseFloat(accountState.marginUsed)).toBe(1500);
      });

      it('does not poison fully-initialized cache when standalone perpDexs() fails', async () => {
        // Arrange: standalone perpDexs fails (transient network error)
        mockStandaloneInfoClient.perpDexs.mockRejectedValue(
          new Error('Network error'),
        );
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
        });

        // Act: standalone call falls back to main DEX only
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Now set up the fully-initialized path's perpDexs to succeed
        const infoClient = mockClientService.getInfoClient();
        (infoClient.perpDexs as jest.Mock).mockResolvedValue([
          null,
          { name: 'xyz' },
        ]);

        // Initialize the provider for fully-initialized path
        await hip3Provider.initialize();

        // Act: fully-initialized getPositions should discover HIP-3 DEXs
        await hip3Provider.getPositions();

        // Assert: fully-initialized path called perpDexs (cache was NOT poisoned)
        expect(infoClient.perpDexs).toHaveBeenCalled();
        // clearinghouseState should be called for both main + xyz DEX
        expect(infoClient.clearinghouseState).toHaveBeenCalledTimes(2);
      });

      it('does not cache invalid perpDexs response in standalone mode', async () => {
        // Arrange: perpDexs returns invalid (non-array) response
        mockStandaloneInfoClient.perpDexs.mockResolvedValue(null);
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
        });

        // Act: first call gets invalid response, falls back to main DEX
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(mockStandaloneInfoClient.perpDexs).toHaveBeenCalledTimes(1);

        // Fix perpDexs to return valid response
        mockStandaloneInfoClient.perpDexs.mockResolvedValue([
          null,
          { name: 'xyz' },
        ]);

        // Act: second standalone call should retry perpDexs (not cached)
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert: perpDexs was called again on the second call
        expect(mockStandaloneInfoClient.perpDexs).toHaveBeenCalledTimes(2);
      });

      it('shares cache between standalone and fully-initialized when standalone succeeds', async () => {
        // Arrange: standalone perpDexs succeeds
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
        });

        // Act: standalone call succeeds and caches the validated DEXs
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(mockStandaloneInfoClient.perpDexs).toHaveBeenCalledTimes(1);

        // Initialize the provider for fully-initialized path
        await hip3Provider.initialize();
        const infoClient = mockClientService.getInfoClient();

        // Act: fully-initialized getPositions should reuse standalone's cache
        await hip3Provider.getPositions();

        // Assert: fully-initialized path did NOT call perpDexs (reused cache)
        expect(infoClient.perpDexs).not.toHaveBeenCalled();
        // clearinghouseState should be called for both main + xyz DEX (from cache)
        expect(infoClient.clearinghouseState).toHaveBeenCalledTimes(2);
      });

      it('filters DEXs via testnet config when in testnet mode', async () => {
        // Arrange: testnet mode with TESTNET_HIP3_CONFIG.EnabledDexs = ['xyz']
        (mockClientService.isTestnetMode as jest.Mock).mockReturnValue(true);
        const testnetProvider = createTestProvider({
          hip3Enabled: true,
          isTestnet: true,
        });

        // perpDexs returns main + xyz + other DEX
        mockStandaloneInfoClient.perpDexs.mockResolvedValue([
          null,
          { name: 'xyz' },
          { name: 'otherdex' },
        ]);
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
        });

        // Act
        await testnetProvider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert: clearinghouseState called for main + xyz only (otherdex filtered out)
        expect(
          mockStandaloneInfoClient.clearinghouseState,
        ).toHaveBeenCalledTimes(2);
        // Restore
        (mockClientService.isTestnetMode as jest.Mock).mockReturnValue(false);
      });

      it('updates unified state atomically when standalone perpDexs succeeds', async () => {
        // Arrange
        mockStandaloneInfoClient.clearinghouseState.mockResolvedValue({
          assetPositions: [],
          marginSummary: { totalMarginUsed: '0', accountValue: '0' },
        });

        // Act: first standalone call populates dexDiscoveryCache
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert: second call reuses cached state — perpDexs NOT called again
        mockStandaloneInfoClient.perpDexs.mockClear();
        await hip3Provider.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(mockStandaloneInfoClient.perpDexs).not.toHaveBeenCalled();
      });
    });
  });
});
