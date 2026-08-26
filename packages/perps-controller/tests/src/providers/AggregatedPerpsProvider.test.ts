import { CandlePeriod } from '../../../src/constants/chartConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { AggregatedPerpsProvider } from '../../../src/providers/AggregatedPerpsProvider.js';
import { STRATEGY_ORDER_TYPES } from '../../../src/utils/orderTypes.js';
import type {
  PerpsProvider,
  PerpsProviderType,
  RoutedCancelOrderParams,
  RoutedFeeCalculationParams,
  RoutedOrderParams,
  RoutedPerpsProvider,
  OrderParams,
  Position,
  MarketInfo,
  Order,
  ChaseOrder,
} from '../../../src/types/index.js';
import { WebSocketConnectionState } from '../../../src/types/index.js';
/* eslint-disable */
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

// Create a comprehensive mock provider
const createMockProvider = (
  providerId: PerpsProviderType,
): jest.Mocked<PerpsProvider> => {
  const mockProvider: jest.Mocked<PerpsProvider> = {
    protocolId: providerId,

    // Asset routes
    getDepositRoutes: jest.fn().mockReturnValue([]),
    getWithdrawalRoutes: jest.fn().mockReturnValue([]),
    getOrderCapabilities: jest.fn().mockResolvedValue({
      status: 'ready',
      providerId,
      supportedStrategies: [],
    }),

    // Read operations
    getPositions: jest.fn().mockResolvedValue([]),
    getAccountState: jest.fn().mockResolvedValue({
      spendableBalance: '10000',
      withdrawableBalance: '10000',
      totalBalance: '10000',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    }),
    getMarkets: jest.fn().mockResolvedValue([]),
    getMarketDataWithPrices: jest.fn().mockResolvedValue([]),
    getOrderFills: jest.fn().mockResolvedValue([]),
    getOrFetchFills: jest.fn().mockResolvedValue([]),
    getOrders: jest.fn().mockResolvedValue([]),
    getOpenOrders: jest.fn().mockResolvedValue([]),
    getFunding: jest.fn().mockResolvedValue([]),
    getHistoricalPortfolio: jest.fn().mockResolvedValue({
      accountValue1dAgo: '10000',
      timestamp: Date.now(),
    }),
    getUserNonFundingLedgerUpdates: jest.fn().mockResolvedValue([]),
    getUserHistory: jest.fn().mockResolvedValue([]),
    getChaseOrders: jest.fn().mockResolvedValue([]),
    suspendChaseOrders: jest.fn().mockResolvedValue([]),
    getCurrentAccountId: jest
      .fn()
      .mockResolvedValue(
        `eip155:1:0x${providerId.padStart(40, '0').slice(0, 40)}`,
      ),

    // Write operations
    placeOrder: jest
      .fn()
      .mockResolvedValue({ success: true, orderId: 'order-123' }),
    editOrder: jest
      .fn()
      .mockResolvedValue({ success: true, orderId: 'order-123' }),
    cancelOrder: jest.fn().mockResolvedValue({ success: true }),
    cancelOrders: jest.fn().mockResolvedValue({
      success: true,
      successCount: 1,
      failureCount: 0,
      results: [],
    }),
    closePosition: jest.fn().mockResolvedValue({ success: true }),
    closePositions: jest.fn().mockResolvedValue({
      success: true,
      successCount: 1,
      failureCount: 0,
      results: [],
    }),
    updatePositionTPSL: jest.fn().mockResolvedValue({ success: true }),
    updateMargin: jest.fn().mockResolvedValue({ success: true }),
    withdraw: jest.fn().mockResolvedValue({ success: true }),

    // Validation
    validateDeposit: jest.fn().mockResolvedValue({ isValid: true }),
    validateOrder: jest.fn().mockResolvedValue({ isValid: true }),
    validateClosePosition: jest.fn().mockResolvedValue({ isValid: true }),
    validateWithdrawal: jest.fn().mockResolvedValue({ isValid: true }),

    // Calculations
    calculateLiquidationPrice: jest.fn().mockResolvedValue('45000'),
    calculateMaintenanceMargin: jest.fn().mockResolvedValue(0.05),
    getMaxLeverage: jest.fn().mockResolvedValue(50),
    calculateFees: jest.fn().mockResolvedValue({ feeRate: 0.001 }),

    // Subscriptions
    subscribeToPrices: jest.fn().mockReturnValue(() => undefined),
    subscribeToPositions: jest.fn().mockReturnValue(() => undefined),
    subscribeToOrderFills: jest.fn().mockReturnValue(() => undefined),
    subscribeToOrders: jest.fn().mockReturnValue(() => undefined),
    subscribeToAccount: jest.fn().mockReturnValue(() => undefined),
    subscribeToOICaps: jest.fn().mockReturnValue(() => undefined),
    subscribeToCandles: jest.fn().mockReturnValue(() => undefined),
    subscribeToOrderBook: jest.fn().mockReturnValue(() => undefined),

    // Configuration
    setLiveDataConfig: jest.fn(),
    setUserFeeDiscount: jest.fn(),
    setUserFeeResolution: jest.fn(),
    approveSubscriptionBuilderFee: jest.fn().mockResolvedValue(true),

    // Lifecycle
    toggleTestnet: jest
      .fn()
      .mockResolvedValue({ success: true, isTestnet: false }),
    initialize: jest.fn().mockResolvedValue({ success: true }),
    isReadyToTrade: jest.fn().mockResolvedValue({ ready: true }),
    disconnect: jest.fn().mockResolvedValue({ success: true }),
    ping: jest.fn().mockResolvedValue(undefined),

    // Block explorer
    getBlockExplorerUrl: jest.fn().mockReturnValue('https://explorer.example'),

    // HIP-3
    getAvailableDexs: jest.fn().mockResolvedValue([]),
  };

  return mockProvider;
};

// Helper to create mock position
const createMockPosition = (symbol: string, size: string): Position =>
  ({
    symbol,
    size,
    entryPrice: '50000',
    positionValue: '5000',
    unrealizedPnl: '100',
    marginUsed: '500',
    leverage: { type: 'cross', value: 10 },
    liquidationPrice: '45000',
    maxLeverage: 50,
    returnOnEquity: '2%',
    cumulativeFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
    takeProfitCount: 0,
    stopLossCount: 0,
  }) as Position;

// Helper to create mock market
const createMockMarket = (name: string): MarketInfo =>
  ({
    name,
    szDecimals: 3,
    maxLeverage: 50,
    marginTableId: 0,
  }) as MarketInfo;

// Helper to create mock order
const createMockOrder = (orderId: string, symbol: string): Order =>
  ({
    orderId,
    symbol,
    side: 'buy',
    orderType: 'limit',
    size: '0.1',
    originalSize: '0.1',
    price: '50000',
    filledSize: '0',
    remainingSize: '0.1',
    status: 'open',
    timestamp: Date.now(),
  }) as Order;

describe('AggregatedPerpsProvider', () => {
  let aggregatedProvider: AggregatedPerpsProvider;
  let routedProvider: RoutedPerpsProvider;
  let mockHLProvider: jest.Mocked<PerpsProvider>;
  let mockMYXProvider: jest.Mocked<PerpsProvider>;
  let mockInfrastructure: ReturnType<typeof createMockInfrastructure>;

  beforeEach(() => {
    mockHLProvider = createMockProvider('hyperliquid');
    mockMYXProvider = createMockProvider('myx');
    mockInfrastructure = createMockInfrastructure();

    aggregatedProvider = new AggregatedPerpsProvider({
      providers: new Map([
        ['hyperliquid', mockHLProvider],
        ['myx', mockMYXProvider],
      ]),
      defaultProvider: 'hyperliquid',
      infrastructure: mockInfrastructure,
    });
    routedProvider = aggregatedProvider;
  });

  describe('constructor', () => {
    it('initializes with provided providers', () => {
      expect(aggregatedProvider.getProviderIds()).toContain('hyperliquid');
      expect(aggregatedProvider.getProviderIds()).toContain('myx');
    });

    it('has protocolId set to "aggregated"', () => {
      expect(aggregatedProvider.protocolId).toBe('aggregated');
    });

    it('cannot be widened to the direct provider contract', () => {
      // @ts-expect-error Routed providers must preserve their strict route contract.
      const directProvider: PerpsProvider = routedProvider;

      expect(directProvider).toBe(aggregatedProvider);
    });
  });

  describe('Read Operations - getPositions', () => {
    it('aggregates positions from all providers', async () => {
      mockHLProvider.getPositions.mockResolvedValue([
        createMockPosition('BTC', '0.1'),
      ]);
      mockMYXProvider.getPositions.mockResolvedValue([
        createMockPosition('ETH', '1.0'),
      ]);

      const positions = await aggregatedProvider.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions).toContainEqual(
        expect.objectContaining({ symbol: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(positions).toContainEqual(
        expect.objectContaining({ symbol: 'ETH', providerId: 'myx' }),
      );
    });

    it('injects providerId into each position', async () => {
      mockHLProvider.getPositions.mockResolvedValue([
        createMockPosition('BTC', '0.1'),
      ]);

      const positions = await aggregatedProvider.getPositions();

      expect(positions[0].providerId).toBe('hyperliquid');
    });

    it('handles partial failures gracefully', async () => {
      mockHLProvider.getPositions.mockResolvedValue([
        createMockPosition('BTC', '0.1'),
      ]);
      mockMYXProvider.getPositions.mockRejectedValue(
        new Error('Provider unavailable'),
      );

      const positions = await aggregatedProvider.getPositions();

      // Should still return positions from successful provider
      expect(positions).toHaveLength(1);
      expect(positions[0].providerId).toBe('hyperliquid');
    });

    it('returns empty array when all providers fail', async () => {
      mockHLProvider.getPositions.mockRejectedValue(new Error('Error 1'));
      mockMYXProvider.getPositions.mockRejectedValue(new Error('Error 2'));

      const positions = await aggregatedProvider.getPositions();

      expect(positions).toEqual([]);
    });
  });

  describe('Read Operations - getMarkets', () => {
    it('aggregates markets from all providers', async () => {
      mockHLProvider.getMarkets.mockResolvedValue([createMockMarket('BTC')]);
      mockMYXProvider.getMarkets.mockResolvedValue([createMockMarket('ETH')]);

      const markets = await aggregatedProvider.getMarkets();

      expect(markets).toHaveLength(2);
      expect(markets).toContainEqual(
        expect.objectContaining({ name: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(markets).toContainEqual(
        expect.objectContaining({ name: 'ETH', providerId: 'myx' }),
      );
    });

    it('keeps same market from different providers', async () => {
      mockHLProvider.getMarkets.mockResolvedValue([createMockMarket('BTC')]);
      mockMYXProvider.getMarkets.mockResolvedValue([createMockMarket('BTC')]);

      const markets = await aggregatedProvider.getMarkets();

      // Both should be kept since they have different providerIds
      expect(markets).toHaveLength(2);
    });
  });

  describe('Read Operations - getOrders', () => {
    it('aggregates orders from all providers', async () => {
      mockHLProvider.getOrders.mockResolvedValue([
        createMockOrder('hl-order', 'BTC'),
      ]);
      mockMYXProvider.getOrders.mockResolvedValue([
        createMockOrder('myx-order', 'ETH'),
      ]);

      const orders = await aggregatedProvider.getOrders();

      expect(orders).toHaveLength(2);
      expect(orders).toContainEqual(
        expect.objectContaining({
          orderId: 'hl-order',
          providerId: 'hyperliquid',
        }),
      );
      expect(orders).toContainEqual(
        expect.objectContaining({ orderId: 'myx-order', providerId: 'myx' }),
      );
    });
  });

  describe('Read Operations - getAccountState', () => {
    it('returns account state from default provider with providerId injected', async () => {
      const mockState = {
        spendableBalance: '1000',
        withdrawableBalance: '1000',
        totalBalance: '1000',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      };
      mockHLProvider.getAccountState.mockResolvedValue(mockState);

      const result = await aggregatedProvider.getAccountState();

      expect(result).toEqual({ ...mockState, providerId: 'hyperliquid' });
    });
  });

  describe('Read Operations - getMarketDataWithPrices', () => {
    it('aggregates market data from all providers', async () => {
      mockHLProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          maxLeverage: '50x',
          price: '50000',
          change24h: '100',
          change24hPercent: '0.2',
          volume: '1000000',
        },
      ]);
      mockMYXProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'ETH',
          name: 'Ethereum',
          maxLeverage: '25x',
          price: '3000',
          change24h: '50',
          change24hPercent: '1.5',
          volume: '500000',
        },
      ]);

      const result = await aggregatedProvider.getMarketDataWithPrices();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(
        expect.objectContaining({ symbol: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(result).toContainEqual(
        expect.objectContaining({ symbol: 'ETH', providerId: 'myx' }),
      );
    });
  });

  describe('Read Operations - getOrderFills', () => {
    it('aggregates order fills from all providers', async () => {
      mockHLProvider.getOrderFills.mockResolvedValue([
        {
          orderId: '1',
          symbol: 'BTC',
          side: 'buy',
          size: '0.1',
          price: '50000',
          pnl: '0',
          direction: 'long',
          fee: '5',
          feeToken: 'USDC',
          timestamp: Date.now(),
        },
      ]);
      mockMYXProvider.getOrderFills.mockResolvedValue([
        {
          orderId: '2',
          symbol: 'ETH',
          side: 'sell',
          size: '1',
          price: '3000',
          pnl: '0',
          direction: 'short',
          fee: '3',
          feeToken: 'USDC',
          timestamp: Date.now(),
        },
      ]);

      const result = await aggregatedProvider.getOrderFills();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(
        expect.objectContaining({ orderId: '1', providerId: 'hyperliquid' }),
      );
    });
  });

  describe('Read Operations - getOpenOrders', () => {
    it('aggregates open orders from all providers', async () => {
      mockHLProvider.getOpenOrders.mockResolvedValue([
        createMockOrder('1', 'BTC'),
      ]);
      mockMYXProvider.getOpenOrders.mockResolvedValue([
        createMockOrder('2', 'ETH'),
      ]);

      const result = await aggregatedProvider.getOpenOrders();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(
        expect.objectContaining({ orderId: '1', providerId: 'hyperliquid' }),
      );
    });
  });

  describe('Read Operations - getFunding', () => {
    it('aggregates funding data from all providers', async () => {
      mockHLProvider.getFunding.mockResolvedValue([
        { symbol: 'BTC', amountUsd: '10', rate: '0.01', timestamp: Date.now() },
      ]);
      mockMYXProvider.getFunding.mockResolvedValue([
        { symbol: 'ETH', amountUsd: '5', rate: '0.02', timestamp: Date.now() },
      ]);

      const result = await aggregatedProvider.getFunding();

      expect(result).toHaveLength(2);
    });
  });

  describe('Chase lifecycle operations', () => {
    const chaseOrder: ChaseOrder = {
      handle: 'chase-1',
      symbol: 'ETH',
      side: 'buy',
      originalSize: '1',
      remainingSize: '1',
      arrivalPrice: '3000',
      restingPrice: '3000',
      restingOrderId: '55',
      distanceChasedBps: 0,
      repricings: 0,
      startedAt: 1,
      status: 'active',
    };

    it('aggregates Chase snapshots with their provider IDs', async () => {
      mockHLProvider.getChaseOrders?.mockResolvedValue([chaseOrder]);

      await expect(aggregatedProvider.getChaseOrders()).resolves.toContainEqual(
        { ...chaseOrder, providerId: 'hyperliquid' },
      );
    });

    it('retains successful Chase snapshots when another provider fails', async () => {
      mockHLProvider.getChaseOrders?.mockResolvedValue([chaseOrder]);
      mockMYXProvider.getChaseOrders?.mockRejectedValue(
        new Error('snapshot failed'),
      );

      await expect(aggregatedProvider.getChaseOrders()).resolves.toStrictEqual([
        { ...chaseOrder, providerId: 'hyperliquid' },
      ]);
    });

    it('suspends every provider and retains provider IDs', async () => {
      const backgrounded = {
        ...chaseOrder,
        status: 'backgrounded' as const,
      };
      mockHLProvider.suspendChaseOrders?.mockResolvedValue([backgrounded]);

      await expect(
        aggregatedProvider.suspendChaseOrders(),
      ).resolves.toContainEqual({
        ...backgrounded,
        providerId: 'hyperliquid',
      });
    });

    it('waits for every suspension attempt before rejecting a provider failure', async () => {
      let resolveHyperLiquid: (orders: ChaseOrder[]) => void = () => undefined;
      const hyperLiquidSuspension = new Promise<ChaseOrder[]>((resolve) => {
        resolveHyperLiquid = resolve;
      });
      let hyperLiquidCompleted = false;
      mockHLProvider.suspendChaseOrders?.mockImplementation(async () => {
        const orders = await hyperLiquidSuspension;
        hyperLiquidCompleted = true;
        return orders;
      });
      mockMYXProvider.suspendChaseOrders?.mockRejectedValue(
        new Error('suspension failed'),
      );

      const suspension = aggregatedProvider.suspendChaseOrders();
      let aggregateSettled = false;
      void suspension.then(
        () => {
          aggregateSettled = true;
        },
        () => {
          aggregateSettled = true;
        },
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(aggregateSettled).toBe(false);
      resolveHyperLiquid([]);
      await expect(suspension).rejects.toThrow('suspension failed');
      expect(hyperLiquidCompleted).toBe(true);
    });
  });

  describe('Write Operations - placeOrder', () => {
    it('accepts an ordinary order held as the routed parameter type', async () => {
      const params: RoutedOrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      };

      await aggregatedProvider.placeOrder(params);

      expect(mockHLProvider.placeOrder).toHaveBeenCalledWith(params);
    });

    it('routes to default provider when no providerId specified', async () => {
      await aggregatedProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      });

      expect(mockHLProvider.placeOrder).toHaveBeenCalled();
      expect(mockMYXProvider.placeOrder).not.toHaveBeenCalled();
    });

    it('routes to specified provider when providerId is provided', async () => {
      await aggregatedProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'myx',
      });

      expect(mockMYXProvider.placeOrder).toHaveBeenCalled();
      expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s order to MYX when explicitly requested',
      async (orderType) => {
        const params = {
          symbol: 'RHEA',
          isBuy: true,
          size: '0.1',
          orderType,
          providerId: 'myx',
        } as const;

        await routedProvider.placeOrder(params);

        expect(mockMYXProvider.placeOrder).toHaveBeenCalledWith(params);
        expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
      },
    );

    it('injects providerId into result', async () => {
      mockMYXProvider.placeOrder.mockResolvedValue({
        success: true,
        orderId: 'myx-order-123',
      });

      const result = await aggregatedProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'myx',
      });

      expect(result.providerId).toBe('myx');
      expect(result.orderId).toBe('myx-order-123');
    });

    it('rejects an unregistered explicit provider for an ordinary order', async () => {
      await expect(
        aggregatedProvider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          // @ts-expect-error Testing an invalid explicit provider route
          providerId: 'unknown-provider',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
      expect(mockMYXProvider.placeOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects an unregistered explicit provider for a %s order',
      async (orderType) => {
        await expect(
          routedProvider.placeOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType,
            // @ts-expect-error Testing an invalid explicit provider route
            providerId: 'unknown-provider',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
        expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
        expect(mockMYXProvider.placeOrder).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects a %s order without an explicit provider route',
      async (orderType) => {
        const params = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType,
          providerId: undefined,
        };

        await expect(
          // @ts-expect-error Routed strategy placement requires providerId.
          routedProvider.placeOrder(params),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_STRATEGY_ROUTE_REQUIRED);
        expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
        expect(mockMYXProvider.placeOrder).not.toHaveBeenCalled();
      },
    );
  });

  describe('Write Operations - cancelOrder', () => {
    it('accepts an ordinary cancel held as the routed parameter type', async () => {
      const params: RoutedCancelOrderParams = {
        orderId: 'order-123',
        symbol: 'BTC',
      };

      await aggregatedProvider.cancelOrder(params);

      expect(mockHLProvider.cancelOrder).toHaveBeenCalledWith(params);
    });

    it('routes to specified provider', async () => {
      await aggregatedProvider.cancelOrder({
        orderId: 'order-123',
        symbol: 'BTC',
        providerId: 'myx',
      });

      expect(mockMYXProvider.cancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-123' }),
      );
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s cancel to MYX when explicitly requested',
      async (orderType) => {
        const params = {
          orderId: 'strategy-123',
          symbol: 'RHEA',
          orderType,
          providerId: 'myx',
        } as const;

        await routedProvider.cancelOrder(params);

        expect(mockMYXProvider.cancelOrder).toHaveBeenCalledWith(params);
        expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
      },
    );

    it('injects providerId into result', async () => {
      mockMYXProvider.cancelOrder.mockResolvedValue({
        success: true,
        orderId: 'order-123',
      });

      const result = await aggregatedProvider.cancelOrder({
        orderId: 'order-123',
        symbol: 'BTC',
        providerId: 'myx',
      });

      expect(result.providerId).toBe('myx');
    });

    it('rejects an unregistered explicit provider for an ordinary cancel', async () => {
      await expect(
        aggregatedProvider.cancelOrder({
          orderId: 'order-123',
          symbol: 'BTC',
          orderType: 'limit',
          // @ts-expect-error Testing an invalid explicit provider route
          providerId: 'unknown-provider',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
      expect(mockMYXProvider.cancelOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects an unregistered explicit provider for a %s cancel',
      async (orderType) => {
        await expect(
          routedProvider.cancelOrder({
            orderId: 'strategy-123',
            symbol: 'BTC',
            orderType,
            // @ts-expect-error Testing an invalid explicit provider route
            providerId: 'unknown-provider',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
        expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
        expect(mockMYXProvider.cancelOrder).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects a %s cancel without an explicit provider route',
      async (orderType) => {
        const params = {
          orderId: 'strategy-123',
          symbol: 'BTC',
          orderType,
          providerId: undefined,
        };

        await expect(
          // @ts-expect-error Routed strategy cancellation requires providerId.
          routedProvider.cancelOrder(params),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_STRATEGY_ROUTE_REQUIRED);
        expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
        expect(mockMYXProvider.cancelOrder).not.toHaveBeenCalled();
      },
    );
  });

  describe('Write Operations - closePosition', () => {
    it('routes to specified provider', async () => {
      await aggregatedProvider.closePosition({
        symbol: 'BTC',
        providerId: 'myx',
      });

      expect(mockMYXProvider.closePosition).toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('validates order with specified provider', async () => {
      await aggregatedProvider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'myx',
      });

      expect(mockMYXProvider.validateOrder).toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes %s validation to MYX when explicitly requested',
      async (orderType) => {
        const params = {
          symbol: 'RHEA',
          isBuy: true,
          size: '0.1',
          orderType,
          providerId: 'myx',
        } as const;

        await routedProvider.validateOrder(params);

        expect(mockMYXProvider.validateOrder).toHaveBeenCalledWith(params);
        expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
      },
    );

    it('rejects an unregistered provider during ordinary validation', async () => {
      const params: Omit<OrderParams, 'providerId'> & {
        providerId: string;
      } = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'unknown-provider',
      };

      await expect(
        // @ts-expect-error Testing an invalid explicit provider route.
        aggregatedProvider.validateOrder(params),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
      expect(mockMYXProvider.validateOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects an unregistered explicit provider for %s validation',
      async (orderType) => {
        await expect(
          routedProvider.validateOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType,
            // @ts-expect-error Testing an invalid explicit provider route.
            providerId: 'unknown-provider',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
        expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
        expect(mockMYXProvider.validateOrder).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects %s validation without an explicit provider route',
      async (orderType) => {
        const params = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType,
          providerId: undefined,
        };

        await expect(
          // @ts-expect-error Routed strategy validation requires providerId.
          routedProvider.validateOrder(params),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_STRATEGY_ROUTE_REQUIRED);
        expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
        expect(mockMYXProvider.validateOrder).not.toHaveBeenCalled();
      },
    );

    it('uses default provider for validateDeposit', async () => {
      await aggregatedProvider.validateDeposit({
        amount: '100',
        assetId: 'eip155:42161/erc20:0x1234/default',
      });

      expect(mockHLProvider.validateDeposit).toHaveBeenCalled();
    });

    it('routes validateClosePosition to specified provider', async () => {
      const params = { symbol: 'BTC', providerId: 'myx' as const };

      await aggregatedProvider.validateClosePosition(params);

      expect(mockMYXProvider.validateClosePosition).toHaveBeenCalledWith(
        params,
      );
    });

    it('routes validateWithdrawal to specified provider', async () => {
      const params = { amount: '100', providerId: 'myx' as const };

      await aggregatedProvider.validateWithdrawal(params);

      expect(mockMYXProvider.validateWithdrawal).toHaveBeenCalledWith(params);
    });
  });

  describe('Lifecycle', () => {
    it('initializes default provider', async () => {
      const result = await aggregatedProvider.initialize();

      expect(mockHLProvider.initialize).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('disconnects all providers', async () => {
      const result = await aggregatedProvider.disconnect();

      expect(mockHLProvider.disconnect).toHaveBeenCalled();
      expect(mockMYXProvider.disconnect).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('delegates isReadyToTrade to default provider', async () => {
      mockHLProvider.isReadyToTrade.mockResolvedValue({
        ready: true,
        walletConnected: true,
        networkSupported: true,
      });

      const result = await aggregatedProvider.isReadyToTrade();

      expect(result.ready).toBe(true);
      expect(mockHLProvider.isReadyToTrade).toHaveBeenCalled();
    });

    it('delegates toggleTestnet to default provider', async () => {
      mockHLProvider.toggleTestnet.mockResolvedValue({
        success: true,
        isTestnet: true,
      });

      const result = await aggregatedProvider.toggleTestnet();

      expect(mockHLProvider.toggleTestnet).toHaveBeenCalled();
      expect(result).toEqual({ success: true, isTestnet: true });
    });
  });

  describe('Configuration', () => {
    it('applies setLiveDataConfig to all providers', () => {
      aggregatedProvider.setLiveDataConfig({ priceThrottleMs: 1000 });

      expect(mockHLProvider.setLiveDataConfig).toHaveBeenCalledWith({
        priceThrottleMs: 1000,
      });
      expect(mockMYXProvider.setLiveDataConfig).toHaveBeenCalledWith({
        priceThrottleMs: 1000,
      });
    });

    it('applies setUserFeeDiscount to all providers', () => {
      aggregatedProvider.setUserFeeDiscount(1000);

      expect(mockHLProvider.setUserFeeDiscount).toHaveBeenCalledWith(1000);
      expect(mockMYXProvider.setUserFeeDiscount).toHaveBeenCalledWith(1000);
    });

    it('preserves the fee source for providers that support full resolutions', () => {
      const resolution = {
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription' as const,
        subscription: { eligible: true, reason: 'eligible' as const },
      };
      mockMYXProvider.setUserFeeResolution = undefined;

      aggregatedProvider.setUserFeeResolution(resolution);

      expect(mockHLProvider.setUserFeeResolution).toHaveBeenCalledWith(
        resolution,
      );
      expect(mockMYXProvider.setUserFeeDiscount).toHaveBeenCalledWith(10000);
    });

    it('delegates subscription builder approval to the default provider', async () => {
      await expect(
        aggregatedProvider.approveSubscriptionBuilderFee(),
      ).resolves.toBe(true);

      expect(
        mockHLProvider.approveSubscriptionBuilderFee,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockMYXProvider.approveSubscriptionBuilderFee,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Provider Management', () => {
    it('adds new provider', () => {
      // Using 'myx' as an existing valid provider type for this test
      // (simulating adding a duplicate or re-adding after removal)
      const newProvider = createMockProvider('myx');
      aggregatedProvider.addProvider('myx', newProvider);

      expect(aggregatedProvider.hasProvider('myx')).toBe(true);
      expect(aggregatedProvider.getProviderIds()).toContain('myx');
    });

    it('removes provider', () => {
      const removed = aggregatedProvider.removeProvider('myx');

      expect(removed).toBe(true);
      expect(aggregatedProvider.hasProvider('myx')).toBe(false);
    });

    it('returns false when removing non-existent provider', () => {
      // @ts-expect-error Testing error handling with invalid provider type
      const removed = aggregatedProvider.removeProvider('non-existent');

      expect(removed).toBe(false);
    });
  });

  describe('Asset Routes', () => {
    it('delegates getDepositRoutes to default provider', () => {
      aggregatedProvider.getDepositRoutes();

      expect(mockHLProvider.getDepositRoutes).toHaveBeenCalled();
    });

    it('delegates getWithdrawalRoutes to default provider', () => {
      aggregatedProvider.getWithdrawalRoutes();

      expect(mockHLProvider.getWithdrawalRoutes).toHaveBeenCalled();
    });
  });

  describe('Calculations', () => {
    it('delegates calculateLiquidationPrice to default provider', async () => {
      await aggregatedProvider.calculateLiquidationPrice({
        entryPrice: 50000,
        leverage: 10,
        direction: 'long',
      });

      expect(mockHLProvider.calculateLiquidationPrice).toHaveBeenCalled();
    });

    it('delegates getMaxLeverage to default provider', async () => {
      await aggregatedProvider.getMaxLeverage('BTC');

      expect(mockHLProvider.getMaxLeverage).toHaveBeenCalledWith('BTC');
    });

    it('delegates calculateMaintenanceMargin to default provider', async () => {
      mockHLProvider.calculateMaintenanceMargin.mockResolvedValue(0.05);

      const result = await aggregatedProvider.calculateMaintenanceMargin({
        asset: 'BTC',
        positionSize: 1,
      });

      expect(result).toBe(0.05);
      expect(mockHLProvider.calculateMaintenanceMargin).toHaveBeenCalled();
    });

    it('delegates calculateFees to default provider', async () => {
      mockHLProvider.calculateFees.mockResolvedValue({ feeRate: 0.001 });

      const result = await aggregatedProvider.calculateFees({
        orderType: 'market',
        symbol: 'BTC',
      });

      expect(result).toEqual({ feeRate: 0.001 });
      expect(mockHLProvider.calculateFees).toHaveBeenCalled();
    });

    it('accepts an ordinary fee request held as the routed parameter type', async () => {
      const params: RoutedFeeCalculationParams = {
        orderType: 'market',
        symbol: 'BTC',
      };

      await aggregatedProvider.calculateFees(params);

      expect(mockHLProvider.calculateFees).toHaveBeenCalledWith(params);
    });

    it('routes calculateFees to an explicit provider', async () => {
      mockMYXProvider.calculateFees.mockResolvedValue({ feeRate: 0.002 });

      await expect(
        routedProvider.calculateFees({
          orderType: 'market',
          symbol: 'RHEA',
          providerId: 'myx',
        }),
      ).resolves.toEqual({ feeRate: 0.002 });
      expect(mockMYXProvider.calculateFees).toHaveBeenCalledWith({
        orderType: 'market',
        symbol: 'RHEA',
        providerId: 'myx',
      });
      expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
    });

    it('rejects an unregistered ordinary fee route', async () => {
      mockHLProvider.calculateFees.mockResolvedValue({ feeRate: 0.001 });

      await expect(
        routedProvider.calculateFees({
          orderType: 'market',
          symbol: 'BTC',
          // @ts-expect-error Testing an invalid explicit provider route.
          providerId: 'unknown-provider',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
      expect(mockMYXProvider.calculateFees).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects a %s fee quote without an explicit provider route',
      async (orderType) => {
        const params = {
          orderType,
          symbol: 'BTC',
          providerId: undefined,
        };

        await expect(
          // @ts-expect-error Routed strategy fee quotes require providerId.
          routedProvider.calculateFees(params),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_STRATEGY_ROUTE_REQUIRED);
        expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
        expect(mockMYXProvider.calculateFees).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s fee quote to its explicit provider',
      async (orderType) => {
        mockMYXProvider.calculateFees.mockRejectedValueOnce(
          new Error(PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED),
        );

        await expect(
          aggregatedProvider.calculateFees({
            orderType,
            symbol: 'RHEA',
            providerId: 'myx',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED);
        expect(mockMYXProvider.calculateFees).toHaveBeenCalledWith({
          orderType,
          symbol: 'RHEA',
          providerId: 'myx',
        });
        expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
      },
    );

    it('gets order capabilities from the default provider', async () => {
      const capabilities = Object.freeze({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: Object.freeze(['twap', 'scale', 'chase']),
      });
      mockHLProvider.getOrderCapabilities.mockResolvedValue(capabilities);

      await expect(
        aggregatedProvider.getOrderCapabilities({ symbol: 'BTC' }),
      ).resolves.toStrictEqual(capabilities);
      expect(mockHLProvider.getOrderCapabilities).toHaveBeenCalledWith({
        symbol: 'BTC',
        providerId: 'hyperliquid',
      });
    });

    it('gets order capabilities from an explicit provider route', async () => {
      mockMYXProvider.getOrderCapabilities.mockResolvedValue({
        status: 'ready',
        providerId: 'myx',
        supportedStrategies: [],
      });

      await expect(
        aggregatedProvider.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'myx',
        }),
      ).resolves.toStrictEqual({
        status: 'ready',
        providerId: 'myx',
        supportedStrategies: [],
      });
      expect(mockMYXProvider.getOrderCapabilities).toHaveBeenCalledWith({
        symbol: 'BTC',
        providerId: 'myx',
      });
    });

    it('rejects capabilities attributed to a different provider', async () => {
      mockMYXProvider.getOrderCapabilities.mockResolvedValue({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: [],
      });

      await expect(
        aggregatedProvider.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'myx',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'myx',
        reason: 'provider_not_routable',
      });
    });

    it('attaches the route when unavailable capabilities omit provider identity', async () => {
      mockMYXProvider.getOrderCapabilities.mockResolvedValue({
        status: 'unavailable',
        reason: 'market_not_found',
      });

      await expect(
        aggregatedProvider.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'myx',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'myx',
        reason: 'market_not_found',
      });
    });

    it('reports an explicit provider route that is not registered', async () => {
      const providerWithoutMyx = new AggregatedPerpsProvider({
        providers: new Map([['hyperliquid', mockHLProvider]]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });

      await expect(
        providerWithoutMyx.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'myx',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'myx',
        reason: 'provider_not_found',
      });
      expect(mockHLProvider.getOrderCapabilities).not.toHaveBeenCalled();
    });

    it('reports unavailable when the routed provider omits the optional hook', async () => {
      mockHLProvider.getOrderCapabilities = undefined;

      await expect(
        aggregatedProvider.getOrderCapabilities({ symbol: 'BTC' }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'not_implemented',
      });
    });

    it('reports unavailable when the routed capability read throws', async () => {
      mockHLProvider.getOrderCapabilities.mockRejectedValueOnce(
        new Error('offline'),
      );

      await expect(
        aggregatedProvider.getOrderCapabilities({ symbol: 'BTC' }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        '[AggregatedPerpsProvider] Order capabilities unavailable',
        { providerId: 'hyperliquid', error: 'offline' },
      );
    });
  });

  describe('Subscriptions', () => {
    it('subscribes to prices via multiplexer', () => {
      const callback = jest.fn();
      aggregatedProvider.subscribeToPrices({
        symbols: ['BTC'],
        callback,
      });

      expect(mockHLProvider.subscribeToPrices).toHaveBeenCalled();
      expect(mockMYXProvider.subscribeToPrices).toHaveBeenCalled();
    });

    it('delegates account subscription to default provider', () => {
      const callback = jest.fn();
      aggregatedProvider.subscribeToAccount({ callback });

      expect(mockHLProvider.subscribeToAccount).toHaveBeenCalled();
    });

    it('delegates subscribeToOICaps to default provider', () => {
      const callback = jest.fn();

      aggregatedProvider.subscribeToOICaps({ callback });

      expect(mockHLProvider.subscribeToOICaps).toHaveBeenCalled();
    });

    it('delegates subscribeToCandles to default provider', () => {
      const callback = jest.fn();

      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback,
      });

      expect(mockHLProvider.subscribeToCandles).toHaveBeenCalled();
    });

    it('delegates subscribeToOrderBook to default provider', () => {
      const callback = jest.fn();

      aggregatedProvider.subscribeToOrderBook({ symbol: 'BTC', callback });

      expect(mockHLProvider.subscribeToOrderBook).toHaveBeenCalled();
    });
  });

  describe('WebSocket', () => {
    it('delegates getWebSocketConnectionState to default provider', () => {
      // Arrange
      (
        mockHLProvider as jest.Mocked<PerpsProvider> & {
          getWebSocketConnectionState: jest.Mock;
        }
      ).getWebSocketConnectionState = jest
        .fn()
        .mockReturnValue(WebSocketConnectionState.Connected);

      // Act
      const result = aggregatedProvider.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Connected);
    });

    it('returns Disconnected when provider lacks getWebSocketConnectionState', () => {
      // Arrange — provider without the optional method
      const noWsProvider = createMockProvider('no-ws');
      const testProvider = new AggregatedPerpsProvider({
        providers: new Map([['no-ws' as PerpsProviderType, noWsProvider]]),
        defaultProvider: 'no-ws' as PerpsProviderType,
        infrastructure: mockInfrastructure,
      });

      // Act
      const result = testProvider.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Disconnected);
    });

    it('delegates subscribeToConnectionState to default provider', () => {
      // Arrange
      const unsubscribe = jest.fn();
      (
        mockHLProvider as jest.Mocked<PerpsProvider> & {
          subscribeToConnectionState: jest.Mock;
        }
      ).subscribeToConnectionState = jest.fn().mockReturnValue(unsubscribe);
      const listener = jest.fn();

      // Act
      const cleanup = aggregatedProvider.subscribeToConnectionState(listener);

      // Assert
      expect(cleanup).toBe(unsubscribe);
    });

    it('calls listener with Disconnected when provider lacks subscribeToConnectionState', () => {
      // Arrange
      const noWsProvider = createMockProvider('no-ws');
      const testProvider = new AggregatedPerpsProvider({
        providers: new Map([['no-ws' as PerpsProviderType, noWsProvider]]),
        defaultProvider: 'no-ws' as PerpsProviderType,
        infrastructure: mockInfrastructure,
      });
      const listener = jest.fn();

      // Act
      const cleanup = testProvider.subscribeToConnectionState(listener);
      cleanup();

      // Assert
      expect(listener).toHaveBeenCalledWith(
        WebSocketConnectionState.Disconnected,
        0,
      );
    });

    it('delegates reconnect to default provider', async () => {
      // Arrange
      (
        mockHLProvider as jest.Mocked<PerpsProvider> & {
          reconnect: jest.Mock;
        }
      ).reconnect = jest.fn().mockResolvedValue(undefined);

      // Act
      await aggregatedProvider.reconnect();

      // Assert
      expect(
        (
          mockHLProvider as jest.Mocked<PerpsProvider> & {
            reconnect: jest.Mock;
          }
        ).reconnect,
      ).toHaveBeenCalled();
    });

    it('does not throw when provider lacks reconnect', async () => {
      // Arrange — provider without reconnect
      const noWsProvider = createMockProvider('no-ws');
      const testProvider = new AggregatedPerpsProvider({
        providers: new Map([['no-ws' as PerpsProviderType, noWsProvider]]),
        defaultProvider: 'no-ws' as PerpsProviderType,
        infrastructure: mockInfrastructure,
      });

      // Act & Assert
      await expect(testProvider.reconnect()).resolves.toBeUndefined();
    });
  });
});
