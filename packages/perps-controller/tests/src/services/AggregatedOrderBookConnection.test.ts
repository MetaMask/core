import * as hl from '@nktkas/hyperliquid';

import { HYPERLIQUID_TRANSPORT_CONFIG } from '../../../src/constants/hyperLiquidConfig';
import {
  AggregatedOrderBookConnection,
  processAggregatedOrderBook,
} from '../../../src/services/AggregatedOrderBookConnection';

/**
 * Mirrors the reconnecting socket: a `terminationSignal` plus a helper that
 * reproduces permanent termination (abort the signal, then a final `close`).
 */
type MockSocket = EventTarget & {
  terminationSignal: AbortSignal;
  /** Simulate permanent termination with the given `ReconnectingWebSocketError` code. */
  terminate: (code?: string) => void;
};

type MockTransport = {
  options: Record<string, unknown>;
  close: jest.Mock;
  socket: MockSocket;
  subscribe: jest.Mock;
};
/** Invokes the connection's listener with the raw snapshot (wrapped as `detail`). */
type L2Emit = (data: unknown) => void;

type MockState = {
  transports: MockTransport[];
  listeners: {
    channel: string;
    params: unknown;
    listener: L2Emit;
    /** The SDK's post-confirmation failure callback, if the caller passed one. */
    onError?: (error: Error) => void;
  }[];
  unsubscribe: jest.Mock;
  resolveSubscribe: boolean;
  rejectSubscribe: boolean;
};

jest.mock('@nktkas/hyperliquid', () => {
  const state: MockState = {
    transports: [],
    listeners: [],
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    resolveSubscribe: true,
    rejectSubscribe: false,
  };

  // Reproduces the reconnecting socket's termination model: permanent
  // termination aborts `terminationSignal` (reason carries a `code`) *before*
  // the final `close` event fires — never a standalone `terminate` event.
  class MockSocket extends EventTarget {
    readonly #abortController = new AbortController();

    get terminationSignal(): AbortSignal {
      return this.#abortController.signal;
    }

    terminate(code = 'RECONNECTION_LIMIT'): void {
      if (!this.#abortController.signal.aborted) {
        this.#abortController.abort({ code });
      }
      this.dispatchEvent(new Event('close'));
    }
  }

  class WebSocketTransport {
    options: Record<string, unknown>;

    close = jest.fn();

    socket = new MockSocket();

    subscribe = jest.fn(
      (
        channel: string,
        params: unknown,
        listener: (event: { detail: unknown }) => void,
        options?: { onError?: (error: Error) => void },
      ) => {
        // Store an emitter that mirrors the SDK's CustomEvent delivery so tests
        // can push a raw snapshot via `listeners[i].listener(rawData)`, plus the
        // SDK's post-confirmation `onError` callback so tests can simulate a
        // rejected re-subscription via `listeners[i].onError(err)`.
        state.listeners.push({
          channel,
          params,
          listener: (detail: unknown) => listener({ detail }),
          onError: options?.onError,
        });
        if (state.rejectSubscribe) {
          return Promise.reject(new Error('subscribe failed'));
        }
        return state.resolveSubscribe
          ? Promise.resolve({ unsubscribe: state.unsubscribe })
          : new Promise(() => undefined);
      },
    );

    constructor(options: Record<string, unknown>) {
      this.options = options;
      state.transports.push(this as unknown as MockTransport);
    }
  }

  type SubscribingTransport = {
    subscribe: (
      channel: string,
      params: unknown,
      listener: (event: { detail: unknown }) => void,
      options?: { onError?: (error: Error) => void },
    ) => Promise<unknown>;
  };

  // Mirrors the typed subscription client: `l2Book` validates/normalizes the
  // params, prepends `type: 'l2Book'`, and delegates to `transport.subscribe`,
  // unwrapping the CustomEvent so the caller's listener receives the snapshot
  // directly. Forwards `options` (`onError`) unchanged.
  class SubscriptionClient {
    readonly #transport: SubscribingTransport;

    constructor({ transport }: { transport: SubscribingTransport }) {
      this.#transport = transport;
    }

    async l2Book(
      params: Record<string, unknown>,
      listener: (data: unknown) => void,
      options?: { onError?: (error: Error) => void },
    ): Promise<unknown> {
      return this.#transport.subscribe(
        'l2Book',
        { type: 'l2Book', ...params },
        (event) => listener(event.detail),
        options,
      );
    }
  }

  return { WebSocketTransport, SubscriptionClient, mockState: state };
});

const { mockState } = hl as unknown as { mockState: MockState };

const flush = async (): Promise<void> => {
  // Drain a few microtasks so both the resolve (.then) and reject (.then skip
  // → .catch) branches of the subscribe promise chain settle.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

const l2Level = (
  px: string,
  sz: string,
  count = 1,
): { px: string; sz: string; n: number } => ({ px, sz, n: count });

describe('processAggregatedOrderBook', () => {
  it('builds cumulative totals, spread, and mid price from an l2Book snapshot', () => {
    const result = processAggregatedOrderBook(
      {
        coin: 'BTC',
        time: 1,
        levels: [
          [l2Level('64000', '2'), l2Level('63000', '1')],
          [l2Level('65000', '1'), l2Level('66000', '3')],
        ],
      },
      10,
    );

    expect(result.bids).toStrictEqual([
      {
        price: '64000',
        size: '2',
        total: '2',
        notional: '128000.00',
        totalNotional: '128000.00',
      },
      {
        price: '63000',
        size: '1',
        total: '3',
        notional: '63000.00',
        totalNotional: '191000.00',
      },
    ]);
    expect(result.asks[0]).toStrictEqual({
      price: '65000',
      size: '1',
      total: '1',
      notional: '65000.00',
      totalNotional: '65000.00',
    });
    // spread = 65000 - 64000, mid = (65000 + 64000) / 2
    expect(result.spread).toBe('1000.00000');
    expect(result.midPrice).toBe('64500.00000');
    expect(result.maxTotal).toBe('4');
  });

  it('trims each side to the requested level count', () => {
    const result = processAggregatedOrderBook(
      {
        coin: 'BTC',
        time: 1,
        levels: [
          [l2Level('3', '1'), l2Level('2', '1'), l2Level('1', '1')],
          [l2Level('4', '1'), l2Level('5', '1'), l2Level('6', '1')],
        ],
      },
      2,
    );

    expect(result.bids).toHaveLength(2);
    expect(result.asks).toHaveLength(2);
  });

  it('reports a zero spread when a side is empty', () => {
    const result = processAggregatedOrderBook(
      { coin: 'BTC', time: 1, levels: [[], []] },
      10,
    );
    expect(result.spread).toBe('0.00000');
    expect(result.spreadPercentage).toBe('0');
    expect(result.midPrice).toBe('0.00000');
  });
});

describe('AggregatedOrderBookConnection', () => {
  beforeEach(() => {
    mockState.transports.length = 0;
    mockState.listeners.length = 0;
    // `resetMocks: true` (repo jest config) clears the shared mock's
    // implementation before each test, so re-apply the resolved value.
    mockState.unsubscribe.mockReset().mockResolvedValue(undefined);
    mockState.resolveSubscribe = true;
    mockState.rejectSubscribe = false;
  });

  it('creates a mainnet transport and subscribes with the requested params', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    const callback = jest.fn();

    connection.subscribe({
      symbol: 'BTC',
      levels: 20,
      nSigFigs: 2,
      callback,
    });

    expect(mockState.transports).toHaveLength(1);
    // The dedicated transport reuses the package's transport config so it shares
    // the finite five-attempt reconnection policy (not the SDK's Infinity).
    expect(mockState.transports[0].options).toStrictEqual({
      isTestnet: false,
      ...HYPERLIQUID_TRANSPORT_CONFIG,
      reconnect: HYPERLIQUID_TRANSPORT_CONFIG.reconnect,
    });
    expect(mockState.listeners[0].channel).toBe('l2Book');
    // Runs in fast mode (5 levels) via the raw subscription payload.
    expect(mockState.listeners[0].params).toStrictEqual({
      type: 'l2Book',
      coin: 'BTC',
      nSigFigs: 2,
      mantissa: null,
      fast: true,
    });
  });

  it('creates a testnet transport when isTestnet resolves true', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => true,
    });
    connection.subscribe({ symbol: 'ETH', nSigFigs: 2, callback: jest.fn() });
    expect(mockState.transports[0].options).toStrictEqual({
      isTestnet: true,
      ...HYPERLIQUID_TRANSPORT_CONFIG,
      reconnect: HYPERLIQUID_TRANSPORT_CONFIG.reconnect,
    });
  });

  it('transforms snapshots and forwards them to the callback', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    const callback = jest.fn();
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback });

    mockState.listeners[0].listener({
      coin: 'BTC',
      time: 1,
      levels: [[l2Level('64000', '1')], [l2Level('65000', '1')]],
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].midPrice).toBe('64500.00000');
  });

  it('ignores snapshots for a different coin', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    const callback = jest.fn();
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback });

    mockState.listeners[0].listener({
      coin: 'ETH',
      time: 1,
      levels: [[l2Level('1', '1')], [l2Level('2', '1')]],
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('reuses the same transport for a second subscription on the same network', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });
    connection.subscribe({ symbol: 'ETH', nSigFigs: 2, callback: jest.fn() });

    expect(mockState.transports).toHaveLength(1);
    expect(mockState.transports[0].subscribe).toHaveBeenCalledTimes(2);
  });

  it('rejects a second subscription for the same asset with different params', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });

    expect(() =>
      connection.subscribe({ symbol: 'BTC', nSigFigs: 5, callback: jest.fn() }),
    ).toThrow(
      'AggregatedOrderBookConnection: "BTC" is already subscribed with different params',
    );
    // The conflicting subscribe must not reach the transport.
    expect(mockState.transports[0].subscribe).toHaveBeenCalledTimes(1);
  });

  it('allows a repeat subscription for the same asset with identical params', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });

    expect(() =>
      connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() }),
    ).not.toThrow();
    expect(mockState.transports).toHaveLength(1);
    expect(mockState.transports[0].subscribe).toHaveBeenCalledTimes(2);
  });

  it('treats a different levels value as identical (levels is client-side only)', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    connection.subscribe({
      symbol: 'BTC',
      nSigFigs: 2,
      levels: 5,
      callback: jest.fn(),
    });

    expect(() =>
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        levels: 20,
        callback: jest.fn(),
      }),
    ).not.toThrow();
  });

  it('allows different params for the same asset once the prior subscription is removed', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    const unsub = connection.subscribe({
      symbol: 'BTC',
      nSigFigs: 2,
      callback: jest.fn(),
    });
    unsub();

    expect(() =>
      connection.subscribe({ symbol: 'BTC', nSigFigs: 5, callback: jest.fn() }),
    ).not.toThrow();
  });

  it('closes the transport once the last subscription is removed', async () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    const unsubA = connection.subscribe({
      symbol: 'BTC',
      nSigFigs: 2,
      callback: jest.fn(),
    });
    const unsubB = connection.subscribe({
      symbol: 'ETH',
      nSigFigs: 2,
      callback: jest.fn(),
    });
    await flush();

    const [transport] = mockState.transports;

    unsubA();
    expect(transport.close).not.toHaveBeenCalled();

    unsubB();
    expect(transport.close).toHaveBeenCalledTimes(1);
    // The pending SDK subscriptions are also cancelled.
    expect(mockState.unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('recreates the transport when the network changes between subscriptions', () => {
    let testnet = false;
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => testnet,
    });
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });
    expect(mockState.transports).toHaveLength(1);

    testnet = true;
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });
    expect(mockState.transports).toHaveLength(2);
    expect(mockState.transports[0].close).toHaveBeenCalledTimes(1);
    expect(mockState.transports[1].options).toStrictEqual({
      isTestnet: true,
      ...HYPERLIQUID_TRANSPORT_CONFIG,
      reconnect: HYPERLIQUID_TRANSPORT_CONFIG.reconnect,
    });
  });

  it('does not tear down the new transport when an old subscription unsubscribes after a network change', () => {
    let testnet = false;
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => testnet,
    });
    const unsubOld = connection.subscribe({
      symbol: 'BTC',
      nSigFigs: 2,
      callback: jest.fn(),
    });

    // Network flips, so the next subscribe recreates the transport.
    testnet = true;
    const unsubNew = connection.subscribe({
      symbol: 'BTC',
      nSigFigs: 2,
      callback: jest.fn(),
    });
    expect(mockState.transports).toHaveLength(2);
    const [, newTransport] = mockState.transports;

    // The stale subscription's unsubscribe must not touch the live socket.
    unsubOld();
    expect(newTransport.close).not.toHaveBeenCalled();

    // The remaining live subscription still owns the socket and closes it.
    unsubNew();
    expect(newTransport.close).toHaveBeenCalledTimes(1);
  });

  it('cancels a subscription that resolves after unsubscribe', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    const callback = jest.fn();
    const unsub = connection.subscribe({
      symbol: 'BTC',
      nSigFigs: 2,
      callback,
    });

    // Unsubscribe before the snapshot listener is invoked.
    unsub();

    mockState.listeners[0].listener({
      coin: 'BTC',
      time: 1,
      levels: [[l2Level('1', '1')], [l2Level('2', '1')]],
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('closes the active transport on close()', () => {
    const connection = new AggregatedOrderBookConnection({
      isTestnet: (): boolean => false,
    });
    connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });
    connection.close();
    expect(mockState.transports[0].close).toHaveBeenCalledTimes(1);
  });

  describe('connection status', () => {
    it('reports connecting immediately then connected once the subscription resolves', async () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });

      expect(onStatusChange).toHaveBeenNthCalledWith(1, 'connecting');
      await flush();
      expect(onStatusChange).toHaveBeenCalledWith('connected');
    });

    it('reports connected on socket open and connecting on socket close', () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });
      const { socket } = mockState.transports[0];

      socket.dispatchEvent(new Event('open'));
      expect(onStatusChange).toHaveBeenCalledWith('connected');

      socket.dispatchEvent(new Event('close'));
      expect(onStatusChange).toHaveBeenLastCalledWith('connecting');
    });

    it('reports error when the socket terminates (reconnection exhausted)', () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });

      // Reconnection exhausted: the socket aborts its `terminationSignal` then
      // dispatches a final `close`.
      mockState.transports[0].socket.terminate();
      expect(onStatusChange).toHaveBeenLastCalledWith('error');
    });

    it('reports connecting (not error) when close fires from an intentional close()', () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });

      // A user-triggered close aborts the signal with `TERMINATED_BY_USER`; that
      // must not be surfaced as the unrecoverable `error` state.
      mockState.transports[0].socket.terminate('TERMINATED_BY_USER');
      expect(onStatusChange).toHaveBeenLastCalledWith('connecting');
      expect(onStatusChange).not.toHaveBeenCalledWith('error');
    });

    it('stays in error (not connected) when the subscribe promise resolves after the socket terminates', async () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });

      // Reconnection is exhausted before the pending subscribe promise settles.
      mockState.transports[0].socket.terminate();
      expect(onStatusChange).toHaveBeenLastCalledWith('error');

      // The pending subscribe promise now resolves; it must not flip the UI back
      // to `connected` on the dead socket.
      await flush();
      expect(onStatusChange).toHaveBeenLastCalledWith('error');
      expect(onStatusChange).not.toHaveBeenCalledWith('connected');
    });

    it('errors and tears down when a confirmed subscription is rejected on resubscribe', async () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });

      // The subscription is confirmed first.
      await flush();
      expect(onStatusChange).toHaveBeenLastCalledWith('connected');

      // After a reconnect the server rejects the re-subscription: the SDK
      // invokes `onError` and removes the listener (no further events follow).
      // The service must surface `error` and tear down rather than keep
      // reporting `connected` with a frozen order book.
      mockState.listeners[0].onError?.(new Error('resubscribe rejected'));

      expect(onStatusChange).toHaveBeenLastCalledWith('error');
      expect(mockState.transports[0].close).toHaveBeenCalledTimes(1);
    });

    it('does not report connected when the transport is replaced before an in-flight subscribe resolves', async () => {
      let testnet = false;
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => testnet,
      });
      const onStatusChangeOld = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange: onStatusChangeOld,
      });

      // Flip the network before the first subscribe settles: this recreates the
      // transport, so the first (still-pending) subscription is now stale.
      testnet = true;
      const onStatusChangeNew = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange: onStatusChangeNew,
      });
      expect(mockState.transports).toHaveLength(2);

      await flush();

      // The stale subscription must not announce `connected` on the dead socket,
      // and its SDK subscription is cleaned up rather than stored.
      expect(onStatusChangeOld).not.toHaveBeenCalledWith('connected');
      expect(mockState.unsubscribe).toHaveBeenCalled();
      // The live subscription on the new transport still reports connected.
      expect(onStatusChangeNew).toHaveBeenLastCalledWith('connected');
    });

    it('reports error when the subscription request rejects', async () => {
      mockState.rejectSubscribe = true;
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });

      await flush();
      expect(onStatusChange).toHaveBeenLastCalledWith('error');
    });

    it('releases the refcount and closes the transport when the subscription request rejects', async () => {
      mockState.rejectSubscribe = true;
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const unsub = connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
      });

      await flush();

      // The failed subscribe must not leave the dedicated socket open.
      expect(mockState.transports[0].close).toHaveBeenCalledTimes(1);

      // A subsequent unsubscribe is a no-op and must not double-close.
      unsub();
      expect(mockState.transports[0].close).toHaveBeenCalledTimes(1);
    });

    it('stops reporting status after unsubscribe', () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const onStatusChange = jest.fn();
      const unsub = connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
        onStatusChange,
      });
      const { socket } = mockState.transports[0];
      unsub();
      onStatusChange.mockClear();

      socket.terminate();
      expect(onStatusChange).not.toHaveBeenCalled();
    });

    it('builds a fresh transport when resubscribing after a terminated socket', () => {
      const connection = new AggregatedOrderBookConnection({
        isTestnet: (): boolean => false,
      });
      const unsub = connection.subscribe({
        symbol: 'BTC',
        nSigFigs: 2,
        callback: jest.fn(),
      });
      mockState.transports[0].socket.terminate();

      // Reconnect flow: tear the dead subscription down, then resubscribe.
      unsub();
      connection.subscribe({ symbol: 'BTC', nSigFigs: 2, callback: jest.fn() });

      expect(mockState.transports).toHaveLength(2);
      expect(mockState.transports[0].close).toHaveBeenCalledTimes(1);
    });
  });
});
