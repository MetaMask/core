/**
 * Market-stats service for real-time spot prices via WebSocket.
 *
 * Subscribes per asset and currency (`market-stats.v1.<assetId>.<currency>`).
 * The gateway batches price changes onto the top-level `market-stats.v1`
 * channel, about every 30 seconds, and reports chain health on
 * `system-notifications.v1.market-stats.v1`.
 *
 * Subscription lifecycle (reference counting, grace-period unsubscribe,
 * resubscribe on reconnect) is delegated to {@link ChannelSubscriptionManager}.
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
import type { MarketStatsServiceMethodActions } from './MarketStatsService-method-action-types.js';
import { buildMarketStatsChannel, parseMarketStatsBatch } from './normalize.js';
import type {
  MarketStatsPriceUpdate,
  MarketStatsSubscriptionOptions,
} from './types.js';
import {
  MARKET_STATS_BATCH_CHANNEL,
  MARKET_STATS_NAMESPACE,
  MARKET_STATS_SYSTEM_NOTIFICATIONS_CHANNEL,
} from './types.js';

const SERVICE_NAME = 'MarketStatsService';

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = ['subscribe', 'unsubscribe'] as const;

/**
 * System notification data for chain status on market-stats channels.
 */
export type MarketStatsSystemNotificationData = {
  chainIds: string[];
  status: 'down' | 'up';
  timestamp?: number;
};

/**
 * Configuration options for the market-stats service.
 */
export type MarketStatsServiceOptions = {
  /** Optional callback to trace market-stats operations (default: no-op). */
  traceFn?: TraceCallback;
};

export type MarketStatsServiceActions = MarketStatsServiceMethodActions;

export const MARKET_STATS_SERVICE_ALLOWED_ACTIONS = [
  ...CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_ACTIONS,
] as const;

export const MARKET_STATS_SERVICE_ALLOWED_EVENTS = [
  ...CHANNEL_SUBSCRIPTION_MANAGER_ALLOWED_EVENTS,
] as const;

export type AllowedActions = BackendWebSocketServiceMethodActions;

export type MarketStatsServicePricesUpdatedEvent = {
  type: `MarketStatsService:pricesUpdated`;
  payload: [{ updates: MarketStatsPriceUpdate[]; timestamp?: number }];
};

export type MarketStatsServiceChainStatusChangedEvent = {
  type: `MarketStatsService:chainStatusChanged`;
  payload: [{ chainIds: string[]; status: 'up' | 'down'; timestamp?: number }];
};

export type MarketStatsServiceSubscriptionErrorEvent = {
  type: `MarketStatsService:subscriptionError`;
  payload: [{ channel: string; error: string; operation: string }];
};

export type MarketStatsServiceEvents =
  | MarketStatsServicePricesUpdatedEvent
  | MarketStatsServiceChainStatusChangedEvent
  | MarketStatsServiceSubscriptionErrorEvent;

export type AllowedEvents = BackendWebSocketServiceConnectionStateChangedEvent;

export type MarketStatsServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  MarketStatsServiceActions | AllowedActions,
  MarketStatsServiceEvents | AllowedEvents
>;

/**
 * Real-time spot prices over the shared backend WebSocket.
 *
 * Call {@link MarketStatsService.init} after construction so batch and
 * chain-status callbacks are registered. A session may subscribe to at most
 * 200 market-stats channels; callers decide which assets keep that slot.
 */
export class MarketStatsService {
  readonly name = SERVICE_NAME;

  readonly #messenger: MarketStatsServiceMessenger;

  readonly #trace: TraceCallback;

  readonly #manager: ChannelSubscriptionManager;

  readonly #chainsUp = new Set<string>();

  /** Subscribe failures reported by the manager for the in-flight subscribe. */
  readonly #subscribeErrors = new Map<string, string>();

  constructor(
    options: MarketStatsServiceOptions & {
      messenger: MarketStatsServiceMessenger;
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
      channelType: MARKET_STATS_NAMESPACE,
      logPrefix: 'MarketStats-WS',
      onMessage: (_channel, notification): void =>
        this.#publishBatch(notification),
      onSubscriptionError: (channel, error, operation): void => {
        if (operation === 'subscribe') {
          this.#subscribeErrors.set(channel, error);
        }
        this.#messenger.publish('MarketStatsService:subscriptionError', {
          channel,
          error,
          operation,
        });
      },
      systemNotificationsChannel: MARKET_STATS_SYSTEM_NOTIFICATIONS_CHANNEL,
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
   * Register the batch channel and the system-notifications callback.
   * Safe to call more than once.
   */
  init(): void {
    this.#manager.init();
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: MARKET_STATS_BATCH_CHANNEL,
      callback: (notification: ServerNotificationMessage) =>
        this.#publishBatch(notification),
    });
  }

  /**
   * Subscribe to one asset's market-stats channel
   * (`market-stats.v1.<assetId>.<currency>`). The first subscriber opens the
   * WebSocket subscription. Further calls for the same channel only bump the
   * reference count.
   *
   * Price changes arrive later as a batch on `MarketStatsService:pricesUpdated`,
   * not on this channel.
   *
   * @param options - Asset and currency to subscribe.
   * @returns A promise that resolves once the subscription is established.
   * Rejects when the socket subscribe fails.
   */
  async subscribe(options: MarketStatsSubscriptionOptions): Promise<void> {
    const channel = buildMarketStatsChannel(options);
    this.#subscribeErrors.delete(channel);
    await this.#manager.subscribe(channel);

    const error = this.#subscribeErrors.get(channel);
    if (error) {
      this.#subscribeErrors.delete(channel);
      throw new Error(error);
    }
  }

  /**
   * Unsubscribe from one asset's market-stats channel. Decrements the reference
   * count and, when it reaches zero, starts a grace-period timer before actually
   * unsubscribing from the WebSocket.
   *
   * @param options - Asset and currency to unsubscribe.
   * @returns A promise that resolves once the unsubscription is processed.
   */
  async unsubscribe(options: MarketStatsSubscriptionOptions): Promise<void> {
    await this.#manager.unsubscribe(buildMarketStatsChannel(options));
  }

  #publishBatch(notification: ServerNotificationMessage): void {
    const updates = parseMarketStatsBatch(notification.data);
    if (updates.length === 0) {
      return;
    }

    const { timestamp } = notification;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.#trace(
      {
        name: `${SERVICE_NAME} Price Batch`,
        data: { count: updates.length, timestamp },
        tags: { service: SERVICE_NAME },
      },
      () => {
        this.#messenger.publish('MarketStatsService:pricesUpdated', {
          updates,
          timestamp,
        });
      },
    );
  }

  #handleSystemNotification(notification: ServerNotificationMessage): void {
    const data = notification.data as MarketStatsSystemNotificationData;
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

    this.#messenger.publish('MarketStatsService:chainStatusChanged', {
      chainIds: data.chainIds,
      status: data.status,
      timestamp,
    });

    log(`MarketStats-WS: Chain status change: ${data.status}`, {
      chains: data.chainIds,
      status: data.status,
    });
  }

  #handleConnectionStateChange(connectionInfo: WebSocketConnectionInfo): void {
    if (connectionInfo.state !== WebSocketState.DISCONNECTED) {
      return;
    }

    const chainsToMarkDown = Array.from(this.#chainsUp);
    if (chainsToMarkDown.length === 0) {
      return;
    }

    this.#messenger.publish('MarketStatsService:chainStatusChanged', {
      chainIds: chainsToMarkDown,
      status: 'down',
      timestamp: Date.now(),
    });

    log(
      'MarketStats-WS: WebSocket disconnection — marked tracked chains as down',
      {
        count: chainsToMarkDown.length,
        chains: chainsToMarkDown,
      },
    );

    this.#chainsUp.clear();
  }

  /**
   * Tear down channel timers and remove the batch and system-notification callbacks.
   */
  destroy(): void {
    this.#chainsUp.clear();
    this.#subscribeErrors.clear();
    this.#messenger.call(
      'BackendWebSocketService:removeChannelCallback',
      MARKET_STATS_BATCH_CHANNEL,
    );
    this.#manager.destroy();
  }
}
