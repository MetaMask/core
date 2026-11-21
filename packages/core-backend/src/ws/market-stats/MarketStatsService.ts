/**
 * Market-stats service for real-time spot prices via WebSocket.
 *
 * Subscribes per asset and currency (`market-stats.v1.<assetId>.<currency>`).
 * A list of assets is one WebSocket subscribe frame. Channels that close
 * together go out in one unsubscribe frame per subscription. The gateway batches
 * price changes onto the top-level `market-stats.v1` channel, about every
 * 30 seconds, and reports chain health on
 * `system-notifications.v1.market-stats.v1`.
 *
 * Each channel keeps the callers that want it. `unsubscribe` closes the socket
 * channel when the last caller leaves. When the socket connects, the open
 * channels go out in one frame.
 */

import type { Messenger } from '@metamask/messenger';
import { isCaipAssetType, parseCaipAssetType } from '@metamask/utils';

import { projectLogger, createModuleLogger } from '../../logger.js';
import type { BackendWebSocketServiceMethodActions } from '../BackendWebSocketService-method-action-types.js';
import type {
  WebSocketConnectionInfo,
  BackendWebSocketServiceConnectionStateChangedEvent,
  ServerNotificationMessage,
} from '../BackendWebSocketService.js';
import { WebSocketState } from '../BackendWebSocketService.js';
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
 * Narrow a subscribe argument to a list. `Array.isArray` alone narrows a
 * readonly array to `any[]`, which makes each element `any` for the linter.
 *
 * @param options - One asset, or a list of assets.
 * @returns Whether the argument is a list.
 */
function isSubscriptionList(
  options:
    | MarketStatsSubscriptionOptions
    | readonly MarketStatsSubscriptionOptions[],
): options is readonly MarketStatsSubscriptionOptions[] {
  return Array.isArray(options);
}

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
  'BackendWebSocketService:connect',
  'BackendWebSocketService:subscribe',
  'BackendWebSocketService:unsubscribeChannels',
  'BackendWebSocketService:channelHasSubscription',
  'BackendWebSocketService:addChannelCallback',
  'BackendWebSocketService:removeChannelCallback',
] as const;

export const MARKET_STATS_SERVICE_ALLOWED_EVENTS = [
  'BackendWebSocketService:connectionStateChanged',
] as const;

export type AllowedActions = BackendWebSocketServiceMethodActions;

export type MarketStatsServicePricesUpdatedEvent = {
  type: `MarketStatsService:pricesUpdated`;
  payload: [
    {
      updates: MarketStatsPriceUpdate[];
      /**
       * Quotes to drop: a channel that just closed, or an open channel
       * whose chain was reported down. Empty on a price batch.
       */
      removed: MarketStatsSubscriptionOptions[];
    },
  ];
};

export type MarketStatsServiceEvents = MarketStatsServicePricesUpdatedEvent;

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
 * callback and the `market-stats.v1` batch callback. A channel another caller
 * already wants only gains that caller. The gateway rejects a subscribe that
 * would pass its session limit, and that limit can change.
 */
export class MarketStatsService {
  readonly name = SERVICE_NAME;

  readonly #messenger: MarketStatsServiceMessenger;

  /** Open channels and the callers that want each one. */
  readonly #channels = new Map<string, Set<string>>();

  /** Last reported health for each chain. Callers read this via `getChainStatuses`. */
  readonly #chainStatus = new Map<string, 'up' | 'down'>();

  /** Serializes subscribe, unsubscribe, and reconnect. */
  #operation: Promise<void> = Promise.resolve();

  #systemCallbackRegistered = false;

  #batchCallbackRegistered = false;

  #destroyed = false;

  constructor({ messenger }: { messenger: MarketStatsServiceMessenger }) {
    this.#messenger = messenger;
    this.#messenger.subscribe(
      'BackendWebSocketService:connectionStateChanged',
      (connectionInfo: WebSocketConnectionInfo) =>
        this.#handleConnectionStateChange(connectionInfo),
    );
    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Make `options` the only channels this caller wants.
   *
   * Each asset uses `market-stats.v1.<assetId>.<currency>`. Channels that are
   * not already open go out in one `subscribe` frame. A channel another caller
   * already wants only gains this caller. Channels this caller held and no
   * longer lists lose it, and close when no caller is left. Those channels
   * go out in one `unsubscribe` frame per subscription.
   *
   * Price changes arrive later as a batch on `MarketStatsService:pricesUpdated`,
   * not on this channel. When the last caller leaves a channel, or the gateway
   * refuses it, that event lists the asset in `removed` and the quote map drops
   * it and the channel is left closed. The spot-price poll keeps fetching it.
   *
   * @param options - One asset, or the assets this caller wants now. An empty
   * list drops this caller from every channel.
   * @param caller - Name of the caller whose channels are replaced.
   * @returns A promise that resolves once the subscriptions are recorded.
   * When the socket is not connected yet, the frame is sent from the CONNECTED
   * handler.
   */
  async subscribe(
    options:
      | MarketStatsSubscriptionOptions
      | readonly MarketStatsSubscriptionOptions[],
    caller: string,
  ): Promise<void> {
    const channels = this.#channelNames(options);
    await this.#run(async () => {
      if (channels.length > 0) {
        this.#registerCallbacks();
      }
      const desired = new Set(channels);
      const leaving = [...this.#channels.keys()].filter(
        (channel) =>
          this.#channels.get(channel)?.has(caller) && !desired.has(channel),
      );
      const closing = this.#drop(caller, leaving);
      this.#publishRemoved(closing);
      await this.#unsubscribeOnSocket(closing);

      const opening: string[] = [];
      for (const channel of channels) {
        const callers = this.#channels.get(channel);
        if (callers) {
          callers.add(caller);
          continue;
        }
        this.#channels.set(channel, new Set([caller]));
        opening.push(channel);
      }
      if (opening.length === 0) {
        return;
      }
      await this.#subscribeOnSocket(opening);
    });
  }

  /**
   * Remove one caller from each listed channel.
   *
   * A channel closes when its last caller leaves. Other callers on the same
   * channel keep it open.
   *
   * @param options - One asset, or the assets to stop for this caller.
   * @param caller - Name of the caller to remove.
   * @returns A promise that resolves once every unsubscription is recorded.
   */
  async unsubscribe(
    options:
      | MarketStatsSubscriptionOptions
      | readonly MarketStatsSubscriptionOptions[],
    caller: string,
  ): Promise<void> {
    const channels = this.#channelNames(options);
    await this.#run(async () => {
      const closing = this.#drop(caller, channels);
      this.#publishRemoved(closing);
      await this.#unsubscribeOnSocket(closing);
    });
  }

  /**
   * Open channels. Callers read this instead of keeping their own copy.
   *
   * @returns One entry per open market-stats channel.
   */
  getSubscriptions(): { assetId: string; currency: string }[] {
    const subscriptions: { assetId: string; currency: string }[] = [];
    for (const channel of this.#channels.keys()) {
      const subscription = parseMarketStatsChannel(channel);
      if (subscription) {
        subscriptions.push(subscription);
      }
    }
    return subscriptions;
  }

  /**
   * Chain health this service has recorded.
   * A chain reported down drops that chain's open quotes through
   * `pricesUpdated`. The channels stay open.
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
    if (!this.#systemCallbackRegistered) {
      this.#messenger.call('BackendWebSocketService:addChannelCallback', {
        channelName: MARKET_STATS_SYSTEM_NOTIFICATIONS_CHANNEL,
        callback: (notification: ServerNotificationMessage) =>
          this.#handleSystemNotification(notification),
      });
      this.#systemCallbackRegistered = true;
    }

    if (this.#batchCallbackRegistered) {
      return;
    }
    this.#messenger.call('BackendWebSocketService:addChannelCallback', {
      channelName: MARKET_STATS_BATCH_CHANNEL,
      callback: (notification: ServerNotificationMessage) =>
        this.#publishBatch(notification),
    });
    this.#batchCallbackRegistered = true;
  }

  /**
   * Run socket work one at a time. A later unsubscribe waits for the subscribe
   * frame already in flight.
   *
   * @param task - Work to run after earlier socket work finishes.
   * @returns The task's promise.
   */
  #run(task: () => Promise<void>): Promise<void> {
    const result = this.#operation.then(task, task);
    this.#operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  /**
   * Remove one caller from the given channels.
   *
   * @param caller - Caller to remove.
   * @param channels - Channels to remove that caller from.
   * @returns Channels that no longer have a caller.
   */
  #drop(caller: string, channels: readonly string[]): string[] {
    const closing: string[] = [];
    for (const channel of channels) {
      const callers = this.#channels.get(channel);
      if (!callers?.delete(caller)) {
        continue;
      }
      if (callers.size === 0) {
        this.#channels.delete(channel);
        closing.push(channel);
      }
    }
    return closing;
  }

  /**
   * Canonical channel names for a subscribe or unsubscribe call.
   *
   * @param options - One asset, or the assets in the call.
   * @returns Channel names, with duplicates removed.
   */
  #channelNames(
    options:
      | MarketStatsSubscriptionOptions
      | readonly MarketStatsSubscriptionOptions[],
  ): string[] {
    const requested = isSubscriptionList(options) ? options : [options];
    const channels: string[] = [];
    const seen = new Set<string>();
    for (const subscription of requested) {
      const channel = buildMarketStatsChannel(
        canonicalMarketStatsSubscription(subscription),
      );
      if (seen.has(channel)) {
        continue;
      }
      seen.add(channel);
      channels.push(channel);
    }
    return channels;
  }

  /**
   * Send one subscribe frame for channels the server does not already have.
   * A refusal drops those channels. Any other error leaves them tracked for
   * the next connect.
   *
   * @param channels - Channels to open.
   */
  async #subscribeOnSocket(channels: readonly string[]): Promise<void> {
    if (this.#destroyed) {
      return;
    }

    const needed: string[] = [];
    for (const channel of channels) {
      if (!this.#channels.has(channel)) {
        continue;
      }
      try {
        if (this.#serverHasChannel(channel)) {
          continue;
        }
      } catch (error) {
        log('MarketStats-WS: channel lookup failed', { channel, error });
        continue;
      }
      needed.push(channel);
    }
    if (needed.length === 0) {
      return;
    }

    try {
      await this.#messenger.call('BackendWebSocketService:connect');
      if (this.#destroyed) {
        return;
      }
      const pending = needed.filter((channel) => this.#channels.has(channel));
      if (pending.length === 0) {
        return;
      }

      const result = await this.#messenger.call(
        'BackendWebSocketService:subscribe',
        {
          channels: pending,
          channelType: MARKET_STATS_NAMESPACE,
          callback: (notification: ServerNotificationMessage) =>
            this.#publishBatch(notification),
        },
      );
      const opened = new Set(result.channels);

      for (const channel of pending) {
        if (!opened.has(channel)) {
          this.#forget(channel, `Request failed: ${channel}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('Request failed')) {
        log(
          'MarketStats-WS: subscribe deferred until the socket is connected',
          {
            channels: needed,
            error,
          },
        );
        return;
      }
      for (const channel of needed) {
        if (this.#channels.has(channel)) {
          this.#forget(channel, error);
        }
      }
    }
  }

  /**
   * @param channel - Fully-qualified channel name.
   * @returns Whether the server already has this channel.
   */
  #serverHasChannel(channel: string): boolean {
    return this.#messenger.call(
      'BackendWebSocketService:channelHasSubscription',
      channel,
    );
  }

  /**
   * Drop a channel the gateway refused so the next connect does not send it.
   *
   * @param channel - Fully-qualified channel name.
   * @param error - Refusal, logged only.
   */
  #forget(channel: string, error: unknown): void {
    log('MarketStats-WS: subscribe refused', { channel, error });
    if (this.#channels.delete(channel)) {
      this.#publishRemoved([channel]);
    }
  }

  /**
   * Publish quotes to drop. The channels stay in `#channels` unless the caller already removed them.
   *
   * @param channels - Fully-qualified channel names.
   */
  #publishRemoved(channels: readonly string[]): void {
    const removed: MarketStatsSubscriptionOptions[] = [];
    for (const channel of channels) {
      const subscription = parseMarketStatsChannel(channel);
      if (subscription) {
        removed.push(subscription);
      }
    }
    if (removed.length === 0) {
      return;
    }
    this.#messenger.publish('MarketStatsService:pricesUpdated', {
      updates: [],
      removed,
    });
  }

  /**
   * Open channels whose asset is on one of these chains.
   *
   * @param chainIds - CAIP-2 chain ids from a chain-status notification.
   * @returns Fully-qualified channel names.
   */
  #channelsOnChains(chainIds: readonly string[]): string[] {
    const selected = new Set(chainIds);
    const channels: string[] = [];
    for (const channel of this.#channels.keys()) {
      const subscription = parseMarketStatsChannel(channel);
      if (!subscription || !isCaipAssetType(subscription.assetId)) {
        continue;
      }
      if (selected.has(parseCaipAssetType(subscription.assetId).chainId)) {
        channels.push(channel);
      }
    }
    return channels;
  }

  /**
   * Remove these channels from the server. The local set is already updated.
   * Channels that share a subscription go out in one frame.
   *
   * @param channels - Fully-qualified channel names.
   */
  async #unsubscribeOnSocket(channels: readonly string[]): Promise<void> {
    if (channels.length === 0) {
      return;
    }
    try {
      await this.#messenger.call(
        'BackendWebSocketService:unsubscribeChannels',
        channels,
      );
    } catch (error) {
      log('MarketStats-WS: unsubscribe failed', { channels, error });
    }
  }

  #publishBatch(notification: ServerNotificationMessage): void {
    const updates = parseMarketStatsBatch(notification.data).filter((update) =>
      this.#channels.has(
        buildMarketStatsChannel(canonicalMarketStatsSubscription(update)),
      ),
    );
    if (updates.length === 0) {
      return;
    }

    this.#messenger.publish('MarketStatsService:pricesUpdated', {
      updates,
      removed: [],
    });
  }

  #handleSystemNotification(notification: ServerNotificationMessage): void {
    const data = notification.data as MarketStatsSystemNotificationData;

    if (!data.chainIds || !Array.isArray(data.chainIds) || !data.status) {
      throw new Error(
        'Invalid system notification data: missing chainIds or status',
      );
    }

    for (const chainId of data.chainIds) {
      this.#chainStatus.set(chainId, data.status);
    }

    if (data.status === 'down') {
      this.#publishRemoved(this.#channelsOnChains(data.chainIds));
    }

    log(`MarketStats-WS: Chain status change: ${data.status}`, {
      chains: data.chainIds,
      status: data.status,
    });
  }

  #handleConnectionStateChange(connectionInfo: WebSocketConnectionInfo): void {
    if (this.#destroyed) {
      return;
    }

    if (connectionInfo.state === WebSocketState.CONNECTED) {
      const resubscribe = this.#run(() =>
        this.#subscribeOnSocket([...this.#channels.keys()]),
      );
      resubscribe.catch(() => {
        // #subscribeOnSocket reports refusals and keeps the rest tracked.
      });
    }

    if (connectionInfo.state !== WebSocketState.DISCONNECTED) {
      return;
    }

    const chainsToMarkDown = this.getChainStatuses()
      .filter((entry) => entry.status === 'up')
      .map((entry) => entry.chainId);
    for (const chainId of chainsToMarkDown) {
      this.#chainStatus.set(chainId, 'down');
    }

    // A channel with no health event is still a live quote. Drop every open
    // channel so the poll price shows after the socket is gone.
    const open = [...this.#channels.keys()];
    this.#publishRemoved(open);
    if (chainsToMarkDown.length === 0 && open.length === 0) {
      return;
    }

    log(
      'MarketStats-WS: WebSocket disconnection — marked tracked chains as down',
      {
        count: chainsToMarkDown.length,
        chains: chainsToMarkDown,
      },
    );
  }

  /**
   * Remove the batch and system-notification callbacks, and close the open
   * channels on the shared socket.
   *
   * The names are captured before the local set is cleared. The unsubscribe
   * waits for a frame already in flight, so that frame cannot finish against
   * an empty set and leave the server subscription open.
   */
  destroy(): void {
    this.#destroyed = true;
    const open = [...this.#channels.keys()];
    this.#channels.clear();
    this.#chainStatus.clear();
    if (open.length > 0) {
      this.#run(() => this.#unsubscribeOnSocket(open)).catch(() => {
        // #unsubscribeOnSocket logs a refusal.
      });
    }
    if (this.#batchCallbackRegistered) {
      this.#messenger.call(
        'BackendWebSocketService:removeChannelCallback',
        MARKET_STATS_BATCH_CHANNEL,
      );
      this.#batchCallbackRegistered = false;
    }
    if (this.#systemCallbackRegistered) {
      this.#messenger.call(
        'BackendWebSocketService:removeChannelCallback',
        MARKET_STATS_SYSTEM_NOTIFICATIONS_CHANNEL,
      );
      this.#systemCallbackRegistered = false;
    }
  }
}
