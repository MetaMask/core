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
   * Called on every connection state change, after the manager performs its own
   * resubscribe-on-CONNECTED. Lets the host run domain reactions (e.g. marking
   * tracked chains down on DISCONNECTED).
   */
  onConnectionStateChange?: (connectionInfo: WebSocketConnectionInfo) => void;
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

  readonly #unsubRetryPolicy: ReturnType<typeof retry>;

  constructor(options: ChannelSubscriptionManagerOptions) {
    this.#options = options;
    this.#messenger = options.messenger;
    this.#channelType = options.channelType;
    this.#gracePeriodMs = options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS;

    const retryDelays = options.unsubRetryDelaysMs ?? [
      ...DEFAULT_UNSUB_RETRY_DELAYS_MS,
    ];
    this.#unsubRetryPolicy = retry(handleAll, {
      // Cockatiel stops retrying once the failure index reaches `maxAttempts`,
      // so `length` yields one initial attempt plus the delayed retries.
      maxAttempts: retryDelays.length,
      backoff: new IterableBackoff([...retryDelays]),
    });

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
   * Subscribe to a channel. If this is the first subscriber a WebSocket
   * subscription is created; additional calls for the same channel only bump the
   * reference count.
   *
   * @param channel - The fully-qualified channel name.
   * @returns A promise that resolves once the subscription is established.
   */
  async subscribe(channel: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      await this.#subscribeInner(channel);
    } finally {
      releaseLock();
    }
  }

  async #subscribeInner(channel: string): Promise<void> {
    const entry = this.#channels.get(channel);

    if (entry?.retryAbort) {
      entry.retryAbort.abort();
      entry.retryAbort = undefined;
      entry.refCount = 1;

      if (
        this.#messenger.call(
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        await this.#flushOtherChannels(channel);
        this.#log('Cancelled unsubscribe retry — reusing WS subscription', {
          channel,
        });
        return;
      }
      // WS subscription was lost — fall through to recreate it.
    } else if (entry?.gracePeriodTimer) {
      clearTimeout(entry.gracePeriodTimer);
      entry.gracePeriodTimer = undefined;
      this.#log('Cancelled grace-period unsubscribe', {
        channel,
      });

      if (
        this.#messenger.call(
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        await this.#flushOtherChannels(channel);
        entry.refCount += 1;
        this.#log('WS subscription still alive, bumped refCount', {
          channel,
          refCount: entry.refCount,
        });
        return;
      }
      // WS subscription was lost (e.g. after disconnect/reconnect) — fall
      // through to recreate it. refCount is bumped only after success below.
    } else if (entry && entry.refCount > 0) {
      entry.refCount += 1;
      return;
    }

    await this.#flushOtherChannels(channel);

    try {
      await this.#messenger.call('BackendWebSocketService:connect');

      if (
        this.#messenger.call(
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        this.#log(
          'Channel already has WS subscription (idempotency), skipping',
          {
            channel,
          },
        );
        this.#channels.set(channel, { refCount: 1 });
        return;
      }

      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels: [channel],
        channelType: this.#channelType,
        callback: (notification: ServerNotificationMessage) => {
          this.#options.onMessage(channel, notification);
        },
      });

      this.#channels.set(channel, { refCount: 1 });
      this.#log('Subscribe succeeded — new WS subscription created', {
        channel,
      });
    } catch (error) {
      this.#log('Subscription failed', { channel, error });
      this.#channels.delete(channel);
      this.#options.onSubscriptionError?.(channel, String(error), 'subscribe');
    }
  }

  /**
   * Unsubscribe from a channel. Decrements the reference count and, when it
   * reaches zero, starts a grace-period timer before actually unsubscribing from
   * the WebSocket to absorb rapid navigation patterns.
   *
   * @param channel - The fully-qualified channel name.
   * @returns A promise that resolves once the unsubscription is processed.
   */
  async unsubscribe(channel: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      await this.#unsubscribeInner(channel);
    } finally {
      releaseLock();
    }
  }

  async #unsubscribeInner(channel: string): Promise<void> {
    const entry = this.#channels.get(channel);

    if (!entry || entry.refCount <= 0) {
      return;
    }

    entry.refCount -= 1;

    if (entry.refCount > 0) {
      return;
    }

    entry.gracePeriodTimer = setTimeout(() => {
      entry.gracePeriodTimer = undefined;
      this.#performUnsubscribe(channel).catch(() => {
        // no-op: retry scheduling and force-reconnection are handled internally
      });
    }, this.#gracePeriodMs);
  }

  // =============================================================================
  // Private — WebSocket Subscription Helpers
  // =============================================================================

  /**
   * Immediately unsubscribe other channels in grace or failed-cleanup state.
   * Called while the subscribe mutex is held before opening a new channel.
   *
   * @param exceptChannel - Channel being subscribed; excluded from flush.
   */
  async #flushOtherChannels(exceptChannel: string): Promise<void> {
    for (const [channel, channelEntry] of this.#channels.entries()) {
      if (channel === exceptChannel || channelEntry.refCount > 0) {
        continue;
      }

      this.#clearChannelTimers(channelEntry);
      this.#log('Flushing grace-period channel before new subscribe', {
        flushedChannel: channel,
        newChannel: exceptChannel,
      });

      const success = await this.#unsubscribeChannelOnServer(channel);
      if (success) {
        this.#channels.delete(channel);
      } else {
        this.#scheduleUnsubscribeRetry(channel);
      }
    }
  }

  #clearChannelTimers(entry: ChannelEntry): void {
    if (entry.gracePeriodTimer) {
      clearTimeout(entry.gracePeriodTimer);
      entry.gracePeriodTimer = undefined;
    }
    entry.retryAbort?.abort();
    entry.retryAbort = undefined;
  }

  async #unsubscribeChannelOnServer(channel: string): Promise<boolean> {
    try {
      const subscriptions = this.#messenger.call(
        'BackendWebSocketService:getSubscriptionsByChannel',
        channel,
      );

      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
      return true;
    } catch (error) {
      this.#log('Unsubscription failed', { channel, error });
      this.#options.onSubscriptionError?.(
        channel,
        String(error),
        'unsubscribe',
      );
      return false;
    }
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

    entry.retryAbort?.abort();
    entry.retryAbort = new AbortController();

    const { signal } = entry.retryAbort;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#runUnsubRetryLoop(channel, signal);
  }

  async #runUnsubRetryLoop(
    channel: string,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.#unsubRetryPolicy.execute(async () => {
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

      this.#log('Unsubscribe retries exhausted — forcing reconnection', {
        channel,
      });
      this.#channels.delete(channel);
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

  async #performUnsubscribe(channel: string): Promise<void> {
    const releaseLock = await this.#mutex.acquire();
    try {
      const entry = this.#channels.get(channel);
      if (entry && entry.refCount > 0) {
        this.#log(
          'Skipping unsubscribe — new subscriber arrived while queued',
          { channel, refCount: entry.refCount },
        );
        return;
      }

      this.#log('Grace period expired — performing actual WS unsubscribe', {
        channel,
      });

      this.#clearChannelTimers(this.#channels.get(channel) ?? { refCount: 0 });
    } finally {
      releaseLock();
    }

    this.#scheduleUnsubscribeRetry(channel);
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

          await this.#messenger.call('BackendWebSocketService:subscribe', {
            channels: [channel],
            channelType: this.#channelType,
            callback: (notification: ServerNotificationMessage) => {
              this.#options.onMessage(channel, notification);
            },
          });
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
    if (connectionInfo.state === WebSocketState.CONNECTED) {
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
