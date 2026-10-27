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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockedClass } from 'vitest';

import {
  createMockHyperLiquidProvider,
  createMockPosition,
} from '../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));

import {
  PERPS_EVENT_PROPERTY,
  PERPS_EVENT_VALUE,
} from '../../src/constants/eventNames.js';
import {
  PERPS_CONSTANTS,
  PERPS_DISK_CACHE_MARKETS,
  PERPS_DISK_CACHE_USER_DATA,
} from '../../src/constants/perpsConfig.js';
import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
  PerpsMode,
} from '../../src/PerpsController.js';
import type { PerpsControllerState } from '../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import * as accountServiceModule from '../../src/services/AccountService.js';
import * as dataLakeServiceModule from '../../src/services/DataLakeService.js';
import * as depositServiceModule from '../../src/services/DepositService.js';
import * as eligibilityServiceModule from '../../src/services/EligibilityService.js';
import * as featureFlagConfigurationServiceModule from '../../src/services/FeatureFlagConfigurationService.js';
import * as marketDataServiceModule from '../../src/services/MarketDataService.js';
import * as tradingServiceModule from '../../src/services/TradingService.js';
import type {
  AccountState,
  GetAvailableDexsParams,
  MarginMode,
  PerpsProvider,
  PerpsPlatformDependencies,
  PerpsProviderType,
  SubscribeAccountParams,
} from '../../src/types/index.js';
import {
  PerpsAnalyticsEvent,
  WebSocketConnectionState,
} from '../../src/types/index.js';

vi.mock('../../src/providers/HyperLiquidProvider');

// Mock transaction controller utility
const mockAddTransaction = vi.fn();
vi.mock('../../../util/transaction-controller', () => ({
  addTransaction: (...args: unknown[]) => mockAddTransaction(...args),
}));

// Mock wait utility to speed up retry tests
vi.mock('../../src/utils/wait', () => ({
  wait: vi.fn().mockResolvedValue(undefined),
}));

// Mock stream manager
const mockStreamManager = {
  positions: { pause: vi.fn(), resume: vi.fn() },
  account: { pause: vi.fn(), resume: vi.fn() },
  orders: { pause: vi.fn(), resume: vi.fn() },
  prices: { pause: vi.fn(), resume: vi.fn() },
  orderFills: { pause: vi.fn(), resume: vi.fn() },
};

vi.mock('../../../components/UI/Perps/providers/PerpsStreamManager', () => ({
  getStreamManagerInstance: vi.fn(() => mockStreamManager),
}));

vi.mock(import('@metamask/utils'), async (importOriginal) => ({
  ...(await importOriginal()),
  formatAccountToCaipAccountId: vi
    .fn()
    .mockReturnValue('eip155:1:0x1234567890123456789012345678901234567890'),
}));

// Mock EligibilityService as a class with instance methods
const mockEligibilityServiceInstance = {
  checkEligibility: vi.fn().mockResolvedValue(true),
};
vi.mock('../../src/services/EligibilityService', () => ({
  EligibilityService: vi.fn().mockImplementation(function () {
    return mockEligibilityServiceInstance;
  }),
}));

// Mock DepositService as a class with instance methods
const mockDepositServiceInstance = {
  prepareTransaction: vi.fn(),
};
vi.mock('../../src/services/DepositService', () => ({
  DepositService: vi.fn().mockImplementation(function () {
    return mockDepositServiceInstance;
  }),
}));

// Mock MarketDataService as a class with instance methods
const mockMarketDataServiceInstance = {
  getPositions: vi.fn(),
  getAccountState: vi.fn(),
  getMarkets: vi.fn(),
  getMarketDataWithPrices: vi
    .fn()
    .mockImplementation(
      ({
        provider,
      }: {
        provider: { getMarketDataWithPrices: () => Promise<unknown[]> };
      }) => provider.getMarketDataWithPrices(),
    ),
  getWithdrawalRoutes: vi.fn().mockReturnValue([]),
  validateClosePosition: vi.fn().mockResolvedValue({ isValid: true }),
  validateOrder: vi.fn(),
  calculateMaintenanceMargin: vi.fn().mockResolvedValue(0),
  calculateLiquidationPrice: vi.fn(),
  getMaxLeverage: vi.fn(),
  calculateFees: vi.fn().mockResolvedValue({ totalFee: 0 }),
  previewPositionModify: vi.fn(),
  getAvailableDexs: vi.fn().mockResolvedValue([]),
  getBlockExplorerUrl: vi.fn(),
  getOrderFills: vi.fn(),
  getOrders: vi.fn(),
  getFunding: vi.fn(),
};
vi.mock('../../src/services/MarketDataService', () => ({
  MarketDataService: vi.fn().mockImplementation(function () {
    return mockMarketDataServiceInstance;
  }),
}));

// Mock TradingService as a class with instance methods
const mockTradingServiceInstance = {
  placeOrder: vi.fn(),
  editOrder: vi.fn(),
  cancelOrder: vi.fn(),
  cancelOrders: vi.fn(),
  closePosition: vi.fn(),
  closePositions: vi.fn(),
  updatePositionTPSL: vi.fn(),
  updateMargin: vi.fn(),
  flipPosition: vi.fn(),
  setControllerDependencies: vi.fn(),
};
vi.mock('../../src/services/TradingService', () => ({
  TradingService: vi.fn().mockImplementation(function () {
    return mockTradingServiceInstance;
  }),
}));

// Mock AccountService as a class with instance methods
const mockAccountServiceInstance = {
  withdraw: vi.fn(),
  validateWithdrawal: vi.fn(),
};
vi.mock('../../src/services/AccountService', () => ({
  AccountService: vi.fn().mockImplementation(function () {
    return mockAccountServiceInstance;
  }),
}));

// Mock DataLakeService as a class with instance methods
const mockDataLakeServiceInstance = {
  reportOrder: vi.fn(),
};
vi.mock('../../src/services/DataLakeService', () => ({
  DataLakeService: vi.fn().mockImplementation(function () {
    return mockDataLakeServiceInstance;
  }),
}));

// Mock FeatureFlagConfigurationService as a class with instance methods
const mockFeatureFlagConfigurationServiceInstance = {
  refreshEligibility: vi.fn((options: any) => {
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
  refreshHip3Config: vi.fn(),
  setBlockedRegions: vi.fn((options: any) => {
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
vi.mock('../../src/services/FeatureFlagConfigurationService', () => ({
  FeatureFlagConfigurationService: vi.fn().mockImplementation(function () {
    return mockFeatureFlagConfigurationServiceInstance;
  }),
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
}

describe('PerpsController', () => {
  let controller: TestablePerpsController;
  let mockProvider: Mocked<HyperLiquidProvider>;
  let mockInfrastructure: Mocked<PerpsPlatformDependencies>;

  // Helper to mark controller as initialized for tests
  const markControllerAsInitialized = () => {
    controller.testMarkInitialized();
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (
      (eligibilityServiceModule as unknown as Record<string, Mock>)
        .EligibilityService as Mock
    ).mockImplementation(function () {
      return mockEligibilityServiceInstance;
    });
    (
      (depositServiceModule as unknown as Record<string, Mock>)
        .DepositService as Mock
    ).mockImplementation(function () {
      return mockDepositServiceInstance;
    });
    (
      (marketDataServiceModule as unknown as Record<string, Mock>)
        .MarketDataService as Mock
    ).mockImplementation(function () {
      return mockMarketDataServiceInstance;
    });
    (
      (tradingServiceModule as unknown as Record<string, Mock>)
        .TradingService as Mock
    ).mockImplementation(function () {
      return mockTradingServiceInstance;
    });
    (
      (accountServiceModule as unknown as Record<string, Mock>)
        .AccountService as Mock
    ).mockImplementation(function () {
      return mockAccountServiceInstance;
    });
    (
      (dataLakeServiceModule as unknown as Record<string, Mock>)
        .DataLakeService as Mock
    ).mockImplementation(function () {
      return mockDataLakeServiceInstance;
    });
    (
      (featureFlagConfigurationServiceModule as unknown as Record<string, Mock>)
        .FeatureFlagConfigurationService as Mock
    ).mockImplementation(function () {
      return mockFeatureFlagConfigurationServiceInstance;
    });

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
      HyperLiquidProvider as MockedClass<typeof HyperLiquidProvider>
    ).mockImplementation(function () {
      return mockProvider;
    });

    const mockCall = vi.fn().mockImplementation((action: string) => {
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
          (value as Mock).mockClear();
        }
      });
    }
    (mockInfrastructure.metrics.trackPerpsEvent as Mock).mockClear();
    (mockInfrastructure.logger.error as Mock).mockClear();
    (mockInfrastructure.debugLogger.log as Mock).mockClear();
  });
  describe('toggleTestnet', () => {
    it('returns error when already reinitializing', async () => {
      await controller.init();
      vi.spyOn(controller, 'isCurrentlyReinitializing').mockReturnValue(true);

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

      mockProvider.disconnect.mockRejectedValue(
        new Error('Network toggle init failed'),
      );

      const result = await controller.toggleTestnet();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network toggle init failed');
      // isTestnet should be rolled back to its original value
      expect(result.isTestnet).toBe(initialTestnetState);
      expect(controller.state.isTestnet).toBe(initialTestnetState);
    });

    it('clears isReinitializing flag after init failure', async () => {
      await controller.init();

      mockProvider.disconnect.mockRejectedValue(new Error('Init failed'));

      await controller.toggleTestnet();

      expect(controller.isCurrentlyReinitializing()).toBe(false);
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
    it('defaults to collapsed order book, expanded chart, reserved positions, and positions/orders sort/filter defaults', () => {
      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: false,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
        positionsSideFilter: 'all',
        positionsSortField: 'positionValue',
        positionsSortDirection: 'desc',
        ordersSideFilter: 'all',
        ordersSortField: 'time',
        ordersSortDirection: 'desc',
      });
    });

    it('updates a single field without clobbering the others', () => {
      controller.setProLayoutPreferences({ orderBookExpanded: true });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: true,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
        positionsSideFilter: 'all',
        positionsSortField: 'positionValue',
        positionsSortDirection: 'desc',
        ordersSideFilter: 'all',
        ordersSortField: 'time',
        ordersSortDirection: 'desc',
      });
    });

    it('merges successive partial patches', () => {
      controller.setProLayoutPreferences({ orderBookExpanded: true });
      controller.setProLayoutPreferences({ orderBookPosition: 'right' });
      controller.setProLayoutPreferences({ orderFormPosition: 'left' });
      controller.setProLayoutPreferences({ positionsSideFilter: 'long' });
      controller.setProLayoutPreferences({
        positionsSortField: 'unrealizedPnl',
        positionsSortDirection: 'asc',
      });
      controller.setProLayoutPreferences({
        ordersSideFilter: 'short',
        ordersSortField: 'orderValue',
        ordersSortDirection: 'asc',
      });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: true,
        chartExpanded: true,
        orderBookPosition: 'right',
        orderFormPosition: 'left',
        positionsSideFilter: 'long',
        positionsSortField: 'unrealizedPnl',
        positionsSortDirection: 'asc',
        ordersSideFilter: 'short',
        ordersSortField: 'orderValue',
        ordersSortDirection: 'asc',
      });
    });

    it('updates sort field without clobbering sort direction', () => {
      controller.setProLayoutPreferences({
        positionsSortField: 'fundingRate',
        positionsSortDirection: 'asc',
      });
      controller.setProLayoutPreferences({
        positionsSortField: 'unrealizedPnl',
      });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: false,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
        positionsSideFilter: 'all',
        positionsSortField: 'unrealizedPnl',
        positionsSortDirection: 'asc',
        ordersSideFilter: 'all',
        ordersSortField: 'time',
        ordersSortDirection: 'desc',
      });
    });

    it('updates orders sort field without clobbering orders sort direction or positions sort', () => {
      controller.setProLayoutPreferences({
        ordersSortField: 'size',
        ordersSortDirection: 'asc',
      });
      controller.setProLayoutPreferences({
        ordersSortField: 'price',
      });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: false,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
        positionsSideFilter: 'all',
        positionsSortField: 'positionValue',
        positionsSortDirection: 'desc',
        ordersSideFilter: 'all',
        ordersSortField: 'price',
        ordersSortDirection: 'asc',
      });
    });

    it('updates orders side filter without clobbering positions side filter', () => {
      controller.setProLayoutPreferences({ positionsSideFilter: 'long' });
      controller.setProLayoutPreferences({ ordersSideFilter: 'short' });

      expect(controller.getProLayoutPreferences()).toEqual({
        orderBookExpanded: false,
        chartExpanded: true,
        orderBookPosition: 'left',
        orderFormPosition: 'right',
        positionsSideFilter: 'long',
        positionsSortField: 'positionValue',
        positionsSortDirection: 'desc',
        ordersSideFilter: 'short',
        ordersSortField: 'time',
        ordersSortDirection: 'desc',
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
        positionsSideFilter: 'all',
        positionsSortField: 'positionValue',
        positionsSortDirection: 'desc',
        ordersSideFilter: 'all',
        ordersSortField: 'time',
        ordersSortDirection: 'desc',
      });
    });
  });

  describe('order book preferences', () => {
    it('defaults to USD totals', () => {
      expect(controller.getOrderBookPreferences()).toEqual({
        currency: 'usd',
        metric: 'total',
      });
    });

    it('updates a single preference without clobbering the other', () => {
      controller.setOrderBookPreferences({ currency: 'base' });

      expect(controller.getOrderBookPreferences()).toEqual({
        currency: 'base',
        metric: 'total',
      });
    });

    it('fills in defaults for fields missing from persisted state', () => {
      controller.testUpdate((state) => {
        state.orderBookPreferences = {
          metric: 'size',
        } as PerpsControllerState['orderBookPreferences'];
      });

      expect(controller.getOrderBookPreferences()).toEqual({
        currency: 'usd',
        metric: 'size',
      });
    });
  });

  describe('selected order type', () => {
    it('defaults to market and persists independently of market', () => {
      expect(controller.getSelectedOrderType()).toBe('market');

      controller.setSelectedOrderType('limit');

      expect(controller.getSelectedOrderType()).toBe('limit');
      controller.saveTradeConfiguration('ETH', 5);
      expect(controller.getSelectedOrderType()).toBe('limit');
      controller.testUpdate((state) => {
        state.isTestnet = true;
      });
      expect(controller.getSelectedOrderType()).toBe('limit');
    });
  });

  describe('visible candle count', () => {
    it('defaults to 30 and persists a valid count', () => {
      expect(controller.getVisibleCandleCount()).toBe(30);

      controller.setVisibleCandleCount(45);

      expect(controller.getVisibleCandleCount()).toBe(45);
    });

    it('clamps to the supported range and rounds to a whole candle', () => {
      controller.setVisibleCandleCount(9);
      expect(controller.getVisibleCandleCount()).toBe(10);

      controller.setVisibleCandleCount(251);
      expect(controller.getVisibleCandleCount()).toBe(250);

      controller.setVisibleCandleCount(42.6);
      expect(controller.getVisibleCandleCount()).toBe(43);
    });

    it('ignores non-finite values', () => {
      controller.setVisibleCandleCount(45);
      controller.setVisibleCandleCount(Number.NaN);

      expect(controller.getVisibleCandleCount()).toBe(45);
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
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('saves pending trade configuration', () => {
      const config = {
        amount: '100',
        leverage: 5,
        takeProfitPrice: '50000',
        stopLossPrice: '40000',
        limitPrice: '45000',
        orderType: 'limit' as const,
        reduceOnly: true,
        direction: 'short' as const,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      const result = controller.getPendingTradeConfiguration('BTC');
      expect(result).toEqual(config);
      expect(controller.getSelectedOrderType()).toBe('limit');
    });

    it('restores a short direction from a pending trade configuration', () => {
      controller.savePendingTradeConfiguration('BTC', {
        amount: '100',
        direction: 'short',
      });

      const result = controller.getPendingTradeConfiguration('BTC');

      expect(result).toEqual({
        amount: '100',
        direction: 'short',
      });
    });

    it('returns undefined for non-existent pending configuration', () => {
      const result = controller.getPendingTradeConfiguration('ETH');

      expect(result).toBeUndefined();
    });

    it('returns undefined for expired pending configuration (more than 30 seconds)', () => {
      const config = {
        amount: '100',
        leverage: 5,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      vi.advanceTimersByTime(30_001);

      const result = controller.getPendingTradeConfiguration('BTC');

      expect(result).toBeUndefined();
    });

    it('returns configuration for valid pending configuration (less than 30 seconds)', () => {
      const config = {
        amount: '100',
        leverage: 5,
        takeProfitPrice: '50000',
        orderType: 'market' as const,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      vi.advanceTimersByTime(29_999);

      const result = controller.getPendingTradeConfiguration('BTC');

      expect(result).toEqual(config);
    });

    it('clears expired pending configuration automatically', () => {
      const config = {
        amount: '100',
        leverage: 5,
      };

      controller.savePendingTradeConfiguration('BTC', config);

      vi.advanceTimersByTime(30_001);

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

    it('clears only the draft while retaining leverage and selected order type', () => {
      controller.saveTradeConfiguration('BTC', 10);
      controller.setSelectedOrderType('limit');
      controller.savePendingTradeConfiguration('BTC', {
        amount: '100',
        leverage: 5,
        orderType: 'limit',
        reduceOnly: true,
      });

      controller.clearPendingTradeConfiguration('BTC');

      expect(controller.getPendingTradeConfiguration('BTC')).toBeUndefined();
      expect(controller.getTradeConfiguration('BTC')).toEqual({
        leverage: 10,
      });
      expect(controller.getSelectedOrderType()).toBe('limit');
    });

    it('clears the draft after a successful order', async () => {
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      mockTradingServiceInstance.placeOrder.mockResolvedValue({
        success: true,
        orderId: 'order-1',
      });
      controller.savePendingTradeConfiguration('BTC', {
        amount: '100',
        reduceOnly: true,
      });

      await controller.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      });

      expect(controller.getPendingTradeConfiguration('BTC')).toBeUndefined();
    });

    it('retains the draft after an unsuccessful order', async () => {
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      mockTradingServiceInstance.placeOrder.mockResolvedValue({
        success: false,
        error: 'Order failed',
      });
      const config = {
        amount: '100',
        reduceOnly: true,
      };
      controller.savePendingTradeConfiguration('BTC', config);

      await controller.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      });

      expect(controller.getPendingTradeConfiguration('BTC')).toEqual(config);
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
      const mockUnsubscribe = vi.fn();
      mockProvider.subscribeToConnectionState.mockReturnValue(mockUnsubscribe);
      const listener = vi.fn();

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
      const listener = vi.fn();

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
      const listener = vi.fn();

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

    it('tags reconnect errors for the existing connection widgets', async () => {
      const error = new Error('Reconnect failed');
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      markControllerAsInitialized();
      mockProvider.reconnect.mockRejectedValue(error);

      await controller.reconnect();

      expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: expect.objectContaining({
            feature: 'perps',
            operation: 'connection_management',
            component: 'PerpsConnectionManager',
            action: 'connection_connection',
          }),
          context: {
            name: 'PerpsController',
            data: expect.objectContaining({
              method: 'reconnect',
              operation: 'websocket_reconnect',
            }),
          },
        }),
      );
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

  describe('margin mode', () => {
    it('saves margin mode for mainnet', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });

      controller.saveMarginMode('BTC', 'cross');

      expect(controller.getMarginMode('BTC')).toBe('cross');
      expect(controller.state.tradeConfigurations.mainnet.BTC).toStrictEqual({
        marginMode: 'cross',
      });
    });

    it('saves margin mode for testnet without touching mainnet', () => {
      controller.testUpdate((state) => {
        state.isTestnet = true;
      });

      controller.saveMarginMode('ETH', 'isolated');

      expect(controller.getMarginMode('ETH')).toBe('isolated');
      expect(controller.state.tradeConfigurations.mainnet.ETH).toBeUndefined();
    });

    it('returns undefined when no margin mode is saved', () => {
      expect(controller.getMarginMode('SOL')).toBeUndefined();
    });

    it('overwrites the previous margin mode for the same market', () => {
      controller.saveMarginMode('BTC', 'cross');
      controller.saveMarginMode('BTC', 'isolated');

      expect(controller.getMarginMode('BTC')).toBe('isolated');
    });

    it('preserves existing config when saving margin mode', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });
      controller.saveTradeConfiguration('BTC', 5);
      controller.saveOrderBookGrouping('BTC', 100);

      controller.saveMarginMode('BTC', 'cross');

      expect(controller.getTradeConfiguration('BTC')?.leverage).toBe(5);
      expect(controller.getOrderBookGrouping('BTC')).toBe(100);
      expect(controller.getMarginMode('BTC')).toBe('cross');
    });

    it('ignores values that are not a margin mode', () => {
      controller.saveMarginMode('BTC', 'cross');

      controller.saveMarginMode('BTC', 'portfolio' as MarginMode);

      expect(controller.getMarginMode('BTC')).toBe('cross');
    });

    it('exposes margin mode methods as messenger actions', async () => {
      const messenger = createMockMessenger();
      const localController = new TestablePerpsController({
        messenger,
        state: getDefaultPerpsControllerState(),
        infrastructure: mockInfrastructure,
      });

      await localController.init();

      expect(messenger.registerMethodActionHandlers).toHaveBeenCalledWith(
        localController,
        expect.arrayContaining(['getMarginMode', 'saveMarginMode']),
      );
    });
  });

  describe('standalone mode', () => {
    const mockUserAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    const MockedHyperLiquidProvider = HyperLiquidProvider as MockedClass<
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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementationOnce(function () {
          return firstProvider;
        }).mockImplementationOnce(function () {
          return secondProvider;
        });

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
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

        await controller.getMarketDataWithPrices({ standalone: true });
        expect(controller.testHasStandaloneProvider()).toBe(true);

        await controller.disconnect();

        expect(controller.testHasStandaloneProvider()).toBe(false);
        expect(tempMockProvider.disconnect).toHaveBeenCalled();
      });

      it('cleans up standalone provider on stopMarketDataPreload()', async () => {
        const tempMockProvider = createMockHyperLiquidProvider();
        tempMockProvider.getMarkets.mockResolvedValue([]);
        MockedHyperLiquidProvider.mockImplementation(function () {
          return tempMockProvider;
        });

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
