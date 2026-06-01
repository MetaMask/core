/* eslint-disable */
/**
 * Headless client smoke test for PerpsController.
 *
 * The boundary under test mirrors MetaMask Mobile/Extension usage: a client
 * calls PerpsController messenger actions, and the controller delegates to its
 * services/providers. The test intentionally never imports or constructs any
 * protocol SDK client directly.
 */

import type { PerpsControllerMessenger } from '@metamask/perps-controller';

import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks';

const mockPerpsProvider = {
  protocolId: 'hyperliquid',
  disconnect: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../../src/providers/HyperLiquidProvider', () => ({
  HyperLiquidProvider: jest.fn(),
}));

jest.mock('../../src/utils/wait', () => ({
  wait: jest.fn().mockResolvedValue(undefined),
}));

const mockMarketDataServiceInstance = {
  getPositions: jest.fn(),
  getAccountState: jest.fn(),
  getMarkets: jest.fn(),
  getMarketDataWithPrices: jest.fn(),
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
  getHistoricalPortfolio: jest.fn(),
};

jest.mock('../../src/services/MarketDataService', () => ({
  MarketDataService: jest.fn(),
}));

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
  TradingService: jest.fn(),
}));

const mockEligibilityServiceInstance = {
  checkEligibility: jest.fn().mockResolvedValue(true),
};

const mockDepositServiceInstance = {
  prepareTransaction: jest.fn(),
};

const mockAccountServiceInstance = {
  withdraw: jest.fn(),
  validateWithdrawal: jest.fn(),
};

const mockDataLakeServiceInstance = {
  reportOrder: jest.fn(),
};

const mockFeatureFlagConfigurationServiceInstance = {
  refreshEligibility: jest.fn(),
  refreshHip3Config: jest.fn(),
  setBlockedRegions: jest.fn(),
};

jest.mock('../../src/services/EligibilityService', () => ({
  EligibilityService: jest.fn(),
}));

jest.mock('../../src/services/DepositService', () => ({
  DepositService: jest.fn(),
}));

jest.mock('../../src/services/AccountService', () => ({
  AccountService: jest.fn(),
}));

jest.mock('../../src/services/DataLakeService', () => ({
  DataLakeService: jest.fn(),
}));

jest.mock('../../src/services/FeatureFlagConfigurationService', () => ({
  FeatureFlagConfigurationService: jest.fn(),
}));

import {
  PerpsController,
  getDefaultPerpsControllerState,
} from '../../src/PerpsController';
import type {
  PerpsControllerCancelOrderAction,
  PerpsControllerGetAccountStateAction,
  PerpsControllerGetMarketsAction,
  PerpsControllerGetPositionsAction,
  PerpsControllerPlaceOrderAction,
} from '../../src/PerpsController-method-action-types';
import type {
  AccountState,
  CancelOrderParams,
  GetPositionsParams,
  MarketInfo,
  OrderParams,
  OrderResult,
  Position,
} from '../../src/types';

type PerpsClientMessenger = jest.Mocked<PerpsControllerMessenger>;
type ActionHandler = (...args: any[]) => any;

const CLIENT_ACTIONS = {
  getMarkets:
    'PerpsController:getMarkets' as PerpsControllerGetMarketsAction['type'],
  getPositions:
    'PerpsController:getPositions' as PerpsControllerGetPositionsAction['type'],
  getAccountState:
    'PerpsController:getAccountState' as PerpsControllerGetAccountStateAction['type'],
  placeOrder:
    'PerpsController:placeOrder' as PerpsControllerPlaceOrderAction['type'],
  cancelOrder:
    'PerpsController:cancelOrder' as PerpsControllerCancelOrderAction['type'],
};

function createDispatchingMessenger(): {
  messenger: PerpsClientMessenger;
  registeredActionTypes: Set<string>;
} {
  const handlers = new Map<string, ActionHandler>();
  const registeredActionTypes = new Set<string>();
  const messenger = createMockMessenger({
    call: jest.fn((action: string, ...args: any[]) => {
      const handler = handlers.get(action);
      if (handler) {
        return handler(...args);
      }

      if (action === 'RemoteFeatureFlagController:getState') {
        return { remoteFeatureFlags: {} };
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
              name: 'Test Account',
              importTime: 0,
              keyring: { type: 'HD Key Tree' },
            },
          },
        ];
      }

      return undefined;
    }) as any,
  });

  (messenger.registerActionHandler as jest.Mock).mockImplementation(
    (actionType: string, handler: ActionHandler) => {
      handlers.set(actionType, handler);
      registeredActionTypes.add(actionType);
    },
  );

  (messenger.registerMethodActionHandlers as jest.Mock).mockImplementation(
    (
      messengerClient: { name: string; [methodName: string]: any },
      methodNames: string[],
    ) => {
      for (const methodName of methodNames) {
        const method = messengerClient[methodName];
        if (typeof method === 'function') {
          const actionType = `${messengerClient.name}:${methodName}`;
          handlers.set(actionType, method.bind(messengerClient));
          registeredActionTypes.add(actionType);
        }
      }
    },
  );

  return { messenger, registeredActionTypes };
}

function configureMockConstructors() {
  (
    jest.requireMock('../../src/providers/HyperLiquidProvider')
      .HyperLiquidProvider as jest.Mock
  ).mockImplementation(() => mockPerpsProvider);
  (
    jest.requireMock('../../src/services/MarketDataService')
      .MarketDataService as jest.Mock
  ).mockImplementation(() => mockMarketDataServiceInstance);
  (
    jest.requireMock('../../src/services/TradingService')
      .TradingService as jest.Mock
  ).mockImplementation(() => mockTradingServiceInstance);
  (
    jest.requireMock('../../src/services/EligibilityService')
      .EligibilityService as jest.Mock
  ).mockImplementation(() => mockEligibilityServiceInstance);
  (
    jest.requireMock('../../src/services/DepositService')
      .DepositService as jest.Mock
  ).mockImplementation(() => mockDepositServiceInstance);
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
}

function createInstalledClient(messenger: PerpsClientMessenger) {
  return {
    getMarkets: () =>
      messenger.call(CLIENT_ACTIONS.getMarkets) as Promise<MarketInfo[]>,
    getPositions: (params?: GetPositionsParams) =>
      messenger.call(CLIENT_ACTIONS.getPositions, params) as Promise<
        Position[]
      >,
    getAccountState: () =>
      messenger.call(CLIENT_ACTIONS.getAccountState) as Promise<AccountState>,
    placeOrder: (params: OrderParams) =>
      messenger.call(CLIENT_ACTIONS.placeOrder, params) as Promise<OrderResult>,
    cancelOrder: (params: CancelOrderParams) =>
      messenger.call(CLIENT_ACTIONS.cancelOrder, params),
  };
}

describe('PerpsController client smoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureMockConstructors();

    mockMarketDataServiceInstance.getMarkets.mockResolvedValue([
      {
        name: 'BTC',
        szDecimals: 3,
        maxLeverage: 50,
        marginTableId: 1,
      },
    ]);
    mockMarketDataServiceInstance.getPositions.mockResolvedValue([
      {
        symbol: 'BTC',
        size: '0.1',
        entryPrice: '50000',
        positionValue: '5000',
        unrealizedPnl: '125',
        marginUsed: '500',
        leverage: { type: 'cross', value: 10 },
        liquidationPrice: '45000',
        maxLeverage: 50,
        returnOnEquity: '25',
        cumulativeFunding: {
          allTime: '0',
          sinceOpen: '0',
          sinceChange: '0',
        },
        takeProfitCount: 0,
        stopLossCount: 0,
      },
    ]);
    mockMarketDataServiceInstance.getAccountState.mockResolvedValue({
      spendableBalance: '1000',
      withdrawableBalance: '1000',
      totalBalance: '1125',
      marginUsed: '500',
      unrealizedPnl: '125',
      returnOnEquity: '25',
    });
    mockTradingServiceInstance.placeOrder.mockResolvedValue({
      success: true,
      orderId: 'client-order-1',
      filledSize: '0.1',
      averagePrice: '50000',
    });
    mockTradingServiceInstance.cancelOrder.mockResolvedValue({
      success: true,
      orderId: 'client-order-1',
    });
  });

  it('executes Mobile/Extension-style messenger actions through PerpsController', async () => {
    const { messenger, registeredActionTypes } = createDispatchingMessenger();
    const controller = new PerpsController({
      messenger,
      state: getDefaultPerpsControllerState(),
      infrastructure: createMockInfrastructure(),
    });
    const client = createInstalledClient(messenger);

    await controller.init();

    const orderParams: OrderParams = {
      symbol: 'BTC',
      isBuy: true,
      size: '0.1',
      orderType: 'market',
    };

    await expect(client.getMarkets()).resolves.toEqual([
      expect.objectContaining({ name: 'BTC' }),
    ]);
    await expect(client.getPositions({ symbol: 'BTC' })).resolves.toEqual([
      expect.objectContaining({ symbol: 'BTC' }),
    ]);
    await expect(client.getAccountState()).resolves.toEqual(
      expect.objectContaining({ totalBalance: '1125' }),
    );
    await expect(client.placeOrder(orderParams)).resolves.toEqual(
      expect.objectContaining({ orderId: 'client-order-1', success: true }),
    );
    await expect(
      client.cancelOrder({ orderId: 'client-order-1', symbol: 'BTC' }),
    ).resolves.toEqual(
      expect.objectContaining({ orderId: 'client-order-1', success: true }),
    );

    expect(messenger.registerMethodActionHandlers).toHaveBeenCalledWith(
      controller,
      expect.arrayContaining([
        'getMarkets',
        'getPositions',
        'getAccountState',
        'placeOrder',
        'cancelOrder',
      ]),
    );
    for (const actionType of Object.values(CLIENT_ACTIONS)) {
      expect(registeredActionTypes.has(actionType)).toBe(true);
    }
    expect(mockMarketDataServiceInstance.getMarkets).toHaveBeenCalledWith({
      provider: mockPerpsProvider,
      params: undefined,
      context: expect.any(Object),
    });
    expect(mockMarketDataServiceInstance.getPositions).toHaveBeenCalledWith({
      provider: mockPerpsProvider,
      params: { symbol: 'BTC' },
      context: expect.any(Object),
    });
    expect(mockMarketDataServiceInstance.getAccountState).toHaveBeenCalledWith({
      provider: mockPerpsProvider,
      params: undefined,
      context: expect.any(Object),
    });
    expect(mockTradingServiceInstance.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: mockPerpsProvider,
        params: orderParams,
        context: expect.any(Object),
      }),
    );
    expect(mockTradingServiceInstance.cancelOrder).toHaveBeenCalledWith({
      provider: mockPerpsProvider,
      params: { orderId: 'client-order-1', symbol: 'BTC' },
      context: expect.any(Object),
    });
  });
});
