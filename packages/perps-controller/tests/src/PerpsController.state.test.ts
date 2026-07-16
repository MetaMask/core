/* eslint-disable */
/**
 * PerpsController Tests
 * Clean, focused test suite for PerpsController
 */

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
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider';
import { PerpsAnalyticsEvent } from '../../src/types';

jest.mock('../../src/providers/HyperLiquidProvider');
jest.mock('../../src/providers/MYXProvider');

// Mock transaction controller utility
const mockAddTransaction = jest.fn();
jest.mock(
  '../../../util/transaction-controller',
  () => ({
    addTransaction: (...args) => mockAddTransaction(...args),
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
  refreshEligibility: jest.fn((options) => {
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
  setBlockedRegions: jest.fn((options) => {
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
  testUpdate(callback) {
    this.update(callback);
  }

  testMarkInitialized() {
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }

  testSetProviders(providers) {
    this.providers = providers;
    const firstProvider = providers.values().next().value;
    if (firstProvider) {
      this.activeProviderInstance = firstProvider;
    }
  }

  testSetPartialProviders(providers) {
    this.providers = providers;
  }

  testGetProviders() {
    return this.providers;
  }

  testSetInitialized(value) {
    this.isInitialized = value;
  }

  testGetInitialized() {
    return this.isInitialized;
  }

  testGetBlockedRegionList() {
    return this.blockedRegionList;
  }

  testSetBlockedRegionList(list, source) {
    this.setBlockedRegionList(list, source);
  }

  testRefreshEligibilityOnFeatureFlagChange(remoteFlags) {
    this.refreshEligibilityOnFeatureFlagChange(remoteFlags);
  }

  testReportOrderToDataLake(data) {
    return this.reportOrderToDataLake(data);
  }

  testHasStandaloneProvider() {
    return this.hasStandaloneProvider();
  }

  testRegisterMYXProvider(MYXProvider) {
    this.registerMYXProvider(MYXProvider);
  }

  testHandleMYXImportError(error) {
    this.handleMYXImportError(error);
  }
}

describe('PerpsController', () => {
  let controller;
  let mockProvider;
  let mockInfrastructure;

  // Helper to mark controller as initialized for tests
  const markControllerAsInitialized = () => {
    controller.testMarkInitialized();
  };

  beforeEach(() => {
    jest.clearAllMocks();

    jest
      .requireMock('../../src/services/EligibilityService')
      .EligibilityService.mockImplementation(
        () => mockEligibilityServiceInstance,
      );
    jest
      .requireMock('../../src/services/DepositService')
      .DepositService.mockImplementation(() => mockDepositServiceInstance);
    jest
      .requireMock('../../src/services/MarketDataService')
      .MarketDataService.mockImplementation(
        () => mockMarketDataServiceInstance,
      );
    jest
      .requireMock('../../src/services/TradingService')
      .TradingService.mockImplementation(() => mockTradingServiceInstance);
    jest
      .requireMock('../../src/services/AccountService')
      .AccountService.mockImplementation(() => mockAccountServiceInstance);
    jest
      .requireMock('../../src/services/DataLakeService')
      .DataLakeService.mockImplementation(() => mockDataLakeServiceInstance);
    jest
      .requireMock('../../src/services/FeatureFlagConfigurationService')
      .FeatureFlagConfigurationService.mockImplementation(
        () => mockFeatureFlagConfigurationServiceInstance,
      );

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
      (options) => {
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
      (options) => {
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
    Engine.context.RewardsController.getPerpsDiscountForAccount.mockResolvedValue(
      null,
    );
    Engine.context.NetworkController.getNetworkClientById.mockReturnValue({
      configuration: { chainId: '0x1' },
    });

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

    HyperLiquidProvider.mockImplementation(() => mockProvider);

    const mockCall = jest.fn().mockImplementation((action) => {
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
          value.mockClear();
        }
      });
    }
    mockInfrastructure.metrics.trackPerpsEvent.mockClear();
    mockInfrastructure.logger.error.mockClear();
    mockInfrastructure.debugLogger.log.mockClear();
  });
  describe('attribution context', () => {
    it('returns an empty context by default', () => {
      expect(controller.getAttributionContext()).toStrictEqual({});
    });

    it('stores and returns the UTM attribution context', () => {
      controller.setAttributionContext({
        utmSource: 'newsletter',
        utmMedium: 'email',
        utmCampaign: 'launch',
      });

      expect(controller.getAttributionContext()).toStrictEqual({
        utmSource: 'newsletter',
        utmMedium: 'email',
        utmCampaign: 'launch',
      });
    });

    it('clears the stored attribution context', () => {
      controller.setAttributionContext({ utmSource: 'newsletter' });
      controller.clearAttributionContext();

      expect(controller.getAttributionContext()).toStrictEqual({});
    });

    it('merges defined UTM keys into event properties using canonical keys', () => {
      controller.setAttributionContext({
        utmSource: 'newsletter',
        utmMedium: 'email',
        utmCampaign: 'launch',
        utmContent: 'cta',
        utmTerm: 'perps',
      });

      expect(
        controller.mergeAttributionContext({ asset: 'BTC' }),
      ).toStrictEqual({
        [PERPS_EVENT_PROPERTY.UTM_SOURCE]: 'newsletter',
        [PERPS_EVENT_PROPERTY.UTM_MEDIUM]: 'email',
        [PERPS_EVENT_PROPERTY.UTM_CAMPAIGN]: 'launch',
        [PERPS_EVENT_PROPERTY.UTM_CONTENT]: 'cta',
        [PERPS_EVENT_PROPERTY.UTM_TERM]: 'perps',
        asset: 'BTC',
      });
    });

    it('lets provided properties win over attribution context and omits undefined UTM keys', () => {
      controller.setAttributionContext({ utmSource: 'newsletter' });

      expect(
        controller.mergeAttributionContext({
          [PERPS_EVENT_PROPERTY.UTM_SOURCE]: 'override',
        }),
      ).toStrictEqual({ [PERPS_EVENT_PROPERTY.UTM_SOURCE]: 'override' });
    });

    it('returns only base properties when no context is set', () => {
      expect(controller.mergeAttributionContext()).toStrictEqual({});
    });
  });

  describe('state management', () => {
    it('returns positions without updating state', async () => {
      const mockPositions = [
        {
          symbol: 'ETH',
          size: '2.5',
          entryPrice: '2000',
          positionValue: '5000',
          unrealizedPnl: '500',
          marginUsed: '2500',
          leverage: { type: 'cross', value: 2 },
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
      expect(mockMarketDataServiceInstance.getPositions).toHaveBeenCalled();
    });

    it('handles errors without updating state', async () => {
      const errorMessage = 'Failed to fetch positions';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getPositions')
        .mockRejectedValue(new Error(errorMessage));

      await expect(controller.getPositions()).rejects.toThrow(errorMessage);
      expect(mockMarketDataServiceInstance.getPositions).toHaveBeenCalled();
    });
  });

  describe('connection management', () => {
    it('handles disconnection', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.disconnect.mockResolvedValue({ success: true });

      await controller.disconnect();

      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('cleans up preload subscriptions on disconnect', async () => {
      jest.useFakeTimers();
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.disconnect.mockResolvedValue({ success: true });
      mockProvider.getMarketDataWithPrices.mockResolvedValue([]);

      // Arrange: start preloading to set up timer + subscriptions
      controller.startMarketDataPreload();
      await jest.advanceTimersByTimeAsync(100);

      // Act: disconnect should tear down all preload state
      await controller.disconnect();

      // Assert: provider disconnected and no interval fires after disconnect
      expect(mockProvider.disconnect).toHaveBeenCalled();
      const callsBefore =
        mockProvider.getMarketDataWithPrices.mock.calls.length;
      jest.advanceTimersByTime(10 * 60 * 1000);
      expect(mockProvider.getMarketDataWithPrices.mock.calls.length).toBe(
        callsBefore,
      );

      jest.useRealTimers();
    });
  });

  describe('utility methods', () => {
    it('gets funding information', async () => {
      const mockFunding = [
        {
          symbol: 'BTC',
          fundingRate: '0.0001',
          timestamp: 1640995200000,
          amountUsd: '100',
          rate: '0.0001',
        },
      ];

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockMarketDataServiceInstance, 'getFunding')
        .mockResolvedValue(mockFunding);

      const result = await controller.getFunding();

      expect(result).toEqual(mockFunding);
      expect(mockMarketDataServiceInstance.getFunding).toHaveBeenCalledWith({
        provider: mockProvider,
        params: undefined,
        context: expect.any(Object),
      });
    });

    it('gets order fills with parameters', async () => {
      const params = { limit: 10, user: '0x123' as `0x${string}` };
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

      const result = await controller.getOrderFills(params);

      expect(result).toEqual(mockOrderFills);
      expect(mockMarketDataServiceInstance.getOrderFills).toHaveBeenCalledWith({
        provider: mockProvider,
        params,
        context: expect.any(Object),
      });
    });
  });

  describe('order management', () => {
    it('edits order successfully', async () => {
      const editParams = {
        orderId: 'order-123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit',
          price: '51000',
          size: '0.2',
        },
      };

      const mockEditResult = {
        success: true,
        orderId: 'order-123',
        updatedOrder: editParams.newOrder,
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'editOrder')
        .mockResolvedValue(mockEditResult);

      const result = await controller.editOrder(editParams);

      expect(result).toEqual(mockEditResult);
      expect(mockTradingServiceInstance.editOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockProvider,
          params: editParams,
          context: expect.any(Object),
        }),
      );
    });

    it('handles edit order error', async () => {
      const editParams = {
        orderId: 'order-123',
        newOrder: {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit',
          price: '51000',
          size: '0.2',
        },
      };

      const errorMessage = 'Order edit failed';

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      jest
        .spyOn(mockTradingServiceInstance, 'editOrder')
        .mockRejectedValue(new Error(errorMessage));

      await expect(controller.editOrder(editParams)).rejects.toThrow(
        errorMessage,
      );
      expect(mockTradingServiceInstance.editOrder).toHaveBeenCalled();
    });
  });

  describe('subscription management', () => {
    it('subscribes to order fills', () => {
      const mockUnsubscribe = jest.fn();
      const params = {
        callback: jest.fn(),
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.subscribeToOrderFills.mockReturnValue(mockUnsubscribe);

      const unsubscribe = controller.subscribeToOrderFills(params);

      expect(unsubscribe).toBe(mockUnsubscribe);
      expect(mockProvider.subscribeToOrderFills).toHaveBeenCalledWith(params);
    });

    it('sets live data configuration', () => {
      const config = {
        priceThrottleMs: 1000,
        positionThrottleMs: 2000,
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.setLiveDataConfig.mockReturnValue(undefined);

      controller.setLiveDataConfig(config);

      expect(mockProvider.setLiveDataConfig).toHaveBeenCalledWith(config);
    });

    it('handles subscription cleanup', () => {
      const mockUnsubscribe = jest.fn();
      const params = {
        symbols: ['BTC', 'ETH'],
        callback: jest.fn(),
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.subscribeToPrices.mockReturnValue(mockUnsubscribe);

      const unsubscribe = controller.subscribeToPrices(params);

      // Test that unsubscribe function works
      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('deposit operations', () => {
    it('clears deposit result', () => {
      // Test that clearDepositResult method exists and can be called
      expect(() => controller.clearDepositResult()).not.toThrow();

      // Verify the method was called (it's a void method)
      expect(typeof controller.clearDepositResult).toBe('function');
    });
  });

  describe('withdrawal operations', () => {
    it('clears withdraw result', () => {
      // Test that clearWithdrawResult method exists and can be called
      expect(() => controller.clearWithdrawResult()).not.toThrow();

      // Verify the method was called (it's a void method)
      expect(typeof controller.clearWithdrawResult).toBe('function');
    });
  });

  describe('network management', () => {
    it('gets current network', () => {
      const network = controller.getCurrentNetwork();

      expect(['mainnet', 'testnet']).toContain(network);
      expect(typeof network).toBe('string');
    });

    it('gets withdrawal routes', () => {
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
      jest
        .spyOn(mockMarketDataServiceInstance, 'getWithdrawalRoutes')
        .mockReturnValue(mockRoutes);

      const result = controller.getWithdrawalRoutes();

      expect(result).toEqual(mockRoutes);
      expect(
        mockMarketDataServiceInstance.getWithdrawalRoutes,
      ).toHaveBeenCalledWith({
        provider: mockProvider,
      });
    });
  });

  describe('user management', () => {
    it('checks if first time user on current network', () => {
      const isFirstTime = controller.isFirstTimeUserOnCurrentNetwork();

      expect(typeof isFirstTime).toBe('boolean');
    });

    it('marks tutorial as completed', () => {
      // Test that markTutorialCompleted method exists and can be called
      expect(() => controller.markTutorialCompleted()).not.toThrow();

      // Verify the method was called (it's a void method)
      expect(typeof controller.markTutorialCompleted).toBe('function');
    });
  });

  describe('watchlist markets', () => {
    it('returns empty array by default', () => {
      const watchlist = controller.getWatchlistMarkets();
      expect(watchlist).toEqual([]);
    });

    it('toggles watchlist market (add)', async () => {
      await controller.toggleWatchlistMarket('BTC');

      const watchlist = controller.getWatchlistMarkets();
      expect(watchlist).toContain('BTC');
      expect(controller.isWatchlistMarket('BTC')).toBe(true);
    });

    it('toggles watchlist market (remove)', async () => {
      await controller.toggleWatchlistMarket('BTC');
      await controller.toggleWatchlistMarket('BTC');

      const watchlist = controller.getWatchlistMarkets();
      expect(watchlist).not.toContain('BTC');
      expect(controller.isWatchlistMarket('BTC')).toBe(false);
    });

    it('handles multiple watchlist markets', async () => {
      await controller.toggleWatchlistMarket('BTC');
      await controller.toggleWatchlistMarket('ETH');
      await controller.toggleWatchlistMarket('SOL');

      const watchlist = controller.getWatchlistMarkets();
      expect(watchlist).toHaveLength(3);
      expect(watchlist).toContain('BTC');
      expect(watchlist).toContain('ETH');
      expect(watchlist).toContain('SOL');
    });

    it('persist watchlist per network', async () => {
      // Add to watchlist on mainnet (default is testnet in dev, so set to false)
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });
      await controller.toggleWatchlistMarket('BTC');

      const mainnetWatchlist = controller.getWatchlistMarkets();
      expect(mainnetWatchlist).toContain('BTC');

      // Switch to testnet
      controller.testUpdate((state) => {
        state.isTestnet = true;
      });
      const testnetWatchlist = controller.getWatchlistMarkets();
      expect(testnetWatchlist).toEqual([]);

      // Add to watchlist on testnet
      await controller.toggleWatchlistMarket('ETH');
      expect(controller.getWatchlistMarkets()).toContain('ETH');
      expect(controller.isWatchlistMarket('ETH')).toBe(true);

      // Switch back to mainnet
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });
      expect(controller.getWatchlistMarkets()).toContain('BTC');
      expect(controller.getWatchlistMarkets()).not.toContain('ETH');
    });
  });

  describe('recently viewed markets', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns empty array by default', () => {
      expect(controller.getRecentlyViewedMarkets()).toStrictEqual([]);
    });

    it('records a viewed market and returns it', () => {
      controller.recordMarketViewed('BTC');

      expect(controller.getRecentlyViewedMarkets()).toStrictEqual(['BTC']);
    });

    it('prepends new entries (newest first)', () => {
      controller.recordMarketViewed('BTC');
      jest.advanceTimersByTime(1000);
      controller.recordMarketViewed('ETH');

      expect(controller.getRecentlyViewedMarkets()).toStrictEqual([
        'ETH',
        'BTC',
      ]);
    });

    it('deduplicates: moves existing symbol to front', () => {
      controller.recordMarketViewed('BTC');
      jest.advanceTimersByTime(1000);
      controller.recordMarketViewed('ETH');
      jest.advanceTimersByTime(1000);
      controller.recordMarketViewed('BTC');

      const result = controller.getRecentlyViewedMarkets();
      expect(result[0]).toBe('BTC');
      expect(result.filter((s) => s === 'BTC')).toHaveLength(1);
    });

    it('caps at 10 entries', () => {
      for (let i = 0; i < 15; i++) {
        controller.recordMarketViewed(`COIN${i}`);
        jest.advanceTimersByTime(100);
      }

      expect(controller.getRecentlyViewedMarkets()).toHaveLength(10);
    });

    it('filters out entries older than 24 hours', () => {
      controller.recordMarketViewed('BTC');
      // Advance past the 24h TTL
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);
      controller.recordMarketViewed('ETH');

      const result = controller.getRecentlyViewedMarkets();
      expect(result).toContain('ETH');
      expect(result).not.toContain('BTC');
    });

    it('returns empty array when all entries are expired', () => {
      controller.recordMarketViewed('BTC');
      jest.advanceTimersByTime(25 * 60 * 60 * 1000);

      expect(controller.getRecentlyViewedMarkets()).toStrictEqual([]);
    });

    it('tracks per network — mainnet and testnet are independent', () => {
      controller.testUpdate((state) => {
        state.isTestnet = false;
      });
      controller.recordMarketViewed('BTC');

      controller.testUpdate((state) => {
        state.isTestnet = true;
      });
      expect(controller.getRecentlyViewedMarkets()).toStrictEqual([]);

      controller.recordMarketViewed('SOL');
      expect(controller.getRecentlyViewedMarkets()).toContain('SOL');

      controller.testUpdate((state) => {
        state.isTestnet = false;
      });
      expect(controller.getRecentlyViewedMarkets()).toContain('BTC');
      expect(controller.getRecentlyViewedMarkets()).not.toContain('SOL');
    });
  });

  describe('AUS watchlist sync', () => {
    /**
     * Minimal valid NotificationPreferences blob used across these tests.
     * `watchlistMarkets` is intentionally absent so individual tests can
     * control whether the field is present or not.
     */
    const MOCK_PREFS_BASE = {
      walletActivity: {
        inAppNotificationsEnabled: true,
        pushNotificationsEnabled: true,
        accounts: [],
      },
      marketing: {
        inAppNotificationsEnabled: false,
        pushNotificationsEnabled: false,
      },
      perps: {
        inAppNotificationsEnabled: true,
        pushNotificationsEnabled: true,
      },
      socialAI: {
        inAppNotificationsEnabled: false,
        pushNotificationsEnabled: false,
        mutedTraderProfileIds: [],
      },
      agenticCli: {
        inAppNotificationsEnabled: true,
        pushNotificationsEnabled: true,
      },
      priceAlerts: {
        inAppNotificationsEnabled: true,
        pushNotificationsEnabled: true,
      },
    };

    let ausController;
    let mockAusCall;
    let mockAusInfrastructure;

    beforeEach(() => {
      mockAusCall = jest.fn().mockImplementation((action) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return {
            remoteFeatureFlags: {
              perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
            },
          };
        }
        // By default, behave as if no blob exists (unauthenticated / 404).
        if (
          action ===
          'AuthenticatedUserStorageService:getNotificationPreferences'
        ) {
          return Promise.resolve(null);
        }
        if (
          action ===
          'AuthenticatedUserStorageService:putNotificationPreferences'
        ) {
          return Promise.resolve(undefined);
        }
        return undefined;
      });

      mockAusInfrastructure = createMockInfrastructure();
      ausController = new TestablePerpsController({
        messenger: createMockMessenger({ call: mockAusCall }),
        state: getDefaultPerpsControllerState(),
        infrastructure: mockAusInfrastructure,
      });
    });

    it('local state updates immediately (optimistic) when AUS returns null blob', async () => {
      // AUS returns null → no remote write, but local state should still change.
      await ausController.toggleWatchlistMarket('BTC');

      expect(ausController.getWatchlistMarkets()).toContain('BTC');
      expect(mockAusCall).toHaveBeenCalledWith(
        'AuthenticatedUserStorageService:getNotificationPreferences',
      );
      expect(mockAusCall).not.toHaveBeenCalledWith(
        'AuthenticatedUserStorageService:putNotificationPreferences',
        expect.anything(),
      );
    });

    it('writes merged watchlist to AUS when a preferences blob exists', async () => {
      const existingPrefs = {
        ...MOCK_PREFS_BASE,
        perps: {
          ...MOCK_PREFS_BASE.perps,
          watchlistMarkets: {
            hyperliquid: { testnet: [], mainnet: [] },
            myx: { testnet: [], mainnet: [] },
          },
        },
      };

      mockAusCall.mockImplementation((action) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }
        if (
          action ===
          'AuthenticatedUserStorageService:getNotificationPreferences'
        ) {
          return Promise.resolve(existingPrefs);
        }
        if (
          action ===
          'AuthenticatedUserStorageService:putNotificationPreferences'
        ) {
          return Promise.resolve(undefined);
        }
        return undefined;
      });

      // Default state is testnet; toggle on testnet.
      ausController.testUpdate((state) => {
        state.isTestnet = true;
        state.activeProvider = 'hyperliquid';
      });

      await ausController.toggleWatchlistMarket('BTC');

      expect(ausController.getWatchlistMarkets()).toContain('BTC');

      // Verify put was called with merged prefs.
      expect(mockAusCall).toHaveBeenCalledWith(
        'AuthenticatedUserStorageService:putNotificationPreferences',
        expect.objectContaining({
          perps: expect.objectContaining({
            watchlistMarkets: expect.objectContaining({
              hyperliquid: expect.objectContaining({
                testnet: expect.arrayContaining(['BTC']),
              }),
            }),
          }),
        }),
      );
    });

    it('reverts local state when AUS PUT fails', async () => {
      const existingPrefs = {
        ...MOCK_PREFS_BASE,
        perps: {
          ...MOCK_PREFS_BASE.perps,
          watchlistMarkets: {
            hyperliquid: { testnet: [], mainnet: [] },
            myx: { testnet: [], mainnet: [] },
          },
        },
      };

      mockAusCall.mockImplementation((action) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }
        if (
          action ===
          'AuthenticatedUserStorageService:getNotificationPreferences'
        ) {
          return Promise.resolve(existingPrefs);
        }
        if (
          action ===
          'AuthenticatedUserStorageService:putNotificationPreferences'
        ) {
          return Promise.reject(new Error('AUS server error'));
        }
        return undefined;
      });

      ausController.testUpdate((state) => {
        state.isTestnet = false;
        state.activeProvider = 'hyperliquid';
      });

      // After toggle, local state should optimistically contain BTC.
      // After PUT fails, it should be reverted.
      await ausController.toggleWatchlistMarket('BTC');

      expect(ausController.getWatchlistMarkets()).not.toContain('BTC');
      expect(mockAusInfrastructure.logger.error).toHaveBeenCalled();
    });

    it('skips AUS sync when activeProvider is aggregated', async () => {
      ausController.testUpdate((state) => {
        state.activeProvider = 'aggregated';
      });

      await ausController.toggleWatchlistMarket('BTC');

      // Local state changes.
      expect(ausController.getWatchlistMarkets()).toContain('BTC');
      // AUS is never contacted.
      expect(mockAusCall).not.toHaveBeenCalledWith(
        'AuthenticatedUserStorageService:getNotificationPreferences',
      );
      expect(mockAusCall).not.toHaveBeenCalledWith(
        'AuthenticatedUserStorageService:putNotificationPreferences',
        expect.anything(),
      );
    });

    it('does not throw when AUS GET throws (unauthenticated)', async () => {
      mockAusCall.mockImplementation((action) => {
        if (action === 'RemoteFeatureFlagController:getState') {
          return { remoteFeatureFlags: {} };
        }
        if (
          action ===
          'AuthenticatedUserStorageService:getNotificationPreferences'
        ) {
          return Promise.reject(new Error('Unauthenticated'));
        }
        return undefined;
      });

      ausController.testUpdate((state) => {
        state.isTestnet = false;
      });

      // Should not throw — failure is handled internally.
      await expect(
        ausController.toggleWatchlistMarket('BTC'),
      ).resolves.toBeUndefined();

      // Local state is reverted since the AUS path failed.
      expect(ausController.getWatchlistMarkets()).not.toContain('BTC');
    });

    it('tracks analytics event when toggling watchlist market', async () => {
      ausController.testUpdate((state) => {
        state.isTestnet = false;
        state.activeProvider = 'hyperliquid';
      });

      await ausController.toggleWatchlistMarket('ETH');

      expect(
        mockAusInfrastructure.metrics.trackPerpsEvent,
      ).toHaveBeenCalledWith(
        PerpsAnalyticsEvent.UiInteraction,
        expect.objectContaining({
          interaction_type: 'favorite_toggled',
          asset: 'ETH',
        }),
      );
    });

    describe('init hydration from AUS', () => {
      it('hydrates local watchlist from AUS on successful init', async () => {
        const remotePrefs = {
          ...MOCK_PREFS_BASE,
          perps: {
            ...MOCK_PREFS_BASE.perps,
            watchlistMarkets: {
              hyperliquid: {
                testnet: ['BTC', 'ETH'],
                mainnet: ['SOL'],
              },
              myx: { testnet: [], mainnet: [] },
            },
          },
        };

        mockAusCall.mockImplementation((action) => {
          if (action === 'RemoteFeatureFlagController:getState') {
            return {
              remoteFeatureFlags: {
                perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
              },
            };
          }
          if (
            action ===
            'AuthenticatedUserStorageService:getNotificationPreferences'
          ) {
            return Promise.resolve(remotePrefs);
          }
          return undefined;
        });

        ausController.testUpdate((state) => {
          state.activeProvider = 'hyperliquid';
        });

        await ausController.init();

        // Allow the non-blocking #syncWatchlistFromRemote promise to settle.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ausController.state.watchlistMarkets.testnet).toEqual([
          'BTC',
          'ETH',
        ]);
        expect(ausController.state.watchlistMarkets.mainnet).toEqual(['SOL']);
      });

      it('hydrates (clears) local watchlist when remote entry exists with empty arrays', async () => {
        // Remote blob has the hyperliquid key present but both arrays are empty —
        // this represents an intentional clear by another device.  The controller
        // must honor the remote state rather than treating it as "not migrated".
        const remotePrefsEmptyWatchlist = {
          ...MOCK_PREFS_BASE,
          perps: {
            ...MOCK_PREFS_BASE.perps,
            watchlistMarkets: {
              hyperliquid: { testnet: [], mainnet: [] },
              myx: { testnet: [], mainnet: [] },
            },
          },
        };

        mockAusCall.mockImplementation((action) => {
          if (action === 'RemoteFeatureFlagController:getState') {
            return {
              remoteFeatureFlags: {
                perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
              },
            };
          }
          if (
            action ===
            'AuthenticatedUserStorageService:getNotificationPreferences'
          ) {
            return Promise.resolve(remotePrefsEmptyWatchlist);
          }
          return undefined;
        });

        // Local state has stale favorites from before the remote clear.
        const staleState = getDefaultPerpsControllerState();
        staleState.activeProvider = 'hyperliquid';
        staleState.watchlistMarkets.testnet = ['BTC', 'ETH'];
        staleState.watchlistMarkets.mainnet = ['SOL'];

        const clearController = new TestablePerpsController({
          messenger: createMockMessenger({ call: mockAusCall }),
          state: staleState,
          infrastructure: mockAusInfrastructure,
        });

        await clearController.init();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Local state must be cleared to match the remote empty arrays.
        expect(clearController.state.watchlistMarkets.testnet).toEqual([]);
        expect(clearController.state.watchlistMarkets.mainnet).toEqual([]);

        // No migration PUT should be issued — the remote key is present.
        expect(mockAusCall).not.toHaveBeenCalledWith(
          'AuthenticatedUserStorageService:putNotificationPreferences',
          expect.anything(),
        );
      });

      it('performs one-time migration when blob exists but has no watchlist for the active provider', async () => {
        const remotePrefsWithoutWatchlist = { ...MOCK_PREFS_BASE };

        mockAusCall.mockImplementation((action) => {
          if (action === 'RemoteFeatureFlagController:getState') {
            return {
              remoteFeatureFlags: {
                perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
              },
            };
          }
          if (
            action ===
            'AuthenticatedUserStorageService:getNotificationPreferences'
          ) {
            return Promise.resolve(remotePrefsWithoutWatchlist);
          }
          if (
            action ===
            'AuthenticatedUserStorageService:putNotificationPreferences'
          ) {
            return Promise.resolve(undefined);
          }
          return undefined;
        });

        // Local state has some markets saved before AUS was introduced.
        const initialState = getDefaultPerpsControllerState();
        initialState.watchlistMarkets.testnet = ['BTC'];
        initialState.watchlistMarkets.mainnet = ['ETH', 'SOL'];
        initialState.activeProvider = 'hyperliquid';

        const migrationController = new TestablePerpsController({
          messenger: createMockMessenger({ call: mockAusCall }),
          state: initialState,
          infrastructure: mockAusInfrastructure,
        });

        await migrationController.init();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Verify local markets were pushed to AUS.
        expect(mockAusCall).toHaveBeenCalledWith(
          'AuthenticatedUserStorageService:putNotificationPreferences',
          expect.objectContaining({
            perps: expect.objectContaining({
              watchlistMarkets: expect.objectContaining({
                hyperliquid: expect.objectContaining({
                  testnet: ['BTC'],
                  mainnet: ['ETH', 'SOL'],
                }),
              }),
            }),
          }),
        );
      });

      it('skips hydration when AUS blob is null', async () => {
        // AUS returns null — local state is untouched.
        const localState = getDefaultPerpsControllerState();
        localState.watchlistMarkets.mainnet = ['BTC'];
        localState.activeProvider = 'hyperliquid';

        const nullBlobController = new TestablePerpsController({
          messenger: createMockMessenger({ call: mockAusCall }),
          state: localState,
          infrastructure: mockAusInfrastructure,
        });

        await nullBlobController.init();
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Local state unchanged.
        expect(nullBlobController.state.watchlistMarkets.mainnet).toEqual([
          'BTC',
        ]);
        expect(mockAusCall).not.toHaveBeenCalledWith(
          'AuthenticatedUserStorageService:putNotificationPreferences',
          expect.anything(),
        );
      });

      it('does not throw when AUS GET throws during init', async () => {
        mockAusCall.mockImplementation((action) => {
          if (action === 'RemoteFeatureFlagController:getState') {
            return {
              remoteFeatureFlags: {
                perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
              },
            };
          }
          if (
            action ===
            'AuthenticatedUserStorageService:getNotificationPreferences'
          ) {
            return Promise.reject(new Error('Network error'));
          }
          return undefined;
        });

        // init() should still succeed; the watchlist sync error is handled internally.
        await expect(ausController.init()).resolves.toBeUndefined();

        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(mockAusInfrastructure.logger.error).toHaveBeenCalled();
      });
    });
  });

  describe('additional subscriptions', () => {
    it('subscribes to orders', () => {
      const mockUnsubscribe = jest.fn();
      const params = {
        callback: jest.fn(),
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.subscribeToOrders.mockReturnValue(mockUnsubscribe);

      const unsubscribe = controller.subscribeToOrders(params);

      expect(unsubscribe).toBe(mockUnsubscribe);
      expect(mockProvider.subscribeToOrders).toHaveBeenCalledWith(params);
    });

    it('subscribes to account updates', () => {
      const mockUnsubscribe = jest.fn();
      const params = {
        callback: jest.fn(),
      };

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.subscribeToAccount.mockReturnValue(mockUnsubscribe);

      const unsubscribe = controller.subscribeToAccount(params);

      expect(unsubscribe).toBe(mockUnsubscribe);
      // Controller wraps callback to update state, so expect a function rather than exact params
      expect(mockProvider.subscribeToAccount).toHaveBeenCalledWith(
        expect.objectContaining({ callback: expect.any(Function) }),
      );
    });

    it('updates accountState when subscribeToAccount callback receives non-null account', () => {
      const originalCallback = jest.fn();
      let wrappedCallback = () => {
        /* assigned by mock */
      };
      mockProvider.subscribeToAccount.mockImplementation((p) => {
        wrappedCallback = p.callback;
        return jest.fn();
      });

      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      controller.subscribeToAccount({ callback: originalCallback });

      const accountState = {
        spendableBalance: '5000',
        withdrawableBalance: '5000',
        totalBalance: '5000',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      };
      wrappedCallback(accountState);

      expect(controller.state.accountState).toMatchObject(accountState);
      expect(originalCallback).toHaveBeenCalledWith(accountState);
    });

    it('returns no-op unsub and does not throw when subscribeToAccount called before init', () => {
      const params = { callback: jest.fn() };

      const unsubscribe = controller.subscribeToAccount(params);

      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
      expect(mockProvider.subscribeToAccount).not.toHaveBeenCalled();
    });
  });
});
