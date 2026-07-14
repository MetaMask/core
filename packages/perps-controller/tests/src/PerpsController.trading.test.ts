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
  describe('getPositions', () => {
    it('gets positions successfully', async () => {
      const mockPositions = [
        {
          symbol: 'ETH',
          size: '2.5',
          entryPrice: '2000',
          positionValue: '5000',
          unrealizedPnl: '500',
          marginUsed: '2500',
          leverage: { type: 'cross' as const, value: 2 },
          liquidationPrice: '1500',
          maxLeverage: 100,
          returnOnEquity: '10.0',
          cumulativeFunding: {
            allTime: '10',
            sinceOpen: '5',
            sinceChange: '2',
          },
          takeProfitCount: 0,
          stopLossCount: 0,
        },
      ];

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getPositions')
        .mockResolvedValue(mockPositions);

      const result = await controller.getPositions();

      expect(result).toEqual(mockPositions);
      expect(mockMarketDataServiceInstance.getPositions).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
      });
    });

    it('handles getPositions error', async () => {
      const errorMessage = 'Network error';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getPositions')
        .mockRejectedValue(new Error(errorMessage));

      await expect(controller.getPositions()).rejects.toThrow(errorMessage);
      expect(mockMarketDataServiceInstance.getPositions).toHaveBeenCalled();
    });
  });

  describe('getAccountState', () => {
    it('gets account state successfully', async () => {
      const mockAccountState = {
        spendableBalance: '1000',
        withdrawableBalance: '1000',
        marginUsed: '500',
        unrealizedPnl: '100',
        returnOnEquity: '20.0',
        totalBalance: '1600',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getAccountState')
        .mockResolvedValue(mockAccountState);

      const result = await controller.getAccountState();

      expect(result).toEqual(mockAccountState);
      expect(
        mockMarketDataServiceInstance.getAccountState,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
      });
    });
  });

  describe('placeOrder', () => {
    it('places order successfully', async () => {
      const orderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market' as const,
      };

      const mockOrderResult = {
        success: true,
        orderId: 'order-123',
        filledSize: '0.1',
        averagePrice: '50000',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'placeOrder')
        .mockResolvedValue(mockOrderResult);

      const result = await controller.placeOrder(orderParams);

      expect(result).toEqual(mockOrderResult);
      expect(mockTradingServiceInstance.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: orderParams,
          context: expect.any(Object),
        }),
      );
    });

    it('handles placeOrder error', async () => {
      const orderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market' as const,
      };

      const errorMessage = 'Order placement failed';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'placeOrder')
        .mockRejectedValue(new Error(errorMessage));

      await expect(controller.placeOrder(orderParams)).rejects.toThrow(
        errorMessage,
      );
      expect(mockTradingServiceInstance.placeOrder).toHaveBeenCalled();
    });
  });

  describe('getMarkets', () => {
    it('gets markets successfully', async () => {
      const mockMarkets = [
        {
          name: 'BTC',
          szDecimals: 3,
          maxLeverage: 50,
          marginTableId: 1,
        },
        {
          name: 'ETH',
          szDecimals: 2,
          maxLeverage: 25,
          marginTableId: 2,
        },
      ];

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getMarkets')
        .mockResolvedValue(mockMarkets);

      const result = await controller.getMarkets();

      expect(result).toEqual(mockMarkets);
      expect(mockMarketDataServiceInstance.getMarkets).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
        isMarketAllowed: expect.any(Function),
      });
    });
  });

  describe('cancelOrder', () => {
    it('cancels order successfully', async () => {
      const cancelParams = {
        orderId: 'order-123',
        symbol: 'BTC',
      };

      const mockCancelResult = {
        success: true,
        orderId: 'order-123',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'cancelOrder')
        .mockResolvedValue(mockCancelResult);

      const result = await controller.cancelOrder(cancelParams);

      expect(result).toEqual(mockCancelResult);
      expect(mockTradingServiceInstance.cancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: cancelParams,
          context: expect.any(Object),
        }),
      );
    });
  });

  describe('cancelOrders', () => {
    it('delegates to TradingService with withStreamPause callback', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      const mockImplementation = jest.fn(async (options: any) => {
        // Simulate TradingService calling the withStreamPause callback
        await options.withStreamPause(
          async () => ({
            success: true,
            successCount: 1,
            failureCount: 0,
            results: [{ symbol: 'BTC', orderId: 'order-1', success: true }],
          }),
          ['orders'],
        );

        return {
          success: true,
          successCount: 1,
          failureCount: 0,
          results: [{ symbol: 'BTC', orderId: 'order-1', success: true }],
        };
      });

      jest
        .spyOn(mockTradingServiceInstance, 'cancelOrders')
        .mockImplementation(mockImplementation);

      await controller.cancelOrders({ cancelAll: true });

      expect(
        mockInfrastructure.streamManager.pauseChannel,
      ).toHaveBeenCalledWith('orders');
      expect(
        mockInfrastructure.streamManager.resumeChannel,
      ).toHaveBeenCalledWith('orders');
      expect(mockTradingServiceInstance.cancelOrders).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: { cancelAll: true },
          context: expect.any(Object),
          withStreamPause: expect.any(Function),
        }),
      );
    });

    it('resumes streams even when operation throws error', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      const mockImplementation = jest.fn(async (options: any) =>
        // Simulate TradingService calling the withStreamPause callback with an error
        options.withStreamPause(async () => {
          throw new Error('Network error');
        }, ['orders']),
      );

      jest
        .spyOn(mockTradingServiceInstance, 'cancelOrders')
        .mockImplementation(mockImplementation);

      await expect(
        controller.cancelOrders({ cancelAll: true }),
      ).rejects.toThrow('Network error');

      expect(
        mockInfrastructure.streamManager.pauseChannel,
      ).toHaveBeenCalledWith('orders');
      expect(
        mockInfrastructure.streamManager.resumeChannel,
      ).toHaveBeenCalledWith('orders');
    });
  });

  describe('closePosition', () => {
    it('closes position successfully', async () => {
      const closeParams = {
        symbol: 'BTC',
        orderType: 'market' as const,
        size: '0.5',
      };

      const mockCloseResult = {
        success: true,
        orderId: 'close-order-123',
        filledSize: '0.5',
        averagePrice: '50000',
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'closePosition')
        .mockResolvedValue(mockCloseResult);

      const result = await controller.closePosition(closeParams);

      expect(result).toEqual(mockCloseResult);
      expect(mockTradingServiceInstance.closePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: closeParams,
          context: expect.any(Object),
        }),
      );
    });
  });

  describe('closePositions', () => {
    it('delegates to TradingService.closePositions', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      jest
        .spyOn(mockTradingServiceInstance, 'closePositions')
        .mockResolvedValue({
          success: true,
          successCount: 1,
          failureCount: 0,
          results: [{ symbol: 'BTC', success: true }],
        });

      const result = await controller.closePositions({ closeAll: true });

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(mockTradingServiceInstance.closePositions).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: { closeAll: true },
          context: expect.any(Object),
        }),
      );
    });
  });

  describe('validateOrder', () => {
    it('validates order successfully', async () => {
      const orderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market' as const,
      };

      const mockValidationResult = {
        isValid: true,
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'validateOrder')
        .mockResolvedValue(mockValidationResult);

      const result = await controller.validateOrder(orderParams);

      expect(result).toEqual(mockValidationResult);
      expect(mockMarketDataServiceInstance.validateOrder).toHaveBeenCalledWith({
        provider: mockProvider,
        params: orderParams,
        context: expect.any(Object),
      });
    });
  });

  describe('getOrderFills', () => {
    it('gets order fills successfully', async () => {
      const mockOrderFills = [
        {
          orderId: 'order-123',
          symbol: 'BTC',
          side: 'buy',
          size: '0.1',
          price: '50000',
          pnl: '100',
          direction: 'long',
          fee: '5',
          feeToken: 'USDC',
          timestamp: 1640995200000,
        },
      ];

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getOrderFills')
        .mockResolvedValue(mockOrderFills);

      const result = await controller.getOrderFills();

      expect(result).toEqual(mockOrderFills);
      expect(mockMarketDataServiceInstance.getOrderFills).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
      });
    });
  });

  describe('getOrders', () => {
    it('gets orders successfully', async () => {
      const mockOrders = [
        {
          orderId: 'order-123',
          symbol: 'BTC',
          side: 'buy' as const,
          orderType: 'market' as const,
          size: '0.1',
          originalSize: '0.1',
          price: '50000',
          filledSize: '0.1',
          remainingSize: '0',
          status: 'filled' as const,
          timestamp: 1640995200000,
        },
      ];

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getOrders')
        .mockResolvedValue(mockOrders);

      const result = await controller.getOrders();

      expect(result).toEqual(mockOrders);
      expect(mockMarketDataServiceInstance.getOrders).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
      });
    });
  });

  describe('subscribeToPrices', () => {
    it('subscribes to price updates', () => {
      const mockUnsubscribe = jest.fn();
      const params = {
        symbols: ['BTC', 'ETH'],
        callback: jest.fn(),
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.subscribeToPrices.mockReturnValue(mockUnsubscribe);

      const unsubscribe = controller.subscribeToPrices(params);

      expect(unsubscribe).toBe(mockUnsubscribe);
      expect(mockProvider.subscribeToPrices).toHaveBeenCalledWith(params);
    });
  });
});
