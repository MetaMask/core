/**
 * Shared provider mocks for Perps tests
 * Provides reusable mock implementations for HyperLiquidProvider and related interfaces
 */
import type { HyperLiquidProvider } from '../providers/HyperLiquidProvider';
import type { Order, OrderParams, Position } from '../types';

/**
 * Creates a mock HyperLiquidProvider for testing.
 *
 * @returns Mocked HyperLiquidProvider
 */
export const createMockHyperLiquidProvider =
  (): jest.Mocked<HyperLiquidProvider> =>
    ({
      protocolId: 'hyperliquid',
      initialize: jest.fn(),
      isReadyToTrade: jest.fn(),
      toggleTestnet: jest.fn(),
      getPositions: jest.fn(),
      getAccountState: jest.fn(),
      getHistoricalPortfolio: jest.fn().mockResolvedValue({
        totalBalance24hAgo: '10000',
        totalBalance7dAgo: '9500',
        totalBalance30dAgo: '9000',
      }),
      getMarkets: jest.fn(),
      placeOrder: jest.fn(),
      editOrder: jest.fn(),
      cancelOrder: jest.fn(),
      cancelOrders: jest.fn(),
      closePosition: jest.fn(),
      closePositions: jest.fn(),
      withdraw: jest.fn(),
      getDepositRoutes: jest.fn(),
      getWithdrawalRoutes: jest.fn(),
      validateDeposit: jest.fn().mockResolvedValue({ isValid: true }),
      validateOrder: jest.fn().mockResolvedValue({ isValid: true }),
      validateClosePosition: jest.fn().mockResolvedValue({ isValid: true }),
      validateWithdrawal: jest.fn().mockResolvedValue({ isValid: true }),
      subscribeToPrices: jest.fn(),
      subscribeToPositions: jest.fn(),
      subscribeToOrderFills: jest.fn(),
      setLiveDataConfig: jest.fn(),
      disconnect: jest.fn(),
      updatePositionTPSL: jest.fn(),
      calculateLiquidationPrice: jest.fn(),
      calculateMaintenanceMargin: jest.fn(),
      getMaxLeverage: jest.fn(),
      calculateFees: jest.fn(),
      getMarketDataWithPrices: jest.fn(),
      getBlockExplorerUrl: jest.fn(),
      getOrderFills: jest.fn(),
      getOrders: jest.fn(),
      getFunding: jest.fn(),
      getIsFirstTimeUser: jest.fn(),
      getOpenOrders: jest.fn(),
      subscribeToOrders: jest.fn(),
      subscribeToAccount: jest.fn(),
      setUserFeeDiscount: jest.fn(),
      // WebSocket connection state methods
      getWebSocketConnectionState: jest.fn(),
      subscribeToConnectionState: jest.fn().mockReturnValue(() => undefined),
      reconnect: jest.fn().mockResolvedValue(undefined),
    }) as unknown as jest.Mocked<HyperLiquidProvider>;

/**
 * Creates a mock order result for testing.
 *
 * @returns Mock order result
 */
export function createMockOrderResult(): {
  success: boolean;
  orderId: string;
  filledSize: string;
  averagePrice: string;
} {
  return {
    success: true,
    orderId: 'order-123',
    filledSize: '0.1',
    averagePrice: '50000',
  };
}

/**
 * Creates mock order params for testing.
 *
 * @returns Mock order params
 */
export function createMockOrderParams(): Partial<OrderParams> {
  return {
    symbol: 'BTC',
    isBuy: true,
    orderType: 'market',
    size: '0.1',
    price: '50000',
  };
}

/**
 * Creates a mock order for testing.
 *
 * @param overrides - Optional overrides for the mock order
 * @returns Mock order
 */
export function createMockOrder(overrides: Partial<Order> = {}): Order {
  return {
    orderId: 'order-1',
    symbol: 'BTC',
    side: 'buy' as const,
    orderType: 'limit' as const,
    size: '0.1',
    originalSize: '0.1',
    price: '50000',
    filledSize: '0',
    remainingSize: '0.1',
    status: 'open' as const,
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock position for testing.
 *
 * @param overrides - Optional overrides for the mock position
 * @returns Mock position
 */
export function createMockPosition(
  overrides: Partial<Position> = {},
): Position {
  return {
    symbol: 'BTC',
    size: '0.5',
    entryPrice: '50000',
    positionValue: '25000',
    unrealizedPnl: '100',
    marginUsed: '1000',
    leverage: { type: 'cross' as const, value: 25 },
    liquidationPrice: '48000',
    maxLeverage: 50,
    returnOnEquity: '10',
    cumulativeFunding: {
      allTime: '0',
      sinceOpen: '0',
      sinceChange: '0',
    },
    takeProfitPrice: undefined,
    stopLossPrice: undefined,
    takeProfitCount: 0,
    stopLossCount: 0,
    ...overrides,
  };
}
