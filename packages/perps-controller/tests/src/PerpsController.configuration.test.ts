/* eslint-disable */
/**
 * PerpsController Tests
 * Clean, focused test suite for PerpsController
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  GasFeeEstimateLevel,
  GasFeeEstimateType,
} from '@metamask/transaction-controller';

import Engine from '../../../core/Engine';
import {
  createMockHyperLiquidProvider,
  createMockPosition,
} from '../helpers/providerMocks';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks';

jest.mock('@nktkas/hyperliquid', () => ({}));
jest.mock('@myx-trade/sdk', () => ({
  MyxClient: jest.fn(),
  OrderStatusEnum: { Successful: 9 },
}));

import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../src/constants/eventNames';
import {
  PERPS_CONSTANTS,
  PERPS_DISK_CACHE_MARKETS,
  PERPS_DISK_CACHE_USER_DATA,
} from '../../src/constants/perpsConfig';
import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
  PerpsMode,
  firstNonEmpty,
  resolveMyxAuthConfig,
} from '../../src/PerpsController';
import type { PerpsControllerState } from '../../src/PerpsController';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider';
import type {
  AccountState,
  GetAvailableDexsParams,
  PerpsProvider,
  PerpsPlatformDependencies,
  PerpsProviderType,
  SubscribeAccountParams,
} from '../../src/types';
import { PerpsAnalyticsEvent } from '../../src/types';

jest.mock('../../src/providers/HyperLiquidProvider');
jest.mock('../../src/providers/MYXProvider');

// Mock transaction controller utility
const mockAddTransaction = jest.fn();
jest.mock(
  '../../../util/transaction-controller',
  () => ({
    addTransaction: (...args: unknown[]) => mockAddTransaction(...args),
  }),
  { virtual: true },
);

// Mock wait utility to speed up retry tests
jest.mock('../../src/utils/wait', () => ({
  wait: jest.fn().mockResolvedValue(undefined),
}));

// Mock stream manager
const mockStreamManager = {
  positions: { pause: jest.fn(), resume: jest.fn() },
  account: { pause: jest.fn(), resume: jest.fn() },
  orders: { pause: jest.fn(), resume: jest.fn() },
  prices: { pause: jest.fn(), resume: jest.fn() },
  orderFills: { pause: jest.fn(), resume: jest.fn() },
};

jest.mock(
  '../../../components/UI/Perps/providers/PerpsStreamManager',
  () => ({
    getStreamManagerInstance: jest.fn(() => mockStreamManager),
  }),
  { virtual: true },
);

// Create persistent mock controllers INSIDE jest.mock factory
jest.mock(
  '../../../core/Engine',
  () => {
    const mockRewardsController = {
      getPerpsDiscountForAccount: jest.fn(),
    };

    const mockNetworkController = {
      getNetworkClientById: jest.fn().mockReturnValue({
        configuration: { chainId: '0x1' },
      }),
    };

    const mockAccountTreeController = {
      getAccountsFromSelectedAccountGroup: jest.fn().mockReturnValue([
        {
          address: '0x1234567890123456789012345678901234567890',
          type: 'eip155:eoa',
        },
      ]),
    };

    const mockTransactionController = {
      estimateGasFee: jest.fn(),
      estimateGas: jest.fn(),
    };

    const mockAccountTrackerController = {
      state: {
        accountsByChainId: {},
      },
    };

    const mockEngineContext = {
      RewardsController: mockRewardsController,
      NetworkController: mockNetworkController,
      AccountTreeController: mockAccountTreeController,
      TransactionController: mockTransactionController,
      AccountTrackerController: mockAccountTrackerController,
    };

    // Return as default export to match the actual Engine import
    return {
      __esModule: true,
      default: {
        context: mockEngineContext,
      },
    };
  },
  { virtual: true },
);

jest.mock('@metamask/utils', () => ({
  ...jest.requireActual('@metamask/utils'),
  formatAccountToCaipAccountId: jest
    .fn()
    .mockReturnValue('eip155:1:0x1234567890123456789012345678901234567890'),
}));

// Mock EligibilityService as a class with instance methods
const mockEligibilityServiceInstance = {
  checkEligibility: jest.fn().mockResolvedValue(true),
};
jest.mock('../../src/services/EligibilityService', () => ({
  EligibilityService: jest
    .fn()
    .mockImplementation(() => mockEligibilityServiceInstance),
}));

// Mock DepositService as a class with instance methods
const mockDepositServiceInstance = {
  prepareTransaction: jest.fn(),
};
jest.mock('../../src/services/DepositService', () => ({
  DepositService: jest
    .fn()
    .mockImplementation(() => mockDepositServiceInstance),
}));

// Mock MarketDataService as a class with instance methods
const mockMarketDataServiceInstance = {
  getPositions: jest.fn(),
  getAccountState: jest.fn(),
  getMarkets: jest.fn(),
  getMarketDataWithPrices: jest
    .fn()
    .mockImplementation(
      ({
        provider,
      }: {
        provider: { getMarketDataWithPrices: () => Promise<unknown[]> };
      }) => provider.getMarketDataWithPrices(),
    ),
  getWithdrawalRoutes: jest.fn().mockReturnValue([]),
  validateClosePosition: jest.fn().mockResolvedValue({ isValid: true }),
  validateOrder: jest.fn(),
  calculateMaintenanceMargin: jest.fn().mockResolvedValue(0),
  calculateLiquidationPrice: jest.fn(),
  getMaxLeverage: jest.fn(),
  calculateFees: jest.fn().mockResolvedValue({ totalFee: 0 }),
  getAvailableDexs: jest.fn().mockResolvedValue([]),
  getBlockExplorerUrl: jest.fn(),
  getOrderFills: jest.fn(),
  getOrders: jest.fn(),
  getFunding: jest.fn(),
};
jest.mock('../../src/services/MarketDataService', () => ({
  MarketDataService: jest
    .fn()
    .mockImplementation(() => mockMarketDataServiceInstance),
}));

// Mock TradingService as a class with instance methods
const mockTradingServiceInstance = {
  placeOrder: jest.fn(),
  editOrder: jest.fn(),
  cancelOrder: jest.fn(),
  cancelOrders: jest.fn(),
  closePosition: jest.fn(),
  closePositions: jest.fn(),
  updatePositionTPSL: jest.fn(),
  updateMargin: jest.fn(),
  flipPosition: jest.fn(),
  setControllerDependencies: jest.fn(),
};
jest.mock('../../src/services/TradingService', () => ({
  TradingService: jest
    .fn()
    .mockImplementation(() => mockTradingServiceInstance),
}));

// Mock AccountService as a class with instance methods
const mockAccountServiceInstance = {
  withdraw: jest.fn(),
  validateWithdrawal: jest.fn(),
};
jest.mock('../../src/services/AccountService', () => ({
  AccountService: jest
    .fn()
    .mockImplementation(() => mockAccountServiceInstance),
}));

// Mock DataLakeService as a class with instance methods
const mockDataLakeServiceInstance = {
  reportOrder: jest.fn(),
};
jest.mock('../../src/services/DataLakeService', () => ({
  DataLakeService: jest
    .fn()
    .mockImplementation(() => mockDataLakeServiceInstance),
}));

// Mock FeatureFlagConfigurationService as a class with instance methods
const mockFeatureFlagConfigurationServiceInstance = {
  refreshEligibility: jest.fn((options: any) => {
    // Simulate the service's behavior: extract blocked regions from remote flags
    const remoteFlags =
      options.remoteFeatureFlagControllerState.remoteFeatureFlags;
    const perpsGeoBlockedRegionsFeatureFlag =
      remoteFlags?.perpsPerpTradingGeoBlockedCountriesV2;
    const remoteBlockedRegions =
      perpsGeoBlockedRegionsFeatureFlag?.blockedRegions;

    if (
      Array.isArray(remoteBlockedRegions) &&
      options.context.setBlockedRegionList
    ) {
      const currentList = options.context.getBlockedRegionList?.();
      // Never downgrade from remote to fallback
      if (!currentList || currentList.source !== 'remote') {
        options.context.setBlockedRegionList(remoteBlockedRegions, 'remote');
      }
    }

    // Call refreshEligibility callback if available
    if (options.context.refreshEligibility) {
      options.context.refreshEligibility().catch(() => {
        // Ignore errors in mock
      });
    }

    // Also call refreshHip3Config if available
    if (remoteFlags) {
      mockFeatureFlagConfigurationServiceInstance.refreshHip3Config(options);
    }
  }),
  refreshHip3Config: jest.fn(),
  setBlockedRegions: jest.fn((options: any) => {
    // Simulate setBlockedRegions behavior
    const { list, source, context } = options;
    if (context.setBlockedRegionList && context.getBlockedRegionList) {
      const currentList = context.getBlockedRegionList();
      // Never downgrade from remote to fallback
      if (source === 'fallback' && currentList.source === 'remote') {
        return;
      }
      if (Array.isArray(list)) {
        context.setBlockedRegionList(list, source);
      }
    }

    // Call refreshEligibility callback if available
    if (context.refreshEligibility) {
      context.refreshEligibility().catch(() => {
        // Ignore errors in mock
      });
    }
  }),
};
jest.mock('../../src/services/FeatureFlagConfigurationService', () => ({
  FeatureFlagConfigurationService: jest
    .fn()
    .mockImplementation(() => mockFeatureFlagConfigurationServiceInstance),
}));

/**
 * Testable version of PerpsController that exposes protected methods for testing.
 * This follows the pattern used in RewardsController.test.ts
 */
class TestablePerpsController extends PerpsController {
  /**
   * Test-only method to update state directly.
   * Exposed for scenarios where state needs to be manipulated
   * outside the normal public API (e.g., testing error conditions).
   * @param callback
   */
  public testUpdate(callback: (state: PerpsControllerState) => void) {
    this.update(callback);
  }

  /**
   * Test-only method to mark controller as initialized.
   * Common test scenario that requires internal state changes.
   */
  public testMarkInitialized() {
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }

  /**
   * Test-only method to set the providers map with complete providers.
   * Used in most tests to inject mock providers.
   * Also sets activeProviderInstance to the first provider (default provider).
   * @param providers
   */
  public testSetProviders(providers: Map<PerpsProviderType, PerpsProvider>) {
    this.providers = providers;
    // Set activeProviderInstance to the first provider (typically 'hyperliquid')
    const firstProvider = providers.values().next().value;
    if (firstProvider) {
      this.activeProviderInstance = firstProvider;
    }
  }

  /**
   * Test-only method to set the providers map with partial providers.
   * Used explicitly in tests that verify error handling with incomplete providers.
   * Type cast is intentional and necessary for testing graceful degradation.
   * @param providers
   */
  public testSetPartialProviders(
    providers: Map<PerpsProviderType, Partial<PerpsProvider>>,
  ) {
    this.providers = providers as Map<PerpsProviderType, PerpsProvider>;
  }

  /**
   * Test-only method to get the providers map.
   * Used to verify provider state in tests.
   */
  public testGetProviders(): Map<PerpsProviderType, PerpsProvider> {
    return this.providers;
  }

  /**
   * Test-only method to set initialization state.
   * Allows tests to simulate both initialized and uninitialized states.
   * @param value
   */
  public testSetInitialized(value: boolean) {
    this.isInitialized = value;
  }

  /**
   * Test-only method to get initialization state.
   * Used to verify initialization status in tests.
   */
  public testGetInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Test-only method to get blocked region list.
   * Used to verify geo-blocking configuration in tests.
   */
  public testGetBlockedRegionList(): { source: string; list: string[] } {
    return this.blockedRegionList;
  }

  /**
   * Test-only method to set blocked region list.
   * Used to test priority logic (remote vs fallback).
   * @param list
   * @param source
   */
  public testSetBlockedRegionList(
    list: string[],
    source: 'remote' | 'fallback',
  ) {
    this.setBlockedRegionList(list, source);
  }

  /**
   * Test accessor for protected method refreshEligibilityOnFeatureFlagChange.
   * Wrapper is necessary because protected methods can't be called from test code.
   * @param remoteFlags
   */
  public testRefreshEligibilityOnFeatureFlagChange(remoteFlags: any) {
    this.refreshEligibilityOnFeatureFlagChange(remoteFlags);
  }

  /**
   * Test accessor for protected method reportOrderToDataLake.
   * Wrapper is necessary because protected methods can't be called from test code.
   * @param data
   */
  public testReportOrderToDataLake(data: any): Promise<any> {
    return this.reportOrderToDataLake(data);
  }

  public testHasStandaloneProvider(): boolean {
    return this.hasStandaloneProvider();
  }

  public testRegisterMYXProvider(
    MYXProvider: new (opts: Record<string, unknown>) => PerpsProvider,
  ) {
    this.registerMYXProvider(MYXProvider as never);
  }

  public testHandleMYXImportError(error: unknown) {
    this.handleMYXImportError(error);
  }
}

describe('PerpsController', () => {
  let controller: TestablePerpsController;
  let mockProvider: jest.Mocked<HyperLiquidProvider>;
  let mockInfrastructure: jest.Mocked<PerpsPlatformDependencies>;

  // Helper to mark controller as initialized for tests
  const markControllerAsInitialized = () => {
    controller.testMarkInitialized();
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (
      jest.requireMock('../../src/services/EligibilityService')
        .EligibilityService as jest.Mock
    ).mockImplementation(() => mockEligibilityServiceInstance);
    (
      jest.requireMock('../../src/services/DepositService')
        .DepositService as jest.Mock
    ).mockImplementation(() => mockDepositServiceInstance);
    (
      jest.requireMock('../../src/services/MarketDataService')
        .MarketDataService as jest.Mock
    ).mockImplementation(() => mockMarketDataServiceInstance);
    (
      jest.requireMock('../../src/services/TradingService')
        .TradingService as jest.Mock
    ).mockImplementation(() => mockTradingServiceInstance);
    (
      jest.requireMock('../../src/services/AccountService')
        .AccountService as jest.Mock
    ).mockImplementation(() => mockAccountServiceInstance);
    (
      jest.requireMock('../../src/services/DataLakeService')
        .DataLakeService as jest.Mock
    ).mockImplementation(() => mockDataLakeServiceInstance);
    (
      jest.requireMock('../../src/services/FeatureFlagConfigurationService')
        .FeatureFlagConfigurationService as jest.Mock
    ).mockImplementation(() => mockFeatureFlagConfigurationServiceInstance);

    mockEligibilityServiceInstance.checkEligibility.mockResolvedValue(true);
    mockMarketDataServiceInstance.getPositions.mockResolvedValue([]);
    mockMarketDataServiceInstance.getAccountState.mockResolvedValue({
      spendableBalance: '10000',
      withdrawableBalance: '10000',
      totalBalance: '10000',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    });
    mockMarketDataServiceInstance.getMarkets.mockResolvedValue([]);
    mockMarketDataServiceInstance.getMarketDataWithPrices.mockImplementation(
      ({
        provider,
      }: {
        provider: { getMarketDataWithPrices: () => Promise<unknown[]> };
      }) => provider.getMarketDataWithPrices(),
    );
    mockMarketDataServiceInstance.getWithdrawalRoutes.mockReturnValue([]);
    mockMarketDataServiceInstance.validateClosePosition.mockResolvedValue({
      isValid: true,
    });
    mockMarketDataServiceInstance.calculateMaintenanceMargin.mockResolvedValue(
      0,
    );
    mockMarketDataServiceInstance.calculateFees.mockResolvedValue({
      totalFee: 0,
    });
    mockMarketDataServiceInstance.getAvailableDexs.mockResolvedValue([]);

    mockFeatureFlagConfigurationServiceInstance.refreshEligibility.mockImplementation(
      (options: any) => {
        const remoteFlags =
          options.remoteFeatureFlagControllerState.remoteFeatureFlags;
        const perpsGeoBlockedRegionsFeatureFlag =
          remoteFlags?.perpsPerpTradingGeoBlockedCountriesV2;
        const remoteBlockedRegions =
          perpsGeoBlockedRegionsFeatureFlag?.blockedRegions;

        if (
          Array.isArray(remoteBlockedRegions) &&
          options.context.setBlockedRegionList
        ) {
          const currentList = options.context.getBlockedRegionList?.();
          if (!currentList || currentList.source !== 'remote') {
            options.context.setBlockedRegionList(
              remoteBlockedRegions,
              'remote',
            );
          }
        }

        if (options.context.refreshEligibility) {
          options.context.refreshEligibility().catch(() => {
            // Ignore errors in mock
          });
        }

        if (remoteFlags) {
          mockFeatureFlagConfigurationServiceInstance.refreshHip3Config(
            options,
          );
        }
      },
    );
    mockFeatureFlagConfigurationServiceInstance.setBlockedRegions.mockImplementation(
      (options: any) => {
        const { list, source, context } = options;
        if (context.setBlockedRegionList && context.getBlockedRegionList) {
          const currentList = context.getBlockedRegionList();
          if (source === 'fallback' && currentList.source === 'remote') {
            return;
          }
          if (Array.isArray(list)) {
            context.setBlockedRegionList(list, source);
          }
        }

        if (context.refreshEligibility) {
          context.refreshEligibility().catch(() => {
            // Ignore errors in mock
          });
        }
      },
    );
    mockFeatureFlagConfigurationServiceInstance.refreshHip3Config.mockImplementation(
      () => undefined,
    );

    // Reset Engine.context mocks to default state to prevent test interdependence
    (
      Engine.context.RewardsController.getPerpsDiscountForAccount as jest.Mock
    ).mockResolvedValue(null);
    (
      Engine.context.NetworkController.getNetworkClientById as jest.Mock
    ).mockReturnValue({ configuration: { chainId: '0x1' } });

    // Create a fresh mock provider for each test
    mockProvider = createMockHyperLiquidProvider();

    // Add default mock return values for all provider methods
    mockProvider.getPositions.mockResolvedValue([]);
    mockProvider.getAccountState.mockResolvedValue({
      spendableBalance: '10000',
      withdrawableBalance: '10000',
      totalBalance: '10000',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    });
    mockProvider.getMarkets.mockResolvedValue([]);
    mockProvider.getOpenOrders.mockResolvedValue([]);
    mockProvider.getFunding.mockResolvedValue([]);
    mockProvider.getOrderFills.mockResolvedValue([]);
    mockProvider.getOrders.mockResolvedValue([]);
    mockProvider.calculateLiquidationPrice.mockResolvedValue('0');
    mockProvider.getMaxLeverage.mockResolvedValue(50);
    mockProvider.calculateMaintenanceMargin.mockResolvedValue(0);
    mockProvider.calculateFees.mockResolvedValue({ feeAmount: 0 });
    mockProvider.getBlockExplorerUrl.mockReturnValue(
      'https://explorer.example.com',
    );
    mockProvider.getWithdrawalRoutes.mockReturnValue([]);

    (
      HyperLiquidProvider as jest.MockedClass<typeof HyperLiquidProvider>
    ).mockImplementation(() => mockProvider);

    const mockCall = jest.fn().mockImplementation((action: string) => {
      if (action === 'RemoteFeatureFlagController:getState') {
        return {
          remoteFeatureFlags: {
            perpsPerpTradingGeoBlockedCountriesV2: {
              blockedRegions: [],
            },
          },
        };
      }
      if (
        action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
      ) {
        return [
          {
            address: '0x1234567890123456789012345678901234567890',
            type: 'eip155:eoa',
            id: 'account-1',
            options: {},
            scopes: ['eip155:1'],
            methods: [],
            metadata: {
              name: 'Test',
              importTime: 0,
              keyring: { type: 'HD Key Tree' },
            },
          },
        ];
      }
      return undefined;
    });

    mockInfrastructure = createMockInfrastructure();
    controller = new TestablePerpsController({
      messenger: createMockMessenger({ call: mockCall }),
      state: getDefaultPerpsControllerState(),
      infrastructure: mockInfrastructure,
    });
  });

  afterEach(() => {
    // Clear only provider mocks, not Engine.context mocks
    // This prevents breaking Engine.context.RewardsController/NetworkController references
    if (mockProvider) {
      Object.values(mockProvider).forEach((value) => {
        if (
          typeof value === 'function' &&
          value !== null &&
          'mockClear' in value
        ) {
          (value as jest.Mock).mockClear();
        }
      });
    }
    (mockInfrastructure.metrics.trackPerpsEvent as jest.Mock).mockClear();
    (mockInfrastructure.logger.error as jest.Mock).mockClear();
    (mockInfrastructure.debugLogger.log as jest.Mock).mockClear();
  });
  describe('toggleTestnet', () => {
    it('returns error when already reinitializing', async () => {
      await controller.init();
      jest.spyOn(controller, 'isCurrentlyReinitializing').mockReturnValue(true);

      const result = await controller.toggleTestnet();

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.CLIENT_REINITIALIZING);
      expect(result.isTestnet).toBe(false);
    });

    it('toggles to testnet network', async () => {
      await controller.init();
      const initialTestnetState = controller.state.isTestnet;

      const result = await controller.toggleTestnet();

      expect(result.success).toBe(true);
      expect(result.isTestnet).toBe(!initialTestnetState);
      expect(controller.state.isTestnet).toBe(!initialTestnetState);
    });

    it('returns failure and rolls back isTestnet when init sets InitializationState.Failed', async () => {
      await controller.init();
      const initialTestnetState = controller.state.isTestnet;

      // Make init set state to Failed (mimics performInitialization catching an error)
      jest.spyOn(controller, 'init').mockImplementationOnce(async () => {
        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Failed;
          state.initializationError = 'Network toggle init failed';
        });
      });

      const result = await controller.toggleTestnet();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network toggle init failed');
      // isTestnet should be rolled back to its original value
      expect(result.isTestnet).toBe(initialTestnetState);
      expect(controller.state.isTestnet).toBe(initialTestnetState);

      jest.restoreAllMocks();
    });

    it('clears isReinitializing flag after init failure', async () => {
      await controller.init();

      jest.spyOn(controller, 'init').mockImplementationOnce(async () => {
        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Failed;
        });
      });

      await controller.toggleTestnet();

      expect(controller.isCurrentlyReinitializing()).toBe(false);

      jest.restoreAllMocks();
    });
  });

  describe('market filter preferences', () => {
    it('saves and retrieves filter preference', () => {
      controller.saveMarketFilterPreferences('openInterest', 'desc');

      const result = controller.getMarketFilterPreferences();

      expect(result).toEqual({
        optionId: 'openInterest',
        direction: 'desc',
      });
    });

    it('saves and retrieves price change with ascending direction', () => {
      controller.saveMarketFilterPreferences('priceChange', 'asc');

      const result = controller.getMarketFilterPreferences();

      expect(result).toEqual({
        optionId: 'priceChange',
        direction: 'asc',
      });
    });
  });

  describe('pro layout preferences', () => {
    it('defaults to collapsed order book, expanded chart, and reserved positions', () => {
      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: false,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
      });
    });

    it('updates a single field without clobbering the others', () => {
      controller.setProLayoutPreferences({ orderBookExpanded: true });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: true,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
      });
    });

    it('merges successive partial patches', () => {
      controller.setProLayoutPreferences({ orderBookExpanded: true });
      controller.setProLayoutPreferences({ orderBookPosition: 'right' });
      controller.setProLayoutPreferences({ orderFormPosition: 'left' });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: true,
        chartExpanded: true,
        orderBookPosition: 'right',
        orderFormPosition: 'left',
      });
    });

    it('persists the update to controller state', () => {
      controller.setProLayoutPreferences({ chartExpanded: false });

      expect(controller.state.proLayoutPreferences.chartExpanded).toBe(false);
    });

    it('fills in defaults for fields missing from persisted state', () => {
      controller.testUpdate((state) => {
        // Simulate persisted state that predates some fields.
        state.proLayoutPreferences = {
          orderBookExpanded: true,
        } as PerpsControllerState['proLayoutPreferences'];
      });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: true,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
      });
    });
  });

  describe('perps mode', () => {
    it('defaults to lite mode', () => {
      expect(controller.state.mode).toBe(PerpsMode.Lite);
    });

    it('sets the mode to pro', () => {
      controller.setPerpsMode(PerpsMode.Pro);

      expect(controller.state.mode).toBe(PerpsMode.Pro);
    });

    it('sets the mode back to lite', () => {
      controller.setPerpsMode(PerpsMode.Pro);
      controller.setPerpsMode(PerpsMode.Lite);

      expect(controller.state.mode).toBe(PerpsMode.Lite);
    });
  });

  describe('watchlist management', () => {
    it('adds and removes market from watchlist', async () => {
      await controller.init();

      controller.toggleWatchlistMarket('BTC');

      expect(controller.isWatchlistMarket('BTC')).toBe(true);
      expect(controller.getWatchlistMarkets()).toContain('BTC');

      controller.toggleWatchlistMarket('BTC');

      expect(controller.isWatchlistMarket('BTC')).toBe(false);
    });
  });

  describe('resetFirstTimeUserState', () => {
    it('resets tutorial and order state for both networks', () => {
      controller.markTutorialCompleted();
      controller.markFirstOrderCompleted();

      controller.resetFirstTimeUserState();

      expect(controller.state.isFirstTimeUser.testnet).toBe(true);
      expect(controller.state.isFirstTimeUser.mainnet).toBe(true);
      expect(controller.state.hasPlacedFirstOrder.testnet).toBe(false);
      expect(controller.state.hasPlacedFirstOrder.mainnet).toBe(false);
    });
  });

  describe('clearPendingTransactionRequests', () => {
    it('removes pending and bridging withdrawal requests', () => {
      // Arrange: Add withdrawal requests with different statuses
      controller.testUpdate((state) => {
        state.withdrawalRequests = [
          {
            id: 'withdrawal-1',
            amount: '100',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: false,
            status: 'pending',
          },
          {
            id: 'withdrawal-2',
            amount: '200',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: false,
            status: 'bridging',
          },
          {
            id: 'withdrawal-3',
            amount: '300',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: true,
            status: 'completed',
            txHash: '0xabc',
          },
          {
            id: 'withdrawal-4',
            amount: '50',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: false,
            status: 'failed',
          },
        ];
      });

      controller.clearPendingTransactionRequests();

      expect(controller.state.withdrawalRequests).toHaveLength(2);
      expect(controller.state.withdrawalRequests.map((w) => w.id)).toEqual([
        'withdrawal-3',
        'withdrawal-4',
      ]);
    });

    it('removes pending and bridging deposit requests', () => {
      // Arrange: Add deposit requests with different statuses
      controller.testUpdate((state) => {
        state.depositRequests = [
          {
            id: 'deposit-1',
            amount: '100',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: false,
            status: 'pending',
          },
          {
            id: 'deposit-2',
            amount: '200',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: false,
            status: 'bridging',
          },
          {
            id: 'deposit-3',
            amount: '300',
            asset: 'USDC',
            accountAddress: '0x123',
            timestamp: Date.now(),
            success: true,
            status: 'completed',
            txHash: '0xdef',
          },
        ];
      });

      controller.clearPendingTransactionRequests();

      expect(controller.state.depositRequests).toHaveLength(1);
      expect(controller.state.depositRequests[0].id).toBe('deposit-3');
    });

    it('resets withdrawal progress', () => {
      // Arrange: Set some withdrawal progress
      controller.testUpdate((state) => {
        state.withdrawalProgress = {
          progress: 50,
          lastUpdated: Date.now() - 10000,
          activeWithdrawalId: 'withdrawal-1',
        };
      });

      controller.clearPendingTransactionRequests();

      expect(controller.state.withdrawalProgress.progress).toBe(0);
      expect(controller.state.withdrawalProgress.activeWithdrawalId).toBeNull();
    });

    it('handles empty arrays gracefully', () => {
      // Arrange: Ensure arrays are empty
      controller.testUpdate((state) => {
        state.withdrawalRequests = [];
        state.depositRequests = [];
      });

      controller.clearPendingTransactionRequests();

      expect(controller.state.withdrawalRequests).toHaveLength(0);
      expect(controller.state.depositRequests).toHaveLength(0);
    });
  });

  describe('trade configuration', () => {
    it('returns undefined for unsaved configuration', () => {
      const result = controller.getTradeConfiguration('ETH');

      expect(result).toBeUndefined();
    });

    it('retrieves saved configuration', () => {
      controller.saveTradeConfiguration('BTC', 10);

      const result = controller.getTradeConfiguration('BTC');

      expect(result?.leverage).toBe(10);
    });
  });

  describe('pending trade configuration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('saves pending trade configuration', () => {
      const config = {
        amount: '100',
        leverage: 5,
        takeProfitPrice: '50000',
        stopLossPrice: '40000',
        limitPrice: '45000',
        orderType: 'limit' as const,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      const result = controller.getPendingTradeConfiguration('BTC');
      expect(result).toEqual(config);
    });

    it('returns undefined for non-existent pending configuration', () => {
      const result = controller.getPendingTradeConfiguration('ETH');

      expect(result).toBeUndefined();
    });

    it('returns undefined for expired pending configuration (more than 5 minutes)', () => {
      const config = {
        amount: '100',
        leverage: 5,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      // Fast-forward 6 minutes (more than 5 minutes)
      jest.advanceTimersByTime(6 * 60 * 1000);

      const result = controller.getPendingTradeConfiguration('BTC');

      expect(result).toBeUndefined();
    });

    it('returns configuration for valid pending configuration (less than 5 minutes)', () => {
      const config = {
        amount: '100',
        leverage: 5,
        takeProfitPrice: '50000',
        orderType: 'market' as const,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      // Fast-forward 4 minutes (less than 5 minutes)
      jest.advanceTimersByTime(4 * 60 * 1000);

      const result = controller.getPendingTradeConfiguration('BTC');

      expect(result).toEqual(config);
    });

    it('clears expired pending configuration automatically', () => {
      const config = {
        amount: '100',
        leverage: 5,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      // Fast-forward 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // First call should clear expired config
      controller.getPendingTradeConfiguration('BTC');

      // Second call should return undefined
      const result = controller.getPendingTradeConfiguration('BTC');
      expect(result).toBeUndefined();

      // Verify state was cleaned up
      const network = controller.state.isTestnet ? 'testnet' : 'mainnet';
      expect(
        controller.state.tradeConfigurations[network]?.BTC?.pendingConfig,
      ).toBeUndefined();
    });

    it('clears pending trade configuration explicitly', () => {
      const config = {
        amount: '100',
        leverage: 5,
      };

      controller.savePendingTradeConfiguration('BTC', config);
      expect(controller.getPendingTradeConfiguration('BTC')).toEqual(config);

      controller.clearPendingTradeConfiguration('BTC');

      const result = controller.getPendingTradeConfiguration('BTC');
      expect(result).toBeUndefined();
    });

    it('saves pending config per network (testnet vs mainnet)', () => {
      const configMainnet = {
        amount: '100',
        leverage: 5,
      };
      const configTestnet = {
        amount: '200',
        leverage: 10,
      };

      // Save on mainnet (default is mainnet)
      controller.savePendingTradeConfiguration('BTC', configMainnet);
      expect(controller.getPendingTradeConfiguration('BTC')).toEqual(
        configMainnet,
      );

      // Switch to testnet using update method
      controller.testUpdate((state) => {
        state.isTestnet = true;
      });
      controller.savePendingTradeConfiguration('BTC', configTestnet);
      expect(controller.getPendingTradeConfiguration('BTC')).toEqual(
        configTestnet,
      );

      // Switch back to mainnet
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });
      expect(controller.getPendingTradeConfiguration('BTC')).toEqual(
        configMainnet,
      );
    });

    it('preserves existing leverage when saving pending config', () => {
      // First save leverage
      controller.saveTradeConfiguration('BTC', 10);

      // Then save pending config
      const pendingConfig = {
        amount: '100',
        leverage: 5,
      };
      controller.savePendingTradeConfiguration('BTC', pendingConfig);

      // Leverage should still be saved
      const savedConfig = controller.getTradeConfiguration('BTC');
      expect(savedConfig?.leverage).toBe(10);

      // Pending config should also be available
      const pending = controller.getPendingTradeConfiguration('BTC');
      expect(pending).toEqual(pendingConfig);
    });
  });

  describe('WebSocket connection state', () => {
    // Import actual enum to ensure type compatibility
    const { WebSocketConnectionState } = jest.requireActual('../../src/types');

    it('getWebSocketConnectionState returns state from active provider', () => {
      // Arrange
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      mockProvider.getWebSocketConnectionState.mockReturnValue(
        WebSocketConnectionState.Connected,
      );

      // Act
      const result = controller.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Connected);
      expect(mockProvider.getWebSocketConnectionState).toHaveBeenCalled();
    });

    it('getWebSocketConnectionState returns DISCONNECTED when provider does not support method', () => {
      // Arrange
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      // Remove the method to simulate provider without support
      mockProvider.getWebSocketConnectionState = undefined as never;

      // Act
      const result = controller.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Disconnected);
    });

    it('getWebSocketConnectionState returns DISCONNECTED when no provider is active', () => {
      // Arrange - don't set up any provider

      // Act
      const result = controller.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Disconnected);
    });

    it('subscribeToConnectionState delegates to active provider', () => {
      // Arrange
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      const mockUnsubscribe = jest.fn();
      mockProvider.subscribeToConnectionState.mockReturnValue(mockUnsubscribe);
      const listener = jest.fn();

      // Act
      const unsubscribe = controller.subscribeToConnectionState(listener);

      // Assert
      expect(mockProvider.subscribeToConnectionState).toHaveBeenCalledWith(
        listener,
      );
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it('subscribeToConnectionState calls listener immediately when provider does not support method', () => {
      // Arrange
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      // Keep getWebSocketConnectionState but remove subscribeToConnectionState
      mockProvider.getWebSocketConnectionState.mockReturnValue(
        WebSocketConnectionState.Disconnected,
      );
      mockProvider.subscribeToConnectionState = undefined as never;
      const listener = jest.fn();

      // Act
      const unsubscribe = controller.subscribeToConnectionState(listener);

      // Assert - listener is called with result of getWebSocketConnectionState()
      expect(listener).toHaveBeenCalledWith(
        WebSocketConnectionState.Disconnected,
        0,
      );
      expect(typeof unsubscribe).toBe('function');
    });

    it('subscribeToConnectionState returns no-op when no provider is active', () => {
      // Arrange - don't set up any provider
      const listener = jest.fn();

      // Act
      const unsubscribe = controller.subscribeToConnectionState(listener);

      // Assert
      expect(listener).toHaveBeenCalledWith(
        WebSocketConnectionState.Disconnected,
        0,
      );
      expect(typeof unsubscribe).toBe('function');
      // Verify unsubscribe doesn't throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it('reconnect delegates to active provider', async () => {
      // Arrange
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      mockProvider.reconnect.mockResolvedValue(undefined);

      // Act
      await controller.reconnect();

      // Assert
      expect(mockProvider.reconnect).toHaveBeenCalled();
    });

    it('reconnect does nothing when provider does not support method', async () => {
      // Arrange
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      // Remove the method to simulate provider without support
      mockProvider.reconnect = undefined as never;

      // Act & Assert - should not throw
      await expect(controller.reconnect()).resolves.toBeUndefined();
    });

    it('reconnect does nothing when no provider is active', async () => {
      // Arrange - don't set up any provider

      // Act & Assert - should not throw
      await expect(controller.reconnect()).resolves.toBeUndefined();
    });
  });

  describe('order book grouping', () => {
    it('saves order book grouping for mainnet', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });

      controller.saveOrderBookGrouping('BTC', 10);

      const result = controller.getOrderBookGrouping('BTC');
      expect(result).toBe(10);
    });

    it('saves order book grouping for testnet', () => {
      controller.testUpdate((state) => {
        state.isTestnet = true;
      });

      controller.saveOrderBookGrouping('ETH', 0.01);

      const result = controller.getOrderBookGrouping('ETH');
      expect(result).toBe(0.01);
    });

    it('returns undefined when no grouping is saved', () => {
      const result = controller.getOrderBookGrouping('SOL');
      expect(result).toBeUndefined();
    });

    it('preserves existing config when saving grouping', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });

      // First save leverage
      controller.saveTradeConfiguration('BTC', 5);

      // Then save grouping
      controller.saveOrderBookGrouping('BTC', 100);

      // Both should be preserved
      const savedConfig = controller.getTradeConfiguration('BTC');
      expect(savedConfig?.leverage).toBe(5);

      const savedGrouping = controller.getOrderBookGrouping('BTC');
      expect(savedGrouping).toBe(100);
    });
  });

  describe('standalone mode', () => {
    const mockUserAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    const MockedHyperLiquidProvider = HyperLiquidProvider as jest.MockedClass<
      typeof HyperLiquidProvider
    >;

    beforeEach(() => {
      // Reset mocks before each test
      MockedHyperLiquidProvider.mockClear();
    });

    describe('getPositions with standalone mode', () => {
      it('uses existing provider for standalone queries when available', async () => {
        // Arrange - set up mock provider with properly typed positions
        const mockPositions = [
          createMockPosition({ symbol: 'BTC', size: '0.5' }),
        ];
        const existingMockProvider = createMockHyperLiquidProvider();
        existingMockProvider.getPositions.mockResolvedValue(mockPositions);
        controller.testSetProviders(
          new Map([['hyperliquid', existingMockProvider]]),
        );
        controller.testMarkInitialized();
        controller.testUpdate((state) => {
          state.activeProvider = 'hyperliquid';
        });

        // Act
        const positions = await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - should use existing provider
        expect(existingMockProvider.getPositions).toHaveBeenCalledWith({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(positions).toEqual(mockPositions);
        // Should NOT create a new HyperLiquidProvider instance
        expect(MockedHyperLiquidProvider).not.toHaveBeenCalled();
      });

      it('creates temporary provider for standalone queries when no activeProviderInstance', async () => {
        // Arrange - no activeProviderInstance set (pre-initialization)
        const mockPositions = [
          createMockPosition({ symbol: 'ETH', size: '2.0' }),
        ];
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getPositions.mockResolvedValue(mockPositions);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        controller.testUpdate((state) => {
          state.activeProvider = 'aggregated';
          state.isTestnet = false;
        });

        // Act
        const positions = await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - should create a temporary provider for pre-init discovery
        expect(MockedHyperLiquidProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            isTestnet: false,
          }),
        );
        expect(positions).toEqual(mockPositions);
      });

      it('bypasses getActiveProvider check for standalone queries', async () => {
        // Arrange - controller not initialized (no provider available via normal path)
        const mockPositions = [
          createMockPosition({ symbol: 'BTC', size: '1.0' }),
        ];
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getPositions.mockResolvedValue(mockPositions);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Initializing;
          state.activeProvider = 'aggregated';
        });

        // Act - should NOT throw despite controller not being initialized
        const positions = await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(positions).toEqual(mockPositions);
      });
    });

    describe('getAccountState with standalone mode', () => {
      // Complete AccountState mock with all required fields
      const createMockAccountState = (overrides = {}) => ({
        totalBalance: '50000',
        spendableBalance: '45000',
        withdrawableBalance: '45000',
        marginUsed: '5000',
        unrealizedPnl: '1000',
        returnOnEquity: '20',
        ...overrides,
      });

      it('uses existing provider for standalone queries when available', async () => {
        // Arrange
        const mockAccountState = createMockAccountState();
        const existingMockProvider = createMockHyperLiquidProvider();
        existingMockProvider.getAccountState.mockResolvedValue(
          mockAccountState,
        );
        controller.testSetProviders(
          new Map([['hyperliquid', existingMockProvider]]),
        );
        controller.testMarkInitialized();
        controller.testUpdate((state) => {
          state.activeProvider = 'hyperliquid';
        });

        // Act
        const accountState = await controller.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - should use existing provider
        expect(existingMockProvider.getAccountState).toHaveBeenCalledWith({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(accountState).toEqual(mockAccountState);
        expect(MockedHyperLiquidProvider).not.toHaveBeenCalled();
      });

      it('creates temporary provider for standalone queries when no activeProviderInstance', async () => {
        // Arrange - no activeProviderInstance set (pre-initialization)
        const mockAccountState = createMockAccountState({
          totalBalance: '25000',
          spendableBalance: '20000',
          withdrawableBalance: '20000',
        });
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getAccountState.mockResolvedValue(mockAccountState);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        controller.testUpdate((state) => {
          state.activeProvider = 'aggregated';
          state.isTestnet = true;
        });

        // Act
        const accountState = await controller.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert - should create a temporary provider for pre-init discovery
        expect(MockedHyperLiquidProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            isTestnet: true,
          }),
        );
        expect(accountState).toEqual(mockAccountState);
      });

      it('bypasses getActiveProvider check for standalone queries', async () => {
        // Arrange - controller not initialized (no provider available via normal path)
        const mockAccountState = createMockAccountState({
          totalBalance: '10000',
        });
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getAccountState.mockResolvedValue(mockAccountState);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Initializing;
          state.activeProvider = 'aggregated';
        });

        // Act - should NOT throw despite controller not being initialized
        const accountState = await controller.getAccountState({
          standalone: true,
          userAddress: mockUserAddress,
        });

        // Assert
        expect(accountState).toEqual(mockAccountState);
      });
    });

    describe('standalone provider caching', () => {
      it('reuses the same standalone provider across multiple calls', async () => {
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getPositions.mockResolvedValue([]);
        tempMockProvider.getOpenOrders.mockResolvedValue([]);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        // Two standalone calls — should only create one provider
        await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        await controller.getOpenOrders({
          standalone: true,
          userAddress: mockUserAddress,
        });

        expect(MockedHyperLiquidProvider).toHaveBeenCalledTimes(1);
        expect(controller.testHasStandaloneProvider()).toBe(true);
      });

      it('cleans up standalone provider on init()', async () => {
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getPositions.mockResolvedValue([]);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        // Create a cached standalone provider
        await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(controller.testHasStandaloneProvider()).toBe(true);

        // init() should clean it up
        await controller.init();

        expect(controller.testHasStandaloneProvider()).toBe(false);
        expect(tempMockProvider.disconnect).toHaveBeenCalled();
      });

      it('invalidates cached provider when isTestnet changes', async () => {
        const firstProvider = createMockHyperLiquidProvider();
        firstProvider.getPositions.mockResolvedValue([]);
        const secondProvider = createMockHyperLiquidProvider();
        secondProvider.getPositions.mockResolvedValue([]);
        MockedHyperLiquidProvider.mockImplementationOnce(
          () => firstProvider,
        ).mockImplementationOnce(() => secondProvider);

        // First standalone call on mainnet
        await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(MockedHyperLiquidProvider).toHaveBeenCalledTimes(1);

        // Toggle testnet flag (simulates config change)
        controller.testUpdate((state) => {
          state.isTestnet = true;
        });

        // Second standalone call — should create a new provider
        await controller.getPositions({
          standalone: true,
          userAddress: mockUserAddress,
        });
        expect(MockedHyperLiquidProvider).toHaveBeenCalledTimes(2);
        // Old provider should have been disconnected
        expect(firstProvider.disconnect).toHaveBeenCalled();
      });

      it('cleans up standalone provider on disconnect()', async () => {
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getMarketDataWithPrices.mockResolvedValue([]);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        await controller.getMarketDataWithPrices({ standalone: true });
        expect(controller.testHasStandaloneProvider()).toBe(true);

        await controller.disconnect();

        expect(controller.testHasStandaloneProvider()).toBe(false);
        expect(tempMockProvider.disconnect).toHaveBeenCalled();
      });

      it('cleans up standalone provider on stopMarketDataPreload()', async () => {
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getMarkets.mockResolvedValue([]);
        MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

        await controller.getMarkets({ standalone: true });
        expect(controller.testHasStandaloneProvider()).toBe(true);

        controller.stopMarketDataPreload();

        // Fire-and-forget — give microtask a tick to resolve
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(controller.testHasStandaloneProvider()).toBe(false);
        expect(tempMockProvider.disconnect).toHaveBeenCalled();
      });
    });
  });

  describe('setSelectedPaymentToken', () => {
    it('sets selectedPaymentToken to null when passed null', () => {
      controller.testUpdate((state) => {
        state.selectedPaymentToken = {
          description: 'USDC',
          address: '0xa0b8',
          chainId: '0x1',
        } as PerpsControllerState['selectedPaymentToken'];
      });

      controller.setSelectedPaymentToken(null);

      expect(controller.state.selectedPaymentToken).toBeNull();
    });

    it('sets selectedPaymentToken to null when token has PerpsBalanceTokenDescription', () => {
      controller.setSelectedPaymentToken({
        description: 'perps-balance',
        address: '0x0',
        chainId: '0x1',
      } as Parameters<PerpsController['setSelectedPaymentToken']>[0]);

      expect(controller.state.selectedPaymentToken).toBeNull();
    });

    it('stores description, address and chainId when passed a normal token', () => {
      const token = {
        description: 'USDC',
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as const,
        chainId: '0x1' as const,
      };

      controller.setSelectedPaymentToken(
        token as Parameters<PerpsController['setSelectedPaymentToken']>[0],
      );

      expect(controller.state.selectedPaymentToken).toMatchObject({
        description: 'USDC',
        address: token.address,
        chainId: token.chainId,
      });
    });
  });
});
