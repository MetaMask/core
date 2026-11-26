/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MarketStatsService } from './MarketStatsService.js';

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
export type MarketStatsServiceSubscribeAction = {
  type: `MarketStatsService:subscribe`;
  handler: MarketStatsService['subscribe'];
};

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
export type MarketStatsServiceUnsubscribeAction = {
  type: `MarketStatsService:unsubscribe`;
  handler: MarketStatsService['unsubscribe'];
};

/**
 * Open channels. Callers read this instead of keeping their own copy.
 *
 * @returns One entry per open market-stats channel.
 */
export type MarketStatsServiceGetSubscriptionsAction = {
  type: `MarketStatsService:getSubscriptions`;
  handler: MarketStatsService['getSubscriptions'];
};

/**
 * Chain health this service has recorded.
 * A chain reported down drops that chain's open quotes through
 * `pricesUpdated`. The channels stay open.
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
