/**
 * Tests for the controller streams that read venue state without polling:
 * subscribeToMarketMeta, subscribeToMarginAdjustmentLimits,
 * subscribeToConnectionLatency, subscribeToFeeRates and
 * subscribeToTradingAgentValidity.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import {
  PerpsController,
  getDefaultPerpsControllerState,
  InitializationState,
} from '../../src/PerpsController.js';
import type { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import type {
  FeeCalculationParams,
  MarketInfo,
  PerpsProvider,
  PerpsProviderType,
  Position,
  SubscribeOrderFillsParams,
} from '../../src/types/index.js';
import { createMockHyperLiquidProvider } from '../helpers/providerMocks.js';
import {
  createMockEvmAccount,
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));
vi.mock('../../src/providers/HyperLiquidProvider');
vi.mock('../../src/services/EligibilityService', () => ({
  EligibilityService: vi.fn().mockImplementation(function () {
    return {
      checkAndUpdateEligibility: vi
        .fn()
        .mockResolvedValue({ isEligible: true }),
      isCurrentlyEligible: vi.fn().mockReturnValue(true),
      subscribeToEligibilityChanges: vi.fn().mockReturnValue(() => undefined),
    };
  }),
}));

/** Expose the protected setup the tests need. */
class TestablePerpsController extends PerpsController {
  testInstall(providers: Map<PerpsProviderType, PerpsProvider>): void {
    this.providers = providers;
    this.activeProviderInstance = providers.values().next().value ?? null;
    this.isInitialized = true;
    this.update((state) => {
      state.initializationState = InitializationState.Initialized;
    });
  }
}

/**
 * Let pending promise chains settle; setImmediate is not faked.
 *
 * @returns Resolves once queued work ran.
 */
const flush = async (): Promise<void> =>
  await new Promise((resolve) => setImmediate(resolve));

const market = (name: string, isDelisted = false): MarketInfo => ({
  name,
  szDecimals: 3,
  maxLeverage: 50,
  marginTableId: 0,
  ...(isDelisted ? { isDelisted } : {}),
});

describe('PerpsController stream subscriptions', () => {
  let controller: TestablePerpsController;
  let provider: Mocked<HyperLiquidProvider>;
  let messenger: ReturnType<typeof createMockMessenger>;

  /**
   * Fire every handler the controller registered for a messenger event.
   *
   * @param event - The event name.
   */
  const publish = (event: string): void => {
    const removed = new Set(
      messenger.unsubscribe.mock.calls.map(([, handler]) => handler),
    );
    for (const [name, handler] of messenger.subscribe.mock.calls) {
      if (name === event && !removed.has(handler)) {
        (handler as () => void)();
      }
    }
  };

  /**
   * Select another EVM account and announce the change.
   *
   * @param address - The newly selected address.
   */
  const switchAccount = (address: string): void => {
    const base = messenger.call.getMockImplementation();
    messenger.call.mockImplementation(((action: string, ...args: unknown[]) =>
      action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ? [{ ...createMockEvmAccount(), address }]
        : base?.(action as never, ...(args as never[]))) as NonNullable<
      typeof base
    >);
    publish('AccountsController:selectedAccountChange');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'Date',
      ],
    });
    provider = createMockHyperLiquidProvider();
    messenger = createMockMessenger();
    controller = new TestablePerpsController({
      messenger,
      state: getDefaultPerpsControllerState(),
      infrastructure: createMockInfrastructure(),
    });
    controller.testInstall(new Map([['hyperliquid', provider]]));
  });

  afterEach(() => {
    controller.stopMarketDataPreload();
    vi.useRealTimers();
  });

  describe('throttleMs', () => {
    it('lets two readers with different throttles share one venue subscription', () => {
      let push: (positions: Position[]) => void = () => undefined;
      const stop = vi.fn();
      provider.subscribeToPositions.mockImplementation((params) => {
        push = (positions): void => params.callback(positions);
        return stop;
      });
      const fast = vi.fn();
      const slow = vi.fn();

      const stopFast = controller.subscribeToPositions({ callback: fast });
      const stopSlow = controller.subscribeToPositions({
        callback: slow,
        throttleMs: 1_000,
      });
      push([]);
      push([]);
      vi.advanceTimersByTime(1_000);

      expect(provider.subscribeToPositions).toHaveBeenCalledTimes(1);
      expect(provider.subscribeToPositions).toHaveBeenCalledWith(
        expect.objectContaining({ throttleMs: undefined }),
      );
      expect(fast).toHaveBeenCalledTimes(2);
      expect(slow).toHaveBeenCalledTimes(2);
      push([]);
      expect(fast).toHaveBeenCalledTimes(3);
      expect(slow).toHaveBeenCalledTimes(2);

      stopFast();
      stopSlow();
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToMarketMeta', () => {
    it('delivers the cached list at once and adds no timer', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC'), market('ETH')]);
      const timers = vi.getTimerCount();
      const callback = vi.fn();

      controller.subscribeToMarketMeta({ callback });
      await flush();

      expect(provider.getMarkets).toHaveBeenCalledWith(undefined);
      expect(callback.mock.calls).toStrictEqual([
        [
          [
            expect.objectContaining({ symbol: 'BTC', isDelisted: false }),
            expect.objectContaining({ symbol: 'ETH', isDelisted: false }),
          ],
        ],
      ]);
      expect(vi.getTimerCount()).toBe(timers);
    });

    it('re-reads the venue after a market data preload and reports a delisting', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC'), market('ETH')]);
      const callback = vi.fn();
      controller.subscribeToMarketMeta({ callback });
      await flush();

      provider.getMarkets.mockResolvedValue([
        market('BTC'),
        market('ETH', true),
      ]);
      controller.startMarketDataPreload();
      await flush();
      await flush();

      expect(provider.getMarkets).toHaveBeenCalledWith({ skipCache: true });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', isDelisted: false }),
        expect.objectContaining({ symbol: 'ETH', isDelisted: true }),
      ]);
    });

    it('shares one read between subscribers and keeps an empty read from replacing the list', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC')]);
      const first = vi.fn();
      const onError = vi.fn();
      const second = vi.fn();
      const stopFirst = controller.subscribeToMarketMeta({
        callback: first,
        onError,
      });
      await flush();
      const stopSecond = controller.subscribeToMarketMeta({ callback: second });
      // A later reader gets the last list replayed.
      await flush();

      expect(provider.getMarkets).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC' }),
      ]);

      provider.getMarkets.mockResolvedValue([]);
      controller.startMarketDataPreload();
      await flush();
      await flush();
      expect(first).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);

      stopFirst();
      stopSecond();
      provider.getMarkets.mockClear();
      controller.stopMarketDataPreload();
      controller.startMarketDataPreload();
      await flush();
      expect(provider.getMarkets).not.toHaveBeenCalledWith({
        skipCache: true,
      });
    });
  });

  describe('subscribeToMarginAdjustmentLimits', () => {
    it('opens one provider stream for two subscribers and closes it after the last', async () => {
      const stop = vi.fn();
      const subscribe = vi.fn<
        NonNullable<PerpsProvider['subscribeToMarginAdjustmentLimits']>
      >((params) => {
        params.callback({ status: 'available', maxAdd: '5', maxRemove: '1' });
        return stop;
      });
      Object.assign(provider, { subscribeToMarginAdjustmentLimits: subscribe });
      const first = vi.fn();
      const second = vi.fn();

      const stopFirst = controller.subscribeToMarginAdjustmentLimits({
        symbol: 'ETH',
        callback: first,
      });
      const stopSecond = controller.subscribeToMarginAdjustmentLimits({
        symbol: 'ETH',
        callback: second,
      });
      await flush();
      stopFirst();
      expect(stop).not.toHaveBeenCalled();
      stopSecond();

      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledWith({
        status: 'available',
        maxAdd: '5',
        maxRemove: '1',
      });
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it('reports a provider without the stream as unavailable', () => {
      const callback = vi.fn();

      controller.subscribeToMarginAdjustmentLimits({ symbol: 'ETH', callback });

      expect(callback).toHaveBeenCalledWith({
        status: 'unavailable',
        reason: 'provider',
      });
    });
  });

  describe('subscribeToConnectionLatency', () => {
    it('shares the provider stream and stops it after the last subscriber', async () => {
      const stop = vi.fn();
      const subscribe = vi.fn<
        NonNullable<PerpsProvider['subscribeToConnectionLatency']>
      >((params) => {
        params.callback(55);
        return stop;
      });
      Object.assign(provider, { subscribeToConnectionLatency: subscribe });
      const first = vi.fn();
      const second = vi.fn();

      const stopFirst = controller.subscribeToConnectionLatency({
        callback: first,
      });
      const stopSecond = controller.subscribeToConnectionLatency({
        callback: second,
      });
      await flush();
      stopFirst();
      stopSecond();

      expect(subscribe).toHaveBeenCalledTimes(1);
      expect(first.mock.calls).toStrictEqual([[55]]);
      expect(second.mock.calls).toStrictEqual([[55]]);
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeToFeeRates', () => {
    let fills: SubscribeOrderFillsParams | undefined;
    let stopFills: Mock<() => void>;
    let tier: number;

    beforeEach(() => {
      fills = undefined;
      stopFills = vi.fn<() => void>();
      tier = 0;
      provider.subscribeToOrderFills.mockImplementation((params) => {
        fills = params;
        return stopFills;
      });
      vi.spyOn(controller, 'calculateFees').mockImplementation(
        async ({ isMaker, orderType }: FeeCalculationParams) => ({
          feeRate: (isMaker ? 0.0001 : 0.0004) - tier * 0.00001,
          protocolFeeRate: orderType === 'limit' ? 0.00015 : 0.00045,
        }),
      );
    });

    it('reads the taker and maker rates once, with no timer', async () => {
      const timers = vi.getTimerCount();
      const callback = vi.fn();

      controller.subscribeToFeeRates({ symbol: 'BTC', callback });
      await flush();

      expect(vi.mocked(controller.calculateFees).mock.calls).toStrictEqual([
        [
          {
            symbol: 'BTC',
            providerId: undefined,
            isMaker: false,
            orderType: 'market',
          },
        ],
        [
          {
            symbol: 'BTC',
            providerId: undefined,
            isMaker: true,
            orderType: 'limit',
          },
        ],
      ]);
      expect(callback.mock.calls).toStrictEqual([
        [
          {
            symbol: 'BTC',
            taker: { feeRate: 0.0004, protocolFeeRate: 0.00045 },
            maker: { feeRate: 0.0001, protocolFeeRate: 0.00015 },
          },
        ],
      ]);
      expect(vi.getTimerCount()).toBe(timers);
    });

    it('re-reads after a live fill, an account switch and a benefits invalidation, not after the snapshot', async () => {
      const callback = vi.fn();
      controller.subscribeToFeeRates({ symbol: 'BTC', callback });
      await flush();

      fills?.callback([], true);
      await flush();
      expect(callback).toHaveBeenCalledTimes(1);

      tier = 1;
      fills?.callback([]);
      await flush();
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith(
        expect.objectContaining({
          taker: expect.objectContaining({ feeRate: 0.00039 }),
        }),
      );

      tier = 2;
      switchAccount('0x2222222222222222222222222222222222222222');
      await flush();
      tier = 3;
      controller.invalidateSubscriptionBenefits();
      await flush();
      expect(callback).toHaveBeenCalledTimes(4);
      // An unchanged read is not delivered again.
      controller.invalidateSubscriptionBenefits();
      await flush();
      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('shares one fills stream and one read between subscribers, and stops it after the last', async () => {
      const first = vi.fn();
      const second = vi.fn();
      const stopFirst = controller.subscribeToFeeRates({
        symbol: 'BTC',
        callback: first,
      });
      await flush();
      const stopSecond = controller.subscribeToFeeRates({
        symbol: 'BTC',
        callback: second,
      });
      await flush();

      expect(provider.subscribeToOrderFills).toHaveBeenCalledTimes(1);
      expect(controller.calculateFees).toHaveBeenCalledTimes(2);
      expect(second).toHaveBeenCalledTimes(1);

      stopFirst();
      stopSecond();
      controller.invalidateSubscriptionBenefits();
      await flush();
      expect(stopFills).toHaveBeenCalledTimes(1);
      expect(controller.calculateFees).toHaveBeenCalledTimes(2);
    });

    it('reports a failed read and keeps the last rates', async () => {
      const callback = vi.fn();
      const onError = vi.fn();
      controller.subscribeToFeeRates({ symbol: 'BTC', callback, onError });
      await flush();

      vi.mocked(controller.calculateFees).mockRejectedValue(new Error('down'));
      fills?.callback([]);
      await flush();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'down' }),
      );
    });
  });

  describe('subscribeToTradingAgentValidity', () => {
    it('reports not_required for a provider without an agent step', () => {
      const callback = vi.fn();

      controller.subscribeToTradingAgentValidity({ callback });

      expect(callback.mock.calls).toStrictEqual([[{ status: 'not_required' }]]);
    });

    it('shares the provider stream and reopens it after an account switch', async () => {
      const stops = [vi.fn(), vi.fn()];
      const subscribe = vi
        .fn<NonNullable<PerpsProvider['subscribeToTradingAgentValidity']>>()
        .mockImplementationOnce((params) => {
          params.callback({ status: 'invalid', reason: 'no_agent' });
          return stops[0];
        })
        .mockImplementationOnce((params) => {
          params.callback({ status: 'not_required' });
          return stops[1];
        });
      Object.assign(provider, { subscribeToTradingAgentValidity: subscribe });
      const first = vi.fn();
      const second = vi.fn();

      const stopFirst = controller.subscribeToTradingAgentValidity({
        callback: first,
      });
      const stopSecond = controller.subscribeToTradingAgentValidity({
        callback: second,
      });
      await flush();
      expect(subscribe).toHaveBeenCalledTimes(1);

      switchAccount('0x2222222222222222222222222222222222222222');

      expect(stops[0]).toHaveBeenCalledTimes(1);
      expect(first.mock.calls).toStrictEqual([
        [{ status: 'invalid', reason: 'no_agent' }],
        [{ status: 'not_required' }],
      ]);
      expect(second.mock.calls).toStrictEqual(first.mock.calls);

      stopFirst();
      stopSecond();
      expect(stops[1]).toHaveBeenCalledTimes(1);
      switchAccount('0x3333333333333333333333333333333333333333');
      expect(subscribe).toHaveBeenCalledTimes(2);
    });
  });
});
