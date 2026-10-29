/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MarketStatsService } from './MarketStatsService.js';

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
export type MarketStatsServiceSubscribeAction = {
  type: `MarketStatsService:subscribe`;
  handler: MarketStatsService['subscribe'];
};

/**
 * Unsubscribe from one asset's market-stats channel. Decrements the reference
 * count and, when it reaches zero, starts a grace-period timer before actually
 * unsubscribing from the WebSocket.
 *
 * @param options - Asset and currency to unsubscribe.
 * @returns A promise that resolves once the unsubscription is processed.
 */
export type MarketStatsServiceUnsubscribeAction = {
  type: `MarketStatsService:unsubscribe`;
  handler: MarketStatsService['unsubscribe'];
};

/**
 * Union of all MarketStatsService action types.
 */
export type MarketStatsServiceMethodActions =
  | MarketStatsServiceSubscribeAction
  | MarketStatsServiceUnsubscribeAction;
