/**
 * Tests for stream channels following the controller context: re-init,
 * subscriptions made before init, account switches, snapshots,
 * resubscription and shared price channels.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import {
  PerpsController,
  getDefaultPerpsControllerState,
} from '../../src/PerpsController.js';
import { HyperLiquidProvider } from '../../src/providers/HyperLiquidProvider.js';
import type {
  Position,
  PriceUpdate,
  SubscribePositionsParams,
  SubscribePricesParams,
} from '../../src/types/index.js';
import {
  createMockHyperLiquidProvider,
  createMockPosition,
} from '../helpers/providerMocks.js';
import {
  createMockInfrastructure,
  createMockMessenger,
} from '../helpers/serviceMocks.js';

vi.mock('@nktkas/hyperliquid', () => ({}));
vi.mock('../../src/providers/HyperLiquidProvider');
vi.mock('../../src/utils/wait', () => ({
  wait: vi.fn().mockResolvedValue(undefined),
}));
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

type StreamProvider = Mocked<HyperLiquidProvider> & {
  positions: SubscribePositionsParams[];
  prices: SubscribePricesParams[];
  stops: ReturnType<typeof vi.fn>[];
};

/**
 * A provider mock that records each stream it opens.
 *
 * @returns The provider and its open streams.
 */
function createStreamProvider(): StreamProvider {
  const provider = Object.assign(createMockHyperLiquidProvider(), {
    positions: [] as SubscribePositionsParams[],
    prices: [] as SubscribePricesParams[],
    stops: [] as Mock<() => void>[],
  });
  const stop = (): Mock<() => void> => {
    const fn = vi.fn<() => void>();
    provider.stops.push(fn);
    return fn;
  };
  provider.subscribeToPositions.mockImplementation((params) => {
    provider.positions.push(params);
    return stop();
  });
  provider.subscribeToPrices.mockImplementation((params) => {
    provider.prices.push(params);
    return stop();
  });
  provider.disconnect.mockResolvedValue({ success: true });
  return provider;
}

const flush = async (): Promise<void> =>
  await new Promise((resolve) => setImmediate(resolve));

const price = (symbol: string, value: string): PriceUpdate => ({
  symbol,
  price: value,
  timestamp: 0,
  isTradable: true,
});

describe('PerpsController stream context', () => {
  let controller: PerpsController;
  let messenger: ReturnType<typeof createMockMessenger>;
  let providers: StreamProvider[];
  let selectedAddress: string;

  /**
   * Select another EVM account and announce the change.
   *
   * @param address - The newly selected address.
   */
  const switchAccount = (address: string): void => {
    selectedAddress = address;
    for (const [name, handler] of messenger.subscribe.mock.calls) {
      if (name === 'AccountsController:selectedAccountChange') {
        (handler as () => void)();
      }
    }
  };

  /**
   * Re-initialize the controller on a fresh provider.
   *
   * @returns The new provider.
   */
  const reinitialize = async (): Promise<StreamProvider> => {
    const next = createStreamProvider();
    providers.push(next);
    await controller.disconnect();
    await controller.init();
    return next;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    providers = [createStreamProvider()];
    selectedAddress = '0x1111111111111111111111111111111111111111';
    vi.mocked(HyperLiquidProvider).mockImplementation(function () {
      return providers[providers.length - 1];
    });
    messenger = createMockMessenger();
    // The mock's selected account follows `selectedAddress`.
    const [account] = messenger.call(
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
    );
    Object.defineProperty(account, 'address', { get: () => selectedAddress });
    controller = new PerpsController({
      messenger,
      state: getDefaultPerpsControllerState(),
      infrastructure: createMockInfrastructure(),
    });
  });

  afterEach(() => {
    controller.stopMarketDataPreload();
  });

  it('opens a subscription made before init once init succeeds', async () => {
    const [provider] = providers;
    const callback = vi.fn();

    controller.subscribeToPositions({ callback });
    expect(provider.subscribeToPositions).not.toHaveBeenCalled();

    await controller.init();
    expect(provider.positions).toHaveLength(1);
    const update = [createMockPosition({ symbol: 'BTC' })];
    provider.positions[0].callback(update);

    expect(callback).toHaveBeenCalledWith(update);
  });

  it('moves readers to the new provider on re-init, keeping their cleanup', async () => {
    await controller.init();
    const [first] = providers;
    const callback = vi.fn();
    const onReset = vi.fn();
    const stop = controller.subscribeToPositions({ callback, onReset });
    first.positions[0].callback([createMockPosition({ symbol: 'BTC' })]);

    const second = await reinitialize();

    expect(first.stops[0]).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(second.positions).toHaveLength(1);
    const update: Position[] = [createMockPosition({ symbol: 'ETH' })];
    second.positions[0].callback(update);
    expect(callback).toHaveBeenLastCalledWith(update);
    expect(controller.getStreamSnapshot('positions', {})).toStrictEqual([
      update,
    ]);

    stop();
    expect(second.stops[0]).toHaveBeenCalledTimes(1);
  });

  it('moves account streams on an account switch and leaves market streams alone', async () => {
    await controller.init();
    const [provider] = providers;
    const positions = vi.fn();
    const onReset = vi.fn();
    const prices = vi.fn();
    controller.subscribeToPositions({ callback: positions, onReset });
    controller.subscribeToPrices({ symbols: ['BTC'], callback: prices });
    provider.positions[0].callback([createMockPosition({ symbol: 'BTC' })]);

    switchAccount('0x2222222222222222222222222222222222222222');

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(provider.positions).toHaveLength(2);
    expect(provider.prices).toHaveLength(1);
    expect(controller.getStreamSnapshot('positions', {})).toBeUndefined();
    const update = [createMockPosition({ symbol: 'SOL' })];
    provider.positions[1].callback(update);
    expect(positions).toHaveBeenLastCalledWith(update);
    expect(onReset.mock.invocationCallOrder[0]).toBeLessThan(
      positions.mock.invocationCallOrder[1],
    );
    provider.prices[0].callback([price('BTC', '100')]);
    expect(prices).toHaveBeenCalledWith([price('BTC', '100')]);
  });

  it('returns the channel last value as the snapshot', async () => {
    await controller.init();
    const [provider] = providers;
    controller.subscribeToPrices({
      symbols: ['BTC', 'ETH'],
      callback: vi.fn(),
    });

    expect(
      controller.getStreamSnapshot('prices', { symbols: ['ETH', 'BTC'] }),
    ).toBeUndefined();
    provider.prices[0].callback([price('BTC', '100')]);

    expect(
      controller.getStreamSnapshot('prices', { symbols: ['ETH', 'BTC'] }),
    ).toStrictEqual([[price('BTC', '100')]]);
    expect(
      controller.getStreamSnapshot('prices', { symbols: ['BTC'] }),
    ).toBeUndefined();
  });

  it('shares one prices channel whatever the symbol order', async () => {
    await controller.init();
    const [provider] = providers;
    const first = vi.fn();
    const second = vi.fn();

    controller.subscribeToPrices({ symbols: ['BTC', 'ETH'], callback: first });
    controller.subscribeToPrices({ symbols: ['ETH', 'BTC'], callback: second });
    provider.prices[0].callback([price('ETH', '10')]);

    expect(provider.prices).toHaveLength(1);
    expect(second).toHaveBeenCalledWith([price('ETH', '10')]);
  });

  it('reopens every venue subscription on resubscribeStreams, keeping the last value', async () => {
    await controller.init();
    const [provider] = providers;
    const callback = vi.fn();
    controller.subscribeToPrices({ symbols: ['BTC'], callback });
    controller.subscribeToPositions({ callback: vi.fn() });
    provider.prices[0].callback([price('BTC', '100')]);

    controller.resubscribeStreams();
    await flush();

    expect(provider.stops[0]).toHaveBeenCalledTimes(1);
    expect(provider.stops[1]).toHaveBeenCalledTimes(1);
    expect(provider.prices).toHaveLength(2);
    expect(provider.positions).toHaveLength(2);
    expect(
      controller.getStreamSnapshot('prices', { symbols: ['BTC'] }),
    ).toStrictEqual([[price('BTC', '100')]]);
    provider.prices[1].callback([price('BTC', '101')]);
    expect(callback).toHaveBeenLastCalledWith([price('BTC', '101')]);
  });
});
