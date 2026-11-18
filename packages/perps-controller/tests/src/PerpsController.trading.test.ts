/* eslint-disable */
/**
 * PerpsController Tests
 * Clean, focused test suite for PerpsController
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockedClass } from 'vitest';

import { createMockHyperLiquidProvider } from '../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));

import {
  CHASE_ORDER_CONFIG,
  TWAP_ORDER_CONFIG,
} from '../../src/constants/perpsConfig.js';
import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
} from '../../src/PerpsController.js';
import type { PerpsControllerState } from '../../src/PerpsController.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import * as accountServiceModule from '../../src/services/AccountService.js';
import * as dataLakeServiceModule from '../../src/services/DataLakeService.js';
import * as depositServiceModule from '../../src/services/DepositService.js';
import * as eligibilityServiceModule from '../../src/services/EligibilityService.js';
import * as featureFlagConfigurationServiceModule from '../../src/services/FeatureFlagConfigurationService.js';
import * as marketDataServiceModule from '../../src/services/MarketDataService.js';
import * as tradingServiceModule from '../../src/services/TradingService.js';
import type {
  CancelOrderResult,
  ChaseOrder,
  ChaseOrderLists,
  PerpsProvider,
  PerpsPlatformDependencies,
  PerpsProviderType,
  SubscribeTwapOrdersParams,
  TwapOrder,
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
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  let selectedAddress: string;

  // Helper to mark controller as initialized for tests
  const markControllerAsInitialized = () => {
    controller.testMarkInitialized();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    selectedAddress = '0x1234567890123456789012345678901234567890';

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
    mockProvider.getTwapOrders.mockResolvedValue([]);
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
            address: selectedAddress,
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
    mockMessenger = createMockMessenger({ call: mockCall });
    controller = new TestablePerpsController({
      messenger: mockMessenger,
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
      vi.spyOn(mockMarketDataServiceInstance, 'getPositions').mockResolvedValue(
        mockPositions,
      );

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
      vi.spyOn(mockMarketDataServiceInstance, 'getPositions').mockRejectedValue(
        new Error(errorMessage),
      );

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
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getAccountState',
      ).mockResolvedValue(mockAccountState);

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
      vi.spyOn(mockTradingServiceInstance, 'placeOrder').mockResolvedValue(
        mockOrderResult,
      );

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
      vi.spyOn(mockTradingServiceInstance, 'placeOrder').mockRejectedValue(
        new Error(errorMessage),
      );

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
      vi.spyOn(mockMarketDataServiceInstance, 'getMarkets').mockResolvedValue(
        mockMarkets,
      );

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
      vi.spyOn(mockTradingServiceInstance, 'cancelOrder').mockResolvedValue(
        mockCancelResult,
      );

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

  describe('Strategy lifecycle', () => {
    const twapOrder: TwapOrder = {
      orderId: '987',
      symbol: 'ETH',
      side: 'buy',
      size: '1',
      executedSize: '0.4',
      remainingSize: '0.6',
      executedNotional: '1200',
      averagePrice: '3000',
      fillProgressBps: 4000,
      timeProgressBps: 5000,
      elapsedTimeMilliseconds: 300_000,
      durationMinutes: 10,
      randomize: true,
      reduceOnly: false,
      status: 'active',
      startedAt: 1,
      lastUpdated: 2,
      fills: [],
    };

    const chaseOrder = {
      handle: 'chase-1',
      symbol: 'ETH',
      side: 'buy' as const,
      originalSize: '1',
      remainingSize: '1',
      arrivalPrice: '2999.1',
      restingPrice: '2999.1',
      restingOrderId: '55',
      distanceChasedBps: 0,
      repricings: 0,
      startedAt: 1,
      status: 'active' as const,
    };

    it('reads Chase lifecycle state from the active provider', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getChaseOrders.mockResolvedValue([chaseOrder]);

      await expect(controller.getChaseOrders()).resolves.toStrictEqual([
        chaseOrder,
      ]);
    });

    it('reads TWAP lifecycle state from the active provider', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      mockProvider.getTwapOrders.mockResolvedValue([twapOrder]);

      expect(await controller.getTwapOrders()).toStrictEqual([twapOrder]);
    });

    it('keeps a live TWAP list from the provider stream and reads, with totals from fills', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        const sliceFill = {
          fillId: 'f1',
          orderId: 's1',
          side: 'buy' as const,
          price: '3000',
          size: '0.5',
          fee: '0',
          feeToken: 'USDC',
          timestamp: 3,
          transactionHash: '0x1',
        };
        mockProvider.getTwapOrders.mockResolvedValue([
          { ...twapOrder, fills: [sliceFill] },
        ]);
        const stopStream = vi.fn();
        mockProvider.subscribeToTwapOrders = vi.fn(() => stopStream);
        const callback = vi.fn();

        const stop = controller.subscribeToLiveTwapOrders({ callback });
        await vi.advanceTimersByTimeAsync(0);
        stop();

        expect(mockProvider.subscribeToTwapOrders).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith([
          expect.objectContaining({
            orderId: twapOrder.orderId,
            executedSize: '0.5',
            averagePrice: '3000',
          }),
        ]);
        expect(stopStream).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      [
        'account',
        (): void => {
          selectedAddress = '0x2222222222222222222222222222222222222222';
        },
      ],
      [
        'provider',
        (): void =>
          controller.testUpdate((state) => {
            state.activeProvider = 'lighter';
          }),
      ],
      [
        'network',
        (): void =>
          controller.testUpdate((state) => {
            state.isTestnet = true;
          }),
      ],
    ])(
      'reopens the live TWAP stream after a %s switch and ignores the old one',
      async (_switch, switchContext) => {
        vi.useFakeTimers();
        try {
          markControllerAsInitialized();
          controller.testSetProviders(
            new Map([
              ['hyperliquid', mockProvider],
              ['lighter', mockProvider],
            ]),
          );
          mockProvider.getTwapOrders.mockResolvedValue([]);
          const streams: {
            callback: SubscribeTwapOrdersParams['callback'];
            stop: Mock<() => void>;
          }[] = [];
          mockProvider.subscribeToTwapOrders = vi.fn(
            (streamParams: SubscribeTwapOrdersParams) => {
              const stop = vi.fn();
              streams.push({ callback: streamParams.callback, stop });
              return stop;
            },
          );
          const callback = vi.fn();

          const stop = controller.subscribeToLiveTwapOrders({ callback });
          await vi.advanceTimersByTimeAsync(0);
          switchContext();
          mockMessenger.subscribe.mock.calls
            .filter(([event]) =>
              [
                'PerpsController:stateChanged',
                'AccountsController:selectedAccountChange',
              ].includes(event),
            )
            .forEach(([, handler]) => (handler as () => void)());
          await vi.advanceTimersByTimeAsync(0);

          expect(streams).toHaveLength(2);
          expect(streams[0].stop).toHaveBeenCalledTimes(1);

          // The old stream pushes after the switch; the new context's read is
          // empty, then its own stream reports a new TWAP.
          streams[0].callback([{ ...twapOrder, orderId: 'old' }]);
          await vi.advanceTimersByTimeAsync(
            TWAP_ORDER_CONFIG.RefreshIntervalMs,
          );
          streams[1].callback([{ ...twapOrder, orderId: 'new' }]);
          stop();

          expect(callback).not.toHaveBeenCalledWith([
            expect.objectContaining({ orderId: 'old' }),
          ]);
          expect(callback).toHaveBeenLastCalledWith([
            expect.objectContaining({ orderId: 'new' }),
          ]);
          expect(streams[1].stop).toHaveBeenCalledTimes(1);
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it('opens the live TWAP stream only once the provider is ready, and again after a reconnect', async () => {
      vi.useFakeTimers();
      try {
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getTwapOrders.mockResolvedValue([]);
        const streams: SubscribeTwapOrdersParams['callback'][] = [];
        const stopStream = vi.fn();
        mockProvider.subscribeToTwapOrders = vi.fn(
          (streamParams: SubscribeTwapOrdersParams) => {
            streams.push(streamParams.callback);
            return stopStream;
          },
        );
        const fireStateChanged = (): void =>
          mockMessenger.subscribe.mock.calls
            .filter(([event]) => event === 'PerpsController:stateChanged')
            .forEach(([, handler]) => (handler as () => void)());
        const callback = vi.fn();

        // Subscribed before the provider is ready: no stream yet.
        const stop = controller.subscribeToLiveTwapOrders({ callback });
        await vi.advanceTimersByTimeAsync(0);

        expect(mockProvider.subscribeToTwapOrders).not.toHaveBeenCalled();

        markControllerAsInitialized();
        fireStateChanged();
        await vi.advanceTimersByTimeAsync(0);

        expect(streams).toHaveLength(1);

        // A client reconnect in the same context tears the stream down.
        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Initializing;
        });
        fireStateChanged();
        markControllerAsInitialized();
        fireStateChanged();
        await vi.advanceTimersByTimeAsync(0);

        expect(streams).toHaveLength(2);
        expect(stopStream).toHaveBeenCalledTimes(1);

        streams[1]([{ ...twapOrder, orderId: 'after-reconnect' }]);
        stop();

        expect(callback).toHaveBeenLastCalledWith([
          expect.objectContaining({ orderId: 'after-reconnect' }),
        ]);
        expect(stopStream).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('opens one live TWAP stream when initialization ends while an open is pending', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getTwapOrders.mockResolvedValue([]);
        mockProvider.subscribeToTwapOrders = vi.fn(() => vi.fn());
        const fireStateChanged = (): void =>
          mockMessenger.subscribe.mock.calls
            .filter(([event]) => event === 'PerpsController:stateChanged')
            .forEach(([, handler]) => (handler as () => void)());

        const stop = controller.subscribeToLiveTwapOrders({
          callback: vi.fn(),
        });
        // A reconnect finishes before the first open resolves.
        controller.testUpdate((state) => {
          state.initializationState = InitializationState.Initializing;
        });
        fireStateChanged();
        markControllerAsInitialized();
        fireStateChanged();
        await vi.advanceTimersByTimeAsync(0);
        stop();

        expect(mockProvider.subscribeToTwapOrders).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('closes a live TWAP stream whose synchronous first push stopped the list', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getTwapOrders.mockResolvedValue([]);
        const stopStream = vi.fn();
        mockProvider.subscribeToTwapOrders = vi.fn(
          (streamParams: SubscribeTwapOrdersParams) => {
            // The venue replays cached schedules before returning.
            streamParams.callback([twapOrder]);
            return stopStream;
          },
        );
        let stop: (() => void) | undefined;
        const callback = vi.fn(() => stop?.());

        stop = controller.subscribeToLiveTwapOrders({ callback });
        await vi.advanceTimersByTimeAsync(0);

        expect(callback).toHaveBeenCalledWith([
          expect.objectContaining({ orderId: twapOrder.orderId }),
        ]);
        expect(stopStream).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not open a live TWAP stream closed before it opened', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getTwapOrders.mockResolvedValue([]);
        mockProvider.subscribeToTwapOrders = vi.fn(() => vi.fn());

        const stop = controller.subscribeToLiveTwapOrders({
          callback: vi.fn(),
        });
        stop();
        await vi.advanceTimersByTimeAsync(0);

        expect(mockProvider.subscribeToTwapOrders).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps a cancel successful when a Chase list listener throws', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getChaseOrders.mockResolvedValue([chaseOrder]);
        const canceled: CancelOrderResult = {
          success: true,
          orderId: chaseOrder.handle,
          chaseOrder: {
            ...chaseOrder,
            status: 'canceled' as const,
            restingOrderId: null,
          },
        };
        vi.spyOn(mockTradingServiceInstance, 'cancelOrder').mockResolvedValue(
          canceled,
        );
        const throwing = vi.fn((lists: ChaseOrderLists) => {
          if (lists.history.length > 0) {
            throw new Error('render failed');
          }
        });
        const second = vi.fn();
        const stopFirst = controller.subscribeToChaseOrderLists({
          callback: throwing,
        });
        const stopSecond = controller.subscribeToChaseOrderLists({
          callback: second,
        });
        await vi.advanceTimersByTimeAsync(0);

        const result = await controller.cancelOrder({
          orderId: chaseOrder.handle,
          symbol: chaseOrder.symbol,
          orderType: 'chase',
        });
        stopFirst();
        stopSecond();

        expect(result).toStrictEqual(canceled);
        expect(mockInfrastructure.logger.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'render failed' }),
          expect.anything(),
        );
        expect(throwing).toHaveBeenLastCalledWith({
          running: [],
          history: [canceled.chaseOrder],
        });
        expect(second).toHaveBeenLastCalledWith({
          running: [],
          history: [canceled.chaseOrder],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps running and history Chase lists from the active provider', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        const ended = {
          ...chaseOrder,
          handle: 'chase-2',
          status: 'filled' as const,
        };
        mockProvider.getChaseOrders.mockResolvedValue([chaseOrder, ended]);
        const callback = vi.fn();

        const stop = controller.subscribeToChaseOrderLists({ callback });
        await vi.advanceTimersByTimeAsync(0);
        stop();

        expect(callback).toHaveBeenCalledWith({
          running: [chaseOrder],
          history: [ended],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps a Chase canceled through the controller after the provider drops it', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        // The provider deletes a chase session once its cancel succeeds.
        mockProvider.getChaseOrders
          .mockResolvedValueOnce([chaseOrder])
          .mockResolvedValue([]);
        // The provider reports how the chase ended with the cancel result.
        const canceledChase = {
          ...chaseOrder,
          status: 'canceled' as const,
          restingOrderId: null,
        };
        vi.spyOn(mockTradingServiceInstance, 'cancelOrder').mockResolvedValue({
          success: true,
          orderId: chaseOrder.handle,
          chaseOrder: canceledChase,
        });
        const callback = vi.fn();

        const stop = controller.subscribeToChaseOrderLists({ callback });
        await vi.advanceTimersByTimeAsync(0);
        await controller.cancelOrder({
          orderId: chaseOrder.handle,
          symbol: chaseOrder.symbol,
          orderType: 'chase',
        });
        await vi.advanceTimersByTimeAsync(
          CHASE_ORDER_CONFIG.RefreshIntervalMs * 3,
        );
        stop();

        expect(callback).toHaveBeenLastCalledWith({
          running: [],
          history: [canceledChase],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps a Chase ended by cancelling its child order ID', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getChaseOrders
          .mockResolvedValueOnce([chaseOrder])
          .mockResolvedValue([]);
        const canceledChase = {
          ...chaseOrder,
          status: 'canceled' as const,
          restingOrderId: null,
        };
        // The provider resolves the child to its chase and echoes the child ID.
        vi.spyOn(mockTradingServiceInstance, 'cancelOrder').mockResolvedValue({
          success: true,
          orderId: '55',
          chaseOrder: canceledChase,
        });
        const callback = vi.fn();

        const stop = controller.subscribeToChaseOrderLists({ callback });
        await vi.advanceTimersByTimeAsync(0);
        await controller.cancelOrder({ orderId: '55', symbol: 'ETH' });
        await vi.advanceTimersByTimeAsync(
          CHASE_ORDER_CONFIG.RefreshIntervalMs * 3,
        );
        stop();

        expect(callback).toHaveBeenLastCalledWith({
          running: [],
          history: [canceledChase],
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves a Chase to its reads when the cancel reports no ending', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getChaseOrders
          .mockResolvedValueOnce([chaseOrder])
          .mockResolvedValue([]);
        vi.spyOn(mockTradingServiceInstance, 'cancelOrder').mockResolvedValue({
          success: true,
          orderId: chaseOrder.handle,
        });
        const callback = vi.fn();

        const stop = controller.subscribeToChaseOrderLists({ callback });
        await vi.advanceTimersByTimeAsync(0);
        await controller.cancelOrder({
          orderId: chaseOrder.handle,
          symbol: chaseOrder.symbol,
          orderType: 'chase',
        });
        await vi.advanceTimersByTimeAsync(
          CHASE_ORDER_CONFIG.RefreshIntervalMs * 3,
        );
        stop();

        // Success alone does not prove canceled, so nothing is invented.
        expect(callback).not.toHaveBeenCalledWith(
          expect.objectContaining({
            history: [expect.objectContaining({ status: 'canceled' })],
          }),
        );
        expect(callback).toHaveBeenLastCalledWith({ running: [], history: [] });
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      [
        'account',
        (): void => {
          selectedAddress = '0x2222222222222222222222222222222222222222';
        },
      ],
      [
        'provider',
        (): void =>
          controller.testUpdate((state) => {
            state.activeProvider = 'lighter';
          }),
      ],
      [
        'network',
        (): void =>
          controller.testUpdate((state) => {
            state.isTestnet = true;
          }),
      ],
    ])(
      'keeps a Chase ending out of the lists after a %s switch mid-cancel',
      async (_switch, switchContext) => {
        vi.useFakeTimers();
        try {
          markControllerAsInitialized();
          controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
          mockProvider.getChaseOrders.mockResolvedValue([]);
          const canceled: CancelOrderResult = {
            success: true,
            orderId: chaseOrder.handle,
            chaseOrder: {
              ...chaseOrder,
              status: 'canceled' as const,
              restingOrderId: null,
            },
          };
          let finishCancel: ((result: CancelOrderResult) => void) | undefined;
          vi.spyOn(
            mockTradingServiceInstance,
            'cancelOrder',
          ).mockImplementation(
            async () =>
              new Promise<CancelOrderResult>((resolve) => {
                finishCancel = resolve;
              }),
          );
          const before = vi.fn();
          const after = vi.fn();

          const stopBefore = controller.subscribeToChaseOrderLists({
            callback: before,
          });
          await vi.advanceTimersByTimeAsync(0);
          const cancel = controller.cancelOrder({
            orderId: chaseOrder.handle,
            symbol: chaseOrder.symbol,
            orderType: 'chase',
          });
          await vi.advanceTimersByTimeAsync(0);
          switchContext();
          mockMessenger.subscribe.mock.calls
            .filter(([event]) =>
              [
                'PerpsController:stateChanged',
                'AccountsController:selectedAccountChange',
                'AccountTreeController:selectedAccountGroupChange',
              ].includes(event),
            )
            .forEach(([, handler]) => (handler as () => void)());
          const stopAfter = controller.subscribeToChaseOrderLists({
            callback: after,
          });
          await vi.advanceTimersByTimeAsync(0);
          finishCancel?.(canceled);
          const result = await cancel;
          await vi.advanceTimersByTimeAsync(
            CHASE_ORDER_CONFIG.RefreshIntervalMs * 2,
          );
          stopBefore();
          stopAfter();

          // The caller still learns the cancel succeeded.
          expect(result).toStrictEqual(canceled);
          expect([
            ...before.mock.calls,
            ...after.mock.calls,
          ]).not.toContainEqual([
            expect.objectContaining({ history: [canceled.chaseOrder] }),
          ]);
          expect(after).toHaveBeenCalledWith({ running: [], history: [] });
        } finally {
          vi.useRealTimers();
        }
      },
    );

    it('clears the Chase lists at once when the network changes during a read', async () => {
      vi.useFakeTimers();
      try {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        mockProvider.getChaseOrders
          .mockResolvedValueOnce([chaseOrder])
          .mockImplementation(
            async () => new Promise<ChaseOrder[]>(() => undefined),
          );
        const callback = vi.fn();

        const stop = controller.subscribeToChaseOrderLists({ callback });
        await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs);
        // The second read is still pending when the network switches.
        controller.testUpdate((state) => {
          state.isTestnet = true;
        });
        mockMessenger.subscribe.mock.calls
          .filter(([event]) => event === 'PerpsController:stateChanged')
          .forEach(([, handler]) => (handler as () => void)());
        stop();

        expect(mockProvider.getChaseOrders).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenLastCalledWith({ running: [], history: [] });
      } finally {
        vi.useRealTimers();
      }
    });

    it('suspends Chase loops through the active provider', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      const backgrounded = { ...chaseOrder, status: 'backgrounded' as const };
      mockProvider.suspendChaseOrders.mockResolvedValue([backgrounded]);

      await expect(controller.suspendChaseOrders()).resolves.toStrictEqual([
        backgrounded,
      ]);
    });
  });

  describe('cancelOrders', () => {
    it('delegates to TradingService with withStreamPause callback', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));

      const mockImplementation = vi.fn(async (options: any) => {
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

      vi.spyOn(mockTradingServiceInstance, 'cancelOrders').mockImplementation(
        mockImplementation,
      );

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

      const mockImplementation = vi.fn(async (options: any) =>
        // Simulate TradingService calling the withStreamPause callback with an error
        options.withStreamPause(async () => {
          throw new Error('Network error');
        }, ['orders']),
      );

      vi.spyOn(mockTradingServiceInstance, 'cancelOrders').mockImplementation(
        mockImplementation,
      );

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

  describe('batch result status', () => {
    const batch = (successCount: number, failureCount: number) => ({
      success: successCount > 0,
      successCount,
      failureCount,
      results: [],
    });

    it.each([
      ['all', 2, 0],
      ['partial', 1, 1],
      ['none', 0, 2],
      ['none', 0, 0],
    ] as const)(
      'reports %s from cancelOrders with %i cancelled and %i failed',
      async (status, successCount, failureCount) => {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        vi.spyOn(mockTradingServiceInstance, 'cancelOrders').mockResolvedValue(
          batch(successCount, failureCount),
        );

        const result = await controller.cancelOrders({ cancelAll: true });

        expect(result.status).toBe(status);
      },
    );

    it.each([
      ['all', 2, 0],
      ['partial', 1, 1],
      ['none', 0, 2],
    ] as const)(
      'reports %s from closePositions with %i closed and %i failed',
      async (status, successCount, failureCount) => {
        markControllerAsInitialized();
        controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
        vi.spyOn(
          mockTradingServiceInstance,
          'closePositions',
        ).mockResolvedValue(batch(successCount, failureCount));

        const result = await controller.closePositions({ closeAll: true });

        expect(result.status).toBe(status);
      },
    );

    it('keeps success true on a partial close, so status is what separates it', async () => {
      markControllerAsInitialized();
      controller.testSetProviders(new Map([['hyperliquid', mockProvider]]));
      vi.spyOn(mockTradingServiceInstance, 'closePositions').mockResolvedValue(
        batch(1, 1),
      );

      const result = await controller.closePositions({ closeAll: true });

      expect(result).toMatchObject({ success: true, status: 'partial' });
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
      vi.spyOn(mockTradingServiceInstance, 'closePosition').mockResolvedValue(
        mockCloseResult,
      );

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

      vi.spyOn(mockTradingServiceInstance, 'closePositions').mockResolvedValue({
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
      vi.spyOn(
        mockMarketDataServiceInstance,
        'validateOrder',
      ).mockResolvedValue(mockValidationResult);

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
      vi.spyOn(
        mockMarketDataServiceInstance,
        'getOrderFills',
      ).mockResolvedValue(mockOrderFills);

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
      vi.spyOn(mockMarketDataServiceInstance, 'getOrders').mockResolvedValue(
        mockOrders,
      );

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
      const mockUnsubscribe = vi.fn();
      const params = {
        symbols: ['BTC', 'ETH'],
        callback: vi.fn(),
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
