/**
 * Shared per-channel WebSocket subscription lifecycle manager.
 *
 * Extracts the channel-agnostic subscription machinery that was originally part
 * of {@link OHLCVService}: reference counting, grace-period unsubscribe,
 * grace-period flush, unsubscribe retry with backoff + force reconnection,
 * idempotency checks, resubscribe-on-reconnect, and optional system-notification
 * channel registration.
 *
 * It is consumed by **composition** (not inheritance). Each domain service
 * (e.g. OHLCV market data, Launchpad token details) constructs a manager,
 * provides the channel-type namespace and a per-message callback, and keeps its
 * own domain concerns (channel-string construction, payload parsing, published
 * events). The manager talks to {@link BackendWebSocketService} exclusively
 * through the messenger — no direct import of the class.
 */

import type { Messenger } from '@metamask/messenger';
import { Mutex } from 'async-mutex';
import { handleAll, IterableBackoff, retry } from 'cockatiel';

import { projectLogger, createModuleLogger } from '../logger.js';
import type { BackendWebSocketServiceMethodActions } from './BackendWebSocketService-method-action-types.js';
import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from './BackendWebSocketService.js';
import { WebSocketState } from './BackendWebSocketService.js';

// =============================================================================
// Constants
// =============================================================================

/** Default delay before actually unsubscribing after refCount reaches 0. */
const DEFAULT_GRACE_PERIOD_MS = 3_000;

/** Default backoff delays between failed WebSocket unsubscribe attempts. */
const DEFAULT_UNSUB_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

/**
 * The `BackendWebSocketService:*` actions the manager calls through its host
 * service's messenger. A domain service must grant (at least) these to its
 * restricted messenger, since the manager borrows that messenger and performs
 * all WebSocket calls on the service's behalf. Services should source their own
 * `*_ALLOWED_ACTIONS` export from this list rather than re-declaring it.
 */
export const CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_ACTIONS = [
  'BackendWebSocketService:connect',
  'BackendWebSocketService:forceReconnection',
  'BackendWebSocketService:subscribe',
  'BackendWebSocketService:channelHasSubscription',
  'BackendWebSocketService:getSubscriptionsByChannel',
  'BackendWebSocketService:addChannelCallback',
  'BackendWebSocketService:removeChannelCallback',
] as const;

/**
 * The `BackendWebSocketService:*` events the manager subscribes to through its
 * host service's messenger.
 */
export const CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_EVENTS = [
  'BackendWebSocketService:connectionStateChanged',
] as const;

// =============================================================================
// Types
// =============================================================================

type ChannelEntry = {
  refCount: number;
  gracePeriodTimer?: ReturnType<typeof setTimeout>;
  /** Channels that share `gracePeriodTimer` and leave in one unsubscribe frame. */
  graceBatch?: Set<string>;
  /** Wait before the next unsubscribe retry. The first attempt already failed. */
  retryDelayTimer?: ReturnType<typeof setTimeout>;
  retryAbort?: AbortController;
};

/**
 * Minimal messenger shape the manager requires: the `BackendWebSocketService:*`
 * actions and the `connectionStateChanged` event. A host service's messenger
 * (which has these delegated plus its own domain actions/events) satisfies this.
 */
export type ChannelSubscriptionManagerMessenger = Messenger<
  string,
  BackendWebSocketServiceMethodActions,
  BackendWebSocketServiceConnectionStateChangedEvent
>;

/** The kind of operation that failed, forwarded to `onSubscriptionError`. */
export type ChannelSubscriptionOperation = 'subscribe' | 'unsubscribe';

/**
 * Configuration for a {@link ChannelSubscriptionManager}.
 */
export type ChannelSubscriptionManagerOptions = {
  /** Messenger used to reach {@link BackendWebSocketService}. */
  messenger: ChannelSubscriptionManagerMessenger;
  /** Channel type/namespace passed to `BackendWebSocketService:subscribe`. */
  channelType: string;
  /** Called for each subscription notification on a managed channel. */
  onMessage: (channel: string, notification: ServerNotificationMessage) => void;
  /** Called when a subscribe/unsubscribe operation fails. */
  onSubscriptionError?: (
    channel: string,
    error: string,
    operation: ChannelSubscriptionOperation,
  ) => void;
  /** Optional system-notifications channel to register a callback for on `init()`. */
  systemNotificationsChannel?: string;
  /** Handler invoked for messages on the system-notifications channel. */
  onSystemNotification?: (notification: ServerNotificationMessage) => void;
  /**
   * Called on every connection state change. When `resubscribeOnConnect` is
   * true, this runs after active channels are subscribed again.
   */
  onConnectionStateChange?: (connectionInfo: WebSocketConnectionInfo) => void;
  /**
   * Subscribe active channels again when the socket connects, before
   * `onConnectionStateChange`. Defaults to true. Set false when the host
   * sends those subscriptions from `onConnectionStateChange` itself.
   */
  resubscribeOnConnect?: boolean;
  /**
   * Reconnect the shared socket after unsubscribe retries are exhausted.
   * Defaults to true. Market stats leaves the socket up; the caller polls.
   */
  forceReconnectOnUnsubscribeFailure?: boolean;
  /** Prefix used in log lines (defaults to the channel type). */
  logPrefix?: string;
  /** Override the grace period (primarily for tests). */
  gracePeriodMs?: number;
  /** Override the unsubscribe retry backoff delays (primarily for tests). */
  unsubRetryDelaysMs?: number[];
};

// =============================================================================
// Class
// =============================================================================

/**
 * Manages the lifecycle of per-channel WebSocket subscriptions on top of the
 * shared {@link BackendWebSocketService}.
 */
export class ChannelSubscriptionManager {
  readonly #messenger: ChannelSubscriptionManagerMessenger;

  readonly #options: ChannelSubscriptionManagerOptions;

  readonly #channelType: string;

  readonly #channels = new Map<string, ChannelEntry>();

  readonly #mutex = new Mutex();

  readonly #gracePeriodMs: number;

  readonly #log: (message: string, data?: Record<string, unknown>) => void;

  readonly #unsubRetryDelays: readonly number[];

  readonly #resubscribeOnConnect: boolean;

  readonly #forceReconnectOnUnsubscribeFailure: boolean;

  constructor(options: ChannelSubscriptionManagerOptions) {
    this.#options = options;
    this.#messenger = options.messenger;
    this.#channelType = options.channelType;
    this.#gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

    this.#resubscribeOnConnect = options.resubscribeOnConnect ?? true;
    this.#forceReconnectOnUnsubscribeFailure =
      options.forceReconnectOnUnsubscribeFailure ?? true;

    this.#unsubRetryDelays = options.unsubRetryDelaysMs ?? [
      ...DEFAULT_UNSUB_RETRY_DELAYS_MS,
    ];

    const prefix = options.logPrefix ?? options.channelType;
    const moduleLog = createModuleLogger(
      projectLogger,
      'ChannelSubscriptionManager',
    );
    this.#log = (message, data): void =>
      data === undefined
        ? moduleLog(`${prefix}: ${message}`)
        : moduleLog(`${prefix}: ${message}`, data);

    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (connectionInfo: WebSocketConnectionInfo) =>
        this.#handleWebSocketStateChange(connectionInfo),
    );
  }

  /**
   * Register the system-notifications channel callback, if configured.
   */
  init(): void {
    const { systemNotificationsChannel, onSystemNotification } = this.#options;
    if (!systemNotificationsChannel || !onSystemNotification) {
      return;
    }
    this.#log('Initializing — registering system-notifications callback');
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: systemNotificationsChannel,
      callback: (notification: ServerNotificationMessage) =>
        onSystemNotification(notification),
    });
  }

  // =============================================================================
  // Public — Subscribe / Unsubscribe
  // =============================================================================

  /**
   * Subscribe to one channel, or to many channels in one WebSocket frame.
   *
   * The first subscriber opens the channel. Further calls for a channel that
   * is already held only bump its reference count. Channels the gateway
   * rejects are reported through `onSubscriptionError` and left untracked.
   * A socket that is not connected yet keeps every channel so the connect
   * handler can send them.
   *
   * @param channel - One fully-qualified channel name, or a list of them.
   * @returns A promise that resolves once the subscription is recorded.
   */
  async subscribe(channel: string | readonly string[]): Promise<void> {
    const channels = [
      ...new Set(typeof channel === 'string' ? [channel] : channel),
    ];
    if (channels.length === 0) {
      return;
    }
    const releaseLock = await this.#mutex.acquire();
    try {
      await this.#subscribeInner(channels);
    } finally {
      releaseLock();
    }
  }

  /**
   * Open every channel in this call that is not already held.
   *
   * A channel another caller already holds only bumps its reference count.
   * Channels that still need a server subscription go out in one frame.
   *
   * @param channels - Fully-qualified channel names, already deduped.
   */
  async #subscribeInner(channels: readonly string[]): Promise<void> {
    const keeping = new Set(channels);
    const toOpen: string[] = [];
    let shouldFlush = false;

    for (const channel of channels) {
      const entry = this.#channels.get(channel);

      if (entry?.retryAbort) {
        entry.retryAbort.abort();
        entry.retryAbort = undefined;
        entry.refCount = 1;
        shouldFlush = true;
        if (this.#serverHasChannel(channel)) {
          this.#log('Cancelled unsubscribe retry — reusing WS subscription', {
            channel,
          });
          continue;
        }
        toOpen.push(channel);
        continue;
      }

      if (entry?.gracePeriodTimer) {
        this.#detachGrace(entry, channel);
        this.#log('Cancelled grace-period unsubscribe', { channel });
        shouldFlush = true;
        if (this.#serverHasChannel(channel)) {
          entry.refCount += 1;
          this.#log('WS subscription still alive, bumped refCount', {
            channel,
            refCount: entry.refCount,
          });
          continue;
        }
        toOpen.push(channel);
        continue;
      }

      if (entry && entry.refCount > 0) {
        entry.refCount += 1;
        continue;
      }

      shouldFlush = true;
      toOpen.push(channel);
    }

    // Example: ETH is open as market-stats.v1.eip155:1/slip44:60.usd. Switching
    // the currency to EUR drops that channel's refCount to 0 and starts its
    // grace timer, then subscribes market-stats.v1.eip155:1/slip44:60.eur.
    // The eur subscribe flushes the usd channel now. The eur channel is in
    // this call, so it stays open.
    if (shouldFlush) {
      await this.#flushOtherChannels(keeping);
    }
    if (toOpen.length === 0) {
      return;
    }

    await this.#openChannels(toOpen);
  }

  /**
   * Unsubscribe from one channel, or from many channels in one WebSocket frame.
   *
   * Decrements each reference count. Channels that reach zero share one
   * grace-period timer, then leave in one `unsubscribe` frame per server
   * subscription.
   *
   * @param channel - One fully-qualified channel name, or a list of them.
   * @returns A promise that resolves once the unsubscription is recorded.
   */
  async unsubscribe(channel: string | readonly string[]): Promise<void> {
    const channels = [
      ...new Set(typeof channel === 'string' ? [channel] : channel),
    ];
    if (channels.length === 0) {
      return;
    }
    const releaseLock = await this.#mutex.acquire();
    try {
      await this.#unsubscribeInner(channels);
    } finally {
      releaseLock();
    }
  }

  async #unsubscribeInner(channels: readonly string[]): Promise<void> {
    const expiring: string[] = [];
    for (const channel of channels) {
      const entry = this.#channels.get(channel);
      if (!entry || entry.refCount <= 0) {
        continue;
      }

      entry.refCount -= 1;
      if (entry.refCount > 0) {
        continue;
      }

      this.#detachGrace(entry, channel);
      expiring.push(channel);
    }
    if (expiring.length === 0) {
      return;
    }

    const batch = new Set(expiring);
    const timer = setTimeout(() => {
      const due = [...batch];
      batch.clear();
      for (const name of due) {
        const entry = this.#channels.get(name);
        if (entry?.graceBatch === batch) {
          entry.gracePeriodTimer = undefined;
          entry.graceBatch = undefined;
        }
      }
      this.#performUnsubscribe(due).catch(() => {
        // no-op: retry scheduling and force-reconnection are handled internally
      });
    }, this.#gracePeriodMs);
    for (const name of expiring) {
      const entry = this.#channels.get(name);
      if (!entry) {
        continue;
      }
      entry.gracePeriodTimer = timer;
      entry.graceBatch = batch;
    }
  }

  // =============================================================================
  // Private — WebSocket Subscription Helpers
  // =============================================================================

  /**
   * Immediately unsubscribe other channels in grace or failed-cleanup state.
   * Called while the subscribe mutex is held before opening a new channel.
   *
   * @param exceptChannel - Channels being subscribed; excluded from flush.
   */
  async #flushOtherChannels(
    exceptChannel: string | ReadonlySet<string>,
  ): Promise<void> {
    const except =
      typeof exceptChannel === 'string'
        ? new Set([exceptChannel])
        : exceptChannel;
    const flushing: string[] = [];
    for (const [channel, channelEntry] of this.#channels.entries()) {
      if (except.has(channel) || channelEntry.refCount > 0) {
        continue;
      }

      this.#detachGrace(channelEntry, channel);
      channelEntry.retryAbort?.abort();
      channelEntry.retryAbort = undefined;
      flushing.push(channel);
      this.#log('Flushing grace-period channel before new subscribe', {
        flushedChannel: channel,
        newChannel: [...except].join(','),
      });
    }
    if (flushing.length === 0) {
      return;
    }

    const failed = new Set(await this.#unsubscribeChannelsOnServer(flushing));
    for (const channel of flushing) {
      if (failed.has(channel)) {
        this.#scheduleUnsubscribeRetry(channel);
      } else {
        this.#channels.delete(channel);
      }
    }
  }

  /**
   * Take one channel out of a shared grace batch. The timer stays while
   * another channel in that batch is still waiting.
   *
   * @param entry - Channel tracking entry.
   * @param channel - Fully-qualified channel name.
   */
  #detachGrace(entry: ChannelEntry, channel: string): void {
    entry.graceBatch?.delete(channel);
    const othersWaiting = (entry.graceBatch?.size ?? 0) > 0;
    if (!othersWaiting && entry.gracePeriodTimer) {
      clearTimeout(entry.gracePeriodTimer);
    }
    entry.gracePeriodTimer = undefined;
    entry.graceBatch = undefined;
  }

  #clearChannelTimers(entry: ChannelEntry): void {
    entry.graceBatch?.clear();
    if (entry.gracePeriodTimer) {
      clearTimeout(entry.gracePeriodTimer);
      entry.gracePeriodTimer = undefined;
    }
    entry.graceBatch = undefined;
    if (entry.retryDelayTimer) {
      clearTimeout(entry.retryDelayTimer);
      entry.retryDelayTimer = undefined;
    }
    entry.retryAbort?.abort();
    entry.retryAbort = undefined;
  }

  /**
   * Remove every channel in one `unsubscribe` frame per server subscription.
   *
   * @param channels - Fully-qualified channel names.
   * @returns Channels whose server unsubscribe failed.
   */
  async #unsubscribeChannelsOnServer(
    channels: readonly string[],
  ): Promise<string[]> {
    const pending = new Set(channels);
    const failed = new Set<string>();
    const seen = new Set<unknown>();

    for (const channel of channels) {
      if (!pending.has(channel)) {
        continue;
      }
      let subscriptions;
      try {
        subscriptions = this.#messenger.call(
          'BackendWebSocketService:getSubscriptionsByChannel',
          channel,
        );
      } catch (error) {
        failed.add(channel);
        pending.delete(channel);
        this.#log('Unsubscription failed', { channel, error });
        this.#options.onSubscriptionError?.(
          channel,
          String(error),
          'unsubscribe',
        );
        continue;
      }

      if (subscriptions.length === 0) {
        pending.delete(channel);
        continue;
      }

      for (const sub of subscriptions) {
        const key = sub.subscriptionId ?? sub.unsubscribe;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const removing = Array.isArray(sub.channels)
          ? sub.channels.filter((name) => pending.has(name))
          : [...pending];
        if (removing.length === 0) {
          continue;
        }
        try {
          await sub.unsubscribe(undefined, removing);
          for (const name of removing) {
            pending.delete(name);
          }
        } catch (error) {
          this.#log('Unsubscription failed', { channels: removing, error });
          for (const name of removing) {
            failed.add(name);
            pending.delete(name);
            this.#options.onSubscriptionError?.(
              name,
              String(error),
              'unsubscribe',
            );
          }
        }
      }
    }

    for (const channel of pending) {
      failed.add(channel);
      this.#log('Unsubscription failed', {
        channel,
        error: 'channel was not on a returned subscription',
      });
      this.#options.onSubscriptionError?.(
        channel,
        'channel was not on a returned subscription',
        'unsubscribe',
      );
    }

    return [...failed];
  }

  async #unsubscribeChannelOnServer(channel: string): Promise<boolean> {
    const failed = await this.#unsubscribeChannelsOnServer([channel]);
    return failed.length === 0;
  }

  #scheduleUnsubscribeRetry(channel: string): void {
    const entry = this.#channels.get(channel);
    if (!entry) {
      // The channel was removed (e.g. destroy() or reconnect cleanup) while the
      // unsubscribe was in flight. Do not resurrect it or start a new retry loop
      // with an AbortController that teardown can no longer cancel — that could
      // force a reconnection on the shared WebSocket after teardown.
      return;
    }

    if (entry.retryDelayTimer) {
      clearTimeout(entry.retryDelayTimer);
    }
    entry.retryAbort?.abort();
    entry.retryAbort = new AbortController();

    const { signal } = entry.retryAbort;
    // The call that scheduled this retry already failed. Wait out the first
    // delay, then run the remaining attempts.
    const [firstDelay = 0, ...rest] = this.#unsubRetryDelays;
    entry.retryDelayTimer = setTimeout(() => {
      entry.retryDelayTimer = undefined;
      if (signal.aborted) {
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#runUnsubRetryLoop(channel, signal, rest);
    }, firstDelay);
  }

  async #runUnsubRetryLoop(
    channel: string,
    signal: AbortSignal,
    delays: readonly number[],
  ): Promise<void> {
    const policy = retry(handleAll, {
      // `maxAttempts` counts retries after the first run of this policy.
      maxAttempts: delays.length,
      backoff: new IterableBackoff([...delays]),
    });
    try {
      await policy.execute(async () => {
        const releaseLock = await this.#mutex.acquire();
        try {
          const current = this.#channels.get(channel);
          if (current && current.refCount > 0) {
            return;
          }

          const success = await this.#unsubscribeChannelOnServer(channel);
          if (!success) {
            throw new Error('unsubscribe failed');
          }

          this.#channels.delete(channel);
          this.#log('WS unsubscribe completed', { channel });
        } finally {
          releaseLock();
        }
      }, signal);
    } catch {
      if (signal.aborted) {
        return;
      }

      this.#channels.delete(channel);
      if (!this.#forceReconnectOnUnsubscribeFailure) {
        this.#log('Unsubscribe retries exhausted — leaving the socket up', {
          channel,
        });
        return;
      }

      this.#log('Unsubscribe retries exhausted — forcing reconnection', {
        channel,
      });
      // Last resort: reconnects the shared BackendWebSocketService instance
      // (other consumers share this connection). They resubscribe on CONNECTED;
      // this manager only resubscribes channels with refCount > 0.
      await this.#messenger
        .call('BackendWebSocketService:forceReconnection')
        .catch(() => {
          // no-op
        });
    }
  }

  async #performUnsubscribe(channels: readonly string[]): Promise<void> {
    const due: string[] = [];
    const releaseLock = await this.#mutex.acquire();
    try {
      for (const channel of channels) {
        const entry = this.#channels.get(channel);
        if (!entry || entry.refCount > 0) {
          this.#log(
            'Skipping unsubscribe — new subscriber arrived while queued',
            { channel, refCount: entry?.refCount },
          );
          continue;
        }

        this.#log('Grace period expired — performing actual WS unsubscribe', {
          channel,
        });
        this.#detachGrace(entry, channel);
        entry.retryAbort?.abort();
        entry.retryAbort = undefined;
        due.push(channel);
      }
    } finally {
      releaseLock();
    }

    if (due.length === 0) {
      return;
    }

    const failed = new Set(await this.#unsubscribeChannelsOnServer(due));
    const done = await this.#mutex.acquire();
    try {
      for (const channel of due) {
        if (failed.has(channel)) {
          this.#scheduleUnsubscribeRetry(channel);
          continue;
        }
        const entry = this.#channels.get(channel);
        if (entry && entry.refCount > 0) {
          continue;
        }
        this.#channels.delete(channel);
        this.#log('WS unsubscribe completed', { channel });
      }
    } finally {
      done();
    }
  }

  /**
   * Channels with a live reference count. A channel in its unsubscribe grace
   * period is not included.
   *
   * @returns Fully-qualified channel names.
   */
  getActiveChannels(): string[] {
    const channels: string[] = [];
    for (const [channel, entry] of this.#channels) {
      if (entry.refCount > 0) {
        channels.push(channel);
      }
    }
    return channels;
  }

  /**
   * Open server subscriptions for channels that are already tracked, in one
   * WebSocket frame, without changing reference counts that are already set.
   *
   * @param channels - Fully-qualified channel names.
   */
  async ensureSubscribedChannels(channels: string[]): Promise<void> {
    const unique = [...new Set(channels)];
    if (unique.length === 0) {
      return;
    }
    const releaseLock = await this.#mutex.acquire();
    try {
      const missing = unique.filter(
        (channel) => !this.#serverHasChannel(channel),
      );
      if (missing.length === 0) {
        return;
      }

      await this.#messenger.call('BackendWebSocketService:connect');

      const still = missing.filter(
        (channel) => !this.#serverHasChannel(channel),
      );
      if (still.length === 0) {
        for (const channel of missing) {
          this.#rememberOpen(channel);
        }
        return;
      }

      await this.#openChannels(still);
    } finally {
      releaseLock();
    }
  }

  /**
   * Open a server subscription for a channel that is already tracked, without
   * changing its reference count. No-op when the server already has it.
   *
   * @param channel - Fully-qualified channel name.
   */
  async ensureSubscribed(channel: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      if (this.#serverHasChannel(channel)) {
        return;
      }

      await this.#messenger.call('BackendWebSocketService:connect');

      if (this.#serverHasChannel(channel)) {
        return;
      }

      await this.#subscribeOnServer(channel);

      const entry = this.#channels.get(channel);
      if (!entry || entry.refCount === 0) {
        if (entry) {
          this.#stopChannelTimers(entry, channel);
        }
        this.#channels.set(channel, { refCount: 1 });
      }
      this.#log('Subscribe succeeded after the socket connected', { channel });
    } catch (error) {
      if (isRetryableSubscribeError(error)) {
        const entry = this.#channels.get(channel);
        if (!entry || entry.refCount === 0) {
          this.#channels.set(channel, { refCount: 1 });
        }
        this.#log('Subscription still waiting for the socket', { channel });
        return;
      }

      this.#log('Subscription failed after the socket connected', {
        channel,
        error,
      });
      this.#options.onSubscriptionError?.(channel, String(error), 'subscribe');
      throw error;
    } finally {
      releaseLock();
    }
  }

  /**
   * Resubscribe all channels that were active before a disconnect.
   * Called when WebSocket transitions to CONNECTED.
   */
  async resubscribe(): Promise<void> {
    await this.#resubscribeActiveChannels();
  }

  /**
   * Keep a channel that is already on the server, or whose subscribe has to
   * wait for the socket. A reference count that is already set stays as it is.
   *
   * @param channel - Fully-qualified channel name.
   */
  #rememberOpen(channel: string): void {
    const entry = this.#channels.get(channel);
    if (!entry || entry.refCount === 0) {
      if (entry) {
        this.#stopChannelTimers(entry, channel);
      }
      this.#channels.set(channel, { refCount: 1 });
    }
  }

  /**
   * Stop this channel's grace timer and retry without cancelling a batch
   * that still has other channels waiting.
   *
   * @param entry - Channel tracking entry.
   * @param channel - Fully-qualified channel name.
   */
  #stopChannelTimers(entry: ChannelEntry, channel: string): void {
    this.#detachGrace(entry, channel);
    if (entry.retryDelayTimer) {
      clearTimeout(entry.retryDelayTimer);
      entry.retryDelayTimer = undefined;
    }
    entry.retryAbort?.abort();
    entry.retryAbort = undefined;
  }

  /**
   * Open one WebSocket subscription for every channel that is not on the
   * server yet. Channels the gateway rejects are dropped.
   *
   * @param channels - Fully-qualified channel names.
   */
  async #openChannels(channels: string[]): Promise<void> {
    try {
      await this.#messenger.call('BackendWebSocketService:connect');

      const missing = channels.filter(
        (channel) => !this.#serverHasChannel(channel),
      );
      for (const channel of channels) {
        if (!missing.includes(channel)) {
          this.#rememberOpen(channel);
        }
      }
      if (missing.length === 0) {
        return;
      }

      const result = await this.#messenger.call(
        'BackendWebSocketService:subscribe',
        {
          channels: missing,
          channelType: this.#channelType,
          callback: (notification: ServerNotificationMessage) => {
            // One channel keeps the name this call opened. A list uses the
            // channel on the notification, because one callback serves all of them.
            const channel =
              missing.length === 1 ? missing[0] : notification.channel;
            this.#options.onMessage(channel, notification);
          },
        },
      );
      const failed = new Set(result?.failedChannels ?? []);
      for (const channel of missing) {
        if (failed.has(channel)) {
          this.#channels.delete(channel);
          this.#options.onSubscriptionError?.(
            channel,
            `Request failed: ${channel}`,
            'subscribe',
          );
          continue;
        }
        this.#rememberOpen(channel);
        this.#log('Subscribe succeeded — new WS subscription created', {
          channel,
        });
      }
    } catch (error) {
      if (isRetryableSubscribeError(error)) {
        for (const channel of channels) {
          this.#rememberOpen(channel);
        }
        this.#log('Subscription deferred until the socket is connected', {
          channels,
        });
        return;
      }

      for (const channel of channels) {
        this.#channels.delete(channel);
        this.#options.onSubscriptionError?.(
          channel,
          String(error),
          'subscribe',
        );
      }
      this.#log('Subscription failed', { channels, error });
    }
  }

  #serverHasChannel(channel: string): boolean {
    return this.#messenger.call(
      'BackendWebSocketService:channelHasSubscription',
      channel,
    );
  }

  async #subscribeOnServer(channel: string): Promise<void> {
    await this.#messenger.call('BackendWebSocketService:subscribe', {
      channels: [channel],
      channelType: this.#channelType,
      callback: (notification: ServerNotificationMessage) => {
        this.#options.onMessage(channel, notification);
      },
    });
  }

  /**
   * Resubscribe all channels that were active before a disconnect.
   * Called when WebSocket transitions to CONNECTED.
   */
  async #resubscribeActiveChannels(): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      const channelCount = this.#channels.size;
      this.#log('Resubscribing active channels after reconnect', {
        count: channelCount,
      });

      for (const [channel, entry] of [...this.#channels.entries()]) {
        if (entry.refCount === 0) {
          this.#clearChannelTimers(entry);
          this.#channels.delete(channel);
          continue;
        }

        try {
          if (
            this.#messenger.call(
              'BackendWebSocketService:channelHasSubscription',
              channel,
            )
          ) {
            this.#log(
              'Channel already subscribed on server, skipping resubscribe',
              {
                channel,
              },
            );
            continue;
          }

          await this.#subscribeOnServer(channel);
          this.#log('Resubscription succeeded', { channel });
        } catch (error) {
          this.#log('Resubscription failed for channel', {
            channel,
            error,
          });
        }
      }
    } finally {
      releaseLock();
    }
  }

  async #handleWebSocketStateChange(
    connectionInfo: WebSocketConnectionInfo,
  ): Promise<void> {
    if (
      connectionInfo.state === WebSocketState.CONNECTED &&
      this.#resubscribeOnConnect
    ) {
      await this.#resubscribeActiveChannels();
    }

    this.#options.onConnectionStateChange?.(connectionInfo);
  }

  // =============================================================================
  // Public — Cleanup
  // =============================================================================

  /**
   * Tear down all channel timers and, if configured, remove the
   * system-notifications channel callback.
   */
  destroy(): void {
    for (const entry of this.#channels.values()) {
      this.#clearChannelTimers(entry);
    }
    this.#channels.clear();

    const { systemNotificationsChannel } = this.#options;
    if (systemNotificationsChannel) {
      this.#messenger.call(
        'BackendWebSocketService:removeChannelCallback',
        systemNotificationsChannel,
      );
    }
  }
}

/**
 * True when subscribe failed because the shared socket cannot accept it yet.
 * That includes "WebSocket is …" while the bearer token is still loading, and
 * an authentication error from a connect() that was already in flight.
 *
 * @param error - Failure from connect or subscribe.
 * @returns Whether the channel should be kept and sent on CONNECTED.
 */
function isRetryableSubscribeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('WebSocket is') ||
    message.includes('Authentication required') ||
    message.includes('not signed in')
  );
}
