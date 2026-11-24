import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  StreamChannelManager,
  WebSocketConnectionState,
} from '../src/index.js';
import type { StreamChannelSource } from '../src/index.js';

type Source = StreamChannelSource<[number]> & {
  emit: (value: number) => void;
  fail: (error: Error) => void;
  opens: number;
  stops: number;
};

function createSource(
  options: Partial<StreamChannelSource<[number]>> = {},
): Source {
  const source: Source = {
    ...options,
    emit: () => undefined,
    fail: () => undefined,
    opens: 0,
    stops: 0,
    open(emit, fail) {
      source.opens += 1;
      source.emit = (value): void => emit(value);
      source.fail = fail;
      return () => {
        source.stops += 1;
      };
    },
  };
  return source;
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('StreamChannelManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one venue subscription per key and stops it with the last subscriber', () => {
    const manager = new StreamChannelManager();
    const source = createSource();
    const first = vi.fn();
    const second = vi.fn();
    const key = { stream: 'prices', options: { symbols: ['BTC'] } };

    const leaveFirst = manager.subscribe(key, source, { callback: first });
    const leaveSecond = manager.subscribe(
      { options: { symbols: ['BTC'] }, stream: 'prices' },
      source,
      { callback: second },
    );
    source.emit(1);

    expect(source.opens).toBe(1);
    expect(first).toHaveBeenCalledWith(1);
    expect(second).toHaveBeenCalledWith(1);

    leaveFirst();
    expect(source.stops).toBe(0);
    leaveSecond();
    expect(source.stops).toBe(1);
    expect(manager.size).toBe(0);
  });

  it('opens a separate channel for each key', () => {
    const manager = new StreamChannelManager();
    const btc = createSource();
    const eth = createSource();

    manager.subscribe({ stream: 'book', symbol: 'BTC' }, btc, {
      callback: vi.fn(),
    });
    manager.subscribe({ stream: 'book', symbol: 'ETH' }, eth, {
      callback: vi.fn(),
    });

    expect(btc.opens).toBe(1);
    expect(eth.opens).toBe(1);
    expect(manager.size).toBe(2);
  });

  it('replays the last value to a late subscriber after subscribe returns', async () => {
    const manager = new StreamChannelManager();
    const source = createSource();
    manager.subscribe({ stream: 'positions' }, source, { callback: vi.fn() });
    source.emit(7);

    const late = vi.fn();
    manager.subscribe({ stream: 'positions' }, source, { callback: late });

    expect(late).not.toHaveBeenCalled();
    await flush();
    expect(late).toHaveBeenCalledWith(7);
    expect(manager.getLast({ stream: 'positions' })).toStrictEqual([7]);
  });

  it('does not replay event streams', async () => {
    const manager = new StreamChannelManager();
    const source = createSource({ replay: false });
    manager.subscribe({ stream: 'fills' }, source, { callback: vi.fn() });
    source.emit(1);

    const late = vi.fn();
    manager.subscribe({ stream: 'fills' }, source, { callback: late });
    await flush();

    expect(late).not.toHaveBeenCalled();
  });

  it('throttles each subscriber on its own and delivers the latest value', () => {
    vi.useFakeTimers();
    const manager = new StreamChannelManager();
    const source = createSource();
    const fast = vi.fn();
    const slow = vi.fn();
    manager.subscribe({ stream: 'book' }, source, { callback: fast });
    manager.subscribe({ stream: 'book' }, source, {
      callback: slow,
      throttleMs: 500,
    });

    source.emit(1);
    source.emit(2);
    source.emit(3);

    expect(fast).toHaveBeenCalledTimes(3);
    expect(slow.mock.calls).toStrictEqual([[1]]);
    vi.advanceTimersByTime(500);
    expect(slow.mock.calls).toStrictEqual([[1], [3]]);
  });

  it('cancels a pending throttled delivery when the subscriber leaves', () => {
    vi.useFakeTimers();
    const manager = new StreamChannelManager();
    const source = createSource();
    const slow = vi.fn();
    manager.subscribe({ stream: 'book' }, source, { callback: vi.fn() });
    const leave = manager.subscribe({ stream: 'book' }, source, {
      callback: slow,
      throttleMs: 500,
    });

    source.emit(1);
    source.emit(2);
    leave();
    vi.advanceTimersByTime(500);

    expect(slow.mock.calls).toStrictEqual([[1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  const disconnected = (): StreamChannelManager =>
    new StreamChannelManager({
      subscribeToConnectionState: (listener) => {
        listener(WebSocketConnectionState.Disconnected);
        return () => undefined;
      },
    });

  it('seeds a channel that opens while disconnected', async () => {
    const manager = disconnected();
    const source = createSource({ read: async () => [5] });
    const callback = vi.fn();

    manager.subscribe({ stream: 'account' }, source, { callback });
    await flush();

    expect(callback).toHaveBeenCalledWith(5);
  });

  it('does not read REST for a channel that opens while connected', async () => {
    const read = vi.fn(async (): Promise<[number]> => [5]);
    const manager = new StreamChannelManager({
      subscribeToConnectionState: (listener): (() => void) => {
        listener(WebSocketConnectionState.Connected);
        return () => undefined;
      },
    });

    manager.subscribe({ stream: 'account' }, createSource({ read }), {
      callback: vi.fn(),
    });
    await flush();

    expect(read).not.toHaveBeenCalled();
  });

  it('never lets a seed read overwrite a newer push', async () => {
    const manager = disconnected();
    let settle: (value: [number]) => void = () => undefined;
    const source = createSource({
      read: async () =>
        new Promise<[number]>((resolve) => {
          settle = resolve;
        }),
    });
    const callback = vi.fn();

    manager.subscribe({ stream: 'account' }, source, { callback });
    source.emit(9);
    settle([1]);
    await flush();

    expect(callback.mock.calls).toStrictEqual([[9]]);
  });

  it('reads REST once per connection drop and never on a timer', async () => {
    vi.useFakeTimers();
    let setState: (state: WebSocketConnectionState) => void = () => undefined;
    const stopWatch = vi.fn();
    const manager = new StreamChannelManager({
      subscribeToConnectionState: (listener): (() => void) => {
        setState = listener;
        return stopWatch;
      },
    });
    const read = vi.fn(async (): Promise<[number]> => [2]);
    const source = createSource({ read });
    const callback = vi.fn();

    const leave = manager.subscribe({ stream: 'orders' }, source, { callback });
    setState(WebSocketConnectionState.Connected);
    await flush();
    expect(read).not.toHaveBeenCalled();

    setState(WebSocketConnectionState.Disconnected);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(2);
    expect(vi.getTimerCount()).toBe(0);

    setState(WebSocketConnectionState.Connecting);
    await flush();
    expect(read).toHaveBeenCalledTimes(1);

    leave();
    expect(stopWatch).toHaveBeenCalledTimes(1);
  });

  it('reopens a reopen-on-reconnect channel once when the connection returns', () => {
    let setState: (state: WebSocketConnectionState) => void = () => undefined;
    const manager = new StreamChannelManager({
      subscribeToConnectionState: (listener) => {
        setState = listener;
        return (): void => undefined;
      },
    });
    const book = createSource({ reopenOnReconnect: true });
    const account = createSource();
    manager.subscribe({ stream: 'book' }, book, { callback: vi.fn() });
    manager.subscribe({ stream: 'book' }, book, { callback: vi.fn() });
    manager.subscribe({ stream: 'account' }, account, { callback: vi.fn() });

    setState(WebSocketConnectionState.Connected);
    expect(book.opens).toBe(1);
    setState(WebSocketConnectionState.Disconnected);
    setState(WebSocketConnectionState.Connecting);
    setState(WebSocketConnectionState.Connected);
    setState(WebSocketConnectionState.Connected);

    expect(book.stops).toBe(1);
    expect(book.opens).toBe(2);
    expect(account.opens).toBe(1);
  });

  it('detaches a failed channel: its readers keep it, the next subscribe opens a fresh source, and it is never reopened', () => {
    let setState: (state: WebSocketConnectionState) => void = () => undefined;
    const manager = new StreamChannelManager({
      subscribeToConnectionState: (listener): (() => void) => {
        setState = listener;
        return () => undefined;
      },
    });
    const failed = createSource({ reopenOnReconnect: true });
    const fresh = createSource({ reopenOnReconnect: true });
    const holder = vi.fn();
    const onError = vi.fn();
    const stopHolder = manager.subscribe({ stream: 'book' }, failed, {
      callback: holder,
      onError,
    });
    const stopRetried = manager.subscribe({ stream: 'book' }, failed, {
      callback: vi.fn(),
      onError,
    });
    setState(WebSocketConnectionState.Connected);
    failed.emit(4);

    failed.fail(new Error('closed'));
    stopRetried();
    const retried = vi.fn();
    const stopRetry = manager.subscribe({ stream: 'book' }, fresh, {
      callback: retried,
    });
    failed.emit(5);
    fresh.emit(6);
    setState(WebSocketConnectionState.Disconnected);
    setState(WebSocketConnectionState.Connected);

    expect(onError.mock.calls).toStrictEqual([
      [new Error('closed')],
      [new Error('closed')],
    ]);
    expect(holder.mock.calls).toStrictEqual([[4], [5]]);
    expect(retried.mock.calls).toStrictEqual([[6]]);
    expect(manager.getLast({ stream: 'book' })).toStrictEqual([6]);
    // Only the attached channel is reopened on reconnect.
    expect(failed.opens).toBe(1);
    expect(fresh.opens).toBe(2);
    stopHolder();
    expect(failed.stops).toBe(1);
    stopRetry();
    expect(fresh.stops).toBe(2);
  });

  it('isolates a throwing subscriber', () => {
    const onError = vi.fn();
    const manager = new StreamChannelManager({ onError });
    const source = createSource();
    const healthy = vi.fn();
    manager.subscribe({ stream: 'prices' }, source, {
      callback: (_value: number) => {
        throw new Error('render failed');
      },
    });
    manager.subscribe({ stream: 'prices' }, source, { callback: healthy });

    source.emit(1);

    expect(healthy).toHaveBeenCalledWith(1);
    expect(onError).toHaveBeenCalledWith(new Error('render failed'));
  });

  it('stops every channel on clear', () => {
    const manager = new StreamChannelManager();
    const source = createSource();
    const callback = vi.fn();
    const leave = manager.subscribe({ stream: 'prices' }, source, { callback });

    manager.clear();
    source.emit(1);
    leave();

    expect(source.stops).toBe(1);
    expect(callback).not.toHaveBeenCalled();
    expect(manager.size).toBe(0);
  });

  describe('rebind', () => {
    it('moves a stale channel to its next key, resets its readers and reopens it', () => {
      const manager = new StreamChannelManager();
      const source = createSource();
      const callback = vi.fn();
      const onReset = vi.fn();
      const leave = manager.subscribe(
        { stream: 'positions', accountId: 'a' },
        source,
        {
          callback,
          onReset,
        },
      );
      source.emit(1);

      manager.rebind(
        (key) => key.accountId === 'b',
        (key) => ({ ...key, accountId: 'b' }),
      );

      expect(source.stops).toBe(1);
      expect(source.opens).toBe(2);
      expect(onReset).toHaveBeenCalledTimes(1);
      expect(
        manager.getLast({ stream: 'positions', accountId: 'a' }),
      ).toBeUndefined();
      expect(
        manager.getLast({ stream: 'positions', accountId: 'b' }),
      ).toBeUndefined();
      source.emit(2);
      expect(callback.mock.calls).toStrictEqual([[1], [2]]);
      expect(
        manager.getLast({ stream: 'positions', accountId: 'b' }),
      ).toStrictEqual([2]);

      leave();
      expect(source.stops).toBe(2);
      expect(manager.size).toBe(0);
    });

    it('merges readers into a channel already open on the next key', async () => {
      const manager = new StreamChannelManager();
      const stale = createSource();
      const current = createSource();
      const moved = vi.fn();
      const leaveMoved = manager.subscribe(
        { stream: 'prices', providerId: '1' },
        stale,
        {
          callback: moved,
        },
      );
      const leaveCurrent = manager.subscribe(
        { stream: 'prices', providerId: '2' },
        current,
        { callback: vi.fn() },
      );
      current.emit(5);

      manager.rebind(
        (key) => key.providerId === '2',
        (key) => ({ ...key, providerId: '2' }),
      );
      await flush();

      expect(stale.stops).toBe(1);
      expect(current.opens).toBe(1);
      expect(manager.size).toBe(1);
      expect(moved).toHaveBeenLastCalledWith(5);
      leaveCurrent();
      expect(current.stops).toBe(0);
      leaveMoved();
      expect(current.stops).toBe(1);
    });

    it('leaves current channels untouched and skips the reset when there was no value', () => {
      const manager = new StreamChannelManager();
      const current = createSource();
      const empty = createSource();
      const onReset = vi.fn();
      manager.subscribe({ stream: 'prices', providerId: '2' }, current, {
        callback: vi.fn(),
      });
      manager.subscribe({ stream: 'orders', providerId: '1' }, empty, {
        callback: vi.fn(),
        onReset,
      });

      manager.rebind(
        (key) => key.providerId === '2',
        (key) => ({ ...key, providerId: '2' }),
      );

      expect(current.opens).toBe(1);
      expect(current.stops).toBe(0);
      expect(empty.opens).toBe(2);
      expect(onReset).not.toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('keeps the latest value while paused and delivers it once on release', () => {
      const manager = new StreamChannelManager();
      const source = createSource();
      const callback = vi.fn();
      manager.subscribe({ stream: 'orders' }, source, { callback });
      const prices = createSource();
      const priceCallback = vi.fn();
      manager.subscribe({ stream: 'prices' }, prices, {
        callback: priceCallback,
      });

      const release = manager.pause('orders');
      source.emit(1);
      source.emit(2);
      prices.emit(9);

      expect(callback).not.toHaveBeenCalled();
      expect(priceCallback).toHaveBeenCalledWith(9);
      expect(manager.getLast({ stream: 'orders' })).toStrictEqual([2]);

      release();
      release();
      expect(callback.mock.calls).toStrictEqual([[2]]);
      source.emit(3);
      expect(callback).toHaveBeenLastCalledWith(3);
    });

    it('flushes only when the last of nested pauses is released', () => {
      const manager = new StreamChannelManager();
      const source = createSource();
      const callback = vi.fn();
      manager.subscribe({ stream: 'orders' }, source, { callback });

      const outer = manager.pause('orders');
      const inner = manager.pause('orders');
      source.emit(1);
      inner();
      expect(callback).not.toHaveBeenCalled();
      outer();
      expect(callback.mock.calls).toStrictEqual([[1]]);
    });

    it('delivers nothing on release when no value arrived while paused', () => {
      const manager = new StreamChannelManager();
      const source = createSource();
      const callback = vi.fn();
      manager.subscribe({ stream: 'orders' }, source, { callback });
      source.emit(1);

      manager.pause('orders')();

      expect(callback.mock.calls).toStrictEqual([[1]]);
    });

    it('drops a pending throttled delivery and sends the latest value on release', () => {
      vi.useFakeTimers();
      const manager = new StreamChannelManager();
      const source = createSource();
      const callback = vi.fn();
      manager.subscribe({ stream: 'orders' }, source, {
        callback,
        throttleMs: 1_000,
      });
      source.emit(1);
      source.emit(2);

      const release = manager.pause('orders');
      source.emit(3);
      vi.advanceTimersByTime(1_000);
      expect(callback.mock.calls).toStrictEqual([[1]]);

      release();
      vi.advanceTimersByTime(1_000);
      expect(callback.mock.calls).toStrictEqual([[1], [3]]);
    });
  });

  it('sends a throttled value that came due during a pause on release', () => {
    vi.useFakeTimers();
    const manager = new StreamChannelManager();
    const source = createSource();
    const callback = vi.fn();
    manager.subscribe({ stream: 'orders' }, source, {
      callback,
      throttleMs: 1_000,
    });
    source.emit(1);
    source.emit(2);

    const release = manager.pause('orders');
    vi.advanceTimersByTime(1_000);
    release();

    expect(callback.mock.calls).toStrictEqual([[1], [2]]);
  });

  it('reopens every open source on reopenAll and keeps readers and the last value', () => {
    const manager = new StreamChannelManager();
    const source = createSource();
    const callback = vi.fn();
    manager.subscribe({ stream: 'prices' }, source, { callback });
    source.emit(1);

    manager.reopenAll();

    expect(source.stops).toBe(1);
    expect(source.opens).toBe(2);
    expect(manager.getLast({ stream: 'prices' })).toStrictEqual([1]);
    source.emit(2);
    expect(callback).toHaveBeenLastCalledWith(2);
  });
});
