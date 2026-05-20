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
  describe('validation methods', () => {
    it('validates close position', async () => {
      const closeParams = {
        symbol: 'BTC',
        orderType: 'market' as const,
        size: '0.5',
      };

      const mockValidationResult = {
        isValid: true,
        errors: [],
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'validateClosePosition')
        .mockResolvedValue(mockValidationResult);

      const result = await controller.validateClosePosition(closeParams);

      expect(result).toEqual(mockValidationResult);
      expect(
        mockMarketDataServiceInstance.validateClosePosition,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: closeParams,
        context: expect.any(Object),
      });
    });

    it('validates withdrawal', async () => {
      const withdrawParams = {
        amount: '100',
        destination:
          '0x1234567890123456789012345678901234567890' as `0x${string}`,
      };

      const mockValidationResult = {
        isValid: true,
        errors: [],
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockAccountServiceInstance, 'validateWithdrawal')
        .mockResolvedValue(mockValidationResult);

      const result = await controller.validateWithdrawal(withdrawParams);

      expect(result).toEqual(mockValidationResult);
      expect(
        mockAccountServiceInstance.validateWithdrawal,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: withdrawParams,
      });
    });
  });

  describe('position management', () => {
    it('updates position TP/SL', async () => {
      const updateParams = {
        symbol: 'BTC',
        takeProfitPrice: '55000',
        stopLossPrice: '45000',
      };

      const mockUpdateResult = {
        success: true,
        positionId: 'pos-123',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'updatePositionTPSL')
        .mockResolvedValue(mockUpdateResult);

      const result = await controller.updatePositionTPSL(updateParams);

      expect(result).toEqual(mockUpdateResult);
      expect(
        mockTradingServiceInstance.updatePositionTPSL,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: updateParams,
          context: expect.any(Object),
        }),
      );
    });

    it('calculates maintenance margin', async () => {
      const marginParams = {
        symbol: 'BTC',
        size: '1.0',
        entryPrice: '50000',
        asset: 'BTC',
      };

      const mockMargin = 2500;

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'calculateMaintenanceMargin')
        .mockResolvedValue(mockMargin);

      const result = await controller.calculateMaintenanceMargin(marginParams);

      expect(result).toBe(mockMargin);
      expect(
        mockMarketDataServiceInstance.calculateMaintenanceMargin,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: marginParams,
        context: expect.any(Object),
      });
    });

    it('updates margin successfully', async () => {
      const updateMarginParams = {
        symbol: 'BTC',
        amount: '100',
      };

      const mockUpdateResult = {
        success: true,
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'updateMargin')
        .mockResolvedValue(mockUpdateResult);

      const result = await controller.updateMargin(updateMarginParams);

      expect(result).toEqual(mockUpdateResult);
      expect(mockTradingServiceInstance.updateMargin).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          symbol: updateMarginParams.symbol,
          amount: '100',
          context: expect.any(Object),
        }),
      );
    });

    it('handles updateMargin error', async () => {
      const updateMarginParams = {
        symbol: 'BTC',
        amount: '100',
      };

      const errorMessage = 'Insufficient balance';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'updateMargin')
        .mockRejectedValue(new Error(errorMessage));

      await expect(controller.updateMargin(updateMarginParams)).rejects.toThrow(
        errorMessage,
      );
      expect(mockTradingServiceInstance.updateMargin).toHaveBeenCalled();
    });

    it('flips position successfully', async () => {
      const mockPosition = {
        symbol: 'BTC',
        size: '0.5',
        entryPrice: '50000',
        positionValue: '25000',
        unrealizedPnl: '1000',
        returnOnEquity: '0.04',
        leverage: { type: 'cross' as const, value: 10 },
        liquidationPrice: '45000',
        marginUsed: '2500',
        maxLeverage: 100,
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      };

      const flipPositionParams = {
        symbol: 'BTC',
        position: mockPosition,
      };

      const mockFlipResult = {
        success: true,
        orderId: 'flip-123',
        filledSize: '1.0',
        averagePrice: '50000',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'flipPosition')
        .mockResolvedValue(mockFlipResult);

      const result = await controller.flipPosition(flipPositionParams);

      expect(result).toEqual(mockFlipResult);
      expect(mockTradingServiceInstance.flipPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          position: mockPosition,
          context: expect.any(Object),
        }),
      );
    });

    it('handles flipPosition error', async () => {
      const mockPosition = {
        symbol: 'BTC',
        size: '0.5',
        entryPrice: '50000',
        positionValue: '25000',
        unrealizedPnl: '1000',
        returnOnEquity: '0.04',
        leverage: { type: 'cross' as const, value: 10 },
        liquidationPrice: '45000',
        marginUsed: '2500',
        maxLeverage: 100,
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      };

      const flipPositionParams = {
        symbol: 'BTC',
        position: mockPosition,
      };

      const errorMessage = 'Insufficient balance for flip fees';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'flipPosition')
        .mockRejectedValue(new Error(errorMessage));

      await expect(controller.flipPosition(flipPositionParams)).rejects.toThrow(
        errorMessage,
      );
      expect(mockTradingServiceInstance.flipPosition).toHaveBeenCalled();
    });
  });

  describe('fee calculations', () => {
    it('calculates fees', async () => {
      const feeParams = {
        orderType: 'market' as const,
        isMaker: false,
        amount: '100000',
        symbol: 'BTC',
      };

      const mockFees = {
        makerFee: '0.0001',
        takerFee: '0.0005',
        totalFee: '0.05',
        feeToken: 'USDC',
        feeAmount: 0.05,
        feeRate: 0.0005,
        protocolFeeRate: 0.0003,
        metamaskFeeRate: 0.0002,
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'calculateFees')
        .mockResolvedValue(mockFees);

      const result = await controller.calculateFees(feeParams);

      expect(result).toEqual(mockFees);
      expect(mockMarketDataServiceInstance.calculateFees).toHaveBeenCalledWith({
        provider: mockProvider,
        params: feeParams,
        context: expect.any(Object),
      });
    });
  });

  describe('reportOrderToDataLake', () => {
    beforeEach(() => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
    });

    it('delegates to DataLakeService.reportOrder', async () => {
      const mockReportResult = {
        success: true,
        error: undefined,
      };

      jest
        .spyOn(mockDataLakeServiceInstance, 'reportOrder')
        .mockResolvedValue(mockReportResult);

      const orderParams = {
        action: 'open' as const,
        symbol: 'BTC',
        slPrice: 45000,
        tpPrice: 55000,
      };

      const result = await controller.testReportOrderToDataLake(orderParams);

      expect(result).toEqual(mockReportResult);
      expect(mockDataLakeServiceInstance.reportOrder).toHaveBeenCalledWith({
        action: orderParams.action,
        symbol: orderParams.symbol,
        slPrice: orderParams.slPrice,
        tpPrice: orderParams.tpPrice,
        isTestnet: controller.state.isTestnet,
        context: expect.objectContaining({
          tracingContext: expect.any(Object),
          errorContext: expect.objectContaining({
            method: 'reportOrderToDataLake',
          }),
          stateManager: expect.any(Object),
        }),
        retryCount: undefined,
        _traceId: undefined,
      });
    });
  });

  describe('getAvailableDexs', () => {
    beforeEach(() => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
    });

    it('returns available HIP-3 DEXs from provider', async () => {
      const mockDexs = ['dex1', 'dex2', 'dex3'];
      jest
        .spyOn(mockMarketDataServiceInstance, 'getAvailableDexs')
        .mockResolvedValue(mockDexs);

      const result = await controller.getAvailableDexs();

      expect(result).toEqual(mockDexs);
      expect(
        mockMarketDataServiceInstance.getAvailableDexs,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
      });
    });

    it('passes filter parameters to provider', async () => {
      const mockDexs = ['dex1'];
      const filterParams = {} as GetAvailableDexsParams;
      jest
        .spyOn(mockMarketDataServiceInstance, 'getAvailableDexs')
        .mockResolvedValue(mockDexs);

      const result = await controller.getAvailableDexs(filterParams);

      expect(result).toEqual(mockDexs);
      expect(
        mockMarketDataServiceInstance.getAvailableDexs,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: filterParams,
        context: expect.any(Object),
      });
    });

    it('throws error when provider does not support HIP-3', async () => {
      jest
        .spyOn(mockMarketDataServiceInstance, 'getAvailableDexs')
        .mockRejectedValue(new Error('Provider does not support HIP-3 DEXs'));

      await expect(controller.getAvailableDexs()).rejects.toThrow(
        'Provider does not support HIP-3 DEXs',
      );
    });
  });

  describe('depositWithConfirmation', () => {
    const mockTransaction = {
      from: '0x1234567890123456789012345678901234567890',
      to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      value: '0x0',
      data: '0x',
      gas: '0x186a0',
    };

    const mockDepositId = 'deposit-123';
    const mockAssetChainId = '0x1';
    const mockNetworkClientId = 'mainnet';
    const mockTransactionMeta = { id: 'tx-meta-123' };
    const mockTxHash = '0xhash123';

    let depositInfrastructure: jest.Mocked<PerpsPlatformDependencies>;
    let depositController: TestablePerpsController;
    let depositMockCall: jest.Mock;

    beforeEach(async () => {
      // Mock DepositService
      jest
        .spyOn(mockDepositServiceInstance, 'prepareTransaction')
        .mockResolvedValue({
          transaction: mockTransaction,
          assetChainId: mockAssetChainId,
          currentDepositId: mockDepositId,
        });

      // Create infrastructure mock (controllers no longer on infra)
      depositInfrastructure = createMockInfrastructure();

      // Create messenger mock that handles network + transaction + account controller calls
      depositMockCall = jest
        .fn()
        .mockImplementation((action: string, ..._args: unknown[]) => {
          if (action === 'RemoteFeatureFlagController:getState') {
            return {
              remoteFeatureFlags: {
                perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
              },
            };
          }
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            return mockNetworkClientId;
          }
          if (action === 'TransactionController:addTransaction') {
            return Promise.resolve({
              result: Promise.resolve(mockTxHash),
              transactionMeta: mockTransactionMeta,
            });
          }
          return undefined;
        });

      Engine.context.TransactionController.estimateGasFee = jest
        .fn()
        .mockResolvedValue({
          estimates: {
            type: GasFeeEstimateType.FeeMarket,
            [GasFeeEstimateLevel.Low]: {
              maxFeePerGas: '0x3b9aca00',
              maxPriorityFeePerGas: '0x1',
            },
            [GasFeeEstimateLevel.Medium]: {
              maxFeePerGas: '0x3b9aca00',
              maxPriorityFeePerGas: '0x1',
            },
            [GasFeeEstimateLevel.High]: {
              maxFeePerGas: '0x3b9aca00',
              maxPriorityFeePerGas: '0x1',
            },
          },
        });

      Engine.context.AccountTrackerController.state.accountsByChainId = {
        [mockAssetChainId]: {
          [mockTransaction.from.toLowerCase()]: {
            balance: '0xde0b6b3a7640000',
          },
        },
      };

      // Create a controller with the custom infrastructure for this test suite
      depositController = new TestablePerpsController({
        messenger: createMockMessenger({ call: depositMockCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: depositInfrastructure,
      });

      // Drain the async eligibility chain started in the constructor
      // (RemoteFeatureFlagController:getState → refreshEligibility →
      // GeolocationController:getGeolocation) so its messenger calls do not
      // leak into per-test assertions on depositMockCall. Microtask ordering
      // differs between Node versions, so without this drain the chain can
      // bleed into the recorded call list on CI (Node 18) while passing
      // locally (Node 22).
      await new Promise((resolve) => setImmediate(resolve));
      depositMockCall.mockClear();
    });

    afterEach(() => {
      delete (Engine.context.TransactionController as any).estimateGasFee;
      jest.clearAllMocks();
      mockAddTransaction.mockClear();
    });

    it('returns promise result', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      const result = await depositController.depositWithConfirmation({
        amount: '100',
      });

      expect(result).toEqual({
        result: expect.any(Promise),
      });
    });

    it('delegates to DepositService.prepareTransaction', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(
        mockDepositServiceInstance.prepareTransaction,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
      });
    });

    it('calls NetworkController:findNetworkClientIdByChainId with correct chainId', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(depositMockCall).toHaveBeenCalledWith(
        'NetworkController:findNetworkClientIdByChainId',
        mockAssetChainId,
      );
    });

    it('calls TransactionController:addTransaction with prepared transaction', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(depositMockCall).toHaveBeenCalledWith(
        'TransactionController:addTransaction',
        mockTransaction,
        {
          networkClientId: mockNetworkClientId,
          origin: 'metamask',
          type: 'perpsDeposit',
          skipInitialGasEstimate: true,
          isInternal: true,
        },
      );
    });

    it('throws error when controller not initialized', async () => {
      depositController.testSetInitialized(false);

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('CLIENT_NOT_INITIALIZED');
    });

    it('throws error when no active provider', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(new Map());

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow();
    });

    it('propagates DepositService errors', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      const mockError = new Error('Deposit service failed');
      jest
        .spyOn(mockDepositServiceInstance, 'prepareTransaction')
        .mockRejectedValue(mockError);

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('Deposit service failed');
    });

    it('propagates NetworkController:findNetworkClientIdByChainId errors', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      const mockError = new Error('Network client not found');
      depositMockCall.mockImplementation(
        (action: string, ..._args: unknown[]) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            throw mockError;
          }
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }
          return undefined;
        },
      );

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('Network client not found');
    });

    it('marks deposit request as failed when networkClientId is not found', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      depositMockCall.mockImplementation(
        (action: string, ..._args: unknown[]) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            return undefined;
          }
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }
          return undefined;
        },
      );

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('No network client found for chain');

      // Verify the deposit request was marked as failed, not left as pending
      const depositRequest = depositController.state.depositRequests.find(
        (req) => req.id === mockDepositId,
      );
      expect(depositRequest).toBeDefined();
      expect(depositRequest?.status).toBe('failed');
      expect(depositRequest?.success).toBe(false);
    });

    it('propagates TransactionController:addTransaction errors', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      const mockError = new Error('Transaction failed');
      depositMockCall.mockImplementation(
        (action: string, ..._args: unknown[]) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'TransactionController:addTransaction') {
            return Promise.reject(mockError);
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            return mockNetworkClientId;
          }
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }
          return undefined;
        },
      );

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('Transaction failed');
    });

    it('clears transaction ID when error occurs and not user cancellation', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      depositController.testUpdate((state) => {
        state.lastDepositTransactionId = 'old-tx-id';
      });
      const mockError = new Error('Network error');
      depositMockCall.mockImplementation(
        (action: string, ..._args: unknown[]) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'TransactionController:addTransaction') {
            return Promise.reject(mockError);
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            return mockNetworkClientId;
          }
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }
          return undefined;
        },
      );

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('Network error');

      expect(depositController.state.lastDepositTransactionId).toBeNull();
    });

    it('preserves state when user cancels transaction', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      depositController.testUpdate((state) => {
        state.lastDepositTransactionId = 'old-tx-id';
      });
      const mockError = new Error('User denied transaction signature');
      depositMockCall.mockImplementation(
        (action: string, ..._args: unknown[]) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'TransactionController:addTransaction') {
            return Promise.reject(mockError);
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            return mockNetworkClientId;
          }
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }
          return undefined;
        },
      );

      await expect(
        depositController.depositWithConfirmation({ amount: '100' }),
      ).rejects.toThrow('User denied');

      // When user cancels, transaction ID is not cleared
      expect(depositController.state.lastDepositTransactionId).toBe(
        'old-tx-id',
      );
    });

    it('clears stale deposit results before transaction', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );
      depositController.testUpdate((state) => {
        state.lastDepositResult = {
          success: true,
          txHash: '0xold',
          amount: '50',
          asset: 'USDC',
          timestamp: Date.now() - 1000,
          error: '',
        };
      });

      const { result } = await depositController.depositWithConfirmation({
        amount: '100',
      });

      await result;

      // After promise resolves, lastDepositResult is set with new result
      expect(depositController.state.lastDepositResult).toBeTruthy();
      expect(depositController.state.lastDepositResult?.success).toBe(true);
    });

    it('updates state with transaction details', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(depositController.state.lastDepositTransactionId).toBe(
        'tx-meta-123',
      );
    });

    it('stores depositId from service immediately', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(depositController.state.depositRequests[0].id).toBe(mockDepositId);
    });

    it('delegates to DepositService with provider', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(
        mockDepositServiceInstance.prepareTransaction,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
      });
    });

    it('adds deposit request to tracking initially as pending', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({ amount: '100' });

      expect(depositController.state.depositRequests).toHaveLength(1);
      expect(depositController.state.depositRequests[0].id).toBe(mockDepositId);
      expect(depositController.state.depositRequests[0].amount).toBe('100');
      expect(depositController.state.depositRequests[0].asset).toBe('USDC');
    });

    it('uses default amount when not provided', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation();

      expect(depositController.state.depositRequests[0].amount).toBe('0');
    });

    it('updates deposit request to completed when transaction succeeds', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      const { result } = await depositController.depositWithConfirmation({
        amount: '100',
      });

      await result;

      // After promise resolves, deposit request is marked as completed
      expect(depositController.state.depositRequests[0].status).toBe(
        'completed',
      );
      expect(depositController.state.depositRequests[0].success).toBe(true);
      expect(depositController.state.depositRequests[0].txHash).toBe(
        mockTxHash,
      );
    });

    it('handles concurrent deposit operations without data corruption', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      const deposit1 = depositController.depositWithConfirmation({
        amount: '100',
      });
      const deposit2 = depositController.depositWithConfirmation({
        amount: '200',
      });

      await Promise.all([deposit1, deposit2]);

      expect(depositController.state.depositRequests).toHaveLength(2);
      const amounts = depositController.state.depositRequests.map(
        (req) => req.amount,
      );
      expect(amounts).toContain('100');
      expect(amounts).toContain('200');
    });

    it('uses addTransaction when placeOrder is true', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      await depositController.depositWithConfirmation({
        amount: '100',
        placeOrder: true,
      });

      // placeOrder uses messenger-based addTransaction with perpsDepositAndOrder type
      expect(depositMockCall).toHaveBeenCalledWith(
        'TransactionController:addTransaction',
        mockTransaction,
        {
          networkClientId: mockNetworkClientId,
          origin: 'metamask',
          type: 'perpsDepositAndOrder',
          skipInitialGasEstimate: true,
          isInternal: true,
        },
      );
      // Should NOT also call with perpsDeposit type
      expect(depositMockCall).not.toHaveBeenCalledWith(
        'TransactionController:addTransaction',
        expect.anything(),
        expect.objectContaining({ type: 'perpsDeposit' }),
      );
      expect(depositController.state.lastDepositTransactionId).toBe(
        'tx-meta-123',
      );
    });

    it('returns resolved promise with transaction ID when placeOrder is true', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      const { result } = await depositController.depositWithConfirmation({
        amount: '100',
        placeOrder: true,
      });

      // This would hang indefinitely with the old never-resolving promise
      const txId = await result;
      expect(typeof txId).toBe('string');
      expect(txId).toBe('tx-meta-123');
    });

    it('clears depositInProgress after successful transaction', async () => {
      jest.useFakeTimers();
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      const { result } = await depositController.depositWithConfirmation({
        amount: '100',
      });

      // Transaction succeeds
      await result;

      // Initially depositInProgress should be true
      expect(depositController.state.depositInProgress).toBe(true);

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(100);

      // After timeout, depositInProgress should be cleared
      expect(depositController.state.depositInProgress).toBe(false);
      expect(depositController.state.lastDepositTransactionId).toBeNull();

      jest.useRealTimers();
    });

    it('handles non-user-cancelled transaction errors after confirmation', async () => {
      jest.useFakeTimers();
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      // Mock messenger to succeed initially, but result promise rejects
      const mockError = new Error('Network error occurred');
      depositMockCall.mockImplementation(
        (action: string, ..._args: unknown[]) => {
          if (
            action ===
            'AccountTreeController:getAccountsFromSelectedAccountGroup'
          ) {
            return [
              {
                address: '0x1234567890123456789012345678901234567890',
                type: 'eip155:eoa',
              },
            ];
          }
          if (action === 'TransactionController:addTransaction') {
            return Promise.resolve({
              result: Promise.reject(mockError),
              transactionMeta: mockTransactionMeta,
            });
          }
          if (action === 'NetworkController:findNetworkClientIdByChainId') {
            return mockNetworkClientId;
          }
          if (action === 'RemoteFeatureFlagController:getState') {
            return { remoteFeatureFlags: {} };
          }
          return undefined;
        },
      );

      const { result } = await depositController.depositWithConfirmation({
        amount: '100',
      });

      // Wait for the result promise to reject
      await expect(result).rejects.toThrow('Network error occurred');

      // Should set error state
      expect(depositController.state.depositInProgress).toBe(false);
      expect(depositController.state.lastDepositTransactionId).toBeNull();
      expect(depositController.state.lastDepositResult).toEqual({
        success: false,
        error: 'Network error occurred',
        amount: '100',
        asset: 'USDC',
        timestamp: expect.any(Number),
        txHash: '',
      });

      // Should update deposit request status
      expect(depositController.state.depositRequests[0].status).toBe('failed');
      expect(depositController.state.depositRequests[0].success).toBe(false);

      jest.useRealTimers();
    });

    it('handles user cancelled transaction with different error messages', async () => {
      depositController.testMarkInitialized();
      depositController.testSetProviders(
        new Map([['hyperliquid', mockProvider]]),
      );

      const cancellationMessages = [
        'User rejected transaction signature',
        'User cancelled transaction',
        'User canceled transaction',
      ];

      for (const message of cancellationMessages) {
        // Reset deposit controller state for each iteration
        depositController.testUpdate((state) => {
          state.depositRequests = [];
          state.lastDepositResult = null;
          state.depositInProgress = false;
        });
        jest.clearAllMocks();
        const mockError = new Error(message);
        // Mock messenger to succeed initially, but result promise rejects with user cancellation
        depositMockCall.mockImplementation(
          (action: string, ..._args: unknown[]) => {
            if (
              action ===
              'AccountTreeController:getAccountsFromSelectedAccountGroup'
            ) {
              return [
                {
                  address: '0x1234567890123456789012345678901234567890',
                  type: 'eip155:eoa',
                },
              ];
            }
            if (action === 'TransactionController:addTransaction') {
              return Promise.resolve({
                result: Promise.reject(mockError),
                transactionMeta: mockTransactionMeta,
              });
            }
            if (action === 'NetworkController:findNetworkClientIdByChainId') {
              return mockNetworkClientId;
            }
            if (action === 'RemoteFeatureFlagController:getState') {
              return { remoteFeatureFlags: {} };
            }
            return undefined;
          },
        );

        const { result } = await depositController.depositWithConfirmation({
          amount: '100',
        });

        await expect(result).rejects.toThrow(message);

        // Should clear state but not set error result
        expect(depositController.state.depositInProgress).toBe(false);
        expect(depositController.state.lastDepositTransactionId).toBeNull();
        expect(depositController.state.lastDepositResult).toBeNull();
      }
    });
  });

  describe('updateWithdrawalStatus', () => {
    const mockWithdrawalId = 'withdrawal-123';
    const mockTxHash = '0xhash456';

    beforeEach(() => {
      markControllerAsInitialized();
      controller.testUpdate((state) => {
        state.withdrawalRequests = [
          {
            id: mockWithdrawalId,
            timestamp: Date.now(),
            amount: '50',
            asset: 'USDC',
            accountAddress: '0x1234567890123456789012345678901234567890',
            success: false,
            status: 'pending',
            source: 'hyperliquid',
          },
        ];
      });
    });

    it('updates withdrawal status to completed with txHash', () => {
      controller.updateWithdrawalStatus(
        mockWithdrawalId,
        'completed',
        mockTxHash,
      );

      const withdrawal = controller.state.withdrawalRequests[0];
      expect(withdrawal.status).toBe('completed');
      expect(withdrawal.txHash).toBe(mockTxHash);
      expect(withdrawal.success).toBe(true);
    });

    it('removes withdrawal request when status is failed', () => {
      controller.updateWithdrawalStatus(mockWithdrawalId, 'failed');

      expect(
        controller.state.withdrawalRequests.some(
          (w) => w.id === mockWithdrawalId,
        ),
      ).toBe(false);
    });

    it('clears withdrawal progress when status completed', () => {
      controller.testUpdate((state) => {
        state.withdrawalProgress = {
          progress: 50,
          lastUpdated: Date.now() - 1000,
          activeWithdrawalId: mockWithdrawalId,
        };
      });

      controller.updateWithdrawalStatus(
        mockWithdrawalId,
        'completed',
        mockTxHash,
      );

      expect(controller.state.withdrawalProgress.progress).toBe(0);
      expect(controller.state.withdrawalProgress.activeWithdrawalId).toBeNull();
    });

    it('clears withdrawal progress when status failed', () => {
      controller.testUpdate((state) => {
        state.withdrawalProgress = {
          progress: 75,
          lastUpdated: Date.now() - 1000,
          activeWithdrawalId: mockWithdrawalId,
        };
      });

      controller.updateWithdrawalStatus(mockWithdrawalId, 'failed');

      expect(controller.state.withdrawalProgress.progress).toBe(0);
      expect(controller.state.withdrawalProgress.activeWithdrawalId).toBeNull();
      expect(
        controller.state.withdrawalRequests.some(
          (w) => w.id === mockWithdrawalId,
        ),
      ).toBe(false);
    });

    it('finds withdrawal by ID', () => {
      controller.testUpdate((state) => {
        state.withdrawalRequests.push({
          id: 'withdrawal-456',
          timestamp: Date.now(),
          amount: '75',
          asset: 'USDC',
          accountAddress: '0x1234567890123456789012345678901234567890',
          success: false,
          status: 'pending',
          source: 'hyperliquid',
        });
      });

      controller.updateWithdrawalStatus(
        'withdrawal-456',
        'completed',
        mockTxHash,
      );

      expect(controller.state.withdrawalRequests[1].status).toBe('completed');
      expect(controller.state.withdrawalRequests[0].status).toBe('pending');
    });

    it('does nothing when withdrawal ID not found', () => {
      const initialRequests = [...controller.state.withdrawalRequests];

      controller.updateWithdrawalStatus(
        'non-existent-id',
        'completed',
        mockTxHash,
      );

      expect(controller.state.withdrawalRequests).toEqual(initialRequests);
    });

    it('updates state correctly for multiple withdrawals', () => {
      controller.testUpdate((state) => {
        state.withdrawalRequests.push({
          id: 'withdrawal-789',
          timestamp: Date.now(),
          amount: '100',
          asset: 'USDC',
          accountAddress: '0x1234567890123456789012345678901234567890',
          success: false,
          status: 'pending',
          source: 'hyperliquid',
        });
      });

      controller.updateWithdrawalStatus(
        mockWithdrawalId,
        'completed',
        mockTxHash,
      );

      expect(controller.state.withdrawalRequests[0].status).toBe('completed');
      expect(controller.state.withdrawalRequests[1].status).toBe('pending');
    });

    it('handles undefined txHash gracefully', () => {
      controller.updateWithdrawalStatus(mockWithdrawalId, 'completed');

      const withdrawal = controller.state.withdrawalRequests[0];
      expect(withdrawal.status).toBe('completed');
      expect(withdrawal.txHash).toBeUndefined();
      expect(withdrawal.success).toBe(true);
    });
  });

  describe('completeWithdrawalFromHistory', () => {
    const pendingId = 'withdrawal-fifo-1';
    const txHash = '0xfifoabc';
    const completedPayload = {
      txHash,
      amount: '25',
      timestamp: 1_700_000_000_000,
      asset: 'USDC',
    };

    beforeEach(() => {
      markControllerAsInitialized();
      controller.testUpdate((state) => {
        state.withdrawalRequests = [
          {
            id: pendingId,
            timestamp: Date.now(),
            amount: '25',
            asset: 'USDC',
            accountAddress: '0x1234567890123456789012345678901234567890',
            success: false,
            status: 'pending',
            source: 'hyperliquid',
          },
        ];
        state.withdrawInProgress = true;
        state.lastCompletedWithdrawalTimestamp = 1_699_000_000_000;
        state.lastCompletedWithdrawalTxHashes = ['0xexisting'];
        state.lastUpdateTimestamp = 99_999;
      });
    });

    it('does not mutate FIFO guards or emit analytics when withdrawal id is unknown', () => {
      const snapshot = {
        withdrawalRequests: [...controller.state.withdrawalRequests],
        lastCompletedWithdrawalTimestamp:
          controller.state.lastCompletedWithdrawalTimestamp,
        lastCompletedWithdrawalTxHashes: [
          ...controller.state.lastCompletedWithdrawalTxHashes,
        ],
        withdrawInProgress: controller.state.withdrawInProgress,
        lastUpdateTimestamp: controller.state.lastUpdateTimestamp,
      };

      controller.completeWithdrawalFromHistory('unknown-withdrawal-id', {
        ...completedPayload,
        txHash: '0xstale',
      });

      expect(controller.state.withdrawalRequests).toEqual(
        snapshot.withdrawalRequests,
      );
      expect(controller.state.lastCompletedWithdrawalTimestamp).toBe(
        snapshot.lastCompletedWithdrawalTimestamp,
      );
      expect(controller.state.lastCompletedWithdrawalTxHashes).toEqual(
        snapshot.lastCompletedWithdrawalTxHashes,
      );
      expect(controller.state.withdrawInProgress).toBe(
        snapshot.withdrawInProgress,
      );
      expect(controller.state.lastUpdateTimestamp).toBe(
        snapshot.lastUpdateTimestamp,
      );
      expect(mockInfrastructure.metrics.trackPerpsEvent).not.toHaveBeenCalled();
    });

    it('removes the request, updates FIFO guards, and tracks completion when id matches', () => {
      controller.completeWithdrawalFromHistory(pendingId, completedPayload);

      expect(controller.state.withdrawalRequests).toHaveLength(0);
      expect(controller.state.lastCompletedWithdrawalTimestamp).toBe(
        completedPayload.timestamp,
      );
      expect(controller.state.lastCompletedWithdrawalTxHashes).toEqual([
        '0xexisting',
        txHash,
      ]);
      expect(controller.state.withdrawInProgress).toBe(false);
      expect(mockInfrastructure.metrics.trackPerpsEvent).toHaveBeenCalledWith(
        PerpsAnalyticsEvent.WithdrawalTransaction,
        expect.objectContaining({
          [PERPS_EVENT_PROPERTY.STATUS]: PERPS_EVENT_VALUE.STATUS.COMPLETED,
          [PERPS_EVENT_PROPERTY.WITHDRAWAL_AMOUNT]: 25,
        }),
      );
    });
  });

  describe('markFirstOrderCompleted', () => {
    beforeEach(() => {
      markControllerAsInitialized();
    });

    it('marks first order completed for mainnet', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });

      controller.markFirstOrderCompleted();

      expect(controller.state.hasPlacedFirstOrder.mainnet).toBe(true);
    });

    it('marks first order completed for testnet', () => {
      controller.testUpdate((state) => {
        state.isTestnet = true;
      });

      controller.markFirstOrderCompleted();

      expect(controller.state.hasPlacedFirstOrder.testnet).toBe(true);
    });

    it('only updates status for current network', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
        state.hasPlacedFirstOrder = {
          mainnet: false,
          testnet: false,
        };
      });

      controller.markFirstOrderCompleted();

      expect(controller.state.hasPlacedFirstOrder.mainnet).toBe(true);
      expect(controller.state.hasPlacedFirstOrder.testnet).toBe(false);
    });

    it('does not crash when called multiple times', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });

      controller.markFirstOrderCompleted();
      expect(controller.state.hasPlacedFirstOrder.mainnet).toBe(true);

      controller.markFirstOrderCompleted();
      expect(controller.state.hasPlacedFirstOrder.mainnet).toBe(true);
    });

    it('logs completion without throwing', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });

      expect(() => controller.markFirstOrderCompleted()).not.toThrow();
    });
  });

  describe('getWithdrawalRoutes error handling', () => {
    beforeEach(() => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
    });

    it('logs error in getWithdrawalRoutes when provider throws', () => {
      const mockError = new Error('Provider error');
      jest
        .spyOn(mockMarketDataServiceInstance, 'getWithdrawalRoutes')
        .mockImplementation(() => {
          throw mockError;
        });

      const result = controller.getWithdrawalRoutes();

      expect(result).toEqual([]);
      expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          context: expect.objectContaining({
            name: 'PerpsController',
            data: expect.objectContaining({
              method: 'getWithdrawalRoutes',
            }),
          }),
        }),
      );
    });

    it('returns empty array from getWithdrawalRoutes on error', () => {
      jest
        .spyOn(mockMarketDataServiceInstance, 'getWithdrawalRoutes')
        .mockImplementation(() => {
          throw new Error('Service failure');
        });

      const result = controller.getWithdrawalRoutes();

      expect(result).toEqual([]);
    });

    it('handles edge case with null provider gracefully', () => {
      controller.testSetProviders(new Map());

      expect(() => controller.getWithdrawalRoutes()).not.toThrow();
      expect(controller.getWithdrawalRoutes()).toEqual([]);
    });
  });
});
