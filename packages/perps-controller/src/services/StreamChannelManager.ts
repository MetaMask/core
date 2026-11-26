import { STREAM_RETRY_CONFIG } from '../constants/perpsConfig.js';
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
   * (such as the failing venue); the last value stays current. The source
   * stays attached, and heard, until the channel reopens it.
   * @param key - The key the channel opens under, which changes on `rebind`.
   * @param report - Tells the readers of a failure the source recovers from by
   * itself; the channel does not reopen it.
   * @returns Cleanup that stops the stream.
   */
  open(
    emit: (...args: Args) => void,
    fail: (error: Error, ...detail: unknown[]) => void,
    key: StreamChannelKey,
    report: (error: Error, ...detail: unknown[]) => void,
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
   * Deliver the channel's value to a subscriber that joins an open channel.
   * Defaults to true; turn it off for event streams, such as trades, where a
   * replay would repeat an event.
   */
  replay?: boolean;
  /**
   * Fold each delivery into the value the channel keeps for replay and
   * `getLast`, for streams whose deliveries are deltas. Returning `undefined`
   * keeps no value. Defaults to the latest delivery.
   */
  reduce?(held: Args | undefined, next: Args): Args | undefined;
  /**
   * What a throttled or paused subscriber receives for the deliveries it
   * waited through: the `latest` one (default), all of them `merge`d with
   * `reduce`, or each of them in order from a `queue`. Streams of deltas and
   * events use the last two so that no change is lost.
   */
  delivery?: 'latest' | 'merge' | 'queue';
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

/** How `rebind` treats the channels around the ones that move. */
export type StreamRebindOptions = {
  /**
   * Channels that keep their key but share the venue state the moving ones
   * use: stopped with them, and restarted after them.
   */
  restart?: (key: StreamChannelKey) => boolean;
  /** Runs once every source concerned has stopped, before any starts. */
  onStopped?: () => void;
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
  pending: unknown[][];
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Joined while the stream was paused: it gets the replay on release. */
  joinedPaused: boolean;
};

type Channel = {
  /** Serialized key the channel is filed under. */
  id: string;
  key: StreamChannelKey;
  source: StreamChannelSource<unknown[]>;
  readers: Set<Reader>;
  last: unknown[] | undefined;
  /** A value arrived since the channel opened or last moved. */
  hasValue: boolean;
  /** Bumped on every delivery so a stale seed read never overwrites a push. */
  version: number;
  /** Bumped on every start and stop, so a stopped source is never heard. */
  generation: number;
  stop: () => void;
  closed: boolean;
  /** The source failed and has not been reopened. */
  failed: boolean;
  /** Reopens since the source was last stable. */
  attempts: number;
  startedAt: number;
  /** A value arrived since the source last started. */
  delivered: boolean;
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Deliveries that arrived while the stream was paused. */
  held: unknown[][];
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
 * replays its value to later ones, throttles each subscriber on its own and
 * stops with the last one. The channel is the one owner of reconnect and
 * resubscribe: a source that fails is reopened with a bounded backoff, and
 * again on reconnect, so readers never resubscribe and N readers cost one
 * resubscribe. REST is read only while the transport is down: to seed a
 * channel and once per drop.
 */
export class StreamChannelManager {
  readonly #channels = new Map<string, Channel>();

  readonly #subscribeToConnectionState: StreamConnectionWatcher | undefined;

  readonly #onError: (error: unknown) => void;

  #stopConnectionWatch: (() => void) | undefined;

  #connectionState: WebSocketConnectionState | undefined;

  /** The connection dropped since it was last connected. */
  #dropped = false;

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
      pending: [],
      timer: undefined,
      joinedPaused: false,
    };
    if (open) {
      this.#join(open, reader);
      if (open.failed && open.retryTimer === undefined) {
        // A new reader is a fresh reason to reach the venue, once its
        // attempts are spent; a pending retry keeps its backoff.
        this.#reopen(open);
      }
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
   * such as after the provider or the selected account changed. Every stale
   * source stops before any new one starts, so venue state the old sources
   * shared is released first. Each reader's `onReset` is called when the
   * channel had a value; the channel then reopens under the new key, or its
   * readers join the channel already open there. Reader cleanups stay valid.
   *
   * @param isCurrent - Whether a key still matches the context.
   * @param nextKey - The key a stale channel moves to.
   * @param options - Channels to restart alongside, and a hook between the
   * stops and the starts.
   */
  rebind(
    isCurrent: (key: StreamChannelKey) => boolean,
    nextKey: (key: StreamChannelKey) => StreamChannelKey,
    options: StreamRebindOptions = {},
  ): void {
    const open = [...this.#channels.values()];
    const stale = open.filter((channel) => !isCurrent(channel.key));
    const restarted =
      stale.length > 0 && options.restart
        ? open.filter(
            (channel) =>
              !stale.includes(channel) && options.restart?.(channel.key),
          )
        : [];
    for (const channel of stale) {
      this.#channels.delete(channel.id);
      this.#stopSource(channel);
    }
    for (const channel of restarted) {
      this.#stopSource(channel);
    }
    options.onStopped?.();

    let providerMoved = false;
    for (const channel of stale) {
      // A source stopped in this pass may have closed this channel.
      if (channel.closed) {
        continue;
      }
      const key = nextKey(channel.key);
      providerMoved ||= key.providerId !== channel.key.providerId;
      this.#move(channel, key);
    }
    for (const channel of restarted) {
      if (!channel.closed) {
        this.#reopen(channel);
      }
    }
    if (providerMoved) {
      // The connection watch answered for the old transport.
      this.#stopWatch();
    }
    if (this.#channels.size > 0) {
      // Also when a reader that left during its reset closed the last channel.
      this.#watchConnection();
    }
    if (this.#isDown()) {
      for (const channel of stale) {
        if (!channel.closed && !channel.hasValue) {
          this.#seed(channel);
        }
      }
    }
  }

  /**
   * Reset a stopped channel's readers and reopen it under another key.
   *
   * @param channel - The stopped channel.
   * @param key - The key it moves to.
   */
  #move(channel: Channel, key: StreamChannelKey): void {
    const id = stableKey(key);
    // Readers hold nothing to reset when no value arrived since the last move.
    const { hasValue } = channel;
    channel.last = undefined;
    channel.hasValue = false;
    channel.held = [];
    channel.attempts = 0;
    // A seed read still in flight answers for the old key.
    channel.version += 1;
    const readers = [...channel.readers];
    for (const reader of readers) {
      this.#cancelPending(reader);
      try {
        if (hasValue) {
          reader.subscriber.onReset?.();
        }
      } catch (error) {
        this.#onError(error);
      }
    }
    if (channel.closed) {
      return;
    }
    const existing = this.#channels.get(id);
    if (existing) {
      channel.closed = true;
      const remaining = [...channel.readers];
      channel.readers.clear();
      for (const reader of remaining) {
        reader.channel = existing;
        this.#join(existing, reader);
      }
      return;
    }
    channel.id = id;
    channel.key = key;
    this.#channels.set(id, channel);
    this.#start(channel);
  }

  /**
   * Stop delivering one stream while an operation runs. Values keep arriving
   * and are held as the source's `delivery` says; when the last holder
   * releases, each reader receives them together with the throttled
   * deliveries it was still waiting for.
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
      for (const channel of [...this.#channels.values()]) {
        if (channel.key.stream !== stream) {
          continue;
        }
        const { held } = channel;
        channel.held = [];
        for (const reader of [...channel.readers]) {
          if (reader.joinedPaused) {
            // Its replay holds everything that arrived during the pause.
            reader.joinedPaused = false;
            if (channel.last && channel.source.replay !== false) {
              this.#deliver(reader, channel.last);
            }
            continue;
          }
          for (const args of held) {
            reader.pending = combine(channel.source, reader.pending, args);
          }
          // A throttled delivery that is not due yet keeps its own timer.
          if (held.length > 0 || reader.timer === undefined) {
            this.#flush(reader);
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
   * The value an open channel keeps.
   *
   * @param key - What the channel streams.
   * @returns The last delivered (or reduced) arguments, or `undefined`.
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
    if (this.#pauses.has(channel.key.stream)) {
      reader.joinedPaused = true;
      return;
    }
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
    for (const channel of [...this.#channels.values()]) {
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
      hasValue: false,
      version: 0,
      generation: 0,
      stop: (): void => undefined,
      closed: false,
      failed: false,
      attempts: 0,
      startedAt: 0,
      delivered: false,
      retryTimer: undefined,
      held: [],
    };
  }

  #open(channel: Channel): void {
    this.#channels.set(channel.id, channel);
    this.#watchConnection();
    this.#start(channel);
    // Seed only a channel that opens while the transport is known to be down;
    // a connected stream delivers its own first value.
    if (this.#isDown()) {
      this.#seed(channel);
    }
  }

  /**
   * Whether the transport is known not to be connected.
   *
   * @returns True while the last reported state is not connected.
   */
  #isDown(): boolean {
    return (
      this.#connectionState !== undefined &&
      this.#connectionState !== WebSocketConnectionState.Connected
    );
  }

  #start(channel: Channel): void {
    clearTimeout(channel.retryTimer);
    channel.retryTimer = undefined;
    channel.generation += 1;
    channel.failed = false;
    channel.delivered = false;
    channel.startedAt = Date.now();
    const { generation } = channel;
    const isCurrent = (): boolean =>
      !channel.closed && channel.generation === generation;
    const fail = (error: Error, detail: unknown[]): void => {
      if (isCurrent()) {
        this.#fail(channel, error, detail);
      }
    };
    try {
      const stop = channel.source.open(
        (...args) => {
          if (isCurrent()) {
            channel.delivered = true;
            this.#emit(channel, args);
          }
        },
        (error, ...detail) => fail(error, detail),
        channel.key,
        (error, ...detail) => {
          if (isCurrent()) {
            this.#report(channel, error, detail);
          }
        },
      );
      if (isCurrent()) {
        channel.stop = stop;
      } else {
        // Closed, moved or failed while opening.
        this.#runStop(stop);
      }
    } catch (error) {
      queueMicrotask(() => fail(toError(error), []));
    }
  }

  /**
   * Stop and start a channel's source with a fresh retry budget.
   *
   * @param channel - The channel to reopen.
   */
  #reopen(channel: Channel): void {
    channel.attempts = 0;
    this.#stopSource(channel);
    this.#start(channel);
  }

  #stopSource(channel: Channel): void {
    const { stop } = channel;
    channel.stop = (): void => undefined;
    // From here on nothing the old source says is heard.
    channel.generation += 1;
    clearTimeout(channel.retryTimer);
    channel.retryTimer = undefined;
    this.#runStop(stop);
  }

  #runStop(stop: () => void): void {
    try {
      stop();
    } catch (error) {
      this.#onError(error);
    }
  }

  #cancelPending(reader: Reader): void {
    clearTimeout(reader.timer);
    reader.timer = undefined;
    reader.pending = [];
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
      // A failed REST seed leaves the live stream running.
      .catch((error: unknown) => {
        if (!channel.closed && channel.version === version) {
          this.#report(channel, toError(error), []);
        }
      });
  }

  #emit(channel: Channel, args: unknown[]): void {
    if (channel.closed) {
      return;
    }
    const { source } = channel;
    channel.last = source.reduce ? source.reduce(channel.last, args) : args;
    channel.hasValue = true;
    channel.version += 1;
    if (this.#pauses.has(channel.key.stream)) {
      channel.held = combine(channel.source, channel.held, args);
      return;
    }
    for (const reader of [...channel.readers]) {
      this.#deliver(reader, args);
    }
  }

  /**
   * Handle a source failure: tell the readers and reopen the source with a
   * bounded backoff, also when it delivers meanwhile: one part of a source may
   * stream while the part that failed does not. Once the attempts are spent the
   * source stays attached as it is, and the channel reopens it when the
   * connection comes back, on a move, on `reopenAll` and for a new reader.
   *
   * @param channel - The failing channel.
   * @param error - The failure.
   * @param detail - Detail the source adds, such as the failing venue.
   */
  #fail(channel: Channel, error: Error, detail: unknown[]): void {
    if (
      channel.delivered &&
      Date.now() - channel.startedAt >= STREAM_RETRY_CONFIG.StableMs
    ) {
      channel.attempts = 0;
    }
    channel.failed = true;
    if (
      channel.retryTimer === undefined &&
      channel.attempts < STREAM_RETRY_CONFIG.MaxAttempts
    ) {
      const delay = Math.min(
        STREAM_RETRY_CONFIG.BaseDelayMs * 2 ** channel.attempts,
        STREAM_RETRY_CONFIG.MaxDelayMs,
      );
      channel.attempts += 1;
      channel.retryTimer = setTimeout(() => {
        this.#stopSource(channel);
        this.#start(channel);
      }, delay);
    }
    this.#report(channel, error, detail);
  }

  #report(channel: Channel, error: Error, detail: unknown[]): void {
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
    const { channel } = reader;
    reader.pending = combine(channel.source, reader.pending, args);
    reader.timer ??= setTimeout(
      () => {
        reader.timer = undefined;
        // A pause delivers what is pending itself when it ends.
        if (this.#pauses.has(reader.channel.key.stream)) {
          return;
        }
        this.#flush(reader);
      },
      Math.max(wait, 0),
    );
  }

  /**
   * Deliver everything a reader is waiting for now.
   *
   * @param reader - The reader.
   */
  #flush(reader: Reader): void {
    const { pending } = reader;
    this.#cancelPending(reader);
    for (const args of pending) {
      if (!reader.channel.readers.has(reader)) {
        return;
      }
      this.#call(reader, args);
    }
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
    if (this.#channels.get(id) === channel) {
      this.#channels.delete(id);
    }
    this.#stopSource(channel);
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
   * Read each channel's REST source once when a live connection drops. When it
   * comes back, reopen the failed channels and those the transport does not
   * restore by itself.
   *
   * @param state - The new transport state.
   */
  #onConnectionState(state: WebSocketConnectionState): void {
    const previous = this.#connectionState;
    this.#connectionState = state;
    if (state !== WebSocketConnectionState.Connected) {
      if (previous === WebSocketConnectionState.Connected) {
        this.#dropped = true;
        for (const channel of [...this.#channels.values()]) {
          this.#seed(channel);
        }
      }
      return;
    }
    const dropped = this.#dropped;
    this.#dropped = false;
    if (previous === state) {
      return;
    }
    for (const channel of [...this.#channels.values()]) {
      if (
        !channel.closed &&
        (channel.failed || (dropped && channel.source.reopenOnReconnect))
      ) {
        this.#reopen(channel);
      }
    }
  }
}

/**
 * Add a delivery to the ones a reader has yet to receive.
 *
 * @param source - The channel's source, which says how they combine.
 * @param pending - Deliveries not received yet.
 * @param next - The new delivery.
 * @returns The deliveries to make, in order.
 */
function combine(
  source: StreamChannelSource<unknown[]>,
  pending: unknown[][],
  next: unknown[],
): unknown[][] {
  if (source.delivery === 'queue') {
    return [...pending, next];
  }
  if (source.delivery === 'merge' && source.reduce && pending.length > 0) {
    return [source.reduce(pending[0], next) ?? next];
  }
  return [next];
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
