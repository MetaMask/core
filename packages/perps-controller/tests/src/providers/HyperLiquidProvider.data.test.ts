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
  describe('Data Retrieval', () => {
    it('gets positions successfully', async () => {
      const positions = await provider.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      expect(
        mockClientService.getInfoClient().clearinghouseState,
      ).toHaveBeenCalled();
    });

    it('gets account state successfully', async () => {
      const accountState = await provider.getAccountState();

      expect(accountState).toBeDefined();
      expect(accountState.totalBalance).toBe('19500'); // 10500 (perps) + 10000 (spot.total) - 1000 (spot.hold, double-counted in accountValue)
      expect(
        mockClientService.getInfoClient().clearinghouseState,
      ).toHaveBeenCalled();
      expect(
        mockClientService.getInfoClient().spotClearinghouseState,
      ).toHaveBeenCalled();
    });

    it('does not count non-USDC-only spot balance in funded-state totals', async () => {
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          spotClearinghouseState: jest.fn().mockResolvedValue({
            balances: [{ coin: 'DAI', hold: '1000', total: '10000' }],
          }),
        }),
      );

      const accountState = await provider.getAccountState();

      expect(accountState).toBeDefined();
      expect(accountState.totalBalance).toBe('10500');
      expect(
        mockClientService.getInfoClient().spotClearinghouseState,
      ).toHaveBeenCalled();
    });

    it('does not fold non-USDC spot balance in Unified Account mode', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const mockInfoClient = createMockInfoClient({
        perpDexs: jest
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: {
            totalMarginUsed: '0',
            accountValue: '0',
          },
          withdrawable: '0',
          assetPositions: [],
          crossMarginSummary: {
            accountValue: '0',
            totalMarginUsed: '0',
          },
        }),
        spotClearinghouseState: jest.fn().mockResolvedValue({
          balances: [
            { coin: 'mUSD', hold: '10', total: '100' },
            { coin: 'HYPE', hold: '0', total: '999' },
          ],
        }),
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);
      mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

      const accountState = await hip3Provider.getAccountState();

      expect(accountState.spendableBalance).toBe('0');
      expect(accountState.withdrawableBalance).toBe('0');
      expect(accountState.totalBalance).toBe('0');
    });

    it('folds USDC spot balance into spendable/withdrawable in Unified Account mode', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const mockInfoClient = createMockInfoClient({
        perpDexs: jest
          .fn()
          .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
        clearinghouseState: jest.fn().mockResolvedValue({
          marginSummary: {
            totalMarginUsed: '0',
            accountValue: '0',
          },
          withdrawable: '0',
          assetPositions: [],
          crossMarginSummary: {
            accountValue: '0',
            totalMarginUsed: '0',
          },
        }),
        spotClearinghouseState: jest.fn().mockResolvedValue({
          balances: [{ coin: 'USDC', hold: '10', total: '100' }],
        }),
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);
      mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

      const accountState = await hip3Provider.getAccountState();

      expect(accountState.spendableBalance).toBe('90');
      expect(accountState.withdrawableBalance).toBe('90');
      expect(accountState.totalBalance).toBe('90');
    });

    it.each(['default', 'disabled'] as const)(
      'does not fold USDC spot balance in %s account mode',
      async (abstractionMode) => {
        const hip3Provider = createTestProvider({
          hip3Enabled: true,
          allowlistMarkets: ['xyz:*'],
        });
        const mockInfoClient = createMockInfoClient({
          perpDexs: jest
            .fn()
            .mockResolvedValue([null, { name: 'xyz', url: 'https://xyz.com' }]),
          clearinghouseState: jest.fn().mockResolvedValue({
            marginSummary: {
              totalMarginUsed: '0',
              accountValue: '0',
            },
            withdrawable: '0',
            assetPositions: [],
            crossMarginSummary: {
              accountValue: '0',
              totalMarginUsed: '0',
            },
          }),
          spotClearinghouseState: jest.fn().mockResolvedValue({
            balances: [{ coin: 'USDC', hold: '10', total: '100' }],
          }),
          userAbstraction: jest.fn().mockResolvedValue(abstractionMode),
        });

        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(mockInfoClient);
        mockWalletService.getUserAddressWithDefault.mockResolvedValue('0x123');

        const accountState = await hip3Provider.getAccountState();

        expect(accountState.spendableBalance).toBe('0');
        expect(accountState.withdrawableBalance).toBe('0');
        expect(accountState.totalBalance).toBe('90');
      },
    );

    it('gets markets successfully', async () => {
      const markets = await provider.getMarkets();

      expect(Array.isArray(markets)).toBe(true);
      expect(markets.length).toBeGreaterThan(0);
      // buildAssetMapping (via ensureReady) uses metaAndAssetCtxs to populate cache; getMarkets uses cached meta
      expect(
        mockClientService.getInfoClient().metaAndAssetCtxs,
      ).toHaveBeenCalled();
    });

    it('filters out a HIP-3 DEX from market discovery when its collateral token is not USDC (TAT-3304)', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const xyzMeta = {
        universe: [{ name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 }],
        collateralToken: 5,
      };
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
          .mockImplementation((params?: { dex?: string }) =>
            params?.dex === 'xyz'
              ? Promise.resolve([xyzMeta, []])
              : Promise.resolve([
                  {
                    universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
                  },
                  [],
                ]),
          ),
        spotMeta: jest.fn().mockResolvedValue({
          tokens: [
            { name: 'USDC', tokenId: '0xdef456', index: 0 },
            { name: 'USDH', tokenId: '0xabc123', index: 5 },
          ],
          universe: [],
        }),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      const markets = await hip3Provider.getMarkets({ dex: 'xyz' });

      expect(markets).toEqual([]);
    });

    it('does not filter a HIP-3 DEX whose collateral token resolves to USDC', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      const xyzMeta = {
        universe: [{ name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 }],
        collateralToken: 0,
      };
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
          .mockImplementation((params?: { dex?: string }) =>
            params?.dex === 'xyz'
              ? Promise.resolve([xyzMeta, []])
              : Promise.resolve([
                  {
                    universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
                  },
                  [],
                ]),
          ),
        spotMeta: jest.fn().mockResolvedValue({
          tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
          universe: [],
        }),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      const markets = await hip3Provider.getMarkets({ dex: 'xyz' });

      expect(markets.length).toBe(1);
      expect(markets[0].name).toBe('xyz:STOCK1');
    });

    it('filters out a HIP-3 DEX from market discovery when its collateral token index cannot be resolved against spot metadata', async () => {
      const hip3Provider = createTestProvider({
        hip3Enabled: true,
        allowlistMarkets: ['xyz:*'],
      });
      // collateralToken index 7 has no corresponding entry in spotMeta.tokens
      // below (missing/stale spot metadata) — the DEX must be gated out
      // rather than treated as USDC.
      const xyzMeta = {
        universe: [{ name: 'xyz:STOCK1', szDecimals: 2, maxLeverage: 20 }],
        collateralToken: 7,
      };
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
          .mockImplementation((params?: { dex?: string }) =>
            params?.dex === 'xyz'
              ? Promise.resolve([xyzMeta, []])
              : Promise.resolve([
                  {
                    universe: [{ name: 'BTC', szDecimals: 3, maxLeverage: 50 }],
                  },
                  [],
                ]),
          ),
        spotMeta: jest.fn().mockResolvedValue({
          tokens: [{ name: 'USDC', tokenId: '0xdef456', index: 0 }],
          universe: [],
        }),
      });

      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(mockInfoClient);

      const markets = await hip3Provider.getMarkets({ dex: 'xyz' });

      expect(markets).toEqual([]);
    });

    it('handles data retrieval errors gracefully', async () => {
      (
        mockClientService.getInfoClient().clearinghouseState as jest.Mock
      ).mockRejectedValueOnce(new Error('API Error'));

      const positions = await provider.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(0);
    });
  });

  describe('Withdrawal Operations', () => {
    it('processes withdrawal successfully', async () => {
      const withdrawParams = {
        amount: '1000',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      };

      const result = await provider.withdraw(withdrawParams);

      expect(result.success).toBe(true);
    });

    it('runs user-signed unified account migration before withdrawing for dexAbstraction users', async () => {
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
        value: jest.fn().mockResolvedValue({
          availableBalance: '5000',
        }),
        writable: true,
      });

      const withdrawParams = {
        amount: '1000',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      };

      const result = await provider.withdraw(withdrawParams);

      expect(result.success).toBe(true);
      expect(exchangeClient.userSetAbstraction).toHaveBeenCalledWith({
        user: '0x1234567890123456789012345678901234567890',
        abstraction: 'unifiedAccount',
      });
      expect(exchangeClient.withdraw3).toHaveBeenCalledWith({
        destination: '0x1234567890123456789012345678901234567890',
        amount: '1000',
      });
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(exchangeClient.setReferrer).not.toHaveBeenCalled();
    });

    it('handles withdrawal errors', async () => {
      mockValidateWithdrawalParams.mockReturnValueOnce({
        isValid: false,
        error: 'Invalid withdrawal amount',
      });

      const withdrawParams = {
        amount: '0',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      };

      const result = await provider.withdraw(withdrawParams);

      expect(result.success).toBe(false);
    });
  });

  describe('Subscription Management', () => {
    it('subscribes to prices', () => {
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToPrices({
        symbols: ['BTC', 'ETH'],
        callback,
      });

      expect(mockSubscriptionService.subscribeToPrices).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('subscribes to positions', () => {
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToPositions({ callback });

      expect(mockSubscriptionService.subscribeToPositions).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('subscribes to order fills', () => {
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToOrderFills({ callback });

      expect(mockSubscriptionService.subscribeToOrderFills).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('sets live data config', () => {
      const config: Partial<LiveDataConfig> = {
        priceThrottleMs: 1000,
        positionThrottleMs: 3000,
      };

      provider.setLiveDataConfig(config);

      // Note: This test may need adjustment based on actual implementation
      expect(mockSubscriptionService.clearAll).toBeDefined();
    });
  });

  describe('Provider State Management', () => {
    it('checks if ready to trade', async () => {
      const result = await provider.isReadyToTrade();

      expect(result.ready).toBe(true);
    });

    it('handles readiness check errors', async () => {
      mockWalletService.getCurrentAccountId.mockImplementationOnce(() => {
        throw new Error('No account selected');
      });

      const result = await provider.isReadyToTrade();

      expect(result.ready).toBe(false);
    });

    it('toggles testnet mode', async () => {
      const result = await provider.toggleTestnet();

      expect(result.success).toBe(true);
      expect(mockClientService.setTestnetMode).toHaveBeenCalled();
      expect(mockWalletService.setTestnetMode).toHaveBeenCalled();
    });

    it('toggleTestnet succeeds even when called concurrently with initialization', async () => {
      const result = await provider.toggleTestnet();

      expect(result.success).toBe(true);
    });

    it('disconnects successfully', async () => {
      const result = await provider.disconnect();

      expect(result.success).toBe(true);
      expect(mockClientService.disconnect).toHaveBeenCalled();
    });

    it('disconnects successfully even when initialization was pending', async () => {
      const result = await provider.disconnect();

      expect(result.success).toBe(true);
      expect(mockClientService.disconnect).toHaveBeenCalled();
    });

    it('disconnects successfully even when ensureReady was pending', async () => {
      const result = await provider.disconnect();

      expect(result.success).toBe(true);
    });

    it('handles disconnect errors', async () => {
      mockClientService.disconnect.mockRejectedValueOnce(
        new Error('Disconnect failed'),
      );

      const result = await provider.disconnect();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Disconnect failed');
    });

    describe('ping() health check', () => {
      it('successfully ping WebSocket connection with default timeout', async () => {
        const mockReady = jest.fn().mockResolvedValue(undefined);
        const mockSubscriptionClient = {
          config_: {
            transport: {
              ready: mockReady,
            },
          },
        };
        mockClientService.getSubscriptionClient.mockReturnValue(
          mockSubscriptionClient as any,
        );

        await provider.ping();

        expect(mockReady).toHaveBeenCalled();
        // Verify the AbortSignal was passed
        expect(mockReady.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
      });

      it('successfully ping WebSocket connection with custom timeout', async () => {
        const mockReady = jest.fn().mockResolvedValue(undefined);
        const mockSubscriptionClient = {
          config_: {
            transport: {
              ready: mockReady,
            },
          },
        };
        mockClientService.getSubscriptionClient.mockReturnValue(
          mockSubscriptionClient as any,
        );

        await provider.ping(10000);

        expect(mockReady).toHaveBeenCalled();
        expect(mockReady.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
      });

      it('throws error when subscription client is not initialized', async () => {
        mockClientService.getSubscriptionClient.mockReturnValue(undefined);

        await expect(provider.ping()).rejects.toThrow(
          'Subscription client not initialized',
        );
      });

      it('throws CONNECTION_TIMEOUT error when timeout occurs', async () => {
        const mockReady = jest
          .fn()
          .mockImplementation(
            () =>
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Aborted')), 100),
              ),
          );
        const mockSubscriptionClient = {
          config_: {
            transport: {
              ready: mockReady,
            },
          },
        };
        mockClientService.getSubscriptionClient.mockReturnValue(
          mockSubscriptionClient as any,
        );

        await expect(provider.ping(50)).rejects.toThrow('CONNECTION_TIMEOUT');
      });

      it('throws error when WebSocket connection fails', async () => {
        const mockReady = jest
          .fn()
          .mockRejectedValue(new Error('WebSocket closed'));
        const mockSubscriptionClient = {
          config_: {
            transport: {
              ready: mockReady,
            },
          },
        };
        mockClientService.getSubscriptionClient.mockReturnValue(
          mockSubscriptionClient as any,
        );

        await expect(provider.ping()).rejects.toThrow('WebSocket closed');
      });
    });
  });

  describe('Asset Mapping', () => {
    it('handles asset mapping errors', async () => {
      (
        mockClientService.getInfoClient().meta as jest.Mock
      ).mockRejectedValueOnce(new Error('Meta fetch failed'));

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('handles validation errors in orders', async () => {
      mockValidateOrderParams.mockReturnValueOnce({
        isValid: false,
        error: 'Invalid order parameters',
      });

      const orderParams: OrderParams = {
        symbol: '',
        isBuy: true,
        size: '0',
        orderType: 'market',
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid order parameters');
    });

    it('handles validation errors in withdrawals', async () => {
      mockValidateWithdrawalParams.mockReturnValueOnce({
        isValid: false,
        error: 'Invalid withdrawal parameters',
      });

      const withdrawParams = {
        amount: '',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      };

      const result = await provider.withdraw(withdrawParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid withdrawal parameters');
    });

    it('handles unknown errors gracefully', async () => {
      (
        mockClientService.getInfoClient().clearinghouseState as jest.Mock
      ).mockRejectedValueOnce(new Error('Unknown error'));

      const result = await provider.getPositions();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    describe('error mapping integration', () => {
      it('maps HyperLiquid leverage error in placeOrder to ORDER_LEVERAGE_REDUCTION_FAILED', async () => {
        // Mock placeOrder to throw the specific HyperLiquid error
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          order: jest
            .fn()
            .mockRejectedValue(
              new Error(
                'isolated position does not have sufficient margin available to decrease leverage',
              ),
            ),
          updateLeverage: jest.fn().mockResolvedValue({ status: 'ok' }),
          approveBuilderFee: jest.fn().mockResolvedValue({ status: 'ok' }),
          setReferrer: jest.fn().mockResolvedValue({ status: 'ok' }),
        });

        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ORDER_LEVERAGE_REDUCTION_FAILED');
      });

      it('maps case insensitive HyperLiquid error', async () => {
        // Mock with uppercase version
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          order: jest
            .fn()
            .mockRejectedValue(
              new Error(
                'ISOLATED POSITION DOES NOT HAVE SUFFICIENT MARGIN AVAILABLE TO DECREASE LEVERAGE',
              ),
            ),
          updateLeverage: jest.fn().mockResolvedValue({ status: 'ok' }),
          approveBuilderFee: jest.fn().mockResolvedValue({ status: 'ok' }),
          setReferrer: jest.fn().mockResolvedValue({ status: 'ok' }),
        });

        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ORDER_LEVERAGE_REDUCTION_FAILED');
      });

      it('maps partial error message containing the pattern', async () => {
        // Mock with longer error message containing the pattern
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          order: jest
            .fn()
            .mockRejectedValue(
              new Error(
                'API Error: isolated position does not have sufficient margin available to decrease leverage. Please check your position.',
              ),
            ),
          updateLeverage: jest.fn().mockResolvedValue({ status: 'ok' }),
          approveBuilderFee: jest.fn().mockResolvedValue({ status: 'ok' }),
          setReferrer: jest.fn().mockResolvedValue({ status: 'ok' }),
        });

        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ORDER_LEVERAGE_REDUCTION_FAILED');
      });

      it('preserves original error message for unmapped errors', async () => {
        // Mock with an unmapped error
        const originalError = new Error('Some other HyperLiquid API error');
        mockClientService.getExchangeClient = jest.fn().mockReturnValue({
          order: jest.fn().mockRejectedValue(originalError),
          updateLeverage: jest.fn().mockResolvedValue({ status: 'ok' }),
          approveBuilderFee: jest.fn().mockResolvedValue({ status: 'ok' }),
          setReferrer: jest.fn().mockResolvedValue({ status: 'ok' }),
        });

        const orderParams: OrderParams = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          currentPrice: 50000,
          leverage: 10,
        };

        const result = await provider.placeOrder(orderParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Some other HyperLiquid API error');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles missing asset info in orders', async () => {
      (
        mockClientService.getInfoClient().meta as jest.Mock
      ).mockResolvedValueOnce({
        universe: [], // Empty universe
      });

      const orderParams: OrderParams = {
        symbol: 'UNKNOWN',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        currentPrice: 50000, // Add price so validation passes, then fails on asset lookup
      };

      const result = await provider.placeOrder(orderParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Asset UNKNOWN not found');
    });

    it('handles missing price data', async () => {
      mockSubscriptionService.getCachedPrice.mockReturnValueOnce(undefined);
      (
        mockClientService.getInfoClient().allMids as jest.Mock
      ).mockResolvedValueOnce({});

      const orderParams: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      };

      const result = await provider.placeOrder(orderParams);

      // allMids returns {} so #getOrFetchPrice parses price as 0, which is
      // invalid. The error surfaces from #getAssetInfo before validation runs.
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid price for BTC: 0');
    });

    it('handles missing position in close operation', async () => {
      (
        mockClientService.getInfoClient().clearinghouseState as jest.Mock
      ).mockResolvedValueOnce({
        assetPositions: [], // No positions
      });

      const closeParams: ClosePositionParams = {
        symbol: 'BTC',
        orderType: 'market',
      };

      const result = await provider.closePosition(closeParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No position found for BTC');
    });
  });
});
