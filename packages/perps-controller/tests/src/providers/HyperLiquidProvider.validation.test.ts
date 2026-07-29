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
    beforeEach(() => {
      // Set up mock for asset info with maxLeverage: 20 for BTC (test expectations)
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({
            universe: [
              { name: 'BTC', szDecimals: 3, maxLeverage: 20 },
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

    it('throws error for leverage exceeding maintenance leverage', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({
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
        const result = await provider.calculateLiquidationPrice(params);
        expect(result).toBe('0.00');
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

  describe('calculateMaintenanceMargin', () => {
    it('calculates maintenance margin correctly for 40x max leverage asset', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({
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
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        meta: jest.fn().mockResolvedValue({
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
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        meta: jest.fn().mockResolvedValue({
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

  describe('getMaxLeverage', () => {
    it('returns max leverage for an asset', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({
            universe: [{ name: 'ETH', maxLeverage: 30, szDecimals: 4 }],
          }),
        }),
      );

      const result = await provider.getMaxLeverage('ETH');

      expect(result).toBe(30);
    });

    it('returns default max leverage when asset not found', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        meta: jest.fn().mockResolvedValue({
          universe: [],
        }),
      });

      const result = await provider.getMaxLeverage('UNKNOWN');

      // Should return default max leverage of 3
      expect(result).toBe(3);
    });

    it('returns default max leverage on network failure', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        meta: jest.fn().mockRejectedValue(new Error('Network error')),
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
