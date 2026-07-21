import { jest } from '@jest/globals';
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
  describe('constructor', () => {
    it('initializes with default state', () => {
      // Constructor no longer auto-starts initialization (moved to Engine.ts)
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.state.accountState).toBeNull();
      expect(controller.state.initializationState).toBe('uninitialized'); // Waits for explicit initialization
      expect(controller.state.initializationError).toBeNull();
      expect(controller.state.initializationAttempts).toBe(0); // Not started yet
      // isEligible is initially false, but refreshEligibility is called during construction
      // which updates it to true (defaulting to eligible when geo-location is unknown)
      expect(controller.state.isEligible).toBe(true);
      expect(controller.state.isTestnet).toBe(false); // Default to mainnet
    });

    it('reads current RemoteFeatureFlagController state during construction', () => {
      // Given: A messenger that returns remote feature flags state
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: {
                blockedRegions: ['US', 'CA'],
              },
            },
          };
        }
        return undefined;
      });
      const testMessenger = createMockMessenger({ call: testMockCall });

      // When: Controller is constructed
      const testController = new TestablePerpsController({
        messenger: testMessenger,
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
      });

      // Then: Should have called to get RemoteFeatureFlagController state via messenger
      expect(testController).toBeDefined();
      expect(testMockCall).toHaveBeenCalledWith(
        'RemoteFeatureFlagController:getState',
      );
    });

    it('applies remote blocked regions when available during construction', () => {
      // Given: Messenger that returns remote feature flags with blocked regions
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: {
                blockedRegions: ['US-NY', 'CA-ON'],
              },
            },
          };
        }
        return undefined;
      });

      // When: Controller is constructed
      const testController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
        clientConfig: {
          fallbackBlockedRegions: ['FALLBACK-REGION'],
        },
      });

      // Then: Should have used remote regions (not fallback)
      // Verify by checking the internal blockedRegionList
      const blockedRegionList = testController.testGetBlockedRegionList();
      expect(blockedRegionList.source).toBe('remote');
      expect(blockedRegionList.list).toEqual(['US-NY', 'CA-ON']);
    });

    it('uses fallback regions when remote flags are not available', () => {
      // Given: Remote feature flags without blocked regions
      const mockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {},
          };
        }
        return undefined;
      });

      // When: Controller is constructed with fallback regions
      const testController = new TestablePerpsController({
        messenger: createMockMessenger({ call: mockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
        clientConfig: {
          fallbackBlockedRegions: ['FALLBACK-US', 'FALLBACK-CA'],
        },
      });

      // Then: Should have used fallback regions
      const blockedRegionList = testController.testGetBlockedRegionList();
      expect(blockedRegionList.source).toBe('fallback');
      expect(blockedRegionList.list).toEqual(['FALLBACK-US', 'FALLBACK-CA']);
    });

    it('never downgrade from remote to fallback regions', () => {
      // Given: Messenger that returns remote feature flags with blocked regions
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: {
                blockedRegions: ['REMOTE-US'],
              },
            },
          };
        }
        return undefined;
      });

      // When: Controller is constructed with both remote and fallback
      const testController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
        clientConfig: {
          fallbackBlockedRegions: ['FALLBACK-US'],
        },
      });

      // Then: Should use remote (set after fallback)
      let blockedRegionList = testController.testGetBlockedRegionList();
      expect(blockedRegionList.source).toBe('remote');
      expect(blockedRegionList.list).toEqual(['REMOTE-US']);

      // When: Attempt to set fallback again (simulating what setBlockedRegionList does)
      testController.testSetBlockedRegionList(['NEW-FALLBACK'], 'fallback');

      // Then: Should still use remote (no downgrade)
      blockedRegionList = testController.testGetBlockedRegionList();
      expect(blockedRegionList.source).toBe('remote');
      expect(blockedRegionList.list).toEqual(['REMOTE-US']);
    });

    it('continues initialization when RemoteFeatureFlagController state call throws error', () => {
      const testInfrastructure = createMockInfrastructure();
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          throw new Error('RemoteFeatureFlagController not ready');
        }
        return undefined;
      });

      const testController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: testInfrastructure,
        clientConfig: {
          fallbackBlockedRegions: ['FALLBACK-US', 'FALLBACK-CA'],
        },
      });

      expect(testController).toBeDefined();
      const blockedRegionList = testController.testGetBlockedRegionList();
      expect(blockedRegionList.source).toBe('fallback');
      expect(blockedRegionList.list).toEqual(['FALLBACK-US', 'FALLBACK-CA']);
      expect(testInfrastructure.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: expect.objectContaining({
            feature: 'perps',
          }),
          context: expect.objectContaining({
            name: 'PerpsController',
            data: expect.objectContaining({
              method: 'constructor',
              operation: 'readRemoteFeatureFlags',
            }),
          }),
        }),
      );
    });
  });

  describe('deferEligibilityCheck', () => {
    it('skips refreshEligibility when eligibility check is deferred', async () => {
      // Arrange
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }
        if (action === 'GeolocationController:getGeolocation') {
          return 'US';
        }
        return undefined;
      });

      const deferredController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
        deferEligibilityCheck: true,
      });

      // Act
      await deferredController.refreshEligibility();

      // Assert — geolocation was never called because refreshEligibility returned early
      expect(testMockCall).not.toHaveBeenCalledWith(
        'GeolocationController:getGeolocation',
      );
    });

    it('resumes eligibility checks after startEligibilityMonitoring is called', () => {
      // Arrange
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: {
                blockedRegions: ['US'],
              },
            },
          };
        }
        return undefined;
      });

      const deferredController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
        deferEligibilityCheck: true,
      });

      // Reset mocks after construction to isolate startEligibilityMonitoring behavior
      testMockCall.mockClear();
      mockFeatureFlagConfigurationServiceInstance.refreshEligibility.mockClear();

      // Re-wire the mock so it still returns flags when called again
      testMockCall.mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: {
                blockedRegions: ['US'],
              },
            },
          };
        }
        return undefined;
      });

      // Act
      deferredController.startEligibilityMonitoring();

      // Assert — startEligibilityMonitoring itself reads remote flags and triggers eligibility
      expect(testMockCall).toHaveBeenCalledWith(
        'RemoteFeatureFlagController:getState',
      );
      expect(
        mockFeatureFlagConfigurationServiceInstance.refreshEligibility,
      ).toHaveBeenCalled();
    });

    it('logs error when RemoteFeatureFlagController throws during startEligibilityMonitoring', () => {
      // Arrange
      const testInfrastructure = createMockInfrastructure();
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          throw new Error('Controller not ready');
        }
        return undefined;
      });

      const deferredController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: testInfrastructure,
        deferEligibilityCheck: true,
      });

      // Reset mock to isolate startEligibilityMonitoring errors from constructor errors
      (testInfrastructure.logger.error as jest.Mock).mockClear();

      // Act — should not throw
      expect(() =>
        deferredController.startEligibilityMonitoring(),
      ).not.toThrow();

      // Assert — error was logged
      expect(testInfrastructure.logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            data: expect.objectContaining({
              method: 'startEligibilityMonitoring',
              operation: 'readRemoteFeatureFlags',
            }),
          }),
        }),
      );
    });

    it('stopEligibilityMonitoring defers subsequent refreshEligibility calls', async () => {
      // Arrange — controller without deferral
      const testMockCall = jest.fn().mockImplementation((action: string) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }
        if (action === 'GeolocationController:getGeolocation') {
          return 'US';
        }
        return undefined;
      });

      const testController = new TestablePerpsController({
        messenger: createMockMessenger({ call: testMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
      });
      testMockCall.mockClear();

      // Act
      testController.stopEligibilityMonitoring();
      await testController.refreshEligibility();

      // Assert — geolocation was never called
      expect(testMockCall).not.toHaveBeenCalledWith(
        'GeolocationController:getGeolocation',
      );
    });
  });

  describe('HIP-3 Configuration Integration', () => {
    it('delegates HIP-3 config updates to FeatureFlagConfigurationService', () => {
      const remoteFlags = {
        remoteFeatureFlags: {
          perpsHip3AllowlistMarkets: 'BTC-USD,ETH-USD',
          perpsHip3BlocklistMarkets: 'SCAM-USD',
        },
      };

      controller.testRefreshEligibilityOnFeatureFlagChange(remoteFlags);

      expect(
        mockFeatureFlagConfigurationServiceInstance.refreshEligibility,
      ).toHaveBeenCalledWith({
        remoteFeatureFlagControllerState: remoteFlags,
        context: expect.objectContaining({
          getHip3Config: expect.any(Function),
          setHip3Config: expect.any(Function),
          incrementHip3ConfigVersion: expect.any(Function),
        }),
      });
    });

    it('does not crash on malformed remote flags', () => {
      const malformedFlags = {
        remoteFeatureFlags: {
          perpsHip3AllowlistMarkets: 123,
        },
      };

      expect(() =>
        controller.testRefreshEligibilityOnFeatureFlagChange(malformedFlags),
      ).not.toThrow();
    });
  });

  describe('getActiveProvider', () => {
    it('throws error when not initialized', () => {
      controller.testSetInitialized(false);

      expect(() => controller.getActiveProvider()).toThrow(
        'CLIENT_NOT_INITIALIZED',
      );
    });

    it('returns provider when initialized', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      const provider = controller.getActiveProvider();
      expect(provider).toBe(mockProvider);
    });
  });

  describe('getActiveProviderOrNull', () => {
    it('returns null during reinitialization', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest.spyOn(controller, 'isCurrentlyReinitializing').mockReturnValue(true);

      const result = controller.getActiveProviderOrNull();

      expect(result).toBeNull();
    });

    it('returns null when not initialized', () => {
      controller.testSetInitialized(false);

      const result = controller.getActiveProviderOrNull();

      expect(result).toBeNull();
    });

    it('returns provider when initialized and not reinitializing', () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      const result = controller.getActiveProviderOrNull();

      expect(result).toBe(mockProvider);
    });
  });

  describe('init', () => {
    it('initializes providers successfully', async () => {
      await controller.init();

      expect(controller.testGetInitialized()).toBe(true);
      expect(controller.testGetProviders().has('hyperliquid')).toBe(true);
    });

    it('handles initialization when already initialized', async () => {
      // First initialization
      await controller.init();
      expect(controller.testGetInitialized()).toBe(true);

      // Second initialization should not throw
      await controller.init();
      expect(controller.testGetInitialized()).toBe(true);
    });

    it('allows retry after all initialization attempts fail', async () => {
      // Set up mock to throw errors BEFORE creating controller
      const networkError = new Error('Network error');
      (
        HyperLiquidProvider as jest.MockedClass<typeof HyperLiquidProvider>
      ).mockImplementation(() => {
        throw networkError;
      });

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
        return undefined;
      });

      const testController = new TestablePerpsController({
        messenger: createMockMessenger({ call: mockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: createMockInfrastructure(),
      });

      // Explicitly start initialization (no longer auto-starts in constructor)
      testController.init().catch(() => {
        // Expected to fail - error is stored in state
      });

      // Wait for initialization to complete (retries happen instantly due to mocked wait())
      // Small delay allows async promise chain to resolve
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify failure state
      expect(testController.state.initializationState).toBe('failed');
      expect(testController.state.initializationError).toBe('Network error');
      expect(testController.testGetInitialized()).toBe(false);

      // Network recovers - provider succeeds on next attempt
      (
        HyperLiquidProvider as jest.MockedClass<typeof HyperLiquidProvider>
      ).mockImplementation(() => mockProvider);

      // User retries initialization (e.g., via network switch)
      await testController.init();

      // Verify initialization succeeds (not cached failure)
      expect(testController.state.initializationState).toBe('initialized');
      expect(testController.state.initializationError).toBeNull();
      expect(testController.testGetInitialized()).toBe(true);
    }); // Fast execution with mocked wait()
  });
});
