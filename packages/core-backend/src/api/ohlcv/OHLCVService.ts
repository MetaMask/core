/**
 * OHLCV Service for real-time candlestick data streaming via WebSocket.
 *
 * Wraps {@link BackendWebSocketService} through the messenger pattern to
 * provide subscribe/unsubscribe semantics for OHLCV market-data channels.
 * Includes reference counting, grace-period unsubscribe, idempotency checks,
 * chain-status forwarding, and automatic resubscription on reconnect.
 */

import type { TraceCallback } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';

import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from '../../BackendWebSocketService';
import { WebSocketState } from '../../BackendWebSocketService';
import type { BackendWebSocketServiceMethodActions } from '../../BackendWebSocketService-method-action-types';
import { projectLogger, createModuleLogger } from '../../logger';
import type { OHLCVServiceMethodActions } from './OHLCVService-method-action-types';
import type { OHLCVBar, OHLCVSubscriptionOptions } from './types';

// =============================================================================
// Constants
// =============================================================================

const SERVICE_NAME = 'OHLCVService';

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = ['subscribe', 'unsubscribe'] as const;

const SUBSCRIPTION_NAMESPACE = 'market-data.v1';

const SYSTEM_NOTIFICATIONS_CHANNEL = `system-notifications.v1.${SUBSCRIPTION_NAMESPACE}`;

/** Delay before actually unsubscribing from a channel after refCount reaches 0. */
const GRACE_PERIOD_MS = 3_000;

// =============================================================================
// Types — Channel Tracking
// =============================================================================

type ChannelEntry = {
  refCount: number;
  gracePeriodTimer?: ReturnType<typeof setTimeout>;
};

// =============================================================================
// Types — System Notifications
// =============================================================================

/**
 * System notification data for chain status updates on market-data channels.
 */
export type OHLCVSystemNotificationData = {
  chainIds: string[];
  status: 'down' | 'up';
  timestamp?: number;
};

// =============================================================================
// Types — Service Options
// =============================================================================

/**
 * Configuration options for the OHLCV service.
 */
export type OHLCVServiceOptions = {
  /** Optional callback to trace performance of OHLCV operations (default: no-op) */
  traceFn?: TraceCallback;
};

// =============================================================================
// Action and Event Types
// =============================================================================

export type OHLCVServiceActions = OHLCVServiceMethodActions;

export const OHLCV_SERVICE_ALLOWED_ACTIONS = [
  'BackendWebSocketService:connect',
  'BackendWebSocketService:forceReconnection',
  'BackendWebSocketService:subscribe',
  'BackendWebSocketService:getConnectionInfo',
  'BackendWebSocketService:channelHasSubscription',
  'BackendWebSocketService:getSubscriptionsByChannel',
  'BackendWebSocketService:findSubscriptionsByChannelPrefix',
  'BackendWebSocketService:addChannelCallback',
  'BackendWebSocketService:removeChannelCallback',
] as const;

export const OHLCV_SERVICE_ALLOWED_EVENTS = [
  'BackendWebSocketService:connectionStateChanged',
] as const;

export type AllowedActions = BackendWebSocketServiceMethodActions;

// Events published by OHLCVService

export type OHLCVServiceBarUpdatedEvent = {
  type: `OHLCVService:barUpdated`;
  payload: [{ channel: string; bar: OHLCVBar }];
};

export type OHLCVServiceChainStatusChangedEvent = {
  type: `OHLCVService:chainStatusChanged`;
  payload: [{ chainIds: string[]; status: 'up' | 'down'; timestamp?: number }];
};

export type OHLCVServiceSubscriptionErrorEvent = {
  type: `OHLCVService:subscriptionError`;
  payload: [{ channel: string; error: string; operation: string }];
};

export type OHLCVServiceEvents =
  | OHLCVServiceBarUpdatedEvent
  | OHLCVServiceChainStatusChangedEvent
  | OHLCVServiceSubscriptionErrorEvent;

export type AllowedEvents =
  BackendWebSocketServiceConnectionStateChangedEvent;

export type OHLCVServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  OHLCVServiceActions | AllowedActions,
  OHLCVServiceEvents | AllowedEvents
>;

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Service for real-time OHLCV candlestick streaming via the backend WebSocket
 * gateway. Communicates with {@link BackendWebSocketService} exclusively
 * through the messenger — no direct import of the class.
 *
 * Features:
 * - Reference counting: multiple UI consumers share one WebSocket subscription
 * - Grace-period unsubscribe: avoids rapid unsub/resub during navigation
 * - Idempotency: duplicate subscribe calls for the same channel are no-ops
 * - Reconnect resilience: resubscribes all active channels on reconnect
 * - Chain-status forwarding: listens to system-notifications for chain up/down
 *
 * @example
 * ```typescript
 * const service = new OHLCVService({ messenger });
 *
 * // Subscribe from a UI hook
 * await messenger.call('OHLCVService:subscribe', {
 *   assetId: 'eip155:8453/erc20:0x833...',
 *   interval: '1m',
 *   currency: 'usd',
 * });
 *
 * // Listen for bar updates
 * messenger.subscribe('OHLCVService:barUpdated', ({ channel, bar }) => {
 *   chart.appendBar(bar);
 * });
 *
 * // Unsubscribe when the view unmounts
 * await messenger.call('OHLCVService:unsubscribe', {
 *   assetId: 'eip155:8453/erc20:0x833...',
 *   interval: '1m',
 *   currency: 'usd',
 * });
 * ```
 */
export class OHLCVService {
  readonly name = SERVICE_NAME;

  readonly #messenger: OHLCVServiceMessenger;

  readonly #trace: TraceCallback;

  readonly #channels = new Map<string, ChannelEntry>();

  readonly #chainsUp = new Set<string>();

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor(
    options: OHLCVServiceOptions & { messenger: OHLCVServiceMessenger },
  ) {
    this.#messenger = options.messenger;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.#trace = options.traceFn ?? (((_req: any, fn?: any) => fn?.()) as TraceCallback);

    this.#messenger.registerMethodActionHandlers(this, MESSENGER_EXPOSED_METHODS);

    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (connectionInfo: WebSocketConnectionInfo) =>
        this.#handleWebSocketStateChange(connectionInfo),
    );
  }

  /**
   * Register the system-notifications channel callback. Must be called after
   * construction so that clients are not forced to instantiate services in a
   * specific order.
   */
  init(): void {
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: SYSTEM_NOTIFICATIONS_CHANNEL,
      callback: (notification: ServerNotificationMessage) =>
        this.#handleSystemNotification(notification),
    });
  }

  // =============================================================================
  // Public — Subscribe / Unsubscribe
  // =============================================================================

  /**
   * Subscribe to an OHLCV channel. If this is the first subscriber for the
   * given asset/interval/currency combination a WebSocket subscription is
   * created. Additional calls for the same combination only bump the reference
   * count.
   *
   * @param options - The subscription parameters.
   */
  async subscribe(options: OHLCVSubscriptionOptions): Promise<void> {
    const channel = this.#buildChannel(options);
    const entry = this.#channels.get(channel);

    if (entry?.gracePeriodTimer) {
      clearTimeout(entry.gracePeriodTimer);
      entry.gracePeriodTimer = undefined;
      entry.refCount += 1;
      log('Cancelled grace-period unsubscribe, bumped refCount', {
        channel,
        refCount: entry.refCount,
      });
      return;
    }

    if (entry && entry.refCount > 0) {
      entry.refCount += 1;
      return;
    }

    try {
      await this.#messenger.call('BackendWebSocketService:connect');

      if (
        this.#messenger.call(
          'BackendWebSocketService:channelHasSubscription',
          channel,
        )
      ) {
        this.#channels.set(channel, { refCount: 1 });
        return;
      }

      await this.#messenger.call('BackendWebSocketService:subscribe', {
        channels: [channel],
        channelType: SUBSCRIPTION_NAMESPACE,
        callback: (notification: ServerNotificationMessage) => {
          this.#handleBarUpdate(channel, notification);
        },
      });

      this.#channels.set(channel, { refCount: 1 });
    } catch (error) {
      log('Subscription failed, forcing reconnection', { channel, error });
      this.#messenger.publish('OHLCVService:subscriptionError', {
        channel,
        error: String(error),
        operation: 'subscribe',
      });
      await this.#forceReconnection();
    }
  }

  /**
   * Unsubscribe from an OHLCV channel. Decrements the reference count and,
   * when it reaches zero, starts a grace-period timer before actually
   * unsubscribing from the WebSocket to absorb rapid navigation patterns.
   *
   * @param options - The subscription parameters to unsubscribe from.
   */
  async unsubscribe(options: OHLCVSubscriptionOptions): Promise<void> {
    const channel = this.#buildChannel(options);
    const entry = this.#channels.get(channel);

    if (!entry || entry.refCount <= 0) {
      return;
    }

    entry.refCount -= 1;

    if (entry.refCount > 0) {
      return;
    }

    entry.gracePeriodTimer = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      this.#performUnsubscribe(channel);
    }, GRACE_PERIOD_MS);
  }

  // =============================================================================
  // Private — WebSocket Subscription Helpers
  // =============================================================================

  async #performUnsubscribe(channel: string): Promise<void> {
    this.#channels.delete(channel);

    try {
      const subscriptions = this.#messenger.call(
        'BackendWebSocketService:getSubscriptionsByChannel',
        channel,
      );

      for (const sub of subscriptions) {
        await sub.unsubscribe();
      }
    } catch (error) {
      log('Unsubscription failed, forcing reconnection', { channel, error });
      this.#messenger.publish('OHLCVService:subscriptionError', {
        channel,
        error: String(error),
        operation: 'unsubscribe',
      });
      await this.#forceReconnection();
    }
  }

  /**
   * Resubscribe all channels that were active before a disconnect.
   * Called when WebSocket transitions to CONNECTED.
   */
  async #resubscribeActiveChannels(): Promise<void> {
    for (const [channel, entry] of this.#channels.entries()) {
      if (entry.refCount <= 0 && !entry.gracePeriodTimer) {
        continue;
      }

      try {
        if (
          this.#messenger.call(
            'BackendWebSocketService:channelHasSubscription',
            channel,
          )
        ) {
          continue;
        }

        await this.#messenger.call('BackendWebSocketService:subscribe', {
          channels: [channel],
          channelType: SUBSCRIPTION_NAMESPACE,
          callback: (notification: ServerNotificationMessage) => {
            this.#handleBarUpdate(channel, notification);
          },
        });
      } catch (error) {
        log('Resubscription failed for channel', { channel, error });
      }
    }
  }

  // =============================================================================
  // Private — Message Handlers
  // =============================================================================

  #handleBarUpdate(
    channel: string,
    notification: ServerNotificationMessage,
  ): void {
    const bar = notification.data as OHLCVBar;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#trace(
      {
        name: `${SERVICE_NAME} Bar Update`,
        data: { channel, timestamp: bar.timestamp },
        tags: { service: SERVICE_NAME },
      },
      () => {
        this.#messenger.publish('OHLCVService:barUpdated', { channel, bar });
      },
    );
  }

  #handleSystemNotification(notification: ServerNotificationMessage): void {
    const data = notification.data as OHLCVSystemNotificationData;
    const { timestamp } = notification;

    if (!data.chainIds || !Array.isArray(data.chainIds) || !data.status) {
      throw new Error(
        'Invalid system notification data: missing chainIds or status',
      );
    }

    if (data.status === 'up') {
      for (const chainId of data.chainIds) {
        this.#chainsUp.add(chainId);
      }
    } else {
      for (const chainId of data.chainIds) {
        this.#chainsUp.delete(chainId);
      }
    }

    this.#messenger.publish('OHLCVService:chainStatusChanged', {
      chainIds: data.chainIds,
      status: data.status,
      timestamp,
    });

    log(`Chain status change: ${data.status}`, {
      chains: data.chainIds,
      status: data.status,
    });
  }

  async #handleWebSocketStateChange(
    connectionInfo: WebSocketConnectionInfo,
  ): Promise<void> {
    const { state } = connectionInfo;

    if (state === WebSocketState.CONNECTED) {
      await this.#resubscribeActiveChannels();
    } else if (state === WebSocketState.DISCONNECTED) {
      const chainsToMarkDown = Array.from(this.#chainsUp);

      if (chainsToMarkDown.length > 0) {
        this.#messenger.publish('OHLCVService:chainStatusChanged', {
          chainIds: chainsToMarkDown,
          status: 'down',
          timestamp: Date.now(),
        });

        log('WebSocket disconnection - marked tracked chains as down', {
          count: chainsToMarkDown.length,
          chains: chainsToMarkDown,
        });

        this.#chainsUp.clear();
      }
    }
  }

  // =============================================================================
  // Private — Utility
  // =============================================================================

  #buildChannel(options: OHLCVSubscriptionOptions): string {
    return `${SUBSCRIPTION_NAMESPACE}.${options.assetId}.${options.interval}.${options.currency}`;
  }

  async #forceReconnection(): Promise<void> {
    log('Forcing WebSocket reconnection');
    await this.#messenger.call('BackendWebSocketService:forceReconnection');
  }

  // =============================================================================
  // Public — Cleanup
  // =============================================================================

  /**
   * Destroy the service and clean up all resources.
   */
  destroy(): void {
    for (const entry of this.#channels.values()) {
      if (entry.gracePeriodTimer) {
        clearTimeout(entry.gracePeriodTimer);
      }
    }
    this.#channels.clear();

    this.#messenger.call(
      'BackendWebSocketService:removeChannelCallback',
      SYSTEM_NOTIFICATIONS_CHANNEL,
    );
  }
}
