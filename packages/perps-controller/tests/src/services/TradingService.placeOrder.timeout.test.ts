/* eslint-disable */
import { PERPS_CONSTANTS } from '../../../src/constants/perpsConfig.js';
import { TradingService } from '../../../src/services/TradingService.js';
import type {
  OrderParams,
  OrderResult,
  PerpsProvider,
  PerpsPlatformDependencies,
} from '../../../src/types/index.js';
import { createMockHyperLiquidProvider } from '../../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockServiceContext,
  createMockPerpsControllerState,
} from '../../helpers/serviceMocks.js';

jest.mock('uuid', () => ({ v4: () => 'mock-trace-id' }));

describe('TradingService.placeOrder — order submission timeout', () => {
  let tradingService: TradingService;
  let mockDeps: jest.Mocked<PerpsPlatformDependencies>;
  let mockProvider: jest.Mocked<PerpsProvider>;
  let mockRewardsService: { calculateUserFeeDiscount: jest.Mock };
  let mockContext: ReturnType<typeof createMockServiceContext>;
  let mockReportOrderToDataLake: jest.Mock;

  const baseOrderParams: OrderParams = {
    symbol: 'BTC',
    isBuy: true,
    size: '0.1',
    orderType: 'market',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockDeps = createMockInfrastructure();
    tradingService = new TradingService(mockDeps);
    mockRewardsService = {
      calculateUserFeeDiscount: jest.fn().mockResolvedValue(undefined),
    };
    tradingService.setControllerDependencies({
      rewardsIntegrationService: mockRewardsService as never,
    });
    mockProvider =
      createMockHyperLiquidProvider() as unknown as jest.Mocked<PerpsProvider>;
    mockContext = createMockServiceContext({
      errorContext: { controller: 'TradingService', method: 'test' },
      stateManager: {
        update: jest.fn(),
        getState: jest.fn(() => createMockPerpsControllerState()),
      },
    });
    mockReportOrderToDataLake = jest.fn().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('emits no threshold breadcrumb and leaves reason undefined when provider resolves before threshold', async () => {
    const mockResult: OrderResult = {
      success: true,
      orderId: 'order-123',
      filledSize: '0.1',
      averagePrice: '50000',
    };
    mockProvider.placeOrder.mockResolvedValue(mockResult);

    await tradingService.placeOrder({
      provider: mockProvider,
      params: baseOrderParams,
      context: mockContext,
      reportOrderToDataLake: mockReportOrderToDataLake,
    });

    expect(mockDeps.tracer.addBreadcrumb).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Order submission exceeded threshold (still pending)',
      }),
    );

    const endTraceArgs = (mockDeps.tracer.endTrace as jest.Mock).mock
      .calls[0][0];
    expect(endTraceArgs.data?.reason).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('emits breadcrumb exactly once and sets reason: late_success when provider resolves after threshold', async () => {
    let resolveOrder!: (result: OrderResult) => void;
    const slowOrder = new Promise<OrderResult>((resolve) => {
      resolveOrder = resolve;
    });
    mockProvider.placeOrder.mockReturnValue(slowOrder);

    const placeOrderPromise = tradingService.placeOrder({
      provider: mockProvider,
      params: baseOrderParams,
      context: mockContext,
      reportOrderToDataLake: mockReportOrderToDataLake,
    });

    // Advance past the threshold, allowing microtasks (fee discount await) to run first
    await jest.advanceTimersByTimeAsync(
      PERPS_CONSTANTS.PlaceOrderTimeoutMs + 1,
    );

    expect(mockDeps.tracer.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Order submission exceeded threshold (still pending)',
        level: 'warning',
        category: 'perps',
        data: expect.objectContaining({
          thresholdMs: PERPS_CONSTANTS.PlaceOrderTimeoutMs,
        }),
      }),
    );
    // Exactly one threshold breadcrumb (plus the 'Order execution started' breadcrumb = 2 total)
    const thresholdCalls = (
      mockDeps.tracer.addBreadcrumb as jest.Mock
    ).mock.calls.filter(
      ([args]: [{ message: string }]) =>
        args.message === 'Order submission exceeded threshold (still pending)',
    );
    expect(thresholdCalls).toHaveLength(1);

    // Resolve the provider after the threshold fired
    resolveOrder({
      success: true,
      orderId: 'order-456',
      filledSize: '0.1',
      averagePrice: '50000',
    });
    await placeOrderPromise;

    const endTraceArgs = (mockDeps.tracer.endTrace as jest.Mock).mock
      .calls[0][0];
    expect(endTraceArgs.data?.reason).toBe('late_success');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('sets reason: late_error and rethrows the original error when provider rejects after threshold', async () => {
    let rejectOrder!: (error: Error) => void;
    const slowOrder = new Promise<OrderResult>((_, reject) => {
      rejectOrder = reject;
    });
    mockProvider.placeOrder.mockReturnValue(slowOrder);

    const placeOrderPromise = tradingService.placeOrder({
      provider: mockProvider,
      params: baseOrderParams,
      context: mockContext,
      reportOrderToDataLake: mockReportOrderToDataLake,
    });

    await jest.advanceTimersByTimeAsync(
      PERPS_CONSTANTS.PlaceOrderTimeoutMs + 1,
    );

    const originalError = new Error('Provider connection timed out');
    rejectOrder(originalError);

    await expect(placeOrderPromise).rejects.toThrow(
      'Provider connection timed out',
    );

    const endTraceArgs = (mockDeps.tracer.endTrace as jest.Mock).mock
      .calls[0][0];
    expect(endTraceArgs.data?.reason).toBe('late_error');
    expect(endTraceArgs.data?.success).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('leaves no pending timers when the provider rejects before the threshold', async () => {
    mockProvider.placeOrder.mockRejectedValue(new Error('immediate failure'));

    await expect(
      tradingService.placeOrder({
        provider: mockProvider,
        params: baseOrderParams,
        context: mockContext,
        reportOrderToDataLake: mockReportOrderToDataLake,
      }),
    ).rejects.toThrow('immediate failure');

    expect(jest.getTimerCount()).toBe(0);

    const endTraceArgs = (mockDeps.tracer.endTrace as jest.Mock).mock
      .calls[0][0];
    expect(endTraceArgs.data?.reason).toBe('error');
  });
});
