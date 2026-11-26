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
import { AggregatedPerpsProvider } from '../../src/providers/AggregatedPerpsProvider.js';
import type { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import { RewardsIntegrationService } from '../../src/services/RewardsIntegrationService.js';
import type {
  FeeCalculationParams,
  MarketInfo,
  OrderFill,
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
  testInstallAggregated(provider: AggregatedPerpsProvider): void {
    this.activeProviderInstance = provider;
    this.update((state) => {
      state.activeProvider = 'aggregated';
      state.effectiveProvider = 'hyperliquid';
    });
    this.providers = new Map<PerpsProviderType, PerpsProvider>([
      ['hyperliquid', provider],
      ['lighter', provider],
    ]);
  }

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

const createFill = (orderId: string): OrderFill => ({
  orderId,
  symbol: 'BTC',
  side: 'buy',
  size: '1',
  price: '100',
  pnl: '0',
  direction: 'Open Long',
  fee: '0',
  feeToken: 'USDC',
  timestamp: 1,
});

describe('PerpsController stream subscriptions', () => {
  let controller: TestablePerpsController;
  let provider: Mocked<HyperLiquidProvider>;
  let messenger: ReturnType<typeof createMockMessenger>;
  let infrastructure: ReturnType<typeof createMockInfrastructure>;

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
    type CallArgs = Parameters<NonNullable<typeof base>>;
    messenger.call.mockImplementation(((action: string, ...args: unknown[]) =>
      action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
        ? [{ ...createMockEvmAccount(), address }]
        : base?.(...([action, ...args] as CallArgs))) as NonNullable<
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
    infrastructure = createMockInfrastructure();
    controller = new TestablePerpsController({
      messenger,
      state: getDefaultPerpsControllerState(),
      infrastructure,
    });
    controller.testInstall(new Map([['hyperliquid', provider]]));
  });

  afterEach(() => {
    controller.stopMarketDataPreload();
    vi.restoreAllMocks();
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

      expect(provider.getMarkets).toHaveBeenCalledWith({
        requireComplete: true,
      });
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

    /**
     * Let the provider report market changes.
     *
     * @returns The report, and the spy that stops it.
     */
    const watchMarkets = (): { report: () => void; stop: Mock } => {
      const stop = vi.fn();
      let report: () => void = () => undefined;
      Object.assign(provider, {
        subscribeToMarketChanges: vi.fn<
          NonNullable<PerpsProvider['subscribeToMarketChanges']>
        >(({ callback }) => {
          report = callback;
          return stop;
        }),
      });
      return { report: () => report(), stop };
    };

    it('re-reads the venue when its stream shows a change, with no preload, and reports a listing and a delisting', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC'), market('ETH')]);
      const { report, stop } = watchMarkets();
      const callback = vi.fn();
      const unsubscribe = controller.subscribeToMarketMeta({ callback });
      await flush();

      provider.getMarkets.mockResolvedValue([
        market('BTC'),
        market('ETH', true),
        market('NEW'),
      ]);
      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(provider.getMarkets).toHaveBeenCalledTimes(1);
      report();
      report();
      await vi.advanceTimersByTimeAsync(1_000);
      await flush();

      // One read covers a burst of changes.
      expect(provider.getMarkets).toHaveBeenCalledTimes(2);
      expect(provider.getMarkets).toHaveBeenLastCalledWith({
        requireComplete: true,
        skipCache: true,
      });
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', isDelisted: false }),
        expect.objectContaining({ symbol: 'ETH', isDelisted: true }),
        expect.objectContaining({ symbol: 'NEW', isDelisted: false }),
      ]);
      unsubscribe();
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it('reads afresh for a later reader when the one that heard a change left before its read', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC')]);
      const { report } = watchMarkets();
      const stop = controller.subscribeToMarketMeta({ callback: vi.fn() });
      await flush();
      report();
      stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(provider.getMarkets).toHaveBeenCalledTimes(1);

      const stopLate = controller.subscribeToMarketMeta({ callback: vi.fn() });
      await flush();
      expect(provider.getMarkets).toHaveBeenLastCalledWith({
        requireComplete: true,
        skipCache: true,
      });
      stopLate();
      controller.subscribeToMarketMeta({ callback: vi.fn() });
      await flush();
      expect(provider.getMarkets).toHaveBeenLastCalledWith({
        requireComplete: true,
      });
    });

    it('reads afresh at once when the provider reports, as it subscribes, a change no one heard', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC'), market('NEW')]);
      Object.assign(provider, {
        subscribeToMarketChanges: vi.fn<
          NonNullable<PerpsProvider['subscribeToMarketChanges']>
        >(({ callback }) => {
          callback();
          return vi.fn();
        }),
      });
      const callback = vi.fn();

      controller.subscribeToMarketMeta({ callback });
      await flush();

      expect(provider.getMarkets).toHaveBeenNthCalledWith(1, {
        requireComplete: true,
        skipCache: true,
      });
      expect(callback.mock.calls[0]).toStrictEqual([
        [
          expect.objectContaining({ symbol: 'BTC' }),
          expect.objectContaining({ symbol: 'NEW' }),
        ],
      ]);
    });

    it('does not read when the market data preload refreshes', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC')]);
      controller.subscribeToMarketMeta({ callback: vi.fn() });
      await flush();
      provider.getMarkets.mockClear();

      controller.startMarketDataPreload();
      await flush();

      expect(provider.getMarkets).not.toHaveBeenCalledWith(
        expect.objectContaining({ skipCache: true }),
      );
    });

    it('shares one read between subscribers, keeps an empty read from replacing the list and retries it', async () => {
      provider.getMarkets.mockResolvedValue([market('BTC')]);
      const { report } = watchMarkets();
      const first = vi.fn();
      const onError = vi.fn();
      const second = vi.fn();
      controller.subscribeToMarketMeta({ callback: first, onError });
      await flush();
      controller.subscribeToMarketMeta({ callback: second });
      // A later reader gets the last list replayed.
      await flush();

      expect(provider.getMarkets).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC' }),
      ]);

      provider.getMarkets.mockResolvedValueOnce([]);
      report();
      await vi.advanceTimersByTimeAsync(1_000);
      await flush();
      expect(first).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);

      provider.getMarkets.mockResolvedValue([market('BTC'), market('ETH')]);
      await vi.advanceTimersByTimeAsync(1_000);
      await flush();
      expect(first).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC' }),
        expect.objectContaining({ symbol: 'ETH' }),
      ]);
    });

    it('keeps following the account and provider after a failed read', async () => {
      provider.getMarkets.mockRejectedValueOnce(new Error('offline'));
      const { report } = watchMarkets();
      const callback = vi.fn();
      const onError = vi.fn();
      controller.subscribeToMarketMeta({ callback, onError });
      await flush();
      expect(onError).toHaveBeenCalledTimes(1);

      provider.getMarkets.mockResolvedValue([market('BTC')]);
      await vi.advanceTimersByTimeAsync(1_000);
      report();
      await vi.advanceTimersByTimeAsync(1_000);
      await flush();

      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC' }),
      ]);
      expect(controller.getStreamSnapshot('marketMeta', {})).toStrictEqual([
        [expect.objectContaining({ symbol: 'BTC' })],
      ]);
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

    it('reports a stream that could not open as a failure, not as an unsupported venue', async () => {
      Object.assign(provider, {
        subscribeToMarginAdjustmentLimits: vi.fn(() => {
          throw new Error('PROVIDER_NOT_AVAILABLE');
        }),
      });
      const callback = vi.fn();
      const onError = vi.fn();

      controller.subscribeToMarginAdjustmentLimits({
        symbol: 'ETH',
        callback,
        onError,
      });

      expect(callback).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'PROVIDER_NOT_AVAILABLE' }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onError).toHaveBeenCalledTimes(2);
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

    /** Let the read after a burst of fills run. */
    const settleFills = async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(1_000);
      await flush();
    };

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

    it('reads the venue rates again after a fill, once for both quotes', async () => {
      controller.subscribeToFeeRates({ symbol: 'BTC', callback: vi.fn() });
      await flush();
      vi.mocked(controller.calculateFees).mockClear();

      fills?.callback([]);
      fills?.callback([]);
      await settleFills();

      expect(vi.mocked(controller.calculateFees).mock.calls).toStrictEqual([
        [expect.objectContaining({ isMaker: false, skipCache: true })],
        [expect.not.objectContaining({ skipCache: true })],
      ]);
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
      await settleFills();
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
      await settleFills();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'down' }),
      );
    });

    it('retries a failed re-read past the cache', async () => {
      controller.subscribeToFeeRates({ symbol: 'BTC', callback: vi.fn() });
      await flush();
      vi.mocked(controller.calculateFees).mockRejectedValueOnce(
        new Error('down'),
      );
      fills?.callback([]);
      await settleFills();
      vi.mocked(controller.calculateFees).mockClear();

      await vi.advanceTimersByTimeAsync(1_000);

      expect(controller.calculateFees).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ isMaker: false, skipCache: true }),
      );
    });

    it('retries a failed read and, once moved to another account, follows that account', async () => {
      const callback = vi.fn();
      const onReset = vi.fn();
      controller.subscribeToFeeRates({ symbol: 'BTC', callback, onReset });
      await flush();
      vi.mocked(controller.calculateFees).mockRejectedValueOnce(
        new Error('down'),
      );
      fills?.callback([]);
      await settleFills();

      tier = 4;
      switchAccount('0x2222222222222222222222222222222222222222');
      await flush();

      expect(onReset).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(2);
      tier = 5;
      fills?.callback([]);
      await settleFills();
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('prices the given amount on a channel of its own', async () => {
      controller.subscribeToFeeRates({ symbol: 'BTC', callback: vi.fn() });
      controller.subscribeToFeeRates({
        symbol: 'BTC',
        amount: '2500',
        callback: vi.fn(),
      });
      await flush();

      expect(controller.calculateFees).toHaveBeenCalledTimes(4);
      expect(controller.calculateFees).toHaveBeenLastCalledWith(
        expect.objectContaining({ amount: '2500', isMaker: true }),
      );
    });

    it('re-reads when the client reports a Rewards change, and stops listening', async () => {
      const listeners = new Set<() => void>();
      const { rewards } = infrastructure;
      rewards.subscribeToPerpsFeeChanges = (listener): (() => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      };
      const callback = vi.fn();
      const stop = controller.subscribeToFeeRates({ symbol: 'BTC', callback });
      await flush();

      tier = 1;
      listeners.forEach((listener) => listener());
      await flush();

      expect(callback).toHaveBeenCalledTimes(2);
      stop();
      expect(listeners.size).toBe(0);
    });

    it('re-reads once when a trading fee grant expires', async () => {
      const expiresAt = Date.now() + 30_000;
      vi.spyOn(
        RewardsIntegrationService.prototype,
        'getFeeGrantExpiry',
      ).mockImplementation(
        () => [expiresAt].filter((deadline) => Date.now() < deadline)[0],
      );
      const callback = vi.fn();
      controller.subscribeToFeeRates({ symbol: 'BTC', callback });
      await flush();
      tier = 1;

      await vi.advanceTimersByTimeAsync(29_999);
      await flush();
      expect(callback).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(callback).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(3_600_000);
      expect(controller.calculateFees).toHaveBeenCalledTimes(4);
    });

    it('does not take the fills snapshot from a later fills reader', async () => {
      controller.subscribeToFeeRates({ symbol: 'BTC', callback: vi.fn() });
      fills?.callback([createFill('old')], true);
      fills?.callback([createFill('new')]);
      const callback = vi.fn();
      controller.subscribeToOrderFills({ callback });
      await flush();

      expect(provider.subscribeToOrderFills).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls).toStrictEqual([
        [[createFill('new'), createFill('old')], true, undefined],
      ]);
    });

    it('replays no fills before the venue sent its snapshot', async () => {
      controller.subscribeToFeeRates({ symbol: 'BTC', callback: vi.fn() });
      fills?.callback([createFill('lone')]);
      const callback = vi.fn();
      controller.subscribeToOrderFills({ callback });
      await flush();

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('in aggregated mode', () => {
    const latencies: Partial<
      Record<PerpsProviderType, (latencyMs: number) => void>
    > = {};

    let lighter: Mocked<HyperLiquidProvider>;

    const install = (): AggregatedPerpsProvider => {
      lighter = createMockHyperLiquidProvider();
      for (const [id, venue] of [
        ['hyperliquid', provider],
        ['lighter', lighter],
      ] as const) {
        venue.getMarkets.mockResolvedValue([market(`${id}-market`)]);
        venue.subscribeToOrderFills.mockReturnValue(vi.fn());
        Object.assign(venue, {
          subscribeToConnectionLatency: vi.fn<
            NonNullable<PerpsProvider['subscribeToConnectionLatency']>
          >((params) => {
            latencies[id] = params.callback;
            return vi.fn();
          }),
        });
      }
      const aggregated = new AggregatedPerpsProvider({
        providers: new Map<PerpsProviderType, PerpsProvider>([
          ['hyperliquid', provider],
          ['lighter', lighter],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure,
      });
      controller.testInstallAggregated(aggregated);
      return aggregated;
    };

    it('moves unrouted market meta and fee rates to the new default provider', async () => {
      const aggregated = install();
      vi.spyOn(controller, 'calculateFees').mockImplementation(async () => ({
        feeRate: Number(aggregated.getWriteProviderId() !== 'lighter'),
        protocolFeeRate: 0,
      }));
      const meta = vi.fn();
      const metaReset = vi.fn();
      const fees = vi.fn();
      const feesReset = vi.fn();
      const routed = vi.fn();
      const routedReset = vi.fn();
      controller.subscribeToMarketMeta({ callback: meta, onReset: metaReset });
      controller.subscribeToFeeRates({
        symbol: 'BTC',
        callback: fees,
        onReset: feesReset,
      });
      controller.subscribeToMarketMeta({
        providerId: 'hyperliquid',
        callback: routed,
        onReset: routedReset,
      });
      await flush();

      controller.setDefaultProvider('lighter');
      await flush();

      expect(metaReset).toHaveBeenCalledTimes(1);
      expect(meta).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'lighter-market' }),
      ]);
      expect(feesReset).toHaveBeenCalledTimes(1);
      expect(fees).toHaveBeenLastCalledWith(
        expect.objectContaining({
          taker: expect.objectContaining({ feeRate: 0 }),
        }),
      );
      // A stream that names its venue stays there.
      expect(routedReset).not.toHaveBeenCalled();
      expect(routed).toHaveBeenCalledTimes(1);
    });

    it('keeps the other venue streaming when one venue fails for good', async () => {
      install();
      const subscribe = vi
        .fn<PerpsProvider['subscribeToOrders']>()
        .mockImplementation((params) => {
          params.onError?.(new Error('auth refused'));
          return vi.fn();
        });
      lighter.subscribeToOrders.mockImplementation(subscribe);
      provider.subscribeToOrders.mockReturnValue(vi.fn());
      const callback = vi.fn();
      const onError = vi.fn();
      controller.subscribeToOrders({ callback, onError });
      await vi.advanceTimersByTimeAsync(3_600_000);

      // The failed venue was opened again a bounded number of times.
      expect(subscribe).toHaveBeenCalledTimes(6);
      expect(provider.subscribeToOrders).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'auth refused' }),
        'lighter',
      );
      provider.subscribeToOrders.mock.calls[0][0].callback([]);
      expect(callback).toHaveBeenCalledWith([], 'hyperliquid');
    });

    it("keeps a change a closed reader heard until that venue's markets are read afresh", async () => {
      install();
      const reports: Partial<Record<PerpsProviderType, () => void>> = {};
      for (const [id, venue] of [
        ['hyperliquid', provider],
        ['lighter', lighter],
      ] as const) {
        Object.assign(venue, {
          subscribeToMarketChanges: vi.fn<
            NonNullable<PerpsProvider['subscribeToMarketChanges']>
          >(({ callback }) => {
            reports[id] = callback;
            return vi.fn();
          }),
        });
      }
      const openOnce = async (
        providerId?: PerpsProviderType,
      ): Promise<void> => {
        const stop = controller.subscribeToMarketMeta({
          callback: vi.fn(),
          providerId,
        });
        await flush();
        stop();
      };
      const fresh = expect.objectContaining({ skipCache: true });

      // Heard by a reader that follows the default provider.
      const stop = controller.subscribeToMarketMeta({ callback: vi.fn() });
      await flush();
      reports.hyperliquid?.();
      stop();
      await openOnce('lighter');
      expect(lighter.getMarkets).not.toHaveBeenCalledWith(fresh);
      controller.setDefaultProvider('lighter');
      await openOnce();
      expect(lighter.getMarkets).not.toHaveBeenCalledWith(fresh);

      await openOnce('hyperliquid');
      expect(provider.getMarkets).toHaveBeenLastCalledWith(fresh);
      await openOnce('hyperliquid');
      expect(provider.getMarkets).not.toHaveBeenLastCalledWith(fresh);
    });

    it('opens a single venue account stream again after it failed', async () => {
      install();
      const single = new AggregatedPerpsProvider({
        providers: new Map<PerpsProviderType, PerpsProvider>([
          ['hyperliquid', provider],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure,
      });
      controller.testInstallAggregated(single);
      provider.subscribeToAccount
        .mockImplementationOnce(() => {
          throw new Error('PROVIDER_NOT_AVAILABLE');
        })
        .mockReturnValue(vi.fn());
      const callback = vi.fn();
      const onError = vi.fn();
      controller.subscribeToAccount({ callback, onError });
      await flush();
      expect(onError).toHaveBeenCalledTimes(1);
      // As from a direct provider: no wallet to read is no data.
      expect(callback).toHaveBeenCalledExactlyOnceWith(null);

      await vi.advanceTimersByTimeAsync(1_000);

      expect(provider.subscribeToAccount).toHaveBeenCalledTimes(2);
    });

    it("does not replay the old default's latency to a late reader", async () => {
      install();
      controller.subscribeToConnectionLatency({ callback: vi.fn() });
      latencies.hyperliquid?.(42);

      controller.setDefaultProvider('lighter');
      const late = vi.fn();
      controller.subscribeToConnectionLatency({ callback: late });
      await flush();

      expect(late).not.toHaveBeenCalled();
      latencies.lighter?.(7);
      expect(late.mock.calls).toStrictEqual([[7]]);
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
