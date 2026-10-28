/**
 * OHLCV Service for real-time candlestick data streaming via WebSocket.
 *
 * Wraps {@link BackendWebSocketService} through the messenger pattern to
 * provide subscribe/unsubscribe semantics for OHLCV market-data channels.
 * The per-channel subscription lifecycle (reference counting, grace-period
 * unsubscribe, unsubscribe retry, resubscribe on reconnect) is delegated to a
 * shared {@link ChannelSubscriptionManager} by composition; this service keeps
 * only the OHLCV domain concerns (channel-string building, bar forwarding, and
 * chain-status system notifications).
 */

import type {
  TraceCallback,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';

import { projectLogger, createModuleLogger } from '../../logger.js';
import type { BackendWebSocketServiceMethodActions } from '../BackendWebSocketService-method-action-types.js';
import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from '../BackendWebSocketService.js';
import { WebSocketState } from '../BackendWebSocketService.js';
import {
  ChannelSubscriptionManager,
  CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_ACTIONS,
  CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_EVENTS,
} from '../ChannelSubscriptionManager.js';
import type { OHLCVServiceMethodActions } from './OHLCVService-method-action-types.js';
import type { OHLCVBar, OHLCVSubscriptionOptions } from './types.js';

// =============================================================================
// Constants
// =============================================================================

const SERVICE_NAME = 'OHLCVService';

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = ['subscribe', 'unsubscribe'] as const;

const SUBSCRIPTION_NAMESPACE = 'market-data.v1';

const SYSTEM_NOTIFICATIONS_CHANNEL = `system-notifications.v1.${SUBSCRIPTION_NAMESPACE}`;

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
  ...CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_ACTIONS,
] as const;

export const OHLCV_SERVICE_ALLOWED_EVENTS = [
  ...CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_EVENTS,
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

export type AllowedEvents = BackendWebSocketServiceConnectionStateChangedEvent;

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
 * - Grace-period unsubscribe: reuses same-channel subs on rapid back navigation
 * - Grace-period flush: immediately unsubscribes other channels on navigation
 * - Unsubscribe retry: retries failed unsubs with backoff before force reconnect
 * - Idempotency: duplicate subscribe calls for the same channel are no-ops
 * - Reconnect resilience: resubscribes all active channels on reconnect
 * - Chain-status forwarding: listens to system-notifications for chain up/down
 *
 */
export class OHLCVService {
  readonly name = SERVICE_NAME;

  readonly #messenger: OHLCVServiceMessenger;

  readonly #trace: TraceCallback;

  readonly #manager: ChannelSubscriptionManager;

  readonly #chainsUp = new Set<string>();

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor(
    options: OHLCVServiceOptions & { messenger: OHLCVServiceMessenger },
  ) {
    this.#messenger = options.messenger;

    this.#trace =
      options.traceFn ??
      ((<Result>(
        _request: TraceRequest,
        fn?: (context?: TraceContext) => Result,
      ) => fn?.()) as TraceCallback);

    this.#manager = new ChannelSubscriptionManager({
      messenger: this.#messenger,
      channelType: SUBSCRIPTION_NAMESPACE,
      logPrefix: 'OHLCV-WS',
      onMessage: (channel, notification): void =>
        this.#handleBarUpdate(channel, notification),
      onSubscriptionError: (channel, error, operation): void =>
        this.#messenger.publish('OHLCVService:subscriptionError', {
          channel,
          error,
          operation,
        }),
      systemNotificationsChannel: SYSTEM_NOTIFICATIONS_CHANNEL,
      onSystemNotification: (notification): void =>
        this.#handleSystemNotification(notification),
      onConnectionStateChange: (connectionInfo): void =>
        this.#handleConnectionStateChange(connectionInfo),
    });

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Register the system-notifications channel callback.
   */
  init(): void {
    this.#manager.init();
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
   * @returns A promise that resolves once the subscription is established.
   */
  async subscribe(options: OHLCVSubscriptionOptions): Promise<void> {
    await this.#manager.subscribe(this.#buildChannel(options));
  }

  /**
   * Unsubscribe from an OHLCV channel. Decrements the reference count and,
   * when it reaches zero, starts a grace-period timer before actually
   * unsubscribing from the WebSocket to absorb rapid navigation patterns.
   *
   * @param options - The subscription parameters to unsubscribe from.
   * @returns A promise that resolves once the unsubscription is processed.
   */
  async unsubscribe(options: OHLCVSubscriptionOptions): Promise<void> {
    await this.#manager.unsubscribe(this.#buildChannel(options));
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

    log(`OHLCV-WS: Chain status change: ${data.status}`, {
      chains: data.chainIds,
      status: data.status,
    });
  }

  #handleConnectionStateChange(connectionInfo: WebSocketConnectionInfo): void {
    if (connectionInfo.state !== WebSocketState.DISCONNECTED) {
      return;
    }

    const chainsToMarkDown = Array.from(this.#chainsUp);

    if (chainsToMarkDown.length > 0) {
      this.#messenger.publish('OHLCVService:chainStatusChanged', {
        chainIds: chainsToMarkDown,
        status: 'down',
        timestamp: Date.now(),
      });

      log('OHLCV-WS: WebSocket disconnection — marked tracked chains as down', {
        count: chainsToMarkDown.length,
        chains: chainsToMarkDown,
      });

      this.#chainsUp.clear();
    }
  }

  // =============================================================================
  // Private — Utility
  // =============================================================================

  #buildChannel(options: OHLCVSubscriptionOptions): string {
    return `${SUBSCRIPTION_NAMESPACE}.${options.assetId}.${options.interval}.${options.currency}`;
  }

  // =============================================================================
  // Public — Cleanup
  // =============================================================================

  /**
   * Destroy the service and clean up all resources.
   */
  destroy(): void {
    this.#chainsUp.clear();
    this.#manager.destroy();
  }
}
