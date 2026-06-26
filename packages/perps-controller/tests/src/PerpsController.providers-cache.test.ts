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
          typeof value === 'object' &&
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
  describe('resetSelectedPaymentToken', () => {
    it('sets selectedPaymentToken to null', () => {
      controller.testUpdate((state) => {
        state.selectedPaymentToken = {
          description: 'USDC',
          address: '0xa0b8',
          chainId: '0x1',
        } as PerpsControllerState['selectedPaymentToken'];
      });

      controller.resetSelectedPaymentToken();

      expect(controller.state.selectedPaymentToken).toBeNull();
    });
  });

  describe('switchProvider', () => {
    it('returns success as no-op before init() when already on requested provider', async () => {
      // Before init(), providers map is empty.
      // switchProvider should still succeed as a no-op because activeProvider already matches.
      const result = await controller.switchProvider('hyperliquid');

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('hyperliquid');
    });

    it('returns success without re-init when switching to same provider', async () => {
      await controller.init();

      const result = await controller.switchProvider('hyperliquid');

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('hyperliquid');
    });

    it('returns error when already reinitializing', async () => {
      await controller.init();

      // Register myx in providers map so it passes the isValidProvider check
      const mockMYXProvider = {
        ...createMockHyperLiquidProvider(),
        protocolId: 'myx',
      };
      const providers = controller.testGetProviders();
      providers.set('myx', mockMYXProvider as any);
      controller.testSetProviders(providers);

      jest.spyOn(controller, 'isCurrentlyReinitializing').mockReturnValue(true);

      const result = await controller.switchProvider('myx');

      expect(result.success).toBe(false);
      expect(result.error).toBe(PERPS_ERROR_CODES.CLIENT_REINITIALIZING);
    });

    it('returns error for invalid provider not in providers map', async () => {
      await controller.init();

      const result = await controller.switchProvider('myx');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provider myx not available');
    });

    it('allows aggregated even without explicit map entry', async () => {
      await controller.init();

      // 'aggregated' is always valid according to the validation logic
      const result = await controller.switchProvider('aggregated');

      // The key assertion is that it didn't return "not available" error
      // aggregated proceeds to the init path and succeeds
      expect(result.success).toBe(true);
    });

    it('switches to myx provider successfully', async () => {
      // Create controller with MYX-enabled mocks
      const myxInfrastructure = createMockInfrastructure();
      (
        myxInfrastructure.featureFlags.validateVersionGated as jest.Mock
      ).mockReturnValue(true);
      // Enable MYX feature flag via messenger
      const myxMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
              perpsMyxProviderEnabled: {
                enabled: true,
                minimumVersion: '0.0.0',
              },
            },
          };
        }
        return undefined;
      });

      const myxController = new TestablePerpsController({
        messenger: createMockMessenger({ call: myxMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: myxInfrastructure,
      });

      await myxController.init();

      // Register a mock MYX provider
      const mockMYXProvider = {
        ...createMockHyperLiquidProvider(),
        protocolId: 'myx',
      };
      const providers = myxController.testGetProviders();
      providers.set('myx', mockMYXProvider as any);
      myxController.testSetProviders(providers);

      // Mock init on the reinit call inside switchProvider.
      // Dynamic import() rejects in Jest (no --experimental-vm-modules),
      // so MYX can't register via #createProviders. Mock init to
      // simulate successful reinitialization while preserving our
      // manually-injected MYX provider in the map.
      jest.spyOn(myxController, 'init').mockImplementationOnce(async () => {
        myxController.testUpdate((state) => {
          state.initializationState = InitializationState.Initialized;
        });
      });

      const result = await myxController.switchProvider('myx');

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('myx');
      expect(myxController.state.activeProvider).toBe('myx');
    });

    it('rolls back to previous provider on init failure', async () => {
      await controller.init();

      // Register a mock MYX provider
      const mockMYXProvider = {
        ...createMockHyperLiquidProvider(),
        protocolId: 'myx',
      };
      const providers = controller.testGetProviders();
      providers.set('myx', mockMYXProvider as any);
      controller.testSetProviders(providers);

      // Make init set state to Failed so switchProvider detects failure
      jest.spyOn(controller, 'init').mockImplementationOnce(async () => {
        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Failed;
          state.initializationError = 'MYX init failed';
        });
      });

      const result = await controller.switchProvider('myx');

      expect(result.success).toBe(false);
      // Should roll back to previous provider
      expect(controller.state.activeProvider).toBe('hyperliquid');

      // Restore init for further tests
      jest.restoreAllMocks();
    });

    it('clears isReinitializing flag after success', async () => {
      await controller.init();

      const mockMYXProvider = {
        ...createMockHyperLiquidProvider(),
        protocolId: 'myx',
      };
      const providers = controller.testGetProviders();
      providers.set('myx', mockMYXProvider as any);
      controller.testSetProviders(providers);

      await controller.switchProvider('myx');

      expect(controller.isCurrentlyReinitializing()).toBe(false);
    });

    it('clears isReinitializing flag after failure', async () => {
      await controller.init();

      const mockMYXProvider = {
        ...createMockHyperLiquidProvider(),
        protocolId: 'myx',
      };
      const providers = controller.testGetProviders();
      providers.set('myx', mockMYXProvider as any);
      controller.testSetProviders(providers);

      jest.spyOn(controller, 'init').mockImplementationOnce(async () => {
        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Failed;
          state.initializationError = 'fail';
        });
      });

      await controller.switchProvider('myx');

      expect(controller.isCurrentlyReinitializing()).toBe(false);

      jest.restoreAllMocks();
    });
  });

  describe('init - MYX fallback', () => {
    it('falls back to hyperliquid when activeProvider is myx but MYX feature flag is disabled', async () => {
      // Set state to myx before init
      controller.testUpdate((state) => {
        state.activeProvider = 'myx';
      });

      // isMYXProviderEnabled() returns false by default (no perpsMyxProviderEnabled in remote flags)
      await controller.init();

      // The init path should detect MYX is not available and fall back
      expect(controller.state.activeProvider).toBe('hyperliquid');
    });

    it('registerMYXProvider creates and registers the MYX provider', () => {
      // Arrange
      const mockMYXInstance = createMockHyperLiquidProvider();
      const MockMYXConstructor = jest.fn(() => mockMYXInstance);

      // Act
      controller.testRegisterMYXProvider(
        MockMYXConstructor as unknown as new (
          opts: Record<string, unknown>,
        ) => PerpsProvider,
      );

      // Assert
      const providers = controller.testGetProviders();
      expect(providers.get('myx')).toBe(mockMYXInstance);
      expect(MockMYXConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ isTestnet: false }),
      );
    });

    it('handleMYXImportError logs debug for MODULE_NOT_FOUND errors', () => {
      // Arrange — Node sets code: 'MODULE_NOT_FOUND' on missing modules
      const moduleError = Object.assign(
        new Error('Cannot find module ./providers/MYXProvider'),
        { code: 'MODULE_NOT_FOUND' },
      );

      // Act
      controller.testHandleMYXImportError(moduleError);

      // Assert
      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        'PerpsController: MYX provider module not available, skipping registration',
      );
    });

    it('handleMYXImportError routes runtime errors to logError', () => {
      // Act — error without MODULE_NOT_FOUND code goes to Sentry
      controller.testHandleMYXImportError(new Error('Invalid auth config'));

      // Assert
      expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid auth config' }),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({
              method: 'createProviders.myx',
            }),
          }),
        }),
      );
    });
  });

  describe('getOpenOrders with standalone mode', () => {
    const mockUserAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
    const MockedHyperLiquidProvider = HyperLiquidProvider as jest.MockedClass<
      typeof HyperLiquidProvider
    >;

    beforeEach(() => {
      MockedHyperLiquidProvider.mockClear();
    });

    it('uses existing provider for standalone queries when available', async () => {
      const mockOrders = [
        {
          orderId: 'o1',
          symbol: 'BTC',
          side: 'buy' as const,
          orderType: 'limit' as const,
          size: '0.1',
          originalSize: '0.1',
          filledSize: '0',
          remainingSize: '0.1',
          price: '50000',
          status: 'open' as const,
          timestamp: Date.now(),
        },
      ];
      const existingMockProvider = createMockHyperLiquidProvider();
      existingMockProvider.getOpenOrders.mockResolvedValue(mockOrders);
      controller.testSetProviders(
        new Map([['hyperliquid', existingMockProvider]]),
      );
      controller.testMarkInitialized();
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
      });

      const result = await controller.getOpenOrders({
        standalone: true,
        userAddress: mockUserAddress,
      });

      expect(existingMockProvider.getOpenOrders).toHaveBeenCalledWith({
        standalone: true,
        userAddress: mockUserAddress,
      });
      expect(result).toEqual(mockOrders);
      expect(MockedHyperLiquidProvider).not.toHaveBeenCalled();
    });

    it('creates temporary provider for standalone queries when no activeProviderInstance', async () => {
      const mockOrders = [
        {
          orderId: 'o2',
          symbol: 'ETH',
          side: 'sell' as const,
          orderType: 'market' as const,
          size: '1',
          originalSize: '1',
          filledSize: '0',
          remainingSize: '1',
          price: '3000',
          status: 'open' as const,
          timestamp: Date.now(),
        },
      ];
      const tempMockProvider = createMockHyperLiquidProvider();
      tempMockProvider.getOpenOrders.mockResolvedValue(mockOrders);
      MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.isTestnet = true;
      });

      const result = await controller.getOpenOrders({
        standalone: true,
        userAddress: mockUserAddress,
      });

      expect(MockedHyperLiquidProvider).toHaveBeenCalledWith(
        expect.objectContaining({ isTestnet: true }),
      );
      expect(result).toEqual(mockOrders);
    });

    it('bypasses getActiveProvider check for standalone queries', async () => {
      const tempMockProvider = createMockHyperLiquidProvider();
      tempMockProvider.getOpenOrders.mockResolvedValue([]);
      MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

      controller.testUpdate((state) => {
        state.initializationState = InitializationState.Initializing;
        state.activeProvider = 'aggregated';
      });

      const result = await controller.getOpenOrders({
        standalone: true,
        userAddress: mockUserAddress,
      });

      expect(result).toEqual([]);
    });
  });

  describe('getMarketDataWithPrices with standalone mode', () => {
    const MockedHyperLiquidProvider = HyperLiquidProvider as jest.MockedClass<
      typeof HyperLiquidProvider
    >;

    beforeEach(() => {
      MockedHyperLiquidProvider.mockClear();
    });

    it('uses existing provider for standalone queries when available', async () => {
      const mockMarketData = [
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ];
      const existingMockProvider = createMockHyperLiquidProvider();
      existingMockProvider.getMarketDataWithPrices.mockResolvedValue(
        mockMarketData,
      );
      controller.testSetProviders(
        new Map([['hyperliquid', existingMockProvider]]),
      );
      controller.testMarkInitialized();
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
      });

      const result = await controller.getMarketDataWithPrices({
        standalone: true,
      });

      expect(existingMockProvider.getMarketDataWithPrices).toHaveBeenCalled();
      expect(result).toEqual(mockMarketData);
      expect(MockedHyperLiquidProvider).not.toHaveBeenCalled();
    });

    it('creates temporary provider for standalone queries when no activeProviderInstance', async () => {
      const mockMarketData = [
        {
          symbol: 'ETH',
          name: 'ETH',
          price: '3000',
          maxLeverage: '50x',
          change24h: '+50',
          change24hPercent: '+1.7%',
          volume: '$500M',
        },
      ];
      const tempMockProvider = createMockHyperLiquidProvider();
      tempMockProvider.getMarketDataWithPrices.mockResolvedValue(
        mockMarketData,
      );
      MockedHyperLiquidProvider.mockImplementation(() => tempMockProvider);

      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.isTestnet = false;
      });

      const result = await controller.getMarketDataWithPrices({
        standalone: true,
      });

      expect(MockedHyperLiquidProvider).toHaveBeenCalledWith(
        expect.objectContaining({ isTestnet: false }),
      );
      expect(result).toEqual(mockMarketData);
    });

    it('uses getActiveProvider for non-standalone queries', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue([]);

      const result = await controller.getMarketDataWithPrices();

      expect(mockProvider.getMarketDataWithPrices).toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('startMarketDataPreload and stopMarketDataPreload', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      controller.stopMarketDataPreload();
      jest.useRealTimers();
    });

    it('is idempotent - calling start twice does not create duplicate timers', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue([]);

      controller.startMarketDataPreload();
      controller.startMarketDataPreload();

      // Advance timers past the preload interval (5 min) to verify no double calls
      jest.advanceTimersByTime(5 * 60 * 1000 + 100);

      // performMarketDataPreload calls getMarketDataWithPrices({ standalone: true })
      // The first immediate call happens, then only 1 interval call (not 2)
      // With isPreloading guard, second immediate call is skipped
      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        'PerpsController: Preload already started, skipping',
      );
    });

    it('calls performMarketDataPreload immediately on start', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ]);

      controller.startMarketDataPreload();

      // Wait for the async performMarketDataPreload to complete
      await jest.advanceTimersByTimeAsync(100);

      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        'PerpsController: Fetching market data in background',
      );
    });

    it('stopMarketDataPreload clears interval', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue([]);

      controller.startMarketDataPreload();
      controller.stopMarketDataPreload();

      // After stop, advancing timers should not trigger more calls
      const callCountBefore =
        mockProvider.getMarketDataWithPrices.mock.calls.length;
      jest.advanceTimersByTime(10 * 60 * 1000);
      const callCountAfter =
        mockProvider.getMarketDataWithPrices.mock.calls.length;

      // No new calls should have been made after stop
      expect(callCountAfter).toBe(callCountBefore);
    });

    it('stopMarketDataPreload is safe to call when not started', () => {
      expect(() => controller.stopMarketDataPreload()).not.toThrow();
    });

    it('hydrates market data from disk at construction time', () => {
      const diskMarkets = {
        providerNetworkKey: 'hyperliquid:mainnet',
        data: [
          {
            symbol: 'BTC',
            name: 'Bitcoin',
            price: '50000',
            change24h: '+100',
            change24hPercent: '+0.2%',
            maxLeverage: '50x',
            volume: '$1B',
          },
        ],
        timestamp: Date.now(),
      };
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === PERPS_DISK_CACHE_MARKETS) {
            return JSON.stringify(diskMarkets);
          }
          return null;
        },
      );

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: getDefaultPerpsControllerState(),
        infrastructure: infra,
      });

      const cached =
        ctrl.state.cachedMarketDataByProvider['hyperliquid:mainnet'];
      expect(cached).not.toBeNull();
      expect(cached?.data).toHaveLength(1);
      expect(cached?.data[0].symbol).toBe('BTC');
      // Prices are stripped to placeholder values
      expect(cached?.data[0].price).toBe(PERPS_CONSTANTS.FallbackPriceDisplay);
      expect(cached?.data[0].change24h).toBe(
        PERPS_CONSTANTS.FallbackDataDisplay,
      );
      expect(cached?.data[0].change24hPercent).toBe(
        PERPS_CONSTANTS.FallbackPercentageDisplay,
      );
      expect(ctrl.getCachedMarketDataForActiveProvider()).toBeNull();
      expect(
        ctrl.getCachedMarketDataForActiveProvider({ skipTTL: true }),
      ).toHaveLength(1);
    });

    it('hydrates multi-provider market data from disk before providers register', () => {
      const timestamp = Date.now();
      const diskMarkets = {
        entries: [
          {
            providerNetworkKey: 'hyperliquid:mainnet',
            data: [
              {
                symbol: 'BTC',
                name: 'Bitcoin',
                price: '50000',
                change24h: '+100',
                change24hPercent: '+0.2%',
                maxLeverage: '50x',
                volume: '$1B',
              },
            ],
            timestamp,
          },
          {
            providerNetworkKey: 'myx:mainnet',
            data: [
              {
                symbol: 'ETH',
                name: 'Ethereum',
                price: '3000',
                change24h: '+50',
                change24hPercent: '+1.2%',
                maxLeverage: '25x',
                volume: '$500M',
              },
            ],
            timestamp,
          },
        ],
      };
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === PERPS_DISK_CACHE_MARKETS) {
            return JSON.stringify(diskMarkets);
          }
          return null;
        },
      );

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: {
          ...getDefaultPerpsControllerState(),
          activeProvider: 'aggregated',
        },
        clientConfig: {
          providerCredentials: {
            myx: {
              enabled: true,
            },
          },
        } as never,
        infrastructure: infra,
      });

      const aggregated = ctrl.getCachedMarketDataForActiveProvider({
        skipTTL: true,
      });
      expect(aggregated).toHaveLength(2);
      expect(aggregated?.map((market) => market.symbol)).toEqual([
        'BTC',
        'ETH',
      ]);
    });

    it('hydrates aggregated user data from disk before providers register', () => {
      const timestamp = Date.now();
      const diskUserData = {
        entries: [
          {
            providerNetworkKey: 'hyperliquid:mainnet',
            address: '0x1234567890abcdef1234567890abcdef12345678',
            positions: [createMockPosition({ symbol: 'BTC', size: '1.0' })],
            orders: [],
            accountState: {
              totalBalance: '5000',
              spendableBalance: '4000',
              withdrawableBalance: '4000',
              marginUsed: '1000',
              unrealizedPnl: '0',
              returnOnEquity: '0',
              providerId: 'hyperliquid',
            },
            timestamp,
          },
          {
            providerNetworkKey: 'myx:mainnet',
            address: '0x1234567890abcdef1234567890abcdef12345678',
            positions: [createMockPosition({ symbol: 'MYX', size: '2.0' })],
            orders: [],
            accountState: null,
            timestamp,
          },
        ],
      };
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === PERPS_DISK_CACHE_USER_DATA) {
            return JSON.stringify(diskUserData);
          }
          return null;
        },
      );

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: {
          ...getDefaultPerpsControllerState(),
          activeProvider: 'aggregated',
        },
        clientConfig: {
          providerCredentials: {
            myx: {
              enabled: true,
            },
          },
        } as never,
        infrastructure: infra,
      });

      const aggregated = ctrl.getCachedUserDataForActiveProvider({
        skipTTL: true,
      });
      expect(aggregated?.positions).toHaveLength(2);
      expect(aggregated?.accountState?.providerId).toBe('hyperliquid');
    });

    it('hydrates user data from disk at construction time', () => {
      const diskUserData = {
        providerNetworkKey: 'hyperliquid:mainnet',
        address: '0x1234567890123456789012345678901234567890',
        positions: [{ symbol: 'ETH', size: '2.0', entryPrice: '3000' }],
        orders: [],
        accountState: {
          totalBalance: '5000',
          spendableBalance: '4000',
          withdrawableBalance: '4000',
          marginUsed: '1000',
          unrealizedPnl: '0',
          returnOnEquity: '0',
        },
        timestamp: Date.now(),
      };
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === PERPS_DISK_CACHE_USER_DATA) {
            return JSON.stringify(diskUserData);
          }
          return null;
        },
      );

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: getDefaultPerpsControllerState(),
        infrastructure: infra,
      });

      const cached = ctrl.state.cachedUserDataByProvider['hyperliquid:mainnet'];
      expect(cached).not.toBeNull();
      expect(cached?.positions).toHaveLength(1);
      expect(cached?.positions[0].symbol).toBe('ETH');
      expect(cached?.address).toBe(
        '0x1234567890123456789012345678901234567890',
      );
    });

    it('hydrates user data from disk even when address differs (filtered at read time)', () => {
      const diskUserData = {
        providerNetworkKey: 'hyperliquid:mainnet',
        address: '0xDEADBEEF00000000000000000000000000000000',
        positions: [{ symbol: 'ETH', size: '2.0' }],
        orders: [],
        accountState: null,
        timestamp: Date.now(),
      };
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === PERPS_DISK_CACHE_USER_DATA) {
            return JSON.stringify(diskUserData);
          }
          return null;
        },
      );

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: getDefaultPerpsControllerState(),
        infrastructure: infra,
      });

      // Sync hydration populates cache unconditionally — address
      // validation happens in getCachedUserDataForActiveProvider at read time
      const cached = ctrl.state.cachedUserDataByProvider['hyperliquid:mainnet'];
      expect(cached).not.toBeNull();
      expect(cached?.address).toBe(
        '0xDEADBEEF00000000000000000000000000000000',
      );

      // But getCachedUserDataForActiveProvider filters it out (address mismatch)
      const read = ctrl.getCachedUserDataForActiveProvider({
        skipTTL: true,
      });
      expect(read).toBeNull();
    });

    it('does not overwrite fresher in-memory state from older disk data', () => {
      const freshTimestamp = Date.now();
      const diskMarkets = {
        providerNetworkKey: 'hyperliquid:mainnet',
        data: [{ symbol: 'BTC', name: 'Bitcoin', price: '50000' }],
        timestamp: freshTimestamp - 60_000, // older than initial state
      };
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockImplementation(
        (key: string) => {
          if (key === PERPS_DISK_CACHE_MARKETS) {
            return JSON.stringify(diskMarkets);
          }
          return null;
        },
      );

      // Construct with fresher in-memory data already present
      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: {
          ...getDefaultPerpsControllerState(),
          cachedMarketDataByProvider: {
            'hyperliquid:mainnet': {
              data: [{ symbol: 'ETH', name: 'Ethereum', price: '3000' } as any],
              timestamp: freshTimestamp,
            },
          },
        },
        infrastructure: infra,
      });

      const cached =
        ctrl.state.cachedMarketDataByProvider['hyperliquid:mainnet'];
      expect(cached?.data[0].symbol).toBe('ETH');
      expect(cached?.timestamp).toBe(freshTimestamp);
    });

    it('handles corrupt disk JSON gracefully at construction', () => {
      const infra = createMockInfrastructure();
      (infra.diskCache.getItemSync as jest.Mock).mockReturnValue(
        'not valid json{{{',
      );

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: getDefaultPerpsControllerState(),
        infrastructure: infra,
      });

      expect(
        ctrl.state.cachedMarketDataByProvider['hyperliquid:mainnet'],
      ).toBeUndefined();
    });

    it('falls back gracefully when getItemSync is undefined', () => {
      const infra = createMockInfrastructure();
      (infra.diskCache as any).getItemSync = undefined;

      const ctrl = new TestablePerpsController({
        messenger: createMockMessenger(),
        state: getDefaultPerpsControllerState(),
        infrastructure: infra,
      });

      expect(
        ctrl.state.cachedMarketDataByProvider['hyperliquid:mainnet'],
      ).toBeUndefined();
    });
  });

  describe('performMarketDataPreload', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      controller.stopMarketDataPreload();
      jest.useRealTimers();
    });

    it('updates cachedMarketData in state', async () => {
      const mockData = [
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ];
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue(mockData);

      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      const entry =
        controller.state.cachedMarketDataByProvider['hyperliquid:mainnet'];
      expect(entry?.data).toEqual(mockData);
      expect(entry?.timestamp).toBeGreaterThan(0);
    });

    it('persists preloaded market data to disk', async () => {
      const mockData = [
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ];
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue(mockData);

      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      expect(mockInfrastructure.diskCache.setItem).toHaveBeenCalledWith(
        PERPS_DISK_CACHE_MARKETS,
        expect.any(String),
      );

      const persistedPayload = JSON.parse(
        (mockInfrastructure.diskCache.setItem as jest.Mock).mock.calls.find(
          ([key]) => key === PERPS_DISK_CACHE_MARKETS,
        )?.[1] as string,
      );

      expect(persistedPayload.providerNetworkKey).toBe('hyperliquid:mainnet');
      expect(persistedPayload.data).toEqual(mockData);
      expect(persistedPayload.timestamp).toBeGreaterThan(0);
    });

    it('respects 30s debounce guard', async () => {
      const mockData = [
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ];
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue(mockData);

      // First preload
      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      const callCount = mockProvider.getMarketDataWithPrices.mock.calls.length;

      // Advance by less than 30s and trigger interval
      controller.stopMarketDataPreload();
      // Set timestamp to recent to trigger debounce guard
      controller.testUpdate((state) => {
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: mockData,
          timestamp: Date.now(),
        };
      });
      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      // Should not have called again due to debounce
      // The second immediate call is debounced
      expect(mockProvider.getMarketDataWithPrices.mock.calls.length).toBe(
        callCount,
      );
    });

    it('handles errors without throwing', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockRejectedValue(
        new Error('API failed'),
      );

      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      // Should log error but not throw
      expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({
              method: 'performMarketDataPreload',
            }),
          }),
        }),
      );
    });

    it('traces performance via tracer', async () => {
      const mockData = [
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ];
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getMarketDataWithPrices.mockResolvedValue(mockData);

      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      expect(mockInfrastructure.tracer.trace).toHaveBeenCalled();
      expect(mockInfrastructure.tracer.endTrace).toHaveBeenCalled();
      expect(mockInfrastructure.tracer.setMeasurement).toHaveBeenCalled();
    });
  });

  describe('performUserDataPreload', () => {
    // Import actual enum for type compatibility
    const { WebSocketConnectionState: WSState } =
      jest.requireActual('../../src/types');
    const mockEvmAccount = {
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
    };

    let preloadController: TestablePerpsController;
    let preloadMockProvider: jest.Mocked<HyperLiquidProvider>;
    let preloadInfrastructure: jest.Mocked<PerpsPlatformDependencies>;

    beforeEach(() => {
      jest.useFakeTimers();
      // Create controller with messenger that handles account queries
      const mockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
            },
          };
        }
        if (
          action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ) {
          return [mockEvmAccount];
        }
        return undefined;
      });
      preloadInfrastructure = createMockInfrastructure();
      preloadMockProvider = createMockHyperLiquidProvider();
      preloadMockProvider.getPositions.mockResolvedValue([]);
      preloadMockProvider.getAccountState.mockResolvedValue({
        spendableBalance: '10000',
        withdrawableBalance: '10000',
        totalBalance: '10000',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });
      preloadMockProvider.getMarkets.mockResolvedValue([]);
      preloadMockProvider.getOpenOrders.mockResolvedValue([]);
      (
        HyperLiquidProvider as jest.MockedClass<typeof HyperLiquidProvider>
      ).mockImplementation(() => preloadMockProvider);
      preloadController = new TestablePerpsController({
        messenger: createMockMessenger({ call: mockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: preloadInfrastructure,
      });
    });

    afterEach(() => {
      preloadController.stopMarketDataPreload();
      jest.useRealTimers();
    });

    it('fetches positions, orders, and account state', async () => {
      const mockPositions = [createMockPosition()];
      const mockOrders = [
        {
          orderId: 'o1',
          symbol: 'BTC',
          side: 'buy' as const,
          orderType: 'limit' as const,
          size: '0.1',
          originalSize: '0.1',
          filledSize: '0',
          remainingSize: '0.1',
          price: '50000',
          status: 'open' as const,
          timestamp: Date.now(),
        },
      ];
      const mockAccountState: AccountState = {
        totalBalance: '50000',
        spendableBalance: '45000',
        withdrawableBalance: '45000',
        marginUsed: '5000',
        unrealizedPnl: '1000',
        returnOnEquity: '20',
      };

      preloadController.testMarkInitialized();
      preloadController.testSetProviders(
        new Map([['hyperliquid', preloadMockProvider]]),
      );
      preloadMockProvider.getPositions.mockResolvedValue(mockPositions);
      preloadMockProvider.getOpenOrders.mockResolvedValue(mockOrders);
      preloadMockProvider.getAccountState.mockResolvedValue(mockAccountState);
      preloadMockProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ]);
      preloadMockProvider.getWebSocketConnectionState.mockReturnValue(
        WSState.Disconnected,
      );

      preloadController.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(500);

      const userCache = preloadController.state.cachedUserDataByProvider;
      const cacheKey = Object.keys(userCache)[0];
      expect(cacheKey).toBeDefined();
      const entry = userCache[cacheKey];
      expect(entry.positions).toEqual(mockPositions);
      expect(entry.orders).toEqual(mockOrders);
      expect(entry.accountState).toEqual(mockAccountState);
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('persists preloaded user data to disk', async () => {
      const mockPositions = [createMockPosition()];
      const mockOrders = [
        {
          orderId: 'o1',
          symbol: 'BTC',
          side: 'buy' as const,
          orderType: 'limit' as const,
          size: '0.1',
          originalSize: '0.1',
          filledSize: '0',
          remainingSize: '0.1',
          price: '50000',
          status: 'open' as const,
          timestamp: Date.now(),
        },
      ];
      const mockAccountState: AccountState = {
        totalBalance: '50000',
        spendableBalance: '45000',
        withdrawableBalance: '45000',
        marginUsed: '5000',
        unrealizedPnl: '1000',
        returnOnEquity: '20',
      };

      preloadController.testMarkInitialized();
      preloadController.testSetProviders(
        new Map([['hyperliquid', preloadMockProvider]]),
      );
      preloadMockProvider.getPositions.mockResolvedValue(mockPositions);
      preloadMockProvider.getOpenOrders.mockResolvedValue(mockOrders);
      preloadMockProvider.getAccountState.mockResolvedValue(mockAccountState);
      preloadMockProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+100',
          change24hPercent: '+0.2%',
          volume: '$1B',
        },
      ]);
      preloadMockProvider.getWebSocketConnectionState.mockReturnValue(
        WSState.Disconnected,
      );

      preloadController.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(500);

      expect(preloadInfrastructure.diskCache.setItem).toHaveBeenCalledWith(
        PERPS_DISK_CACHE_USER_DATA,
        expect.any(String),
      );

      const persistedPayload = JSON.parse(
        (preloadInfrastructure.diskCache.setItem as jest.Mock).mock.calls.find(
          ([key]) => key === PERPS_DISK_CACHE_USER_DATA,
        )?.[1] as string,
      );

      expect(persistedPayload.providerNetworkKey).toBe('hyperliquid:mainnet');
      expect(persistedPayload.address).toBe(mockEvmAccount.address);
      expect(persistedPayload.positions).toEqual(mockPositions);
      expect(persistedPayload.orders).toEqual(mockOrders);
      expect(persistedPayload.accountState).toEqual(mockAccountState);
      expect(persistedPayload.timestamp).toBeGreaterThan(0);
    });

    it('skips when WebSocket is connected', async () => {
      preloadController.testMarkInitialized();
      preloadController.testSetProviders(
        new Map([['hyperliquid', preloadMockProvider]]),
      );
      preloadMockProvider.getMarketDataWithPrices.mockResolvedValue([]);
      preloadMockProvider.getWebSocketConnectionState.mockReturnValue(
        WSState.Connected,
      );

      preloadController.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(500);

      expect(preloadInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        'PerpsController: Skipping user data preload \u2014 WebSocket connected',
      );
      expect(
        Object.keys(preloadController.state.cachedUserDataByProvider),
      ).toHaveLength(0);
    });

    it('handles errors without throwing', async () => {
      preloadController.testMarkInitialized();
      preloadController.testSetProviders(
        new Map([['hyperliquid', preloadMockProvider]]),
      );
      preloadMockProvider.getMarketDataWithPrices.mockResolvedValue([]);
      preloadMockProvider.getPositions.mockRejectedValue(
        new Error('positions error'),
      );
      preloadMockProvider.getWebSocketConnectionState.mockReturnValue(
        WSState.Disconnected,
      );

      preloadController.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(500);

      // Should not crash
      expect(
        Object.keys(preloadController.state.cachedUserDataByProvider),
      ).toHaveLength(0);
    });

    it('skips when cache is fresh for same account', async () => {
      preloadController.testMarkInitialized();
      preloadController.testSetProviders(
        new Map([['hyperliquid', preloadMockProvider]]),
      );
      preloadMockProvider.getMarketDataWithPrices.mockResolvedValue([]);
      preloadMockProvider.getWebSocketConnectionState.mockReturnValue(
        WSState.Disconnected,
      );
      preloadMockProvider.getPositions.mockResolvedValue([]);
      preloadMockProvider.getOpenOrders.mockResolvedValue([]);
      preloadMockProvider.getAccountState.mockResolvedValue({
        spendableBalance: '100',
        withdrawableBalance: '100',
        totalBalance: '100',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });

      // First preload — populates the cache
      preloadController.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(500);

      const freshCache = preloadController.state.cachedUserDataByProvider;
      const freshKey = Object.keys(freshCache)[0];
      expect(freshKey).toBeDefined();
      expect(freshCache[freshKey].address).toBe(mockEvmAccount.address);
      expect(freshCache[freshKey].timestamp).toBeGreaterThan(0);

      // Reset call counts
      preloadMockProvider.getPositions.mockClear();
      preloadMockProvider.getOpenOrders.mockClear();
      preloadMockProvider.getAccountState.mockClear();

      // Trigger another preload cycle — should skip (cache is fresh, same account)
      await jest.advanceTimersByTimeAsync(60_000);

      expect(preloadMockProvider.getPositions).not.toHaveBeenCalled();
    });
  });

  describe('subscribe method hardening', () => {
    it('subscribeToPrices returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
      });

      expect(typeof unsub).toBe('function');
      // Should not throw
      unsub();
      expect(mockProvider.subscribeToPrices).not.toHaveBeenCalled();
    });

    it('subscribeToOrders returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToOrders({ callback: jest.fn() });

      expect(typeof unsub).toBe('function');
      unsub();
      expect(mockProvider.subscribeToOrders).not.toHaveBeenCalled();
    });

    it('subscribeToPositions returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToPositions({
        callback: jest.fn(),
      });

      expect(typeof unsub).toBe('function');
      unsub();
      expect(mockProvider.subscribeToPositions).not.toHaveBeenCalled();
    });

    it('subscribeToOrderFills returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToOrderFills({
        callback: jest.fn(),
      });

      expect(typeof unsub).toBe('function');
      unsub();
      expect(mockProvider.subscribeToOrderFills).not.toHaveBeenCalled();
    });

    it('subscribeToOrderBook returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToOrderBook({
        symbol: 'BTC',
        callback: jest.fn(),
      });

      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('subscribeToCandles returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToCandles({
        symbol: 'BTC',
        interval: '1h' as never,
        callback: jest.fn(),
      });

      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('subscribeToOICaps returns no-op when provider is null', () => {
      controller.testSetInitialized(false);

      const unsub = controller.subscribeToOICaps({
        callback: jest.fn(),
      });

      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('getCachedMarketDataForActiveProvider', () => {
    it('returns null when no cache exists', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
      });

      const result = controller.getCachedMarketDataForActiveProvider();

      expect(result).toBeNull();
    });

    it('returns cached data for single provider', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: [{ symbol: 'BTC', name: 'BTC', price: '50000' } as any],
          timestamp: Date.now(),
        };
      });

      const result = controller.getCachedMarketDataForActiveProvider();

      expect(result).toHaveLength(1);
      expect(result?.[0].symbol).toBe('BTC');
    });

    it('returns null when single provider cache is expired', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: [{ symbol: 'BTC', name: 'BTC', price: '50000' } as any],
          timestamp: Date.now() - 999_999_999, // very old
        };
      });

      const result = controller.getCachedMarketDataForActiveProvider();

      expect(result).toBeNull();
    });

    it('returns expired data when skipTTL is true', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: [{ symbol: 'BTC', name: 'BTC', price: '50000' } as any],
          timestamp: Date.now() - 999_999_999, // very old
        };
      });

      const result = controller.getCachedMarketDataForActiveProvider({
        skipTTL: true,
      });

      expect(result).toHaveLength(1);
      expect(result?.[0].symbol).toBe('BTC');
    });

    it('assembles data from multiple providers in aggregated mode', () => {
      const mockMYXProvider = createMockHyperLiquidProvider();
      markControllerAsInitialized();
      controller.testSetProviders(
        new Map([
          ['hyperliquid', mockProvider],
          ['myx', mockMYXProvider],
        ] as any),
      );
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: [
            {
              symbol: 'BTC',
              name: 'BTC',
              price: '50000',
              providerId: 'hyperliquid',
            } as any,
          ],
          timestamp: Date.now(),
        };
        state.cachedMarketDataByProvider['myx:mainnet'] = {
          data: [
            {
              symbol: 'MYX',
              name: 'MYX',
              price: '1',
              providerId: 'myx',
            } as any,
          ],
          timestamp: Date.now(),
        };
      });

      const result = controller.getCachedMarketDataForActiveProvider();

      expect(result).toHaveLength(2);
      const symbols = (result ?? []).map((m: any) => m.symbol);
      expect(symbols).toEqual(expect.arrayContaining(['BTC', 'MYX']));
    });

    it('returns null in aggregated mode when all provider caches are empty', () => {
      const mockMYXProvider = createMockHyperLiquidProvider();
      markControllerAsInitialized();
      controller.testSetProviders(
        new Map([
          ['hyperliquid', mockProvider],
          ['myx', mockMYXProvider],
        ] as any),
      );
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: [],
          timestamp: Date.now(),
        };
      });

      const result = controller.getCachedMarketDataForActiveProvider();

      expect(result).toBeNull();
    });

    it('returns null in aggregated mode when oldest entry exceeds TTL', () => {
      const mockMYXProvider = createMockHyperLiquidProvider();
      markControllerAsInitialized();
      controller.testSetProviders(
        new Map([
          ['hyperliquid', mockProvider],
          ['myx', mockMYXProvider],
        ] as any),
      );
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.cachedMarketDataByProvider['hyperliquid:mainnet'] = {
          data: [{ symbol: 'BTC', name: 'BTC', price: '50000' } as any],
          timestamp: Date.now() - 999_999_999, // very old
        };
        state.cachedMarketDataByProvider['myx:mainnet'] = {
          data: [{ symbol: 'MYX', name: 'MYX', price: '1' } as any],
          timestamp: Date.now(), // fresh
        };
      });

      const result = controller.getCachedMarketDataForActiveProvider();

      expect(result).toBeNull();
    });
  });

  describe('getCachedUserDataForActiveProvider', () => {
    const mockAddress = '0x1234567890123456789012345678901234567890';

    it('returns null when no cache exists', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
      });

      const result = controller.getCachedUserDataForActiveProvider();

      expect(result).toBeNull();
    });

    it('returns cached user data for single provider', () => {
      const mockPosition = createMockPosition({ symbol: 'BTC', size: '1.0' });
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
        state.cachedUserDataByProvider['hyperliquid:mainnet'] = {
          positions: [mockPosition],
          orders: [],
          accountState: {
            totalBalance: '50000',
            spendableBalance: '45000',
            withdrawableBalance: '45000',
            marginUsed: '5000',
            unrealizedPnl: '1000',
            returnOnEquity: '20',
          },
          timestamp: Date.now(),
          address: mockAddress,
        };
      });

      const result = controller.getCachedUserDataForActiveProvider();

      expect(result).not.toBeNull();
      expect(result?.positions).toHaveLength(1);
      expect(result?.positions[0].symbol).toBe('BTC');
      expect(result?.accountState?.totalBalance).toBe('50000');
    });

    it('assembles user data from multiple providers in aggregated mode', () => {
      const hlPosition = createMockPosition({ symbol: 'BTC', size: '1.0' });
      const myxPosition = createMockPosition({ symbol: 'MYX', size: '5.0' });
      const mockMYXProvider = createMockHyperLiquidProvider();
      markControllerAsInitialized();
      controller.testSetProviders(
        new Map([
          ['hyperliquid', mockProvider],
          ['myx', mockMYXProvider],
        ] as any),
      );
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
        state.cachedUserDataByProvider['hyperliquid:mainnet'] = {
          positions: [hlPosition],
          orders: [],
          accountState: {
            totalBalance: '50000',
            spendableBalance: '45000',
            withdrawableBalance: '45000',
            marginUsed: '5000',
            unrealizedPnl: '1000',
            returnOnEquity: '20',
          },
          timestamp: Date.now(),
          address: mockAddress,
        };
        state.cachedUserDataByProvider['myx:mainnet'] = {
          positions: [myxPosition],
          orders: [],
          accountState: null,
          timestamp: Date.now(),
          address: mockAddress,
        };
      });

      const result = controller.getCachedUserDataForActiveProvider();

      expect(result).not.toBeNull();
      expect(result?.positions).toHaveLength(2);
      expect(result?.accountState?.totalBalance).toBe('50000');
    });

    it('returns null in aggregated mode when no valid entries exist', () => {
      const mockMYXProvider = createMockHyperLiquidProvider();
      markControllerAsInitialized();
      controller.testSetProviders(
        new Map([
          ['hyperliquid', mockProvider],
          ['myx', mockMYXProvider],
        ] as any),
      );
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
      });

      const result = controller.getCachedUserDataForActiveProvider();

      expect(result).toBeNull();
    });

    it('returns stale data when skipTTL is true', () => {
      const mockPosition = createMockPosition({ symbol: 'BTC', size: '1.0' });
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'hyperliquid';
        state.cachedUserDataByProvider['hyperliquid:mainnet'] = {
          positions: [mockPosition],
          orders: [],
          accountState: null,
          timestamp: Date.now() - 999_999_999, // very old
          address: mockAddress,
        };
      });

      const withoutSkip = controller.getCachedUserDataForActiveProvider();
      const withSkip = controller.getCachedUserDataForActiveProvider({
        skipTTL: true,
      });

      expect(withoutSkip).toBeNull();
      expect(withSkip).not.toBeNull();
      expect(withSkip?.positions).toHaveLength(1);
    });
  });

  describe('performMarketDataPreload aggregated mode', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      controller.stopMarketDataPreload();
      jest.useRealTimers();
    });

    it('splits market data by providerId into per-provider cache entries', async () => {
      const base = {
        maxLeverage: '50x',
        change24h: '+1',
        change24hPercent: '+0.1%',
        volume: '$1M',
      };
      const mockData = [
        {
          ...base,
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          providerId: 'hyperliquid' as const,
        },
        {
          ...base,
          symbol: 'ETH',
          name: 'ETH',
          price: '3000',
          providerId: 'hyperliquid' as const,
        },
        {
          ...base,
          symbol: 'MYX',
          name: 'MYX',
          price: '1',
          providerId: 'myx' as const,
        },
      ];
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
      });
      mockProvider.getMarketDataWithPrices.mockResolvedValue(mockData);

      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      // Per-provider entries should be written
      const hlEntry =
        controller.state.cachedMarketDataByProvider['hyperliquid:mainnet'];
      expect(hlEntry?.data).toHaveLength(2);
      expect(hlEntry?.data[0].symbol).toBe('BTC');

      const myxEntry =
        controller.state.cachedMarketDataByProvider['myx:mainnet'];
      expect(myxEntry?.data).toHaveLength(1);
      expect(myxEntry?.data[0].symbol).toBe('MYX');

      // Aggregated sentinel should be empty
      const sentinel =
        controller.state.cachedMarketDataByProvider['aggregated:mainnet'];
      expect(sentinel?.data).toHaveLength(0);
      expect(sentinel?.timestamp).toBeGreaterThan(0);
    });

    it('assigns items without providerId to hyperliquid fallback', async () => {
      const mockData = [
        {
          symbol: 'BTC',
          name: 'BTC',
          price: '50000',
          maxLeverage: '50x',
          change24h: '+1',
          change24hPercent: '+0.1%',
          volume: '$1M',
        }, // no providerId
      ];
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      controller.testUpdate((state) => {
        state.activeProvider = 'aggregated';
      });
      mockProvider.getMarketDataWithPrices.mockResolvedValue(mockData);

      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      const hlEntry =
        controller.state.cachedMarketDataByProvider['hyperliquid:mainnet'];
      expect(hlEntry?.data).toHaveLength(1);
      expect(hlEntry?.data[0].symbol).toBe('BTC');
    });
  });

  describe('firstNonEmpty', () => {
    it('returns the first non-empty string', () => {
      expect(firstNonEmpty('', undefined, 'hello', 'world')).toBe('hello');
    });

    it('returns empty string when all values are empty or undefined', () => {
      expect(firstNonEmpty('', undefined, '')).toBe('');
    });

    it('returns the first value if it is non-empty', () => {
      expect(firstNonEmpty('first', 'second')).toBe('first');
    });

    it('skips empty strings and returns the fallback', () => {
      expect(firstNonEmpty('', 'fallback')).toBe('fallback');
    });
  });

  describe('resolveMyxAuthConfig', () => {
    it('uses testnet credentials on testnet', () => {
      // Arrange
      const myx = {
        appIdTestnet: 'test-app',
        apiSecretTestnet: 'test-secret',
        brokerAddressTestnet: '0xTestBroker',
        appIdMainnet: 'main-app',
        apiSecretMainnet: 'main-secret',
        brokerAddressMainnet: '0xMainBroker',
      };

      // Act
      const result = resolveMyxAuthConfig(myx, true);

      // Assert
      expect(result.appId).toBe('test-app');
      expect(result.apiSecret).toBe('test-secret');
      expect(result.brokerAddress).toBe('0xTestBroker');
    });

    it('uses mainnet credentials on mainnet', () => {
      // Arrange
      const myx = {
        appIdTestnet: 'test-app',
        apiSecretTestnet: 'test-secret',
        brokerAddressTestnet: '0xTestBroker',
        appIdMainnet: 'main-app',
        apiSecretMainnet: 'main-secret',
        brokerAddressMainnet: '0xMainBroker',
      };

      // Act
      const result = resolveMyxAuthConfig(myx, false);

      // Assert
      expect(result.appId).toBe('main-app');
      expect(result.apiSecret).toBe('main-secret');
      expect(result.brokerAddress).toBe('0xMainBroker');
    });

    it('falls back to testnet credentials when mainnet are empty', () => {
      // Arrange
      const myx = {
        appIdTestnet: 'test-app',
        apiSecretTestnet: 'test-secret',
        brokerAddressTestnet: '0xTestBroker',
        appIdMainnet: '',
        apiSecretMainnet: '',
        brokerAddressMainnet: '',
      };

      // Act
      const result = resolveMyxAuthConfig(myx, false);

      // Assert
      expect(result.appId).toBe('test-app');
      expect(result.apiSecret).toBe('test-secret');
      expect(result.brokerAddress).toBe('0xTestBroker');
    });

    it('returns empty strings when no credentials are set', () => {
      // Act
      const result = resolveMyxAuthConfig({}, true);

      // Assert
      expect(result.appId).toBe('');
      expect(result.apiSecret).toBe('');
      expect(result.brokerAddress).toBe('');
    });
  });
});
