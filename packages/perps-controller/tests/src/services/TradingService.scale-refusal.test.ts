import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { RewardsIntegrationService } from '../../../src/services/RewardsIntegrationService.js';
import { TradingService } from '../../../src/services/TradingService.js';
import type { OrderParams } from '../../../src/types/index.js';
import { createMockHyperLiquidProvider } from '../../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockMessenger,
  createMockServiceContext,
} from '../../helpers/serviceMocks.js';

type ReportOrderToDataLake = Parameters<
  TradingService['placeOrder']
>[0]['reportOrderToDataLake'];

describe('TradingService malformed Scale expectation refusal', () => {
  function setup(): {
    service: TradingService;
    provider: ReturnType<typeof createMockHyperLiquidProvider>;
    placeOrder: jest.SpyInstance<ReturnType<TradingService['placeOrder']>>;
    resolveFee: jest.SpyInstance<
      ReturnType<RewardsIntegrationService['resolveFee']>
    >;
    context: ReturnType<typeof createMockServiceContext>;
    reportOrderToDataLake: jest.MockedFunction<ReportOrderToDataLake>;
  } {
    const dependencies = createMockInfrastructure();
    const rewards = new RewardsIntegrationService(
      dependencies,
      createMockMessenger(),
    );
    const resolveFee = jest.spyOn(rewards, 'resolveFee').mockResolvedValue({
      feeBips: 10,
      discountBips: undefined,
      source: 'default',
      subscription: { eligible: false, reason: 'no-source' },
    });
    const service = new TradingService(dependencies);
    service.setControllerDependencies({ rewardsIntegrationService: rewards });
    const provider = createMockHyperLiquidProvider();
    const placeOrder = jest
      .spyOn(provider, 'placeOrder')
      .mockResolvedValue({ success: true });
    const context = createMockServiceContext();
    const reportOrderToDataLake = jest
      .fn<
        ReturnType<ReportOrderToDataLake>,
        Parameters<ReportOrderToDataLake>
      >()
      .mockResolvedValue({ success: true });
    return {
      service,
      provider,
      placeOrder,
      resolveFee,
      context,
      reportOrderToDataLake,
    };
  }

  const validExpectation = {
    prices: ['100', '200'],
    sizes: ['1', '1'],
    totalSize: '2',
    totalNotional: '300',
    minimumBaseSize: '0.1',
    minimumQuoteAmount: '1',
    sizeDecimals: 1,
  };
  const malformed: { name: string; value: unknown }[] = [
    { name: 'null', value: null },
    { name: 'missing both arrays', value: {} },
    { name: 'missing sizes', value: { prices: ['100'] } },
    {
      name: 'unknown expectation field',
      value: { ...validExpectation, unknownField: true },
    },
  ];

  it.each(malformed)(
    'resolves a stale refusal for $name before fee resolution or placement',
    async ({ value }) => {
      const fixture = setup();
      const params: OrderParams = {
        symbol: 'BTC',
        orderType: 'scale',
        isBuy: true,
        size: '2',
        // Exercise malformed runtime input at the directly callable service boundary.
        expectedScaleLadder: value as OrderParams['expectedScaleLadder'],
      };

      const result = fixture.service.placeOrder({
        provider: fixture.provider,
        params,
        context: fixture.context,
        reportOrderToDataLake: fixture.reportOrderToDataLake,
      });

      expect(await result).toStrictEqual({
        success: false,
        error: PERPS_ERROR_CODES.ORDER_SCALE_PREVIEW_STALE,
      });
      expect(fixture.resolveFee).not.toHaveBeenCalled();
      expect(fixture.placeOrder).not.toHaveBeenCalled();
      expect(fixture.reportOrderToDataLake).not.toHaveBeenCalled();
    },
  );

  it('preserves unrelated provider execution exceptions', async () => {
    const fixture = setup();
    const error = new Error('provider transport unavailable');
    fixture.placeOrder.mockRejectedValue(error);

    const result = fixture.service.placeOrder({
      provider: fixture.provider,
      params: {
        symbol: 'BTC',
        orderType: 'market',
        isBuy: true,
        size: '1',
        currentPrice: 100,
      },
      context: fixture.context,
      reportOrderToDataLake: fixture.reportOrderToDataLake,
    });

    await expect(result).rejects.toBe(error);
    expect(fixture.resolveFee).toHaveBeenCalledTimes(1);
    expect(fixture.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('preserves successful placement when the optional expectation is omitted', async () => {
    const fixture = setup();

    const result = fixture.service.placeOrder({
      provider: fixture.provider,
      params: {
        symbol: 'BTC',
        orderType: 'market',
        isBuy: true,
        size: '1',
        currentPrice: 100,
      },
      context: fixture.context,
      reportOrderToDataLake: fixture.reportOrderToDataLake,
    });

    expect(await result).toStrictEqual({ success: true });
    expect(fixture.resolveFee).toHaveBeenCalledTimes(1);
    expect(fixture.placeOrder).toHaveBeenCalledTimes(1);
  });
});
