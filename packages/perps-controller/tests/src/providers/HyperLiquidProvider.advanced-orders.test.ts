/* eslint-disable */
jest.mock('@nktkas/hyperliquid', () => ({}));

import { ORDER_SLIPPAGE_CONFIG } from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import { TradingReadinessCache } from '../../../src/services/TradingReadinessCache.js';
import type {
  PerpsPlatformDependencies,
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
  // editOrder verifies the resting order's placement type before modifying it,
  // so the account lists the plain limit order the edit tests target.
  frontendOpenOrders: jest.fn().mockResolvedValue([
    {
      coin: 'BTC',
      side: 'B',
      limitPx: '50000',
      sz: '0.1',
      origSz: '0.1',
      oid: 123,
      timestamp: 1_700_000_000_000,
      isTrigger: false,
      triggerCondition: 'N/A',
      triggerPx: '0',
      children: [],
      isPositionTpsl: false,
      reduceOnly: false,
      orderType: 'Limit',
    },
  ]),
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
  order: jest.fn().mockImplementation((request: { orders: unknown[] }) =>
    Promise.resolve({
      status: 'ok',
      response: {
        data: {
          statuses: request.orders.map((_order, index) => ({
            resting: { oid: 123 + index },
          })),
        },
      },
    }),
  ),
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

  describe('Advanced order placement', () => {
    const TPSL_SLIPPAGE = ORDER_SLIPPAGE_CONFIG.DefaultTpslSlippageBps / 10000;

    /**
     * Reads the orders payload submitted to the exchange client.
     *
     * @returns The submitted `order` request.
     */
    const getSubmittedOrderRequest = () =>
      (mockClientService.getExchangeClient().order as jest.Mock).mock
        .calls[0][0];

    it('rejects an attached TP/SL size that rounds to zero before changing leverage', async () => {
      // The leverage change is on-chain and not undone by a later rejection, so
      // a size that disappears at szDecimals: 3 has to be caught before it.
      mockValidateOrderParams.mockImplementation(
        jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
          .validateOrderParams,
      );

      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
        leverage: 5,
        takeProfitPrice: '60000',
        takeProfitSize: '0.0004',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID);
      expect(
        mockClientService.getExchangeClient().updateLeverage,
      ).not.toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });

    it('rejects a trigger price that rounds to zero before changing leverage', async () => {
      // The SDK would reject triggerPx: '0' anyway, but only after the leverage
      // change has already been written on-chain.
      mockValidateOrderParams.mockImplementation(
        jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
          .validateOrderParams,
      );

      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_market',
        triggerPrice: '0.0004',
        currentPrice: 50000,
        leverage: 5,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_POSITIVE);
      expect(
        mockClientService.getExchangeClient().updateLeverage,
      ).not.toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });

    it('places a stop market order as a market-on-trigger stop', async () => {
      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_market',
        triggerPrice: '45000',
        currentPrice: 50000,
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(true);
      const request = getSubmittedOrderRequest();
      expect(request.grouping).toBe('na');
      expect(request.orders).toHaveLength(1);
      expect(request.orders[0].t).toStrictEqual({
        trigger: { isMarket: true, triggerPx: '45000', tpsl: 'sl' },
      });
      // Market-on-trigger sells accept up to the TP/SL slippage below the trigger
      expect(parseFloat(request.orders[0].p)).toBeCloseTo(
        45000 * (1 - TPSL_SLIPPAGE),
        0,
      );
    });

    it('places a stop limit order at the requested limit price', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_limit',
        price: '44500',
        triggerPrice: '45000',
        currentPrice: 50000,
      });

      expect(result.success).toBe(true);
      const request = getSubmittedOrderRequest();
      expect(request.orders[0].t).toStrictEqual({
        trigger: { isMarket: false, triggerPx: '45000', tpsl: 'sl' },
      });
      expect(request.orders[0].p).toBe('44500');
    });

    it.each([
      ['GTC', 'Gtc'],
      ['IOC', 'Ioc'],
      ['ALO', 'Alo'],
    ] as const)(
      'submits %s time in force to the exchange for a limit order',
      async (timeInForce, tif) => {
        const result = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'limit',
          price: '49000',
          timeInForce,
          currentPrice: 50000,
        });

        expect(result.success).toBe(true);
        expect(getSubmittedOrderRequest().orders[0].t).toStrictEqual({
          limit: { tif },
        });
      },
    );

    it.each([
      [
        'market',
        {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market' as const,
        },
      ],
      [
        'stop_limit',
        {
          symbol: 'BTC',
          isBuy: false,
          size: '0.1',
          orderType: 'stop_limit' as const,
          price: '44500',
          triggerPrice: '45000',
        },
      ],
    ])(
      'rejects time in force on a %s order before any on-chain side effect',
      async (_label, orderParams) => {
        // Real validation, so the rejection happens at step 1 of placeOrder
        // rather than while the exchange payload is being built.
        mockValidateOrderParams.mockImplementation(
          jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
            .validateOrderParams,
        );

        const result = await provider.placeOrder({
          ...orderParams,
          // Leverage is what makes the ordering matter: #prepareAssetForTrading
          // sends updateLeverage on-chain, and there is no rollback for it.
          leverage: 10,
          timeInForce: 'IOC',
          currentPrice: 50000,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe(
          PERPS_ERROR_CODES.ORDER_TIME_IN_FORCE_NOT_SUPPORTED,
        );
        expect(
          mockClientService.getExchangeClient().updateLeverage,
        ).not.toHaveBeenCalled();
        expect(
          mockClientService.getExchangeClient().order,
        ).not.toHaveBeenCalled();
      },
    );

    it('rejects time in force on a trigger order', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_limit',
        price: '44500',
        triggerPrice: '45000',
        timeInForce: 'ALO',
        currentPrice: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_TIME_IN_FORCE_NOT_SUPPORTED,
      );
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });

    it('places a take profit market order as a market-on-trigger take profit', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'take_profit_market',
        triggerPrice: '60000',
        currentPrice: 50000,
      });

      expect(result.success).toBe(true);
      const request = getSubmittedOrderRequest();
      expect(request.orders[0].t).toStrictEqual({
        trigger: { isMarket: true, triggerPx: '60000', tpsl: 'tp' },
      });
    });

    it('places a take profit limit order at the requested limit price', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'take_profit_limit',
        price: '60000',
        triggerPrice: '59500',
        currentPrice: 50000,
      });

      expect(result.success).toBe(true);
      const request = getSubmittedOrderRequest();
      expect(request.orders[0].t).toStrictEqual({
        trigger: { isMarket: false, triggerPx: '59500', tpsl: 'tp' },
      });
      expect(request.orders[0].p).toBe('60000');
    });

    it('submits reduce-only as a first-class placement flag', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_market',
        triggerPrice: '45000',
        reduceOnly: true,
        currentPrice: 50000,
      });

      expect(result.success).toBe(true);
      expect(getSubmittedOrderRequest().orders[0].r).toBe(true);
    });

    it('defaults reduce-only to false when not requested', async () => {
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'stop_market',
        triggerPrice: '55000',
        currentPrice: 50000,
      });

      expect(getSubmittedOrderRequest().orders[0].r).toBe(false);
    });

    it('scopes attached TP/SL children to their partial sizes', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
        takeProfitPrice: '60000',
        takeProfitSize: '0.04',
        stopLossPrice: '45000',
        stopLossSize: '0.06',
      });

      expect(result.success).toBe(true);
      const request = getSubmittedOrderRequest();
      expect(request.grouping).toBe('normalTpsl');
      expect(request.orders).toHaveLength(3);
      // Main order keeps the full size; children carry the partial sizes
      expect(request.orders[0].s).toBe('0.1');
      expect(request.orders[1].s).toBe('0.04');
      expect(request.orders[1].t.trigger.tpsl).toBe('tp');
      expect(request.orders[2].s).toBe('0.06');
      expect(request.orders[2].t.trigger.tpsl).toBe('sl');
      // Partial TP/SL children always reduce the position
      expect(request.orders[1].r).toBe(true);
      expect(request.orders[2].r).toBe(true);
    });

    it('maps the provider-agnostic TP/SL linkage onto the exchange grouping', async () => {
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
        takeProfitPrice: '60000',
        tpslLinkage: 'position',
      });

      expect(getSubmittedOrderRequest().grouping).toBe('positionTpsl');
    });

    it('lets the linkage win over the deprecated grouping spelling', async () => {
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
        takeProfitPrice: '60000',
        tpslLinkage: 'position',
        // Deprecated spelling of the same option; validation rejects a genuine
        // disagreement, so this only proves which field the mapping reads.
        grouping: 'positionTpsl',
      });

      expect(getSubmittedOrderRequest().grouping).toBe('positionTpsl');
    });

    it('still honours the deprecated grouping when no linkage is given', async () => {
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000,
        takeProfitPrice: '60000',
        grouping: 'positionTpsl',
      });

      expect(getSubmittedOrderRequest().grouping).toBe('positionTpsl');
    });

    it('returns a typed error when a trigger placement has no trigger price', async () => {
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_market',
        currentPrice: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_REQUIRED);
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });

    it('returns a typed error when a trigger placement fails validation', async () => {
      mockValidateOrderParams.mockReturnValue({
        isValid: false,
        error: PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED,
      });

      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        triggerPrice: '45000',
        currentPrice: 50000,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_TRIGGER_PRICE_NOT_SUPPORTED,
      );
    });

    it('forwards the new placement fields to validation', async () => {
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_limit',
        price: '44500',
        triggerPrice: '45000',
        currentPrice: 50000,
      });

      expect(mockValidateOrderParams).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: 'stop_limit',
          triggerPrice: '45000',
          price: '44500',
        }),
      );
    });

    it('cancels a placed trigger order', async () => {
      const placed = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.1',
        orderType: 'stop_market',
        triggerPrice: '45000',
        currentPrice: 50000,
      });

      const cancelled = await provider.cancelOrder({
        orderId: placed.orderId as string,
        symbol: 'BTC',
      });

      expect(cancelled.success).toBe(true);
      expect(mockClientService.getExchangeClient().cancel).toHaveBeenCalledWith(
        {
          cancels: [{ a: 0, o: 123 }],
        },
      );
    });

    it.each([
      ['GTC', 'Gtc'],
      ['IOC', 'Ioc'],
      ['ALO', 'Alo'],
    ] as const)(
      'honours %s time in force when editing a limit order',
      async (timeInForce, tif) => {
        const result = await provider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType: 'limit',
            price: '49000',
            timeInForce,
          },
        });

        expect(result.success).toBe(true);
        const modifyCall = (
          mockClientService.getExchangeClient().modify as jest.Mock
        ).mock.calls[0][0];
        expect(modifyCall.order.t).toStrictEqual({ limit: { tif } });
      },
    );

    // A venue `modify` REPLACES the resting order: the old oid is cancelled and
    // the replacement rests under a new one, which the SDK modify response does
    // not carry. Reporting the old oid back as OrderResult.orderId therefore
    // names an order that no longer exists. These pin the contract: resolve the
    // replacement from authoritative post-modify data when it is unambiguous,
    // and otherwise omit the id rather than fabricate identity.
    describe('replacement order id', () => {
      const restingOrder = (overrides: Record<string, unknown> = {}) => ({
        coin: 'BTC',
        side: 'B',
        limitPx: '50000',
        sz: '0.1',
        origSz: '0.1',
        oid: 123,
        timestamp: 1_700_000_000_000,
        isTrigger: false,
        triggerCondition: 'N/A',
        triggerPx: '0',
        children: [],
        isPositionTpsl: false,
        reduceOnly: false,
        orderType: 'Limit',
        ...overrides,
      });

      /**
       * Point frontendOpenOrders at a pre-modify then post-modify snapshot.
       *
       * @param before - Orders resting before the edit.
       * @param after - Orders resting after the edit.
       * @returns The frontendOpenOrders mock.
       */
      const withSnapshots = (before: unknown[], after: unknown[]) => {
        const frontendOpenOrders = jest
          .fn()
          .mockResolvedValueOnce(before)
          .mockResolvedValue(after);
        mockClientService.getInfoClient.mockReturnValue(
          createMockInfoClient({ frontendOpenOrders }) as never,
        );
        return frontendOpenOrders;
      };

      const edit = async () =>
        provider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType: 'limit',
            price: '49000',
          },
        });

      it('reports the replacement order id, never the one that was replaced', async () => {
        withSnapshots(
          [restingOrder()],
          [restingOrder({ oid: 456, limitPx: '49000' })],
        );

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBe('456');
        expect(result.orderId).not.toBe('123');
      });

      it('omits the order id when the edit filled instead of resting', async () => {
        // A market edit leaves nothing to resolve. Success is still true — the
        // modify was accepted — but there is no resting order to name.
        withSnapshots([restingOrder()], []);

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
      });

      it('omits the order id when the replacement is not yet visible', async () => {
        // Eventual consistency: the post-modify read still shows the old order.
        // Guessing here would report an id the venue has already cancelled.
        withSnapshots([restingOrder()], [restingOrder()]);

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
      });

      it('omits the order id when more than one new order could be the replacement', async () => {
        withSnapshots(
          [restingOrder()],
          [
            restingOrder({ oid: 456, limitPx: '49000' }),
            restingOrder({ oid: 457, limitPx: '49000' }),
          ],
        );

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
      });

      it('does not mistake an order that was already resting for the replacement', async () => {
        // The lookalike shares coin, side and size, so attributes alone would
        // match it. It existed before the edit, so it cannot be the replacement.
        withSnapshots(
          [restingOrder(), restingOrder({ oid: 789 })],
          [restingOrder({ oid: 789 })],
        );

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
      });

      it('does not mistake a different market or side for the replacement', async () => {
        withSnapshots(
          [restingOrder()],
          [
            restingOrder({ oid: 456, coin: 'ETH' }),
            restingOrder({ oid: 457, side: 'A' }),
          ],
        );

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
      });

      it('keeps the edit successful when the pre-edit baseline read fails', async () => {
        // The cache already confirmed the order is safe to edit, so the baseline
        // is wanted only to judge novelty afterwards. Losing it must not sink a
        // modify that would otherwise succeed — the same soft failure the
        // post-modify lookup already has.
        mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([
          {
            orderId: '123',
            symbol: 'BTC',
            side: 'buy',
            orderType: 'limit',
            size: '0.1',
            originalSize: '0.1',
            price: '50000',
            filledSize: '0',
            remainingSize: '0.1',
            status: 'open',
            timestamp: 1_700_000_000_000,
            isTrigger: false,
            reduceOnly: false,
          },
        ] as never);
        mockClientService.getInfoClient.mockReturnValue(
          createMockInfoClient({
            frontendOpenOrders: jest
              .fn()
              .mockRejectedValue(new Error('network down')),
          }) as never,
        );

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
        expect(mockClientService.getExchangeClient().modify).toHaveBeenCalled();
      });

      it('keeps the edit successful when the post-modify read fails', async () => {
        // The modify was accepted; only the identity lookup failed. Turning that
        // into a failed edit would misreport an order that really was changed.
        const frontendOpenOrders = jest
          .fn()
          .mockResolvedValueOnce([restingOrder()])
          .mockRejectedValue(new Error('network down'));
        mockClientService.getInfoClient.mockReturnValue(
          createMockInfoClient({ frontendOpenOrders }) as never,
        );

        const result = await edit();

        expect(result.success).toBe(true);
        expect(result.orderId).toBeUndefined();
      });
    });

    it('refuses an unverifiable edit before any trading setup runs', async () => {
      // The cold-cache path fails closed, but the refusal is only free if it
      // happens BEFORE ensureReadyForTrading: that prompts for signatures and
      // writes builder-fee and referral approvals. Rejecting afterwards makes
      // the caller pay for an edit that was never going to happen — the same
      // ordering placeOrder and updatePositionTPSL already observe.
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          frontendOpenOrders: jest.fn().mockResolvedValue([]),
        }) as never,
      );

      const result = await provider.editOrder({
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'limit',
          price: '49000',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_EDIT_ORDER_UNVERIFIABLE,
      );
      expect(
        mockClientService.getExchangeClient().approveBuilderFee,
      ).not.toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).not.toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().modify,
      ).not.toHaveBeenCalled();
    });

    it('rejects editing a resting trigger order into a plain one', async () => {
      // The dangerous direction: `modify` would rebuild the protective stop as
      // an immediately-resting limit order and report success.
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([
        {
          orderId: '123',
          symbol: 'BTC',
          side: 'sell',
          orderType: 'market',
          size: '0.1',
          originalSize: '0.1',
          price: '40500',
          filledSize: '0',
          remainingSize: '0.1',
          status: 'open',
          timestamp: 1_700_000_000_000,
          isTrigger: true,
          triggerOrderType: 'stop_market',
          triggerPrice: '44000',
          reduceOnly: true,
        },
      ] as never);

      const result = await provider.editOrder({
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: false,
          size: '0.1',
          orderType: 'limit',
          price: '45000',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_EDIT_TRIGGER_UNSUPPORTED,
      );
      expect(
        mockClientService.getExchangeClient().modify,
      ).not.toHaveBeenCalled();
    });

    it('rejects editing a resting trigger order the cold cache cannot see', async () => {
      // Cache is cold, so the placement type comes from REST instead. Without
      // that lookup the edit would rebuild the protective stop as a plain order.
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '40500',
              sz: '0.1',
              origSz: '0.1',
              oid: 123,
              timestamp: 1_700_000_000_000,
              isTrigger: true,
              triggerCondition: 'Price below 44000',
              triggerPx: '44000',
              children: [],
              isPositionTpsl: false,
              reduceOnly: true,
              orderType: 'Stop Market',
            },
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const result = await provider.editOrder({
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: false,
          size: '0.1',
          orderType: 'limit',
          price: '45000',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_EDIT_TRIGGER_UNSUPPORTED,
      );
      expect(
        mockClientService.getExchangeClient().modify,
      ).not.toHaveBeenCalled();
    });

    it('rejects an edit when the resting order cannot be verified at all', async () => {
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          frontendOpenOrders: jest.fn().mockResolvedValue([]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const result = await provider.editOrder({
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: false,
          size: '0.1',
          orderType: 'limit',
          price: '45000',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_EDIT_ORDER_UNVERIFIABLE,
      );
      expect(
        mockClientService.getExchangeClient().modify,
      ).not.toHaveBeenCalled();
    });

    it('rejects editing a resting order into a trigger placement', async () => {
      const result = await provider.editOrder({
        orderId: '123',
        newOrder: {
          symbol: 'BTC',
          isBuy: false,
          size: '0.1',
          orderType: 'stop_limit',
          price: '44500',
          triggerPrice: '45000',
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        PERPS_ERROR_CODES.ORDER_EDIT_TRIGGER_UNSUPPORTED,
      );
      expect(
        mockClientService.getExchangeClient().modify,
      ).not.toHaveBeenCalled();
    });

    // Regression coverage for the editOrder half of TAT-3252. The submitted
    // size is formatted with formatHyperLiquidSize, which rounds half-up, so a
    // reduce-only edit could be sent above the size the caller asked to keep —
    // the same "Reduce only order would increase position" rejection the close
    // and TP/SL paths were hardened against.
    describe('reduce-only size formatting', () => {
      /**
       * Read the size submitted to the venue's modify action.
       * @returns The formatted size string.
       */
      const getModifiedSize = () =>
        (mockClientService.getExchangeClient().modify as jest.Mock).mock
          .calls[0][0].order.s;

      it('rounds a reduce-only edit size down to the size grid', async () => {
        // BTC is szDecimals 3 here, so 0.1155 rounds half-up to '0.116' —
        // one increment above the position the edit is meant to reduce.
        const result = await provider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: false,
            size: '0.1155',
            orderType: 'limit',
            price: '51000',
            reduceOnly: true,
          },
        });

        expect(result.success).toBe(true);
        expect(getModifiedSize()).toBe('0.115');
      });

      it('leaves a non-reduce-only edit size on its existing rounding', async () => {
        // An opening order has no position ceiling to breach, so rounding it
        // down would shrink an order the caller asked for.
        const result = await provider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: true,
            size: '0.1155',
            orderType: 'limit',
            price: '49000',
          },
        });

        expect(result.success).toBe(true);
        expect(getModifiedSize()).toBe('0.116');
      });

      it('refuses a reduce-only edit smaller than one size increment', async () => {
        // Flooring 0.0004 at szDecimals 3 yields 0, and a zero-size modify is
        // rejected by the venue rather than being a no-op.
        const result = await provider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: false,
            size: '0.0004',
            orderType: 'limit',
            price: '51000',
            reduceOnly: true,
          },
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_SIZE_POSITIVE);
        expect(
          mockClientService.getExchangeClient().modify,
        ).not.toHaveBeenCalled();
      });

      it('keeps a grid-aligned reduce-only edit size intact', async () => {
        // 0.123 * 1000 === 122.99999999999999, so a naive truncation would
        // drop a whole increment.
        const result = await provider.editOrder({
          orderId: '123',
          newOrder: {
            symbol: 'BTC',
            isBuy: false,
            size: '0.123',
            orderType: 'limit',
            price: '51000',
            reduceOnly: true,
          },
        });

        expect(result.success).toBe(true);
        expect(getModifiedSize()).toBe('0.123');
      });
    });
  });

  describe('Advanced orders in open-orders state', () => {
    it('exposes trigger data for open stop and take profit orders', async () => {
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: { totalMarginUsed: '500', accountValue: '10500' },
            crossMarginSummary: {
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
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '40500',
              sz: '0.04',
              origSz: '0.04',
              oid: 501,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'Price below 45000',
              isTrigger: true,
              triggerPx: '45000',
              children: [],
              isPositionTpsl: false,
              reduceOnly: true,
              orderType: 'Stop Market',
            },
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '60000',
              sz: '0.06',
              origSz: '0.06',
              oid: 502,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'Price above 60000',
              isTrigger: true,
              triggerPx: '60000',
              children: [],
              isPositionTpsl: false,
              reduceOnly: true,
              orderType: 'Take Profit Limit',
            },
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const orders = await provider.getOpenOrders({ skipCache: true });

      const stopOrder = orders.find((order) => order.orderId === '501');
      expect(stopOrder).toMatchObject({
        symbol: 'BTC',
        side: 'sell',
        triggerOrderType: 'stop_market',
        triggerPrice: '45000',
        reduceOnly: true,
        isTrigger: true,
        size: '0.04',
      });

      const takeProfitOrder = orders.find((order) => order.orderId === '502');
      expect(takeProfitOrder).toMatchObject({
        triggerOrderType: 'take_profit_limit',
        triggerPrice: '60000',
        reduceOnly: true,
        size: '0.06',
      });
    });

    it('reports partial and full trigger orders on the position', async () => {
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: { totalMarginUsed: '500', accountValue: '10500' },
            crossMarginSummary: {
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
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '60000',
              sz: '0.04',
              origSz: '0.04',
              oid: 601,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'Price above 60000',
              isTrigger: true,
              triggerPx: '60000',
              children: [],
              isPositionTpsl: true,
              reduceOnly: true,
              orderType: 'Take Profit Limit',
            },
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '40500',
              sz: '0',
              origSz: '0',
              oid: 602,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'Price below 45000',
              isTrigger: true,
              triggerPx: '45000',
              children: [],
              isPositionTpsl: true,
              reduceOnly: true,
              orderType: 'Stop Market',
            },
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const positions = await provider.getPositions({ skipCache: true });
      const position = positions.find((pos) => pos.symbol === 'BTC');

      expect(position?.takeProfitOrders).toStrictEqual([
        {
          orderId: '601',
          direction: 'take_profit',
          orderType: 'take_profit_limit',
          triggerPrice: '60000',
          size: '0.04',
          isPartial: true,
          reduceOnly: true,
        },
      ]);
      expect(position?.stopLossOrders).toStrictEqual([
        {
          orderId: '602',
          direction: 'stop',
          orderType: 'stop_market',
          triggerPrice: '45000',
          // Position-bound stop (size 0) resolves to the whole position
          size: '0.1',
          isPartial: false,
          reduceOnly: true,
        },
      ]);
      expect(position?.takeProfitCount).toBe(1);
      expect(position?.stopLossCount).toBe(1);
    });

    it('excludes a pending order TP/SL child and never double-counts it', async () => {
      // HyperLiquid lists a normalTpsl child both nested under its parent and as
      // a top-level entry. It protects the pending order, not the position.
      const takeProfitChild = {
        coin: 'BTC',
        side: 'A',
        limitPx: '60000',
        sz: '0.05',
        origSz: '0.05',
        oid: 802,
        timestamp: 1_700_000_000_000,
        triggerCondition: 'Price above 60000',
        isTrigger: true,
        triggerPx: '60000',
        children: [],
        isPositionTpsl: false,
        reduceOnly: true,
        orderType: 'Take Profit Limit',
      };

      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: { totalMarginUsed: '500', accountValue: '10500' },
            crossMarginSummary: {
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
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              // Pending entry order carrying the TP child
              coin: 'BTC',
              side: 'B',
              limitPx: '40000',
              sz: '0.05',
              origSz: '0.05',
              oid: 801,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'N/A',
              isTrigger: false,
              triggerPx: '',
              children: [takeProfitChild],
              isPositionTpsl: false,
              reduceOnly: false,
              orderType: 'Limit',
            },
            takeProfitChild,
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const positions = await provider.getPositions({ skipCache: true });
      const position = positions.find((pos) => pos.symbol === 'BTC');

      expect(position?.takeProfitOrders).toStrictEqual([]);
      expect(position?.stopLossOrders).toStrictEqual([]);
      expect(position?.takeProfitCount).toBe(0);
      expect(position?.stopLossCount).toBe(0);
    });

    it('includes standalone partial triggers that are not position-bound', async () => {
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: { totalMarginUsed: '500', accountValue: '10500' },
            crossMarginSummary: {
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
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '60000',
              sz: '0.04',
              origSz: '0.04',
              oid: 701,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'Price above 60000',
              isTrigger: true,
              triggerPx: '60000',
              children: [],
              // Partial TP/SL is placed with 'na' grouping, so it is a
              // standalone reduce-only trigger rather than position-bound.
              isPositionTpsl: false,
              reduceOnly: true,
              orderType: 'Take Profit Limit',
            },
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const positions = await provider.getPositions({ skipCache: true });
      const position = positions.find((pos) => pos.symbol === 'BTC');

      expect(position?.takeProfitOrders).toStrictEqual([
        {
          orderId: '701',
          direction: 'take_profit',
          orderType: 'take_profit_limit',
          triggerPrice: '60000',
          size: '0.04',
          isPartial: true,
          reduceOnly: true,
        },
      ]);
      // A lone trigger is the position's take profit whether or not it is
      // position-bound, so the scalar summary field reports its price.
      expect(position?.takeProfitPrice).toBe('60000');
      expect(position?.takeProfitCount).toBe(1);
    });

    it('leaves the summary price unset when two partial take profits share the position', async () => {
      const partialTakeProfit = (oid: number, triggerPx: string) => ({
        coin: 'BTC',
        side: 'A',
        limitPx: triggerPx,
        sz: '0.04',
        origSz: '0.04',
        oid,
        timestamp: 1_700_000_000_000,
        triggerCondition: `Price above ${triggerPx}`,
        isTrigger: true,
        triggerPx,
        children: [],
        isPositionTpsl: false,
        reduceOnly: true,
        orderType: 'Take Profit Limit',
      });

      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: { totalMarginUsed: '500', accountValue: '10500' },
            crossMarginSummary: {
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
            .mockResolvedValue([
              partialTakeProfit(701, '60000'),
              partialTakeProfit(702, '62000'),
            ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const positions = await provider.getPositions({ skipCache: true });
      const position = positions.find((pos) => pos.symbol === 'BTC');

      // No single price describes two triggers; the count is what a client shows.
      expect(position?.takeProfitCount).toBe(2);
      expect(position?.takeProfitPrice).toBeUndefined();
    });
  });

  describe('updatePositionTPSL with partial sizes', () => {
    const position = {
      symbol: 'BTC',
      size: '0.1',
      entryPrice: '50000',
      positionValue: '5000',
      unrealizedPnl: '100',
      marginUsed: '500',
      leverage: { type: 'cross' as const, value: 10 },
      liquidationPrice: '45000',
      maxLeverage: 50,
      returnOnEquity: '20',
      cumulativeFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
      takeProfitCount: 0,
      stopLossCount: 0,
    };

    it('places partial TP/SL as standalone reduce-only triggers', async () => {
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        takeProfitSize: '0.04',
        stopLossPrice: '45000',
        stopLossSize: '0.06',
        position,
      });

      expect(result.success).toBe(true);
      const request = (mockClientService.getExchangeClient().order as jest.Mock)
        .mock.calls[0][0];
      // A quantity cannot be expressed under positionTpsl grouping
      expect(request.grouping).toBe('na');
      expect(request.orders).toHaveLength(2);
      expect(request.orders[0].s).toBe('0.04');
      expect(request.orders[0].r).toBe(true);
      expect(request.orders[1].s).toBe('0.06');
      expect(request.orders[1].r).toBe(true);
    });

    it('keeps whole-position TP/SL on positionTpsl grouping with size 0', async () => {
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        stopLossPrice: '45000',
        position,
      });

      expect(result.success).toBe(true);
      const request = (mockClientService.getExchangeClient().order as jest.Mock)
        .mock.calls[0][0];
      expect(request.grouping).toBe('positionTpsl');
      expect(request.orders[0].s).toBe('0');
      expect(request.orders[1].s).toBe('0');
    });

    it('mixes a partial take profit with a whole-position stop loss', async () => {
      await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        takeProfitSize: '0.04',
        stopLossPrice: '45000',
        position,
      });

      const request = (mockClientService.getExchangeClient().order as jest.Mock)
        .mock.calls[0][0];
      expect(request.grouping).toBe('na');
      expect(request.orders[0].s).toBe('0.04');
      // The stop loss without an explicit size covers the full position size
      expect(request.orders[1].s).toBe('0.1');
    });

    // TAT-3252: a partial TP/SL is a reduce-only trigger, so its size may never
    // exceed the position it protects, and the position it is measured against
    // must be the live one rather than the caller's throttled snapshot.
    // Otherwise HyperLiquid rejects the order with "Order 0: Reduce only order
    // would increase position".
    describe('reduce-only safety', () => {
      it('floors a partial size onto the size grid instead of rounding it up', async () => {
        // BTC is szDecimals 3 here, so 0.1155 rounds half-up to '0.116' —
        // more than the 0.1155 the caller asked to cover.
        await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          takeProfitSize: '0.1155',
          position: { ...position, size: '0.1155' },
        });

        const request = (
          mockClientService.getExchangeClient().order as jest.Mock
        ).mock.calls[0][0];
        expect(request.orders[0].r).toBe(true);
        expect(parseFloat(request.orders[0].s)).toBeLessThanOrEqual(0.1155);
        expect(request.orders[0].s).toBe('0.115');
      });

      it('floors a whole-position TP/SL size onto the size grid', async () => {
        // Position-bound TP/SL sends size '0', so the formatted whole-position
        // size is only reachable alongside a partial trigger.
        await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          takeProfitSize: '0.01',
          stopLossPrice: '45000',
          position: { ...position, size: '0.1155' },
        });

        const request = (
          mockClientService.getExchangeClient().order as jest.Mock
        ).mock.calls[0][0];
        // The stop loss carries no size of its own, so it covers the position.
        expect(parseFloat(request.orders[1].s)).toBeLessThanOrEqual(0.1155);
        expect(request.orders[1].s).toBe('0.115');
      });

      it('re-reads the live position when the caller snapshot is stale', async () => {
        // The snapshot says 0.1 but a concurrent fill left only 0.04 open. A
        // whole-position stop loss must cover the live size, not the snapshot.
        mockSubscriptionService.isPositionsCacheInitialized.mockReturnValue(
          true,
        );
        mockSubscriptionService.getCachedPositionsForDex = jest
          .fn()
          .mockReturnValue([{ ...position, size: '0.04' }]);

        await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          takeProfitSize: '0.04',
          stopLossPrice: '45000',
          position,
        });

        const request = (
          mockClientService.getExchangeClient().order as jest.Mock
        ).mock.calls[0][0];
        // The stop loss carries no explicit size, so it covers the position —
        // the live 0.04, not the snapshot's 0.1.
        expect(request.orders[1].s).toBe('0.04');
      });

      it('takes the trigger side from the live position when the snapshot flipped', async () => {
        // The snapshot is long but the position is now short. A trigger built
        // from the stale side would sit on the wrong side of the position and
        // increase it rather than reduce it.
        mockSubscriptionService.isPositionsCacheInitialized.mockReturnValue(
          true,
        );
        mockSubscriptionService.getCachedPositionsForDex = jest
          .fn()
          .mockReturnValue([{ ...position, size: '-0.1' }]);

        await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '40000',
          takeProfitSize: '0.04',
          position,
        });

        const request = (
          mockClientService.getExchangeClient().order as jest.Mock
        ).mock.calls[0][0];
        // Closing a short buys, so the reduce-only trigger is a buy.
        expect(request.orders[0].b).toBe(true);
      });

      it('keeps the caller snapshot when the position cache is not initialized', async () => {
        mockSubscriptionService.isPositionsCacheInitialized.mockReturnValue(
          false,
        );

        await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          takeProfitSize: '0.04',
          stopLossPrice: '45000',
          position,
        });

        const request = (
          mockClientService.getExchangeClient().order as jest.Mock
        ).mock.calls[0][0];
        expect(request.orders[1].s).toBe('0.1');
      });

      it('keeps the caller snapshot when the cache does not hold the symbol', async () => {
        // A DEX slice that has published without this symbol proves nothing
        // here: the exchange and the pre-cancel sweep are the authorities, and
        // refusing would break TP/SL updates this path previously served.
        mockSubscriptionService.isPositionsCacheInitialized.mockReturnValue(
          true,
        );
        mockSubscriptionService.getCachedPositionsForDex = jest
          .fn()
          .mockReturnValue([]);

        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          takeProfitSize: '0.04',
          stopLossPrice: '45000',
          position,
        });

        expect(result.success).toBe(true);
        const request = (
          mockClientService.getExchangeClient().order as jest.Mock
        ).mock.calls[0][0];
        expect(request.orders[1].s).toBe('0.1');
      });
    });

    it('cancels standalone partial triggers but never another order TP/SL child', async () => {
      const takeProfitChild = {
        coin: 'BTC',
        side: 'A',
        limitPx: '65000',
        sz: '0.05',
        origSz: '0.05',
        oid: 902,
        timestamp: 1_700_000_000_000,
        triggerCondition: 'Price above 65000',
        isTrigger: true,
        triggerPx: '65000',
        children: [],
        isPositionTpsl: false,
        reduceOnly: true,
        orderType: 'Take Profit Limit',
      };

      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              // Standalone partial TP previously placed for this position
              coin: 'BTC',
              side: 'A',
              limitPx: '60000',
              sz: '0.04',
              origSz: '0.04',
              oid: 901,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'Price above 60000',
              isTrigger: true,
              triggerPx: '60000',
              children: [],
              isPositionTpsl: false,
              reduceOnly: true,
              orderType: 'Take Profit Limit',
            },
            {
              // Unrelated pending entry order with its own TP child
              coin: 'BTC',
              side: 'B',
              limitPx: '40000',
              sz: '0.05',
              origSz: '0.05',
              oid: 903,
              timestamp: 1_700_000_000_000,
              triggerCondition: 'N/A',
              isTrigger: false,
              triggerPx: '',
              children: [takeProfitChild],
              isPositionTpsl: false,
              reduceOnly: false,
              orderType: 'Limit',
            },
            takeProfitChild,
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '61000',
        takeProfitSize: '0.04',
        position,
      });

      expect(mockClientService.getExchangeClient().cancel).toHaveBeenCalledWith(
        {
          cancels: [{ a: 0, o: 901 }],
        },
      );
    });

    it('uses the REST order payload for partial updates even with a warm cache', async () => {
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([]);
      const infoClient = createMockInfoClient();
      mockClientService.getInfoClient.mockReturnValue(
        infoClient as unknown as ReturnType<
          typeof mockClientService.getInfoClient
        >,
      );

      await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        takeProfitSize: '0.04',
        position,
      });

      // The cache cannot express the parent/child relationship a partial update
      // needs, so the REST payload is fetched even though the cache is warm.
      expect(infoClient.frontendOpenOrders).toHaveBeenCalled();
    });

    it('cancels standalone partial leftovers on a later whole-position update', async () => {
      // Warm cache showing a standalone (not position-bound) reduce-only
      // trigger left over from an earlier partial update.
      mockSubscriptionService.getOrdersCacheIfInitialized.mockReturnValue([
        {
          orderId: '901',
          symbol: 'BTC',
          side: 'sell',
          orderType: 'limit',
          size: '0.04',
          originalSize: '0.04',
          price: '60000',
          filledSize: '0',
          remainingSize: '0.04',
          status: 'open',
          timestamp: 1_700_000_000_000,
          detailedOrderType: 'Take Profit Limit',
          isTrigger: true,
          reduceOnly: true,
          isPositionTpsl: false,
          triggerPrice: '60000',
        },
      ]);
      const infoClient = createMockInfoClient({
        frontendOpenOrders: jest.fn().mockResolvedValue([
          {
            coin: 'BTC',
            side: 'A',
            limitPx: '60000',
            sz: '0.04',
            origSz: '0.04',
            oid: 901,
            timestamp: 1_700_000_000_000,
            triggerCondition: 'Price above 60000',
            isTrigger: true,
            triggerPx: '60000',
            children: [],
            isPositionTpsl: false,
            reduceOnly: true,
            orderType: 'Take Profit Limit',
          },
        ]),
      });
      mockClientService.getInfoClient.mockReturnValue(
        infoClient as unknown as ReturnType<
          typeof mockClientService.getInfoClient
        >,
      );

      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '61000',
        stopLossPrice: '45000',
        position,
      });

      expect(result.success).toBe(true);
      // The leftover standalone trigger must not survive beside the new
      // whole-position TP/SL orders — it would fire independently.
      expect(mockClientService.getExchangeClient().cancel).toHaveBeenCalledWith(
        {
          cancels: [{ a: 0, o: 901 }],
        },
      );
    });

    it('returns a typed error when a partial size exceeds the position', async () => {
      mockValidateOrderParams.mockImplementation(
        jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
          .validateOrderParams,
      );

      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        takeProfitSize: '0.5',
        position,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID);
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });

    it('returns a typed error when a partial size rounds to zero', async () => {
      // 0.0004 is positive and below the position, so validation passes, but it
      // formats to '0' at szDecimals: 3 — which HyperLiquid reads as a
      // whole-position trigger, silently closing the entire position.
      mockValidateOrderParams.mockImplementation(
        jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
          .validateOrderParams,
      );

      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        takeProfitSize: '0.0004',
        position,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID);
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });

    it.each([
      ['a size larger than the position', '0.5'],
      ['a size that rounds to zero', '0.0004'],
      ['a non-positive size', '0'],
    ])(
      'rejects %s without running trading setup',
      async (_label, takeProfitSize) => {
        // Trading setup can prompt a hardware wallet and write the referral /
        // builder-fee approvals on-chain. None of that should happen for an
        // update that is rejected outright.
        mockValidateOrderParams.mockImplementation(
          jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
            .validateOrderParams,
        );

        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '60000',
          takeProfitSize,
          position,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID);
        expect(
          mockClientService.getExchangeClient().setReferrer,
        ).not.toHaveBeenCalled();
      },
    );

    it('rejects a TP/SL price that rounds to zero before the pre-cancel sweep', async () => {
      mockValidateOrderParams.mockImplementation(
        jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
          .validateOrderParams,
      );

      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '0.0004',
        position,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_PRICE_POSITIVE);
      expect(
        mockClientService.getExchangeClient().cancel,
      ).not.toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().setReferrer,
      ).not.toHaveBeenCalled();
    });

    it('leaves the position protected when a partial size rounds to zero', async () => {
      // The position already has a whole-position TP/SL the sweep would cancel.
      // Rejecting the update after that sweep would strip the protection and
      // put nothing back, so the rejection has to come first.
      mockValidateOrderParams.mockImplementation(
        jest.requireActual('../../../src/utils/hyperLiquidValidation.js')
          .validateOrderParams,
      );
      // A partial update always reads the REST payload for parent/child links,
      // so that is where the sweep finds the trigger it would cancel.
      mockClientService.getInfoClient.mockReturnValue(
        createMockInfoClient({
          frontendOpenOrders: jest.fn().mockResolvedValue([
            {
              coin: 'BTC',
              side: 'A',
              limitPx: '58000',
              sz: '0',
              origSz: '0',
              oid: 777,
              timestamp: 1_700_000_000_000,
              isTrigger: true,
              triggerCondition: 'Price above 58000',
              triggerPx: '58000',
              children: [],
              isPositionTpsl: true,
              reduceOnly: true,
              orderType: 'Take Profit Limit',
            },
          ]),
        }) as unknown as ReturnType<typeof mockClientService.getInfoClient>,
      );

      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '60000',
        takeProfitSize: '0.0004',
        position,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.ORDER_TPSL_SIZE_INVALID);
      expect(
        mockClientService.getExchangeClient().cancel,
      ).not.toHaveBeenCalled();
      expect(
        mockClientService.getExchangeClient().order,
      ).not.toHaveBeenCalled();
    });
  });
});
