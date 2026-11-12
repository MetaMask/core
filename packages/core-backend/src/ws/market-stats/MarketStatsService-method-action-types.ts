/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MarketStatsService } from './MarketStatsService.js';

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
export type MarketStatsServiceSubscribeAction = {
  type: `MarketStatsService:subscribe`;
  handler: MarketStatsService['subscribe'];
};

/**
 * Unsubscribe from one asset, or from many assets in one WebSocket frame.
 *
 * Decrements each reference count. Channels that reach zero share one
 * grace-period timer, then leave in one `unsubscribe` frame.
 *
 * @param options - One asset, or the assets to unsubscribe together.
 * @returns A promise that resolves once the unsubscription is recorded.
 */
export type MarketStatsServiceUnsubscribeAction = {
  type: `MarketStatsService:unsubscribe`;
  handler: MarketStatsService['unsubscribe'];
};

/**
 * Channels with a live reference count. This is the open set; callers do not
 * keep their own copy.
 *
 * @returns One entry per open market-stats channel.
 */
export type MarketStatsServiceGetSubscriptionsAction = {
  type: `MarketStatsService:getSubscriptions`;
  handler: MarketStatsService['getSubscriptions'];
};

/**
 * Chain health this service has recorded. Callers read this instead of
 * keeping a copy from `chainStatusChanged`.
 *
 * @returns One entry per chain that has been reported up or down.
 */
export type MarketStatsServiceGetChainStatusesAction = {
  type: `MarketStatsService:getChainStatuses`;
  handler: MarketStatsService['getChainStatuses'];
};

/**
 * Union of all MarketStatsService action types.
 */
export type MarketStatsServiceMethodActions =
  | MarketStatsServiceSubscribeAction
  | MarketStatsServiceUnsubscribeAction
  | MarketStatsServiceGetSubscriptionsAction
  | MarketStatsServiceGetChainStatusesAction;
