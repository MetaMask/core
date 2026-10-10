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
  createMockExchangeClient,
  createMockInfoClient,
} from '../../helpers/providerMocks.js';
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
  let mockInfoClient: ReturnType<typeof createMockInfoClient>;

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
    mockInfoClient = createMockInfoClient();
    mockClientService = {
      initialize: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
      isTestnetMode: jest.fn().mockReturnValue(false),
      ensureInitialized: jest.fn(),
      getExchangeClient: jest.fn().mockReturnValue(createMockExchangeClient()),
      getInfoClient: jest.fn().mockReturnValue(mockInfoClient),
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
      isMainAccountSignerReady: jest.fn().mockReturnValue(true),
      requiresSignatureConfirmation: jest.fn().mockReturnValue(false),
    } as Partial<HyperLiquidWalletService> as jest.Mocked<HyperLiquidWalletService>;

    mockSubscriptionService = {
      subscribeToPrices: jest.fn().mockResolvedValue(jest.fn()), // Returns Promise
      subscribeToPositions: jest.fn().mockReturnValue(jest.fn()), // Returns function directly
      subscribeToOrderFills: jest.fn().mockReturnValue(jest.fn()), // Returns function directly
      clearAll: jest.fn(),
      isPositionsCacheInitialized: jest.fn().mockReturnValue(false),
      getCachedPositionsForDex: jest.fn().mockReturnValue(null),
      getFreshPositionsForAllDexs: jest.fn().mockReturnValue(null),
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

  describe('getAccountSupport', () => {
    it('returns supported for a standard Hyperliquid account', async () => {
      mockInfoClient.userToMultiSigSigners.mockResolvedValue(null);

      const result = await provider.getAccountSupport();

      expect(result).toEqual({ isSupported: true });
    });

    it('returns the multi-signature reason for an unsupported account', async () => {
      mockInfoClient.userToMultiSigSigners.mockResolvedValue({
        authorizedUsers: ['0x1234567890123456789012345678901234567890'],
        threshold: 1,
      });

      const result = await provider.getAccountSupport();

      expect(result).toEqual({
        isSupported: false,
        reason: 'multi_sig_account',
      });
    });

    it('fails open when Hyperliquid cannot report account support', async () => {
      mockInfoClient.userToMultiSigSigners.mockRejectedValue(
        new Error('Network unavailable'),
      );

      const result = await provider.getAccountSupport();

      expect(result).toEqual({ isSupported: true });
    });

    it('coalesces and caches successful support checks', async () => {
      mockInfoClient.userToMultiSigSigners.mockResolvedValue(null);

      const results = await Promise.all([
        provider.getAccountSupport(),
        provider.getAccountSupport(),
      ]);
      const cachedResult = await provider.getAccountSupport();

      expect(results).toEqual([{ isSupported: true }, { isSupported: true }]);
      expect(cachedResult).toEqual({ isSupported: true });
      expect(mockInfoClient.userToMultiSigSigners).toHaveBeenCalledTimes(1);
    });

    it('retries support checks after a transient failure', async () => {
      mockInfoClient.userToMultiSigSigners
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce({
          authorizedUsers: ['0x1234567890123456789012345678901234567890'],
          threshold: 1,
        });

      const firstResult = await provider.getAccountSupport();
      const secondResult = await provider.getAccountSupport();

      expect(firstResult).toEqual({ isSupported: true });
      expect(secondResult).toEqual({
        isSupported: false,
        reason: 'multi_sig_account',
      });
      expect(mockInfoClient.userToMultiSigSigners).toHaveBeenCalledTimes(2);
    });

    it('retries support checks after the info client becomes available', async () => {
      const reconnectingProvider = createTestProvider({
        hip3Enabled: true,
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
        ],
      });
      await reconnectingProvider.getAccountSupport();
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      );
      const recoveredInfoClient = createMockInfoClient({
        userToMultiSigSigners: jest.fn().mockResolvedValue({
          authorizedUsers: ['0x1234567890123456789012345678901234567890'],
          threshold: 1,
        }),
      });
      mockClientService.getInfoClient = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error(PERPS_ERROR_CODES.CLIENT_NOT_INITIALIZED);
        })
        .mockReturnValue(recoveredInfoClient);

      const firstResult = await reconnectingProvider.getAccountSupport();
      const secondResult = await reconnectingProvider.getAccountSupport();

      expect(firstResult).toEqual({ isSupported: true });
      expect(secondResult).toEqual({
        isSupported: false,
        reason: 'multi_sig_account',
      });
      expect(recoveredInfoClient.userToMultiSigSigners).toHaveBeenCalledTimes(
        1,
      );
    });

    it('blocks order signing for an unsupported account', async () => {
      const exchangeClient = createMockExchangeClient();
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockInfoClient.userToMultiSigSigners.mockResolvedValue({
        authorizedUsers: ['0x1234567890123456789012345678901234567890'],
        threshold: 1,
      });

      await expect(
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });

      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('blocks withdrawal signing for an unsupported account', async () => {
      const exchangeClient = createMockExchangeClient();
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockInfoClient.userToMultiSigSigners.mockResolvedValue({
        authorizedUsers: ['0x1234567890123456789012345678901234567890'],
        threshold: 1,
      });

      await expect(
        provider.withdraw({
          amount: '100',
          destination: '0x1234567890123456789012345678901234567890' as Hex,
          assetId:
            'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
        }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });

      expect(exchangeClient.withdraw3).not.toHaveBeenCalled();
    });

    it('blocks an action when the selected account changes during its support check', async () => {
      const switchedAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const exchangeClient = createMockExchangeClient();
      let resolveProbe!: (value: null) => void;
      let markProbeStarted!: () => void;
      const probeResult = new Promise<null>((resolve) => {
        resolveProbe = resolve;
      });
      const probeStarted = new Promise<void>((resolve) => {
        markProbeStarted = resolve;
      });
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockInfoClient.userToMultiSigSigners.mockImplementation(() => {
        markProbeStarted();
        return probeResult;
      });

      const withdrawal = provider.withdraw({
        amount: '100',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      });
      await probeStarted;
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        switchedAddress,
      );
      resolveProbe(null);

      await expect(withdrawal).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(exchangeClient.withdraw3).not.toHaveBeenCalled();
    });

    it('does not migrate the account selected after a delayed abstraction read', async () => {
      const switchedAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const exchangeClient = createMockExchangeClient();
      let resolveAbstraction!: (value: 'default') => void;
      let markAbstractionReadStarted!: () => void;
      const delayedAbstraction = new Promise<'default'>((resolve) => {
        resolveAbstraction = resolve;
      });
      const abstractionReadStarted = new Promise<void>((resolve) => {
        markAbstractionReadStarted = resolve;
      });
      const userAbstraction = jest
        .fn()
        // Browsing initialization observes the legacy mode and defers.
        .mockResolvedValueOnce('default')
        // Action-time setup is the read whose result must stay bound to A.
        .mockImplementationOnce(() => {
          markAbstractionReadStarted();
          return delayedAbstraction;
        });
      mockWalletService.requiresSignatureConfirmation.mockReturnValue(true);
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction,
          userToMultiSigSigners: jest.fn().mockResolvedValue(null),
        }),
      );

      const order = provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      });
      await abstractionReadStarted;
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        switchedAddress,
      );
      resolveAbstraction('default');

      await expect(order).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(exchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('does not update leverage or place an order after a delayed account read switches accounts', async () => {
      const switchedAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const exchangeClient = createMockExchangeClient();
      let resolvePositions!: (
        value: Awaited<ReturnType<typeof mockInfoClient.clearinghouseState>>,
      ) => void;
      let markPositionsReadStarted!: () => void;
      const positionsReadStarted = new Promise<void>((resolve) => {
        markPositionsReadStarted = resolve;
      });
      const delayedPositions = new Promise<
        Awaited<ReturnType<typeof mockInfoClient.clearinghouseState>>
      >((resolve) => {
        resolvePositions = resolve;
      });
      const readyState = await mockInfoClient.clearinghouseState({
        user: '0x1234567890123456789012345678901234567890',
      });
      const guardedInfoClient = createMockInfoClient({
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
        userToMultiSigSigners: jest.fn().mockResolvedValue(null),
      });
      guardedInfoClient.clearinghouseState
        // Default-margin-mode resolution after trading readiness.
        .mockImplementationOnce(() => {
          markPositionsReadStarted();
          return delayedPositions;
        });
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).get.mockReturnValue({
        attempted: true,
        enabled: true,
        timestamp: Date.now(),
      });
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).getReferral.mockReturnValue({ attempted: true, success: true });
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).getBuilderFee.mockReturnValue({ attempted: true, success: true });
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest
        .fn()
        .mockReturnValue(guardedInfoClient);

      const order = provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        leverage: 5,
        orderType: 'market',
      });
      await positionsReadStarted;
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        switchedAddress,
      );
      resolvePositions(readyState);

      await expect(order).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      });
      expect(exchangeClient.updateLeverage).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('blocks margin and DEX-transfer signing for an unsupported account', async () => {
      const exchangeClient = createMockExchangeClient();
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockInfoClient.userToMultiSigSigners.mockResolvedValue({
        authorizedUsers: ['0x1234567890123456789012345678901234567890'],
        threshold: 1,
      });

      await expect(
        provider.updateMargin({ symbol: 'BTC', amount: '-1' }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });
      await expect(
        provider.transferBetweenDexs({
          sourceDex: '',
          destinationDex: 'xyz',
          amount: '10',
        }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });

      expect(exchangeClient.updateIsolatedMargin).not.toHaveBeenCalled();
      expect(exchangeClient.sendAsset).not.toHaveBeenCalled();
    });

    it('blocks order signing when action-time setup detects multi-signature support', async () => {
      mockWalletService.requiresSignatureConfirmation.mockReturnValue(true);
      const exchangeClient = createMockExchangeClient();
      const userToMultiSigSigners = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce({
          authorizedUsers: ['0x1234567890123456789012345678901234567890'],
          threshold: 1,
        });
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
          userToMultiSigSigners,
        }),
      );

      await expect(
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });

      expect(userToMultiSigSigners).toHaveBeenCalledTimes(2);
      expect(exchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      expect(exchangeClient.approveBuilderFee).not.toHaveBeenCalled();
      expect(exchangeClient.order).not.toHaveBeenCalled();
    });

    it('blocks withdrawal signing when action-time setup gets an authoritative multi-signature rejection', async () => {
      mockWalletService.requiresSignatureConfirmation.mockReturnValue(true);
      const exchangeClient = createMockExchangeClient({
        agentSetAbstraction: jest
          .fn()
          .mockRejectedValue(new Error('ApiRequestError: Multi-sig required')),
      });
      const userToMultiSigSigners = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce(null);
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
          userToMultiSigSigners,
        }),
      );

      await expect(
        provider.withdraw({
          amount: '100',
          destination: '0x1234567890123456789012345678901234567890' as Hex,
          assetId:
            'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
        }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });

      expect(userToMultiSigSigners).toHaveBeenCalledTimes(2);
      expect(exchangeClient.agentSetAbstraction).toHaveBeenCalledWith({
        abstraction: 'u',
      });
      expect(exchangeClient.withdraw3).not.toHaveBeenCalled();
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).not.toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('does not re-probe a transient support failure when setup learns nothing new', async () => {
      const exchangeClient = createMockExchangeClient();
      const userToMultiSigSigners = jest
        .fn()
        .mockRejectedValue(new Error('Network unavailable'));
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
          userToMultiSigSigners,
        }),
      );

      await expect(
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
        }),
      ).resolves.toMatchObject({ success: true });

      expect(userToMultiSigSigners).toHaveBeenCalledTimes(1);
      expect(exchangeClient.order).toHaveBeenCalledTimes(1);
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
        // The main account cannot sign.
        mockWalletService.isMainAccountSignerReady.mockReturnValue(false);

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
      }

      let testableProvider: ProviderWithMarginCalc;

      beforeEach(() => {
        testableProvider = provider as unknown as ProviderWithMarginCalc;
      });

      it('calculates total margin when increasing existing long position', async () => {
        // Arrange
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          {
            symbol: 'BTC',
            size: '1.0', // Existing long position
            marginUsed: '5000',
          },
        ] as never);

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
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          {
            symbol: 'BTC',
            size: '1.0', // Existing long position
            marginUsed: '5000',
          },
        ] as never);

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
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([]);

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
        mockSubscriptionService.getCachedPositionsForDex.mockReturnValue([
          {
            symbol: 'ETH',
            size: '-5.0', // Existing short position
            marginUsed: '3000',
          },
        ] as never);

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

    it('waits for in-flight then runs its own attempt when no cache was written (deferred migration case)', async () => {
      // Scenario: another provider's init-time call (allowUserSigning=false)
      // hit the defer branch and finished without writing the
      // cache. Our caller is action-time (allowUserSigning=true via withdraw)
      // and must not skip the migration just because another instance was
      // mid-setup.
      let resolveInFlight: () => void = () => undefined;
      const inFlightPromise = new Promise<void>((resolve) => {
        resolveInFlight = resolve;
      });
      // Only the first unified-account check sees the other instance's lock.
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).isInFlight.mockImplementationOnce((operationType) =>
        operationType === 'unifiedAccount' ? inFlightPromise : undefined,
      );
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
          userAbstraction: jest.fn().mockResolvedValue('default'),
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
      expect(exchangeClient.agentSetAbstraction).toHaveBeenCalledWith({
        abstraction: 'u',
      });
    });

    it('lets only one of several waiters take the lock after an attempt that cached nothing', async () => {
      // A real lock and cache, so waiters see each other's writes.
      const mockedCache = TradingReadinessCache as jest.Mocked<
        typeof TradingReadinessCache
      >;
      const locks = new Map<string, Promise<void>>();
      const cache = new Map<string, { attempted: boolean; enabled: boolean }>();
      mockedCache.isInFlight.mockImplementation((operationType) =>
        locks.get(operationType),
      );
      mockedCache.setInFlight.mockImplementation((operationType) => {
        let release: () => void = () => undefined;
        locks.set(
          operationType,
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        );
        return () => {
          locks.delete(operationType);
          release();
        };
      });
      mockedCache.get.mockImplementation((network) => cache.get(network));
      mockedCache.set.mockImplementation((network, _user, result) => {
        cache.set(network, result);
      });
      // A hardware wallet defers the migration at init, caching nothing.
      mockWalletService.requiresSignatureConfirmation.mockReturnValue(true);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
        }),
      );
      // Completed DEX discovery keeps init memoized, so each withdrawal goes
      // straight to its own action-time migration check.
      const readyProvider = createTestProvider({
        hip3Enabled: true,
        initialAssetMapping: [
          ['BTC', 0],
          ['ETH', 1],
        ],
      });
      await readyProvider.getMarketDataWithPrices();
      mockedCache.isInFlight.mockClear();
      // Another provider's attempt holds the lock and caches nothing.
      const releaseHolder = mockedCache.setInFlight(
        'unifiedAccount',
        'mainnet',
        USER_ADDRESS,
      );

      let activeMigrations = 0;
      let maxActiveMigrations = 0;
      const exchangeClient = createMockExchangeClient({
        agentSetAbstraction: jest.fn().mockImplementation(async () => {
          activeMigrations += 1;
          maxActiveMigrations = Math.max(maxActiveMigrations, activeMigrations);
          await Promise.resolve();
          activeMigrations -= 1;
          return { status: 'ok' };
        }),
      });
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(exchangeClient);
      Object.defineProperty(readyProvider, 'getAccountState', {
        value: jest.fn().mockResolvedValue({ availableBalance: '5000' }),
        writable: true,
      });
      const withdrawParams = {
        amount: '100',
        destination: '0x1234567890123456789012345678901234567890' as Hex,
        assetId:
          'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
      };

      const withdrawals = Promise.all([
        readyProvider.withdraw(withdrawParams),
        readyProvider.withdraw(withdrawParams),
      ]);
      // Release the holder only once both withdrawals wait on it.
      const waiters = (): number =>
        mockedCache.isInFlight.mock.calls.filter(
          ([operationType]) => operationType === 'unifiedAccount',
        ).length;
      for (let i = 0; i < 50 && waiters() < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(waiters()).toBe(2);
      releaseHolder();
      await withdrawals;

      expect(maxActiveMigrations).toBe(1);
      expect(exchangeClient.agentSetAbstraction).toHaveBeenCalledTimes(1);
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

    // `dexAbstraction` is a retired mode HyperLiquid no longer returns; if it
    // ever resurfaces it is treated like any other unknown mode.
    it.each(['futureMode', 'dexAbstraction'])(
      'skips migration and does not cache success for unknown abstraction mode %s',
      async (mode) => {
        // Arrange
        const mockExchangeClient = createMockExchangeClient();
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            userAbstraction: jest.fn().mockResolvedValue(mode),
          }),
        );
        mockClientService.getExchangeClient = jest
          .fn()
          .mockReturnValue(mockExchangeClient);

        // Act
        await provider.getMarketDataWithPrices();

        // Assert - fail closed for unknown modes rather than silently forcing 'u'
        expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
        expect(
          (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
            .set,
        ).not.toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
          attempted: true,
          enabled: true,
        });
        expect(mockPlatformDependencies.debugLogger.log).toHaveBeenCalledWith(
          'HyperLiquidProvider: Unknown abstraction mode, skipping Unified Account migration',
          expect.objectContaining({ mode }),
        );
      },
    );

    // ─────────────────────────────────────────────────
    // Hyperliquid multi-sig accounts (TAT-3214)
    //
    // Hyperliquid rejects every single-signer exchange write for an account
    // that was converted to multi-sig with "ApiRequestError: Multi-sig
    // required". Attempting the migration surfaced that error on the Perps
    // tab on every entry.
    // ─────────────────────────────────────────────────

    it('skips unified account migration for Hyperliquid multi-sig accounts', async () => {
      // Arrange - migratable mode, but the account has a multi-sig signer set
      const mockExchangeClient = createMockExchangeClient();
      const userToMultiSigSigners = jest.fn().mockResolvedValue({
        authorizedUsers: ['0xabc0000000000000000000000000000000000001'],
        threshold: 2,
      });
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
          userToMultiSigSigners,
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - the signer set was queried and no write was attempted
      expect(userToMultiSigSigners).toHaveBeenCalledWith({
        user: USER_ADDRESS,
      });
      expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      // No migration_required event — the migration is not possible at all.
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).not.toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({ status: 'migration_required' }),
      );
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({
          status: 'not_applicable',
          error_message: 'multi_sig_account',
        }),
      );
    });

    it('checks support for the account captured by unified account setup', async () => {
      const switchedAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
      const mockExchangeClient = createMockExchangeClient();
      const userToMultiSigSigners = jest
        .fn()
        .mockImplementation(({ user }: { user: string }) =>
          Promise.resolve(
            user === USER_ADDRESS
              ? {
                  authorizedUsers: [
                    '0xabc0000000000000000000000000000000000001',
                  ],
                  threshold: 2,
                }
              : null,
          ),
        );
      const userAbstraction = jest.fn().mockImplementation(async () => {
        mockWalletService.getUserAddressWithDefault.mockResolvedValue(
          switchedAddress,
        );
        return 'default';
      });
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction,
          userToMultiSigSigners,
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      await provider.getMarketDataWithPrices();

      expect(userToMultiSigSigners).toHaveBeenCalledWith({
        user: USER_ADDRESS,
      });
      expect(userToMultiSigSigners).not.toHaveBeenCalledWith({
        user: switchedAddress,
      });
      expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: false,
      });
    });

    it('caches attempted-but-not-enabled readiness for Hyperliquid multi-sig accounts', async () => {
      // Arrange
      const mockCompleteInFlight = jest.fn();
      (
        TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
      ).setInFlight.mockReturnValue(mockCompleteInFlight);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
          userToMultiSigSigners: jest.fn().mockResolvedValue({
            authorizedUsers: ['0xabc0000000000000000000000000000000000001'],
            threshold: 2,
          }),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(createMockExchangeClient());

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - final state, so the next entry short-circuits instead of
      // re-attempting a write that can never succeed.
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: false,
      });
      // Unified mode stays off, so spot must not be folded.
      expect(
        mockSubscriptionService.setUserAbstractionMode,
      ).not.toHaveBeenCalled();
      expect(mockCompleteInFlight).toHaveBeenCalled();
    });

    it('treats a Multi-sig required rejection as benign instead of reporting an error', async () => {
      // The signer-set lookup and the write can race (the account is
      // converted between the two calls), and other single-signer write paths
      // can hit the same rejection. Classify it rather than surfacing it.
      const mockExchangeClient = createMockExchangeClient();
      mockExchangeClient.agentSetAbstraction = jest
        .fn()
        .mockRejectedValue(new Error('ApiRequestError: Multi-sig required'));
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
          // Stale null — the account became multi-sig after the probe.
          userToMultiSigSigners: jest.fn().mockResolvedValue(null),
        }),
      );
      mockClientService.getExchangeClient = jest
        .fn()
        .mockReturnValue(mockExchangeClient);

      // Act
      await provider.getMarketDataWithPrices();

      // Assert - not forwarded to the client error surface / Sentry
      expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).not.toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({ status: 'failed' }),
      );
      expect(
        mockPlatformDependencies.metrics.trackPerpsEvent,
      ).toHaveBeenCalledWith(
        'Perp Account Setup',
        expect.objectContaining({
          previous_abstraction_mode: 'default',
          status: 'not_applicable',
          error_message: 'multi_sig_account',
        }),
      );
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: false,
      });
      await expect(provider.getAccountSupport()).resolves.toEqual({
        isSupported: false,
        reason: 'multi_sig_account',
      });
      await expect(
        provider.withdraw({
          amount: '100',
          destination: USER_ADDRESS as Hex,
          assetId:
            'eip155:42161/erc20:0xa0b86a33e6776e681a06e0e1622c5e5e3e6a8b13/usdc' as CaipAssetId,
        }),
      ).resolves.toMatchObject({
        success: false,
        error: PERPS_ERROR_CODES.EXCHANGE_MULTI_SIG_REQUIRED,
      });
      expect(mockExchangeClient.withdraw3).not.toHaveBeenCalled();
    });

    it('still migrates single-signer accounts when the multi-sig probe fails', async () => {
      // Fail open: a transient info-API failure must never block migration
      // for the overwhelming majority of accounts. The catch-path classifier
      // remains the safety net.
      const mockExchangeClient = createMockExchangeClient();
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('default'),
          userToMultiSigSigners: jest
            .fn()
            .mockRejectedValue(new Error('Transient HL network blip')),
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
      expect(
        (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
          .set,
      ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
        attempted: true,
        enabled: true,
      });
    });

    it('does not query the multi-sig signer set when no migration write is needed', async () => {
      // Accounts already on a compatible mode never reach a write, so they
      // must not pay an extra Hyperliquid round trip.
      const userToMultiSigSigners = jest.fn().mockResolvedValue(null);
      mockClientService.getInfoClient = jest.fn().mockReturnValue(
        createMockInfoClient({
          userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
          userToMultiSigSigners,
        }),
      );

      // Act
      await provider.getMarketDataWithPrices();

      // Assert
      expect(userToMultiSigSigners).not.toHaveBeenCalled();
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

    it.each(['default', 'disabled'] as const)(
      'defers %s migration on init when every signature needs confirmation',
      async (currentMode) => {
        // Arrange
        mockWalletService.requiresSignatureConfirmation.mockReturnValue(true);
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
      expect(mockExchangeClient.agentSetAbstraction).not.toHaveBeenCalled();
    });

    describe('WebSocket transport failures', () => {
      // Once the Hyperliquid socket exhausts its reconnect budget, every
      // request on it rejects with this SDK error (Sentry METAMASK-ZHT9).
      const createReconnectionLimitError = (): Error =>
        Object.assign(
          new Error('WebSocket permanently terminated: RECONNECTION_LIMIT'),
          { name: 'ReconnectingWebSocketError', code: 'RECONNECTION_LIMIT' },
        );
      const createTerminatedSocketError = (): Error =>
        Object.assign(
          new Error('WebSocket connection permanently terminated'),
          {
            name: 'WebSocketRequestError',
            cause: createReconnectionLimitError(),
          },
        );
      // Longer than any transport cooldown the provider applies.
      const AFTER_COOLDOWN_MS = 10 * 60 * 1000;

      it('does not report a terminated WebSocket lookup to Sentry and keeps the retry flag', async () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const userAbstraction = jest
          .fn()
          .mockRejectedValueOnce(createTerminatedSocketError())
          .mockResolvedValueOnce('unifiedAccount');
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));
        const mockCompleteInFlight = jest.fn();
        (
          TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>
        ).setInFlight.mockReturnValue(mockCompleteInFlight);

        await provider.getMarketDataWithPrices();

        expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
        expect(
          mockPlatformDependencies.metrics.trackPerpsEvent,
        ).not.toHaveBeenCalledWith(
          'Perp Account Setup',
          expect.objectContaining({ status: 'failed' }),
        );
        expect(
          (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
            .set,
        ).not.toHaveBeenCalled();
        expect(mockCompleteInFlight).toHaveBeenCalledTimes(1);

        // The retry flag survived: once the cooldown is over, the next
        // entry runs the lookup again and finishes the setup.
        nowSpy.mockReturnValue(1_000_000 + AFTER_COOLDOWN_MS);
        await provider.getMarketDataWithPrices();

        expect(userAbstraction).toHaveBeenCalledTimes(2);
        expect(
          (TradingReadinessCache as jest.Mocked<typeof TradingReadinessCache>)
            .set,
        ).toHaveBeenCalledWith('mainnet', USER_ADDRESS, {
          attempted: true,
          enabled: true,
        });
      });

      it('does not report a bare ReconnectingWebSocketError from the lookup', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            userAbstraction: jest
              .fn()
              .mockRejectedValue(createReconnectionLimitError()),
          }),
        );

        await provider.getMarketDataWithPrices();

        expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      });

      // The SDK raises these without a cause: the close-time rejections
      // always, and the terminated-socket error on engines that ignore
      // `Error` `cause`.
      it.each([
        'WebSocket connection closed',
        'WebSocket connection closed before the request was sent',
        'WebSocket connection permanently terminated',
      ])(
        'does not report a client-side WebSocketRequestError without a cause: %s',
        async (message) => {
          mockClientService.getInfoClient = jest.fn().mockReturnValue(
            createMockInfoClient({
              userAbstraction: jest.fn().mockRejectedValue(
                Object.assign(new Error(message), {
                  name: 'WebSocketRequestError',
                }),
              ),
            }),
          );

          await provider.getMarketDataWithPrices();

          expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
        },
      );

      it('skips the lookup on every entry inside the cooldown after a transport failure', async () => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const userAbstraction = jest
          .fn()
          .mockRejectedValue(createTerminatedSocketError());
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));

        await provider.getMarketDataWithPrices();
        nowSpy.mockReturnValue(1_000_000 + 1_000);
        await provider.getMarketDataWithPrices();
        await provider.getMarketDataWithPrices();

        expect(userAbstraction).toHaveBeenCalledTimes(1);

        // Still dead after the cooldown: one more lookup, then a new cooldown.
        nowSpy.mockReturnValue(1_000_000 + AFTER_COOLDOWN_MS);
        await provider.getMarketDataWithPrices();
        nowSpy.mockReturnValue(1_000_000 + AFTER_COOLDOWN_MS + 1_000);
        await provider.getMarketDataWithPrices();

        expect(userAbstraction).toHaveBeenCalledTimes(2);
        expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalled();
      });

      it('runs the setup again after the cooldown when an action-time lookup overlapped it', async () => {
        // Completed DEX discovery keeps init memoized, so a kept memo would
        // stop #ensureReady from ever running the setup again.
        const readyProvider = createTestProvider({
          hip3Enabled: true,
          initialAssetMapping: [
            ['BTC', 0],
            ['ETH', 1],
          ],
        });
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        let rejectActionLookup: (error: Error) => void = () => undefined;
        const userAbstraction = jest
          .fn()
          .mockRejectedValueOnce(createTerminatedSocketError())
          .mockImplementationOnce(
            async () =>
              new Promise((_resolve, reject) => {
                rejectActionLookup = reject;
              }),
          )
          .mockRejectedValue(createTerminatedSocketError());
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));

        await readyProvider.getMarketDataWithPrices();
        // The action-time lookup is in flight while #ensureReady skips.
        const preparing = readyProvider.prepareTradingWallet();
        for (let i = 0; i < 50 && userAbstraction.mock.calls.length < 2; i++) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        expect(userAbstraction).toHaveBeenCalledTimes(2);
        await readyProvider.getMarketDataWithPrices();
        rejectActionLookup(createTerminatedSocketError());
        await preparing;

        nowSpy.mockReturnValue(1_000_000 + AFTER_COOLDOWN_MS);
        await readyProvider.getMarketDataWithPrices();

        expect(userAbstraction).toHaveBeenCalledTimes(3);
      });

      it('ends the cooldown when the provider reconnects', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const userAbstraction = jest
          .fn()
          .mockRejectedValueOnce(createTerminatedSocketError())
          .mockResolvedValueOnce('unifiedAccount');
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));
        mockClientService.reconnect = jest.fn().mockResolvedValue(undefined);

        await provider.getMarketDataWithPrices();
        await provider.reconnect();
        await provider.getMarketDataWithPrices();

        expect(mockClientService.reconnect).toHaveBeenCalledTimes(1);
        expect(userAbstraction).toHaveBeenCalledTimes(2);
      });

      it('ends the cooldown when the provider disconnects', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const userAbstraction = jest
          .fn()
          .mockRejectedValue(createTerminatedSocketError());
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));

        await provider.getMarketDataWithPrices();
        await provider.disconnect();
        await provider.getMarketDataWithPrices();

        expect(userAbstraction).toHaveBeenCalledTimes(2);
      });

      it('does not carry a cooldown started during disconnect into the next session', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        let rejectLookup: (error: Error) => void = () => undefined;
        const userAbstraction = jest
          .fn()
          .mockImplementationOnce(
            async () =>
              new Promise((_resolve, reject) => {
                rejectLookup = reject;
              }),
          )
          .mockResolvedValue('unifiedAccount');
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));

        const loading = provider
          .getMarketDataWithPrices()
          .catch(() => undefined);
        for (let i = 0; i < 50 && userAbstraction.mock.calls.length < 1; i++) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        // disconnect() waits for the in-flight lookup, which then fails on
        // the transport and starts a cooldown.
        const disconnecting = provider.disconnect();
        for (let i = 0; i < 10; i++) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        rejectLookup(createTerminatedSocketError());
        await disconnecting;
        await loading;

        await provider.getMarketDataWithPrices();

        expect(userAbstraction).toHaveBeenCalledTimes(2);
      });

      it('still reports a server error frame returned for the lookup', async () => {
        // The SDK raises the venue's own rejection as a WebSocketRequestError
        // with no cause; that is an answer, not a transport failure.
        const serverError = Object.assign(
          new Error('Invalid request: unknown type userAbstraction'),
          { name: 'WebSocketRequestError' },
        );
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            userAbstraction: jest.fn().mockRejectedValue(serverError),
          }),
        );

        await provider.getMarketDataWithPrices();

        expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
          serverError,
          expect.objectContaining({
            context: expect.objectContaining({
              data: expect.objectContaining({
                method: 'ensureUnifiedAccountEnabled',
              }),
            }),
          }),
        );
      });

      it('does not apply the cooldown to action-time setup', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const userAbstraction = jest
          .fn()
          .mockRejectedValue(createTerminatedSocketError());
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));

        await provider.getMarketDataWithPrices();
        await provider.prepareTradingWallet();

        // #ensureReady skipped its run inside the cooldown; the trading
        // path still looked the account up.
        expect(userAbstraction).toHaveBeenCalledTimes(2);
        expect(mockPlatformDependencies.logger.error).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            context: expect.objectContaining({
              data: expect.objectContaining({
                method: 'ensureUnifiedAccountEnabled',
              }),
            }),
          }),
        );
      });

      it('still reports a non-transport lookup failure and retries it on the next entry', async () => {
        const userAbstraction = jest
          .fn()
          .mockRejectedValue(new Error('HL info endpoint timeout'));
        mockClientService.getInfoClient = jest
          .fn()
          .mockReturnValue(createMockInfoClient({ userAbstraction }));

        await provider.getMarketDataWithPrices();
        await provider.getMarketDataWithPrices();

        // No cooldown outside transport failures.
        expect(userAbstraction).toHaveBeenCalledTimes(2);
        expect(mockPlatformDependencies.logger.error).toHaveBeenCalledTimes(2);
        expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'HL info endpoint timeout' }),
          expect.objectContaining({
            context: expect.objectContaining({
              data: expect.objectContaining({
                method: 'ensureUnifiedAccountEnabled',
              }),
            }),
          }),
        );
      });

      it('still reports a migration write the user rejected', async () => {
        mockClientService.getInfoClient = jest.fn().mockReturnValue(
          createMockInfoClient({
            userAbstraction: jest.fn().mockResolvedValue('default'),
          }),
        );
        const mockExchangeClient = createMockExchangeClient();
        mockExchangeClient.agentSetAbstraction = jest
          .fn()
          .mockRejectedValue(new Error('User rejected the request.'));
        mockClientService.getExchangeClient = jest
          .fn()
          .mockReturnValue(mockExchangeClient);

        await provider.getMarketDataWithPrices();

        expect(mockPlatformDependencies.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'User rejected the request.' }),
          expect.objectContaining({
            context: expect.objectContaining({
              data: expect.objectContaining({
                method: 'ensureUnifiedAccountEnabled',
              }),
            }),
          }),
        );
        expect(
          mockPlatformDependencies.metrics.trackPerpsEvent,
        ).toHaveBeenCalledWith(
          'Perp Account Setup',
          expect.objectContaining({
            status: 'failed',
            error_message: 'User rejected the request.',
          }),
        );
      });
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
