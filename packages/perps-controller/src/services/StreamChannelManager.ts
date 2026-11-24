import { WebSocketConnectionState } from '../types/index.js';

/**
 * What one shared stream is: the stream name plus everything its source
 * reads. Two subscriptions with equal keys share one venue subscription.
 */
export type StreamChannelKey = {
  /** Stream name, such as `prices` or `orderBook`. */
  stream: string;
  /** Provider route, or the default route when omitted. */
  providerId?: string;
  /** Account, or the selected account when omitted. */
  accountId?: string;
  /** Market, for market streams. */
  symbol?: string;
  /** Any other option the source reads. Functions are ignored. */
  options?: Record<string, unknown>;
};

/**
 * The venue subscription behind a channel. `open` runs once for the first
 * subscriber and its cleanup once the last one leaves.
 */
export type StreamChannelSource<Args extends unknown[]> = {
  /**
   * Open the live stream.
   *
   * @param emit - Delivers a value to every subscriber.
   * @param fail - Reports a stream failure, with any detail the source adds
   * (such as the failing venue); the last value stays current.
   * @param key - The key the channel opens under, which changes on `rebind`.
   * @returns Cleanup that stops the stream.
   */
  open(
    emit: (...args: Args) => void,
    fail: (error: Error, ...detail: unknown[]) => void,
    key: StreamChannelKey,
  ): () => void;
  /**
   * One REST read for while the stream is down: it seeds a channel that opens
   * while the transport is disconnected, and runs once each time the
   * connection drops. It is never repeated on a timer.
   * Resolving `undefined` delivers nothing.
   *
   * @param key - The channel's current key.
   */
  read?(key: StreamChannelKey): Promise<Args | undefined>;
  /**
   * Deliver the last value to a subscriber that joins an open channel.
   * Defaults to true; turn it off for event streams, such as fills, where a
   * replay would repeat an event.
   */
  replay?: boolean;
  /**
   * Stop and reopen the venue subscription when the connection comes back
   * after a drop, for streams the transport does not restore by itself. The
   * channel stays the one owner of that resubscribe, whatever its reader count.
   */
  reopenOnReconnect?: boolean;
};

/** One reader of a channel. */
export type StreamChannelSubscriber<Args extends unknown[]> = {
  /** Receives each value, at most once per `throttleMs` when set. */
  callback: (...args: Args) => void;
  /** Receives stream and seed-read failures. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onError?: (error: Error, ...detail: any[]) => void;
  /** Minimum time between two deliveries to this subscriber. */
  throttleMs?: number;
  /**
   * Called when the channel moves to another context (provider or account)
   * and its last value no longer applies. The next delivery is the new
   * context's data.
   */
  onReset?: () => void;
};

/** Watches the transport the channels stream on. */
export type StreamConnectionWatcher = (
  listener: (state: WebSocketConnectionState) => void,
) => () => void;

export type StreamChannelManagerOptions = {
  /** Connection state source; a drop triggers each channel's `read`. */
  subscribeToConnectionState?: StreamConnectionWatcher;
  /** Receives subscriber callback failures, which never reach the venue. */
  onError?: (error: unknown) => void;
};

type Reader = {
  subscriber: StreamChannelSubscriber<unknown[]>;
  /** The channel the reader is on; it changes when channels rebind. */
  channel: Channel;
  lastDeliveredAt: number;
  pending: unknown[] | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
};

type Channel = {
  /** Serialized key the channel is filed under. */
  id: string;
  key: StreamChannelKey;
  source: StreamChannelSource<unknown[]>;
  readers: Set<Reader>;
  last: unknown[] | undefined;
  /** Bumped on every delivery so a stale seed read never overwrites a push. */
  version: number;
  stop: () => void;
  closed: boolean;
  /** A value arrived while the stream was paused and was not delivered. */
  suppressed: boolean;
};

/**
 * Serialize a key so equal keys match regardless of property order.
 *
 * @param value - Key or nested option value.
 * @returns A stable string form; functions and `undefined` are dropped.
 */
function stableKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableKey).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((name) => {
        const entry = (value as Record<string, unknown>)[name];
        return entry !== undefined && typeof entry !== 'function';
      })
      .map(
        (name) =>
          `${JSON.stringify(name)}:${stableKey((value as Record<string, unknown>)[name])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The one stream layer every client shares. Each key gets one ref-counted
 * channel over one venue subscription: it opens with the first subscriber,
 * replays its last value to later ones, throttles each subscriber on its own
 * and stops with the last one. Reconnect and resubscribe stay with the
 * channel's source, so N readers cost one resubscribe. REST is read only
 * while the transport is down: to seed a channel and once per drop.
 */
export class StreamChannelManager {
  readonly #channels = new Map<string, Channel>();

  readonly #subscribeToConnectionState: StreamConnectionWatcher | undefined;

  readonly #onError: (error: unknown) => void;

  #stopConnectionWatch: (() => void) | undefined;

  #connectionState: WebSocketConnectionState | undefined;

  /** The connection dropped since it was last connected. */
  #dropped = false;

  /**
   * Failed channels still serving their readers; never reseeded or reopened.
   */
  readonly #detached = new Set<Channel>();

  /** Pause holders per stream name. */
  readonly #pauses = new Map<string, number>();

  constructor(options: StreamChannelManagerOptions = {}) {
    this.#subscribeToConnectionState = options.subscribeToConnectionState;
    this.#onError = options.onError ?? ((): void => undefined);
  }

  /**
   * Open channels, for diagnostics and tests.
   *
   * @returns The number of open channels.
   */
  get size(): number {
    return this.#channels.size;
  }

  /**
   * Join the channel for `key`, opening it when it is the first subscriber.
   *
   * @param key - What the channel streams.
   * @param source - Venue subscription used when the channel opens.
   * @param subscriber - Callbacks and throttle for this reader.
   * @returns Cleanup that leaves the channel.
   */
  subscribe<Args extends unknown[]>(
    key: StreamChannelKey,
    source: StreamChannelSource<Args>,
    subscriber: StreamChannelSubscriber<Args>,
  ): () => void {
    const id = stableKey(key);
    const open = this.#channels.get(id);
    const channel = open ?? this.#createChannel(id, key, source);
    const reader: Reader = {
      subscriber: subscriber as StreamChannelSubscriber<unknown[]>,
      channel,
      lastDeliveredAt: 0,
      pending: undefined,
      timer: undefined,
    };
    if (open) {
      this.#join(open, reader);
    } else {
      // The reader joins before the source opens, so a value the source
      // delivers while opening reaches it.
      channel.readers.add(reader);
      this.#open(channel);
    }
    return () => this.#leave(reader);
  }

  /**
   * Move every open channel whose key is no longer current to its next key,
   * such as after the provider or the selected account changed. The source is
   * stopped, the last value dropped and, when there was one, each reader's
   * `onReset` called; the channel then reopens under the new key, or its
   * readers join the channel already open there. Reader cleanups stay valid.
   *
   * @param isCurrent - Whether a key still matches the context.
   * @param nextKey - The key a stale channel moves to.
   */
  rebind(
    isCurrent: (key: StreamChannelKey) => boolean,
    nextKey: (key: StreamChannelKey) => StreamChannelKey,
  ): void {
    let moved = false;
    for (const channel of [...this.#channels.values()]) {
      // A source stopped earlier in this pass may have closed this channel.
      if (
        channel.closed ||
        this.#channels.get(channel.id) !== channel ||
        isCurrent(channel.key)
      ) {
        continue;
      }
      moved = true;
      const key = nextKey(channel.key);
      const id = stableKey(key);
      this.#channels.delete(channel.id);
      this.#stopSource(channel);
      // Readers hold nothing to reset when no value arrived since the last move.
      const hadValue = channel.last !== undefined;
      channel.last = undefined;
      channel.suppressed = false;
      // A seed read still in flight answers for the old key.
      channel.version += 1;
      const readers = [...channel.readers];
      for (const reader of readers) {
        this.#cancelPending(reader);
        try {
          if (hadValue) {
            reader.subscriber.onReset?.();
          }
        } catch (error) {
          this.#onError(error);
        }
      }
      const existing = this.#channels.get(id);
      if (existing) {
        channel.closed = true;
        channel.readers.clear();
        for (const reader of readers) {
          reader.channel = existing;
          this.#join(existing, reader);
        }
        continue;
      }
      channel.id = id;
      channel.key = key;
      this.#channels.set(id, channel);
      this.#start(channel);
    }
    if (moved) {
      // The connection watch answered for the old context.
      this.#stopWatch();
      this.#watchConnection();
    }
  }

  /**
   * Stop delivering one stream while an operation runs. Values keep arriving
   * and the latest is kept; when the last holder releases, pending throttled
   * deliveries are dropped and each reader receives the latest value once.
   *
   * @param stream - Stream name, matched against every channel's `key.stream`.
   * @returns Release; calling it again does nothing.
   */
  pause(stream: string): () => void {
    this.#pauses.set(stream, (this.#pauses.get(stream) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const count = (this.#pauses.get(stream) ?? 1) - 1;
      if (count > 0) {
        this.#pauses.set(stream, count);
        return;
      }
      this.#pauses.delete(stream);
      for (const channel of [...this.#channels.values(), ...this.#detached]) {
        if (channel.key.stream !== stream || !channel.suppressed) {
          continue;
        }
        channel.suppressed = false;
        const { last } = channel;
        for (const reader of [...channel.readers]) {
          this.#cancelPending(reader);
          if (last) {
            this.#call(reader, last);
          }
        }
      }
    };
  }

  /**
   * Stop and restart every open channel's source, keeping readers and last
   * values, such as when a socket that looks open has stopped delivering.
   */
  reopenAll(): void {
    for (const channel of [...this.#channels.values()]) {
      if (!channel.closed) {
        this.#reopen(channel);
      }
    }
  }

  /**
   * The last value of an open channel.
   *
   * @param key - What the channel streams.
   * @returns The last delivered arguments, or `undefined`.
   */
  getLast(key: StreamChannelKey): readonly unknown[] | undefined {
    return this.#channels.get(stableKey(key))?.last;
  }

  /**
   * Add a reader to an open channel and replay its last value.
   *
   * @param channel - The open channel.
   * @param reader - The joining reader.
   */
  #join(channel: Channel, reader: Reader): void {
    channel.readers.add(reader);
    const { last, version } = channel;
    if (last && channel.source.replay !== false) {
      // Replay after `subscribe` returns, so callers hold their cleanup.
      queueMicrotask(() => {
        if (
          reader.channel === channel &&
          channel.readers.has(reader) &&
          channel.version === version
        ) {
          this.#deliver(reader, last);
        }
      });
    }
  }

  /** Stop every channel; their subscribers receive nothing more. */
  clear(): void {
    for (const channel of [...this.#channels.values(), ...this.#detached]) {
      for (const reader of channel.readers) {
        clearTimeout(reader.timer);
      }
      channel.readers.clear();
      this.#close(channel.id, channel);
    }
  }

  #createChannel(
    id: string,
    key: StreamChannelKey,
    source: StreamChannelSource<unknown[]>,
  ): Channel {
    return {
      id,
      key,
      source,
      readers: new Set(),
      last: undefined,
      version: 0,
      stop: (): void => undefined,
      closed: false,
      suppressed: false,
    };
  }

  #open(channel: Channel): void {
    this.#channels.set(channel.id, channel);
    this.#watchConnection();
    this.#start(channel);
    // Seed only a channel that opens while the transport is known to be down;
    // a connected stream delivers its own first value.
    if (
      this.#connectionState !== undefined &&
      this.#connectionState !== WebSocketConnectionState.Connected
    ) {
      this.#seed(channel);
    }
  }

  #start(channel: Channel): void {
    try {
      const stop = channel.source.open(
        (...args) => this.#emit(channel, args),
        (error, ...detail) => this.#fail(channel, error, detail),
        channel.key,
      );
      if (channel.closed) {
        stop();
      } else {
        channel.stop = stop;
      }
    } catch (error) {
      queueMicrotask(() => this.#fail(channel, toError(error)));
    }
  }

  #reopen(channel: Channel): void {
    this.#stopSource(channel);
    this.#start(channel);
  }

  #stopSource(channel: Channel): void {
    const { stop } = channel;
    channel.stop = (): void => undefined;
    try {
      stop();
    } catch (error) {
      this.#onError(error);
    }
  }

  #cancelPending(reader: Reader): void {
    clearTimeout(reader.timer);
    reader.timer = undefined;
    reader.pending = undefined;
  }

  #seed(channel: Channel): void {
    const { source, version } = channel;
    if (!source.read) {
      return;
    }
    source
      .read(channel.key)
      .then((args) => {
        if (args && !channel.closed && channel.version === version) {
          this.#emit(channel, args);
        }
      })
      // A failed REST seed leaves the live stream attached.
      .catch((error: unknown) =>
        this.#fail(channel, toError(error), [], false),
      );
  }

  #emit(channel: Channel, args: unknown[]): void {
    if (channel.closed) {
      return;
    }
    channel.last = args;
    channel.version += 1;
    if (this.#pauses.has(channel.key.stream)) {
      channel.suppressed = true;
      return;
    }
    for (const reader of [...channel.readers]) {
      this.#deliver(reader, args);
    }
  }

  /**
   * Report a failure to the channel's readers. A failed source is detached:
   * it keeps serving the readers it has until they leave, and the next
   * subscribe on its key opens a fresh source instead of rejoining it.
   *
   * @param channel - The failing channel.
   * @param error - The failure.
   * @param detail - Detail the source adds, such as the failing venue.
   * @param detach - Detach the channel from its key.
   */
  #fail(
    channel: Channel,
    error: Error,
    detail: unknown[] = [],
    detach = true,
  ): void {
    if (channel.closed) {
      return;
    }
    if (detach && this.#channels.get(channel.id) === channel) {
      this.#channels.delete(channel.id);
      this.#detached.add(channel);
    }
    for (const reader of [...channel.readers]) {
      try {
        reader.subscriber.onError?.(error, ...detail);
      } catch (callbackError) {
        this.#onError(callbackError);
      }
    }
  }

  #deliver(reader: Reader, args: unknown[]): void {
    const { throttleMs } = reader.subscriber;
    if (!throttleMs || throttleMs <= 0) {
      this.#call(reader, args);
      return;
    }
    const wait = reader.lastDeliveredAt + throttleMs - Date.now();
    if (wait <= 0 && reader.timer === undefined) {
      this.#call(reader, args);
      return;
    }
    reader.pending = args;
    reader.timer ??= setTimeout(
      () => {
        reader.timer = undefined;
        // A pause delivers the latest value itself when it ends.
        if (this.#pauses.has(reader.channel.key.stream)) {
          reader.pending = undefined;
          reader.channel.suppressed = true;
          return;
        }
        const { pending } = reader;
        reader.pending = undefined;
        if (pending) {
          this.#call(reader, pending);
        }
      },
      Math.max(wait, 0),
    );
  }

  #call(reader: Reader, args: unknown[]): void {
    reader.lastDeliveredAt = Date.now();
    try {
      reader.subscriber.callback(...args);
    } catch (error) {
      this.#onError(error);
    }
  }

  #leave(reader: Reader): void {
    const { channel } = reader;
    if (!channel.readers.delete(reader)) {
      return;
    }
    this.#cancelPending(reader);
    if (channel.readers.size === 0) {
      this.#close(channel.id, channel);
    }
  }

  #close(id: string, channel: Channel): void {
    if (channel.closed) {
      return;
    }
    channel.closed = true;
    this.#detached.delete(channel);
    if (this.#channels.get(id) === channel) {
      this.#channels.delete(id);
    }
    try {
      channel.stop();
    } catch (error) {
      this.#onError(error);
    }
    if (this.#channels.size === 0) {
      this.#stopWatch();
    }
  }

  #stopWatch(): void {
    const stopWatch = this.#stopConnectionWatch;
    this.#stopConnectionWatch = undefined;
    this.#connectionState = undefined;
    this.#dropped = false;
    try {
      stopWatch?.();
    } catch (error) {
      this.#onError(error);
    }
  }

  /** Watch the transport while any channel is open. */
  #watchConnection(): void {
    if (this.#stopConnectionWatch || !this.#subscribeToConnectionState) {
      return;
    }
    this.#stopConnectionWatch = (): void => undefined;
    try {
      this.#stopConnectionWatch = this.#subscribeToConnectionState((state) =>
        this.#onConnectionState(state),
      );
    } catch (error) {
      this.#onError(error);
    }
  }

  /**
   * Read each channel's REST source once when a live connection drops.
   *
   * @param state - The new transport state.
   */
  #onConnectionState(state: WebSocketConnectionState): void {
    const previous = this.#connectionState;
    this.#connectionState = state;
    if (
      previous === WebSocketConnectionState.Connected &&
      state !== WebSocketConnectionState.Connected
    ) {
      this.#dropped = true;
      for (const channel of [...this.#channels.values()]) {
        this.#seed(channel);
      }
    } else if (state === WebSocketConnectionState.Connected && this.#dropped) {
      this.#dropped = false;
      for (const channel of [...this.#channels.values()]) {
        if (channel.source.reopenOnReconnect && !channel.closed) {
          this.#reopen(channel);
        }
      }
    }
  }
}

/**
 * Normalize a thrown value.
 *
 * @param error - Thrown value.
 * @returns An `Error`.
 */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
