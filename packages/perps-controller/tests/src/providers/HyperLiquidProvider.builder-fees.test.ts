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
import { PerpsSigningCache } from '../../../src/services/TradingReadinessCache';
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

// Mock PerpsSigningCache (exported from TradingReadinessCache module) — global
// singleton for signing operation caching. Use jest.createMockFromModule for
// proper mock creation.
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

    // Reset PerpsSigningCache mock state (using imported mocked module)
    const mockedCache = PerpsSigningCache as jest.Mocked<
      typeof PerpsSigningCache
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
  describe('Builder Fee and Referral Integration', () => {
    beforeEach(() => {
      // Mock with maxBuilderFee: 0 to trigger approval calls
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(0), // Not approved yet
        }),
      );

      // Mock user address to be different from builder address
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        '0x1234567890123456789012345678901234567890', // Different from builder
      );

      mockClientService.getExchangeClient = jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: '123' } }] } },
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
      });
    });

    it('includes builder fee and referral setup in order placement', async () => {
      // Mock builder fee not approved to trigger approval call
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest
          .fn()
          .mockResolvedValueOnce(0) // First call: not approved
          .mockResolvedValueOnce(0.001), // Second call: approved after approval
        referral: jest.fn().mockResolvedValue({
          referrerState: {
            stage: 'ready',
            data: { code: REFERRAL_CONFIG.MainnetCode },
          },
          referredBy: null, // User has no referral set
        }),
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
                cumFunding: {
                  allTime: '10',
                  sinceOpen: '5',
                  sinceChange: '2',
                },
              },
              type: 'oneWay',
            },
          ],
        }),
        spotClearinghouseState: jest.fn().mockResolvedValue({
          balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
        }),
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
      });

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);

      // Builder fee approval is set once during ensureReady() initialization
      // With session caching, it should be called once (during first ensureReady)
      expect(
        mockClientService.getExchangeClient().approveBuilderFee,
      ).toHaveBeenCalledWith({
        builder: expect.any(String),
        maxFeeRate: expect.stringContaining('%'),
      });

      // Note: Referral setup is fire-and-forget (non-blocking), so we can't reliably
      // test it synchronously. It's tested separately in dedicated referral tests.

      // Place a second order to verify caching (should NOT call builder fee approval again)
      const mockExchangeClient = mockClientService.getExchangeClient();
      (mockExchangeClient.approveBuilderFee as jest.Mock).mockClear();

      const result2 = await provider.placeOrder(orderParams);

      expect(result2.success).toBe(true);
      // Session cache prevents redundant builder fee approval calls
      expect(mockExchangeClient.approveBuilderFee).not.toHaveBeenCalled();

      // Verify order was placed with builder fee
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: expect.any(Array),
          builder: {
            b: expect.any(String),
            f: expect.any(Number),
          },
        }),
      );
    });

    it('includes builder fee and referral setup in TP/SL updates', async () => {
      // Mock builder fee not approved to trigger approval call
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest
          .fn()
          .mockResolvedValueOnce(0) // First call: not approved
          .mockResolvedValueOnce(0.001), // Second call: approved after approval
        referral: jest.fn().mockResolvedValue({
          referrerState: {
            stage: 'ready',
            data: { code: REFERRAL_CONFIG.MainnetCode },
          },
          referredBy: null, // User has no referral set
        }),
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
                cumFunding: {
                  allTime: '10',
                  sinceOpen: '5',
                  sinceChange: '2',
                },
              },
              type: 'oneWay',
            },
          ],
        }),
        spotClearinghouseState: jest.fn().mockResolvedValue({
          balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
        }),
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
      });

      const updateParams = {
        symbol: 'BTC',
        takeProfitPrice: '55000',
        stopLossPrice: '45000',
      };

      const result = await provider.updatePositionTPSL(updateParams);

      expect(result.success).toBe(true);

      // Verify builder fee approval was called
      expect(
        mockClientService.getExchangeClient().approveBuilderFee,
      ).toHaveBeenCalledWith({
        builder: expect.any(String),
        maxFeeRate: expect.stringContaining('%'),
      });

      // Verify referral code was set
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).toHaveBeenCalledWith({
        code: expect.any(String),
      });

      // Verify order was placed with builder fee
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: expect.any(Array),
          grouping: 'positionTpsl',
          builder: {
            b: expect.any(String),
            f: expect.any(Number),
          },
        }),
      );
    });

    it('skips referral setup when user is the builder', async () => {
      // Mock user address to be the same as builder address
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        '0xe95a5e31904e005066614247d309e00d8ad753aa', // Builder address
      );

      // When user IS the builder, maxBuilderFee should already be approved
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(1), // Already approved
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);

      // Should not call setReferrer when user is the builder
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).not.toHaveBeenCalled();
    });

    it('handles builder fee approval failure (non-blocking)', async () => {
      // Mock builder fee not approved to trigger approval call
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(0), // Not approved - triggers approval
        }),
      );

      // Mock builder fee approval to fail
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          approveBuilderFee: jest
            .fn()
            .mockRejectedValue(new Error('Builder fee approval failed')),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      // PR #25334: Builder fee approval is now non-blocking (fire-and-forget)
      // to prevent repeated signing prompts for hardware wallets.
      // Order should proceed even if builder fee approval fails.
      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
    });

    it('retries builder fee approval after a previous attempt failed', async () => {
      const mockedCache = PerpsSigningCache as jest.Mocked<
        typeof PerpsSigningCache
      >;

      // First order: builder fee approval fails
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest
            .fn()
            .mockResolvedValueOnce(0) // first order: check — not approved
            .mockResolvedValueOnce(0) // second order: check — cached failure prevents retry
            .mockResolvedValueOnce(0.001), // unused if cached failure is respected
        }),
      );

      const mockApproveBuilderFee = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({ status: 'ok' });

      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          approveBuilderFee: mockApproveBuilderFee,
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      // First order — builder fee fails but order proceeds (non-blocking)
      const result1 = await provider.placeOrder(orderParams);
      expect(result1.success).toBe(true);

      // Simulate cached failure state — getBuilderFee returns { attempted: true, success: false }
      mockedCache.getBuilderFee.mockReturnValue({
        attempted: true,
        success: false,
      });

      // Second order — cached failure does NOT skip approval; retry so the
      // builder fee eventually lands (mobile fix #30095).
      const result2 = await provider.placeOrder(orderParams);
      expect(result2.success).toBe(true);

      // approveBuilderFee called twice: cached failure retries instead of
      // silently leaving the builder fee unapproved.
      expect(mockApproveBuilderFee).toHaveBeenCalledTimes(2);
    });

    it('skips builder fee retry when previous attempt succeeded', async () => {
      const mockedCache = PerpsSigningCache as jest.Mocked<
        typeof PerpsSigningCache
      >;

      // Simulate successful cache
      mockedCache.getBuilderFee.mockReturnValue({
        attempted: true,
        success: true,
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(createMockInfoClient());

      const mockApproveBuilderFee = jest.fn();
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          approveBuilderFee: mockApproveBuilderFee,
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);
      expect(result.success).toBe(true);

      // Should not retry — cache shows success
      expect(mockApproveBuilderFee).not.toHaveBeenCalled();
    });

    it('leaves builder fee cache empty when wrapped KEYRING_LOCKED is thrown', async () => {
      const wrappedKeyringLockedError = Object.assign(
        new Error('Failed to sign typed data with viem wallet'),
        { cause: new Error('KEYRING_LOCKED') },
      );
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(0),
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'not_ready',
              data: null,
            },
          }),
        }),
      );
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          approveBuilderFee: jest
            .fn()
            .mockRejectedValue(wrappedKeyringLockedError),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setBuilderFee,
      ).not.toHaveBeenCalled();
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('handles referral code setup failure (non-blocking)', async () => {
      // Mock builder fee already approved
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(createMockInfoClient());

      // Mock referral code setup to fail
      mockClientService.getExchangeClient = jest.fn().mockReturnValue({
        approveBuilderFee: jest.fn().mockResolvedValue({
          status: 'ok',
        }),
        setReferrer: jest
          .fn()
          .mockRejectedValue(new Error('Referral code setup failed')),
        order: jest.fn().mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: [{ resting: { oid: '123' } }] } },
        }),
        updateLeverage: jest.fn().mockResolvedValue({
          status: 'ok',
        }),
      });

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      // Referral setup is now non-blocking (fire-and-forget), so order should succeed
      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
    });

    it('leaves referral cache empty when wrapped KEYRING_LOCKED is thrown', async () => {
      const wrappedKeyringLockedError = Object.assign(
        new Error('Failed to sign typed data with viem wallet'),
        { cause: new Error('KEYRING_LOCKED') },
      );
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(1),
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'ready',
              data: { code: REFERRAL_CONFIG.MainnetCode },
            },
            referredBy: null,
          }),
        }),
      );
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          setReferrer: jest.fn().mockRejectedValue(wrappedKeyringLockedError),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);
      await Promise.resolve();
      await Promise.resolve();

      expect(result.success).toBe(true);
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setReferral,
      ).not.toHaveBeenCalled();
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('skips referral setup when referral code is not ready', async () => {
      // Mock referral code not ready
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'not_ready', // Not ready
              data: null,
            },
          }),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);

      // Should not call setReferrer when referral code is not ready
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).not.toHaveBeenCalled();
    });

    it('skips referral setup when user already has a referral', async () => {
      // Mock user already has a referral by setting referredBy.code
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'ready',
              data: { code: 'MMCSI' },
            },
            referredBy: {
              code: 'EXISTING_REFERRAL',
            },
          }),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);

      // Should not call setReferrer when user already has a referral
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).not.toHaveBeenCalled();
    });

    it('uses testnet builder address when in testnet mode', async () => {
      // Arrange — flip to testnet mode
      mockClientService.isTestnetMode.mockReturnValue(true);

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(1), // Already approved
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      // Act
      const result = await provider.placeOrder(orderParams);

      // Assert — order placed with the testnet builder address
      expect(result.success).toBe(true);
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          builder: {
            b: BUILDER_FEE_CONFIG.TestnetBuilder,
            f: expect.any(Number),
          },
        }),
      );
    });
  });

  // TODO: Refactor to test through public API — ES # private fields prevent direct access
  describe.skip('Builder Fee Global Cache (PR #25334)', () => {
    interface ProviderWithBuilderFee {
      ensureBuilderFeeApproval(): Promise<void>;
    }

    let testableProvider: ProviderWithBuilderFee;

    beforeEach(() => {
      testableProvider = provider as unknown as ProviderWithBuilderFee;
      mockWalletService.getUserAddressWithDefault = jest
        .fn()
        .mockResolvedValue('0x1234567890123456789012345678901234567890');
    });

    it('returns early when global cache indicates already attempted', async () => {
      // Arrange - simulate cached state
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).getBuilderFee.mockReturnValue({
        attempted: true,
        success: true,
      });

      // Act
      await testableProvider.ensureBuilderFeeApproval();

      // Assert - should not call API when cached
      expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
    });

    it('waits for in-flight operation instead of duplicating request', async () => {
      // Arrange - ensure getBuilderFee returns undefined (not cached)
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).getBuilderFee.mockReturnValue(undefined);

      // Simulate in-flight operation from another provider
      let resolveInFlight: () => void = () => undefined;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).isInFlight.mockReturnValue(inFlightPromise);

      // Act
      const approvalPromise = testableProvider.ensureBuilderFeeApproval();

      // Resolve the in-flight operation
      resolveInFlight();
      await approvalPromise;

      // Verify it called isInFlight to check for concurrent operations
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>).isInFlight,
      ).toHaveBeenCalledWith(
        'builderFee',
        'mainnet',
        '0x1234567890123456789012345678901234567890',
      );

      // Assert - should not have set its own in-flight lock
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setInFlight,
      ).not.toHaveBeenCalled();
    });

    it('caches success after successful approval', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest
            .fn()
            .mockResolvedValueOnce(0) // First call: not approved
            .mockResolvedValueOnce(0.001), // Second call: approved after approval
        }),
      );

      // Act
      await testableProvider.ensureBuilderFeeApproval();

      // Assert
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setBuilderFee,
      ).toHaveBeenCalledWith(
        'mainnet',
        '0x1234567890123456789012345678901234567890',
        { attempted: true, success: true },
      );
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('caches failure to prevent repeated signing requests', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(0),
        }),
      );
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          approveBuilderFee: jest
            .fn()
            .mockRejectedValue(new Error('User rejected')),
        }),
      );

      // Act & Assert
      await expect(testableProvider.ensureBuilderFeeApproval()).rejects.toThrow(
        'User rejected',
      );

      // Assert - failure should be cached
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setBuilderFee,
      ).toHaveBeenCalledWith(
        'mainnet',
        '0x1234567890123456789012345678901234567890',
        { attempted: true, success: false },
      );
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('skips cache when KEYRING_LOCKED error is thrown', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          maxBuilderFee: jest.fn().mockResolvedValue(0),
        }),
      );
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          approveBuilderFee: jest
            .fn()
            .mockRejectedValue(new Error('KEYRING_LOCKED')),
        }),
      );

      // Act - should resolve without throwing
      await testableProvider.ensureBuilderFeeApproval();

      // Assert - cache should NOT be set (so it retries when unlocked)
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setBuilderFee,
      ).not.toHaveBeenCalled();
      // Assert - in-flight lock should be released
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });
  });

  // TODO: Refactor to test through public API — ES # private fields prevent direct access
  describe.skip('Referral Global Cache (PR #25334)', () => {
    interface ProviderWithReferral {
      ensureReferralSet(): Promise<void>;
    }

    let testableProvider: ProviderWithReferral;

    beforeEach(() => {
      testableProvider = provider as unknown as ProviderWithReferral;
      mockWalletService.getUserAddressWithDefault = jest
        .fn()
        .mockResolvedValue('0x1234567890123456789012345678901234567890');
    });

    it('returns early when global cache indicates already attempted', async () => {
      // Arrange - simulate cached state
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).getReferral.mockReturnValue({
        attempted: true,
        success: true,
      });

      // Act
      await testableProvider.ensureReferralSet();

      // Assert - should not call API when cached
      expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
    });

    it('waits for in-flight operation instead of duplicating request', async () => {
      // Arrange - ensure getReferral returns undefined (not cached)
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).getReferral.mockReturnValue(undefined);

      // Simulate in-flight operation from another provider
      let resolveInFlight: () => void = () => undefined;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).isInFlight.mockReturnValue(inFlightPromise);

      // Act
      const referralPromise = testableProvider.ensureReferralSet();

      // Resolve the in-flight operation
      resolveInFlight();
      await referralPromise;

      // Verify it called isInFlight to check for concurrent operations
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>).isInFlight,
      ).toHaveBeenCalledWith(
        'referral',
        'mainnet',
        '0x1234567890123456789012345678901234567890',
      );

      // Assert - should not have set its own in-flight lock
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setInFlight,
      ).not.toHaveBeenCalled();
    });

    it('caches success after successful referral setup', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'ready',
              data: { code: 'MMCSI' },
            },
            referredBy: null,
          }),
        }),
      );

      // Act
      await testableProvider.ensureReferralSet();

      // Assert
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setReferral,
      ).toHaveBeenCalledWith(
        'mainnet',
        '0x1234567890123456789012345678901234567890',
        { attempted: true, success: true },
      );
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('caches failure to prevent repeated signing requests', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'ready',
              data: { code: 'MMCSI' },
            },
            referredBy: null,
          }),
        }),
      );
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          setReferrer: jest.fn().mockRejectedValue(new Error('User rejected')),
        }),
      );

      // Act - should not throw (referral is non-blocking)
      await testableProvider.ensureReferralSet();

      // Assert - failure should be cached
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setReferral,
      ).toHaveBeenCalledWith(
        'mainnet',
        '0x1234567890123456789012345678901234567890',
        { attempted: true, success: false },
      );
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('caches success when user already has referral on-chain', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'ready',
              data: { code: 'MMCSI' },
            },
            referredBy: { code: 'EXISTING' }, // Already has referral
          }),
        }),
      );

      // Act
      await testableProvider.ensureReferralSet();

      // Assert - should cache success without calling setReferrer
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setReferral,
      ).toHaveBeenCalledWith(
        'mainnet',
        '0x1234567890123456789012345678901234567890',
        { attempted: true, success: true },
      );
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).not.toHaveBeenCalled();
    });

    it('skips cache and Sentry when KEYRING_LOCKED error is thrown', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          referral: jest.fn().mockResolvedValue({
            referrerState: {
              stage: 'ready',
              data: { code: 'MMCSI' },
            },
            referredBy: null,
          }),
        }),
      );
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          setReferrer: jest.fn().mockRejectedValue(new Error('KEYRING_LOCKED')),
        }),
      );

      // Act - should resolve without throwing
      await testableProvider.ensureReferralSet();

      // Assert - cache should NOT be set (so it retries when unlocked)
      expect(
        (PerpsSigningCache as jest.Mocked<typeof PerpsSigningCache>)
          .setReferral,
      ).not.toHaveBeenCalled();
      // Assert - ensureReferralSet's catch does NOT call logger.error for KEYRING_LOCKED.
      // Note: setReferralCode() internally logs to Sentry before rethrowing, so
      // logger.error is called once (from setReferralCode), but NOT a second time
      // from ensureReferralSet's catch block (which is the behavior under test).
      expect(mockPlatformDependencies.logger.error).toHaveBeenCalledTimes(1);
      expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({ method: 'setReferralCode' }),
          }),
        }),
      );
      // Assert - in-flight lock should be released
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });
  });
});
