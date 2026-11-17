import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  CHASE_ORDER_CONFIG,
  TWAP_ORDER_CONFIG,
} from '../../../src/constants/perpsConfig.js';
import type {
  ChaseOrder,
  ChaseOrderLists,
  SubscribeTwapOrdersParams,
  TwapOrder,
  TwapOrderFill,
} from '../../../src/types/index.js';
import {
  createLiveChaseOrderList,
  createLiveTwapOrderList,
} from '../../../src/utils/advancedOrderLists.js';
import type { LiveTwapOrderSource } from '../../../src/utils/advancedOrderLists.js';

const fill = (fillId: string, size: string, price: string): TwapOrderFill => ({
  fillId,
  orderId: `slice-${fillId}`,
  side: 'buy',
  price,
  size,
  fee: '0',
  feeToken: 'USDC',
  timestamp: 2_000 + Number(fillId),
  transactionHash: `0x${fillId}`,
});

const twap = (overrides: Partial<TwapOrder> = {}): TwapOrder => ({
  orderId: '1',
  symbol: 'BTC',
  side: 'buy',
  size: '0.003',
  executedSize: '0',
  remainingSize: '0.003',
  executedNotional: '0',
  fillProgressBps: 0,
  timeProgressBps: 0,
  elapsedTimeMilliseconds: 0,
  durationMinutes: 30,
  randomize: false,
  reduceOnly: false,
  status: 'active',
  startedAt: 1_000,
  lastUpdated: 1_000,
  fills: [],
  ...overrides,
});

const chase = (handle: string, status: ChaseOrder['status']): ChaseOrder => ({
  handle,
  symbol: 'BTC',
  side: 'buy',
  originalSize: '0.01',
  remainingSize: '0.01',
  arrivalPrice: '100000',
  restingPrice: '100050',
  restingOrderId: '77',
  distanceChasedBps: 5,
  repricings: 1,
  startedAt: 1,
  status,
});

/**
 * Build a TWAP source whose reads return the queued results in turn (the last
 * one repeats) and whose stream is driven by the test.
 *
 * @param reads - Results of successive reads.
 * @returns The source, its spies and a way to push stream updates.
 */
function twapSource(reads: (TwapOrder[] | Error)[]): {
  source: LiveTwapOrderSource;
  getTwapOrders: Mock<() => Promise<TwapOrder[]>>;
  subscribeToTwapOrders: Mock<
    (params: SubscribeTwapOrdersParams) => () => void
  >;
  unsubscribe: Mock<() => void>;
  push: (orders: TwapOrder[], isSnapshot?: boolean) => void;
} {
  let push: SubscribeTwapOrdersParams['callback'] | undefined;
  let index = 0;
  const unsubscribe = vi.fn();
  const getTwapOrders = vi.fn(async () => {
    const result = reads[Math.min(index, reads.length - 1)];
    index += 1;
    if (result instanceof Error) {
      throw result;
    }
    return result;
  });
  const subscribeToTwapOrders = vi.fn(
    (params: SubscribeTwapOrdersParams): (() => void) => {
      push = params.callback;
      return unsubscribe;
    },
  );
  return {
    source: { getTwapOrders, subscribeToTwapOrders },
    getTwapOrders,
    subscribeToTwapOrders,
    unsubscribe,
    push: (orders: TwapOrder[], isSnapshot?: boolean): void =>
      push?.(orders, isSnapshot),
  };
}

describe('createLiveTwapOrderList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('raises execution totals with each read while a TWAP runs', async () => {
    const { source, getTwapOrders } = twapSource([
      [twap({ fills: [fill('1', '0.001', '100000')] })],
      [
        twap({
          fills: [fill('1', '0.001', '100000'), fill('2', '0.001', '101000')],
        }),
      ],
    ]);
    const callback = vi.fn();

    const stop = createLiveTwapOrderList({ source, callback });
    await vi.advanceTimersByTimeAsync(0);

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ executedSize: '0.001', fillProgressBps: 3333 }),
    ]);

    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({
        executedSize: '0.002',
        executedNotional: '201',
        averagePrice: '100500',
        fillProgressBps: 6666,
      }),
    ]);
    stop();
  });

  it('stops re-reading once no schedule runs, and emits only changes', async () => {
    const ended = [twap({ status: 'completed' })];
    const { source, getTwapOrders } = twapSource([ended]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback });
    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs * 3);

    expect(getTwapOrders).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('catches up when the stream lists a TWAP no read has, keeping the read fills', async () => {
    const placedElsewhere = twap({
      orderId: 'elsewhere',
      fills: [fill('1', '0.001', '100000')],
      lastUpdated: 2_001,
    });
    const { source, getTwapOrders, push } = twapSource([[], [placedElsewhere]]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback });
    await vi.advanceTimersByTimeAsync(0);
    push([twap({ orderId: 'elsewhere' })], true);

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'elsewhere', fills: [] }),
    ]);

    await vi.advanceTimersByTimeAsync(
      TWAP_ORDER_CONFIG.StreamCatchUpIntervalMs,
    );

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({
        orderId: 'elsewhere',
        executedSize: '0.001',
        fills: placedElsewhere.fills,
      }),
    ]);
  });

  it('keeps a streamed TWAP a lagging read omits, and drops one neither lists', async () => {
    const { source, push } = twapSource([[twap({ orderId: 'old' })], []]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback, catchUpIntervalMs: 10 });
    await vi.advanceTimersByTimeAsync(0);
    push([twap({ orderId: 'new' })]);
    await vi.advanceTimersByTimeAsync(10);

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'new' }),
    ]);
  });

  it('re-reads when a push changes a listed status', async () => {
    const { source, getTwapOrders, push } = twapSource([
      [twap()],
      [twap({ status: 'canceled', lastUpdated: 3_000 })],
    ]);
    const callback = vi.fn();

    createLiveTwapOrderList({
      source,
      callback,
      refreshIntervalMs: 60_000,
      catchUpIntervalMs: 10,
    });
    await vi.advanceTimersByTimeAsync(0);
    push([twap({ status: 'canceled', lastUpdated: 2_000 })]);
    await vi.advanceTimersByTimeAsync(10);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ status: 'canceled', lastUpdated: 3_000 }),
    ]);
  });

  it('re-reads after an empty snapshot such as a provider switch', async () => {
    const { source, getTwapOrders, push } = twapSource([
      [twap({ status: 'completed' })],
      [],
    ]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback, catchUpIntervalMs: 10 });
    await vi.advanceTimersByTimeAsync(0);
    push([], true);
    await vi.advanceTimersByTimeAsync(10);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([]);
  });

  it('runs a read requested while one is in flight once it settles', async () => {
    let release: (() => void) | undefined;
    const getTwapOrders = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Promise<TwapOrder[]>((resolve) => {
            release = (): void => resolve([]);
          }),
      )
      .mockResolvedValue([twap({ orderId: 'late', status: 'completed' })]);
    let push: SubscribeTwapOrdersParams['callback'] | undefined;
    const callback = vi.fn();

    createLiveTwapOrderList({
      source: {
        getTwapOrders,
        subscribeToTwapOrders: (params): (() => void) => {
          push = params.callback;
          return () => undefined;
        },
      },
      callback,
      catchUpIntervalMs: 0,
    });
    // The catch-up read this push asks for lands while the first read runs.
    push?.([twap({ orderId: 'late', status: 'completed' })]);
    await vi.advanceTimersByTimeAsync(0);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'late' }),
    ]);
  });

  it('reports a failed read, keeps its state and retries while a TWAP runs', async () => {
    const { source, getTwapOrders } = twapSource([
      [twap()],
      new Error('venue down'),
      [twap({ fills: [fill('1', '0.001', '100000')] })],
    ]);
    const callback = vi.fn();
    const onError = vi.fn();

    createLiveTwapOrderList({ source, callback, onError });
    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'venue down' }),
    );
    expect(callback).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs);

    expect(getTwapOrders).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ executedSize: '0.001' }),
    ]);
  });

  it('retries a failed first read even with no schedule running', async () => {
    const { source, getTwapOrders } = twapSource([
      new Error('venue down'),
      [twap({ status: 'completed' })],
    ]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs * 3);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'completed' }),
    ]);
  });

  it('reads one catch-up per unexplained push, not a loop', async () => {
    const { source, getTwapOrders, push } = twapSource([[]]);

    createLiveTwapOrderList({ source, callback: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    push([twap({ orderId: 'never-read', status: 'completed' })]);
    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs * 3);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
  });

  it('judges a push by its own rows, not rows held from earlier pushes', async () => {
    const { source, getTwapOrders, push } = twapSource([[twap()]]);

    createLiveTwapOrderList({ source, callback: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    push([twap(), twap({ orderId: 'unread', status: 'completed' })]);
    await vi.advanceTimersByTimeAsync(
      TWAP_ORDER_CONFIG.StreamCatchUpIntervalMs,
    );
    push([twap()]);
    await vi.advanceTimersByTimeAsync(
      TWAP_ORDER_CONFIG.StreamCatchUpIntervalMs,
    );

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
  });

  it('keeps the earlier of two requested reads', async () => {
    const { source, getTwapOrders, push } = twapSource([[twap()]]);

    createLiveTwapOrderList({ source, callback: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    // A refresh is due in RefreshIntervalMs; the first push asks for an
    // earlier read, and a second push half a delay later does not defer it.
    const half = TWAP_ORDER_CONFIG.StreamCatchUpIntervalMs / 2;
    push([twap({ status: 'canceled', lastUpdated: 5_000 })]);
    await vi.advanceTimersByTimeAsync(half);
    push([
      twap({ status: 'canceled', lastUpdated: 5_000 }),
      twap({ orderId: 'unlisted', status: 'completed' }),
    ]);
    await vi.advanceTimersByTimeAsync(half);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
  });

  it('drops held rows when the account, provider or network changes', async () => {
    let context = 'hyperliquid:mainnet:0xa';
    const { source, push } = twapSource([
      [twap({ orderId: 'a' })],
      [twap({ orderId: 'b', status: 'completed' })],
    ]);
    const callback = vi.fn();

    createLiveTwapOrderList({
      source: { ...source, getContextKey: (): string => context },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'hyperliquid:mainnet:0xb';
    // A push for the new account carries no old rows; they must not linger.
    push([twap({ orderId: 'b', status: 'completed' })]);

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'b' }),
    ]);
  });

  it('discards a read that answered for the previous context', async () => {
    let context = 'a';
    let release: ((orders: TwapOrder[]) => void) | undefined;
    const getTwapOrders = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Promise<TwapOrder[]>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue([]);
    const callback = vi.fn();

    createLiveTwapOrderList({
      source: {
        getTwapOrders,
        subscribeToTwapOrders: (): (() => void) => () => undefined,
        getContextKey: (): string => context,
      },
      callback,
    });
    context = 'b';
    release?.([twap({ orderId: 'old-account' })]);
    await vi.advanceTimersByTimeAsync(0);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith([]);
  });

  it('clears the old context at once while the next read is pending', async () => {
    let context = 'a';
    const getTwapOrders = vi
      .fn()
      .mockResolvedValueOnce([twap()])
      .mockImplementation(
        async () => new Promise<TwapOrder[]>(() => undefined),
      );
    const callback = vi.fn();

    createLiveTwapOrderList({
      source: {
        getTwapOrders,
        subscribeToTwapOrders: (): (() => void) => () => undefined,
        getContextKey: (): string => context,
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'b';
    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith([]);
  });

  it('discards an old-context read even after a new-context push', async () => {
    let context = 'a';
    let release: ((orders: TwapOrder[]) => void) | undefined;
    let push: SubscribeTwapOrdersParams['callback'] | undefined;
    const getTwapOrders = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Promise<TwapOrder[]>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue([twap({ orderId: 'b-order' })]);
    const callback = vi.fn();

    createLiveTwapOrderList({
      source: {
        getTwapOrders,
        subscribeToTwapOrders: (params): (() => void) => {
          push = params.callback;
          return () => undefined;
        },
        getContextKey: (): string => context,
      },
      callback,
    });
    context = 'b';
    // The push for the new context moves the list to it first.
    push?.([twap({ orderId: 'b-order' })]);
    release?.([twap({ orderId: 'a-order' })]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(getTwapOrders).toHaveBeenCalledTimes(2);
    expect(callback).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ orderId: 'a-order' })]),
    );
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'b-order' }),
    ]);
  });

  it('stops everything on cleanup', async () => {
    const { source, getTwapOrders, unsubscribe, push } = twapSource([[twap()]]);
    const callback = vi.fn();

    const stop = createLiveTwapOrderList({ source, callback });
    stop();
    await vi.advanceTimersByTimeAsync(TWAP_ORDER_CONFIG.RefreshIntervalMs * 2);
    push([twap({ orderId: 'after' })]);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(getTwapOrders).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('createLiveChaseOrderList', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an ended chase in history after the provider drops it', async () => {
    const getChaseOrders = vi
      .fn()
      .mockResolvedValueOnce([chase('h1', 'active'), chase('h2', 'canceled')])
      .mockResolvedValue([chase('h1', 'active')]);
    const lists: ChaseOrderLists[] = [];

    const stop = createLiveChaseOrderList({
      source: { getChaseOrders },
      callback: (next) => lists.push(next),
    });
    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs * 2);
    stop();

    expect(getChaseOrders).toHaveBeenCalledTimes(3);
    // The second and third reads change nothing visible, so one emission.
    expect(lists).toStrictEqual([
      { running: [chase('h1', 'active')], history: [chase('h2', 'canceled')] },
    ]);
  });

  it('keeps a running chase through one omitted read, then drops it', async () => {
    const getChaseOrders = vi
      .fn()
      .mockResolvedValueOnce([chase('h1', 'active')])
      .mockResolvedValue([]);
    const lists: ChaseOrderLists[] = [];

    createLiveChaseOrderList({
      source: { getChaseOrders },
      callback: (next) => lists.push(next),
    });
    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs);

    expect(getChaseOrders).toHaveBeenCalledTimes(2);
    expect(lists).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs);

    expect(lists.at(-1)).toStrictEqual({ running: [], history: [] });
  });

  it('restarts the omission count when a chase reappears', async () => {
    const getChaseOrders = vi
      .fn()
      .mockResolvedValueOnce([chase('h1', 'active')])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chase('h1', 'active')])
      .mockResolvedValue([]);
    const callback = vi.fn();

    createLiveChaseOrderList({ source: { getChaseOrders }, callback });
    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs * 3);

    expect(getChaseOrders).toHaveBeenCalledTimes(4);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('drops lists from another account, so their cancels disappear', async () => {
    let context = 'hyperliquid:mainnet:0xa';
    const getChaseOrders = vi
      .fn()
      .mockResolvedValueOnce([chase('h1', 'max_distance_reached')])
      .mockResolvedValue([]);
    const callback = vi.fn();

    createLiveChaseOrderList({
      source: { getChaseOrders, getContextKey: (): string => context },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'hyperliquid:mainnet:0xb';
    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs);

    expect(callback).toHaveBeenLastCalledWith({ running: [], history: [] });
  });

  it('clears the old lists at once while the next read is pending', async () => {
    let context = 'a';
    const getChaseOrders = vi
      .fn()
      .mockResolvedValueOnce([chase('h1', 'active')])
      .mockImplementation(
        async () => new Promise<ChaseOrder[]>(() => undefined),
      );
    const callback = vi.fn();

    createLiveChaseOrderList({
      source: { getChaseOrders, getContextKey: (): string => context },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'b';
    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs);

    expect(getChaseOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({ running: [], history: [] });
  });

  it('re-reads at once when the context changes during a read', async () => {
    let context = 'a';
    let release: ((orders: ChaseOrder[]) => void) | undefined;
    const getChaseOrders = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Promise<ChaseOrder[]>((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValue([chase('h2', 'active')]);
    const callback = vi.fn();

    createLiveChaseOrderList({
      source: { getChaseOrders, getContextKey: (): string => context },
      callback,
    });
    context = 'b';
    release?.([chase('h1', 'active')]);
    await vi.advanceTimersByTimeAsync(0);

    expect(getChaseOrders).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenLastCalledWith({
      running: [chase('h2', 'active')],
      history: [],
    });
    expect(callback).not.toHaveBeenCalledWith(
      expect.objectContaining({ running: [chase('h1', 'active')] }),
    );
  });

  it('bounds history, reports failed reads and keeps polling', async () => {
    const getChaseOrders = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue([chase('a', 'filled'), chase('b', 'canceled')]);
    const callback = vi.fn();
    const onError = vi.fn();

    createLiveChaseOrderList({
      source: { getChaseOrders },
      callback,
      onError,
      historyLimit: 1,
      refreshIntervalMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'offline' }),
    );
    expect(callback).toHaveBeenCalledWith({
      running: [],
      history: [chase('a', 'filled')],
    });
  });

  it('stops reading on cleanup, including a read in flight', async () => {
    let resolveRead: ((orders: ChaseOrder[]) => void) | undefined;
    const getChaseOrders = vi.fn(
      async () =>
        new Promise<ChaseOrder[]>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const callback = vi.fn();

    const stop = createLiveChaseOrderList({
      source: { getChaseOrders },
      callback,
    });
    stop();
    resolveRead?.([chase('h1', 'active')]);
    await vi.advanceTimersByTimeAsync(CHASE_ORDER_CONFIG.RefreshIntervalMs * 2);

    expect(getChaseOrders).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
