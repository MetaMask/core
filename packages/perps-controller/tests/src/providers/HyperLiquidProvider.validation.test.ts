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
  Position,
} from '../../../src/types/index.js';
import * as hyperLiquidAdapterModule from '../../../src/utils/hyperLiquidAdapter.js';
import { estimateCrossLiquidationPrice } from '../../../src/utils/hyperLiquidPositionPreview.js';
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
  createErrorResult: vi.fn(),
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

const actualValidation = await vi.importActual<
  typeof import('../../../src/utils/hyperLiquidValidation.js')
>('../../../src/utils/hyperLiquidValidation.js');

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
      getFreshCrossMarginContext: vi.fn().mockReturnValue(null),
      subscribeToPrices: vi.fn().mockResolvedValue(vi.fn()), // Returns Promise
      subscribeToPositions: vi.fn().mockReturnValue(vi.fn()), // Returns function directly
      subscribeToOrderFills: vi.fn().mockReturnValue(vi.fn()), // Returns function directly
      clearAll: vi.fn(),
      isPositionsCacheInitialized: vi.fn().mockReturnValue(false),
      getCachedPositions: vi.fn().mockReturnValue([]),
      getFreshPositionsForAllDexs: vi.fn().mockReturnValue(null),
      getCachedPositionsForDex: vi.fn().mockReturnValue(null),
      getCachedOpenOrdersForDex: vi.fn().mockReturnValue(null),
      getCachedActiveTwapOrders: vi.fn().mockReturnValue(null),
      getCachedActiveAssetLeverage: vi.fn().mockReturnValue(null),
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
      actualValidation.createErrorResult,
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
  describe('validateDeposit', () => {
    it('validates valid deposit parameters', async () => {
      mockValidateDepositParams.mockReturnValue({ isValid: true });

      const params: DepositParams = {
        amount: '100',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects empty amount', async () => {
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Amount is required and must be greater than 0',
      });

      const params: DepositParams = {
        amount: '',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        'Amount is required and must be greater than 0',
      );
    });

    it('rejects zero amount', async () => {
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Amount is required and must be greater than 0',
      });

      const params: DepositParams = {
        amount: '0',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        'Amount is required and must be greater than 0',
      );
    });

    it('rejects negative amount', async () => {
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Amount is required and must be greater than 0',
      });

      const params: DepositParams = {
        amount: '-10',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        'Amount is required and must be greater than 0',
      );
    });

    it('rejects invalid amount format', async () => {
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Amount is required and must be greater than 0',
      });

      const params: DepositParams = {
        amount: 'abc',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(
        'Amount is required and must be greater than 0',
      );
    });

    it('rejects amount below minimum for mainnet', async () => {
      mockClientService.isTestnetMode.mockReturnValue(false);
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Minimum deposit amount is 5 USDC',
      });

      const params: DepositParams = {
        amount: '4.99',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Minimum deposit amount is 5 USDC');
    });

    it('rejects amount below minimum for testnet', async () => {
      mockClientService.isTestnetMode.mockReturnValue(true);
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Minimum deposit amount is 10 USDC',
      });

      const params: DepositParams = {
        amount: '9.99',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Minimum deposit amount is 10 USDC');
    });

    it('accepts amount at minimum for mainnet', async () => {
      mockClientService.isTestnetMode.mockReturnValue(false);
      mockValidateDepositParams.mockReturnValue({ isValid: true });

      const params: DepositParams = {
        amount: '5',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts amount at minimum for testnet', async () => {
      mockClientService.isTestnetMode.mockReturnValue(true);
      mockValidateDepositParams.mockReturnValue({ isValid: true });

      const params: DepositParams = {
        amount: '10',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects empty assetId', async () => {
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'AssetId is required for deposit validation',
      });

      const params: DepositParams = {
        amount: '100',
        assetId: '' as CaipAssetId,
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('AssetId is required for deposit validation');
    });

    it('rejects unsupported assetId', async () => {
      mockValidateDepositParams.mockReturnValue({
        isValid: false,
        error: 'Asset not supported',
      });

      const params: DepositParams = {
        amount: '100',
        assetId:
          'eip155:1/erc20:0x1234567890123456789012345678901234567890/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not supported');
    });

    it('handles decimal amounts correctly', async () => {
      mockValidateDepositParams.mockReturnValue({ isValid: true });

      const params: DepositParams = {
        amount: '100.123456',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('handles large amounts correctly', async () => {
      mockValidateDepositParams.mockReturnValue({ isValid: true });

      const params: DepositParams = {
        amount: '1000000',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('handles scientific notation', async () => {
      mockValidateDepositParams.mockReturnValue({ isValid: true });

      const params: DepositParams = {
        amount: '1e6',
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default',
      };

      const result = await provider.validateDeposit(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('validateClosePosition', () => {
    it('validates full close position successfully', async () => {
      const params: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('validates partial close position successfully', async () => {
      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '0.5',
        orderType: 'market',
        currentPrice: 45000,
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects close position below minimum value on mainnet', async () => {
      mockClientService.isTestnetMode.mockReturnValue(false);

      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '0.0001', // $4.50 at $45,000 BTC, below $10 minimum
        orderType: 'market',
        currentPrice: 45000,
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SIZE_MIN);
    });

    it('rejects close position below minimum value on testnet', async () => {
      mockClientService.isTestnetMode.mockReturnValue(true);

      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '0.00022', // $9.90 at $45,000 BTC, below $11 testnet minimum
        orderType: 'market',
        currentPrice: 45000,
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SIZE_MIN);
    });

    it('accepts close position at minimum value', async () => {
      mockClientService.isTestnetMode.mockReturnValue(false);

      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '0.00023', // $10.35 at $45,000 BTC, above $10 minimum
        orderType: 'market',
        currentPrice: 45000,
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('validates limit close position with price', async () => {
      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '1.0',
        orderType: 'limit',
        price: '44000',
        currentPrice: 45000,
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects limit close without price', async () => {
      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '1.0',
        orderType: 'limit',
        currentPrice: 45000,
      };

      const result = await provider.validateClosePosition(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_LIMIT_PRICE_REQUIRED);
    });

    it('handles validation when currentPrice is not provided', async () => {
      const params: ClosePositionParams = {
        symbol: 'BTC',
        size: '0.5',
        orderType: 'market',
        // currentPrice not provided
      };

      const result = await provider.validateClosePosition(params);

      // Should still validate basic params but skip minimum order value check
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('calculateLiquidationPrice', () => {
    const crossBtcPosition: Position = {
      symbol: 'BTC',
      size: '0.1',
      entryPrice: '50000',
      positionValue: '5000',
      unrealizedPnl: '0',
      marginUsed: '500',
      leverage: { type: 'cross', value: 10 },
      liquidationPrice: '46000',
      maxLeverage: 20,
      returnOnEquity: '0',
      cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
      takeProfitCount: 0,
      stopLossCount: 0,
    };

    beforeEach(() => {
      // Set up mock for asset info with maxLeverage: 20 for BTC (test expectations)
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [
              {
                name: 'BTC',
                szDecimals: 3,
                maxLeverage: 20,
                marginTableId: 20,
              },
              { name: 'ETH', szDecimals: 4, maxLeverage: 20 },
            ],
          }),
        }),
      );
    });

    it('calculates liquidation price for long position correctly', async () => {
      const params = {
        entryPrice: 50000,
        leverage: 10,
        direction: 'long' as const,
        asset: 'BTC',
      };

      const result = await provider.calculateLiquidationPrice(params);

      // With 10x leverage and 20x max leverage:
      // maintenance margin = 1 / (2 * 20) = 0.025
      // initial margin = 1 / 10 = 0.1
      // margin available = 0.1 - 0.025 = 0.075
      // l = 1 / 40 = 0.025
      // liquidation = 50000 - (1 * 0.075 * 50000) / (1 - 0.025 * 1)
      // liquidation = 50000 - 3750 / 0.975 = 50000 - 3846.15 = 46153.85
      expect(parseFloat(result)).toBeCloseTo(46153.85, 2);
    });

    it('calculates liquidation price for short position correctly', async () => {
      const params = {
        entryPrice: 50000,
        leverage: 10,
        direction: 'short' as const,
        asset: 'BTC',
      };

      const result = await provider.calculateLiquidationPrice(params);

      // With 10x leverage and 20x max leverage:
      // maintenance margin = 1 / (2 * 20) = 0.025
      // initial margin = 1 / 10 = 0.1
      // margin available = 0.1 - 0.025 = 0.075
      // l = 1 / 40 = 0.025
      // liquidation = 50000 - (-1 * 0.075 * 50000) / (1 - 0.025 * -1)
      // liquidation = 50000 + 3750 / 1.025 = 50000 + 3658.54 = 53658.54
      expect(parseFloat(result)).toBeCloseTo(53658.54, 2);
    });

    it('estimates a cross opening from scoped account equity and free spot', async () => {
      const accountId = 'eip155:1:0x1234567890123456789012345678901234567890';
      vi.spyOn(provider, 'getCurrentAccountId').mockResolvedValue(accountId);
      const info = mockClientService.getInfoClient();
      const user = '0x1234567890123456789012345678901234567890';
      const state = await info.clearinghouseState({ user });
      vi.mocked(info.clearinghouseState)
        .mockClear()
        .mockResolvedValue({
          ...state,
          assetPositions: [],
          crossMaintenanceMarginUsed: '50',
          crossMarginSummary: {
            ...state.crossMarginSummary,
            accountValue: '400',
            totalMarginUsed: '100',
            totalNtlPos: '2000',
          },
        });
      vi.mocked(info.spotClearinghouseState).mockResolvedValue({
        balances: [
          { coin: 'USDC', token: 0, total: '100', hold: '0', entryNtl: '0' },
        ],
        tokenToAvailableAfterMaintenance: [[0, '100']],
      });
      const positions = vi
        .spyOn(provider, 'getPositions')
        .mockResolvedValue([]);

      const price = await provider.calculateLiquidationPrice({
        entryPrice: 50000,
        leverage: 10,
        direction: 'long',
        asset: 'BTC',
        marginType: 'cross',
        positionSize: 0.1,
      });

      // With the new position, maintenance is 50 + (50000 * 0.1 / 40).
      expect(Number(price)).toBeCloseTo(46666.66667, 4);
      expect(info.clearinghouseState).toHaveBeenCalledExactlyOnceWith({ user });
      expect(info.spotClearinghouseState).toHaveBeenCalledExactlyOnceWith({
        user,
      });
      expect(positions).toHaveBeenCalledWith({
        accountId,
        skipCache: true,
        throwOnUnavailable: true,
        includeProtection: false,
      });
      positions.mockRestore();
      vi.mocked(provider.getCurrentAccountId).mockRestore();
    });

    it.each([
      // Maintenance becomes 50 + 5000 / 40.
      ['a flat market', false, 50, 46666.66667],
      // The 0.1 BTC long holds 125 of 150 maintenance; at 0.2 BTC it holds
      // 250: 50000 - (500 - 275) / 0.2 / 0.975.
      ['an existing long', true, 150, 48846.15385],
    ])(
      'uses the live Cross context without account reads for %s',
      async (_name, hasPosition, maintenanceMargin, expected) => {
        const accountId = 'eip155:1:0x1234567890123456789012345678901234567890';
        vi.spyOn(provider, 'getCurrentAccountId').mockResolvedValue(accountId);
        const positions = vi.spyOn(provider, 'getPositions');
        const info = mockClientService.getInfoClient();
        mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
          summary: {
            accountValue: '400',
            maintenanceMargin: String(maintenanceMargin),
            marginUsed: '100',
            notional: '2000',
          },
          spotCollateral: '100',
          hasPosition,
        });
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          {
            ...crossBtcPosition,
            symbol: hasPosition ? 'BTC' : 'ETH',
          },
        ]);

        const price = await provider.calculateLiquidationPrice({
          asset: 'BTC',
          entryPrice: 50000,
          leverage: 10,
          direction: 'long',
          marginType: 'cross',
          positionSize: 0.1,
        });

        expect(Number(price)).toBeCloseTo(expected, 4);
        expect(positions).not.toHaveBeenCalled();
        expect(info.userAbstraction).not.toHaveBeenCalled();
        expect(info.clearinghouseState).not.toHaveBeenCalled();
        expect(info.spotClearinghouseState).not.toHaveBeenCalled();
      },
    );

    it('rejects a live Cross context whose position is missing from the cache', async () => {
      mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
        summary: {
          accountValue: '400',
          maintenanceMargin: '150',
          marginUsed: '100',
          notional: '2000',
        },
        spotCollateral: '100',
        hasPosition: true,
      });

      await expect(
        provider.calculateLiquidationPrice({
          asset: 'BTC',
          entryPrice: 50000,
          leverage: 10,
          direction: 'long',
          marginType: 'cross',
          positionSize: 0.1,
        }),
      ).rejects.toMatchObject({ errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE' });
    });

    it('returns 0 for a Cross long the account can never liquidate', async () => {
      mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
        summary: {
          accountValue: '100000',
          maintenanceMargin: '50',
          marginUsed: '100',
          notional: '2000',
        },
        spotCollateral: '0',
        hasPosition: false,
      });
      mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([]);

      expect(
        await provider.calculateLiquidationPrice({
          asset: 'BTC',
          entryPrice: 50000,
          leverage: 10,
          direction: 'long',
          marginType: 'cross',
          positionSize: 0.1,
        }),
      ).toBe('0');
    });

    it('rejects a Cross order that closes the position', async () => {
      mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
        summary: {
          accountValue: '400',
          maintenanceMargin: '150',
          marginUsed: '100',
          notional: '2000',
        },
        spotCollateral: '100',
        hasPosition: true,
      });
      mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
        crossBtcPosition,
      ]);

      await expect(
        provider.calculateLiquidationPrice({
          asset: 'BTC',
          entryPrice: 50000,
          leverage: 10,
          direction: 'short',
          marginType: 'cross',
          positionSize: 0.1,
        }),
      ).rejects.toMatchObject({ errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE' });
    });

    it('quotes Standard mode using only the main DEX cross pool', async () => {
      const info = mockClientService.getInfoClient();
      vi.mocked(info.userAbstraction).mockResolvedValue('disabled');
      const state = await info.clearinghouseState({
        user: '0x1234567890123456789012345678901234567890',
      });
      vi.mocked(info.clearinghouseState).mockResolvedValue({
        ...state,
        assetPositions: [],
        crossMaintenanceMarginUsed: '50',
        crossMarginSummary: {
          ...state.crossMarginSummary,
          accountValue: '400',
          totalNtlPos: '0',
        },
      });
      const aggregate = vi
        .spyOn(provider, 'getAccountState')
        .mockResolvedValue({
          totalBalance: '1000',
          spendableBalance: '1000',
          withdrawableBalance: '1000',
          marginUsed: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
          spotCollateral: '0',
          crossMarginSummary: {
            accountValue: '1000',
            maintenanceMargin: '50',
            marginUsed: '0',
            notional: '0',
          },
        });

      const price = await provider.calculateLiquidationPrice({
        asset: 'BTC',
        entryPrice: 50000,
        leverage: 10,
        direction: 'long',
        marginType: 'cross',
        positionSize: 0.1,
      });

      expect(Number(price)).toBeCloseTo(47692.30769, 4);
      expect(aggregate).not.toHaveBeenCalled();
      aggregate.mockRestore();
    });

    it('prices a Standard add from the main DEX position over REST', async () => {
      const info = mockClientService.getInfoClient();
      vi.mocked(info.userAbstraction).mockResolvedValue('disabled');
      const state = await info.clearinghouseState({
        user: '0x1234567890123456789012345678901234567890',
      });
      vi.mocked(info.clearinghouseState).mockResolvedValue({
        ...state,
        assetPositions: [state.assetPositions[0]],
        crossMaintenanceMarginUsed: '150',
        crossMarginSummary: {
          ...state.crossMarginSummary,
          accountValue: '500',
          totalNtlPos: '5000',
        },
      });

      const price = await provider.calculateLiquidationPrice({
        asset: 'BTC',
        entryPrice: 50000,
        leverage: 10,
        direction: 'long',
        marginType: 'cross',
        positionSize: 0.1,
      });

      // The 0.1 BTC long holds 125 of 150 maintenance; at 0.2 BTC, 250.
      expect(Number(price)).toBeCloseTo(50000 - 225 / 0.2 / 0.975, 4);
    });

    it.each([
      ['disabled', 'unifiedAccount'],
      ['unifiedAccount', 'disabled'],
    ] as const)(
      'rejects cross liquidation when the mode changes from %s to %s during the read',
      async (initialMode, settledMode) => {
        const info = mockClientService.getInfoClient();
        const state = await info.clearinghouseState({
          user: '0x1234567890123456789012345678901234567890',
        });
        vi.mocked(info.clearinghouseState).mockResolvedValue({
          ...state,
          assetPositions: [],
          crossMaintenanceMarginUsed: '50',
          crossMarginSummary: {
            ...state.crossMarginSummary,
            accountValue: '400',
            totalNtlPos: '0',
          },
        });
        vi.mocked(info.userAbstraction)
          .mockResolvedValueOnce(initialMode)
          .mockResolvedValue(settledMode);

        await expect(
          provider.calculateLiquidationPrice({
            asset: 'BTC',
            entryPrice: 50000,
            leverage: 10,
            direction: 'short',
            marginType: 'cross',
            positionSize: 0.1,
          }),
        ).rejects.toMatchObject({ errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE' });
      },
    );

    const setUpStandardHip3 = ({ useUnifiedAccount = false } = {}) => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount,
      });
      const user = '0x1234567890123456789012345678901234567890';
      const xyzMeta = {
        universe: [
          {
            name: 'xyz:TSLA',
            szDecimals: 3,
            maxLeverage: 20,
            marginTableId: 20,
          },
        ],
        marginTables: [],
        collateralToken: 0,
      };
      const info = createMockInfoClient({
        perpDexs: vi
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
        meta: vi.fn().mockImplementation((params?: { dex?: string }) =>
          Promise.resolve(
            params?.dex === 'xyz'
              ? xyzMeta
              : {
                  universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
                },
          ),
        ),
        userAbstraction: vi.fn().mockResolvedValue('disabled'),
        clearinghouseState: vi.fn().mockResolvedValue({
          marginSummary: { accountValue: '2', totalMarginUsed: '0' },
          crossMarginSummary: {
            accountValue: '2',
            totalMarginUsed: '0',
            totalNtlPos: '0',
          },
          crossMaintenanceMarginUsed: '0',
          withdrawable: '2',
          assetPositions: [],
        }),
      });
      mockClientService.getInfoClient = vi.fn().mockReturnValue(info);
      mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([]);
      return { hip3Provider, info, user };
    };

    it('prices a Standard HIP-3 opening against the DEX placement funds', async () => {
      const { hip3Provider, info, user } = setUpStandardHip3();

      const price = await hip3Provider.calculateLiquidationPrice({
        asset: 'xyz:TSLA',
        entryPrice: 500,
        leverage: 10,
        direction: 'long',
        marginType: 'cross',
        positionSize: 0.1,
      });

      // Placement needs 5 * 1.003 against 2 withdrawable and moves the
      // shortfall in. The 0.015 left after the order is under the rebalance
      // threshold and stays: account value 5.015, maintenance 50 * 0.025.
      expect(Number(price)).toBeCloseTo(500 - (5.015 - 1.25) / 0.1 / 0.975, 6);
      expect(info.clearinghouseState).toHaveBeenCalledWith({
        user,
        dex: 'xyz',
      });
      expect(
        await hip3Provider.estimateCrossLiquidation({
          symbol: 'xyz:TSLA',
          direction: 'long',
          size: '0.1',
          entryPrice: '500',
          leverage: 10,
        }),
      ).toStrictEqual({ status: 'price', price });
    });

    it('prices a HIP-3 opening against the DEX funds when placement skips the transfer', async () => {
      // With useUnifiedAccount on (the default), placement moves no funds to
      // the DEX, so the estimate keeps the DEX account value of 2.
      const { hip3Provider } = setUpStandardHip3({ useUnifiedAccount: true });

      const price = await hip3Provider.calculateLiquidationPrice({
        asset: 'xyz:TSLA',
        entryPrice: 500,
        leverage: 10,
        direction: 'long',
        marginType: 'cross',
        positionSize: 0.1,
      });

      expect(Number(price)).toBeCloseTo(500 - (2 - 1.25) / 0.1 / 0.975, 6);
      expect(
        await hip3Provider.estimateCrossLiquidation({
          symbol: 'xyz:TSLA',
          direction: 'long',
          size: '0.1',
          entryPrice: '500',
          leverage: 10,
        }),
      ).toStrictEqual({ status: 'price', price });
    });

    it('is unavailable when the account changes while placement margin is read', async () => {
      const { hip3Provider } = setUpStandardHip3();
      const accountId = vi
        .spyOn(hip3Provider, 'getCurrentAccountId')
        .mockResolvedValue(
          'eip155:1:0x1234567890123456789012345678901234567890',
        );
      // The required-margin read is the last await before the result.
      mockSubscriptionService.getCachedPositionsForDex.mockImplementation(
        () => {
          accountId.mockResolvedValue(
            'eip155:1:0x00000000000000000000000000000000000000aa',
          );
          return [];
        },
      );

      expect(
        await hip3Provider.estimateCrossLiquidation({
          symbol: 'xyz:TSLA',
          direction: 'long',
          size: '0.1',
          entryPrice: '500',
          leverage: 10,
        }),
      ).toStrictEqual({ status: 'unavailable', reason: 'account_unknown' });
    });

    it('refuses a cross estimate for a disabled HIP-3 market', async () => {
      const info = mockClientService.getInfoClient();
      vi.mocked(info.meta).mockResolvedValue({
        marginTables: [],
        collateralToken: 0,
        universe: [
          {
            name: 'xyz:TSLA',
            szDecimals: 3,
            maxLeverage: 20,
            marginTableId: 20,
          },
        ],
      });
      const account = vi.spyOn(provider, 'getAccountState').mockResolvedValue({
        totalBalance: '500',
        spendableBalance: '400',
        withdrawableBalance: '400',
        marginUsed: '100',
        unrealizedPnl: '0',
        returnOnEquity: '0',
        spotCollateral: '100',
        crossMarginSummary: {
          accountValue: '400',
          maintenanceMargin: '50',
          marginUsed: '100',
          notional: '2000',
        },
      });
      const positions = vi
        .spyOn(provider, 'getPositions')
        .mockResolvedValue([]);

      await expect(
        provider.calculateLiquidationPrice({
          asset: 'xyz:TSLA',
          entryPrice: 50000,
          leverage: 10,
          direction: 'long',
          marginType: 'cross',
          positionSize: 0.1,
        }),
      ).rejects.toMatchObject({ errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE' });
      account.mockRestore();
      positions.mockRestore();
    });

    it('rejects a cross opening without a sized order', async () => {
      await expect(
        provider.calculateLiquidationPrice({
          entryPrice: 50000,
          leverage: 10,
          direction: 'long',
          asset: 'BTC',
          marginType: 'cross',
        }),
      ).rejects.toMatchObject({ errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE' });
    });

    it('throws error for leverage exceeding maintenance leverage', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [
              { name: 'BTC', szDecimals: 3, maxLeverage: 20 },
              { name: 'ETH', szDecimals: 4, maxLeverage: 20 },
            ],
          }),
        }),
      );

      const params = {
        entryPrice: 50000,
        leverage: 41, // Exceeds maintenance leverage (2 * 20 = 40)
        direction: 'long' as const,
        asset: 'BTC',
      };

      await expect(provider.calculateLiquidationPrice(params)).rejects.toThrow(
        'Invalid leverage: 41x exceeds maximum allowed leverage of 40x',
      );
    });

    it('handles invalid inputs', async () => {
      const invalidCases = [
        { entryPrice: 0, leverage: 10, direction: 'long' as const },
        { entryPrice: 50000, leverage: 0, direction: 'long' as const },
        { entryPrice: NaN, leverage: 10, direction: 'long' as const },
        { entryPrice: 50000, leverage: Infinity, direction: 'long' as const },
        { entryPrice: -100, leverage: 10, direction: 'long' as const },
      ];

      for (const params of invalidCases) {
        await expect(
          provider.calculateLiquidationPrice(params),
        ).rejects.toMatchObject({
          errorCode: 'LIQUIDATION_PRICE_UNAVAILABLE',
        });
      }
    });

    it('uses default max leverage when asset is not provided', async () => {
      const params = {
        entryPrice: 50000,
        leverage: 4,
        direction: 'long' as const,
        // No asset provided, so default 3x will be used
      };

      const result = await provider.calculateLiquidationPrice(params);

      // Should use default 3x max leverage (since no asset provided)
      // maintenance leverage = 2 * 3 = 6x
      // l = 1 / 6 = 0.1667
      // initial margin = 1 / 4 = 0.25
      // maintenance margin = 1 / 6 = 0.1667
      // margin available = 0.25 - 0.1667 = 0.0833
      // liq price = 50000 - 1 * 0.0833 * 50000 / (1 - 0.1667 * 1)
      // liq price = 50000 - 4165 / 0.8333 = 50000 - 4998 = 45002
      expect(parseFloat(result)).toBeCloseTo(45002, -1);
    });

    it('throws error when leverage exceeds default max leverage', async () => {
      const params = {
        entryPrice: 50000,
        leverage: 10,
        direction: 'long' as const,
        // No asset provided, so default 3x will be used
      };

      await expect(provider.calculateLiquidationPrice(params)).rejects.toThrow(
        'Invalid leverage: 10x exceeds maximum allowed leverage of 6x',
      );
    });
  });

  describe('estimateCrossLiquidation', () => {
    const order = {
      symbol: 'BTC',
      direction: 'long' as const,
      size: '0.1',
      entryPrice: '50000',
      leverage: 10,
    };
    const liveContext = (
      overrides: Partial<{
        accountValue: string;
        maintenanceMargin: string;
        spotCollateral: string;
      }> = {},
    ) => {
      mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
        summary: {
          accountValue: overrides.accountValue ?? '400',
          maintenanceMargin: overrides.maintenanceMargin ?? '50',
          marginUsed: '100',
          notional: '2000',
        },
        spotCollateral: overrides.spotCollateral ?? '100',
        hasPosition: false,
      });
      mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([]);
    };

    beforeEach(() => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [
              {
                name: 'BTC',
                szDecimals: 3,
                maxLeverage: 20,
                marginTableId: 20,
              },
              {
                name: 'ETH',
                szDecimals: 4,
                maxLeverage: 20,
                marginTableId: 60,
              },
            ],
            marginTables: [],
          }),
        }),
      );
    });

    it('reports a Unified opening covered by spot collateral', async () => {
      liveContext({ spotCollateral: '100000' });

      expect(await provider.estimateCrossLiquidation(order)).toStrictEqual({
        status: 'none',
        reason: 'covered_by_account',
      });
    });

    it('prices an opening past the account value with estimateCrossLiquidationPrice', async () => {
      liveContext();

      expect(await provider.estimateCrossLiquidation(order)).toStrictEqual({
        status: 'price',
        price: String(
          estimateCrossLiquidationPrice({
            isLong: true,
            markPrice: 50000,
            positionSize: 0.1,
            accountValue: 500,
            maintenanceMargin: 50 + 125,
            marginTiers: [{ lowerBound: 0, maxLeverage: 20 }],
          }),
        ),
      });
    });

    it.each([
      ['a zero size', { size: '0' }],
      ['an unparsable entry price', { entryPrice: 'abc' }],
      ['no leverage', { leverage: 0 }],
      ['margin tiers missing from meta', { symbol: 'ETH' }],
      ['a market missing from meta', { symbol: 'DOGE' }],
      ['a negative fee', { feeAmountUsd: -1 }],
      ['a non-finite fee', { feeAmountUsd: Number.NaN }],
    ])(
      'is unavailable for missing inputs with %s',
      async (_name, overrides) => {
        liveContext();

        expect(
          await provider.estimateCrossLiquidation({ ...order, ...overrides }),
        ).toStrictEqual({ status: 'unavailable', reason: 'missing_inputs' });
      },
    );

    it('prices a genuine zero fee as no fee', async () => {
      liveContext();

      expect(
        await provider.estimateCrossLiquidation({ ...order, feeAmountUsd: 0 }),
      ).toStrictEqual(await provider.estimateCrossLiquidation(order));
    });

    it('is unavailable for missing inputs without a Cross maintenance figure', async () => {
      liveContext({ maintenanceMargin: '' });

      expect(await provider.estimateCrossLiquidation(order)).toStrictEqual({
        status: 'unavailable',
        reason: 'missing_inputs',
      });
    });

    describe('over an isolated position in the market', () => {
      const isolatedBtc: Position = {
        symbol: 'BTC',
        size: '0.1',
        entryPrice: '50000',
        positionValue: '5000',
        unrealizedPnl: '0',
        marginUsed: '500',
        leverage: { type: 'isolated', value: 10 },
        liquidationPrice: '46000',
        maxLeverage: 20,
        returnOnEquity: '0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      };
      const missingInputs = { status: 'unavailable', reason: 'missing_inputs' };

      it('is unavailable for missing inputs from the stream', async () => {
        liveContext();
        mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
          summary: {
            accountValue: '400',
            maintenanceMargin: '50',
            marginUsed: '100',
            notional: '2000',
          },
          spotCollateral: '100',
          hasPosition: true,
        });
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          isolatedBtc,
        ]);

        expect(await provider.estimateCrossLiquidation(order)).toStrictEqual(
          missingInputs,
        );
      });

      const venueLeverage = {
        cross: { type: 'cross', value: 10 },
        isolated: { type: 'isolated', value: 10, rawUsd: '-4500' },
      } as const;
      const mockRestState = async (
        mode: 'unifiedAccount' | 'disabled',
        leverageType: 'cross' | 'isolated',
      ) => {
        const info = mockClientService.getInfoClient();
        vi.mocked(info.userAbstraction).mockResolvedValue(mode);
        const state = await info.clearinghouseState({
          user: '0x1234567890123456789012345678901234567890',
        });
        const [assetPosition] = state.assetPositions;
        vi.mocked(info.clearinghouseState).mockResolvedValue({
          ...state,
          crossMaintenanceMarginUsed: '125',
          crossMarginSummary: {
            ...state.crossMarginSummary,
            totalNtlPos: '5000',
          },
          assetPositions: [
            {
              ...assetPosition,
              position: {
                ...assetPosition.position,
                leverage: venueLeverage[leverageType],
              },
            },
          ],
        });
        vi.spyOn(provider, 'getPositions').mockResolvedValue([
          { ...isolatedBtc, leverage: { type: leverageType, value: 10 } },
        ]);
      };

      it.each(['unifiedAccount', 'disabled'] as const)(
        'is unavailable for missing inputs from a %s REST read',
        async (mode) => {
          await mockRestState(mode, 'cross');
          expect(
            (await provider.estimateCrossLiquidation(order)).status,
          ).not.toBe('unavailable');

          await mockRestState(mode, 'isolated');
          expect(await provider.estimateCrossLiquidation(order)).toStrictEqual(
            missingInputs,
          );
        },
      );
    });

    it('is unavailable for an account mode without a Cross estimate', async () => {
      vi.mocked(
        mockClientService.getInfoClient().userAbstraction,
      ).mockResolvedValue('portfolioMargin');

      expect(await provider.estimateCrossLiquidation(order)).toStrictEqual({
        status: 'unavailable',
        reason: 'provider',
      });
    });

    it('is unavailable with an unknown account instead of rejecting', async () => {
      vi.spyOn(provider, 'getCurrentAccountId').mockRejectedValue(
        new Error('locked'),
      );

      expect(await provider.estimateCrossLiquidation(order)).toStrictEqual({
        status: 'unavailable',
        reason: 'account_unknown',
      });
    });
  });

  describe('calculateMaintenanceMargin', () => {
    it('calculates maintenance margin correctly for 40x max leverage asset', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'BTC', maxLeverage: 40, szDecimals: 5 }],
          }),
        }),
      );

      const result = await provider.calculateMaintenanceMargin({
        asset: 'BTC',
      });

      // Maintenance margin = 1 / (2 * 40) = 0.0125 (1.25%)
      expect(result).toBe(0.0125);
    });

    it('calculates maintenance margin correctly for 3x max leverage asset', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue({
        meta: vi.fn().mockResolvedValue({
          universe: [{ name: 'DOGE', maxLeverage: 3, szDecimals: 0 }],
        }),
      });

      const result = await provider.calculateMaintenanceMargin({
        asset: 'DOGE',
      });

      // Maintenance margin = 1 / (2 * 3) = 0.1667 (16.67%)
      expect(result).toBeCloseTo(0.1667, 4);
    });

    it('returns default maintenance margin when asset not found', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue({
        meta: vi.fn().mockResolvedValue({
          universe: [],
        }),
      });

      const result = await provider.calculateMaintenanceMargin({
        asset: 'UNKNOWN',
      });

      // Should use default max leverage of 3, so maintenance margin = 1/(2*3) = 0.16666...
      expect(result).toBeCloseTo(0.16666666666666666);
    });
  });

  describe('previewPositionModify', () => {
    const isolatedPosition = {
      symbol: 'ETH',
      size: '1',
      entryPrice: '2000',
      positionValue: '2000',
      marginUsed: '400',
      leverage: { type: 'isolated' as const, value: 5 },
      liquidationPrice: '1640',
      maxLeverage: 25,
    };

    describe('cross margin', () => {
      const crossPosition = {
        ...isolatedPosition,
        leverage: { type: 'cross' as const, value: 5 },
        marginUsed: '400',
        liquidationPrice: null,
      };
      const ethPosition: Position = {
        ...crossPosition,
        unrealizedPnl: '0',
        returnOnEquity: '0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      };

      beforeEach(() => {
        mockClientService.getInfoClient = vi.fn().mockReturnValue(
          createMockInfoClient({
            meta: vi.fn().mockResolvedValue({
              universe: [
                {
                  name: 'ETH',
                  szDecimals: 4,
                  maxLeverage: 25,
                  marginTableId: 25,
                },
              ],
              marginTables: [],
            }),
            userAbstraction: vi.fn().mockResolvedValue('portfolioMargin'),
          }),
        );
        vi.spyOn(provider, 'getCurrentAccountId').mockResolvedValue(
          'eip155:1:0x1234567890123456789012345678901234567890',
        );
      });

      it('projects an add against the live Cross account', async () => {
        mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
          summary: {
            accountValue: '900',
            maintenanceMargin: '100',
            marginUsed: '400',
            notional: '2000',
          },
          spotCollateral: '100',
          hasPosition: true,
        });
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          ethPosition,
        ]);

        const result = await provider.previewPositionModify({
          position: crossPosition,
          direction: 'long',
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 1,
        });

        // 2 ETH at 10x; ETH maintenance 2000 / 50 becomes 4000 / 50, so the
        // account holds 100 - 40 + 80 against 1000 - 1.
        expect(result).toStrictEqual({
          status: 'open',
          kind: 'increase',
          current: {
            margin: { available: true, value: 400 },
            liquidationPrice: { available: false },
          },
          resulting: {
            direction: 'long',
            size: 2,
            entryPrice: 2000,
            leverage: 10,
            margin: { available: true, value: 400 },
            liquidationPrice: {
              available: true,
              value: expect.closeTo(2000 - (999 - 140) / 2 / 0.98, 6),
            },
          },
        });
      });

      it('keeps the margin when the Cross account read fails', async () => {
        vi.mocked(provider.getCurrentAccountId).mockRejectedValue(
          new Error('locked'),
        );

        const result = await provider.previewPositionModify({
          position: crossPosition,
          direction: 'long',
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 1,
        });

        expect(result.status === 'open' && result.resulting).toMatchObject({
          margin: { available: true, value: 400 },
          liquidationPrice: { available: false },
        });
      });

      it('keeps the margin without a Cross account', async () => {
        const result = await provider.previewPositionModify({
          position: crossPosition,
          direction: 'long',
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 1,
        });

        expect(result.status === 'open' && result.resulting).toMatchObject({
          margin: { available: true, value: 400 },
          liquidationPrice: { available: false },
        });
      });

      it('withholds liquidation when the account holds no such position', async () => {
        mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
          summary: {
            accountValue: '900',
            maintenanceMargin: '100',
            marginUsed: '400',
            notional: '2000',
          },
          spotCollateral: '100',
          hasPosition: false,
        });
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([]);

        const result = await provider.previewPositionModify({
          position: crossPosition,
          direction: 'long',
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 1,
        });

        expect(
          result.status === 'open' && result.resulting.liquidationPrice,
        ).toStrictEqual({ available: false, reason: 'missing_inputs' });
      });

      it('projects from the position the account holds', async () => {
        mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
          summary: {
            accountValue: '900',
            maintenanceMargin: '160',
            marginUsed: '800',
            notional: '4000',
          },
          spotCollateral: '100',
          hasPosition: true,
        });
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          {
            ...ethPosition,
            size: '2',
            positionValue: '4000',
            marginUsed: '800',
          },
        ]);

        const result = await provider.previewPositionModify({
          position: crossPosition,
          direction: 'long',
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 0,
        });

        // The account holds 2 ETH, not the client's 1: 3 ETH at 10x.
        expect(result).toMatchObject({
          status: 'open',
          current: { margin: { available: true, value: 800 } },
          resulting: { size: 3, margin: { available: true, value: 600 } },
        });
      });

      it('withholds liquidation when the account holds the market isolated', async () => {
        mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
          summary: {
            accountValue: '900',
            maintenanceMargin: '0',
            marginUsed: '0',
            notional: '0',
          },
          spotCollateral: '100',
          hasPosition: true,
        });
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          { ...ethPosition, leverage: { type: 'isolated', value: 5 } },
        ]);

        const result = await provider.previewPositionModify({
          position: crossPosition,
          direction: 'long',
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 0,
        });

        expect(result).toMatchObject({
          status: 'open',
          resulting: {
            liquidationPrice: { available: false, reason: 'missing_inputs' },
          },
        });
      });

      describe('against a Unified account holding the position', () => {
        const liveContext = (accountValue: string, spotCollateral: string) => {
          mockSubscriptionService.getFreshCrossMarginContext.mockReturnValue({
            summary: {
              accountValue,
              maintenanceMargin: '40',
              marginUsed: '400',
              notional: '2000',
            },
            spotCollateral,
            hasPosition: true,
          });
          mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
            ethPosition,
          ]);
        };
        const add = {
          position: crossPosition,
          direction: 'long' as const,
          size: '1',
          price: '2000',
          leverage: 10,
          feeAmountUsd: 0,
        };

        it('reports an add covered by spot collateral', async () => {
          liveContext('400', '100000');

          const result = await provider.previewPositionModify(add);

          expect(
            result.status === 'open' && result.resulting.liquidationPrice,
          ).toStrictEqual({ available: false, reason: 'covered_by_account' });
        });

        it('prices an add past the account value as estimateCrossLiquidation does', async () => {
          liveContext('300', '0');

          const result = await provider.previewPositionModify(add);
          const estimate = await provider.estimateCrossLiquidation({
            symbol: 'ETH',
            direction: 'long',
            size: '1',
            entryPrice: '2000',
            leverage: 10,
          });

          // 2 ETH at 2000 holds 80 of maintenance against 300.
          expect(estimate).toStrictEqual({
            status: 'price',
            price: String(2000 - (300 - 80) / 2 / 0.98),
          });
          expect(
            result.status === 'open' && result.resulting.liquidationPrice,
          ).toStrictEqual({
            available: true,
            value: Number(estimate.status === 'price' && estimate.price),
          });
        });

        it('reports a reduce to zero as a full close', async () => {
          liveContext('300', '0');

          expect(
            await provider.previewPositionModify({
              ...add,
              direction: 'short',
              reduceOnly: true,
            }),
          ).toStrictEqual({
            status: 'full_close',
            current: {
              margin: { available: true, value: 400 },
              liquidationPrice: { available: false },
            },
            resultingDirection: 'long',
          });
        });
      });
    });

    it('uses cached meta margin tables for an isolated increase', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [
              {
                name: 'ETH',
                szDecimals: 4,
                maxLeverage: 25,
                marginTableId: 25,
              },
            ],
            marginTables: [],
          }),
        }),
      );

      const result = await provider.previewPositionModify({
        position: isolatedPosition,
        direction: 'long',
        size: '0.5',
        price: '2000',
        leverage: 10,
        feeAmountUsd: 0,
      });

      expect(result.status).toBe('open');
      if (result.status !== 'open') {
        return;
      }
      expect(result.kind).toBe('increase');
      // The venue keeps the $400 at 10x; the order adds $100.
      expect(result.resulting.margin).toStrictEqual({
        available: true,
        value: 500,
      });
      expect(result.resulting.direction).toBe('long');
    });

    it('withholds liquidation when the asset is missing from meta', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [
              {
                name: 'BTC',
                szDecimals: 5,
                maxLeverage: 40,
                marginTableId: 40,
              },
            ],
            marginTables: [],
          }),
        }),
      );

      const result = await provider.previewPositionModify({
        position: isolatedPosition,
        direction: 'long',
        size: '0.5',
        price: '2000',
        leverage: 10,
        feeAmountUsd: 0,
      });

      expect(result.status).toBe('open');
      if (result.status !== 'open') {
        return;
      }
      // The venue keeps the $400 at 10x; the order adds $100.
      expect(result.resulting.margin).toStrictEqual({
        available: true,
        value: 500,
      });
      expect(result.resulting.liquidationPrice).toStrictEqual({
        available: false,
      });
    });
  });

  describe('getMaxLeverage', () => {
    it('returns max leverage for an asset', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue(
        createMockInfoClient({
          meta: vi.fn().mockResolvedValue({
            universe: [{ name: 'ETH', maxLeverage: 30, szDecimals: 4 }],
          }),
        }),
      );

      const result = await provider.getMaxLeverage('ETH');

      expect(result).toBe(30);
    });

    it('returns default max leverage when asset not found', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue({
        meta: vi.fn().mockResolvedValue({
          universe: [],
        }),
      });

      const result = await provider.getMaxLeverage('UNKNOWN');

      // Should return default max leverage of 3
      expect(result).toBe(3);
    });

    it('returns default max leverage on network failure', async () => {
      mockClientService.getInfoClient = vi.fn().mockReturnValue({
        meta: vi.fn().mockRejectedValue(new Error('Network error')),
      });

      const result = await provider.getMaxLeverage('BTC');

      // Should return default max leverage of 3 on error
      expect(result).toBe(3);
    });
  });

  describe('validateOrder', () => {
    beforeEach(() => {
      mockValidateOrderParams.mockReturnValue({ isValid: true });
    });

    it('validates order successfully with valid params and price', async () => {
      const params: OrderParams = {
        symbol: 'BTC',
        size: '0.1',
        isBuy: true,
        orderType: 'market',
        currentPrice: 50000,
        leverage: 10,
      };

      const result = await provider.validateOrder(params);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockValidateOrderParams).toHaveBeenCalledWith({
        coin: 'BTC', // validateOrderParams uses 'coin' (internal util), provider maps symbol -> coin
        size: '0.1',
        price: undefined,
        orderType: 'market',
      });
    });

    it('fails validation when currentPrice is missing', async () => {
      const params: OrderParams = {
        symbol: 'BTC',
        size: '0.1',
        isBuy: true,
        orderType: 'market',
        // currentPrice missing
        leverage: 10,
      };

      const result = await provider.validateOrder(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_PRICE_REQUIRED);
    });

    it('fails validation when order value is below minimum', async () => {
      const params: OrderParams = {
        symbol: 'BTC',
        size: '0.00001', // Very small size
        isBuy: true,
        orderType: 'market',
        currentPrice: 50000, // 0.00001 * 50000 = $0.5 (below minimum)
        leverage: 10,
      };

      const result = await provider.validateOrder(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain(PERPS_ERROR_CODES.ORDER_SIZE_MIN);
    });

    it('fails validation when basic params are invalid', async () => {
      mockValidateOrderParams.mockReturnValue({
        isValid: false,
        error: 'Invalid coin',
      });

      const params: OrderParams = {
        symbol: 'INVALID',
        size: '0.1',
        isBuy: true,
        orderType: 'market',
        currentPrice: 50000,
        leverage: 10,
      };

      const result = await provider.validateOrder(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid coin');
    });

    it('validates limit order with price', async () => {
      const params: OrderParams = {
        symbol: 'ETH',
        size: '1',
        isBuy: true,
        orderType: 'limit',
        price: '3000',
        currentPrice: 3050,
        leverage: 5,
      };

      const result = await provider.validateOrder(params);

      expect(result.isValid).toBe(true);
      expect(mockValidateOrderParams).toHaveBeenCalledWith({
        coin: 'ETH', // validateOrderParams uses 'coin' (internal util), provider maps symbol -> coin
        size: '1',
        price: '3000',
        orderType: 'limit',
      });
    });

    it.each([0, Number.NaN, -2])(
      'rejects leverage %s as invalid',
      async (leverage) => {
        const result = await provider.validateOrder({
          symbol: 'BTC',
          size: '0.1',
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage,
        });

        expect(result).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_LEVERAGE_INVALID,
        });
      },
    );

    it.each(['', '0'])(
      'leaves an empty or zero size (%j) to the minimum-size check',
      async (size) => {
        const result = await provider.validateOrder({
          symbol: 'BTC',
          size,
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
        });

        expect(result).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SIZE_MIN,
        });
      },
    );

    it.each(['Infinity', '0', '-1'])(
      'rejects an invalid reduce-only size cap %s alongside a valid USD amount',
      async (size) => {
        const result = await provider.validateOrder({
          symbol: 'BTC',
          size,
          isBuy: false,
          orderType: 'market',
          reduceOnly: true,
          currentPrice: 50000,
          usdAmount: '100',
        });
        expect(result).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE,
        });
      },
    );

    it.each(['abc', 'Infinity', '-1'])(
      'rejects size %s when no USD amount is given',
      async (size) => {
        const result = await provider.validateOrder({
          symbol: 'BTC',
          size,
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
        });

        expect(result).toStrictEqual({
          isValid: false,
          error: PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE,
        });
      },
    );

    it.each([
      [
        { orderType: 'limit', price: 'Infinity' },
        PERPS_ERROR_CODES.ORDER_PRICE_POSITIVE,
      ],
      [
        { orderType: 'market', currentPrice: Infinity },
        PERPS_ERROR_CODES.ORDER_PRICE_POSITIVE,
      ],
      [
        { orderType: 'market', currentPrice: NaN },
        PERPS_ERROR_CODES.ORDER_PRICE_POSITIVE,
      ],
      [
        { orderType: 'stop_market', triggerPrice: 'Infinity' },
        PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE,
      ],
    ] as const)(
      'rejects a non-finite price for %j',
      async (priceParams, error) => {
        const actualValidation = await vi.importActual<
          typeof import('../../../src/utils/hyperLiquidValidation.js')
        >('../../../src/utils/hyperLiquidValidation.js');
        mockValidateOrderParams.mockImplementation(
          actualValidation.validateOrderParams,
        );

        const result = await provider.validateOrder({
          symbol: 'BTC',
          size: '0.1',
          isBuy: true,
          ...priceParams,
        });

        expect(result).toStrictEqual({ isValid: false, error });
      },
    );

    it('handles validation errors gracefully', async () => {
      mockValidateOrderParams.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const params: OrderParams = {
        symbol: 'BTC',
        size: '0.1',
        isBuy: true,
        orderType: 'market',
        currentPrice: 50000,
        leverage: 10,
      };

      const result = await provider.validateOrder(params);

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Unexpected error');
    });

    describe('existing position leverage validation', () => {
      it('allows order when leverage equals existing position leverage', async () => {
        const params: OrderParams = {
          symbol: 'BTC',
          size: '0.1',
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
          existingPositionLeverage: 10,
        };

        const result = await provider.validateOrder(params);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('allows order when leverage exceeds existing position leverage', async () => {
        const params: OrderParams = {
          symbol: 'BTC',
          size: '0.1',
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage: 15,
          existingPositionLeverage: 10,
        };

        const result = await provider.validateOrder(params);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('rejects order when leverage below existing position leverage', async () => {
        const params: OrderParams = {
          symbol: 'BTC',
          size: '0.1',
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage: 5,
          existingPositionLeverage: 10,
        };

        const result = await provider.validateOrder(params);

        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          PERPS_ERROR_CODES.ORDER_LEVERAGE_BELOW_POSITION,
        );
      });

      it('allows any leverage when no existing position', async () => {
        const params: OrderParams = {
          symbol: 'BTC',
          size: '0.1',
          isBuy: true,
          orderType: 'market',
          currentPrice: 50000,
          leverage: 3,
        };

        const result = await provider.validateOrder(params);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });
});
