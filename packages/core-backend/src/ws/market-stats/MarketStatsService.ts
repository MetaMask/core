/**
 * Market-stats service for real-time spot prices via WebSocket.
 *
 * Subscribes per asset and currency (`market-stats.v1.<assetId>.<currency>`).
 * A list of assets is one WebSocket subscribe frame. The gateway batches
 * price changes onto the top-level `market-stats.v1` channel, about every
 * 30 seconds, and reports chain health on
 * `system-notifications.v1.market-stats.v1`.
 *
 * Subscription lifecycle (reference counting, grace-period unsubscribe) is
 * delegated to {@link ChannelSubscriptionManager}. When the socket connects,
 * this service sends the channels it was asked to watch.
 */

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
import {
  buildMarketStatsChannel,
  parseMarketStatsBatch,
  parseMarketStatsChannel,
} from './normalize.js';
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

/**
 * Channel identity the gateway stores.
 *
 * EVM token addresses are lowercased. The gateway does the same before it
 * echoes the channel, so a checksummed custom token matches that echo.
 * Other asset ids stay as given. Currency is lowercased.
 *
 * @param subscription - Asset and currency from the caller.
 * @returns The asset id and currency used in the channel name.
 */
function canonicalMarketStatsSubscription(
  subscription: MarketStatsSubscriptionOptions,
): MarketStatsSubscriptionOptions {
  return {
    assetId: subscription.assetId.replace(/0x[0-9a-fA-F]{40}/gu, (address) =>
      address.toLowerCase(),
    ),
    currency: subscription.currency.toLowerCase(),
  };
}

const log = createModuleLogger(projectLogger, SERVICE_NAME);

const MESSENGER_EXPOSED_METHODS = [
  'subscribe',
  'unsubscribe',
  'getSubscriptions',
  'getChainStatuses',
] as const;

/**
 * One or more market-stats subscribes failed after the socket accepted the
 * rest. `failedAssets` are the ones that were not opened.
 */
export class MarketStatsSubscribeError extends Error {
  readonly failedAssets: readonly MarketStatsSubscriptionOptions[];

  constructor(
    failedAssets: readonly {
      assetId: string;
      currency: string;
      message: string;
    }[],
  ) {
    super(failedAssets.map((asset) => asset.message).join('; '));
    this.name = 'MarketStatsSubscribeError';
    this.failedAssets = failedAssets.map(({ assetId, currency }) => ({
      assetId,
      currency,
    }));
  }
}

/**
 * Chain health last reported for a market-stats chain.
 * `down` after a system notification or a socket disconnect. `up` after a
 * recovery notification. Chains that have not been reported are omitted.
 */
export type MarketStatsChainStatus = {
  chainId: string;
  status: 'up' | 'down';
};

/**
 * System notification data for chain status on market-stats channels.
 */
export type MarketStatsSystemNotificationData = {
  chainIds: string[];
  status: 'down' | 'up';
  timestamp?: number;
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

/**
 * Shared-socket state, published so callers do not subscribe to
 * `BackendWebSocketService:connectionStateChanged`.
 */
export type MarketStatsServiceConnectionStateChangedEvent = {
  type: `MarketStatsService:connectionStateChanged`;
  payload: [{ state: WebSocketState }];
};

export type MarketStatsServiceEvents =
  | MarketStatsServicePricesUpdatedEvent
  | MarketStatsServiceChainStatusChangedEvent
  | MarketStatsServiceSubscriptionErrorEvent
  | MarketStatsServiceConnectionStateChangedEvent;

export type AllowedEvents = BackendWebSocketServiceConnectionStateChangedEvent;

export type MarketStatsServiceMessenger = Messenger<
  typeof SERVICE_NAME,
  MarketStatsServiceActions | AllowedActions,
  MarketStatsServiceEvents | AllowedEvents
>;

/**
 * Real-time spot prices over the shared backend WebSocket.
 *
 * The first {@link MarketStatsService.subscribe} registers the chain-status
 * callback and the `market-stats.v1` batch callback. A channel already open
 * is left as it is. The gateway rejects a subscribe that would pass its
 * session limit, and that limit can change.
 */
export class MarketStatsService {
  readonly name = SERVICE_NAME;

  readonly #messenger: MarketStatsServiceMessenger;

  readonly #manager: ChannelSubscriptionManager;

  /** Last reported health for each chain. Callers read this via `getChainStatuses`. */
  readonly #chainStatus = new Map<string, 'up' | 'down'>();

  /** Subscribe failures reported by the manager for the in-flight subscribe. */
  readonly #subscribeErrors = new Map<string, string>();

  /** True after the chain-status and batch callbacks are registered. */
  #callbacksRegistered = false;

  constructor({ messenger }: { messenger: MarketStatsServiceMessenger }) {
    this.#messenger = messenger;

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
      // This service subscribes from the CONNECTED handler below.
      resubscribeOnConnect: false,
      // A rejected market-stats channel falls back to the price poll.
      // Reconnecting would drop every other consumer of this socket.
      forceReconnectOnUnsubscribeFailure: false,
    });

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Subscribe to one asset, or to many assets in one WebSocket frame.
   *
   * Each asset uses `market-stats.v1.<assetId>.<currency>`. A list is one
   * `subscribe` frame. A channel that is already open is left as it is.
   *
   * Price changes arrive later as a batch on `MarketStatsService:pricesUpdated`,
   * not on this channel.
   *
   * @param options - One asset, or the assets to subscribe together.
   * @returns A promise that resolves once the subscription is recorded.
   * When the socket is still waiting on the bearer token, the subscribe frame
   * is sent from the CONNECTED handler. Rejects when the gateway rejects a
   * channel, including when the subscribe would pass the session limit. A
   * list rejects with {@link MarketStatsSubscribeError} listing only the
   * assets that were not opened. Channels the gateway accepted stay open.
   */
  async subscribe(
    options:
      | MarketStatsSubscriptionOptions
      | readonly MarketStatsSubscriptionOptions[],
  ): Promise<void> {
    const requested: readonly MarketStatsSubscriptionOptions[] = Array.isArray(
      options,
    )
      ? options
      : [options];
    const seen = new Set<string>();
    const subscriptions: {
      assetId: string;
      currency: string;
      channel: string;
    }[] = [];
    for (const subscription of requested) {
      const canonical = canonicalMarketStatsSubscription(subscription);
      const channel = buildMarketStatsChannel(canonical);
      if (seen.has(channel)) {
        continue;
      }
      seen.add(channel);
      subscriptions.push({ ...canonical, channel });
    }
    if (subscriptions.length === 0) {
      return;
    }

    this.#registerCallbacks();

    const active = new Set(this.#manager.getActiveChannels());
    const opening = subscriptions.filter(
      (subscription) => !active.has(subscription.channel),
    );
    if (opening.length === 0) {
      return;
    }

    for (const subscription of opening) {
      this.#subscribeErrors.delete(subscription.channel);
    }

    await this.#manager.subscribe(
      opening.map((subscription) => subscription.channel),
    );

    const failed: {
      assetId: string;
      currency: string;
      message: string;
    }[] = [];
    for (const subscription of opening) {
      const message = this.#subscribeErrors.get(subscription.channel);
      if (!message) {
        continue;
      }
      this.#subscribeErrors.delete(subscription.channel);
      failed.push({
        assetId: subscription.assetId,
        currency: subscription.currency,
        message,
      });
    }
    if (failed.length > 0) {
      throw new MarketStatsSubscribeError(failed);
    }
  }

  /**
   * Unsubscribe from one asset, or from many assets in one WebSocket frame.
   *
   * Decrements each reference count. Channels that reach zero share one
   * grace-period timer, then leave in one `unsubscribe` frame.
   *
   * @param options - One asset, or the assets to unsubscribe together.
   * @returns A promise that resolves once the unsubscription is recorded.
   */
  async unsubscribe(
    options:
      | MarketStatsSubscriptionOptions
      | readonly MarketStatsSubscriptionOptions[],
  ): Promise<void> {
    const requested: readonly MarketStatsSubscriptionOptions[] = Array.isArray(
      options,
    )
      ? options
      : [options];
    const channels = [
      ...new Set(
        requested.map((entry) =>
          buildMarketStatsChannel(canonicalMarketStatsSubscription(entry)),
        ),
      ),
    ];
    await this.#manager.unsubscribe(channels);
  }

  /**
   * Channels with a live reference count. This is the open set; callers do not
   * keep their own copy.
   *
   * @returns One entry per open market-stats channel.
   */
  getSubscriptions(): { assetId: string; currency: string }[] {
    const subscriptions: { assetId: string; currency: string }[] = [];
    for (const channel of this.#manager.getActiveChannels()) {
      const subscription = parseMarketStatsChannel(channel);
      if (subscription) {
        subscriptions.push(subscription);
      }
    }
    return subscriptions;
  }

  /**
   * Chain health this service has recorded. Callers read this instead of
   * keeping a copy from `chainStatusChanged`.
   *
   * @returns One entry per chain that has been reported up or down.
   */
  getChainStatuses(): MarketStatsChainStatus[] {
    return [...this.#chainStatus.entries()].map(([chainId, status]) => ({
      chainId,
      status,
    }));
  }

  /**
   * Register the chain-status callback and the `market-stats.v1` batch
   * callback. The gateway delivers prices on that batch channel, not on the
   * per-asset subscription channel. Runs once, on the first subscribe.
   */
  #registerCallbacks(): void {
    if (this.#callbacksRegistered) {
      return;
    }

    this.#manager.init();
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: MARKET_STATS_BATCH_CHANNEL,
      callback: (notification: ServerNotificationMessage) =>
        this.#publishBatch(notification),
    });
    this.#callbacksRegistered = true;
  }

  #publishBatch(notification: ServerNotificationMessage): void {
    const updates = parseMarketStatsBatch(notification.data);
    if (updates.length === 0) {
      return;
    }

    this.#messenger.publish('MarketStatsService:pricesUpdated', {
      updates,
      timestamp: notification.timestamp,
    });
  }

  #handleSystemNotification(notification: ServerNotificationMessage): void {
    const data = notification.data as MarketStatsSystemNotificationData;
    const { timestamp } = notification;

    if (!data.chainIds || !Array.isArray(data.chainIds) || !data.status) {
      throw new Error(
        'Invalid system notification data: missing chainIds or status',
      );
    }

    for (const chainId of data.chainIds) {
      this.#chainStatus.set(chainId, data.status);
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
    this.#messenger.publish('MarketStatsService:connectionStateChanged', {
      state: connectionInfo.state,
    });

    if (connectionInfo.state === WebSocketState.CONNECTED) {
      this.#subscribeTrackedChannels().catch((error: unknown) => {
        log('MarketStats-WS: subscribe on connect failed', { error });
      });
      return;
    }

    if (connectionInfo.state !== WebSocketState.DISCONNECTED) {
      return;
    }

    const chainsToMarkDown = this.getChainStatuses()
      .filter((entry) => entry.status === 'up')
      .map((entry) => entry.chainId);
    if (chainsToMarkDown.length === 0) {
      return;
    }

    for (const chainId of chainsToMarkDown) {
      this.#chainStatus.set(chainId, 'down');
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
  }

  /**
   * Send every channel callers asked for. Channels already on the server are
   * left alone. Reference counts stay as they were.
   */
  async #subscribeTrackedChannels(): Promise<void> {
    const channels = this.#manager.getActiveChannels();
    if (channels.length === 0) {
      return;
    }

    log('MarketStats-WS: socket connected — subscribing tracked channels', {
      count: channels.length,
      channels,
    });

    await this.#manager.ensureSubscribedChannels(channels);

    for (const channel of channels) {
      const error = this.#subscribeErrors.get(channel);
      if (!error) {
        continue;
      }
      // The server rejected this channel. Drop it so the next connect
      // does not send it again. The caller polls that asset instead.
      this.#subscribeErrors.delete(channel);
      log('MarketStats-WS: failed to subscribe channel on connect', {
        channel,
        error,
      });
    }
  }

  /**
   * Tear down channel timers and remove the batch and system-notification callbacks.
   */
  destroy(): void {
    this.#chainStatus.clear();
    this.#subscribeErrors.clear();
    if (this.#callbacksRegistered) {
      this.#messenger.call(
        'BackendWebSocketService:removeChannelCallback',
        MARKET_STATS_BATCH_CHANNEL,
      );
      this.#callbacksRegistered = false;
    }
    this.#manager.destroy();
  }
}
