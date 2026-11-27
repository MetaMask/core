import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  STREAM_RETRY_CONFIG,
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
import type {
  CanceledChaseOrder,
  LiveTwapOrderSource,
} from '../../../src/utils/advancedOrderLists.js';

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

  it('raises execution totals from pushed slice fills, with no read and no timer while a TWAP runs', async () => {
    const { source, getTwapOrders, push } = twapSource([
      [twap({ fills: [fill('1', '0.001', '100000')] })],
    ]);
    const callback = vi.fn();

    const stop = createLiveTwapOrderList({ source, callback });
    await vi.advanceTimersByTimeAsync(0);

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ executedSize: '0.001', fillProgressBps: 3333 }),
    ]);
    expect(vi.getTimerCount()).toBe(0);

    push([
      twap({
        fills: [fill('1', '0.001', '100000'), fill('2', '0.001', '101000')],
      }),
    ]);

    expect(getTwapOrders).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
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

  it('reads once, whether or not a schedule runs, and emits only changes', async () => {
    const ended = [twap({ status: 'completed' })];
    const { source, getTwapOrders } = twapSource([ended]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback });
    await vi.advanceTimersByTimeAsync(60_000);

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

  it('reports a failed read, keeps its state and retries a bounded number of times', async () => {
    const { source, getTwapOrders, push } = twapSource([
      [twap()],
      new Error('venue down'),
    ]);
    const callback = vi.fn();
    const onError = vi.fn();

    createLiveTwapOrderList({
      source,
      callback,
      onError,
      catchUpIntervalMs: 10,
    });
    await vi.advanceTimersByTimeAsync(0);
    push([], true);
    await vi.advanceTimersByTimeAsync(10);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'venue down' }),
    );
    expect(callback).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_600_000);

    // The first read, the failed catch-up and its retries.
    expect(getTwapOrders).toHaveBeenCalledTimes(
      2 + STREAM_RETRY_CONFIG.MaxAttempts,
    );
    expect(vi.getTimerCount()).toBe(0);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('retries a failed first read even with no schedule running', async () => {
    const { source, getTwapOrders } = twapSource([
      new Error('venue down'),
      [twap({ status: 'completed' })],
    ]);
    const callback = vi.fn();

    createLiveTwapOrderList({ source, callback, onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);

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
    await vi.advanceTimersByTimeAsync(60_000);

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
    // The first push asks for a read; a second push half a delay later does
    // not defer it.
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
    // The stream opened for the old account; its push clears the old rows
    // and the new account's read fills the list.
    push([twap({ orderId: 'b', status: 'completed' })]);

    expect(callback).toHaveBeenLastCalledWith([]);

    await vi.advanceTimersByTimeAsync(0);

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
    let notify: (() => void) | undefined;
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
        subscribeToContextChanges: (listener): (() => void) => {
          notify = listener;
          return () => undefined;
        },
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'b';
    notify?.();
    await vi.advanceTimersByTimeAsync(0);

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
    // A push from the old stream moves the list to the new context first.
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

  it('clears at once when the context changes during a later read', async () => {
    let context = 'a';
    let push: SubscribeTwapOrdersParams['callback'] | undefined;
    let notify: (() => void) | undefined;
    let release: ((orders: TwapOrder[]) => void) | undefined;
    const getTwapOrders = vi
      .fn()
      .mockResolvedValueOnce([twap({ orderId: 'a-order' })])
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
        subscribeToContextChanges: (listener): (() => void) => {
          notify = listener;
          return () => undefined;
        },
      },
      callback,
      catchUpIntervalMs: 0,
    });
    await vi.advanceTimersByTimeAsync(0);
    push?.([], true);
    await vi.advanceTimersByTimeAsync(0);
    // The second read is pending when the account switches.
    context = 'b';
    notify?.();

    expect(callback).toHaveBeenLastCalledWith([]);

    await vi.advanceTimersByTimeAsync(0);
    release?.([twap({ orderId: 'a-order' })]);
    await vi.advanceTimersByTimeAsync(0);

    expect(getTwapOrders).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'b-order' }),
    ]);
  });

  it('reopens the stream for a new context and ignores the old stream', async () => {
    let context = 'a';
    let notify: (() => void) | undefined;
    const streams: {
      push: SubscribeTwapOrdersParams['callback'];
      unsubscribe: Mock<() => void>;
    }[] = [];
    const getTwapOrders = vi.fn(async (): Promise<TwapOrder[]> => []);
    const callback = vi.fn();

    const stop = createLiveTwapOrderList({
      source: {
        getTwapOrders,
        subscribeToTwapOrders: (params): (() => void) => {
          const unsubscribe = vi.fn();
          streams.push({ push: params.callback, unsubscribe });
          return unsubscribe;
        },
        getContextKey: (): string => context,
        subscribeToContextChanges: (listener): (() => void) => {
          notify = listener;
          return () => undefined;
        },
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'b';
    notify?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(streams).toHaveLength(2);
    expect(streams[0].unsubscribe).toHaveBeenCalledTimes(1);

    // Account A's stream still pushes after the switch to B.
    streams[0].push([twap({ orderId: 'a-order' })]);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(callback).not.toHaveBeenCalledWith([
      expect.objectContaining({ orderId: 'a-order' }),
    ]);
    expect(callback).toHaveBeenLastCalledWith([]);

    streams[1].push([twap({ orderId: 'b-order' })]);

    expect(callback).toHaveBeenLastCalledWith([
      expect.objectContaining({ orderId: 'b-order' }),
    ]);

    stop();

    expect(streams[1].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reopens the stream when a push reveals a new context, dropping that push', async () => {
    let context = 'a';
    const streams: SubscribeTwapOrdersParams['callback'][] = [];
    const callback = vi.fn();

    createLiveTwapOrderList({
      source: {
        getTwapOrders: async (): Promise<TwapOrder[]> => [],
        subscribeToTwapOrders: (params): (() => void) => {
          streams.push(params.callback);
          return () => undefined;
        },
        getContextKey: (): string => context,
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'b';
    streams[0]([twap({ orderId: 'a-order' })]);
    await vi.advanceTimersByTimeAsync(0);

    expect(streams).toHaveLength(2);
    expect(callback).not.toHaveBeenCalledWith([
      expect.objectContaining({ orderId: 'a-order' }),
    ]);
  });

  it('closes a stream whose first push already left its context', async () => {
    let context = 'a';
    const unsubscribes: Mock<() => void>[] = [];
    const callback = vi.fn();
    // The first stream pushes at once, after the context changed.
    const subscribeToTwapOrders = vi
      .fn()
      .mockImplementationOnce((params: SubscribeTwapOrdersParams) => {
        const unsubscribe = vi.fn();
        unsubscribes.push(unsubscribe);
        context = 'b';
        params.callback([twap({ orderId: 'a-order' })]);
        return unsubscribe;
      })
      .mockImplementation(() => {
        const unsubscribe = vi.fn();
        unsubscribes.push(unsubscribe);
        return unsubscribe;
      });

    createLiveTwapOrderList({
      source: {
        getTwapOrders: async (): Promise<TwapOrder[]> => [],
        subscribeToTwapOrders,
        getContextKey: (): string => context,
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(unsubscribes).toHaveLength(2);
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(unsubscribes[1]).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalledWith([
      expect.objectContaining({ orderId: 'a-order' }),
    ]);
  });

  it('stops everything on cleanup', async () => {
    const { source, getTwapOrders, unsubscribe, push } = twapSource([[twap()]]);
    const callback = vi.fn();

    const stop = createLiveTwapOrderList({ source, callback });
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    push([twap({ orderId: 'after' })]);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(getTwapOrders).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('createLiveChaseOrderList', () => {
  // The source's change stream, driven by the test.
  let listeners: Set<() => void>;
  const subscribeToChaseOrderChanges = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /**
   * Let the read in flight settle, then report a chase change and let its read
   * settle, once per change.
   *
   * @param times - Changes to report.
   */
  const change = async (times = 1): Promise<void> => {
    await vi.advanceTimersByTimeAsync(0);
    for (let index = 0; index < times; index += 1) {
      listeners.forEach((listener) => listener());
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Set();
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
      source: { getChaseOrders, subscribeToChaseOrderChanges },
      callback: (next) => lists.push(next),
    });
    await change(2);
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
      source: { getChaseOrders, subscribeToChaseOrderChanges },
      callback: (next) => lists.push(next),
    });
    await change();

    expect(getChaseOrders).toHaveBeenCalledTimes(2);
    expect(lists).toHaveLength(1);

    await change();

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

    createLiveChaseOrderList({
      source: { getChaseOrders, subscribeToChaseOrderChanges },
      callback,
    });
    await change(3);

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
      source: {
        getChaseOrders,
        subscribeToChaseOrderChanges,
        getContextKey: (): string => context,
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'hyperliquid:mainnet:0xb';
    await change();

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
      source: {
        getChaseOrders,
        subscribeToChaseOrderChanges,
        getContextKey: (): string => context,
      },
      callback,
    });
    await vi.advanceTimersByTimeAsync(0);
    context = 'b';
    await change();

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
      source: {
        getChaseOrders,
        subscribeToChaseOrderChanges,
        getContextKey: (): string => context,
      },
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

  type HeldChaseRead = {
    resolve?: (orders: ChaseOrder[]) => void;
    reject?: (error: Error) => void;
  };

  it.each([
    [
      'is pending',
      (held: HeldChaseRead): void => held.resolve?.([chase('h1', 'active')]),
    ],
    [
      'rejects',
      (held: HeldChaseRead): void =>
        held.reject?.(new Error('old read failed')),
    ],
  ])(
    'clears at once and reads the new context when the context changes while a later read %s',
    async (_label, settleOldRead) => {
      let context = 'a';
      let notify: (() => void) | undefined;
      const held: HeldChaseRead = {};
      const getChaseOrders = vi
        .fn()
        .mockResolvedValueOnce([chase('h1', 'active')])
        .mockImplementationOnce(
          async () =>
            new Promise<ChaseOrder[]>((resolve, reject) => {
              held.resolve = resolve;
              held.reject = reject;
            }),
        )
        .mockResolvedValue([chase('h2', 'active')]);
      const callback = vi.fn();
      const onError = vi.fn();

      createLiveChaseOrderList({
        source: {
          getChaseOrders,
          subscribeToChaseOrderChanges,
          getContextKey: (): string => context,
          subscribeToContextChanges: (listener): (() => void) => {
            notify = listener;
            return () => undefined;
          },
        },
        callback,
        onError,
      });
      await change();
      context = 'b';
      notify?.();

      expect(callback).toHaveBeenLastCalledWith({ running: [], history: [] });

      await vi.advanceTimersByTimeAsync(0);
      settleOldRead(held);
      await vi.advanceTimersByTimeAsync(0);

      expect(getChaseOrders).toHaveBeenCalledTimes(3);
      expect(onError).not.toHaveBeenCalled();
      expect(callback).toHaveBeenLastCalledWith({
        running: [chase('h2', 'active')],
        history: [],
      });
    },
  );

  describe('after a cancel that reports its ending', () => {
    const ended = (
      order: ChaseOrder,
      status: ChaseOrder['status'] = 'canceled',
    ): ChaseOrder => ({ ...order, status, restingOrderId: null });

    /**
     * Start a list over a read spy, with a way to report a successful cancel.
     *
     * @param getChaseOrders - The source's read.
     * @returns The callback and a way to report a cancel.
     */
    function startList(getChaseOrders: Mock): {
      callback: Mock;
      cancel: (
        chaseOrder: ChaseOrder,
        providerId?: ChaseOrder['providerId'],
      ) => void;
    } {
      let report: ((canceled: CanceledChaseOrder) => void) | undefined;
      const callback = vi.fn();
      createLiveChaseOrderList({
        source: {
          getChaseOrders,
          subscribeToChaseOrderChanges,
          subscribeToChaseCancellations: (listener): (() => void) => {
            report = listener;
            return () => undefined;
          },
        },
        callback,
      });
      return {
        callback,
        cancel: (chaseOrder, providerId): void =>
          report?.({ handle: chaseOrder.handle, providerId, chaseOrder }),
      };
    }

    const reads = (...results: ChaseOrder[][]): Mock => {
      const getChaseOrders = vi.fn();
      results
        .slice(0, -1)
        .forEach((result) => getChaseOrders.mockResolvedValueOnce(result));
      return getChaseOrders.mockResolvedValue(results.at(-1));
    };

    it('keeps the ending in history once the provider drops the chase', async () => {
      const { callback, cancel } = startList(
        reads([chase('h1', 'active')], []),
      );
      await vi.advanceTimersByTimeAsync(0);
      cancel(ended(chase('h1', 'active')));

      expect(callback).toHaveBeenLastCalledWith({
        running: [],
        history: [ended(chase('h1', 'active'))],
      });

      await change(3);

      expect(callback).toHaveBeenLastCalledWith({
        running: [],
        history: [ended(chase('h1', 'active'))],
      });
    });

    it('records a fill the provider reports for the cancelled chase', async () => {
      const filled = {
        ...ended(chase('h1', 'active'), 'filled'),
        remainingSize: '0',
      };
      const { callback, cancel } = startList(
        reads([chase('h1', 'active')], []),
      );
      await vi.advanceTimersByTimeAsync(0);
      cancel(filled);
      await change(2);

      expect(callback).toHaveBeenLastCalledWith({
        running: [],
        history: [filled],
      });
    });

    it('does not let a stale read put the chase back in running', async () => {
      const { callback, cancel } = startList(
        reads([chase('h1', 'active')], [chase('h1', 'active')], []),
      );
      await vi.advanceTimersByTimeAsync(0);
      cancel(ended(chase('h1', 'active')));
      callback.mockClear();
      await change(2);

      // The read that still lists it as active changes nothing visible.
      expect(callback).not.toHaveBeenCalled();
    });

    it('keeps an ending reported while the first read is pending', async () => {
      let release: ((orders: ChaseOrder[]) => void) | undefined;
      const getChaseOrders = vi
        .fn()
        .mockImplementationOnce(
          async () =>
            new Promise<ChaseOrder[]>((resolve) => {
              release = resolve;
            }),
        )
        .mockResolvedValue([]);
      const { callback, cancel } = startList(getChaseOrders);
      cancel(ended(chase('h1', 'active')));
      // The held read was taken before the cancel and still lists it active.
      release?.([chase('h1', 'active')]);
      await change(3);

      expect(callback).not.toHaveBeenCalledWith(
        expect.objectContaining({ running: [chase('h1', 'active')] }),
      );
      expect(callback).toHaveBeenLastCalledWith({
        running: [],
        history: [ended(chase('h1', 'active'))],
      });
    });

    it('keeps the ending of a chase no read had listed yet', async () => {
      const { callback, cancel } = startList(
        reads([], [chase('h1', 'active')], []),
      );
      await vi.advanceTimersByTimeAsync(0);
      cancel(ended(chase('h1', 'active')));
      await change(3);

      expect(callback).toHaveBeenLastCalledWith({
        running: [],
        history: [ended(chase('h1', 'active'))],
      });
    });

    it('replaces the stopped ending of a chase whose resting order it cancelled', async () => {
      const stopped = chase('h1', 'max_distance_reached');
      const { callback, cancel } = startList(reads([stopped], []));
      await vi.advanceTimersByTimeAsync(0);
      cancel(ended(stopped, 'max_distance_reached'));
      await change();

      expect(callback).toHaveBeenLastCalledWith({
        running: [],
        history: [ended(stopped, 'max_distance_reached')],
      });
    });

    it('keeps the cancelled child gone when an older stopped read arrives late', async () => {
      const stopped = chase('h1', 'max_distance_reached');
      let release: ((orders: ChaseOrder[]) => void) | undefined;
      const getChaseOrders = vi
        .fn()
        .mockResolvedValueOnce([stopped])
        .mockImplementationOnce(
          async () =>
            new Promise<ChaseOrder[]>((resolve) => {
              release = resolve;
            }),
        )
        .mockResolvedValue([]);
      const { callback, cancel } = startList(getChaseOrders);
      await vi.advanceTimersByTimeAsync(0);
      // The second read is held with the child still resting.
      await change();
      cancel(ended(stopped, 'max_distance_reached'));
      callback.mockClear();
      release?.([stopped]);
      await change(3);

      expect(getChaseOrders.mock.calls.length).toBeGreaterThan(2);
      // The late snapshot and the omissions after it change nothing visible.
      expect(callback).not.toHaveBeenCalled();
    });

    it("leaves another provider's chase with the same handle running", async () => {
      const lighterChase = {
        ...chase('h1', 'active'),
        providerId: 'lighter' as const,
      };
      const { callback, cancel } = startList(reads([lighterChase]));
      await vi.advanceTimersByTimeAsync(0);
      cancel(ended(chase('h1', 'active')), 'hyperliquid');
      await change();

      expect(callback).toHaveBeenLastCalledWith({
        running: [lighterChase],
        history: [
          { ...ended(chase('h1', 'active')), providerId: 'hyperliquid' },
        ],
      });
    });

    it('forgets endings when the context changes', async () => {
      let context = 'a';
      let report: ((canceled: CanceledChaseOrder) => void) | undefined;
      const callback = vi.fn();
      createLiveChaseOrderList({
        source: {
          getChaseOrders: reads([chase('h1', 'active')]),
          subscribeToChaseOrderChanges,
          getContextKey: (): string => context,
          subscribeToChaseCancellations: (listener): (() => void) => {
            report = listener;
            return () => undefined;
          },
        },
        callback,
      });
      await vi.advanceTimersByTimeAsync(0);
      report?.({ handle: 'h1', chaseOrder: ended(chase('h1', 'active')) });
      context = 'b';
      await change();

      // The new context's h1 is a different chase and is still running.
      expect(callback).toHaveBeenLastCalledWith({
        running: [chase('h1', 'active')],
        history: [],
      });
    });
  });

  it('bounds history, and retries a failed read a bounded number of times', async () => {
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
    });
    await vi.advanceTimersByTimeAsync(STREAM_RETRY_CONFIG.BaseDelayMs);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'offline' }),
    );
    expect(callback).toHaveBeenCalledWith({
      running: [],
      history: [chase('a', 'filled')],
    });

    getChaseOrders.mockReset().mockRejectedValue(new Error('offline'));
    createLiveChaseOrderList({ source: { getChaseOrders }, callback, onError });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(getChaseOrders).toHaveBeenCalledTimes(
      1 + STREAM_RETRY_CONFIG.MaxAttempts,
    );
  });

  it('reads on changes only, with no timer while a chase runs', async () => {
    const getChaseOrders = vi.fn().mockResolvedValue([chase('h1', 'active')]);

    const stop = createLiveChaseOrderList({
      source: { getChaseOrders, subscribeToChaseOrderChanges },
      callback: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(getChaseOrders).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    await change();
    expect(getChaseOrders).toHaveBeenCalledTimes(2);
    stop();
    await change();
    expect(getChaseOrders).toHaveBeenCalledTimes(2);
  });

  it('settles a chase a read omits without another change', async () => {
    const getChaseOrders = vi
      .fn()
      .mockResolvedValueOnce([chase('h1', 'active')])
      .mockResolvedValue([]);
    const callback = vi.fn();
    createLiveChaseOrderList({
      source: { getChaseOrders, subscribeToChaseOrderChanges },
      callback,
    });

    await change();
    await vi.advanceTimersByTimeAsync(3_600_000);

    expect(callback).toHaveBeenLastCalledWith({ running: [], history: [] });
    expect(getChaseOrders).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
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
      source: { getChaseOrders, subscribeToChaseOrderChanges },
      callback,
    });
    stop();
    resolveRead?.([chase('h1', 'active')]);
    await change(2);

    expect(getChaseOrders).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();
  });
});
