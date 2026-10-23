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
  describe('Constructor and Initialization', () => {
    it('initializes with default mainnet configuration', () => {
      expect(provider).toBeDefined();
      expect(provider.protocolId).toBe('hyperliquid');
    });

    it('initializes with testnet configuration', () => {
      const testnetProvider = createTestProvider({ isTestnet: true });
      expect(testnetProvider).toBeDefined();
      expect(testnetProvider.protocolId).toBe('hyperliquid');
    });

    it('initializes provider successfully', async () => {
      const result = await provider.initialize();

      expect(result.success).toBe(true);
      expect(mockClientService.initialize).toHaveBeenCalled();
    });

    it('handles initialization errors', async () => {
      mockClientService.initialize.mockImplementationOnce(() => {
        throw new Error('Init failed');
      });

      const result = await provider.initialize();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Init failed');
    });

    it('initializes with HIP-3 disabled when hip3Enabled is false', async () => {
      const disabledProvider = createTestProvider({
        hip3Enabled: false,
      });

      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          perpDexs: vi
            .fn()
            .mockResolvedValue([
              null,
              { name: 'dex1', url: 'https://dex1.example' },
            ]),
        }),
      );

      await disabledProvider.initialize();

      const markets = await disabledProvider.getMarkets();
      expect(Array.isArray(markets)).toBe(true);
    });

    it('falls back to main DEX when perpDexs returns invalid response', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          perpDexs: vi.fn().mockResolvedValue(null),
        }),
      );

      await provider.initialize();

      const markets = await provider.getMarkets();
      expect(Array.isArray(markets)).toBe(true);
    });

    it('does not throw when allowlist contains invalid patterns', () => {
      expect(() => {
        createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:TSLA', '"bad"pattern"', 'valid:*'],
        });
      }).not.toThrow();
    });

    it('does not throw when blocklist contains invalid patterns', () => {
      expect(() => {
        createTestProvider({
          hip3Enabled: true,
          blocklistMarkets: ['valid:BTC', '"invalid"', 'also:valid'],
        });
      }).not.toThrow();
    });

    it('logs warning for skipped invalid patterns', () => {
      createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['"bad"pattern"'],
      });

      expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({ provider: 'hyperliquid' }),
          context: expect.objectContaining({
            name: 'HyperLiquidProvider',
            data: expect.objectContaining({
              method: 'compilePatternsSafely',
              pattern: '"bad"pattern"',
            }),
          }),
        }),
      );
    });

    it('compiles valid patterns even when some are invalid', () => {
      const testProvider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:TSLA', '"bad"pattern"', 'valid:*'],
      });

      // Provider should be functional — valid patterns compiled, bad ones skipped
      expect(testProvider).toBeDefined();
      expect(testProvider.protocolId).toBe('hyperliquid');
    });

    it('handles perpDexs array with null entries', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          perpDexs: vi
            .fn()
            .mockResolvedValue([
              null,
              { name: 'dex1', url: 'https://dex1.example' },
              null,
            ]),
        }),
      );

      await provider.initialize();

      const markets = await provider.getMarkets();
      expect(Array.isArray(markets)).toBe(true);
    });
  });

  describe('Route Management', () => {
    it('gets deposit routes with constraints', () => {
      const routes = provider.getDepositRoutes();
      expect(Array.isArray(routes)).toBe(true);

      // Check that routes have constraints
      if (routes.length > 0) {
        const route = routes[0];
        expect(route.constraints).toBeDefined();
        expect(route.constraints?.minAmount).toBe('1.01');
        expect(route.constraints?.estimatedMinutes).toBe(5);
        expect(route.constraints?.fees).toEqual({
          fixed: 1,
          token: 'USDC',
        });
      }
    });

    it('gets withdrawal routes with constraints', () => {
      const routes = provider.getWithdrawalRoutes();
      expect(Array.isArray(routes)).toBe(true);

      // Check that routes have constraints (same as deposit routes)
      if (routes.length > 0) {
        const route = routes[0];
        expect(route.constraints).toBeDefined();
        expect(route.constraints?.minAmount).toBe('1.01');
        expect(route.constraints?.estimatedMinutes).toBe(5);
        expect(route.constraints?.fees).toEqual({
          fixed: 1,
          token: 'USDC',
        });
      }
    });

    it('filters routes by parameters', () => {
      const params = { isTestnet: true };
      const routes = provider.getDepositRoutes(params);

      expect(Array.isArray(routes)).toBe(true);
    });
  });
});
