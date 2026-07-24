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
  describe('Trading Operations', () => {
    it('places a market order successfully', async () => {
      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('123');

      // Verify market orders use FrontendMarket (HyperLiquid standard for market execution)
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [
            expect.objectContaining({
              t: { limit: { tif: 'FrontendMarket' } },
            }),
          ],
        }),
      );

      // The result echoes back the final normalized size that was submitted to
      // the exchange (the main order's `s`), so callers can classify partial
      // fills against the real submitted size rather than the pre-normalization
      // request.
      const orderCall = (
        mockClientService.getExchangeClient().order as jest.Mock
      ).mock.calls[0][0];
      expect(result.submittedSize).toBe(orderCall.orders[0].s);
    });

    it('places a limit order successfully', async () => {
      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        price: '51000',
        orderType: 'limit',
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);

      // Verify limit orders use Gtc (standard limit order behavior)
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [
            expect.objectContaining({
              t: { limit: { tif: 'Gtc' } },
            }),
          ],
        }),
      );
    });

    it('uses Gtc TIF for limit orders (regression test)', async () => {
      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        price: '51000',
        orderType: 'limit',
      };

      await provider.placeOrder(orderParams);

      // Verify that the order was called with Gtc TIF for limit orders
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [
            expect.objectContaining({
              a: 0, // BTC asset ID
              b: true, // isBuy
              t: { limit: { tif: 'Gtc' } }, // Limit orders use Gtc TIF
            }),
          ],
        }),
      );
    });

    it('tracks performance measurements when placing order', async () => {
      const orderParams: OrderParams = {
        symbol: 'ETH',
        isBuy: true,
        size: '1.0',
        orderType: 'market',
        leverage: 10,
        currentPrice: 3000, // ETH price for USD calculation
      };

      await provider.placeOrder(orderParams);
    });

    it('calculates USD position size correctly for market orders', async () => {
      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.5', // 0.5 BTC
        orderType: 'market',
        currentPrice: 45000, // BTC at $45,000
      };

      await provider.placeOrder(orderParams);
    });

    it('calculates USD position size correctly for limit orders', async () => {
      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.2', // 0.2 BTC
        orderType: 'limit',
        price: '44000', // Limit price at $44,000
        currentPrice: 45000, // Current price (not used for USD calculation in limit orders)
      };

      await provider.placeOrder(orderParams);
    });

    it('handles order placement errors', async () => {
      (
        mockClientService.getExchangeClient().order as jest.Mock
      ).mockResolvedValueOnce({
        status: 'error',
        response: { message: 'Order failed' },
      });

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(false);
    });

    it('edits an order successfully', async () => {
      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.2',
          price: '52000',
          orderType: 'limit',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(true);

      // Verify limit orders use Gtc TIF in edit operations
      expect(mockClientService.getExchangeClient().modify).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            t: { limit: { tif: 'Gtc' } },
          }),
        }),
      );
    });

    it('edits a market order with slippage calculation', async () => {
      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          slippage: 0.02, // 2% slippage
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(true);
      // Price is fetched from WebSocket cache (getCachedPrice) or REST API (allMids) as fallback

      // Verify market orders use FrontendMarket TIF in edit operations
      expect(mockClientService.getExchangeClient().modify).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            t: { limit: { tif: 'FrontendMarket' } },
          }),
        }),
      );
    });

    it('handles editOrder when asset is not found', async () => {
      (
        mockClientService.getInfoClient().meta as jest.Mock
      ).mockResolvedValueOnce({
        universe: [], // Empty universe - asset not found
      });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'UNKNOWN',
          isBuy: true,
          size: '0.1',
          orderType: 'limit',
          price: '50000',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Asset UNKNOWN not found');
    });

    it('handles editOrder when no price is available', async () => {
      // Mock both WebSocket cache and REST API to return no price
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce(undefined);
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({}); // Empty price data

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid price for BTC');
    });

    it('falls back to REST API when cached price is zero', async () => {
      // Mock WebSocket cache to return "0" (invalid price)
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce('0');
      // Mock REST API to return valid price
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({ BTC: '50000' });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      // Should succeed because it fell back to REST API
      expect(result.success).toBe(true);
      // Verify REST API was called as fallback
      expect(mockClientService.getInfoClient().allMids).toHaveBeenCalled();
    });

    it('falls back to REST API when cached price is NaN', async () => {
      // Mock WebSocket cache to return invalid string
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce('invalid');
      // Mock REST API to return valid price
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({ BTC: '50000' });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      // Should succeed because it fell back to REST API
      expect(result.success).toBe(true);
      // Verify REST API was called as fallback
      expect(mockClientService.getInfoClient().allMids).toHaveBeenCalled();
    });

    it('falls back to REST API when cached price is negative', async () => {
      // Mock WebSocket cache to return negative price (invalid for crypto)
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce('-100');
      // Mock REST API to return valid price
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({ BTC: '50000' });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      // Should succeed because it fell back to REST API
      expect(result.success).toBe(true);
      // Verify REST API was called as fallback
      expect(mockClientService.getInfoClient().allMids).toHaveBeenCalled();
    });

    it('falls back to REST API when cached price is Infinity', async () => {
      // Mock WebSocket cache to return Infinity (invalid price)
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce('Infinity');
      // Mock REST API to return valid price
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({ BTC: '50000' });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      // Should succeed because it fell back to REST API
      expect(result.success).toBe(true);
      // Verify REST API was called as fallback
      expect(mockClientService.getInfoClient().allMids).toHaveBeenCalled();
    });

    it('throws error when REST price is negative', async () => {
      // Mock WebSocket cache miss
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce(undefined);
      // Mock REST API to return negative price
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({ BTC: '-50000' });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid price for BTC');
    });

    it('throws error when REST price is Infinity', async () => {
      // Mock WebSocket cache miss
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce(undefined);
      // Mock REST API to return Infinity
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({ BTC: 'Infinity' });

      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid price for BTC');
    });

    it('handles editOrder when asset ID is not found', async () => {
      const editParams = {
        orderId: '123',
        newOrder: {
          symbol: 'UNKNOWN_ASSET',
          isBuy: true,
          size: '0.1',
          orderType: 'limit',
          price: '50000',
        } as OrderParams,
      };

      const result = await provider.editOrder(editParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('UNKNOWN_ASSET not found');
    });

    it('cancels an order successfully', async () => {
      const cancelParams = {
        orderId: '123',
        symbol: 'BTC',
      };

      const result = await provider.cancelOrder(cancelParams);

      expect(result.success).toBe(true);
    });

    it('retries USD-based order when rejected for $10 minimum with adjusted amount', async () => {
      // Create provider with PUMP in the asset mapping
      provider = createTestProvider({
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
          ['PUMP', 2],
        ],
      });

      const pumpUniverse = [
        { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
        { name: 'PUMP', szDecimals: 2, maxLeverage: 20 },
      ];
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({ universe: pumpUniverse }),
          metaAndAssetCtxs: jest.fn().mockResolvedValue([
            { universe: pumpUniverse },
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
              {
                funding: '0.0001',
                openInterest: '100',
                prevDayPx: '0.003',
                dayNtlVlm: '10000',
                markPx: '0.003918',
                midPx: '0.003918',
                oraclePx: '0.003918',
              },
            ],
          ]),
          allMids: jest
            .fn()
            .mockResolvedValue({ BTC: '50000', ETH: '3000', PUMP: '0.003918' }),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'PUMP',
        isBuy: true,
        size: '2553',
        orderType: 'market',
        usdAmount: '10.00',
        currentPrice: 0.003918,
      };

      mockClientService.getExchangeClient = jest.fn().mockReturnValue({
        ...createMockExchangeClient(),
        order: jest
          .fn()
          .mockRejectedValueOnce(
            new Error('Order must have minimum value of $10'),
          )
          .mockResolvedValueOnce({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 456 } }] } },
          }),
      });

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledTimes(
        2,
      );
    });

    it('retries size-based order with currentPrice when rejected for $10 minimum', async () => {
      // Create provider with PUMP in the asset mapping
      provider = createTestProvider({
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
          ['PUMP', 2],
        ],
      });

      const pumpUniverse = [
        { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
        { name: 'PUMP', szDecimals: 2, maxLeverage: 20 },
      ];
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({ universe: pumpUniverse }),
          metaAndAssetCtxs: jest.fn().mockResolvedValue([
            { universe: pumpUniverse },
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
              {
                funding: '0.0001',
                openInterest: '100',
                prevDayPx: '0.003',
                dayNtlVlm: '10000',
                markPx: '0.003918',
                midPx: '0.003918',
                oraclePx: '0.003918',
              },
            ],
          ]),
          allMids: jest
            .fn()
            .mockResolvedValue({ BTC: '50000', ETH: '3000', PUMP: '0.003918' }),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'PUMP',
        isBuy: true,
        size: '2553',
        orderType: 'market',
        currentPrice: 0.003918,
      };

      mockClientService.getExchangeClient = jest.fn().mockReturnValue({
        ...createMockExchangeClient(),
        order: jest
          .fn()
          .mockRejectedValueOnce(
            new Error('Order 0: Order must have minimum value'),
          )
          .mockResolvedValueOnce({
            status: 'ok',
            response: { data: { statuses: [{ resting: { oid: 789 } }] } },
          }),
      });

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);
      const orderMock = mockClientService.getExchangeClient()
        .order as jest.Mock;
      expect(orderMock).toHaveBeenCalledTimes(2);

      // submittedSize must reflect the retried (second) submission — the size
      // the exchange actually accepted after the $10-minimum bump — not the
      // first rejected attempt, so partial-fill classification uses the real
      // submitted size.
      const firstSubmittedSize = orderMock.mock.calls[0][0].orders[0].s;
      const secondSubmittedSize = orderMock.mock.calls[1][0].orders[0].s;
      expect(secondSubmittedSize).not.toBe(firstSubmittedSize);
      expect(result.submittedSize).toBe(secondSubmittedSize);
    });

    it('retries with adjusted USD when price-less order hits $10 minimum (uses fetched price from allMids)', async () => {
      // Create provider with PUMP in the asset mapping
      provider = createTestProvider({
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
          ['PUMP', 2],
        ],
      });

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          meta: jest.fn().mockResolvedValue({
            universe: [
              { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
              { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
              { name: 'PUMP', szDecimals: 2, maxLeverage: 20 },
            ],
          }),
          allMids: jest
            .fn()
            .mockResolvedValue({ BTC: '50000', ETH: '3000', PUMP: '0.003918' }),
        }),
      );

      const orderParams: OrderParams = {
        symbol: 'PUMP',
        isBuy: true,
        size: '2553',
        orderType: 'market',
        // No currentPrice: provider fetches live price (0.003918) and uses it
        // for both validation and the $10-minimum retry path.
      };

      const mockOrder = jest
        .fn()
        .mockRejectedValueOnce(
          new Error('Order must have minimum value of $10'),
        )
        .mockResolvedValueOnce({
          status: 'ok',
          response: {
            data: {
              statuses: [
                { filled: { oid: 123, totalSz: '2553', avgPx: '0.004' } },
              ],
            },
          },
        });

      mockClientService.getExchangeClient = jest.fn().mockReturnValue({
        ...createMockExchangeClient(),
        order: mockOrder,
      });

      const result = await provider.placeOrder(orderParams);

      // The live price is fetched → validation passes → order is submitted →
      // first call hits $10 minimum → retry uses fetched price to compute
      // adjusted usdAmount → second call succeeds.
      expect(result.success).toBe(true);
      expect(mockOrder).toHaveBeenCalledTimes(2);
    });

    it('closes a position successfully', async () => {
      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(true);
    });

    it('repairs missing HIP-3 asset IDs during closePosition after degraded discovery', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: true,
      });
      const mockOrder = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 123 } }] } },
      });
      const mockInfoClient = createMockInfoClient({
        perpDexs: jest
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
        metaAndAssetCtxs: jest
          .fn()
          .mockImplementation((params?: { dex?: string }) => {
            if (params?.dex === 'xyz') {
              return Promise.reject(
                new Error('Transient xyz discovery failure'),
              );
            }

            return Promise.resolve([
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
            ]);
          }),
        meta: jest.fn().mockImplementation((params?: { dex?: string }) => {
          if (params?.dex === 'xyz') {
            return Promise.resolve({
              universe: [
                { name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 },
              ],
              // USDC collateral (matches default spotMeta USDC at index 0
              // below) so this asset-ID-repair test isn't gated by the
              // (fail-closed) USDC collateral check.
              collateralToken: 0,
            });
          }

          return Promise.resolve({
            universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
          });
        }),
        allMids: jest.fn().mockImplementation((params?: { dex?: string }) => {
          if (params?.dex === 'xyz') {
            return Promise.resolve({ 'xyz:STOCK1': '100' });
          }

          return Promise.resolve({ BTC: '50000' });
        }),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient({ order: mockOrder }));

      const result = await hip3Provider.closePosition({
        symbol: 'xyz:STOCK1',
        orderType: 'market',
        position: {
          symbol: 'xyz:STOCK1',
          size: '10',
          entryPrice: '95',
          positionValue: '1000',
          unrealizedPnl: '50',
          marginUsed: '100',
          leverage: { type: 'isolated', value: 5 },
          liquidationPrice: '70',
          maxLeverage: 20,
          returnOnEquity: '10',
          cumulativeFunding: {
            allTime: '0',
            sinceOpen: '0',
            sinceChange: '0',
          },
          takeProfitCount: 0,
          stopLossCount: 0,
        },
      });

      expect(result.success).toBe(true);
      expect(mockOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [expect.objectContaining({ a: 110000, r: true })],
        }),
      );
    });

    it('rejects placeOrder for a HIP-3 DEX whose collateral token is not USDC (TAT-3304)', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: true,
      });
      const mockOrder = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 123 } }] } },
      });
      const xyzMeta = {
        universe: [{ name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 }],
        collateralToken: 5,
      };
      const xyzAssetCtxs = [
        {
          funding: '0.0001',
          openInterest: '1000',
          prevDayPx: '95',
          dayNtlVlm: '100000',
          markPx: '100',
          midPx: '100',
          oraclePx: '100',
        },
      ];
      const mockInfoClient = createMockInfoClient({
        perpDexs: jest
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
        meta: jest.fn().mockImplementation((params?: { dex?: string }) =>
          params?.dex === 'xyz'
            ? Promise.resolve(xyzMeta)
            : Promise.resolve({
                universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
              }),
        ),
        metaAndAssetCtxs: jest
          .fn()
          .mockImplementation((params?: { dex?: string }) => {
            if (params?.dex === 'xyz') {
              return Promise.resolve([xyzMeta, xyzAssetCtxs]);
            }

            return Promise.resolve([
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
            ]);
          }),
        spotMeta: jest.fn().mockResolvedValue({
          tokens: [
            { name: 'USDC', tokenId: '0xdef456', index: 0 },
            { name: 'USDH', tokenId: '0xabc123', index: 5 },
          ],
          universe: [],
        }),
        allMids: jest.fn().mockImplementation((params?: { dex?: string }) => {
          if (params?.dex === 'xyz') {
            return Promise.resolve({ 'xyz:STOCK1': '100' });
          }

          return Promise.resolve({ BTC: '50000' });
        }),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient({ order: mockOrder }));

      const result = await hip3Provider.placeOrder({
        symbol: 'xyz:STOCK1',
        isBuy: true,
        size: '10',
        orderType: 'market',
        currentPrice: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.UNSUPPORTED_COLLATERAL);
      expect(mockOrder).not.toHaveBeenCalled();
    });

    it('rejects placeOrder for a HIP-3 DEX whose collateral token index cannot be resolved against spot metadata', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        useUnifiedAccount: true,
      });
      const mockOrder = jest.fn().mockResolvedValue({
        status: 'ok',
        response: { data: { statuses: [{ resting: { oid: 123 } }] } },
      });
      // collateralToken index 7 has no corresponding entry in spotMeta.tokens
      // below (missing/stale spot metadata) — the order must be rejected
      // rather than treated as USDC-collateralized.
      const xyzMeta = {
        universe: [{ name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 }],
        collateralToken: 7,
      };
      const xyzAssetCtxs = [
        {
          funding: '0.0001',
          openInterest: '1000',
          prevDayPx: '95',
          dayNtlVlm: '100000',
          markPx: '100',
          midPx: '100',
          oraclePx: '100',
        },
      ];
      const mockInfoClient = createMockInfoClient({
        perpDexs: jest
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
        meta: jest.fn().mockImplementation((params?: { dex?: string }) =>
          params?.dex === 'xyz'
            ? Promise.resolve(xyzMeta)
            : Promise.resolve({
                universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
              }),
        ),
        metaAndAssetCtxs: jest
          .fn()
          .mockImplementation((params?: { dex?: string }) => {
            if (params?.dex === 'xyz') {
              return Promise.resolve([xyzMeta, xyzAssetCtxs]);
            }

            return Promise.resolve([
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
            ]);
          }),
        spotMeta: jest.fn().mockResolvedValue({
          tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
          universe: [],
        }),
        allMids: jest.fn().mockImplementation((params?: { dex?: string }) => {
          if (params?.dex === 'xyz') {
            return Promise.resolve({ 'xyz:STOCK1': '100' });
          }

          return Promise.resolve({ BTC: '50000' });
        }),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient({ order: mockOrder }));

      const result = await hip3Provider.placeOrder({
        symbol: 'xyz:STOCK1',
        isBuy: true,
        size: '10',
        orderType: 'market',
        currentPrice: 100,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.UNSUPPORTED_COLLATERAL);
      expect(mockOrder).not.toHaveBeenCalled();
    });
  });

  describe('closePosition with TP/SL handling', () => {
    beforeEach(() => {
      // Clear debugLogger mock to capture logs for this test suite
      (mockPlatformDependencies.debugLogger.log as jest.Mock).mockClear();
    });

    it('closes position without TP/SL successfully', async () => {
      // Position without TP/SL - using factory for standard BTC position
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(createMockInfoClient());

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(true);
      // No TP/SL logging expected since we removed this functionality
    });

    it('handles position with TP/SL successfully', async () => {
      // Mock position with TP/SL
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
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
        frontendOpenOrders: jest
          .fn()
          .mockResolvedValueOnce([
            // First call for getPositions
            {
              coin: 'BTC',
              oid: 1001,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Take Profit Market',
              triggerPx: '55000',
              isPositionTpsl: true,
            },
            {
              coin: 'BTC',
              oid: 1002,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Stop Market',
              triggerPx: '45000',
              isPositionTpsl: true,
            },
          ])
          .mockResolvedValueOnce([
            // Second call for closePosition TP/SL check
            {
              coin: 'BTC',
              oid: 1001,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Take Profit Market',
              triggerPx: '55000',
              isPositionTpsl: true,
              side: 'A',
            },
            {
              coin: 'BTC',
              oid: 1002,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Stop Market',
              triggerPx: '45000',
              isPositionTpsl: true,
              side: 'B',
            },
          ]),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
        }),
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
        perpDexs: jest.fn().mockResolvedValue([null]),
        allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
        referral: jest.fn().mockResolvedValue({
          referrerState: {
            stage: 'ready',
            data: { code: 'MMCSI' },
          },
        }),
        maxBuilderFee: jest.fn().mockResolvedValue(1),
      });

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(true);

      // TP/SL orders are automatically handled by Hyperliquid
      // No additional logging needed
    });

    it('handles partial position close with TP/SL', async () => {
      // Mock position with TP/SL
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: {
            totalMarginUsed: '500',
            accountValue: '10500',
          },
          withdrawable: '9500',
          assetPositions: [
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
                cumFunding: {
                  allTime: '5',
                  sinceOpen: '2',
                  sinceChange: '1',
                },
              },
              type: 'oneWay',
            },
          ],
        }),
        frontendOpenOrders: jest
          .fn()
          .mockResolvedValueOnce([
            // First call for getPositions
            {
              coin: 'ETH',
              oid: 2001,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Take Profit Limit',
              triggerPx: '3500',
              limitPx: '3490',
              isPositionTpsl: true,
            },
          ])
          .mockResolvedValueOnce([
            // Second call for closePosition TP/SL check
            {
              coin: 'ETH',
              oid: 2001,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Take Profit Limit',
              triggerPx: '3500',
              limitPx: '3490',
              isPositionTpsl: true,
              side: 'A',
            },
          ]),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }],
        }),
        metaAndAssetCtxs: jest.fn().mockResolvedValue([
          { universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 50 }] },
          [
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
        allMids: jest.fn().mockResolvedValue({ ETH: '3000' }),
        referral: jest.fn().mockResolvedValue({
          referrerState: {
            stage: 'ready',
            data: { code: 'MMCSI' },
          },
        }),
        maxBuilderFee: jest.fn().mockResolvedValue(1),
      });

      const closeParams: ClosePositionParams = {
        symbol: 'ETH',
        size: '0.5', // Partial close
        orderType: 'limit',
        price: '3100',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(true);

      // Verify partial close size is used (with HyperLiquid's short property names)
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [
            expect.objectContaining({
              s: '0.5', // 's' is the short form for 'sz' (size)
              r: true, // 'r' is the short form for 'reduceOnly'
            }),
          ],
        }),
      );

      // TP/SL orders are automatically handled by Hyperliquid for partial closes too
    });

    it('handles position without open TP/SL orders', async () => {
      // Position exists but no open TP/SL orders
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(createMockInfoClient());

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(true);

      // Should not log TP/SL related messages
      expect(mockPlatformDependencies.debugLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Found open TP/SL orders'),
        expect.any(Object),
      );
    });

    it('handles close position when position not found', async () => {
      // Override to have NO positions (empty array)
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: { totalMarginUsed: '0', accountValue: '10000' },
            withdrawable: '10000',
            assetPositions: [], // No positions
            crossMarginSummary: { accountValue: '10000', totalMarginUsed: '0' },
          }),
        }),
      );

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No position found for BTC');
    });

    it('handles short position close with TP/SL', async () => {
      // Mock short position with TP/SL
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
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
                szi: '-0.1', // Short position
                entryPx: '50000',
                positionValue: '5000',
                unrealizedPnl: '-100',
                marginUsed: '500',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '55000',
                maxLeverage: 50,
                returnOnEquity: '-20',
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
        frontendOpenOrders: jest
          .fn()
          .mockResolvedValueOnce([
            // First call for getPositions - short position TP/SL
            {
              coin: 'BTC',
              oid: 3001,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Take Profit Market',
              triggerPx: '45000', // TP below entry for short
              isPositionTpsl: true,
            },
            {
              coin: 'BTC',
              oid: 3002,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Stop Market',
              triggerPx: '55000', // SL above entry for short
              isPositionTpsl: true,
            },
          ])
          .mockResolvedValueOnce([
            // Second call for closePosition TP/SL check
            {
              coin: 'BTC',
              oid: 3001,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Take Profit Market',
              triggerPx: '45000',
              isPositionTpsl: true,
              side: 'B',
            },
            {
              coin: 'BTC',
              oid: 3002,
              reduceOnly: true,
              isTrigger: true,
              orderType: 'Stop Market',
              triggerPx: '55000',
              isPositionTpsl: true,
              side: 'A',
            },
          ]),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
        }),
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
        perpDexs: jest.fn().mockResolvedValue([null]),
        allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
        referral: jest.fn().mockResolvedValue({
          referrerState: {
            stage: 'ready',
            data: { code: 'MMCSI' },
          },
        }),
        maxBuilderFee: jest.fn().mockResolvedValue(1),
      });

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(true);

      // Verify buy order is placed to close short (with HyperLiquid's short property names)
      expect(mockClientService.getExchangeClient().order).toHaveBeenCalledWith(
        expect.objectContaining({
          orders: [
            expect.objectContaining({
              b: true, // 'b' is the short form for 'isBuy' (Buy to close short)
              s: '0.1', // 's' is the short form for 'sz' (size)
              r: true, // 'r' is the short form for 'reduceOnly'
            }),
          ],
        }),
      );

      // TP/SL orders are automatically handled by Hyperliquid for short positions too
    });

    it('handles position close even if TP/SL info is unavailable', async () => {
      // Mock position exists with TP/SL in positions call
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
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
        frontendOpenOrders: jest.fn().mockResolvedValueOnce([
          // First call for getPositions with TP/SL
          {
            coin: 'BTC',
            oid: 1001,
            reduceOnly: true,
            isTrigger: true,
            orderType: 'Take Profit Market',
            triggerPx: '55000',
            isPositionTpsl: true,
          },
        ]),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
        }),
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
        perpDexs: jest.fn().mockResolvedValue([null]),
        allMids: jest.fn().mockResolvedValue({ BTC: '50000' }),
        referral: jest.fn().mockResolvedValue({
          referrerState: {
            stage: 'ready',
            data: { code: 'MMCSI' },
          },
        }),
        maxBuilderFee: jest.fn().mockResolvedValue(1),
      });

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      // Should succeed - TP/SL handling is automatic by Hyperliquid
      expect(result.success).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    describe('cancelOrders', () => {
      it('returns failure when no orders provided', async () => {
        const result = await provider.cancelOrders([]);

        expect(result.success).toBe(false);
        expect(result.successCount).toBe(0);
        expect(result.failureCount).toBe(0);
        expect(result.results).toEqual([]);
      });

      it('cancels multiple orders successfully', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            cancel: jest.fn().mockResolvedValue({
              response: {
                data: {
                  statuses: ['success', 'success'],
                },
              },
            }),
          }),
        );

        const params = [
          { orderId: '123', symbol: 'BTC' },
          { orderId: '456', symbol: 'ETH' },
        ];

        const result = await provider.cancelOrders(params);

        expect(result.success).toBe(true);
        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);
        expect(result.results).toHaveLength(2);
        expect(result.results[0].success).toBe(true);
      });

      it('handles batch cancel errors', async () => {
        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            cancel: jest.fn().mockRejectedValue(new Error('API error')),
          }),
        );

        const params = [{ orderId: '123', symbol: 'BTC' }];

        const result = await provider.cancelOrders(params);

        expect(result.success).toBe(false);
        expect(result.successCount).toBe(0);
        expect(result.failureCount).toBe(1);
        expect(result.results[0].success).toBe(false);
        expect(result.results[0].error).toBe('API error');
      });
    });

    describe('closePositions', () => {
      it('returns failure when no positions to close', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            clearinghouseState: jest.fn().mockResolvedValue({
              marginSummary: { totalMarginUsed: '0', accountValue: '10000' },
              withdrawable: '10000',
              assetPositions: [],
              crossMarginSummary: {
                accountValue: '10000',
                totalMarginUsed: '0',
              },
            }),
          }),
        );

        const result = await provider.closePositions({ closeAll: true });

        expect(result.success).toBe(false);
        expect(result.successCount).toBe(0);
        expect(result.failureCount).toBe(0);
        expect(result.results).toEqual([]);
      });

      it('closes multiple positions successfully', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            clearinghouseState: jest.fn().mockResolvedValue({
              marginSummary: { totalMarginUsed: '1500', accountValue: '11500' },
              withdrawable: '10000',
              assetPositions: [
                {
                  position: {
                    coin: 'BTC',
                    szi: '1.5',
                    entryPx: '50000',
                    positionValue: '75000',
                    unrealizedPnl: '100',
                    marginUsed: '1000',
                    leverage: { type: 'cross', value: 10 },
                    liquidationPx: '45000',
                  },
                  type: 'oneWay',
                },
                {
                  position: {
                    coin: 'ETH',
                    szi: '-2.0',
                    entryPx: '3000',
                    positionValue: '6000',
                    unrealizedPnl: '50',
                    marginUsed: '500',
                    leverage: { type: 'cross', value: 10 },
                    liquidationPx: '3300',
                  },
                  type: 'oneWay',
                },
              ],
              crossMarginSummary: {
                accountValue: '11500',
                totalMarginUsed: '1500',
              },
            }),
            meta: jest.fn().mockResolvedValue({
              universe: [
                { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
                { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
              ],
            }),
            allMids: jest.fn().mockResolvedValue({
              BTC: '50000',
              ETH: '3000',
            }),
          }),
        );

        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            order: jest.fn().mockResolvedValue({
              response: {
                data: {
                  statuses: [{ filled: {} }, { filled: {} }],
                },
              },
            }),
          }),
        );

        const result = await provider.closePositions({ closeAll: true });

        expect(result.success).toBe(true);
        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(0);
        expect(result.results).toHaveLength(2);
        expect(result.results[0].symbol).toBe('BTC');
        expect(result.results[1].symbol).toBe('ETH');
      });

      it('handles batch close errors', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            clearinghouseState: jest.fn().mockResolvedValue({
              marginSummary: { totalMarginUsed: '1000', accountValue: '11000' },
              withdrawable: '10000',
              assetPositions: [
                {
                  position: {
                    coin: 'BTC',
                    szi: '1.0',
                    entryPx: '50000',
                    positionValue: '50000',
                    unrealizedPnl: '100',
                    marginUsed: '1000',
                    leverage: { type: 'cross', value: 10 },
                    liquidationPx: '45000',
                  },
                  type: 'oneWay',
                },
              ],
              crossMarginSummary: {
                accountValue: '11000',
                totalMarginUsed: '1000',
              },
            }),
          }),
        );

        mockClientService.getExchangeClient = jest.fn().mockReturnValue(
          createMockExchangeClient({
            order: jest.fn().mockRejectedValue(new Error('Order failed')),
          }),
        );

        const result = await provider.closePositions({ closeAll: true });

        expect(result.success).toBe(false);
        expect(result.successCount).toBe(0);
        expect(result.failureCount).toBe(1);
        expect(result.results[0].success).toBe(false);
        expect(result.results[0].error).toBe('Order failed');
      });
    });
  });

  describe('updatePositionTPSL', () => {
    it('updates position TP/SL successfully', async () => {
      const updateParams = {
        symbol: 'ETH',
        takeProfitPrice: '3500',
        stopLossPrice: '2500',
      };

      const result = await provider.updatePositionTPSL(updateParams);

      expect(result.success).toBe(true);
      expect(result.orderId).toBeDefined();
    });

    it('handles update with only take profit price', async () => {
      const updateParams = {
        symbol: 'ETH',
        takeProfitPrice: '3500',
      };

      const result = await provider.updatePositionTPSL(updateParams);

      expect(result.success).toBe(true);
    });

    it('handles update with only stop loss price', async () => {
      const updateParams = {
        symbol: 'ETH',
        stopLossPrice: '2500',
      };

      const result = await provider.updatePositionTPSL(updateParams);

      expect(result.success).toBe(true);
    });
  });
});
