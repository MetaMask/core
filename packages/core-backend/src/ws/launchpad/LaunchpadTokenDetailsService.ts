/**
 * Launchpad Token Details Service for real-time token detail streaming via
 * WebSocket.
 *
 * Scoped to Token Detail Pages (TDP): it subscribes per-asset to a launchpad
 * token's own channel (`launchpad-tokens.v1.<assetId>`) and forwards the batched
 * `created | stats | migrated` events to the UI. Like {@link OHLCVService}, it is
 * stateless — it keeps no token store — and delegates the per-channel
 * subscription lifecycle (reference counting, grace-period unsubscribe,
 * unsubscribe retry, resubscribe on reconnect) to a shared
 * {@link ChannelSubscriptionManager} by composition.
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
import type { LaunchpadTokenDetailsServiceMethodActions } from './LaunchpadTokenDetailsService-method-action-types.js';
import {
  buildChannel,
  LAUNCHPAD_SUBSCRIPTION_NAMESPACE,
  parseBatch,
} from './normalize.js';
import type {
  LaunchpadTokenDetailsSubscriptionOptions,
  LaunchpadTokenEvent,
} from './types.js';

// =============================================================================
// Constants
// =============================================================================

const SERVICE_NAME = 'LaunchpadTokenDetailsService';

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = ['subscribe', 'unsubscribe'] as const;

const SYSTEM_NOTIFICATIONS_CHANNEL = `system-notifications.v1.${LAUNCHPAD_SUBSCRIPTION_NAMESPACE}`;

// =============================================================================
// Types — System Notifications
// =============================================================================

/**
 * System notification data for upstream status updates on launchpad channels.
 */
export type LaunchpadSystemNotificationData = {
  chainIds: string[];
  status: 'down' | 'up';
  timestamp?: number;
};

// =============================================================================
// Types — Service Options
// =============================================================================

/**
 * Configuration options for the launchpad token details service.
 */
export type LaunchpadTokenDetailsServiceOptions = {
  /** Optional callback to trace performance of launchpad operations (default: no-op) */
  traceFn?: TraceCallback;
};

// =============================================================================
// Action and Event Types
// =============================================================================

export type LaunchpadTokenDetailsServiceActions =
  LaunchpadTokenDetailsServiceMethodActions;

export const LAUNCHPAD_TDP_SERVICE_ALLOWED_ACTIONS = [
  ...CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_ACTIONS,
] as const;

export const LAUNCHPAD_TDP_SERVICE_ALLOWED_EVENTS = [
  ...CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_EVENTS,
] as const;

export type AllowedActions = BackendWebSocketServiceMethodActions;

// Events published by LaunchpadTokenDetailsService

export type LaunchpadTokenDetailsServiceTokenUpdatedEvent = {
  type: `LaunchpadTokenDetailsService:tokenUpdated`;
  payload: [{ channel: string; events: LaunchpadTokenEvent[] }];
};

export type LaunchpadTokenDetailsServiceStatusChangedEvent = {
  type: `LaunchpadTokenDetailsService:statusChanged`;
  payload: [{ chainIds: string[]; status: 'up' | 'down'; timestamp?: number }];
};

export type LaunchpadTokenDetailsServiceSubscriptionErrorEvent = {
  type: `LaunchpadTokenDetailsService:subscriptionError`;
  payload: [{ channel: string; error: string; operation: string }];
};

export type LaunchpadTokenDetailsServiceEvents =
  | LaunchpadTokenDetailsServiceTokenUpdatedEvent
  | LaunchpadTokenDetailsServiceStatusChangedEvent
  | LaunchpadTokenDetailsServiceSubscriptionErrorEvent;

export type AllowedEvents = BackendWebSocketServiceConnectionStateChangedEvent;

export type LaunchpadTokenDetailsServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  LaunchpadTokenDetailsServiceActions | AllowedActions,
  LaunchpadTokenDetailsServiceEvents | AllowedEvents
>;

// =============================================================================
// Main Service Class
// =============================================================================

/**
 * Service for real-time launchpad token detail streaming via the backend
 * WebSocket gateway. Communicates with {@link BackendWebSocketService}
 * exclusively through the messenger — no direct import of the class.
 *
 * Features:
 * - Reference counting: multiple UI consumers share one WebSocket subscription
 * - Grace-period unsubscribe: reuses same-channel subs on rapid back navigation
 * - Grace-period flush: immediately unsubscribes other channels on navigation
 * - Unsubscribe retry: retries failed unsubs with backoff before force reconnect
 * - Idempotency: duplicate subscribe calls for the same channel are no-ops
 * - Reconnect resilience: resubscribes all active channels on reconnect
 * - Status forwarding: listens to system-notifications for upstream up/down
 *
 */
export class LaunchpadTokenDetailsService {
  readonly name = SERVICE_NAME;

  readonly #messenger: LaunchpadTokenDetailsServiceMessenger;

  readonly #trace: TraceCallback;

  readonly #manager: ChannelSubscriptionManager;

  readonly #chainsUp = new Set<string>();

  // =============================================================================
  // Constructor
  // =============================================================================

  constructor(
    options: LaunchpadTokenDetailsServiceOptions & {
      messenger: LaunchpadTokenDetailsServiceMessenger;
    },
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
      channelType: LAUNCHPAD_SUBSCRIPTION_NAMESPACE,
      logPrefix: 'Launchpad-WS',
      onMessage: (channel, notification): void =>
        this.#handleTokenUpdate(channel, notification),
      onSubscriptionError: (channel, error, operation): void =>
        this.#messenger.publish(
          'LaunchpadTokenDetailsService:subscriptionError',
          {
            channel,
            error,
            operation,
          },
        ),
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
   * Subscribe to a launchpad token's detail channel. If this is the first
   * subscriber for the asset a WebSocket subscription is created. Additional
   * calls for the same asset only bump the reference count.
   *
   * @param options - The subscription parameters.
   * @returns A promise that resolves once the subscription is established.
   */
  async subscribe(
    options: LaunchpadTokenDetailsSubscriptionOptions,
  ): Promise<void> {
    await this.#manager.subscribe(buildChannel(options.assetId));
  }

  /**
   * Unsubscribe from a launchpad token's detail channel. Decrements the
   * reference count and, when it reaches zero, starts a grace-period timer before
   * actually unsubscribing from the WebSocket to absorb rapid navigation
   * patterns.
   *
   * @param options - The subscription parameters to unsubscribe from.
   * @returns A promise that resolves once the unsubscription is processed.
   */
  async unsubscribe(
    options: LaunchpadTokenDetailsSubscriptionOptions,
  ): Promise<void> {
    await this.#manager.unsubscribe(buildChannel(options.assetId));
  }

  // =============================================================================
  // Private — Message Handlers
  // =============================================================================

  #handleTokenUpdate(
    channel: string,
    notification: ServerNotificationMessage,
  ): void {
    const events = parseBatch(notification.data);

    if (events.length === 0) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#trace(
      {
        name: `${SERVICE_NAME} Token Update`,
        data: { channel, count: events.length },
        tags: { service: SERVICE_NAME },
      },
      () => {
        this.#messenger.publish('LaunchpadTokenDetailsService:tokenUpdated', {
          channel,
          events,
        });
      },
    );
  }

  #handleSystemNotification(notification: ServerNotificationMessage): void {
    const data = notification.data as LaunchpadSystemNotificationData;
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

    this.#messenger.publish('LaunchpadTokenDetailsService:statusChanged', {
      chainIds: data.chainIds,
      status: data.status,
      timestamp,
    });

    log(`Launchpad-WS: Status change: ${data.status}`, {
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
      this.#messenger.publish('LaunchpadTokenDetailsService:statusChanged', {
        chainIds: chainsToMarkDown,
        status: 'down',
        timestamp: Date.now(),
      });

      log(
        'Launchpad-WS: WebSocket disconnection — marked tracked chains as down',
        {
          count: chainsToMarkDown.length,
          chains: chainsToMarkDown,
        },
      );

      this.#chainsUp.clear();
    }
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
