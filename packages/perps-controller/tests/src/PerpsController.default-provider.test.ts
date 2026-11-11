/* eslint-disable */
/**
 * PerpsController default-provider tests (TAT-4394).
 *
 * Covers the save-default-provider scope:
 * - AC1: changing the default provider does not re-initialize or reconnect
 * - AC2: aggregated-mode writes without a venue are refused and never reach a
 *   provider
 * - AC3: leverage and margin mode are stored and read per provider and symbol,
 *   and legacy state migrates
 * - AC4: no behaviour change for clients that don't use aggregated mode
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockedClass } from 'vitest';

import { createMockHyperLiquidProvider } from '../helpers/providerMocks.js';
import {
  createDeferred,
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));

import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
} from '../../src/PerpsController.js';
import type { PerpsControllerState } from '../../src/PerpsController.js';
import { PERPS_ERROR_CODES } from '../../src/perpsErrorCodes.js';
import { AggregatedPerpsProvider } from '../../src/providers/AggregatedPerpsProvider.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import {
  selectTradeConfiguration,
  selectPendingTradeConfiguration,
  selectOrderBookGrouping,
  selectMarginMode,
} from '../../src/selectors.js';
import type {
  AccountState,
  PerpsProvider,
  PerpsProviderType,
} from '../../src/types/index.js';

vi.mock('../../src/providers/HyperLiquidProvider');

const mockAddTransaction = vi.fn();
vi.mock('../../../util/transaction-controller', () => ({
  addTransaction: (...args: unknown[]) => mockAddTransaction(...args),
}));

vi.mock('../../src/utils/wait', () => ({
  wait: vi.fn().mockResolvedValue(undefined),
}));

import { wait as mockWait } from '../../src/utils/wait.js';

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

const mockEligibilityServiceInstance = {
  checkEligibility: vi.fn().mockResolvedValue(true),
};
vi.mock('../../src/services/EligibilityService', () => ({
  EligibilityService: vi.fn().mockImplementation(function () {
    return mockEligibilityServiceInstance;
  }),
}));

const mockDepositServiceInstance = {
  prepareTransaction: vi.fn(),
};
vi.mock('../../src/services/DepositService', () => ({
  DepositService: vi.fn().mockImplementation(function () {
    return mockDepositServiceInstance;
  }),
}));

const mockMarketDataServiceInstance = {
  getPositions: vi.fn().mockResolvedValue([]),
  getAccountState: vi.fn().mockResolvedValue({
    spendableBalance: '10000',
    withdrawableBalance: '10000',
    totalBalance: '10000',
    marginUsed: '0',
    unrealizedPnl: '0',
    returnOnEquity: '0',
  }),
  getMarkets: vi.fn().mockResolvedValue([]),
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

const mockTradingServiceInstance = {
  placeOrder: vi.fn().mockResolvedValue({ success: true }),
  editOrder: vi.fn(),
  cancelOrder: vi.fn(),
  cancelOrders: vi.fn(),
  closePosition: vi.fn(),
  closePositions: vi.fn(),
  updatePositionTPSL: vi.fn(),
  replacePositionTPSLLeg: vi.fn(),
  updateMargin: vi.fn(),
  flipPosition: vi.fn(),
  setControllerDependencies: vi.fn(),
};
vi.mock('../../src/services/TradingService', () => ({
  TradingService: vi.fn().mockImplementation(function () {
    return mockTradingServiceInstance;
  }),
}));

const mockAccountServiceInstance = {
  withdraw: vi.fn(),
  validateWithdrawal: vi.fn(),
};
vi.mock('../../src/services/AccountService', () => ({
  AccountService: vi.fn().mockImplementation(function () {
    return mockAccountServiceInstance;
  }),
}));

const mockDataLakeServiceInstance = {
  reportOrder: vi.fn(),
};
vi.mock('../../src/services/DataLakeService', () => ({
  DataLakeService: vi.fn().mockImplementation(function () {
    return mockDataLakeServiceInstance;
  }),
}));

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

    // Also refresh HIP-3 config if remote flags are available
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

import * as accountServiceModule from '../../src/services/AccountService.js';
import * as dataLakeServiceModule from '../../src/services/DataLakeService.js';
import * as depositServiceModule from '../../src/services/DepositService.js';
import * as eligibilityServiceModule from '../../src/services/EligibilityService.js';
import * as featureFlagConfigurationServiceModule from '../../src/services/FeatureFlagConfigurationService.js';
import * as marketDataServiceModule from '../../src/services/MarketDataService.js';
import * as tradingServiceModule from '../../src/services/TradingService.js';

/**
 * Testable version of PerpsController that exposes protected members.
 */
class TestablePerpsController extends PerpsController {
  public testUpdate(callback: (state: PerpsControllerState) => void) {
    this.update(callback);
  }

  public testMarkInitialized() {
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }

  public testSetProviders(providers: Map<PerpsProviderType, PerpsProvider>) {
    this.providers = providers;
  }

  public testSetActiveProvider(provider: PerpsProvider) {
    this.activeProviderInstance = provider;
  }
}

describe('PerpsController default provider', () => {
  let controller: TestablePerpsController;
  let mockProvider: Mocked<HyperLiquidProvider>;
  let mockInfrastructure: ReturnType<typeof createMockInfrastructure>;
  let mockMessenger: ReturnType<typeof createMockMessenger>;
  let lighterProvider: PerpsProvider;
  let aggregatedProvider: AggregatedPerpsProvider;
  let loadLighterProvider: Mock;

  const remoteFeatureFlags: Record<string, unknown> = {
    perpsPerpTradingGeoBlockedCountriesV2: { blockedRegions: [] },
  };

  /**
   * Put the controller into initialized aggregated mode with both venues
   * registered and the aggregated wrapper as the active provider instance.
   */
  const setupAggregatedMode = (defaultProvider: PerpsProviderType) => {
    aggregatedProvider = new AggregatedPerpsProvider({
      providers: new Map<PerpsProviderType, PerpsProvider>([
        ['hyperliquid', mockProvider],
        ['lighter', lighterProvider],
      ]),
      defaultProvider,
      infrastructure: mockInfrastructure as any,
    });
    controller.testMarkInitialized();
    controller.testUpdate((state) => {
      state.activeProvider = 'aggregated';
      state.defaultProvider = defaultProvider;
      state.effectiveProvider = defaultProvider;
    });
    controller.testSetProviders(
      new Map<PerpsProviderType, PerpsProvider>([
        ['hyperliquid', mockProvider],
        ['lighter', lighterProvider],
      ]),
    );
    controller.testSetActiveProvider(aggregatedProvider);
  };

  const createController = (
    state: Partial<PerpsControllerState> = {},
    withLighter = false,
  ) => {
    const mockCall = vi.fn().mockImplementation((action: string) => {
      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags };
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

    mockMessenger = createMockMessenger({ call: mockCall });
    loadLighterProvider = vi.fn(async () => ({
      LighterProvider: function () {
        return lighterProvider;
      } as any,
    }));
    controller = new TestablePerpsController({
      messenger: mockMessenger,
      state,
      clientConfig: withLighter
        ? {
            providerCredentials: {
              lighter: {
                enabled: true,
                loadProvider: loadLighterProvider,
              },
            },
          }
        : {},
      infrastructure: mockInfrastructure,
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete remoteFeatureFlags.perpsMultiProviderModeEnabled;

    // The shared vitest config resets all mocks before each test, so the
    // service constructor mocks must be re-applied here.
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
    mockTradingServiceInstance.placeOrder.mockResolvedValue({
      success: true,
    });
    mockProvider = createMockHyperLiquidProvider();
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
    mockProvider.getWithdrawalRoutes.mockReturnValue([]);
    mockProvider.getOrderCapabilities.mockResolvedValue({
      status: 'ready',
      providerId: 'hyperliquid',
      supportedStrategies: ['twap', 'scale', 'chase'],
    });

    (
      HyperLiquidProvider as MockedClass<typeof HyperLiquidProvider>
    ).mockImplementation(function () {
      return mockProvider;
    });

    lighterProvider = {
      ...createMockHyperLiquidProvider(),
      protocolId: 'lighter',
    } as unknown as PerpsProvider;
    (lighterProvider as any).getOrderCapabilities = vi.fn().mockResolvedValue({
      status: 'ready',
      providerId: 'lighter',
      supportedStrategies: [],
    });
    (lighterProvider as any).placeOrder = vi.fn().mockResolvedValue({
      success: true,
      orderId: 'lighter-1',
    });
    (lighterProvider as any).updateMargin = vi.fn().mockResolvedValue({
      success: true,
    });

    mockInfrastructure = createMockInfrastructure();
    createController();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('setDefaultProvider', () => {
    it('defaults to hyperliquid in the default state', () => {
      expect(getDefaultPerpsControllerState().defaultProvider).toBe(
        'hyperliquid',
      );
      expect(controller.state.defaultProvider).toBe('hyperliquid');
      expect(controller.state.hasExplicitDefaultProviderSelection).toBe(false);
      expect(
        controller.metadata.hasExplicitDefaultProviderSelection.persist,
      ).toBe(true);
    });

    it('does not restore an effective venue from a snapshot before providers are assigned', () => {
      createController({
        activeProvider: 'aggregated',
        defaultProvider: 'lighter',
        effectiveProvider: 'hyperliquid',
      });

      expect(controller.state.effectiveProvider).toBeNull();
      expect(controller.metadata.effectiveProvider.persist).toBe(false);
      controller.saveOrderBookGrouping('BTC', 1, 'lighter');
      expect(controller.getOrderBookGrouping('BTC')).toBe(1);
      expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(1);
    });

    it.each(['hyperliquid', 'lighter'] as const)(
      'keeps the effective direct %s venue when only the saved default changes',
      async (activeProvider) => {
        createController({ activeProvider }, true);
        await controller.init();
        controller.saveOrderBookGrouping('BTC', 10, 'hyperliquid');
        controller.saveOrderBookGrouping('BTC', 1, 'lighter');

        controller.setDefaultProvider(
          activeProvider === 'lighter' ? 'hyperliquid' : 'lighter',
        );

        expect(controller.state.effectiveProvider).toBe(activeProvider);
        const grouping = activeProvider === 'lighter' ? 1 : 10;
        expect(controller.getOrderBookGrouping('BTC')).toBe(grouping);
        expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(grouping);
      },
    );

    it('publishes the effective default for configuration selectors when the live route changes', () => {
      setupAggregatedMode('hyperliquid');
      controller.saveOrderBookGrouping('BTC', 10, 'hyperliquid');
      controller.saveOrderBookGrouping('BTC', 1, 'lighter');

      controller.setDefaultProvider('lighter');

      expect(controller.state.effectiveProvider).toBe('lighter');
      expect(controller.getOrderBookGrouping('BTC')).toBe(1);
      expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(1);

      controller.setDefaultProvider('hyperliquid');

      expect(controller.state.effectiveProvider).toBe('hyperliquid');
      expect(controller.getOrderBookGrouping('BTC')).toBe(10);
      expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(10);
    });

    it('updates the aggregated default without re-initializing or reconnecting (AC1)', () => {
      setupAggregatedMode('hyperliquid');
      const constructorCallsBefore = (HyperLiquidProvider as Mock).mock.calls
        .length;

      const result = controller.setDefaultProvider('lighter');

      expect(result).toStrictEqual({
        success: true,
        defaultProvider: 'lighter',
      });
      expect(controller.state.defaultProvider).toBe('lighter');
      // No re-initialization: no new provider construction, no disconnect,
      // no reinit state transitions.
      expect((HyperLiquidProvider as Mock).mock.calls.length).toBe(
        constructorCallsBefore,
      );
      expect(mockProvider.disconnect).not.toHaveBeenCalled();
      expect(controller.state.initializationState).toBe(
        InitializationState.Initialized,
      );
      expect(controller.isCurrentlyReinitializing()).toBe(false);
      // The live aggregated wrapper's routing default moved with the state.
      expect(aggregatedProvider.getWriteProviderId()).toBe('lighter');
    });

    it('routes default reads to the new default venue', async () => {
      setupAggregatedMode('hyperliquid');

      controller.setDefaultProvider('lighter');

      const capabilities = await controller.getOrderCapabilities({
        symbol: 'BTC',
      });
      expect(capabilities).toStrictEqual({
        status: 'ready',
        providerId: 'lighter',
        supportedStrategies: [],
      });
      expect((lighterProvider as any).getOrderCapabilities).toHaveBeenCalled();
      expect(mockProvider.getOrderCapabilities).not.toHaveBeenCalled();
    });

    it('moves a live account subscription to the new venue and clears the cached snapshot', () => {
      setupAggregatedMode('hyperliquid');
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      mockProvider.subscribeToAccount.mockReturnValue(hlCleanup);
      (lighterProvider as any).subscribeToAccount.mockReturnValue(
        lighterCleanup,
      );
      const callback = vi.fn();
      const accountState = (totalBalance: string) => ({
        spendableBalance: totalBalance,
        withdrawableBalance: totalBalance,
        totalBalance,
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });

      controller.subscribeToAccount({ callback });
      // HyperLiquid pushes a snapshot; the controller caches it.
      const hlCallback =
        mockProvider.subscribeToAccount.mock.calls[0][0].callback;
      hlCallback(accountState('100'));
      expect(controller.state.accountState?.totalBalance).toBe('100');

      controller.setDefaultProvider('lighter');

      // The previous venue's snapshot is dropped until the new venue answers.
      expect(controller.state.accountState).toBeNull();
      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect((lighterProvider as any).subscribeToAccount).toHaveBeenCalledTimes(
        1,
      );

      const lighterCallback = (lighterProvider as any).subscribeToAccount.mock
        .calls[0][0].callback;
      lighterCallback(accountState('200'));
      expect(controller.state.accountState?.totalBalance).toBe('200');
    });

    it('persists the choice before initialization when no provider is registered yet', () => {
      // Providers map is empty before init.
      const result = controller.setDefaultProvider('lighter');

      expect(result).toStrictEqual({
        success: true,
        defaultProvider: 'lighter',
      });
      expect(controller.state.defaultProvider).toBe('lighter');
    });

    it('clears a fallback snapshot when the saved default becomes routable again', () => {
      setupAggregatedMode('hyperliquid');
      controller.testUpdate((state) => {
        // The live route fell back while the saved Lighter venue was unavailable.
        state.defaultProvider = 'lighter';
        state.accountState = {
          providerId: 'hyperliquid',
          spendableBalance: '100',
          withdrawableBalance: '100',
          totalBalance: '100',
          marginUsed: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
        };
      });

      controller.setDefaultProvider('lighter');

      expect(aggregatedProvider.getWriteProviderId()).toBe('lighter');
      expect(controller.state.accountState).toBeNull();
    });

    it('rejects a provider that is not registered', () => {
      setupAggregatedMode('hyperliquid');
      // Unregister lighter, then try to make it the default.
      controller.testSetProviders(
        new Map<PerpsProviderType, PerpsProvider>([
          ['hyperliquid', mockProvider],
        ]),
      );

      const rejected = controller.setDefaultProvider('lighter');

      expect(rejected).toStrictEqual({
        success: false,
        defaultProvider: 'hyperliquid',
        error: PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE,
      });
      expect(controller.state.defaultProvider).toBe('hyperliquid');
      expect(controller.state.hasExplicitDefaultProviderSelection).toBe(false);
    });
  });

  describe('unavailable saved default', () => {
    it.each([false, true])(
      'uses the live venue for implicit configuration reads, writes and selectors through fallback and recovery (testnet: %s)',
      async (isTestnet) => {
        createController(
          {
            activeProvider: 'aggregated',
            defaultProvider: 'lighter',
            isTestnet,
          },
          true,
        );
        for (const [providerId, leverage, grouping, marginMode, amount] of [
          ['hyperliquid', 10, 10, 'cross', '100'],
          ['lighter', 20, 1, 'isolated', '200'],
        ] as const) {
          controller.saveTradeConfiguration('BTC', leverage, providerId);
          controller.saveOrderBookGrouping('BTC', grouping, providerId);
          controller.saveMarginMode('BTC', marginMode, providerId);
          controller.savePendingTradeConfiguration(
            'BTC',
            { amount },
            providerId,
          );
        }
        loadLighterProvider.mockRejectedValueOnce(
          new Error('Temporary chunk load failure'),
        );
        await controller.init();

        expect(controller.getTradeConfiguration('BTC')).toStrictEqual({
          leverage: 10,
        });
        expect(controller.getOrderBookGrouping('BTC')).toBe(10);
        expect(controller.getMarginMode('BTC')).toBe('cross');
        expect(controller.getPendingTradeConfiguration('BTC')).toStrictEqual({
          amount: '100',
        });
        expect(selectTradeConfiguration(controller.state, 'BTC')).toStrictEqual(
          { leverage: 10 },
        );
        expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(10);
        expect(selectMarginMode(controller.state, 'BTC')).toBe('cross');
        expect(
          selectPendingTradeConfiguration(controller.state, 'BTC'),
        ).toStrictEqual({ amount: '100' });
        expect(
          selectTradeConfiguration(controller.state, 'BTC', 'lighter'),
        ).toStrictEqual({ leverage: 20 });
        expect(
          selectOrderBookGrouping(controller.state, 'BTC', 'lighter'),
        ).toBe(1);
        expect(selectMarginMode(controller.state, 'BTC', 'lighter')).toBe(
          'isolated',
        );
        expect(
          selectPendingTradeConfiguration(controller.state, 'BTC', 'lighter'),
        ).toStrictEqual({ amount: '200' });
        expect(controller.state.effectiveProvider).toBe('hyperliquid');
        expect(controller.state.defaultProvider).toBe('lighter');

        controller.saveTradeConfiguration('BTC', 11);
        controller.saveOrderBookGrouping('BTC', 11);
        controller.saveMarginMode('BTC', 'isolated');
        controller.savePendingTradeConfiguration('BTC', { amount: '110' });
        expect(
          controller.getTradeConfiguration('BTC', 'hyperliquid'),
        ).toStrictEqual({ leverage: 11 });
        expect(controller.getOrderBookGrouping('BTC', 'hyperliquid')).toBe(11);
        expect(controller.getMarginMode('BTC', 'hyperliquid')).toBe('isolated');
        expect(
          controller.getPendingTradeConfiguration('BTC', 'hyperliquid'),
        ).toStrictEqual({ amount: '110' });
        expect(
          controller.getTradeConfiguration('BTC', 'lighter'),
        ).toStrictEqual({ leverage: 20 });
        expect(controller.getOrderBookGrouping('BTC', 'lighter')).toBe(1);
        expect(controller.getMarginMode('BTC', 'lighter')).toBe('isolated');
        expect(
          controller.getPendingTradeConfiguration('BTC', 'lighter'),
        ).toStrictEqual({ amount: '200' });
        controller.clearPendingTradeConfiguration('BTC');
        expect(
          controller.getPendingTradeConfiguration('BTC', 'hyperliquid'),
        ).toBeUndefined();
        expect(
          controller.getPendingTradeConfiguration('BTC', 'lighter'),
        ).toStrictEqual({ amount: '200' });
        controller.savePendingTradeConfiguration('BTC', { amount: '111' });

        await controller.disconnect();
        expect(controller.state.effectiveProvider).toBeNull();
        await controller.init();

        expect(controller.state.effectiveProvider).toBe('lighter');
        expect(controller.state.defaultProvider).toBe('lighter');
        expect(controller.getTradeConfiguration('BTC')).toStrictEqual({
          leverage: 20,
        });
        expect(controller.getOrderBookGrouping('BTC')).toBe(1);
        expect(controller.getMarginMode('BTC')).toBe('isolated');
        expect(controller.getPendingTradeConfiguration('BTC')).toStrictEqual({
          amount: '200',
        });
        expect(selectTradeConfiguration(controller.state, 'BTC')).toStrictEqual(
          { leverage: 20 },
        );
        expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(1);
        expect(selectMarginMode(controller.state, 'BTC')).toBe('isolated');
        expect(
          selectPendingTradeConfiguration(controller.state, 'BTC'),
        ).toStrictEqual({ amount: '200' });
        expect(
          selectTradeConfiguration(controller.state, 'BTC', 'hyperliquid'),
        ).toStrictEqual({ leverage: 11 });

        controller.saveTradeConfiguration('BTC', 21);
        controller.saveOrderBookGrouping('BTC', 2);
        controller.saveMarginMode('BTC', 'cross');
        controller.savePendingTradeConfiguration('BTC', { amount: '210' });
        expect(
          controller.getTradeConfiguration('BTC', 'lighter'),
        ).toStrictEqual({ leverage: 21 });
        expect(controller.getOrderBookGrouping('BTC', 'lighter')).toBe(2);
        expect(controller.getMarginMode('BTC', 'lighter')).toBe('cross');
        expect(
          controller.getPendingTradeConfiguration('BTC', 'lighter'),
        ).toStrictEqual({ amount: '210' });
        expect(
          controller.getTradeConfiguration('BTC', 'hyperliquid'),
        ).toStrictEqual({ leverage: 11 });
        expect(controller.getOrderBookGrouping('BTC', 'hyperliquid')).toBe(11);
        expect(controller.getMarginMode('BTC', 'hyperliquid')).toBe('isolated');
        controller.clearPendingTradeConfiguration('BTC');
        expect(
          controller.getPendingTradeConfiguration('BTC', 'lighter'),
        ).toBeUndefined();
        expect(
          controller.getPendingTradeConfiguration('BTC', 'hyperliquid'),
        ).toStrictEqual({ amount: '111' });
      },
    );

    it('preserves the preference through a temporary Lighter load failure and restores its route on reinitialization', async () => {
      createController(
        { activeProvider: 'aggregated', defaultProvider: 'lighter' },
        true,
      );
      loadLighterProvider.mockRejectedValueOnce(
        new Error('Temporary chunk load failure'),
      );

      await controller.init();

      expect(controller.state.defaultProvider).toBe('lighter');
      expect(
        (
          controller.getActiveProviderOrNull() as AggregatedPerpsProvider
        ).getWriteProviderId(),
      ).toBe('hyperliquid');
      // The failed load is retried during ordinary reinitialization.
      await controller.disconnect();
      await controller.init();

      expect(loadLighterProvider).toHaveBeenCalledTimes(2);
      expect(controller.state.defaultProvider).toBe('lighter');
      expect(
        (
          controller.getActiveProviderOrNull() as AggregatedPerpsProvider
        ).getWriteProviderId(),
      ).toBe('lighter');
    });
  });

  describe('account-state venue guard', () => {
    // The mocked MarketDataService does not write controller state, so this
    // block swaps in the real service for the write path under test.
    afterEach(() => {
      mockMarketDataServiceInstance.getAccountState
        .mockReset()
        .mockResolvedValue({
          spendableBalance: '10000',
          withdrawableBalance: '10000',
          totalBalance: '10000',
          marginUsed: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
        });
    });

    it.each([false, true])(
      'commits direct Lighter responses with a HyperLiquid default (explicit selection: %s)',
      async (hasExplicitProviderSelection) => {
        if (hasExplicitProviderSelection) {
          remoteFeatureFlags.perpsMultiProviderModeEnabled = {
            enabled: true,
            minimumVersion: '1.0.0',
          };
          vi.mocked(
            mockInfrastructure.featureFlags.validateVersionGated,
          ).mockReturnValue(true);
        }
        createController({
          activeProvider: 'lighter',
          hasExplicitProviderSelection,
        });
        controller.testMarkInitialized();
        controller.testSetActiveProvider(lighterProvider);
        const { MarketDataService: RealMarketDataService } =
          await vi.importActual<
            typeof import('../../src/services/MarketDataService.js')
          >('../../src/services/MarketDataService.js');
        const service = new RealMarketDataService(mockInfrastructure as never);
        mockMarketDataServiceInstance.getAccountState.mockImplementation(
          (options: never) => service.getAccountState(options),
        );
        const account: AccountState = {
          providerId: 'lighter',
          spendableBalance: '200',
          withdrawableBalance: '200',
          totalBalance: '200',
          marginUsed: '0',
          unrealizedPnl: '0',
          returnOnEquity: '0',
        };
        (lighterProvider.getAccountState as Mock).mockResolvedValue(account);

        await controller.getAccountState();

        expect(controller.state.defaultProvider).toBe('hyperliquid');
        expect(controller.state.accountState).toStrictEqual(account);
      },
    );

    it('commits fallback balances without overwriting the saved default and rejects them after recovery', async () => {
      createController(
        { activeProvider: 'aggregated', defaultProvider: 'lighter' },
        true,
      );
      loadLighterProvider.mockRejectedValueOnce(
        new Error('Temporary chunk load failure'),
      );
      await controller.init();
      const { MarketDataService: RealMarketDataService } =
        await vi.importActual<
          typeof import('../../src/services/MarketDataService.js')
        >('../../src/services/MarketDataService.js');
      const service = new RealMarketDataService(mockInfrastructure as never);
      mockMarketDataServiceInstance.getAccountState.mockImplementation(
        (options: never) => service.getAccountState(options),
      );
      const account: AccountState = {
        providerId: 'hyperliquid',
        spendableBalance: '100',
        withdrawableBalance: '100',
        totalBalance: '100',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      };
      mockProvider.getAccountState.mockResolvedValue(account);

      await controller.getAccountState();

      expect(controller.state.accountState).toStrictEqual(account);
      expect(controller.state.defaultProvider).toBe('lighter');
      const pendingFallback = createDeferred<AccountState>();
      mockProvider.getAccountState.mockReturnValueOnce(pendingFallback.promise);
      const oldRequest = controller.getAccountState();
      await controller.disconnect();
      await controller.init();
      (lighterProvider.getAccountState as Mock).mockResolvedValue({
        ...account,
        providerId: 'lighter',
        totalBalance: '200',
      });
      await controller.getAccountState();
      expect(controller.state.accountState?.totalBalance).toBe('200');

      pendingFallback.resolve(account);
      await oldRequest;

      expect(controller.state.accountState?.totalBalance).toBe('200');
    });

    it('does not let an old venue balance overwrite the new venue snapshot', async () => {
      setupAggregatedMode('hyperliquid');
      const { MarketDataService: RealMarketDataService } =
        await vi.importActual<
          typeof import('../../src/services/MarketDataService.js')
        >('../../src/services/MarketDataService.js');
      const realMarketDataService = new RealMarketDataService(
        mockInfrastructure as never,
      );
      mockMarketDataServiceInstance.getAccountState.mockImplementation(
        (options: never) => realMarketDataService.getAccountState(options),
      );

      const accountState = (totalBalance: string): AccountState => ({
        spendableBalance: totalBalance,
        withdrawableBalance: totalBalance,
        totalBalance,
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });
      const pendingHyperLiquid = createDeferred<AccountState>();
      mockProvider.getAccountState.mockReturnValueOnce(
        pendingHyperLiquid.promise,
      );
      (lighterProvider as any).getAccountState.mockResolvedValue(
        accountState('200'),
      );

      const oldRequest = controller.getAccountState();
      controller.setDefaultProvider('lighter');

      // The new venue answers first and becomes the current snapshot.
      await controller.getAccountState();
      expect(controller.state.accountState?.totalBalance).toBe('200');

      // The stale HyperLiquid response must not restore the old balance.
      pendingHyperLiquid.resolve(accountState('100'));
      await oldRequest;
      expect(controller.state.accountState?.totalBalance).toBe('200');
    });
  });

  describe('aggregated-mode writes without a venue', () => {
    beforeEach(() => {
      setupAggregatedMode('hyperliquid');
    });

    it.each([
      [
        'placeOrder',
        () =>
          controller.placeOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '1',
            orderType: 'market',
          }),
        'placeOrder',
      ],
      [
        'editOrder',
        () =>
          controller.editOrder({
            orderId: '1',
            newOrder: {
              symbol: 'BTC',
              isBuy: true,
              size: '1',
              orderType: 'market',
            },
          }),
        'editOrder',
      ],
      [
        'cancelOrder',
        () => controller.cancelOrder({ orderId: '1', symbol: 'BTC' }),
        'cancelOrder',
      ],
      [
        'closePosition',
        () => controller.closePosition({ symbol: 'BTC' }),
        'closePosition',
      ],
      [
        'updatePositionTPSL',
        () =>
          controller.updatePositionTPSL({
            symbol: 'BTC',
            takeProfitPrice: '50000',
          }),
        'updatePositionTPSL',
      ],
      [
        'replacePositionTPSLLeg',
        () =>
          controller.replacePositionTPSLLeg({
            symbol: 'BTC',
            leg: 'tp',
            triggerPrice: '50000',
          }),
        'replacePositionTPSLLeg',
      ],
      [
        'updateMargin',
        () => controller.updateMargin({ symbol: 'BTC', amount: '10' }),
        'updateMargin',
      ],
      [
        'flipPosition',
        () =>
          controller.flipPosition({
            symbol: 'BTC',
            position: {
              symbol: 'BTC',
              size: '1',
              entryPrice: '100',
              positionValue: '100',
              unrealizedPnl: '0',
              marginUsed: '10',
              leverage: { type: 'cross', value: 10 },
              liquidationPrice: null,
              maxLeverage: 50,
              returnOnEquity: '0',
              cumulativeFunding: {
                allTime: '0',
                sinceOpen: '0',
                sinceChange: '0',
              },
              takeProfitCount: 0,
              stopLossCount: 0,
              // providerId deliberately omitted
            },
          }),
        'flipPosition',
      ],
    ])(
      'refuses %s without a providerId and never reaches a provider (AC2)',
      async (_name, invoke, serviceMethod) => {
        const result = await invoke();

        expect(result).toStrictEqual({
          success: false,
          error: PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED,
        });
        // Never reached the trading service or any venue.
        expect(
          (mockTradingServiceInstance as any)[serviceMethod],
        ).not.toHaveBeenCalled();
        expect(mockProvider.placeOrder).not.toHaveBeenCalled();
        expect((lighterProvider as any).placeOrder).not.toHaveBeenCalled();
      },
    );

    it('routes a write that names a venue through the aggregator', async () => {
      await controller.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '1',
        orderType: 'market',
        providerId: 'lighter',
      });

      expect(mockTradingServiceInstance.placeOrder).toHaveBeenCalledTimes(1);
      expect(
        mockTradingServiceInstance.placeOrder.mock.calls[0][0].provider,
      ).toBe(aggregatedProvider);
    });
  });

  describe('direct-mode writes are unchanged (AC4)', () => {
    it('still routes writes without a providerId to the active direct provider', async () => {
      controller.testMarkInitialized();
      controller.testSetProviders(
        new Map<PerpsProviderType, PerpsProvider>([
          ['hyperliquid', mockProvider],
        ]),
      );
      controller.testSetActiveProvider(mockProvider);

      await controller.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '1',
        orderType: 'market',
      });

      expect(mockTradingServiceInstance.placeOrder).toHaveBeenCalledTimes(1);
      expect(
        mockTradingServiceInstance.placeOrder.mock.calls[0][0].provider,
      ).toBe(mockProvider);
    });
  });

  describe('configuration routing during reinitialization', () => {
    it.each([
      ['hyperliquid', 'lighter', 'lighter'],
      ['lighter', 'hyperliquid', 'hyperliquid'],
      ['aggregated', 'lighter', 'lighter'],
      ['lighter', 'aggregated', 'hyperliquid'],
    ] as const)(
      'uses the destination configuration while switching from %s to %s',
      async (from, to, destination) => {
        createController(
          { activeProvider: from, defaultProvider: 'hyperliquid' },
          true,
        );
        await controller.init();
        for (const providerId of ['hyperliquid', 'lighter'] as const) {
          const leverage = providerId === 'lighter' ? 20 : 10;
          controller.saveTradeConfiguration('BTC', leverage, providerId);
          controller.saveOrderBookGrouping('BTC', leverage, providerId);
          controller.saveMarginMode(
            'BTC',
            providerId === 'lighter' ? 'isolated' : 'cross',
            providerId,
          );
          controller.savePendingTradeConfiguration(
            'BTC',
            { amount: String(leverage) },
            providerId,
          );
        }
        const disconnectStarted = createDeferred<void>();
        const resumeDisconnect = createDeferred<void>();
        mockProvider.disconnect.mockImplementationOnce(() => {
          disconnectStarted.resolve();
          return resumeDisconnect.promise.then(() => ({ success: true }));
        });
        mockMessenger.publish.mockClear();
        const switching = controller.switchProvider(to);
        await disconnectStarted.promise;

        try {
          const firstDestinationState = mockMessenger.publish.mock.calls.find(
            ([event, state]) =>
              event === 'PerpsController:stateChanged' &&
              (state as PerpsControllerState).activeProvider === to,
          )?.[1] as PerpsControllerState;
          expect(firstDestinationState.effectiveProvider).toBeNull();
          expect(controller.state.activeProvider).toBe(to);
          expect(controller.state.effectiveProvider).toBeNull();
          const leverage = destination === 'lighter' ? 20 : 10;
          const marginMode = destination === 'lighter' ? 'isolated' : 'cross';
          expect(controller.getTradeConfiguration('BTC')).toStrictEqual({
            leverage,
          });
          expect(
            selectTradeConfiguration(controller.state, 'BTC'),
          ).toStrictEqual({ leverage });
          expect(controller.getOrderBookGrouping('BTC')).toBe(leverage);
          expect(selectOrderBookGrouping(firstDestinationState, 'BTC')).toBe(
            leverage,
          );
          expect(controller.getMarginMode('BTC')).toBe(marginMode);
          expect(selectMarginMode(controller.state, 'BTC')).toBe(marginMode);
          expect(controller.getPendingTradeConfiguration('BTC')).toStrictEqual({
            amount: String(leverage),
          });
          expect(
            selectPendingTradeConfiguration(controller.state, 'BTC'),
          ).toStrictEqual({ amount: String(leverage) });

          controller.saveTradeConfiguration('BTC', 30);
          controller.saveOrderBookGrouping('BTC', 30);
          controller.saveMarginMode(
            'BTC',
            marginMode === 'cross' ? 'isolated' : 'cross',
          );
          controller.savePendingTradeConfiguration('BTC', { amount: '30' });
          expect(
            controller.getTradeConfiguration('BTC', destination),
          ).toStrictEqual({ leverage: 30 });
          expect(controller.getOrderBookGrouping('BTC', destination)).toBe(30);
          expect(controller.getMarginMode('BTC', destination)).toBe(
            marginMode === 'cross' ? 'isolated' : 'cross',
          );
          expect(
            controller.getPendingTradeConfiguration('BTC', destination),
          ).toStrictEqual({ amount: '30' });
          controller.clearPendingTradeConfiguration('BTC');
          expect(
            controller.getPendingTradeConfiguration('BTC', destination),
          ).toBeUndefined();
          const previous =
            destination === 'lighter' ? 'hyperliquid' : 'lighter';
          expect(
            controller.getTradeConfiguration('BTC', previous),
          ).toStrictEqual({ leverage: previous === 'lighter' ? 20 : 10 });
          expect(
            controller.getPendingTradeConfiguration('BTC', previous),
          ).toStrictEqual({ amount: previous === 'lighter' ? '20' : '10' });
        } finally {
          resumeDisconnect.resolve();
          await switching;
        }
        expect(controller.state.effectiveProvider).toBe(destination);
        expect(controller.getOrderBookGrouping('BTC')).toBe(30);
      },
    );

    it('uses the rollback destination while a failed switch reconnects the previous provider', async () => {
      createController({}, true);
      await controller.init();
      controller.saveOrderBookGrouping('BTC', 10, 'hyperliquid');
      controller.saveOrderBookGrouping('BTC', 1, 'lighter');
      const rollbackStarted = createDeferred<void>();
      const resumeRollback = createDeferred<void>();
      mockProvider.disconnect
        .mockRejectedValueOnce(new Error('Disconnect failed'))
        .mockRejectedValueOnce(new Error('Disconnect failed'))
        .mockRejectedValueOnce(new Error('Disconnect failed'))
        .mockImplementationOnce(() => {
          rollbackStarted.resolve();
          return resumeRollback.promise.then(() => ({ success: true }));
        });
      const switching = controller.switchProvider('lighter');
      await rollbackStarted.promise;
      try {
        expect(controller.state.activeProvider).toBe('hyperliquid');
        expect(controller.state.effectiveProvider).toBeNull();
        expect(controller.getOrderBookGrouping('BTC')).toBe(10);
        expect(selectOrderBookGrouping(controller.state, 'BTC')).toBe(10);
        controller.saveOrderBookGrouping('BTC', 20);
        expect(controller.getOrderBookGrouping('BTC', 'hyperliquid')).toBe(20);
        expect(controller.getOrderBookGrouping('BTC', 'lighter')).toBe(1);
      } finally {
        resumeRollback.resolve();
        await switching;
      }
      await expect(switching).resolves.toMatchObject({ success: false });
      expect(controller.state.effectiveProvider).toBe('hyperliquid');
    });

    it('leaves no effective route after a failed network reinitialization', async () => {
      createController({}, true);
      await controller.init();
      mockProvider.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      const result = await controller.toggleTestnet();

      expect(result.success).toBe(false);
      expect(controller.state.initializationState).toBe(
        InitializationState.Failed,
      );
      expect(controller.state.effectiveProvider).toBeNull();
    });

    it('does not republish the old aggregated route when a default is saved during a direct switch', async () => {
      createController(
        { activeProvider: 'aggregated', defaultProvider: 'hyperliquid' },
        true,
      );
      await controller.init();
      const oldWrapper =
        controller.getActiveProviderOrNull() as AggregatedPerpsProvider;
      const disconnectStarted = createDeferred<void>();
      const resumeDisconnect = createDeferred<void>();
      mockProvider.disconnect.mockImplementationOnce(() => {
        disconnectStarted.resolve();
        return resumeDisconnect.promise.then(() => ({ success: true }));
      });
      const switching = controller.switchProvider('lighter');
      await disconnectStarted.promise;
      try {
        expect(controller.setDefaultProvider('hyperliquid').success).toBe(true);
        expect(controller.state.effectiveProvider).toBeNull();
        expect(controller.state.defaultProvider).toBe('hyperliquid');
        expect(oldWrapper.getWriteProviderId()).toBe('hyperliquid');
      } finally {
        resumeDisconnect.resolve();
        await switching;
      }
      expect(controller.state.effectiveProvider).toBe('lighter');
    });

    it('clears a fallback route as soon as a network toggle starts and restores the resolved venue afterward', async () => {
      createController(
        { activeProvider: 'aggregated', defaultProvider: 'lighter' },
        true,
      );
      loadLighterProvider.mockRejectedValueOnce(
        new Error('Temporary chunk load failure'),
      );
      await controller.init();
      expect(controller.state.effectiveProvider).toBe('hyperliquid');
      controller.testUpdate((state) => {
        state.tradeConfigurations.testnet = {
          hyperliquid: { BTC: { orderBookGrouping: 10 } },
          lighter: { BTC: { orderBookGrouping: 1 } },
        };
      });
      const disconnectStarted = createDeferred<void>();
      const resumeDisconnect = createDeferred<void>();
      mockProvider.disconnect.mockImplementationOnce(() => {
        disconnectStarted.resolve();
        return resumeDisconnect.promise.then(() => ({ success: true }));
      });
      mockMessenger.publish.mockClear();
      const toggling = controller.toggleTestnet();
      await disconnectStarted.promise;

      try {
        const firstTestnetState = mockMessenger.publish.mock.calls.find(
          ([event, state]) =>
            event === 'PerpsController:stateChanged' &&
            (state as PerpsControllerState).isTestnet,
        )?.[1] as PerpsControllerState;
        expect(firstTestnetState.effectiveProvider).toBeNull();
        expect(controller.state.effectiveProvider).toBeNull();
        expect(selectOrderBookGrouping(firstTestnetState, 'BTC')).toBe(1);
        expect(controller.getOrderBookGrouping('BTC')).toBe(1);
        controller.saveOrderBookGrouping('BTC', 2);
        expect(controller.getOrderBookGrouping('BTC', 'lighter')).toBe(2);
        expect(controller.getOrderBookGrouping('BTC', 'hyperliquid')).toBe(10);
      } finally {
        resumeDisconnect.resolve();
        await toggling;
      }
      expect(controller.state.effectiveProvider).toBe('lighter');
      expect(controller.getOrderBookGrouping('BTC')).toBe(2);
    });
  });

  describe('explicit provider switches with multi-provider mode enabled', () => {
    beforeEach(() => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '1.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(true);
    });

    it('keeps an explicit direct switch across later initialization', async () => {
      createController({ activeProvider: 'aggregated' });

      await controller.init();
      expect(controller.state.activeProvider).toBe('aggregated');

      const result = await controller.switchProvider('hyperliquid');

      expect(result).toStrictEqual({
        success: true,
        providerId: 'hyperliquid',
      });
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.getActiveProviderOrNull()?.protocolId).toBe(
        'hyperliquid',
      );
      expect(controller.state.hasExplicitProviderSelection).toBe(true);

      // A network toggle must not reinterpret the explicit choice as legacy
      // state and migrate it back to aggregated.
      await controller.toggleTestnet();
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.getActiveProviderOrNull()?.protocolId).toBe(
        'hyperliquid',
      );

      // A later disconnect/init cycle must preserve it too.
      await controller.disconnect();
      await controller.init();
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.getActiveProviderOrNull()?.protocolId).toBe(
        'hyperliquid',
      );
    });

    it('records an explicit no-op direct switch as a selection', async () => {
      // Flag off so construction does not migrate the direct state away.
      remoteFeatureFlags.perpsMultiProviderModeEnabled = undefined;
      createController({
        activeProvider: 'hyperliquid',
        hasExplicitProviderSelection: false,
      });
      controller.testMarkInitialized();

      const result = await controller.switchProvider('hyperliquid');

      expect(result).toStrictEqual({
        success: true,
        providerId: 'hyperliquid',
      });
      expect(controller.state.hasExplicitProviderSelection).toBe(true);
    });
  });

  describe('multi-provider kill switch', () => {
    it.each(['hyperliquid', 'lighter'] as const)(
      'restores direct %s mode from a migrated snapshot after the flag is disabled',
      async (activeProvider) => {
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);
        createController({ activeProvider }, true);
        expect(controller.state.activeProvider).toBe('aggregated');
        const persisted = JSON.parse(JSON.stringify(controller.state));
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: false,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(false);

        createController(persisted, true);
        expect(controller.state.activeProvider).toBe(activeProvider);
        expect(controller.state.defaultProvider).toBe(activeProvider);
        expect(controller.state.effectiveProvider).toBeNull();
        expect(controller.state.hasExplicitProviderSelection).toBe(false);
        await controller.init();
        expect(controller.getActiveProviderOrNull()?.protocolId).toBe(
          activeProvider,
        );
        const result = await controller.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '1',
          orderType: 'market',
        });
        expect(result.success).toBe(true);
        expect(
          mockTradingServiceInstance.placeOrder.mock.calls[0][0].provider
            .protocolId,
        ).toBe(activeProvider);

        // An automatic rollback must not become an explicit direct selection.
        await controller.disconnect();
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);
        await controller.init();
        expect(controller.state.activeProvider).toBe('aggregated');
      },
    );

    it('applies a disabled flag arriving after construction, with a safe fallback for an unavailable saved venue', async () => {
      createController(
        { activeProvider: 'aggregated', defaultProvider: 'lighter' },
        true,
      );
      loadLighterProvider.mockRejectedValueOnce(
        new Error('Temporary chunk load failure'),
      );
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: false,
        minimumVersion: '1.0.0',
      };
      // An explicit disable must not depend on version-validator availability.
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(undefined);

      await controller.init();

      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.state.effectiveProvider).toBe('hyperliquid');
      expect(controller.state.defaultProvider).toBe('lighter');
      expect(
        (
          await controller.placeOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '1',
            orderType: 'market',
          })
        ).success,
      ).toBe(true);
    });

    it('does not mistake an unvalidated flag for an explicit disable', async () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '1.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(undefined);
      createController(
        { activeProvider: 'aggregated', defaultProvider: 'lighter' },
        true,
      );

      await controller.init();

      expect(controller.state.activeProvider).toBe('aggregated');
      expect(controller.state.effectiveProvider).toBe('lighter');
    });

    it('uses a validated disabled result when the client does not meet the flag version gate', async () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '999.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(false);
      createController({
        activeProvider: 'aggregated',
        defaultProvider: 'hyperliquid',
      });

      await controller.init();

      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.getActiveProviderOrNull()?.protocolId).toBe(
        'hyperliquid',
      );
    });

    it.each(['hyperliquid', 'lighter'] as const)(
      'rolls back a live aggregated session to %s and lets unrouted writes wait',
      async (activeProvider) => {
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);
        createController({ activeProvider }, true);
        await controller.init();
        expect(controller.state.activeProvider).toBe('aggregated');
        const resumeDisconnect = createDeferred<void>();
        mockProvider.disconnect.mockImplementationOnce(() =>
          resumeDisconnect.promise.then(() => ({ success: true })),
        );
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: false,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(false);
        const onFlagsChanged = mockMessenger.subscribe.mock.calls.find(
          ([event]) => event === 'RemoteFeatureFlagController:stateChange',
        )?.[1] as (state: {
          remoteFeatureFlags: Record<string, unknown>;
        }) => void;
        onFlagsChanged({ remoteFeatureFlags });

        try {
          expect(controller.state.activeProvider).toBe(activeProvider);
          expect(controller.state.effectiveProvider).toBeNull();
          expect(controller.isCurrentlyReinitializing()).toBe(true);
          const write = controller.placeOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '1',
            orderType: 'market',
          });
          resumeDisconnect.resolve();
          await controller.init();
          expect((await write).success).toBe(true);
          expect(
            mockTradingServiceInstance.placeOrder.mock.calls[0][0].provider
              .protocolId,
          ).toBe(activeProvider);
          expect(controller.state.hasExplicitProviderSelection).toBe(false);
          expect(controller.state.effectiveProvider).toBe(activeProvider);
        } finally {
          resumeDisconnect.resolve();
          await controller.init();
        }
      },
    );

    it('refuses an explicit switch back to aggregated mode while the kill switch is off', async () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: false,
        minimumVersion: '1.0.0',
      };
      createController({}, true);
      await controller.init();

      const result = await controller.switchProvider('aggregated');

      expect(result).toMatchObject({
        success: false,
        providerId: 'hyperliquid',
      });
      expect(controller.state.activeProvider).toBe('hyperliquid');
      expect(controller.getActiveProviderOrNull()?.protocolId).toBe(
        'hyperliquid',
      );
    });

    it('does not report an aggregated switch as successful if the flag is disabled during initialization', async () => {
      createController(
        {
          defaultProvider: 'lighter',
          hasExplicitDefaultProviderSelection: true,
        },
        true,
      );
      await controller.init();
      const waitStarted = createDeferred<void>();
      const resumeInitialization = createDeferred<void>();
      vi.mocked(mockWait).mockImplementationOnce(() => {
        waitStarted.resolve();
        return resumeInitialization.promise;
      });
      const switching = controller.switchProvider('aggregated');
      await waitStarted.promise;
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: false,
        minimumVersion: '1.0.0',
      };
      const onFlagsChanged = mockMessenger.subscribe.mock.calls.find(
        ([event]) => event === 'RemoteFeatureFlagController:stateChange',
      )?.[1] as (state: {
        remoteFeatureFlags: Record<string, unknown>;
      }) => void;
      // The in-flight switch owns lifecycle reconciliation; don't start another.
      onFlagsChanged({ remoteFeatureFlags });
      resumeInitialization.resolve();

      const result = await switching;

      expect(result).toMatchObject({ success: false, providerId: 'lighter' });
      expect(controller.state.activeProvider).toBe('lighter');
      expect(controller.getActiveProviderOrNull()?.protocolId).toBe('lighter');
    });

    it('does not use an unsafe saved default as the direct rollback venue', () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: false,
        minimumVersion: '1.0.0',
      };
      createController({
        activeProvider: 'aggregated',
        defaultProvider: '__proto__' as never,
      });

      expect(controller.state.activeProvider).toBe('hyperliquid');
    });
  });

  describe('multi-provider flag arriving after construction', () => {
    it.each([false, true])(
      'infers the direct venue after an automatic default is persisted and reloaded (marker present: %s)',
      (withMarker) => {
        createController({ activeProvider: 'lighter' });
        const persisted = JSON.parse(JSON.stringify(controller.state));
        if (!withMarker) {
          delete persisted.hasExplicitDefaultProviderSelection;
        }
        expect(persisted.defaultProvider).toBe('hyperliquid');
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);

        createController(persisted);

        expect(controller.state.activeProvider).toBe('aggregated');
        expect(controller.state.defaultProvider).toBe('lighter');
        expect(controller.state.hasExplicitDefaultProviderSelection).toBe(
          false,
        );
      },
    );

    it('infers the direct venue when the flag arrives after reloading an automatic default', async () => {
      createController({ activeProvider: 'lighter' });
      const persisted = JSON.parse(JSON.stringify(controller.state));
      createController(persisted, true);
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '1.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(true);

      await controller.init();

      expect(controller.state.activeProvider).toBe('aggregated');
      expect(controller.state.defaultProvider).toBe('lighter');
      expect(
        (
          controller.getActiveProviderOrNull() as AggregatedPerpsProvider
        ).getWriteProviderId(),
      ).toBe('lighter');
    });

    it.each(['hyperliquid', 'lighter'] as const)(
      'preserves an explicitly saved %s default after a restart before migration',
      (defaultProvider) => {
        createController({
          activeProvider:
            defaultProvider === 'lighter' ? 'hyperliquid' : 'lighter',
        });
        controller.setDefaultProvider(defaultProvider);
        const persisted = JSON.parse(JSON.stringify(controller.state));
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);

        createController(persisted);

        expect(controller.state.activeProvider).toBe('aggregated');
        expect(controller.state.defaultProvider).toBe(defaultProvider);
        expect(controller.state.hasExplicitDefaultProviderSelection).toBe(true);
      },
    );

    it.each(['hyperliquid', 'lighter'] as const)(
      'preserves a %s default saved before the flag arrives and initialization',
      async (defaultProvider) => {
        remoteFeatureFlags.perpsMultiProviderModeEnabled = undefined;
        createController(
          {
            activeProvider:
              defaultProvider === 'lighter' ? 'hyperliquid' : 'lighter',
          },
          true,
        );
        expect(controller.setDefaultProvider(defaultProvider).success).toBe(
          true,
        );
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);

        await controller.init();

        expect(controller.state.activeProvider).toBe('aggregated');
        expect(controller.state.defaultProvider).toBe(defaultProvider);
        expect(
          (
            controller.getActiveProviderOrNull() as AggregatedPerpsProvider
          ).getWriteProviderId(),
        ).toBe(defaultProvider);
      },
    );

    it('refuses an unrouted write queued across the cold-start migration to aggregated', async () => {
      // Flag off at construction: the persisted mode stays direct.
      remoteFeatureFlags.perpsMultiProviderModeEnabled = undefined;
      createController({ activeProvider: 'hyperliquid' });
      expect(controller.state.activeProvider).toBe('hyperliquid');

      // The flag arrives before initialization settles.
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '1.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(true);

      const pendingInitialization = createDeferred<void>();
      vi.mocked(mockWait).mockImplementationOnce(
        () => pendingInitialization.promise,
      );

      const initPromise = controller.init();
      await Promise.resolve();
      await Promise.resolve();
      expect(controller.state.initializationState).toBe(
        InitializationState.Initializing,
      );

      // Submitted while the mode is still direct, then carried across the
      // migration the initialization performs.
      const writePromise = controller.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '1',
        orderType: 'market',
      });

      pendingInitialization.resolve();
      await initPromise;
      expect(controller.state.activeProvider).toBe('aggregated');

      await expect(writePromise).resolves.toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED,
      });
      expect(mockTradingServiceInstance.placeOrder).not.toHaveBeenCalled();
      expect(mockProvider.placeOrder).not.toHaveBeenCalled();
    });
  });

  describe('trade configurations are keyed per provider and symbol (AC3)', () => {
    it.each(['', 'unknown', '__proto__', 'constructor', null, false, 42])(
      'rejects invalid explicit routes consistently in methods and selectors (%j)',
      (invalidProvider) => {
        controller.saveTradeConfiguration('BTC', 10, 'hyperliquid');
        controller.saveOrderBookGrouping('BTC', 10, 'hyperliquid');
        controller.saveMarginMode('BTC', 'cross', 'hyperliquid');
        controller.savePendingTradeConfiguration(
          'BTC',
          { amount: '100' },
          'hyperliquid',
        );
        controller.testUpdate((state) => {
          state.tradeConfigurations.mainnet.unknown = {
            BTC: {
              leverage: 999,
              orderBookGrouping: 999,
              marginMode: 'isolated',
              pendingConfig: { amount: '999', timestamp: Date.now() },
            },
          };
        });
        // @ts-expect-error Exercise invalid arguments from JavaScript callers.
        const providerId: PerpsProviderType = invalidProvider;
        expect(
          controller.getTradeConfiguration('BTC', providerId),
        ).toBeUndefined();
        expect(
          selectTradeConfiguration(controller.state, 'BTC', providerId),
        ).toBeUndefined();
        expect(
          controller.getOrderBookGrouping('BTC', providerId),
        ).toBeUndefined();
        expect(
          selectOrderBookGrouping(controller.state, 'BTC', providerId),
        ).toBeUndefined();
        expect(controller.getMarginMode('BTC', providerId)).toBeUndefined();
        expect(
          selectMarginMode(controller.state, 'BTC', providerId),
        ).toBeUndefined();
        expect(
          controller.getPendingTradeConfiguration('BTC', providerId),
        ).toBeUndefined();
        expect(
          selectPendingTradeConfiguration(controller.state, 'BTC', providerId),
        ).toBeUndefined();

        const configurations = controller.state.tradeConfigurations;
        controller.saveTradeConfiguration('BTC', 20, providerId);
        controller.saveOrderBookGrouping('BTC', 20, providerId);
        controller.saveMarginMode('BTC', 'isolated', providerId);
        controller.savePendingTradeConfiguration(
          'BTC',
          { amount: '200' },
          providerId,
        );
        controller.clearPendingTradeConfiguration('BTC', providerId);
        expect(controller.state.tradeConfigurations).toBe(configurations);
      },
    );

    it('stores and reads leverage per provider', () => {
      controller.saveTradeConfiguration('BTC', 10);
      controller.saveTradeConfiguration('BTC', 5, 'lighter');

      expect(controller.getTradeConfiguration('BTC')).toStrictEqual({
        leverage: 10,
      });
      expect(controller.getTradeConfiguration('BTC', 'lighter')).toStrictEqual({
        leverage: 5,
      });
      expect(
        controller.state.tradeConfigurations.mainnet.hyperliquid.BTC?.leverage,
      ).toBe(10);
      expect(
        controller.state.tradeConfigurations.mainnet.lighter.BTC?.leverage,
      ).toBe(5);
    });

    it('stores and reads margin mode per provider', () => {
      controller.saveMarginMode('BTC', 'cross');
      controller.saveMarginMode('BTC', 'isolated', 'lighter');

      expect(controller.getMarginMode('BTC')).toBe('cross');
      expect(controller.getMarginMode('BTC', 'lighter')).toBe('isolated');
    });

    it('stores and reads order book grouping per provider', () => {
      controller.saveOrderBookGrouping('BTC', 10);
      controller.saveOrderBookGrouping('BTC', 1, 'lighter');

      expect(controller.getOrderBookGrouping('BTC')).toBe(10);
      expect(controller.getOrderBookGrouping('BTC', 'lighter')).toBe(1);
    });

    it('keys pending trade configuration per provider', () => {
      controller.savePendingTradeConfiguration('BTC', { amount: '100' });
      controller.savePendingTradeConfiguration(
        'BTC',
        { amount: '200' },
        'lighter',
      );

      expect(controller.getPendingTradeConfiguration('BTC')).toStrictEqual({
        amount: '100',
      });
      expect(
        controller.getPendingTradeConfiguration('BTC', 'lighter'),
      ).toStrictEqual({ amount: '200' });

      controller.clearPendingTradeConfiguration('BTC');
      expect(controller.getPendingTradeConfiguration('BTC')).toBeUndefined();
      expect(
        controller.getPendingTradeConfiguration('BTC', 'lighter'),
      ).toStrictEqual({ amount: '200' });
    });

    it('reads and writes the default provider venue in aggregated mode', () => {
      setupAggregatedMode('lighter');

      // No explicit venue: the aggregated default (lighter) is used.
      controller.saveTradeConfiguration('BTC', 5);
      controller.saveMarginMode('BTC', 'isolated');

      expect(controller.getTradeConfiguration('BTC')).toStrictEqual({
        leverage: 5,
      });
      expect(controller.getMarginMode('BTC')).toBe('isolated');
      expect(
        controller.state.tradeConfigurations.mainnet.lighter.BTC,
      ).toStrictEqual({ leverage: 5, marginMode: 'isolated' });
    });
  });

  describe('record-key hardening (CodeQL prototype pollution)', () => {
    it('never writes a trade configuration under an unsafe symbol key', () => {
      controller.saveTradeConfiguration('__proto__', 10);
      controller.saveMarginMode('constructor', 'cross');
      controller.saveOrderBookGrouping('prototype', 10);
      controller.savePendingTradeConfiguration('__proto__', { amount: '100' });

      expect(
        Object.keys(controller.state.tradeConfigurations.mainnet),
      ).toStrictEqual([]);
      // Object.prototype was not polluted through any of the writes.
      expect(({} as any).leverage).toBeUndefined();
      expect(({} as any).marginMode).toBeUndefined();
      expect(({} as any).orderBookGrouping).toBeUndefined();
      expect(({} as any).pendingConfig).toBeUndefined();
    });

    it('never writes a trade configuration under an unsafe provider key', () => {
      controller.saveTradeConfiguration('BTC', 10, '__proto__' as never);
      controller.saveMarginMode('BTC', 'cross', 'constructor' as never);
      controller.savePendingTradeConfiguration(
        'BTC',
        { amount: '100' },
        '__proto__' as never,
      );

      expect(controller.state.tradeConfigurations.mainnet).toStrictEqual({});
      expect(({} as any).leverage).toBeUndefined();
      expect(({} as any).marginMode).toBeUndefined();
    });

    it('reads and clears nothing for unsafe keys', () => {
      expect(controller.getTradeConfiguration('__proto__')).toBeUndefined();
      expect(controller.getMarginMode('constructor')).toBeUndefined();
      expect(controller.getOrderBookGrouping('prototype')).toBeUndefined();
      expect(
        controller.getPendingTradeConfiguration('__proto__'),
      ).toBeUndefined();

      controller.clearPendingTradeConfiguration('__proto__');
      expect(controller.state.tradeConfigurations.mainnet).toStrictEqual({});
    });

    it('rejects a setDefaultProvider value that is not a direct venue', () => {
      const result = controller.setDefaultProvider('__proto__' as never);

      expect(result).toStrictEqual({
        success: false,
        defaultProvider: 'hyperliquid',
        error: PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE,
      });
      expect(controller.state.defaultProvider).toBe('hyperliquid');
    });

    it('migrates legacy trade configurations to hyperliquid when the persisted venue ids are unsafe', () => {
      createController({
        activeProvider: '__proto__' as never,
        defaultProvider: 'constructor' as never,
        tradeConfigurations: {
          mainnet: { BTC: { leverage: 10 } },
          testnet: {},
        },
      } as Partial<PerpsControllerState>);

      expect(controller.state.tradeConfigurations.mainnet).toStrictEqual({
        hyperliquid: { BTC: { leverage: 10 } },
      });
      // The migrated record kept a plain prototype.
      expect(({} as any).BTC).toBeUndefined();
    });
  });

  describe('state migrations', () => {
    it('migrates legacy trade configurations under the active direct provider', () => {
      createController({
        activeProvider: 'hyperliquid',
        tradeConfigurations: {
          mainnet: {
            BTC: { leverage: 10, marginMode: 'cross' },
          },
          testnet: {
            ETH: { leverage: 5 },
          },
        },
      } as Partial<PerpsControllerState>);

      expect(controller.state.tradeConfigurations).toStrictEqual({
        mainnet: {
          hyperliquid: { BTC: { leverage: 10, marginMode: 'cross' } },
        },
        testnet: {
          hyperliquid: { ETH: { leverage: 5 } },
        },
      });
    });

    it('migrates legacy trade configurations under a lighter active provider', () => {
      createController({
        activeProvider: 'lighter',
        tradeConfigurations: {
          mainnet: { BTC: { leverage: 10 } },
          testnet: {},
        },
      } as Partial<PerpsControllerState>);

      expect(controller.state.tradeConfigurations.mainnet).toStrictEqual({
        lighter: { BTC: { leverage: 10 } },
      });
    });

    it('leaves provider-keyed configurations untouched', () => {
      const tradeConfigurations = {
        mainnet: { hyperliquid: { BTC: { leverage: 10 } } },
        testnet: {},
      };
      createController({
        tradeConfigurations,
      } as Partial<PerpsControllerState>);

      expect(controller.state.tradeConfigurations).toBe(tradeConfigurations);
    });

    it('migrates a persisted direct provider to aggregated mode when the multi-provider flag is on (TAT-4394)', () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '1.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(true);

      createController({
        activeProvider: 'lighter',
        tradeConfigurations: {
          mainnet: { BTC: { leverage: 10 } },
          testnet: {},
        },
      } as Partial<PerpsControllerState>);

      expect(controller.state.activeProvider).toBe('aggregated');
      expect(controller.state.defaultProvider).toBe('lighter');
      // Trade configurations moved under the venue that became the default.
      expect(controller.state.tradeConfigurations.mainnet).toStrictEqual({
        lighter: { BTC: { leverage: 10 } },
      });
    });

    it.each(['hyperliquid', 'lighter'] as const)(
      'preserves an existing saved %s default during migration',
      (defaultProvider) => {
        remoteFeatureFlags.perpsMultiProviderModeEnabled = {
          enabled: true,
          minimumVersion: '1.0.0',
        };
        vi.mocked(
          mockInfrastructure.featureFlags.validateVersionGated,
        ).mockReturnValue(true);
        createController({
          activeProvider:
            defaultProvider === 'lighter' ? 'hyperliquid' : 'lighter',
          defaultProvider,
          hasExplicitDefaultProviderSelection: true,
        });

        expect(controller.state.activeProvider).toBe('aggregated');
        expect(controller.state.defaultProvider).toBe(defaultProvider);
      },
    );

    it('keeps a persisted direct provider when the multi-provider flag is off', () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = undefined;

      createController({
        activeProvider: 'lighter',
      } as Partial<PerpsControllerState>);

      expect(controller.state.activeProvider).toBe('lighter');
      expect(controller.state.defaultProvider).toBe('hyperliquid');
    });

    it('is a no-op when already in aggregated mode', () => {
      remoteFeatureFlags.perpsMultiProviderModeEnabled = {
        enabled: true,
        minimumVersion: '1.0.0',
      };
      vi.mocked(
        mockInfrastructure.featureFlags.validateVersionGated,
      ).mockReturnValue(true);

      createController({
        activeProvider: 'aggregated',
        defaultProvider: 'lighter',
      } as Partial<PerpsControllerState>);

      expect(controller.state.activeProvider).toBe('aggregated');
      expect(controller.state.defaultProvider).toBe('lighter');
    });
  });
});
