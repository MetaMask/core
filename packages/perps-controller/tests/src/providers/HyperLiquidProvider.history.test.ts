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
  describe('Additional Coverage Tests', () => {
    it('handles getUserFills with empty response', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        userFills: jest.fn().mockResolvedValue(null),
      });

      const result = await provider.getOrderFills();
      expect(result).toEqual([]);
    });

    it('handles getOrders with empty response', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        historicalOrders: jest.fn().mockResolvedValue(null),
      });
      mockClientService.fetchHistoricalOrders = jest.fn().mockResolvedValue([]);

      const result = await provider.getOrders();
      expect(result).toEqual([]);
    });

    it('properly transform getOrders with reduceOnly and isTrigger fields', async () => {
      const historicalOrdersData = [
        {
          order: {
            oid: 123,
            coin: 'BTC',
            side: 'A',
            sz: '0.5',
            origSz: '1.0',
            limitPx: '50000',
            orderType: 'Limit',
            reduceOnly: false,
            isTrigger: false,
          },
          status: 'filled',
          statusTimestamp: 1640995200000,
        },
        {
          order: {
            oid: 124,
            coin: 'ETH',
            side: 'A',
            sz: '0.0',
            origSz: '2.0',
            limitPx: '3500',
            orderType: 'Take Profit Limit',
            reduceOnly: true,
            isTrigger: true,
          },
          status: 'filled',
          statusTimestamp: 1640995300000,
        },
        {
          order: {
            oid: 125,
            coin: 'BTC',
            side: 'B',
            sz: '0.1',
            origSz: '0.1',
            limitPx: '45000',
            orderType: 'Stop Market',
            reduceOnly: true,
            isTrigger: true,
          },
          status: 'triggered',
          statusTimestamp: 1640995400000,
        },
      ];
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest.fn().mockResolvedValue(1),
        referral: jest.fn().mockResolvedValue({
          referrerState: { stage: 'ready', data: { code: 'MMCSI' } },
          referredBy: { code: 'MMCSI' },
        }),
        historicalOrders: jest.fn().mockResolvedValue(historicalOrdersData),
      });
      mockClientService.fetchHistoricalOrders = jest
        .fn()
        .mockResolvedValue(historicalOrdersData);

      const result = await provider.getOrders();

      expect(result).toHaveLength(3);

      // Check first order - regular limit order (not closing)
      expect(result[0]).toMatchObject({
        orderId: '123',
        symbol: 'BTC',
        side: 'sell',
        orderType: 'limit',
        size: '0.5',
        originalSize: '1.0',
        price: '50000',
        status: 'filled',
        detailedOrderType: 'Limit',
        reduceOnly: false,
        isTrigger: false,
      });

      // Check second order - Take Profit closing order
      expect(result[1]).toMatchObject({
        orderId: '124',
        symbol: 'ETH',
        side: 'sell',
        orderType: 'limit',
        size: '0.0',
        originalSize: '2.0',
        price: '3500',
        status: 'filled',
        detailedOrderType: 'Take Profit Limit',
        reduceOnly: true,
        isTrigger: true,
      });

      // Check third order - Stop Market closing order
      expect(result[2]).toMatchObject({
        orderId: '125',
        symbol: 'BTC',
        side: 'buy',
        orderType: 'market',
        size: '0.1',
        originalSize: '0.1',
        price: '45000',
        status: 'triggered',
        detailedOrderType: 'Stop Market',
        reduceOnly: true,
        isTrigger: true,
      });
    });

    it('properly transform getOpenOrders with reduceOnly and isTrigger fields', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest.fn().mockResolvedValue(1),
        referral: jest.fn().mockResolvedValue({
          referrerState: { stage: 'ready', data: { code: 'MMCSI' } },
          referredBy: { code: 'MMCSI' },
        }),
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: { totalMarginUsed: '500', accountValue: '10500' },
          withdrawable: '9500',
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '1.0',
                entryPx: '50000',
                positionValue: '50000',
                unrealizedPnl: '1000',
                marginUsed: '5000',
                leverage: { type: 'cross', value: 10 },
                liquidationPx: '45000',
                maxLeverage: 50,
                returnOnEquity: '20',
                cumFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
              },
              type: 'oneWay',
            },
          ],
          crossMarginSummary: {
            accountValue: '10000',
            totalMarginUsed: '5000',
          },
        }),
        frontendOpenOrders: jest.fn().mockResolvedValue([
          {
            coin: 'BTC',
            side: 'B',
            limitPx: '49000',
            sz: '0.5',
            oid: 201,
            timestamp: 1640995500000,
            origSz: '0.5',
            triggerCondition: '',
            isTrigger: false,
            triggerPx: '',
            children: [],
            isPositionTpsl: false,
            reduceOnly: false,
            orderType: 'Limit',
            tif: 'Gtc',
            cloid: null,
          },
          {
            coin: 'BTC',
            side: 'A',
            limitPx: '55000',
            sz: '1.0',
            oid: 202,
            timestamp: 1640995600000,
            origSz: '1.0',
            triggerCondition: '',
            isTrigger: true,
            triggerPx: '55000',
            children: [],
            isPositionTpsl: true,
            reduceOnly: true,
            orderType: 'Take Profit Limit',
            tif: null,
            cloid: null,
          },
          {
            coin: 'BTC',
            side: 'A',
            limitPx: '',
            sz: '1.0',
            oid: 203,
            timestamp: 1640995700000,
            origSz: '1.0',
            triggerCondition: '',
            isTrigger: true,
            triggerPx: '45000',
            children: [],
            isPositionTpsl: true,
            reduceOnly: true,
            orderType: 'Stop Market',
            tif: null,
            cloid: null,
          },
        ]),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
        }),
        perpDexs: jest.fn().mockResolvedValue([null]),
      });

      const result = await provider.getOpenOrders({ skipCache: true });

      expect(result).toHaveLength(3);

      // Check first order - regular limit order (opening position)
      expect(result[0]).toMatchObject({
        orderId: '201',
        symbol: 'BTC',
        side: 'buy',
        orderType: 'limit',
        size: '0.5',
        originalSize: '0.5',
        price: '49000',
        status: 'open',
        detailedOrderType: 'Limit',
        reduceOnly: false,
        isTrigger: false,
      });

      // Check second order - Take Profit closing order
      expect(result[1]).toMatchObject({
        orderId: '202',
        symbol: 'BTC',
        side: 'sell',
        orderType: 'limit',
        size: '1.0',
        originalSize: '1.0',
        price: '55000',
        status: 'open',
        detailedOrderType: 'Take Profit Limit',
        reduceOnly: true,
        isTrigger: true,
      });

      // Check third order - Stop Market closing order
      expect(result[2]).toMatchObject({
        orderId: '203',
        symbol: 'BTC',
        side: 'sell',
        orderType: 'market',
        size: '1.0',
        originalSize: '1.0',
        price: '45000',
        status: 'open',
        detailedOrderType: 'Stop Market',
        reduceOnly: true,
        isTrigger: true,
      });
    });

    it('handles getFunding with empty response', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        userFunding: jest.fn().mockResolvedValue(null),
      });

      const result = await provider.getFunding();
      expect(result).toEqual([]);
    });

    it('fetches funding across multiple page windows to include latest records', async () => {
      const NOW = 1735689600000; // fixed timestamp for determinism
      const DAY_MS = 24 * 60 * 60 * 1000;

      const oldRecord = {
        time: NOW - 40 * DAY_MS,
        hash: '0x' + 'a'.repeat(64),
        delta: {
          type: 'funding',
          coin: 'BTC',
          usdc: '-1.0',
          szi: '0.1',
          fundingRate: '0.0001',
          nSamples: null,
        },
      };
      const recentRecord = {
        time: NOW - 5 * DAY_MS,
        hash: '0x' + 'b'.repeat(64),
        delta: {
          type: 'funding',
          coin: 'BTC',
          usdc: '-2.0',
          szi: '0.1',
          fundingRate: '0.0001',
          nSamples: null,
        },
      };

      const userFundingMock = jest
        .fn()
        .mockImplementation(
          (params: { startTime: number; endTime: number }) => {
            const records = [oldRecord, recentRecord].filter(
              (r) => r.time >= params.startTime && r.time <= params.endTime,
            );
            return Promise.resolve(records);
          },
        );

      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        userFunding: userFundingMock,
      });

      // Time range spans 60 days → 2 page windows of 30 days each
      const result = await provider.getFunding({
        startTime: NOW - 60 * DAY_MS,
        endTime: NOW,
      });

      expect(userFundingMock).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      // Results sorted ascending: older first, recent last
      expect(result[0].amountUsd).toBe('-1.0');
      expect(result[1].amountUsd).toBe('-2.0');
      // Most recent record is present — this would fail with the old single-call approach
      // when total records exceeded the 500-record API cap
      expect(result[1].timestamp).toBe(recentRecord.time);
    });

    it('includes records from the most recent page window when history is long', async () => {
      const NOW = 1735689600000;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const recentTs = NOW - 2 * DAY_MS;

      const userFundingMock = jest
        .fn()
        .mockImplementation(
          (params: { startTime: number; endTime: number }) => {
            if (params.endTime >= recentTs && params.startTime <= recentTs) {
              return Promise.resolve([
                {
                  time: recentTs,
                  hash: '0x' + 'f'.repeat(64),
                  delta: {
                    type: 'funding',
                    coin: 'ETH',
                    usdc: '-0.5',
                    szi: '1.0',
                    fundingRate: '0.00005',
                    nSamples: null,
                  },
                },
              ]);
            }
            return Promise.resolve([]);
          },
        );

      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        userFunding: userFundingMock,
      });

      // Pass explicit 365-day range to trigger multi-page behavior.
      // The default is now 30 days (1 call); callers must pass startTime to paginate further.
      const result = await provider.getFunding({
        startTime: NOW - 365 * DAY_MS,
        endTime: NOW,
      });

      // Multiple page windows must be created for a 365-day explicit range
      expect(userFundingMock.mock.calls.length).toBeGreaterThan(1);
      // The most recent record is present — proves pagination reaches the latest window
      expect(result.some((r) => r.timestamp === recentTs)).toBe(true);
    });

    it('handles null response from one page window without losing other pages', async () => {
      const NOW = 1735689600000;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const validRecord = {
        time: NOW - 10 * DAY_MS,
        hash: '0x' + 'c'.repeat(64),
        delta: {
          type: 'funding',
          coin: 'BTC',
          usdc: '-3.0',
          szi: '0.2',
          fundingRate: '0.0002',
          nSamples: null,
        },
      };

      let callCount = 0;
      const userFundingMock = jest.fn().mockImplementation(() => {
        callCount += 1;
        // First call returns null, subsequent calls return data
        return Promise.resolve(callCount === 1 ? null : [validRecord]);
      });

      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        userFunding: userFundingMock,
      });

      const result = await provider.getFunding({
        startTime: NOW - 60 * DAY_MS,
        endTime: NOW,
      });

      // Null page is gracefully skipped; valid records from other pages survive
      expect(result.some((r) => r.amountUsd === '-3.0')).toBe(true);
    });

    it('handles validateWithdrawal returning true', async () => {
      const params = {
        amount: '100',
        destination: '0x123' as Hex,
        assetId: 'eip155:1/native' as CaipAssetId,
      };

      const result = await provider.validateWithdrawal(params);
      expect(result.isValid).toBe(true);
    });

    it('handles clearFeeCache with specific user', () => {
      const userAddress = '0x123';
      provider.clearFeeCache(userAddress);
      // Method should complete without error
    });

    // TODO: Refactor — #isFeeCacheValid is an ES # private method, can't be accessed via type cast
    it.skip('handles isFeeCacheValid with non-existent address', async () => {
      // Access private method for edge case testing
      interface ProviderWithPrivateMethods {
        isFeeCacheValid(userAddress: string): boolean;
      }
      const testableProvider =
        provider as unknown as ProviderWithPrivateMethods;
      const result = testableProvider.isFeeCacheValid('0xnonexistent');
      expect(result).toBe(false);
    });

    it('transforms fill data with liquidation information', async () => {
      // Mock fill with liquidation data
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFills: jest.fn().mockResolvedValue([
            {
              oid: 123,
              coin: 'BTC',
              side: 'B',
              sz: '0.1',
              px: '45000',
              fee: '4.5',
              feeToken: 'USDC',
              time: Date.now(),
              closedPnl: '-500',
              dir: 'Close Long',
              liquidation: {
                liquidatedUser: '0x123',
                markPx: '44900',
                method: 'market',
              },
            },
          ]),
        }),
      );

      const fills = await provider.getOrderFills();

      expect(fills[0].liquidation).toEqual({
        liquidatedUser: '0x123',
        markPx: '44900',
        method: 'market',
      });
    });

    it('handles fills without liquidation data', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFills: jest.fn().mockResolvedValue([
            {
              oid: 124,
              coin: 'ETH',
              side: 'B',
              sz: '1.0',
              px: '3000',
              fee: '3',
              feeToken: 'USDC',
              time: Date.now(),
              closedPnl: '100',
              dir: 'Open Long',
            },
          ]),
        }),
      );

      const fills = await provider.getOrderFills();
      expect(fills[0].liquidation).toBeUndefined();
    });

    it('uses userFillsByTime when startTime is provided', async () => {
      const mockUserFillsByTime = jest.fn().mockResolvedValue([
        {
          oid: 125,
          coin: 'BTC',
          side: 'B',
          sz: '0.5',
          px: '50000',
          fee: '5',
          feeToken: 'USDC',
          time: Date.now(),
          closedPnl: '200',
          dir: 'Open Long',
        },
      ]);

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFillsByTime: mockUserFillsByTime,
        }),
      );

      const startTime = Date.now() - 90 * 24 * 60 * 60 * 1000; // 3 months ago
      const fills = await provider.getOrderFills({ startTime });

      expect(mockUserFillsByTime).toHaveBeenCalledWith({
        user: '0x1234567890123456789012345678901234567890',
        startTime,
        endTime: undefined,
        aggregateByTime: false,
      });
      expect(fills).toHaveLength(1);
      expect(fills[0].symbol).toBe('BTC');
    });

    it('uses userFills when startTime is not provided', async () => {
      const mockUserFills = jest.fn().mockResolvedValue([
        {
          oid: 126,
          coin: 'ETH',
          side: 'A',
          sz: '2.0',
          px: '3500',
          fee: '7',
          feeToken: 'USDC',
          time: Date.now(),
          closedPnl: '150',
          dir: 'Close Short',
        },
      ]);

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFills: mockUserFills,
        }),
      );

      const fills = await provider.getOrderFills({ aggregateByTime: true });

      expect(mockUserFills).toHaveBeenCalledWith({
        user: '0x1234567890123456789012345678901234567890',
        aggregateByTime: true,
      });
      expect(fills).toHaveLength(1);
      expect(fills[0].symbol).toBe('ETH');
    });

    it('passes endTime to userFillsByTime when provided', async () => {
      const mockUserFillsByTime = jest.fn().mockResolvedValue([]);

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFillsByTime: mockUserFillsByTime,
        }),
      );

      const startTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      const endTime = Date.now();
      await provider.getOrderFills({
        startTime,
        endTime,
        aggregateByTime: true,
      });

      expect(mockUserFillsByTime).toHaveBeenCalledWith({
        user: '0x1234567890123456789012345678901234567890',
        startTime,
        endTime,
        aggregateByTime: true,
      });
    });
  });

  describe('getOrderFills enrichment with detailedOrderType', () => {
    it('enriches fills with detailedOrderType from historical orders', async () => {
      const mockUserFills = jest.fn().mockResolvedValue([
        {
          oid: 100,
          coin: 'BTC',
          side: 'A',
          sz: '0.5',
          px: '50000',
          fee: '5',
          feeToken: 'USDC',
          time: Date.now(),
          closedPnl: '-200',
          dir: 'Close Long',
          startPosition: '0.5',
        },
        {
          oid: 101,
          coin: 'ETH',
          side: 'B',
          sz: '1.0',
          px: '3000',
          fee: '3',
          feeToken: 'USDC',
          time: Date.now(),
          closedPnl: '100',
          dir: 'Close Short',
          startPosition: '-1.0',
        },
      ]);

      const historicalOrdersData = [
        {
          order: {
            oid: 100,
            coin: 'BTC',
            side: 'A',
            sz: '0',
            origSz: '0.5',
            limitPx: '50000',
            orderType: 'Stop Market',
            reduceOnly: true,
            isTrigger: true,
          },
          status: 'filled',
          statusTimestamp: Date.now(),
        },
        {
          order: {
            oid: 101,
            coin: 'ETH',
            side: 'B',
            sz: '0',
            origSz: '1.0',
            limitPx: '3000',
            orderType: 'Take Profit Limit',
            reduceOnly: true,
            isTrigger: true,
          },
          status: 'filled',
          statusTimestamp: Date.now(),
        },
      ];
      const mockHistoricalOrders = jest
        .fn()
        .mockResolvedValue(historicalOrdersData);

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFills: mockUserFills,
          historicalOrders: mockHistoricalOrders,
        }),
      );
      mockClientService.fetchHistoricalOrders = jest
        .fn()
        .mockResolvedValue(historicalOrdersData);

      const fills = await provider.getOrderFills();

      expect(fills).toHaveLength(2);
      expect(fills[0].detailedOrderType).toBe('Stop Market');
      expect(fills[1].detailedOrderType).toBe('Take Profit Limit');
    });

    it('gracefully handles historicalOrders failure', async () => {
      const mockUserFills = jest.fn().mockResolvedValue([
        {
          oid: 200,
          coin: 'BTC',
          side: 'B',
          sz: '0.1',
          px: '60000',
          fee: '6',
          feeToken: 'USDC',
          time: Date.now(),
          closedPnl: '0',
          dir: 'Open Long',
          startPosition: '0',
        },
      ]);

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userFills: mockUserFills,
          historicalOrders: jest.fn().mockRejectedValue(new Error('API error')),
        }),
      );
      mockClientService.fetchHistoricalOrders = jest
        .fn()
        .mockRejectedValue(new Error('API error'));

      const fills = await provider.getOrderFills();

      expect(fills).toHaveLength(1);
      expect(fills[0].detailedOrderType).toBeUndefined();
    });
  });

  describe('getOpenOrders additional coverage', () => {
    it('returns empty array when frontendOpenOrders throws error', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        frontendOpenOrders: jest.fn().mockRejectedValue(new Error('API Error')),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
        }),
        perpDexs: jest.fn().mockResolvedValue([null]),
      });

      // Act
      const result = await provider.getOpenOrders({ skipCache: true });

      // Assert
      expect(result).toEqual([]);
    });

    it('returns cached orders when cache is initialized', async () => {
      // Arrange
      const cachedOrders = [
        {
          orderId: '101',
          symbol: 'ETH',
          side: 'buy' as const,
          orderType: 'limit' as const,
          size: '1.0',
          originalSize: '1.0',
          filledSize: '0',
          remainingSize: '1.0',
          price: '2900',
          status: 'open' as const,
          timestamp: Date.now(),
          detailedOrderType: 'Limit',
          reduceOnly: false,
          isTrigger: false,
        },
      ];
      // Use the atomic getter mock
      mockSubscriptionService.getOrdersCacheIfInitialized = jest
        .fn()
        .mockReturnValue(cachedOrders);

      // Act
      const result = await provider.getOpenOrders();

      // Assert
      expect(result).toEqual(cachedOrders);
      expect(mockClientService.getInfoClient).not.toHaveBeenCalled();
    });

    it('falls back to REST when atomic cache getter returns null', async () => {
      // Arrange - atomic getter returns null (cache not initialized or race condition)
      mockSubscriptionService.getOrdersCacheIfInitialized = jest
        .fn()
        .mockReturnValue(null);

      const mockFrontendOpenOrders = jest.fn().mockResolvedValue([
        {
          coin: 'ETH',
          side: 'B',
          limitPx: '3000',
          sz: '1.0',
          oid: 501,
          timestamp: Date.now(),
          origSz: '1.0',
          triggerCondition: '',
          isTrigger: false,
          triggerPx: '',
          children: [],
          isPositionTpsl: false,
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          cloid: null,
        },
      ]);

      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest.fn().mockResolvedValue(1),
        referral: jest.fn().mockResolvedValue({
          referrerState: { stage: 'ready', data: { code: 'MMCSI' } },
          referredBy: { code: 'MMCSI' },
        }),
        frontendOpenOrders: mockFrontendOpenOrders,
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: { totalMarginUsed: '0', accountValue: '1000' },
          withdrawable: '1000',
          assetPositions: [],
          crossMarginSummary: { accountValue: '1000', totalMarginUsed: '0' },
        }),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 25 }],
        }),
        perpDexs: jest.fn().mockResolvedValue([null]),
      });

      // Act
      const result = await provider.getOpenOrders();

      // Assert - should fall back to REST API
      expect(mockFrontendOpenOrders).toHaveBeenCalled();
      expect(result.length).toBe(1);
      expect(result[0].orderId).toBe('501');
    });

    it('returns defensive copy of cached orders (not original array)', async () => {
      // Arrange - this tests that the atomic getter returns a copy
      const cachedOrders = [
        {
          orderId: '101',
          symbol: 'ETH',
          side: 'buy' as const,
          orderType: 'limit' as const,
          size: '1.0',
          originalSize: '1.0',
          filledSize: '0',
          remainingSize: '1.0',
          price: '2900',
          status: 'open' as const,
          timestamp: Date.now(),
          detailedOrderType: 'Limit',
          reduceOnly: false,
          isTrigger: false,
        },
      ];
      // Return a new array each time (simulating the defensive copy)
      mockSubscriptionService.getOrdersCacheIfInitialized = jest
        .fn()
        .mockImplementation(() => [...cachedOrders]);

      // Act
      const result1 = await provider.getOpenOrders();
      const result2 = await provider.getOpenOrders();

      // Assert - should be equal but not the same reference
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2); // Different array instances
    });

    it('queries only main DEX when no additional DEXs enabled', async () => {
      // Arrange
      const mockFrontendOpenOrders = jest.fn().mockResolvedValue([
        {
          coin: 'ETH',
          side: 'B',
          limitPx: '3000',
          sz: '1.0',
          oid: 301,
          timestamp: Date.now(),
          origSz: '1.0',
          triggerCondition: '',
          isTrigger: false,
          triggerPx: '',
          children: [],
          isPositionTpsl: false,
          reduceOnly: false,
          orderType: 'Limit',
          tif: 'Gtc',
          cloid: null,
        },
      ]);
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest.fn().mockResolvedValue(1),
        referral: jest.fn().mockResolvedValue({
          referrerState: { stage: 'ready', data: { code: 'MMCSI' } },
          referredBy: { code: 'MMCSI' },
        }),
        frontendOpenOrders: mockFrontendOpenOrders,
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: { totalMarginUsed: '0', accountValue: '1000' },
          withdrawable: '1000',
          assetPositions: [],
          crossMarginSummary: { accountValue: '1000', totalMarginUsed: '0' },
        }),
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'ETH', szDecimals: 4, maxLeverage: 25 }],
        }),
        perpDexs: jest.fn().mockResolvedValue([null]),
      });

      // Act
      const result = await provider.getOpenOrders({ skipCache: true });

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('ETH');
      // Note: frontendOpenOrders is called twice - once for getOpenOrders and once for getPositions
      expect(mockFrontendOpenOrders).toHaveBeenCalled();
    });

    it('queries multiple DEXs when HIP-3 enabled', async () => {
      // Create provider with HIP-3 enabled and allowlist including 'xyz' DEX
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
        initialAssetMapping: [
          ['BTC', 0],
          ['xyz:STOCK1', 1],
        ],
      });

      // Ensure cache is disabled for this test (atomic getter returns null)
      mockSubscriptionService.getOrdersCacheIfInitialized = jest
        .fn()
        .mockReturnValue(null);

      const mockFrontendOpenOrders = jest
        .fn()
        .mockImplementation((params: { user: string; dex?: string }) => {
          if (params.dex === 'xyz') {
            return Promise.resolve([
              {
                coin: 'xyz:STOCK1',
                side: 'B',
                limitPx: '100',
                sz: '10',
                oid: 401,
                timestamp: Date.now(),
                origSz: '10',
                triggerCondition: '',
                isTrigger: false,
                triggerPx: '',
                children: [],
                isPositionTpsl: false,
                reduceOnly: false,
                orderType: 'Limit',
                tif: 'Gtc',
                cloid: null,
              },
            ]);
          }
          // Main DEX
          return Promise.resolve([
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '51000',
              sz: '0.5',
              oid: 402,
              timestamp: Date.now(),
              origSz: '0.5',
              triggerCondition: '',
              isTrigger: false,
              triggerPx: '',
              children: [],
              isPositionTpsl: false,
              reduceOnly: false,
              orderType: 'Limit',
              tif: 'Gtc',
              cloid: null,
            },
          ]);
        });
      mockClientService.getInfoClient = jest.fn().mockReturnValue({
        maxBuilderFee: jest.fn().mockResolvedValue(1),
        referral: jest.fn().mockResolvedValue({
          referrerState: { stage: 'ready', data: { code: 'MMCSI' } },
          referredBy: { code: 'MMCSI' },
        }),
        frontendOpenOrders: mockFrontendOpenOrders,
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: { totalMarginUsed: '0', accountValue: '1000' },
          withdrawable: '1000',
          assetPositions: [],
          crossMarginSummary: { accountValue: '1000', totalMarginUsed: '0' },
        }),
        meta: jest.fn().mockResolvedValue({
          universe: [
            { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
            { name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 },
          ],
        }),
        perpDexs: jest
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
      });

      // Act
      const result = await hip3Provider.getOpenOrders({ skipCache: true });

      // Assert
      expect(result).toHaveLength(2);
      // Verify both orders are present (order may vary due to Promise.all)
      const symbols = result.map((r) => r.symbol);
      expect(symbols).toContain('xyz:STOCK1');
      expect(symbols).toContain('BTC');
      // Verify both DEXs were queried
      expect(mockFrontendOpenOrders).toHaveBeenCalled();
      expect(
        mockFrontendOpenOrders.mock.calls.some((call) => call[0].dex === 'xyz'),
      ).toBe(true);
    });
  });

  describe('getUserHistory', () => {
    it('returns user history items successfully', async () => {
      // Arrange
      const mockLedgerUpdates = [
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
          userNonFundingLedgerUpdates: jest
            .fn()
            .mockResolvedValue(mockLedgerUpdates),
        }),
      );

      // Act
      const result = await provider.getUserHistory();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(mockClientService.getInfoClient).toHaveBeenCalled();
    });

    it('returns empty array on API error', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userNonFundingLedgerUpdates: jest
            .fn()
            .mockRejectedValue(new Error('API Error')),
        }),
      );

      // Act
      const result = await provider.getUserHistory();

      // Assert
      expect(result).toEqual([]);
    });

    it('handles custom time range parameters', async () => {
      // Arrange
      const startTime = Date.now() - 86400000; // 24h ago
      const endTime = Date.now();
      const mockInfoClient = createMockInfoClient();

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      await provider.getUserHistory({ startTime, endTime });

      // Assert
      expect(mockInfoClient.userNonFundingLedgerUpdates).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime,
          endTime,
        }),
      );
    });

    it('uses default account when no accountId provided', async () => {
      // Arrange
      const mockInfoClient = createMockInfoClient();
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      // Act
      await provider.getUserHistory();

      // Assert
      expect(mockWalletService.getUserAddressWithDefault).toHaveBeenCalledWith(
        undefined,
      );
      expect(mockInfoClient.userNonFundingLedgerUpdates).toHaveBeenCalled();
    });
  });

  describe('getHistoricalPortfolio', () => {
    it('returns historical portfolio value from 24h ago', async () => {
      // Arrange
      const yesterday = Date.now() - 86400000;
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          portfolio: jest.fn().mockResolvedValue([
            null,
            [
              null,
              {
                accountValueHistory: [
                  [yesterday, '10000'],
                  [yesterday - 86400000, '9500'],
                ],
              },
            ],
          ]),
        }),
      );

      // Act
      const result = await provider.getHistoricalPortfolio();

      // Assert
      expect(result.accountValue1dAgo).toBeDefined();
      expect(result.timestamp).toBeDefined();
    });

    it('finds closest entry before target timestamp', async () => {
      // Arrange
      const now = Date.now();
      const closestTime = now - 87000000; // Slightly older than 24h

      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          portfolio: jest.fn().mockResolvedValue([
            null,
            [
              null,
              {
                accountValueHistory: [
                  [closestTime, '10000'], // This should be selected
                  [now - 172800000, '9500'], // Too old
                ],
              },
            ],
          ]),
        }),
      );

      // Act
      const result = await provider.getHistoricalPortfolio();

      // Assert
      expect(result.accountValue1dAgo).toBe('10000');
      expect(result.timestamp).toBe(closestTime);
    });

    it('returns fallback when no historical data exists', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          portfolio: jest.fn().mockResolvedValue([
            null,
            [
              null,
              {
                accountValueHistory: [],
              },
            ],
          ]),
        }),
      );

      // Act
      const result = await provider.getHistoricalPortfolio();

      // Assert
      expect(result.accountValue1dAgo).toBe('0');
      expect(result.timestamp).toBe(0);
    });

    it('handles empty portfolio data gracefully', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          portfolio: jest.fn().mockResolvedValue(null),
        }),
      );

      // Act
      const result = await provider.getHistoricalPortfolio();

      // Assert
      expect(result.accountValue1dAgo).toBe('0');
      expect(result.timestamp).toBe(0);
    });

    it('returns zero values on error', async () => {
      // Arrange
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          portfolio: jest
            .fn()
            .mockRejectedValue(new Error('Portfolio API error')),
        }),
      );

      // Act
      const result = await provider.getHistoricalPortfolio();

      // Assert
      expect(result.accountValue1dAgo).toBe('0');
      expect(result.timestamp).toBe(0);
    });
  });

  describe('getAvailableHip3Dexs', () => {
    it('returns HIP-3 DEX names when equity enabled', async () => {
      // Arrange - use existing provider with updated mock
      const mockInfoClientWithDexs = createMockInfoClient({
        perpDexs: jest
          .fn()
          .mockResolvedValue([
            null,
            { name: 'dex1', url: 'https://dex1.com' },
            { name: 'dex2', url: 'https://dex2.com' },
          ]),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClientWithDexs);

      // Create a provider instance with equity enabled for this specific test
      const testProvider = createTestProvider({ hip3Enabled: true });

      // DEX discovery cache starts with null state on a fresh provider — no reset needed

      // Act
      const result = await testProvider.getAvailableHip3Dexs();

      // Assert
      expect(Array.isArray(result)).toBe(true);
      expect(mockInfoClientWithDexs.perpDexs).toHaveBeenCalled();
    });

    it('returns empty array when equity disabled', async () => {
      // Arrange
      const disabledProvider = createTestProvider({
        hip3Enabled: false,
      });

      // Act
      const result = await disabledProvider.getAvailableHip3Dexs();

      // Assert
      expect(result).toEqual([]);
    });

    it('returns empty array when perpDexs returns invalid data', async () => {
      // Arrange
      const hip3Provider = createTestProvider({ hip3Enabled: true });
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          perpDexs: jest.fn().mockResolvedValue(null),
        }),
      );

      // Act
      const result = await hip3Provider.getAvailableHip3Dexs();

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('transferBetweenDexs', () => {
    beforeEach(() => {
      // Add spotMeta to mock for getUsdcTokenId
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          spotMeta: jest.fn().mockResolvedValue({
            tokens: [{ name: 'USDC', tokenId: '0xabc123', index: 0 }],
            universe: [],
          }),
        }),
      );
    });

    it('transfers USDC between DEXs successfully', async () => {
      // Arrange
      const transferParams = {
        sourceDex: 'dex1',
        destinationDex: 'dex2',
        amount: '100',
      };

      // Act
      const result = await provider.transferBetweenDexs(transferParams);

      // Assert
      expect(result.success).toBe(true);
      expect(
        mockClientService.getExchangeClient().sendAsset,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceDex: 'dex1',
          destinationDex: 'dex2',
          amount: '100',
          token: expect.any(String),
        }),
      );
    });

    it('rejects transfer with zero amount', async () => {
      // Arrange
      const transferParams = {
        sourceDex: 'dex1',
        destinationDex: 'dex2',
        amount: '0',
      };

      // Act
      const result = await provider.transferBetweenDexs(transferParams);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be greater than 0');
    });

    it('rejects transfer when source equals destination', async () => {
      // Arrange
      const transferParams = {
        sourceDex: 'dex1',
        destinationDex: 'dex1',
        amount: '100',
      };

      // Act
      const result = await provider.transferBetweenDexs(transferParams);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be different');
    });

    it('handles sendAsset failure gracefully', async () => {
      // Arrange
      mockClientService.getExchangeClient = jest.fn().mockReturnValue(
        createMockExchangeClient({
          sendAsset: jest.fn().mockResolvedValue({
            status: 'error',
            message: 'Insufficient balance',
          }),
        }),
      );
      const transferParams = {
        sourceDex: 'dex1',
        destinationDex: 'dex2',
        amount: '100',
      };

      // Act
      const result = await provider.transferBetweenDexs(transferParams);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('calls getUsdcTokenId to get correct token', async () => {
      // Arrange
      const mockSpotMeta = jest.fn().mockResolvedValue({
        tokens: [{ name: 'USDC', tokenId: '0xspecific', index: 0 }],
        universe: [],
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(createMockInfoClient({ spotMeta: mockSpotMeta }));
      const transferParams = {
        sourceDex: '',
        destinationDex: 'dex1',
        amount: '100',
      };

      // Act
      await provider.transferBetweenDexs(transferParams);

      // Assert
      expect(mockSpotMeta).toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().sendAsset,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'USDC:0xspecific',
        }),
      );
    });
  });
});
