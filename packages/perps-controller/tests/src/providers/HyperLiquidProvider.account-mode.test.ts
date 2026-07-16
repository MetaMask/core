import { jest } from '@jest/globals';
/* eslint-disable */
jest.mock('@nktkas/hyperliquid', () => ({}));

import type { CaipAssetId, Hex } from '@metamask/utils';

import { CandlePeriod } from '../../../src/constants/chartConfig';
import {
  BUILDER_FEE_CONFIG,
  REFERRAL_CONFIG,
} from '../../../src/constants/hyperLiquidConfig';
import { PERPS_TRANSACTIONS_HISTORY_CONSTANTS } from '../../../src/constants/transactionsHistoryConfig';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService';
import { TradingReadinessCache } from '../../../src/services/TradingReadinessCache';
import type {
  ClosePositionParams,
  DepositParams,
  Order,
  PerpsPlatformDependencies,
  LiveDataConfig,
  OrderParams,
} from '../../../src/types';
import {
  validateAssetSupport,
  validateBalance,
  validateCoinExists,
  validateDepositParams,
  validateOrderParams,
  validateWithdrawalParams,
} from '../../../src/utils/hyperLiquidValidation';
import { createStandaloneInfoClient } from '../../../src/utils/standaloneInfoClient';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../../helpers/serviceMocks';

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
  describe('getUserNonFundingLedgerUpdates', () => {
    it('returns non-funding ledger updates', async () => {
      // Arrange
      const mockUpdates = [
        {
          delta: { type: 'deposit', usdc: '100' },
          time: Date.now(),
          hash: '0x123',
        },
        {
          delta: { type: 'withdraw', usdc: '50' },
          time: Date.now() - 3600000,
          hash: '0x456',
        },
      ];
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userNonFundingLedgerUpdates: jest.fn().mockResolvedValue(mockUpdates),
        }),
      );

      // Act
      const result = await provider.getUserNonFundingLedgerUpdates();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(mockClientService.getInfoClient).toHaveBeenCalled();
    });

    it('returns empty array on error', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userNonFundingLedgerUpdates: jest
            .fn()
            .mockRejectedValue(new Error('API Error')),
        }),
      );

      // Act
      const result = await provider.getUserNonFundingLedgerUpdates();

      // Assert
      expect(result).toEqual([]);
    });
  });

  // TODO: Refactor to test through public API — ES # private fields prevent direct access
  describe.skip('HIP-3 Private Methods', () => {
    interface ProviderWithPrivateMethods {
      getUsdcTokenId(): Promise<string>;
      getBalanceForDex(params: { dex: string | null }): Promise<number>;
      findSourceDexWithBalance(params: {
        targetDex: string;
        requiredAmount: number;
      }): Promise<{ sourceDex: string; available: number } | null>;
      cachedUsdcTokenId?: string;
    }

    let testableProvider: ProviderWithPrivateMethods;

    beforeEach(() => {
      testableProvider = provider as unknown as ProviderWithPrivateMethods;
      // Reset cache
      testableProvider.cachedUsdcTokenId = undefined;
    });

    describe('getUsdcTokenId', () => {
      it('returns cached token ID when available', async () => {
        // Arrange
        testableProvider.cachedUsdcTokenId = 'USDC:0xabc123';

        // Act
        const result = await testableProvider.getUsdcTokenId();

        // Assert
        expect(result).toBe('USDC:0xabc123');
        expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
      });

      it('fetches and caches token ID on first call', async () => {
        // Arrange
        const mockSpotMeta = {
          tokens: [
            { name: 'USDC', tokenId: '0xdef456', index: 0 },
            { name: 'USDT', tokenId: '0x789abc', index: 1 },
          ],
          universe: [],
        };
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            spotMeta: jest.fn().mockResolvedValue(mockSpotMeta),
          }),
        );

        // Act
        const result = await testableProvider.getUsdcTokenId();

        // Assert
        expect(result).toBe('USDC:0xdef456');
        expect(testableProvider.cachedUsdcTokenId).toBe('USDC:0xdef456');
        expect(mockClientService.getInfoClient).toHaveBeenCalledTimes(1);
      });

      it('throws error when USDC token not found in metadata', async () => {
        // Arrange
        const mockSpotMeta = {
          tokens: [{ name: 'USDT', tokenId: '0x789abc', index: 0 }],
          universe: [],
        };
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            spotMeta: jest.fn().mockResolvedValue(mockSpotMeta),
          }),
        );

        // Act & Assert
        await expect(testableProvider.getUsdcTokenId()).rejects.toThrow(
          'USDC token not found in spot metadata',
        );
      });
    });

    describe('findSourceDexWithBalance', () => {
      it('finds main DEX with sufficient balance', async () => {
        jest
          .spyOn(testableProvider, 'getBalanceForDex')
          .mockResolvedValue(1000);
        const result = await testableProvider.findSourceDexWithBalance({
          targetDex: 'xyz',
          requiredAmount: 500,
        });
        expect(result).toEqual({ sourceDex: '', available: 1000 });
      });

      it('returns null when insufficient balance', async () => {
        jest.spyOn(testableProvider, 'getBalanceForDex').mockResolvedValue(100);
        const result = await testableProvider.findSourceDexWithBalance({
          targetDex: 'xyz',
          requiredAmount: 500,
        });
        expect(result).toBeNull();
      });
    });

    describe('getAllAvailableDexs', () => {
      interface ProviderWithDexMethods {
        getAllAvailableDexs(): Promise<(string | null)[]>;
        dexDiscoveryCache: {
          state: {
            raw: ({ name: string; url: string } | null)[];
            validated: (string | null)[];
            timestamp: number;
          } | null;
          reset(): void;
        };
      }

      let testableProvider: ProviderWithDexMethods;

      beforeEach(() => {
        testableProvider = provider as unknown as ProviderWithDexMethods;
        // Reset unified state
        testableProvider.dexDiscoveryCache.reset();
      });

      it('returns cached DEX list when cache is populated', async () => {
        // Arrange
        testableProvider.dexDiscoveryCache.state = {
          raw: [
            null,
            { name: 'dex1', url: 'https://dex1.example' },
            { name: 'dex2', url: 'https://dex2.example' },
          ],
          validated: [null, 'dex1', 'dex2'],
          timestamp: Date.now(),
        };

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null, 'dex1', 'dex2']);
        expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
      });

      it('fetches DEX list from API when cache is empty', async () => {
        // Arrange
        const mockDexs = [
          null,
          { name: 'dex1', url: 'https://dex1.example' },
          { name: 'dex2', url: 'https://dex2.example' },
        ];
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            perpDexs: jest.fn().mockResolvedValue(mockDexs),
          }),
        );

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null, 'dex1', 'dex2']);
        expect(testableProvider.dexDiscoveryCache.state?.raw).toEqual(mockDexs);
        expect(mockClientService.getInfoClient).toHaveBeenCalledTimes(1);
      });

      it('returns fallback when API returns null', async () => {
        // Arrange
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            perpDexs: jest.fn().mockResolvedValue(null),
          }),
        );

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null]);
        expect(testableProvider.dexDiscoveryCache.state).toBeNull();
      });

      it('returns fallback when API returns non-array', async () => {
        // Arrange
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            perpDexs: jest.fn().mockResolvedValue({ invalid: 'data' }),
          }),
        );

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null]);
        expect(testableProvider.dexDiscoveryCache.state).toBeNull();
      });

      it('returns fallback and logs error when API throws', async () => {
        // Arrange
        const mockError = new Error('Network error');
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            perpDexs: jest.fn().mockRejectedValue(mockError),
          }),
        );
        (mockPlatformDependencies.logger.error as jest.Mock).mockClear();

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null]);
        expect(testableProvider.dexDiscoveryCache.state).toBeNull();
        expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
          mockError,
          expect.objectContaining({
            context: expect.objectContaining({
              name: 'HyperLiquidProvider',
              data: expect.objectContaining({
                method: 'getAllAvailableDexs',
              }),
            }),
          }),
        );
      });

      it('filters out null entries from cached DEX list', async () => {
        // Arrange
        testableProvider.dexDiscoveryCache.state = {
          raw: [
            null,
            { name: 'dex1', url: 'https://dex1.example' },
            null,
            { name: 'dex2', url: 'https://dex2.example' },
          ],
          validated: [null, 'dex1', 'dex2'],
          timestamp: Date.now(),
        };

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null, 'dex1', 'dex2']);
      });

      it('returns only main DEX when cached list contains only null', async () => {
        // Arrange
        testableProvider.dexDiscoveryCache.state = {
          raw: [null],
          validated: [null],
          timestamp: Date.now(),
        };

        // Act
        const result = await testableProvider.getAllAvailableDexs();

        // Assert
        expect(result).toEqual([null]);
      });
    });

    describe('ensureReadyForTrading', () => {
      interface ProviderWithTradingSetup {
        ensureReadyForTrading(): Promise<void>;
        ensureReady(): Promise<void>;
        tradingSetupComplete: boolean;
      }

      let testableProvider: ProviderWithTradingSetup;

      beforeEach(() => {
        testableProvider = provider as unknown as ProviderWithTradingSetup;
        testableProvider.tradingSetupComplete = false;
      });

      it('calls ensureReady first before trading setup', async () => {
        // Arrange - spy on ensureReady
        const ensureReadySpy = jest
          .spyOn(testableProvider, 'ensureReady')
          .mockResolvedValue();

        // Act
        await testableProvider.ensureReadyForTrading();

        // Assert
        expect(ensureReadySpy).toHaveBeenCalled();
      });

      it('returns immediately when tradingSetupComplete is true', async () => {
        // Arrange
        testableProvider.tradingSetupComplete = true;
        const ensureReadySpy = jest
          .spyOn(testableProvider, 'ensureReady')
          .mockResolvedValue();

        // Act
        await testableProvider.ensureReadyForTrading();

        // Assert - should call ensureReady but skip trading setup
        expect(ensureReadySpy).toHaveBeenCalled();
        // No signing operations should be called
        expect(
          (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
            .setInFlight,
        ).not.toHaveBeenCalled();
      });

      it('sets tradingSetupComplete to true after successful setup', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'ensureReady').mockResolvedValue();
        // Mock all caches as already attempted to skip signing
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).get.mockReturnValue({
          attempted: true,
          enabled: true,
          timestamp: Date.now(),
        });
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).getBuilderFee.mockReturnValue({
          attempted: true,
          success: true,
        });
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).getReferral.mockReturnValue({
          attempted: true,
          success: true,
        });

        // Act
        await testableProvider.ensureReadyForTrading();

        // Assert
        expect(testableProvider.tradingSetupComplete).toBe(true);
      });

      it('keeps tradingSetupComplete false when keyring is locked', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'ensureReady').mockResolvedValue();
        // Mock all caches as already attempted to skip signing
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).get.mockReturnValue({
          attempted: true,
          enabled: true,
          timestamp: Date.now(),
        });
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).getBuilderFee.mockReturnValue({
          attempted: true,
          success: true,
        });
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).getReferral.mockReturnValue({
          attempted: true,
          success: true,
        });
        // Keyring is locked
        (
          mockWalletService as unknown as { isKeyringUnlocked: jest.Mock }
        ).isKeyringUnlocked.mockReturnValue(false);

        // Act
        await testableProvider.ensureReadyForTrading();

        // Assert - tradingSetupComplete should remain false
        expect(testableProvider.tradingSetupComplete).toBe(false);
      });
    });

    describe('autoTransferForHip3Order', () => {
      interface ProviderWithAutoTransfer {
        autoTransferForHip3Order(params: {
          targetDex: string;
          requiredMargin: number;
        }): Promise<{ amount: number; sourceDex: string } | null>;
        getBalanceForDex(params: { dex: string | null }): Promise<number>;
        findSourceDexWithBalance(params: {
          targetDex: string;
          requiredAmount: number;
        }): Promise<{ sourceDex: string; available: number } | null>;
        transferBetweenDexs(params: {
          sourceDex: string;
          destinationDex: string;
          amount: string;
        }): Promise<{ success: boolean; error?: string }>;
      }

      let testableProvider: ProviderWithAutoTransfer;

      beforeEach(() => {
        testableProvider = provider as unknown as ProviderWithAutoTransfer;
      });

      it('returns null when target DEX has sufficient balance', async () => {
        // Arrange
        jest
          .spyOn(testableProvider, 'getBalanceForDex')
          .mockResolvedValue(1000);

        // Act
        const result = await testableProvider.autoTransferForHip3Order({
          targetDex: 'xyz',
          requiredMargin: 500,
        });

        // Assert
        expect(result).toBeNull();
      });

      it('transfers from main DEX when target has insufficient balance', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getBalanceForDex').mockResolvedValue(100); // Target has only 100
        jest
          .spyOn(testableProvider, 'findSourceDexWithBalance')
          .mockResolvedValue({ sourceDex: '', available: 1000 });
        jest
          .spyOn(testableProvider, 'transferBetweenDexs')
          .mockResolvedValue({ success: true });

        // Act
        const result = await testableProvider.autoTransferForHip3Order({
          targetDex: 'xyz',
          requiredMargin: 500,
        });

        // Assert
        expect(result).toEqual({ amount: expect.any(Number), sourceDex: '' });
        expect(testableProvider.transferBetweenDexs).toHaveBeenCalledWith({
          sourceDex: '',
          destinationDex: 'xyz',
          amount: expect.any(String),
        });
      });

      it('throws error when no source has sufficient balance', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getBalanceForDex').mockResolvedValue(100); // Target has only 100
        jest
          .spyOn(testableProvider, 'findSourceDexWithBalance')
          .mockResolvedValue(null); // No source found

        // Act & Assert
        await expect(
          testableProvider.autoTransferForHip3Order({
            targetDex: 'xyz',
            requiredMargin: 500,
          }),
        ).rejects.toThrow('Insufficient balance for HIP-3 order');
      });

      it('throws error when transfer fails', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getBalanceForDex').mockResolvedValue(100);
        jest
          .spyOn(testableProvider, 'findSourceDexWithBalance')
          .mockResolvedValue({ sourceDex: '', available: 1000 });
        jest
          .spyOn(testableProvider, 'transferBetweenDexs')
          .mockResolvedValue({ success: false, error: 'Transfer failed' });

        // Act & Assert
        await expect(
          testableProvider.autoTransferForHip3Order({
            targetDex: 'xyz',
            requiredMargin: 500,
          }),
        ).rejects.toThrow('Auto-transfer failed: Transfer failed');
      });
    });

    describe('calculateHip3RequiredMargin', () => {
      interface ProviderWithMarginCalc {
        calculateHip3RequiredMargin(params: {
          symbol: string;
          dexName: string;
          positionSize: number;
          orderPrice: number;
          leverage: number;
          isBuy: boolean;
        }): Promise<number>;
        getPositions(): Promise<
          { symbol: string; size: string; marginUsed: string }[]
        >;
      }

      let testableProvider: ProviderWithMarginCalc;

      beforeEach(() => {
        testableProvider = provider as unknown as ProviderWithMarginCalc;
      });

      it('calculates total margin when increasing existing long position', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getPositions').mockResolvedValue([
          {
            symbol: 'BTC',
            size: '1.0', // Existing long position
            marginUsed: '5000',
          },
        ]);

        // Act
        const result = await testableProvider.calculateHip3RequiredMargin({
          symbol: 'BTC',
          dexName: 'xyz',
          positionSize: 0.5, // Adding to position
          orderPrice: 50000,
          leverage: 10,
          isBuy: true, // Long order - increasing position
        });

        // Assert
        // Total size = 1.0 + 0.5 = 1.5
        // Total notional = 1.5 * 50000 = 75000
        // Total margin = 75000 / 10 = 7500
        // With buffer (1.003) = 7522.5
        expect(result).toBeCloseTo(7522.5, 1);
      });

      it('calculates incremental margin when reversing position', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getPositions').mockResolvedValue([
          {
            symbol: 'BTC',
            size: '1.0', // Existing long position
            marginUsed: '5000',
          },
        ]);

        // Act
        const result = await testableProvider.calculateHip3RequiredMargin({
          symbol: 'BTC',
          dexName: 'xyz',
          positionSize: 0.5,
          orderPrice: 50000,
          leverage: 10,
          isBuy: false, // Short order - opposite direction
        });

        // Assert
        // Only new order margin (not total)
        // Notional = 0.5 * 50000 = 25000
        // Margin = 25000 / 10 = 2500
        // With buffer (1.003) = 2507.5
        expect(result).toBeCloseTo(2507.5, 1);
      });

      it('calculates margin for new position when no existing position', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getPositions').mockResolvedValue([]);

        // Act
        const result = await testableProvider.calculateHip3RequiredMargin({
          symbol: 'ETH',
          dexName: 'xyz',
          positionSize: 10,
          orderPrice: 3000,
          leverage: 5,
          isBuy: true,
        });

        // Assert
        // Notional = 10 * 3000 = 30000
        // Margin = 30000 / 5 = 6000
        // With buffer (1.003) = 6018
        expect(result).toBeCloseTo(6018, 1);
      });

      it('calculates total margin when increasing existing short position', async () => {
        // Arrange
        jest.spyOn(testableProvider, 'getPositions').mockResolvedValue([
          {
            symbol: 'ETH',
            size: '-5.0', // Existing short position
            marginUsed: '3000',
          },
        ]);

        // Act
        const result = await testableProvider.calculateHip3RequiredMargin({
          symbol: 'ETH',
          dexName: 'xyz',
          positionSize: 2.0, // Adding to short
          orderPrice: 3000,
          leverage: 5,
          isBuy: false, // Short order - increasing short position
        });

        // Assert
        // Total size = 5.0 + 2.0 = 7.0
        // Total notional = 7.0 * 3000 = 21000
        // Total margin = 21000 / 5 = 4200
        // With buffer (1.003) = 4212.6
        expect(result).toBeCloseTo(4212.6, 1);
      });
    });
  });

  describe('ensureUnifiedAccountEnabled', () => {
    // These tests verify the unified account migration behaviour that runs
    // inside #ensureReady() → #ensureUnifiedAccountEnabled(). Because the
    // method is native-private (#), we trigger it via the public
    // getMarketDataWithPrices() entry point, which calls #ensureReady() on
    // every fresh provider instance.

    // The user address used by mockWalletService.getUserAddressWithDefault
    const USER_ADDRESS = '0x1234567890123456789012345678901234567890';

    // ─────────────────────────────────────────────────
    // Early-exit paths
    // ─────────────────────────────────────────────────

    it('does not call userAbstraction when useUnifiedAccount is false', async () => {
      // Arrange - provider created with the feature disabled
      const disabledProvider = createTestProvider({ useUnifiedAccount: false });
      const mockInfoClient = createMockInfoClient({
        userAbstraction: jest.fn().mockResolvedValue('default'),
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      await disabledProvider.getMarketDataWithPrices();

      // Assert - userAbstraction never queried (feature is off)
      expect(mockInfoClient.userAbstraction).not.toHaveBeenCalled();
    });

    it('does not call userAbstraction when global cache indicates already attempted', async () => {
      // Arrange - cache says setup was already tried (success or failure)
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).get.mockReturnValue({
        attempted: true,
        enabled: true,
        timestamp: Date.now(),
      });
      const mockInfoClient = createMockInfoClient({
        userAbstraction: jest.fn().mockResolvedValue('default'),
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - skipped because of cache
      expect(mockInfoClient.userAbstraction).not.toHaveBeenCalled();
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .get,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS);
    });

    it('waits for in-flight then returns when another provider already cached the result', async () => {
      // Arrange — another provider instance is mid-setup AND will land a
      // cache entry by the time we resume from the await.
      let resolveInFlight: () => void = () => undefined;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).isInFlight.mockReturnValue(inFlightPromise);
      // Outer cache check returns undefined; post-await cache check reflects
      // the other instance's recorded result.
      (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>).get
        .mockReturnValueOnce(undefined)
        .mockReturnValue({
          attempted: true,
          enabled: true,
          timestamp: Date.now(),
        });

      const mockInfoClient = createMockInfoClient({
        userAbstraction: jest.fn().mockResolvedValue('default'),
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      const marketDataPromise = provider.getMarketDataWithPrices();
      resolveInFlight();
      await marketDataPromise;

      // Assert — checked for in-flight, saw the cache landed, returned without
      // acquiring a new lock or re-fetching userAbstraction.
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .isInFlight,
      ).toHaveBeenCalledWith('unifiedAccount', 'mainnet', USER_ADDRESS);
      expect(mockInfoClient.userAbstraction).not.toHaveBeenCalled();
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .setInFlight,
      ).not.toHaveBeenCalled();
    });

    it('waits for in-flight then runs its own attempt when no cache was written (deferred dexAbstraction case)', async () => {
      // Scenario: another provider's init-time call (allowUserSigning=false)
      // hit the dexAbstraction defer branch and finished without writing the
      // cache. Our caller is action-time (allowUserSigning=true via withdraw)
      // and must not skip the migration just because another instance was
      // mid-setup.
      let resolveInFlight: () => void = () => undefined;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).isInFlight.mockReturnValue(inFlightPromise);
      // Cache stays empty across both checks (no entry was written by the
      // other instance because it deferred).
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).get.mockReturnValue(undefined);

      const exchangeClient = createMockExchangeClient();
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
        }),
      );

      Object.defineProperty(provider, 'getAccountState', {
        value: jest.fn().mockResolvedValue({ availableBalance: '5000' }),
        writable: true,
      });

      // Act — withdraw is the action-time entry that requires migration.
      const withdrawPromise = provider.withdraw({
        amount: '100',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      });
      resolveInFlight();
      await withdrawPromise;

      // Assert — fell through, acquired our own lock, and migrated.
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .setInFlight,
      ).toHaveBeenCalledWith('unifiedAccount', 'mainnet', USER_ADDRESS);
      expect(exchangeClient.userSetAbstraction).toHaveBeenCalledWith({
        user: USER_ADDRESS,
        abstraction: 'unifiedAccount',
      });
    });

    it('returns early when re-check cache (inside lock) shows another provider completed', async () => {
      // Arrange - first get() → undefined, second get() (inside try) → cached
      (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>).get
        .mockReturnValueOnce(undefined) // outer check
        .mockReturnValueOnce({
          attempted: true,
          enabled: true,
          timestamp: Date.now(),
        }); // inner re-check after lock acquired

      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);

      const mockInfoClient = createMockInfoClient({
        userAbstraction: jest.fn().mockResolvedValue('default'),
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - lock was acquired and released, but no API call made
      expect(mockInfoClient.userAbstraction).not.toHaveBeenCalled();
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    // ─────────────────────────────────────────────────
    // Already on a compatible mode (unifiedAccount or portfolioMargin)
    // ─────────────────────────────────────────────────

    it('tracks already_enabled and caches success when mode is already unifiedAccount', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
        }),
      );

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - tracks the already_enabled event
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({
          abstraction_mode: 'unifiedAccount',
          status: 'already_enabled',
        }),
      );
      // Caches success
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
      // Does NOT call exchange client for unified account transition
      expect(mockClientService.getExchangeClient).not.toHaveBeenCalled();
      // Releases in-flight lock
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('does NOT migrate portfolioMargin users — tracks already_enabled and skips exchange call', async () => {
      // portfolioMargin is a superset of unifiedAccount: it already supports
      // HIP-3 auto-collateral management and is more capital-efficient.
      // Downgrading these users would be harmful.
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('portfolioMargin'),
        }),
      );

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - tracked as already_enabled with the correct mode
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({
          abstraction_mode: 'portfolioMargin',
          status: 'already_enabled',
        }),
      );
      // Caches success — no retry needed
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
      // Does NOT call exchange client — user must NOT be downgraded
      expect(mockClientService.getExchangeClient).not.toHaveBeenCalled();
      // Releases in-flight lock
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    // ─────────────────────────────────────────────────
    // Migration from default / disabled → unifiedAccount (silent agent path)
    // ─────────────────────────────────────────────────

    it('calls agentSetAbstraction silently when mode is default', async () => {
      // Arrange
      const mockExchangeClient = createMockExchangeClient();
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - uses silent agent-key path (no user prompt)
      expect(mockExchangeClient.agentSetAbstraction).toHaveBeenCalledWith({
        abstraction: 'u',
      });
      expect(mockExchangeClient.userSetAbstraction).not.toHaveBeenCalled();
    });

    it('calls agentSetAbstraction silently when mode is disabled', async () => {
      // Arrange
      const mockExchangeClient = createMockExchangeClient();
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('disabled'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert
      expect(mockExchangeClient.agentSetAbstraction).toHaveBeenCalledWith({
        abstraction: 'u',
      });
      expect(mockExchangeClient.userSetAbstraction).not.toHaveBeenCalled();
    });

    it('tracks migration_required then success for default → unifiedAccount', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient());

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - two analytics events emitted in order
      const trackCalls = (
        mockPlatformDependencies.metrics.trackPerpsEvent as jest.Mock
      ).mock.calls.filter((call) => call[0] === 'Perp Account Setup');

      // First event: migration_required with current mode
      expect(trackCalls[0]).toEqual([
        'Perp Account Setup',
        expect.objectContaining({
          abstraction_mode: 'default',
          status: 'migration_required',
        }),
      ]);
      // Second event: success with before/after modes
      expect(trackCalls[1]).toEqual([
        'Perp Account Setup',
        expect.objectContaining({
          previous_abstraction_mode: 'default',
          abstraction_mode: 'unifiedAccount',
          status: 'success',
        }),
      ]);
      // Cache reflects success
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
    });

    it('skips migration and does not cache success for unknown abstraction modes', async () => {
      // Arrange
      const mockExchangeClient = createMockExchangeClient();
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('futureMode'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - fail closed for unknown modes rather than silently forcing 'u'
      expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      expect(mockExchangeClient.userSetAbstraction).not.toHaveBeenCalled();
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).not.toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
    });

    // ─────────────────────────────────────────────────
    // Signing-backed unifiedAccount migration on init
    //
    // Some transitions require an EIP-712 prompt, so software-wallet users
    // migrate during initial setup to ensure the first trade sees unified
    // collateral. Hardware wallets remain deferred to avoid repeated signing
    // prompts while browsing.
    // ─────────────────────────────────────────────────

    it('calls userSetAbstraction on init for software-wallet dexAbstraction users', async () => {
      // Arrange
      const mockExchangeClient = createMockExchangeClient();
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act - init path
      await provider.getMarketDataWithPrices();

      // Assert - software wallets migrate during setup so first trade sees
      // unified collateral folded into the size slider.
      expect(mockExchangeClient.userSetAbstraction).toHaveBeenCalledWith({
        user: USER_ADDRESS,
        abstraction: 'unifiedAccount',
      });
      expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
    });

    it('tracks migration_required and writes cache for software-wallet dexAbstraction on init', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient());

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - analytics fire because software-wallet init performs the
      // migration attempt.
      const trackCalls = (
        mockPlatformDependencies.metrics.trackPerpsEvent as jest.Mock
      ).mock.calls.filter((call) => call[0] === 'Perp Account Setup');
      expect(trackCalls[0]).toEqual([
        'Perp Account Setup',
        expect.objectContaining({
          abstraction_mode: 'dexAbstraction',
          status: 'migration_required',
        }),
      ]);
      expect(trackCalls[1]).toEqual([
        'Perp Account Setup',
        expect.objectContaining({
          previous_abstraction_mode: 'dexAbstraction',
          abstraction_mode: 'unifiedAccount',
          status: 'success',
        }),
      ]);

      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
    });

    // ─────────────────────────────────────────────────
    // setUserAbstractionMode is called on every success path with the
    // resolved mode so the subscription service can fold spot correctly.
    // ─────────────────────────────────────────────────

    it('records unifiedAccount mode when account is already unifiedAccount', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
        }),
      );

      await provider.getMarketDataWithPrices();

      expect(
        mockSubscriptionService.setUserAbstractionMode,
      ).toHaveBeenCalledWith(USER_ADDRESS, 'unifiedAccount');
    });

    it('records portfolioMargin mode when account is already portfolioMargin', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('portfolioMargin'),
        }),
      );

      await provider.getMarketDataWithPrices();

      expect(
        mockSubscriptionService.setUserAbstractionMode,
      ).toHaveBeenCalledWith(USER_ADDRESS, 'portfolioMargin');
    });

    it('records unifiedAccount mode after migrating from default → unifiedAccount', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient());

      await provider.getMarketDataWithPrices();

      expect(
        mockSubscriptionService.setUserAbstractionMode,
      ).toHaveBeenCalledWith(USER_ADDRESS, 'unifiedAccount');
    });

    it('records unifiedAccount mode after migrating software-wallet dexAbstraction on init', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient());

      await provider.getMarketDataWithPrices();

      expect(
        mockSubscriptionService.setUserAbstractionMode,
      ).toHaveBeenCalledWith(USER_ADDRESS, 'unifiedAccount');
    });

    it.each(['dexAbstraction', 'default', 'disabled'] as const)(
      'defers %s migration on init for hardware wallets',
      async (currentMode) => {
        // Arrange
        mockWalletService.isSelectedHardwareWallet.mockReturnValue(true);
        const mockExchangeClient = createMockExchangeClient();
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            userAbstraction: jest.fn().mockResolvedValue(currentMode),
          }),
        );
        mockClientService.getExchangeClient = jest
          .fn()
          .mockReturnValue(mockExchangeClient);

        // Act - init path
        await provider.getMarketDataWithPrices();

        // Assert - no browsing-time hardware prompt; action-time setup can still run.
        expect(mockExchangeClient.userSetAbstraction).not.toHaveBeenCalled();
        expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
        expect(
          (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
            .set,
        ).not.toHaveBeenCalled();
        expect(
          mockSubscriptionService.setUserAbstractionMode,
        ).not.toHaveBeenCalled();
      },
    );

    it('does NOT call setUserAbstractionMode when migration fails', async () => {
      const mockExchangeClient = createMockExchangeClient();
      mockExchangeClient.agentSetAbstraction = jest
        .fn()
        .mockRejectedValue(new Error('network error'));
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      await provider.getMarketDataWithPrices();

      expect(
        mockSubscriptionService.setUserAbstractionMode,
      ).not.toHaveBeenCalled();
    });

    // ─────────────────────────────────────────────────
    // Failure paths
    // ─────────────────────────────────────────────────

    it('does NOT cache when silent agentSetAbstraction fails (default/disabled paths retry on next entry)', async () => {
      // Silent agent-key migration (default/disabled) shows no UI prompt, so
      // the "don't re-prompt rejected users" rationale doesn't apply. Caching
      // a transient HL/network failure here would pin the user in the
      // deprecated mode for the rest of the session — instead we leave the
      // cache empty so the next #ensureReady or action-time call retries.
      const mockError = new Error('Transient HL network blip');
      const mockExchangeClient = createMockExchangeClient();
      mockExchangeClient.agentSetAbstraction = jest
        .fn()
        .mockRejectedValue(mockError);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      await provider.getMarketDataWithPrices();

      // No cache write — next entry can retry.
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).not.toHaveBeenCalled();
      // Failure analytics still emitted for observability.
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({
          previous_abstraction_mode: 'default',
          abstraction_mode: 'unifiedAccount',
          status: 'failed',
          error_message: expect.stringContaining('Transient HL network blip'),
        }),
      );
      // Sentry logger still records for debugging.
      expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Transient HL network blip'),
        }),
        expect.objectContaining({
          context: expect.objectContaining({
            name: 'HyperLiquidProvider',
            data: expect.objectContaining({
              method: 'ensureUnifiedAccountEnabled',
            }),
          }),
        }),
      );
    });

    it('retries migration on the next #ensureReady after a silent agent failure', async () => {
      // Without resetting #ensureReadyPromise on the silent-failure path,
      // a transient agentSetAbstraction blip during the first Perps section
      // open would pin the user in the deprecated mode for the entire
      // provider lifetime — every subsequent #ensureReady would just return
      // the memoized resolved promise and skip the migration.
      const userAbstractionMock = jest.fn().mockResolvedValue('default');
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: userAbstractionMock,
        }),
      );
      const agentSetAbstractionMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('Transient HL network blip'))
        .mockResolvedValueOnce({ status: 'ok' });
      const exchangeClient = createMockExchangeClient();
      exchangeClient.agentSetAbstraction = agentSetAbstractionMock;
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);

      // First entry: migration fails silently, no cache write.
      await provider.getMarketDataWithPrices();
      expect(userAbstractionMock).toHaveBeenCalledTimes(1);
      expect(agentSetAbstractionMock).toHaveBeenCalledTimes(1);

      // Second entry: must re-run the migration because #ensureReadyPromise
      // was reset on the silent-failure exit. agentSetAbstraction succeeds
      // this time → cache attempted/enabled → no further retries.
      await provider.getMarketDataWithPrices();
      expect(userAbstractionMock).toHaveBeenCalledTimes(2);
      expect(agentSetAbstractionMock).toHaveBeenCalledTimes(2);
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
    });

    it("caches failure when user-signed userSetAbstraction throws (don't re-prompt rejected users)", async () => {
      // The dexAbstraction → unifiedAccount migration goes through
      // userSetAbstraction which surfaces an EIP-712 signing dialog. Once
      // the user has been prompted (and either rejected or signed but the
      // call failed), we should not pop the dialog again this session.
      const mockError = new Error('User rejected signing');
      const exchangeClient = createMockExchangeClient();
      exchangeClient.userSetAbstraction = jest
        .fn()
        .mockRejectedValue(mockError);
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('dexAbstraction'),
        }),
      );

      Object.defineProperty(provider, 'getAccountState', {
        value: jest.fn().mockResolvedValue({ availableBalance: '5000' }),
        writable: true,
      });

      // withdraw() is an action-time caller that passes allowUserSigning=true,
      // so the dexAbstraction path actually attempts userSetAbstraction.
      await provider.withdraw({
        amount: '100',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      });

      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: false,
      });
    });

    it('does NOT cache or log to Sentry when KEYRING_LOCKED is thrown', async () => {
      // Arrange
      const mockExchangeClient = createMockExchangeClient();
      mockExchangeClient.agentSetAbstraction = jest
        .fn()
        .mockRejectedValue(new Error('KEYRING_LOCKED'));
      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act - should resolve without throwing
      await provider.getMarketDataWithPrices();

      // Assert - cache NOT set (so it retries when keyring is unlocked)
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).not.toHaveBeenCalled();
      // Sentry NOT called
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      // In-flight lock still released
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('does NOT cache or log to Sentry when a wrapped KEYRING_LOCKED error is thrown', async () => {
      // Arrange
      const wrappedKeyringLockedError = Object.assign(
        new Error('Failed to sign typed data with viem wallet'),
        { cause: new Error('KEYRING_LOCKED') },
      );
      const mockExchangeClient = createMockExchangeClient();
      mockExchangeClient.agentSetAbstraction = jest
        .fn()
        .mockRejectedValue(wrappedKeyringLockedError);
      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).not.toHaveBeenCalled();
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('does NOT cache failure when userAbstraction read itself rejects', async () => {
      // Read-only userAbstraction lookup failures (transient HL outage /
      // network) must not block all future migration attempts for the rest
      // of the session — no signing prompt has happened yet, so the
      // "don't re-prompt the user" rationale doesn't apply.
      const lookupError = new Error('HL info endpoint timeout');
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockRejectedValue(lookupError),
        }),
      );
      const mockExchangeClient = createMockExchangeClient();
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act - should resolve without throwing
      await provider.getMarketDataWithPrices();

      // Assert - cache NOT written so the next call retries the lookup
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).not.toHaveBeenCalled();
      // No signing happened
      expect(mockExchangeClient.userSetAbstraction).not.toHaveBeenCalled();
      expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
    });

    // ─────────────────────────────────────────────────
    // Network key (mainnet vs testnet)
    // ─────────────────────────────────────────────────

    it('uses testnet network key when client is in testnet mode', async () => {
      // Arrange - testnet provider with cache already hit (so we only check the key)
      mockClientService.isTestnetMode = jest.fn().mockReturnValue(true);
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).get.mockReturnValue({
        attempted: true,
        enabled: true,
        timestamp: Date.now(),
      });

      const mockInfoClient = createMockInfoClient({
        userAbstraction: jest.fn().mockResolvedValue('default'),
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - cache keyed by 'testnet'
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .get,
      ).toHaveBeenCalledWith('testnet', USER_ADDRESS);
    });

    // ─────────────────────────────────────────────────
    // In-flight lock management
    // ─────────────────────────────────────────────────

    it('sets in-flight lock with unifiedAccount key and releases it on success', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient());

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - lock key uses 'unifiedAccount'
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .setInFlight,
      ).toHaveBeenCalledWith('unifiedAccount', 'mainnet', USER_ADDRESS);
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });
  });
});
