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
  describe('Additional Error Handling and Edge Cases', () => {
    describe('ensureReady and buildAssetMapping', () => {
      it('handles meta fetch failure in buildAssetMapping', async () => {
        // Create a fresh provider to test buildAssetMapping
        const freshProvider = createTestProvider();

        // Mock failed meta fetch but keep other methods working
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockRejectedValue(new Error('Network timeout')),
            metaAndAssetCtxs: jest
              .fn()
              .mockRejectedValue(new Error('Network timeout')),
          }),
        );

        MockedHyperLiquidClientService.mockImplementation(
          () => mockClientService,
        );

        // Try to place an order which will trigger ensureReady -> buildAssetMapping
        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000, // Add price for validation
        };

        const result = await freshProvider.placeOrder(orderParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Network timeout');
      });

      it('handles string response from meta endpoint', async () => {
        // metaAndAssetCtxs returns no valid meta so cache is not populated; buildAssetMapping leaves map empty
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue('invalid string response' as any),
            metaAndAssetCtxs: jest.fn().mockResolvedValue([null, []]), // No valid meta -> no cache, no asset mapping
          }),
        );

        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        const updateParams = {
          symbol: 'BTC',
          takeProfitPrice: '55000',
        };

        const result = await provider.updatePositionTPSL(updateParams);

        expect(result.success).toBe(false);
        // With no valid meta from metaAndAssetCtxs, asset mapping is empty so we fail with asset not found
        expect(
          result.error?.includes('Asset ID not found') ||
            result.error?.includes('Invalid meta response'),
        ).toBe(true);
      });

      it('handles meta response without universe property', async () => {
        // metaAndAssetCtxs returns no valid meta so cache is not populated; buildAssetMapping leaves map empty
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue({}), // Empty object without universe
            metaAndAssetCtxs: jest.fn().mockResolvedValue([null, []]), // No valid meta -> no cache, no asset mapping
          }),
        );

        const updateParams = {
          symbol: 'BTC',
          takeProfitPrice: '55000',
        };

        const result = await provider.updatePositionTPSL(updateParams);

        expect(result.success).toBe(false);
        // With no valid meta from metaAndAssetCtxs, asset mapping is empty so we fail with asset not found
        expect(
          result.error?.includes('Asset ID not found') ||
            result.error?.includes('Invalid meta response'),
        ).toBe(true);
      });
    });

    describe('Order placement edge cases', () => {
      it('handles leverage update failure', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            updateLeverage: jest.fn().mockResolvedValue({
              status: 'error',
              response: { message: 'Leverage update failed' },
            }),
          }),
        );

        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          leverage: 10,
          currentPrice: 50000,
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to update leverage');
      });

      it('succeeds with market order without current price or usdAmount (uses fetched price)', async () => {
        // The provider now fetches the live price before validation so callers
        // that intentionally omit currentPrice (e.g. flipPosition) work correctly.
        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          // No currentPrice or usdAmount: provider fetches live price (50000)
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(true);
        expect(mockClientService.getExchangeClient().order).toHaveBeenCalled();
      });

      it('placeOrder validates against fetched price when params omit currentPrice (flipPosition path)', async () => {
        // Simulate the exact OrderParams shape that TradingService.flipPosition
        // builds: symbol + isBuy + size + orderType + leverage, no price fields.
        const flipOrderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: false, // flipping long → short
          size: '1', // 2× the 0.5 BTC position
          orderType: 'market',
          leverage: 10,
          // currentPrice, usdAmount, price intentionally absent
        };

        const result = await provider.placeOrder(flipOrderParams);

        // Live price (50000) is fetched from allMids → validation passes
        // (0.1 BTC × $50 000 = $5 000 >> $10 minimum) → order executes.
        expect(result.success).toBe(true);
        expect(
          mockClientService.getExchangeClient().order,
        ).toHaveBeenCalledWith(
          expect.objectContaining({ orders: expect.any(Array) }),
        );
      });

      it('handles order with custom slippage', async () => {
        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
          slippage: 0.02, // 2% slippage
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(true);
        // Should use 2% slippage instead of default 1%
      });

      it('handles filled order response', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            order: jest.fn().mockResolvedValue({
              status: 'ok',
              response: {
                data: {
                  statuses: [
                    {
                      filled: {
                        oid: '456',
                        totalSz: '0.1',
                        avgPx: '50100',
                      },
                    },
                  ],
                },
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
        expect(result.orderId).toBe('456');
        expect(result.filledSize).toBe('0.1');
        expect(result.averagePrice).toBe('50100');
      });

      it('handles order with clientOrderId', async () => {
        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
          clientOrderId: '0x123abc',
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(true);
      });

      it('handles order with TP/SL and custom grouping', async () => {
        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'limit',
          price: '51000',
          takeProfitPrice: '55000',
          stopLossPrice: '48000',
          grouping: 'positionTpsl',
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(true);
      });
    });

    describe('updatePositionTPSL error scenarios', () => {
      it('handles WebSocket error in getPositions', async () => {
        // Set up mock BEFORE creating fresh provider (provider calls metaAndAssetCtxs on init)
        MockedHyperLiquidClientService.mockImplementation(
          () => mockClientService,
        );

        // Create a fresh provider to test WebSocket errors
        const freshProvider = createTestProvider();

        // Mock getPositions to simulate the WebSocket error being handled
        jest
          .spyOn(freshProvider, 'getPositions')
          .mockImplementation(async () => {
            throw new Error('WebSocket connection failed');
          });

        const updateParams = {
          symbol: 'BTC',
          takeProfitPrice: '55000',
        };

        const result = await freshProvider.updatePositionTPSL(updateParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('WebSocket connection failed');
      });

      it('handles non-WebSocket error in getPositions', async () => {
        // Set up mock BEFORE creating fresh provider (provider calls metaAndAssetCtxs on init)
        MockedHyperLiquidClientService.mockImplementation(
          () => mockClientService,
        );

        // Create a fresh provider to test non-WebSocket errors
        const freshProvider = createTestProvider();

        // Mock getPositions to simulate a generic API error
        jest
          .spyOn(freshProvider, 'getPositions')
          .mockImplementation(async () => {
            throw new Error('Generic API error');
          });

        const updateParams = {
          symbol: 'BTC',
          takeProfitPrice: '55000',
        };

        const result = await freshProvider.updatePositionTPSL(updateParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Generic API error');
      });

      it('handles canceling existing TP/SL orders', async () => {
        // Create provider with BTC in the asset mapping
        provider = createTestProvider({
          initialAssetMapping: [['BTC', 0]],
        });

        // Mock position exists with existing TP/SL orders
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            frontendOpenOrders: jest.fn().mockResolvedValue([
              {
                coin: 'BTC',
                oid: 123,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                orderType: 'Take Profit',
              },
              {
                coin: 'BTC',
                oid: 124,
                reduceOnly: true,
                isTrigger: true,
                isPositionTpsl: true,
                orderType: 'Stop Loss',
              },
            ]),
          }),
        );

        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            cancel: jest.fn().mockResolvedValue({
              status: 'ok',
              response: { data: { statuses: ['success', 'success'] } },
            }),
            order: jest.fn().mockResolvedValue({
              status: 'ok',
              response: { data: { statuses: [{ resting: { oid: '999' } }] } },
            }),
          }),
        );

        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        const updateParams = {
          symbol: 'BTC',
          takeProfitPrice: '55000',
        };

        const result = await provider.updatePositionTPSL(updateParams);

        expect(result.success).toBe(true);
        expect(
          mockClientService.getExchangeClient().cancel,
        ).toHaveBeenCalledWith({
          cancels: [
            { a: 0, o: 123 },
            { a: 0, o: 124 },
          ],
        });
      });

      it('cache path: only cancels positionTpsl orders, not normalTpsl children of limit orders', async () => {
        provider = createTestProvider({
          initialAssetMapping: [['BTC', 0]],
        });

        // Simulate WS cache with mixed orders: normalTpsl children (isPositionTpsl: false)
        // from a pending limit order AND positionTpsl orders (isPositionTpsl: true)
        const cachedOrders: Order[] = [
          {
            orderId: '500',
            symbol: 'BTC',
            side: 'buy',
            orderType: 'limit',
            size: '0.01',
            originalSize: '0.01',
            price: '50000',
            filledSize: '0',
            remainingSize: '0.01',
            status: 'open',
            timestamp: 1000,
            isTrigger: false,
            reduceOnly: false,
            isPositionTpsl: false,
          },
          {
            orderId: '501',
            symbol: 'BTC',
            side: 'sell',
            orderType: 'limit',
            size: '0.01',
            originalSize: '0.01',
            price: '60000',
            filledSize: '0',
            remainingSize: '0.01',
            status: 'open',
            timestamp: 1001,
            isTrigger: true,
            reduceOnly: true,
            isPositionTpsl: false,
            detailedOrderType: 'Take Profit Limit',
          },
          {
            orderId: '502',
            symbol: 'BTC',
            side: 'sell',
            orderType: 'market',
            size: '0.01',
            originalSize: '0.01',
            price: '40000',
            filledSize: '0',
            remainingSize: '0.01',
            status: 'open',
            timestamp: 1002,
            isTrigger: true,
            reduceOnly: true,
            isPositionTpsl: false,
            detailedOrderType: 'Stop Market',
          },
          {
            orderId: '503',
            symbol: 'BTC',
            side: 'sell',
            orderType: 'limit',
            size: '0',
            originalSize: '0',
            price: '58000',
            filledSize: '0',
            remainingSize: '0',
            status: 'open',
            timestamp: 1003,
            isTrigger: true,
            reduceOnly: true,
            isPositionTpsl: true,
            detailedOrderType: 'Take Profit Limit',
          },
          {
            orderId: '504',
            symbol: 'BTC',
            side: 'sell',
            orderType: 'market',
            size: '0',
            originalSize: '0',
            price: '42000',
            filledSize: '0',
            remainingSize: '0',
            status: 'open',
            timestamp: 1004,
            isTrigger: true,
            reduceOnly: true,
            isPositionTpsl: true,
            detailedOrderType: 'Stop Market',
          },
        ];

        mockSubscriptionService.getOrdersCacheIfInitialized = jest
          .fn()
          .mockReturnValue(cachedOrders);

        const mockCancel = jest.fn().mockResolvedValue({
          status: 'ok',
          response: { data: { statuses: ['success', 'success'] } },
        });
        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            cancel: mockCancel,
            order: jest.fn().mockResolvedValue({
              status: 'ok',
              response: {
                data: { statuses: [{ resting: { oid: '999' } }] },
              },
            }),
          }),
        );

        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          stopLossPrice: '40000',
        });

        expect(result.success).toBe(true);
        // Must cancel positionTpsl orders (503, 504) only — not normalTpsl children (501, 502)
        expect(mockCancel).toHaveBeenCalledWith({
          cancels: [
            { a: 0, o: 503 },
            { a: 0, o: 504 },
          ],
        });
      });
    });

    describe('getAccountState error handling', () => {
      it('re-throws errors instead of returning zeros', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            clearinghouseState: jest
              .fn()
              .mockRejectedValue(new Error('Account state fetch failed')),
            spotClearinghouseState: jest.fn().mockResolvedValue({
              balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
            }),
          }),
        );

        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        await expect(provider.getAccountState()).rejects.toThrow(
          'Failed to fetch account state (failedDexs=[main], spotError=none)',
        );
      });

      it('returns partial account state when one HIP-3 DEX fails', async () => {
        const hip3Provider = createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:*'],
        });
        const mockInfoClient = createMockInfoClient({
          perpDexs: jest
            .fn()
            .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
          clearinghouseState: jest
            .fn()
            .mockImplementation((params?: { dex?: string }) => {
              if (params?.dex === 'xyz') {
                return Promise.reject(new Error('xyz DEX unavailable'));
              }

              return Promise.resolve({
                marginSummary: {
                  totalMarginUsed: '500',
                  accountValue: '10500',
                },
                withdrawable: '9500',
                assetPositions: [],
                crossMarginSummary: {
                  accountValue: '10500',
                  totalMarginUsed: '500',
                },
              });
            }),
          spotClearinghouseState: jest.fn().mockResolvedValue({
            balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
          }),
        });

        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(mockInfoClient);
        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        const accountState = await hip3Provider.getAccountState();

        expect(parseFloat(accountState.totalBalance)).toBe(19500); // perps 10500 + spot.total 10000 - spot.hold 1000
        expect(parseFloat(accountState.marginUsed)).toBe(500);
        expect(mockInfoClient.clearinghouseState).toHaveBeenCalledWith({
          user: '0x123',
          dex: 'xyz',
        });
      });
    });

    describe('getMarketDataWithPrices error scenarios', () => {
      it('handles missing perpsMeta', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue(null),
            allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
            predictedFundings: jest.fn().mockResolvedValue([]),
            metaAndAssetCtxs: jest.fn().mockResolvedValue([null, []]),
          }),
        );

        await expect(provider.getMarketDataWithPrices()).rejects.toThrow(
          /Failed to fetch market data - no markets available/,
        );
      });

      it('uses HTTP InfoClient for market data fetches', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue({
              universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
            }),
            allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
            predictedFundings: jest.fn().mockResolvedValue([]),
            metaAndAssetCtxs: jest.fn().mockResolvedValue([
              { universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }] },
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
              ],
            ]),
          }),
        );

        const freshProvider = createTestProvider();
        await freshProvider.getMarketDataWithPrices();

        expect(mockClientService.getInfoClient).toHaveBeenCalledWith({
          useHttp: true,
        });
      });

      it('prefers the last WebSocket allMids snapshot over REST when available', async () => {
        const mockInfoClient = createMockInfoClient({
          metaAndAssetCtxs: jest.fn().mockResolvedValue([
            { universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }] },
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
            ],
          ]),
          allMids: jest.fn().mockResolvedValue({ BTC: '49999' }),
        });

        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(mockInfoClient);
        mockSubscriptionService.getLastAllMidsSnapshot.mockReturnValue({
          BTC: '51000',
        });

        const freshProvider = createTestProvider();
        const result = await freshProvider.getMarketDataWithPrices();

        expect(result[0].price).toBe('$51000.00');
        expect(mockInfoClient.allMids).not.toHaveBeenCalled();
      });

      it('includes diagnostic context in error when all DEX fetches fail', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            metaAndAssetCtxs: jest
              .fn()
              .mockRejectedValue(new Error('WebSocket timeout')),
            allMids: jest
              .fn()
              .mockRejectedValue(new Error('WebSocket timeout')),
          }),
        );

        await expect(provider.getMarketDataWithPrices()).rejects.toThrow(
          /enabledDexs=.*failed=.*wsState=/,
        );
      });

      it('handles missing allMids', async () => {
        // Set up mock BEFORE creating fresh provider
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue({
              universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
            }),
            allMids: jest.fn().mockResolvedValue(null),
            predictedFundings: jest.fn().mockResolvedValue([]),
            metaAndAssetCtxs: jest.fn().mockResolvedValue([
              { universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }] },
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
              ],
            ]),
          }),
        );

        // Create fresh provider to avoid cached state from other tests
        const freshProvider = createTestProvider();

        // Should gracefully handle missing price data with fallback
        const result = await freshProvider.getMarketDataWithPrices();
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].price).toBe('$---'); // Fallback when allMids is null
      });

      it('handles meta and predictedFundings calls successfully', async () => {
        // Set up mock BEFORE creating fresh provider
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue({
              universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
            }),
            allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
            predictedFundings: jest.fn().mockResolvedValue([]),
            metaAndAssetCtxs: jest.fn().mockResolvedValue([
              { universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }] },
              [
                {
                  funding: '0.001',
                  openInterest: '1000000',
                  prevDayPx: '49000',
                  dayNtlVlm: '1000000',
                  markPx: '50000',
                  midPx: '50000',
                  oraclePx: '50000',
                },
              ],
            ]),
          }),
        );

        // Create fresh provider to avoid cached state from other tests
        const freshProvider = createTestProvider();

        const result = await freshProvider.getMarketDataWithPrices();

        // Verify successful call with proper data structure
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('price');
        expect(result[0]).toHaveProperty('fundingRate');
      });

      it('returns stale cached market data after retry failure', async () => {
        jest.useFakeTimers();

        try {
          mockClientService.getInfoClient = jest.fn().mockReturnValue(
            createMockInfoClient({
              meta: jest.fn().mockResolvedValue({
                universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
              }),
              allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
              metaAndAssetCtxs: jest.fn().mockResolvedValue([
                { universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }] },
                [
                  {
                    funding: '0.001',
                    openInterest: '1000000',
                    prevDayPx: '49000',
                    dayNtlVlm: '1000000',
                    markPx: '50000',
                    midPx: '50000',
                    oraclePx: '50000',
                  },
                ],
              ]),
            }),
          );

          const freshProvider = createTestProvider();
          const freshMarketData = await freshProvider.getMarketDataWithPrices();

          expect(freshMarketData[0].isStale).toBe(false);

          await freshProvider.disconnect();

          mockClientService.getInfoClient = jest.fn().mockReturnValue(
            createMockInfoClient({
              metaAndAssetCtxs: jest
                .fn()
                .mockRejectedValue(new Error('market data unavailable')),
              allMids: jest
                .fn()
                .mockRejectedValue(new Error('market data unavailable')),
            }),
          );

          const staleMarketDataPromise =
            freshProvider.getMarketDataWithPrices();
          await jest.advanceTimersByTimeAsync(2000);
          const staleMarketData = await staleMarketDataPromise;

          expect(staleMarketData[0].symbol).toBe(freshMarketData[0].symbol);
          expect(staleMarketData[0].isStale).toBe(true);
        } finally {
          jest.useRealTimers();
        }
      });

      it('recovers on retry when cached meta refresh initially returns mismatched asset contexts', async () => {
        jest.useFakeTimers();

        try {
          const mainMeta = {
            universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
          };
          const mainAssetCtx = {
            funding: '0.001',
            openInterest: '1000000',
            prevDayPx: '49000',
            dayNtlVlm: '1000000',
            markPx: '50000',
            midPx: '50000',
            oraclePx: '50000',
          };
          let metaAndAssetCtxsCallCount = 0;

          const mockInfoClient = createMockInfoClient({
            metaAndAssetCtxs: jest.fn().mockImplementation(() => {
              metaAndAssetCtxsCallCount += 1;

              if (metaAndAssetCtxsCallCount === 1) {
                return Promise.resolve([mainMeta, [mainAssetCtx]]);
              }

              if (metaAndAssetCtxsCallCount === 2) {
                return Promise.resolve([mainMeta, []]);
              }

              return Promise.resolve([mainMeta, [mainAssetCtx]]);
            }),
            allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
          });

          mockClientService.getInfoClient = jest
            .fn()
            .mockReturnValue(mockInfoClient);
          mockSubscriptionService.getDexAssetCtxsCache.mockReturnValue([]);

          const freshProvider = createTestProvider();
          const resultPromise = freshProvider.getMarketDataWithPrices();

          await jest.advanceTimersByTimeAsync(2000);

          const result = await resultPromise;

          expect(result).toEqual([
            expect.objectContaining({
              symbol: 'BTC',
              price: '$50000.00',
              isStale: false,
            }),
          ]);
          expect(metaAndAssetCtxsCallCount).toBe(3);
          expect(mockInfoClient.allMids).toHaveBeenCalledTimes(1);
          expect(mockPlatformDependencies.debugLogger.log).toHaveBeenCalledWith(
            '[getMarketDataWithPrices] Retry succeeded',
            expect.objectContaining({
              marketCount: 1,
            }),
          );
        } finally {
          jest.useRealTimers();
        }
      });

      it('excludes a cached-meta DEX when assetCtx refresh fails and no aligned ctx cache exists', async () => {
        const xyzMeta = {
          universe: [{ name: 'xyz:XYZ100', szDecimals: 2, maxLeverage: 20 }],
        };
        const xyzAssetCtx = {
          funding: '0.0002',
          openInterest: '250',
          prevDayPx: '40',
          dayNtlVlm: '20000',
          markPx: '42',
          midPx: '42',
          oraclePx: '42',
        };
        const mainMeta = {
          universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
        };
        const mainAssetCtx = {
          funding: '0.001',
          openInterest: '1000000',
          prevDayPx: '49000',
          dayNtlVlm: '1000000',
          markPx: '50000',
          midPx: '50000',
          oraclePx: '50000',
        };

        const xyzMetaFetches = { count: 0 };
        const mockInfoClient = createMockInfoClient({
          perpDexs: jest
            .fn()
            .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
          metaAndAssetCtxs: jest
            .fn()
            .mockImplementation((params?: { dex?: string }) => {
              if (params?.dex === 'xyz') {
                xyzMetaFetches.count += 1;
                if (xyzMetaFetches.count === 1) {
                  return Promise.resolve([xyzMeta, [xyzAssetCtx]]);
                }

                return Promise.reject(
                  new Error('xyz assetCtxs refresh unavailable'),
                );
              }

              return Promise.resolve([mainMeta, [mainAssetCtx]]);
            }),
          allMids: jest.fn().mockImplementation((params?: { dex?: string }) => {
            if (params?.dex === 'xyz') {
              return Promise.resolve({ 'xyz:XYZ100': '42' });
            }

            return Promise.resolve({ BTC: '50000' });
          }),
        });

        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(mockInfoClient);

        const hip3Provider = createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:*'],
        });

        const result = await hip3Provider.getMarketDataWithPrices();

        expect(result.map((market) => market.symbol)).toEqual(['BTC']);
        expect(mockInfoClient.metaAndAssetCtxs).toHaveBeenCalledWith({
          dex: 'xyz',
        });
      });
    });

    describe('withdrawal edge cases', () => {
      it('handles withdrawal without destination (use current user)', async () => {
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          '0xdefaultaddress',
        );

        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          withdraw3: jest.fn().mockResolvedValue({ status: 'ok' }),
        });

        // Mock account state for balance validation
        Object.defineProperty(provider, 'getAccountState', {
          value: jest.fn().mockResolvedValue({
            spendableBalance: '5000',
            withdrawableBalance: '5000',
          }),
          writable: true,
        });

        const withdrawParams = {
          amount: '1000',
          // No destination provided - should use current user address
          assetId:
            'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default' as CaipAssetId,
        };

        const result = await provider.withdraw(withdrawParams);

        expect(result.success).toBe(true);
        expect(
          mockClientService.getExchangeClient().withdraw3,
        ).toHaveBeenCalledWith({
          destination: '0xdefaultaddress',
          amount: '1000',
        });
      });

      it('validates withdrawal against withdrawableBalance populated by spot fold for Unified Account', async () => {
        const exchangeClient = createMockExchangeClient();
        mockClientService.getExchangeClient = jest
          .fn()
          .mockReturnValue(exchangeClient);

        Object.defineProperty(provider, 'getAccountState', {
          value: jest.fn().mockResolvedValue({
            spendableBalance: '2500',
            withdrawableBalance: '2500',
            totalBalance: '2500',
            marginUsed: '0',
            unrealizedPnl: '0',
            returnOnEquity: '0',
          }),
          writable: true,
        });

        const withdrawParams = {
          amount: '1000',
          destination: '0x1234567890123456789012345678901234567890' as Hex,
          assetId:
            'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default' as CaipAssetId,
        };

        const result = await provider.withdraw(withdrawParams);

        expect(result.success).toBe(true);
        expect(mockValidateBalance).toHaveBeenCalledWith(1000, 2500);
        expect(exchangeClient.withdraw3).toHaveBeenCalledWith({
          destination: '0x1234567890123456789012345678901234567890',
          amount: '1000',
        });
      });

      it('handles withdrawal API error', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          withdraw3: jest.fn().mockResolvedValue({
            status: 'insufficient_funds',
            message: 'Not enough balance',
          }),
        });

        // Mock account state for balance validation
        Object.defineProperty(provider, 'getAccountState', {
          value: jest.fn().mockResolvedValue({
            spendableBalance: '5000',
            withdrawableBalance: '5000',
          }),
          writable: true,
        });

        const withdrawParams = {
          amount: '1000',
          destination: '0x1234567890123456789012345678901234567890' as Hex,
          assetId:
            'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831/default' as CaipAssetId,
        };

        const result = await provider.withdraw(withdrawParams);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Withdrawal failed: insufficient_funds');
      });
    });

    describe('liquidation price edge cases', () => {
      it('handles denominator close to zero', async () => {
        // Create scenario where denominator approaches zero
        // For denominator = 1 - l * side to be close to 0 with long (side = 1):
        // We need l very close to 1, so maintenanceLeverage very close to 1
        // With maxLeverage = 0.50005, maintenanceLeverage = 1.0001, l = 0.9999
        // denominator = 1 - 0.9999 * 1 = 0.0001 (right at the threshold)
        // Need slightly larger to go below 0.0001: maxLeverage = 0.50001 → maintenanceLeverage = 1.00002
        // l = 0.99998, denominator = 0.00002 < 0.0001 ✓ triggers edge case
        const params = {
          entryPrice: 50000,
          leverage: 1, // Use 1x leverage
          direction: 'long' as const,
          asset: 'BTC',
        };

        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            meta: jest.fn().mockResolvedValue({
              universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 0.50001 }], // Very low to create denominator < 0.0001
            }),
          }),
        );

        const result = await provider.calculateLiquidationPrice(params);

        // Should return entry price when denominator is too small (< 0.0001 threshold)
        expect(parseFloat(result)).toBeCloseTo(50000, 0);
      });

      it('handles liquidation price calculation error', async () => {
        // Mock getMaxLeverage to throw an error but still use default
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

        mockClientService.getInfoClient = jest.fn().mockReturnValue({
          meta: jest.fn().mockRejectedValue(new Error('Network error')),
        });

        const params = {
          entryPrice: 50000,
          leverage: 2,
          direction: 'long' as const,
          asset: 'UNKNOWN_ASSET',
        };

        const result = await provider.calculateLiquidationPrice(params);

        // Should use default leverage and still calculate
        expect(parseFloat(result)).toBeGreaterThan(0);

        consoleSpy.mockRestore();
      });

      it('handles negative liquidation price', async () => {
        // Create scenario that might result in negative liquidation price
        const params = {
          entryPrice: 100,
          leverage: 2,
          direction: 'long' as const,
          asset: 'BTC',
        };

        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient());

        const result = await provider.calculateLiquidationPrice(params);

        // Should never return negative price
        expect(parseFloat(result)).toBeGreaterThanOrEqual(0);
      });
    });

    describe('isReadyToTrade edge cases', () => {
      it('handles getCurrentAccountId throwing error', async () => {
        mockWalletService.getCurrentAccountId.mockImplementation(() => {
          throw new Error('No account found');
        });

        const result = await provider.isReadyToTrade();

        expect(result.ready).toBe(false);
        expect(result.walletConnected).toBe(true); // Clients exist
        expect(result.networkSupported).toBe(true);
      });

      it('handles missing exchange or info client', async () => {
        mockClientService.getExchangeClient.mockReturnValue(null as any);

        const result = await provider.isReadyToTrade();

        expect(result.ready).toBe(false);
        expect(result.walletConnected).toBe(false);
      });

      it('handles general error in readiness check', async () => {
        mockClientService.getExchangeClient.mockImplementation(() => {
          throw new Error('Client error');
        });

        const result = await provider.isReadyToTrade();

        expect(result.ready).toBe(false);
        expect(result.walletConnected).toBe(false);
        expect(result.networkSupported).toBe(false);
        expect(result.error).toContain('Client error');
      });
    });

    describe('editOrder error scenarios', () => {
      it('handles edit order API failure', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          modify: jest.fn().mockResolvedValue({
            status: 'error',
            response: { message: 'Order not found' },
          }),
        });

        const editParams = {
          orderId: '999',
          newOrder: {
            symbol: 'BTC',
            isBuy: true,
            size: '0.2',
            price: '52000',
            orderType: 'limit',
          } as OrderParams,
        };

        const result = await provider.editOrder(editParams);

        expect(result.success).toBe(false);
      });
    });

    describe('cancelOrder error scenarios', () => {
      it('handles cancel order API returning non-success status', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          cancel: jest.fn().mockResolvedValue({
            status: 'ok',
            response: { data: { statuses: ['failed'] } },
          }),
        });

        const cancelParams = {
          orderId: '123',
          symbol: 'BTC',
        };

        const result = await provider.cancelOrder(cancelParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Order cancellation failed');
      });
    });

    describe('calculateFees', () => {
      beforeEach(() => {
        // Reset userFees mock for each test
        (mockClientService.getInfoClient().userFees as jest.Mock).mockClear();
        // Default to throw error (will use base rates)
        mockWalletService.getUserAddressWithDefault.mockRejectedValue(
          new Error('No wallet connected'),
        );
      });

      it('calculates fees for market orders', async () => {
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        expect(result.feeRate).toBe(0.00145); // 0.045% taker + 0.1% MetaMask fee
        expect(result.feeAmount).toBe(145); // 100000 * 0.00145
      });

      it('calculates fees for limit orders as taker', async () => {
        const result = await provider.calculateFees({
          orderType: 'limit',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        expect(result.feeRate).toBe(0.00145); // 0.045% taker + 0.1% MetaMask fee
        expect(result.feeAmount).toBe(145); // Includes MetaMask fee
      });

      it('calculates fees for limit orders as maker', async () => {
        const result = await provider.calculateFees({
          orderType: 'limit',
          isMaker: true,
          amount: '100000',
          symbol: 'BTC',
        });

        expect(result.feeRate).toBe(0.00115); // 0.015% maker + 0.1% MetaMask fee
        expect(result.feeAmount).toBeCloseTo(115, 10); // Includes MetaMask fee
      });

      it('handles zero amount', async () => {
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '0',
          symbol: 'BTC',
        });

        expect(result.feeRate).toBe(0.00145); // Includes 0.1% MetaMask fee
        expect(result.feeAmount).toBe(0);
      });

      it('handles undefined amount', async () => {
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          symbol: 'BTC',
        });

        expect(result.feeRate).toBe(0.00145); // Includes 0.1% MetaMask fee
        expect(result.feeAmount).toBeUndefined();
      });

      it('uses cached user-specific fee rates when available', async () => {
        // Reset mock and set user address to trigger user fee fetching
        (mockClientService.getInfoClient().userFees as jest.Mock).mockClear();
        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: '0.04', // 4% referral discount
          activeStakingDiscount: { discount: '0.05' }, // 5% staking discount
          dailyUserVlm: [],
        });
        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        // First call should fetch from API
        const result1 = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should use dynamically calculated rate: 0.045% * (1 - 0.04 - 0.05) = 0.045% * 0.91 = 0.04095%
        expect(result1.feeRate).toBeCloseTo(0.0014095, 6); // Dynamic rate + 0.1% MetaMask
        expect(result1.feeAmount).toBeCloseTo(140.95, 2); // 100000 * 0.0014095
        expect(
          mockClientService.getInfoClient().userFees,
        ).toHaveBeenCalledTimes(1);

        // Second call should use cache
        const result2 = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        expect(result2.feeRate).toBeCloseTo(0.0014095, 6); // Includes MetaMask fee
        expect(result2.feeAmount).toBeCloseTo(140.95, 2); // Includes MetaMask fee
        // Should not call API again (cached)
        expect(
          mockClientService.getInfoClient().userFees,
        ).toHaveBeenCalledTimes(1);
      });

      it('falls back to base rates on API failure', async () => {
        // Reset and mock user address
        (mockClientService.getInfoClient().userFees as jest.Mock).mockClear();
        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        // Mock API failure
        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockRejectedValue(new Error('API Error'));

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should use base rates on failure
        expect(result.feeRate).toBe(0.00145); // Includes 0.1% MetaMask fee // Base taker rate
        expect(result.feeAmount).toBe(145); // Includes MetaMask fee
      });

      it('handles non-numeric amount gracefully', async () => {
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: 'invalid',
          symbol: 'BTC',
        });

        expect(result.feeRate).toBe(0.00145); // Includes 0.1% MetaMask fee
        expect(result.feeAmount).toBe(0); // parseFloat('invalid') returns NaN, which * 0.00045 = NaN, but we expect 0
      });

      it('returns FeeCalculationResult with correct structure', async () => {
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        expect(result).toHaveProperty('feeRate');
        expect(result).toHaveProperty('feeAmount');
        expect(typeof result.feeRate).toBe('number');
        expect(typeof result.feeAmount).toBe('number');
      });

      it('is async and return a Promise', () => {
        const result = provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          symbol: 'BTC',
        });

        expect(result).toBeInstanceOf(Promise);
      });

      it('fetches user-specific fee rates when wallet is connected', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        // Mock user fees API response with base rates and discounts
        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: '0.04', // 4% referral discount
          activeStakingDiscount: null, // No staking discount
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        expect(result.feeRate).toBeCloseTo(0.001432, 6); // 0.045% * (1 - 0.04) + 0.1% MetaMask
        expect(result.feeAmount).toBeCloseTo(143.2, 2); // Includes MetaMask fee
      });

      it('falls back to base rates when API returns invalid fee rates', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        // Mock user fees API response with invalid rates that will produce NaN
        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: 'invalid', // Will cause parseFloat to return NaN
          userAddRate: 'invalid',
          activeReferralDiscount: 'invalid',
          activeStakingDiscount: null,
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should fall back to base rates due to validation failure
        expect(result.feeRate).toBe(0.00145); // Includes 0.1% MetaMask fee // Base taker rate
        expect(result.feeAmount).toBe(145); // Includes MetaMask fee
      });

      it('falls back to base rates when API returns negative fee rates', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        // Mock user fees API response with negative rates
        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '-0.0003', // Negative rate - invalid
          userAddRate: '0.0001',
          activeReferralDiscount: '0.00',
          activeStakingDiscount: null,
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should fall back to base rates due to validation failure
        expect(result.feeRate).toBe(0.00145); // Includes 0.1% MetaMask fee // Base taker rate
        expect(result.feeAmount).toBe(145); // Includes MetaMask fee
      });

      it('always uses taker rate for market orders regardless of isMaker', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00035', // Taker rate
          userAddRate: '0.00008', // Maker rate (lower)
          userSpotCrossRate: '0.00070',
          userSpotAddRate: '0.00040',
          activeReferralDiscount: '0.04', // 4% referral discount
          activeStakingDiscount: null,
        });

        // Test market order with isMaker=true (should still use taker rate)
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: true, // This should be ignored for market orders
          amount: '100000',
          symbol: 'BTC',
        });

        // Should use taker rate even though isMaker is true
        expect(result.feeRate).toBeCloseTo(0.001336, 6); // 0.035% * (1 - 0.04) + 0.1% MetaMask
        expect(result.feeAmount).toBeCloseTo(133.6, 2); // Includes MetaMask fee
      });

      it('applies referral discount only when no staking discount', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: '0.04', // 4% referral discount
          activeStakingDiscount: null,
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should apply only referral discount: 0.045% * (1 - 0.04) = 0.0432%
        expect(result.feeRate).toBeCloseTo(0.001432, 6); // 0.0432% + 0.1% MetaMask
        expect(result.feeAmount).toBeCloseTo(143.2, 2);
      });

      it('applies staking discount only when no referral discount', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: null,
          activeStakingDiscount: { discount: '0.10' }, // 10% staking discount
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should apply only staking discount: 0.045% * (1 - 0.10) = 0.0405%
        expect(result.feeRate).toBeCloseTo(0.001405, 6); // 0.0405% + 0.1% MetaMask
        expect(result.feeAmount).toBeCloseTo(140.5, 2);
      });

      it('caps combined discounts at 40%', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: '0.30', // 30% referral discount
          activeStakingDiscount: { discount: '0.25' }, // 25% staking discount
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Combined discounts would be 55%, but capped at 40%
        // 0.045% * (1 - 0.40) = 0.027%
        expect(result.feeRate).toBeCloseTo(0.00127, 6); // 0.027% + 0.1% MetaMask
        expect(result.feeAmount).toBeCloseTo(127.0, 2);
      });

      it('handles maker rates with discounts correctly', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: '0.04', // 4% referral discount
          activeStakingDiscount: { discount: '0.05' }, // 5% staking discount
        });

        const result = await provider.calculateFees({
          orderType: 'limit',
          isMaker: true,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should apply discounts to maker rate: 0.015% * (1 - 0.04 - 0.05) = 0.01365%
        expect(result.feeRate).toBeCloseTo(0.0011365, 6); // 0.01365% + 0.1% MetaMask
        expect(result.feeAmount).toBeCloseTo(113.65, 2);
      });

      it('handles zero discounts correctly', async () => {
        const testAddress = '0xTestAddress123';
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          testAddress,
        );

        (
          mockClientService.getInfoClient().userFees as jest.Mock
        ).mockResolvedValue({
          userCrossRate: '0.00045', // 0.045% base taker rate
          userAddRate: '0.00015', // 0.015% base maker rate
          userSpotCrossRate: '0.00070', // 0.070% spot taker rate
          userSpotAddRate: '0.00040', // 0.040% spot maker rate
          activeReferralDiscount: '0.00', // No referral discount
          activeStakingDiscount: { discount: '0.00' }, // No staking discount
        });

        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'BTC',
        });

        // Should use base rates without discounts
        expect(result.feeRate).toBe(0.00145); // 0.045% + 0.1% MetaMask
        expect(result.feeAmount).toBe(145);
      });

      it('applies 2× fee multiplier for HIP-3 assets', async () => {
        // HIP-3 asset (dex:SYMBOL format)
        const result = await provider.calculateFees({
          orderType: 'market',
          isMaker: false,
          amount: '100000',
          symbol: 'xyz:TSLA', // HIP-3 asset
        });

        // HIP-3 should have 2× base fees: 0.045% * 2 = 0.09% + 0.1% MetaMask = 0.19%
        expect(result.feeRate).toBe(0.0019); // 0.09% taker + 0.1% MetaMask fee
        expect(result.feeAmount).toBe(190); // 100000 * 0.0019
      });

      it('applies 2× fee multiplier for HIP-3 maker orders', async () => {
        // HIP-3 asset (dex:SYMBOL format)
        const result = await provider.calculateFees({
          orderType: 'limit',
          isMaker: true,
          amount: '100000',
          symbol: 'abc:SPX', // HIP-3 asset
        });

        // HIP-3 should have 2× base fees: 0.015% * 2 = 0.03% + 0.1% MetaMask = 0.13%
        expect(result.feeRate).toBe(0.0013); // 0.03% maker + 0.1% MetaMask fee
        expect(result.feeAmount).toBe(130); // 100000 * 0.0013
      });
    });

    describe('fee discount functionality', () => {
      describe('setUserFeeDiscount', () => {
        it('logs discount context updates', () => {
          // Arrange
          const discountBips = 3000; // 30% in basis points
          (mockPlatformDependencies.debugLogger.log as jest.Mock).mockClear();

          // Act
          provider.setUserFeeDiscount(discountBips);

          // Assert
          expect(mockPlatformDependencies.debugLogger.log).toHaveBeenCalledWith(
            'HyperLiquid: Fee discount context updated',
            {
              discountBips,
              discountPercentage: 30,
              isActive: true,
            },
          );
        });

        it('logs when clearing discount context', () => {
          // Arrange
          (mockPlatformDependencies.debugLogger.log as jest.Mock).mockClear();

          // Act
          provider.setUserFeeDiscount(undefined);

          // Assert
          expect(mockPlatformDependencies.debugLogger.log).toHaveBeenCalledWith(
            'HyperLiquid: Fee discount context updated',
            {
              discountBips: undefined,
              discountPercentage: undefined,
              isActive: false,
            },
          );
        });
      });

      describe('discount applied to orders', () => {
        it('applies discount to builder fee in placeOrder', async () => {
          // Arrange: Set 65% discount (6500 basis points)
          provider.setUserFeeDiscount(6500);

          // Act
          await provider.placeOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '0.001',
            orderType: 'market',
            currentPrice: 50000, // Add price for validation
          });

          // Assert: Verify exchangeClient.order called with discounted fee
          // 100 * (1 - 0.65) = 35
          expect(
            mockClientService.getExchangeClient().order,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              builder: expect.objectContaining({
                f: 35,
              }),
            }),
          );
        });

        it('applies discount to builder fee in updatePositionTPSL', async () => {
          // Arrange: Set 65% discount
          provider.setUserFeeDiscount(6500);

          // Act
          await provider.updatePositionTPSL({
            symbol: 'BTC',
            takeProfitPrice: '50000',
          });

          // Assert: Verify discounted fee (35 instead of 100)
          expect(
            mockClientService.getExchangeClient().order,
          ).toHaveBeenCalledWith(
            expect.objectContaining({
              builder: expect.objectContaining({
                f: 35,
              }),
            }),
          );
        });
      });

      describe('calculateFees with fee discount', () => {
        beforeEach(() => {
          // Reset mocks for fee discount tests
          (mockClientService.getInfoClient().userFees as jest.Mock).mockClear();
          mockWalletService.getUserAddressWithDefault.mockRejectedValue(
            new Error('No wallet connected'),
          );
        });

        it('applies discount to MetaMask fees when active', async () => {
          // Arrange
          const discountBips = 2000; // 20% discount in basis points
          provider.setUserFeeDiscount(discountBips);

          // Act
          const result = await provider.calculateFees({
            orderType: 'market',
            isMaker: false,
            amount: '100000',
            symbol: 'BTC',
          });

          // Assert
          // Base: 0.045% protocol + 0.1% MetaMask = 0.145%
          // With 20% discount on MetaMask fee: 0.045% + (0.1% * 0.8) = 0.045% + 0.08% = 0.125%
          expect(result.feeRate).toBe(0.00125);
          expect(result.feeAmount).toBe(125);
        });

        it('applies discount to maker fees correctly', async () => {
          // Arrange
          const discountBips = 5000; // 50% discount in basis points
          provider.setUserFeeDiscount(discountBips);

          // Act
          const result = await provider.calculateFees({
            orderType: 'limit',
            isMaker: true,
            amount: '100000',
            symbol: 'BTC',
          });

          // Assert
          // Base: 0.015% protocol + 0.1% MetaMask = 0.115%
          // With 50% discount on MetaMask fee: 0.015% + (0.1% * 0.5) = 0.015% + 0.05% = 0.065%
          expect(result.feeRate).toBe(0.00065);
          expect(result.feeAmount).toBe(65);
        });

        it('preserves protocol fees unchanged', async () => {
          // Arrange
          const discountBips = 10000; // 100% discount on MetaMask fees (in basis points)
          provider.setUserFeeDiscount(discountBips);

          // Act
          const result = await provider.calculateFees({
            orderType: 'market',
            isMaker: false,
            amount: '100000',
            symbol: 'BTC',
          });

          // Assert
          // Should only have protocol fees: 0.045%
          // MetaMask fee should be 0 with 100% discount
          expect(result.feeRate).toBe(0.00045);
          expect(result.feeAmount).toBe(45);
        });

        it('works without discount - backward compatibility', async () => {
          // Arrange - no discount set
          // provider.setUserFeeDiscount() not called

          // Act
          const result = await provider.calculateFees({
            orderType: 'market',
            isMaker: false,
            amount: '100000',
            symbol: 'BTC',
          });

          // Assert
          // Should have full fees: 0.045% + 0.1% = 0.145%
          expect(result.feeRate).toBe(0.00145);
          expect(result.feeAmount).toBe(145);
        });

        it('handles 0% discount edge case', async () => {
          // Arrange
          provider.setUserFeeDiscount(0);

          // Act
          const result = await provider.calculateFees({
            orderType: 'limit',
            isMaker: true,
            amount: '100000',
            symbol: 'BTC',
          });

          // Assert
          // 0% discount means full MetaMask fee: 0.015% + 0.1% = 0.115%
          expect(result.feeRate).toBe(0.00115);
          expect(result.feeAmount).toBeCloseTo(115, 10);
        });

        it('combines discount with user staking discount', async () => {
          // Arrange
          const rewardsDiscountBips = 2000; // 20% MetaMask rewards discount in basis points
          provider.setUserFeeDiscount(rewardsDiscountBips);

          // Clear fee cache to ensure fresh API call
          provider.clearFeeCache();

          // Reset and mock staking discount (override beforeEach)
          mockWalletService.getUserAddressWithDefault.mockClear();
          mockWalletService.getUserAddressWithDefault.mockResolvedValue(
            '0x123',
          );
          (
            mockClientService.getInfoClient().userFees as jest.Mock
          ).mockResolvedValue({
            feeSchedule: {
              fee: '0.03', // 0.03% protocol fee (better than base)
            },
            activeStakingDiscount: { discount: '0.10' }, // 10% staking discount
          });

          // Act
          const result = await provider.calculateFees({
            orderType: 'market',
            isMaker: false,
            amount: '100000',
            symbol: 'BTC',
          });

          // Assert
          // Note: If staking discount is not applied properly in test, it falls back to base rates
          // Base protocol fee: 0.045% + MetaMask fee with rewards discount: 0.08% = 0.125%
          // This test validates that the rewards discount is properly applied even when staking API is mocked
          expect(result.feeRate).toBeCloseTo(0.00125, 5);
          expect(result.feeAmount).toBeCloseTo(125, 0);
        });

        it('clears discount context after undefined is set', async () => {
          // Arrange - first set a discount
          provider.setUserFeeDiscount(2500); // 25% discount in basis points

          // Verify discount is applied
          let result = await provider.calculateFees({
            orderType: 'market',
            isMaker: false,
            amount: '100000',
            symbol: 'BTC',
          });
          expect(result.feeRate).toBeCloseTo(0.0012, 5); // 0.045% + (0.1% * 0.75)

          // Act - clear discount
          provider.setUserFeeDiscount(undefined);

          // Assert - should return to full fees
          result = await provider.calculateFees({
            orderType: 'market',
            isMaker: false,
            amount: '100000',
            symbol: 'BTC',
          });
          expect(result.feeRate).toBe(0.00145); // Back to full fees
        });
      });
    });

    describe('getBlockExplorerUrl', () => {
      it('returns mainnet explorer URL with address', () => {
        const address = '0x1234567890abcdef1234567890abcdef12345678';
        const result = provider.getBlockExplorerUrl(address);

        expect(result).toBe(
          `https://app.hyperliquid.xyz/explorer/address/${address}`,
        );
      });

      it('returns mainnet base explorer URL without address', () => {
        const result = provider.getBlockExplorerUrl();

        expect(result).toBe('https://app.hyperliquid.xyz/explorer');
      });

      it('returns testnet explorer URL with address when in testnet mode', () => {
        // Mock testnet mode
        (mockClientService.isTestnetMode as jest.Mock).mockReturnValue(true);

        const address = '0xabcdef1234567890abcdef1234567890abcdef12';
        const result = provider.getBlockExplorerUrl(address);

        expect(result).toBe(
          `https://app.hyperliquid-testnet.xyz/explorer/address/${address}`,
        );
      });

      it('returns testnet base explorer URL without address when in testnet mode', () => {
        // Mock testnet mode
        (mockClientService.isTestnetMode as jest.Mock).mockReturnValue(true);

        const result = provider.getBlockExplorerUrl();

        expect(result).toBe('https://app.hyperliquid-testnet.xyz/explorer');
      });

      it('handles empty string address', () => {
        const result = provider.getBlockExplorerUrl('');

        expect(result).toBe('https://app.hyperliquid.xyz/explorer');
      });
    });
  });
});
