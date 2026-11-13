/* eslint-disable */
/**
 * PerpsController Tests
 * Clean, focused test suite for PerpsController
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockedClass } from 'vitest';

import {
  createMockHyperLiquidProvider,
  createMockPosition,
} from '../helpers/providerMocks.js';
import {
  createKeyringlessMessenger,
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));

import type {
  PerpsAvailableToTrade,
  PerpsControllerGetPublicTradesAction,
  PerpsControllerSubscribeToAvailableToTradeAction,
  PerpsControllerSubscribeToPublicTradesAction,
  PublicTrade,
  SubscribeAvailableToTradeParams,
  SubscribePublicTradesParams,
} from '../../src/index.js';
import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
} from '../../src/PerpsController.js';
import type { AccountState } from '../../src/types/index.js';
import type { PerpsControllerState } from '../../src/PerpsController.js';
import { AggregatedPerpsProvider } from '../../src/providers/AggregatedPerpsProvider.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import * as accountServiceModule from '../../src/services/AccountService.js';
import * as dataLakeServiceModule from '../../src/services/DataLakeService.js';
import * as depositServiceModule from '../../src/services/DepositService.js';
import * as eligibilityServiceModule from '../../src/services/EligibilityService.js';
import * as featureFlagConfigurationServiceModule from '../../src/services/FeatureFlagConfigurationService.js';
import * as marketDataServiceModule from '../../src/services/MarketDataService.js';
import * as tradingServiceModule from '../../src/services/TradingService.js';
import type {
  PerpsProvider,
  PerpsPlatformDependencies,
  PerpsProviderType,
  SubscribeAccountParams,
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
   * Test-only method to set the active provider instance directly, so tests
   * can install an aggregated wrapper or a specific venue.
   */
  public testSetActiveProvider(provider: PerpsProvider) {
    this.activeProviderInstance = provider;
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
          typeof value === 'object' &&
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
  describe('subscribeToPositions', () => {
    it('subscribes to position updates', () => {
      const mockUnsubscribe = vi.fn();
      const params = {
        callback: vi.fn(),
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.subscribeToPositions.mockReturnValue(mockUnsubscribe);

      const unsubscribe = controller.subscribeToPositions(params);

      expect(unsubscribe).toBe(mockUnsubscribe);
      expect(mockProvider.subscribeToPositions).toHaveBeenCalledWith(params);
    });
  });

  describe('aggregated account stream state propagation', () => {
    let lighterProvider: PerpsProvider;
    let aggregatedProvider: AggregatedPerpsProvider;

    const accountState = (totalBalance: string): AccountState => ({
      spendableBalance: totalBalance,
      withdrawableBalance: totalBalance,
      totalBalance,
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    });

    const setupAggregatedMode = () => {
      markControllerAsInitialized();
      lighterProvider = {
        ...createMockHyperLiquidProvider(),
        protocolId: 'lighter',
      } as unknown as PerpsProvider;
      aggregatedProvider = new AggregatedPerpsProvider({
        providers: new Map<PerpsProviderType, PerpsProvider>([
          ['hyperliquid', mockProvider],
          ['lighter', lighterProvider],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure as never,
      });
      controller.testSetProviders(
        new Map<PerpsProviderType, PerpsProvider>([
          ['hyperliquid', mockProvider],
          ['lighter', lighterProvider],
        ]),
      );
      controller.testSetActiveProvider(aggregatedProvider);
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.defaultProvider = 'hyperliquid';
      });
    };

    it('writes one per-provider balance entry per venue from the stream', () => {
      setupAggregatedMode();
      controller.subscribeToAccount({ callback: vi.fn() });

      const hlCallback =
        mockProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallback = (lighterProvider as any).subscribeToAccount.mock
        .calls[0][0].callback;

      const before = Date.now();
      hlCallback({
        ...accountState('1000.10'),
        unrealizedPnl: '30',
      });
      lighterCallback({
        ...accountState('250.20'),
        unrealizedPnl: '-5',
      });

      const balances = controller.state.perpsBalances;
      expect(Object.keys(balances).sort()).toEqual(['hyperliquid', 'lighter']);
      expect(balances.hyperliquid).toMatchObject({
        totalBalance: '1000.10',
        unrealizedPnl: '30',
      });
      expect(balances.lighter).toMatchObject({
        totalBalance: '250.20',
        unrealizedPnl: '-5',
      });
      expect(balances.hyperliquid.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(balances.lighter.lastUpdated).toBeGreaterThanOrEqual(before);
      // No synthetic combined entry: the total lives in accountState.
      expect(balances.aggregated).toBeUndefined();
      // The combined snapshot is the sum of the venue balances.
      expect(controller.state.accountState?.totalBalance).toBe('1250.3');
    });

    it('preserves a previous accountValue1dAgo and never fabricates one', () => {
      setupAggregatedMode();
      controller.subscribeToAccount({ callback: vi.fn() });
      const hlCallback =
        mockProvider.subscribeToAccount.mock.calls[0][0].callback;

      // First live write: no historical observation exists, so none is made up.
      hlCallback({ ...accountState('100'), unrealizedPnl: '0' });
      expect(
        controller.state.perpsBalances.hyperliquid.accountValue1dAgo,
      ).toBeUndefined();

      // A previous entry's historical value carries forward.
      controller.testUpdate((state) => {
        state.perpsBalances.hyperliquid = {
          ...controller.state.perpsBalances.hyperliquid,
          accountValue1dAgo: '90',
        };
      });
      hlCallback({ ...accountState('110'), unrealizedPnl: '5' });
      expect(controller.state.perpsBalances.hyperliquid).toMatchObject({
        totalBalance: '110',
        unrealizedPnl: '5',
        accountValue1dAgo: '90',
      });
    });

    it('removes a venue balance entry when that venue reports unavailable', () => {
      setupAggregatedMode();
      controller.subscribeToAccount({ callback: vi.fn() });
      const hlCallback =
        mockProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallback = (lighterProvider as any).subscribeToAccount.mock
        .calls[0][0].callback;

      hlCallback(accountState('100'));
      lighterCallback(accountState('200'));
      expect(controller.state.perpsBalances.lighter).toBeDefined();

      // Lighter's data is no longer known: its balance entry goes away
      // instead of being exposed as live, and the aggregate is partial.
      lighterCallback(null);
      expect(controller.state.perpsBalances.lighter).toBeUndefined();
      expect(controller.state.perpsBalances.hyperliquid).toBeDefined();
      expect(controller.state.accountState?.totalBalance).toBe('100');
      expect(controller.state.accountState?.aggregate?.status).toBe('partial');
    });

    it('clears accountState and balances when no venue has data', () => {
      setupAggregatedMode();
      controller.subscribeToAccount({ callback: vi.fn() });
      const hlCallback =
        mockProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallback = (lighterProvider as any).subscribeToAccount.mock
        .calls[0][0].callback;

      hlCallback(accountState('100'));
      lighterCallback(accountState('200'));
      hlCallback(null);
      lighterCallback(null);

      expect(controller.state.accountState).toBeNull();
      expect(controller.state.perpsBalances).toStrictEqual({});
    });

    it('keys a direct-mode balance entry by the active direct provider', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
      });
      controller.subscribeToAccount({ callback: vi.fn() });
      const hlCallback =
        mockProvider.subscribeToAccount.mock.calls[0][0].callback;

      hlCallback(accountState('100'));

      expect(Object.keys(controller.state.perpsBalances)).toEqual([
        'hyperliquid',
      ]);
      expect(controller.state.perpsBalances.hyperliquid).toMatchObject({
        totalBalance: '100',
      });
    });

    it('buckets each aggregated venue account state into its own preload cache bucket', async () => {
      setupAggregatedMode();
      mockProvider.getPositions.mockResolvedValue([]);
      mockProvider.getOpenOrders.mockResolvedValue([]);
      mockProvider.getAccountState.mockResolvedValue(accountState('1000.10'));
      (lighterProvider as any).getPositions.mockResolvedValue([]);
      (lighterProvider as any).getOpenOrders.mockResolvedValue([]);
      (lighterProvider as any).getAccountState.mockResolvedValue(
        accountState('250.20'),
      );

      controller.startMarketDataPreload();
      // Flush the fire-and-forget preload.
      await vi.waitFor(() => {
        expect(
          controller.state.cachedUserDataByProvider['hyperliquid:mainnet'],
        ).toBeDefined();
      });

      const hlBucket =
        controller.state.cachedUserDataByProvider['hyperliquid:mainnet'];
      const lighterBucket =
        controller.state.cachedUserDataByProvider['lighter:mainnet'];
      // Each venue's own account state lands in its own bucket.
      expect(hlBucket?.accountState?.totalBalance).toBe('1000.10');
      expect(lighterBucket?.accountState?.totalBalance).toBe('250.20');
      // The combined total is not stored in any venue bucket.
      expect(hlBucket?.accountState?.totalBalance).not.toBe('1250.3');
      controller.stopMarketDataPreload();
    });
  });

  describe('subscribeToAvailableToTrade', () => {
    const venueValue = {
      providerId: 'hyperliquid' as const,
      symbol: 'BTC',
      long: '421.412267',
      short: '426.425907',
    };

    beforeEach(() => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
    });

    it('streams the active provider venue values unchanged', () => {
      const mockUnsubscribe = vi.fn();
      const subscribe = vi.fn((params) => {
        params.callback(venueValue);
        return mockUnsubscribe;
      });
      mockProvider.subscribeToAvailableToTrade = subscribe;
      const callback = vi.fn();
      const params = { symbol: 'BTC', callback };

      const unsubscribe = controller.subscribeToAvailableToTrade(params);

      expect(subscribe).toHaveBeenCalledWith(params);
      expect(callback).toHaveBeenCalledWith(venueValue);
      expect(unsubscribe).toBe(mockUnsubscribe);
    });

    it('leaves the value unknown when the provider cannot read it from its venue', () => {
      delete (mockProvider as { subscribeToAvailableToTrade?: unknown })
        .subscribeToAvailableToTrade;
      const callback = vi.fn();

      const unsubscribe = controller.subscribeToAvailableToTrade({
        symbol: 'BTC',
        callback,
      });
      unsubscribe();

      expect(callback).not.toHaveBeenCalled();
    });

    it('leaves the value unknown when no provider is active', () => {
      const subscribe = vi.fn();
      mockProvider.subscribeToAvailableToTrade = subscribe;
      controller.testSetInitialized(false);
      const callback = vi.fn();

      const unsubscribe = controller.subscribeToAvailableToTrade({
        symbol: 'BTC',
        callback,
      });
      unsubscribe();

      expect(subscribe).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('leaves the value unknown for a route the active provider does not serve', () => {
      const subscribe = vi.fn();
      mockProvider.subscribeToAvailableToTrade = subscribe;
      const callback = vi.fn();

      const unsubscribe = controller.subscribeToAvailableToTrade({
        symbol: 'BTC',
        providerId: 'lighter',
        callback,
      });
      unsubscribe();

      expect(subscribe).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('logs and leaves the value unknown when the provider throws', () => {
      mockProvider.subscribeToAvailableToTrade = vi.fn(() => {
        throw new Error('socket closed');
      });
      const callback = vi.fn();

      const unsubscribe = controller.subscribeToAvailableToTrade({
        symbol: 'BTC',
        callback,
      });
      unsubscribe();

      expect(callback).not.toHaveBeenCalled();
      expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'socket closed' }),
        expect.anything(),
      );
    });

    it('serves package consumers through the registered messenger action', async () => {
      const { messenger } = createKeyringlessMessenger();
      const consumerController = new TestablePerpsController({
        messenger,
        state: getDefaultPerpsControllerState(),
        infrastructure: mockInfrastructure,
      });
      consumerController.testMarkInitialized();
      // init() registers the messenger actions; already initialized, it stops there.
      await consumerController.init();
      consumerController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      const providerCleanup = vi.fn();
      mockProvider.subscribeToAvailableToTrade = vi.fn(
        (params: SubscribeAvailableToTradeParams) => {
          params.callback(venueValue);
          return providerCleanup;
        },
      );
      const received: PerpsAvailableToTrade[] = [];
      const params: SubscribeAvailableToTradeParams = {
        symbol: 'BTC',
        callback: (value) => received.push(value),
      };
      const action: PerpsControllerSubscribeToAvailableToTradeAction['type'] =
        'PerpsController:subscribeToAvailableToTrade';

      const cleanup = messenger.call(action, params);
      cleanup();

      expect(received).toStrictEqual([venueValue]);
      expect(providerCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('public trades', () => {
    const publicTrade = (
      id: string,
      symbol = 'BTC',
      providerId: PerpsProviderType = 'hyperliquid',
    ): PublicTrade => ({
      id,
      symbol,
      price: '50000',
      size: '0.1',
      side: 'buy',
      timestamp: 1000,
      providerId,
    });

    beforeEach(() => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
    });

    describe('getPublicTrades', () => {
      it('reads the active provider with the default limit and keeps the requested symbol', async () => {
        mockProvider.getPublicTrades = vi
          .fn()
          .mockResolvedValue([publicTrade('1'), publicTrade('2', 'ETH')]);

        const trades = await controller.getPublicTrades({ symbol: 'BTC' });

        expect(mockProvider.getPublicTrades).toHaveBeenCalledWith({
          symbol: 'BTC',
          limit: 50,
        });
        expect(trades).toStrictEqual([publicTrade('1')]);
      });

      it('passes an explicit limit and route through', async () => {
        mockProvider.getPublicTrades = vi.fn().mockResolvedValue([]);

        await controller.getPublicTrades({
          symbol: 'BTC',
          limit: 5,
          providerId: 'hyperliquid',
        });

        expect(mockProvider.getPublicTrades).toHaveBeenCalledWith({
          symbol: 'BTC',
          limit: 5,
          providerId: 'hyperliquid',
        });
      });

      it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects limit %s before reaching the provider',
        async (limit) => {
          mockProvider.getPublicTrades = vi.fn().mockResolvedValue([]);

          await expect(
            controller.getPublicTrades({ symbol: 'BTC', limit }),
          ).rejects.toThrow(`Invalid public trades limit: ${String(limit)}`);
          expect(mockProvider.getPublicTrades).not.toHaveBeenCalled();
        },
      );

      it('resolves to no trades when the active provider changes before the venue answers', async () => {
        let answer: (trades: PublicTrade[]) => void = () => undefined;
        mockProvider.getPublicTrades = vi.fn(
          () =>
            new Promise<PublicTrade[]>((resolve) => {
              answer = resolve;
            }),
        );
        const otherProvider = createMockHyperLiquidProvider();

        const pending = controller.getPublicTrades({ symbol: 'BTC' });
        controller.testSetProviders(new Map([['lighter', otherProvider]]));
        answer([publicTrade('1')]);

        expect(await pending).toStrictEqual([]);
      });

      it('rejects a route the active provider does not serve', async () => {
        mockProvider.getPublicTrades = vi.fn();

        await expect(
          controller.getPublicTrades({ symbol: 'BTC', providerId: 'lighter' }),
        ).rejects.toThrow('PROVIDER_NOT_FOUND');
        expect(mockProvider.getPublicTrades).not.toHaveBeenCalled();
      });

      it('rejects when the provider has no public trade feed', async () => {
        delete (mockProvider as { getPublicTrades?: unknown }).getPublicTrades;

        await expect(
          controller.getPublicTrades({ symbol: 'BTC' }),
        ).rejects.toThrow('Public trades not supported by provider');
      });

      it('rejects before initialization', async () => {
        controller.testSetInitialized(false);

        await expect(
          controller.getPublicTrades({ symbol: 'BTC' }),
        ).rejects.toThrow('CLIENT_NOT_INITIALIZED');
      });

      it('logs and rethrows a venue failure', async () => {
        mockProvider.getPublicTrades = vi
          .fn()
          .mockRejectedValue(new Error('venue down'));

        await expect(
          controller.getPublicTrades({ symbol: 'BTC' }),
        ).rejects.toThrow('venue down');
        expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'venue down' }),
          expect.anything(),
        );
      });
    });

    describe('subscribeToPublicTrades', () => {
      /**
       * Make the provider stream controllable from the test.
       *
       * @returns The pushes into the provider callback and onError, and the
       * provider cleanup.
       */
      const controllableStream = () => {
        const stream = {
          push: (_trades: PublicTrade[]) => undefined as void,
          fail: (_error: Error) => undefined as void,
          cleanup: vi.fn(),
        };
        mockProvider.subscribeToPublicTrades = vi.fn(
          (params: SubscribePublicTradesParams) => {
            stream.push = params.callback;
            stream.fail = (error) => params.onError?.(error);
            return stream.cleanup;
          },
        );
        return stream;
      };

      it('streams the requested symbol and drops trades for another one', () => {
        const stream = controllableStream();
        const callback = vi.fn();

        controller.subscribeToPublicTrades({ symbol: 'BTC', callback });
        stream.push([publicTrade('1'), publicTrade('2', 'ETH')]);
        stream.push([publicTrade('3', 'ETH')]);

        expect(callback.mock.calls).toStrictEqual([[[publicTrade('1')]]]);
      });

      it('delivers nothing after cleanup and closes the provider stream', () => {
        const stream = controllableStream();
        const callback = vi.fn();
        const onError = vi.fn();

        const unsubscribe = controller.subscribeToPublicTrades({
          symbol: 'BTC',
          callback,
          onError,
        });
        unsubscribe();
        stream.push([publicTrade('1')]);
        stream.fail(new Error('late'));

        expect(callback).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        expect(stream.cleanup).toHaveBeenCalledTimes(1);
      });

      it('delivers nothing from the previous provider after a provider switch', () => {
        const stream = controllableStream();
        const callback = vi.fn();
        const onError = vi.fn();

        controller.subscribeToPublicTrades({
          symbol: 'BTC',
          callback,
          onError,
        });
        controller.testSetProviders(
          new Map([['lighter', createMockHyperLiquidProvider()]]),
        );
        stream.push([publicTrade('1')]);
        stream.fail(new Error('closed'));

        expect(callback).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
      });

      it('forwards stream errors while the stream is current', () => {
        const stream = controllableStream();
        const onError = vi.fn();

        controller.subscribeToPublicTrades({
          symbol: 'BTC',
          callback: vi.fn(),
          onError,
        });
        stream.fail(new Error('refused'));

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'refused' }),
        );
      });

      it('passes no onError to the provider when the caller gave none', () => {
        controllableStream();

        controller.subscribeToPublicTrades({
          symbol: 'BTC',
          callback: vi.fn(),
        });

        expect(mockProvider.subscribeToPublicTrades).toHaveBeenCalledWith({
          symbol: 'BTC',
          callback: expect.any(Function),
        });
      });

      it.each([
        [
          'no provider is active',
          () => controller.testSetInitialized(false),
          {},
        ],
        [
          'the route is not the active provider',
          () => undefined,
          { providerId: 'lighter' as const },
        ],
        [
          'the provider has no public trade feed',
          () => {
            delete (mockProvider as { subscribeToPublicTrades?: unknown })
              .subscribeToPublicTrades;
          },
          {},
        ],
      ])('returns a no-op stream when %s', (_case, arrange, route) => {
        const stream = controllableStream();
        arrange();
        const callback = vi.fn();

        const unsubscribe = controller.subscribeToPublicTrades({
          symbol: 'BTC',
          callback,
          ...route,
        });
        unsubscribe();

        expect(callback).not.toHaveBeenCalled();
        expect(stream.cleanup).not.toHaveBeenCalled();
      });

      it('logs and returns a no-op stream when the provider throws', () => {
        mockProvider.subscribeToPublicTrades = vi.fn(() => {
          throw new Error('socket closed');
        });

        const unsubscribe = controller.subscribeToPublicTrades({
          symbol: 'BTC',
          callback: vi.fn(),
        });
        unsubscribe();

        expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'socket closed' }),
          expect.anything(),
        );
      });
    });

    it('serves package consumers through the registered messenger actions', async () => {
      const { messenger } = createKeyringlessMessenger();
      const consumerController = new TestablePerpsController({
        messenger,
        state: getDefaultPerpsControllerState(),
        infrastructure: mockInfrastructure,
      });
      consumerController.testMarkInitialized();
      // init() registers the messenger actions; already initialized, it stops there.
      await consumerController.init();
      consumerController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      const providerCleanup = vi.fn();
      mockProvider.getPublicTrades = vi
        .fn()
        .mockResolvedValue([publicTrade('1')]);
      mockProvider.subscribeToPublicTrades = vi.fn(
        (params: SubscribePublicTradesParams) => {
          params.callback([publicTrade('2')]);
          return providerCleanup;
        },
      );
      const readAction: PerpsControllerGetPublicTradesAction['type'] =
        'PerpsController:getPublicTrades';
      const streamAction: PerpsControllerSubscribeToPublicTradesAction['type'] =
        'PerpsController:subscribeToPublicTrades';
      const received: PublicTrade[][] = [];

      const read = await messenger.call(readAction, { symbol: 'BTC' });
      const cleanup = messenger.call(streamAction, {
        symbol: 'BTC',
        callback: (trades) => received.push(trades),
      });
      cleanup();

      expect(read).toStrictEqual([publicTrade('1')]);
      expect(received).toStrictEqual([[publicTrade('2')]]);
      expect(providerCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('withdraw', () => {
    it('withdraws successfully', async () => {
      const withdrawParams = {
        amount: '100',
        destination:
          '0x1234567890123456789012345678901234567890' as `0x${string}`,
        assetId:
          'eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831' as `${string}:${string}/${string}:${string}/${string}`,
      };

      const mockWithdrawResult = {
        success: true,
        txHash: '0xabcdef1234567890',
        withdrawalId: 'withdrawal-123',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(mockAccountServiceInstance, 'withdraw').mockResolvedValue(
        mockWithdrawResult,
      );

      const result = await controller.withdraw(withdrawParams);

      expect(result).toEqual(mockWithdrawResult);
      expect(mockAccountServiceInstance.withdraw).toHaveBeenCalledWith({
        provider: mockProvider,
        params: withdrawParams,
        context: expect.objectContaining({
          tracingContext: expect.any(Object),
          errorContext: expect.objectContaining({ method: 'withdraw' }),
          stateManager: expect.any(Object),
        }),
        refreshAccountState: expect.any(Function),
      });
    });
  });

  describe('calculateLiquidationPrice', () => {
    it('calculates liquidation price successfully', async () => {
      const liquidationParams = {
        entryPrice: 50000,
        leverage: 10,
        direction: 'long' as const,
        positionSize: 1,
        marginType: 'isolated' as const,
        asset: 'BTC',
      };

      const mockLiquidationPrice = '45000';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'calculateLiquidationPrice',
      ).mockResolvedValue(mockLiquidationPrice);

      const result =
        await controller.calculateLiquidationPrice(liquidationParams);

      expect(result).toBe(mockLiquidationPrice);
      expect(
        mockMarketDataServiceInstance.calculateLiquidationPrice,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: liquidationParams,
        context: expect.any(Object),
      });
    });
  });

  describe('previewPositionModify', () => {
    it('delegates to MarketDataService', async () => {
      const params = {
        position: createMockPosition({
          leverage: { type: 'isolated' as const, value: 5 },
        }),
        direction: 'long' as const,
        size: '0.1',
        price: '50000',
        leverage: 10,
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'previewPositionModify',
      ).mockResolvedValue({ status: 'none' });

      const result = await controller.previewPositionModify(params);

      expect(result).toEqual({ status: 'none' });
      expect(
        mockMarketDataServiceInstance.previewPositionModify,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params,
        context: expect.any(Object),
      });
    });
  });

  describe('getMaxLeverage', () => {
    it('gets max leverage successfully', async () => {
      const asset = 'BTC';
      const mockMaxLeverage = 50;

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getMaxLeverage',
      ).mockResolvedValue(mockMaxLeverage);

      const result = await controller.getMaxLeverage(asset);

      expect(result).toBe(mockMaxLeverage);
      expect(mockMarketDataServiceInstance.getMaxLeverage).toHaveBeenCalledWith(
        {
          provider: mockProvider,
          asset,
          context: expect.any(Object),
        },
      );
    });

    it('forwards an explicit provider route for max leverage', async () => {
      const asset = 'BTC';
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getMaxLeverage',
      ).mockResolvedValue(17);

      const result = await controller.getMaxLeverage(asset, 'lighter');

      expect(result).toBe(17);
      expect(mockMarketDataServiceInstance.getMaxLeverage).toHaveBeenCalledWith(
        {
          provider: mockProvider,
          asset,
          providerId: 'lighter',
          context: expect.any(Object),
        },
      );
    });
  });

  describe('getWithdrawalRoutes', () => {
    it('gets withdrawal routes successfully', () => {
      const mockRoutes = [
        {
          assetId:
            'eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831' as `${string}:${string}/${string}:${string}/${string}`,
          chainId: 'eip155:42161' as `${string}:${string}`,
          contractAddress:
            '0x1234567890123456789012345678901234567890' as `0x${string}`,
          constraints: {
            minAmount: '10',
            maxAmount: '1000000',
          },
        },
      ];

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getWithdrawalRoutes',
      ).mockReturnValue(mockRoutes);

      const result = controller.getWithdrawalRoutes();

      expect(result).toEqual(mockRoutes);
      expect(
        mockMarketDataServiceInstance.getWithdrawalRoutes,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
      });
    });
  });

  describe('getBlockExplorerUrl', () => {
    it('gets block explorer URL successfully', () => {
      const address = '0x1234567890123456789012345678901234567890';
      const mockUrl =
        'https://app.hyperliquid.xyz/explorer/address/0x1234567890123456789012345678901234567890';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getBlockExplorerUrl',
      ).mockReturnValue(mockUrl);

      const result = controller.getBlockExplorerUrl(address);

      expect(result).toBe(mockUrl);
      expect(
        mockMarketDataServiceInstance.getBlockExplorerUrl,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        address,
      });
    });
  });

  describe('error handling', () => {
    it('handles provider errors gracefully', async () => {
      const errorMessage = 'Provider connection failed';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(mockMarketDataServiceInstance, 'getPositions').mockRejectedValue(
        new Error(errorMessage),
      );

      await expect(controller.getPositions()).rejects.toThrow(errorMessage);
      expect(mockMarketDataServiceInstance.getPositions).toHaveBeenCalled();
    });

    it('handles network errors', async () => {
      const errorMessage = 'Network timeout';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getAccountState',
      ).mockRejectedValue(new Error(errorMessage));

      await expect(controller.getAccountState()).rejects.toThrow(errorMessage);
      expect(mockMarketDataServiceInstance.getAccountState).toHaveBeenCalled();
    });
  });
});
