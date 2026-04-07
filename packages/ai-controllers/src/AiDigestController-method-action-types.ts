/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AiDigestController } from './AiDigestController';

/**
 * Fetches market insights for a given asset identifier.
 * Returns cached data if still fresh, otherwise calls the service.
 *
 * Accepts either a CAIP-19 asset type (e.g. `eip155:1/slip44:60`) or a perps
 * market symbol (e.g. `ETH`). The service handles choosing the correct API
 * query parameter automatically.
 *
 * @param assetIdentifier - The asset identifier (CAIP-19 ID or perps market symbol).
 * @returns The market insights report, or `null` if none exists.
 */
export type AiDigestControllerFetchMarketInsightsAction = {
  type: `AiDigestController:fetchMarketInsights`;
  handler: AiDigestController['fetchMarketInsights'];
};

/**
 * Fetches the market overview report.
 * Returns cached data if still fresh, otherwise calls the service.
 *
 * @returns The market overview report, or `null` if none exists.
 */
export type AiDigestControllerFetchMarketOverviewAction = {
  type: `AiDigestController:fetchMarketOverview`;
  handler: AiDigestController['fetchMarketOverview'];
};

/**
 * Union of all AiDigestController action types.
 */
export type AiDigestControllerMethodActions =
  | AiDigestControllerFetchMarketInsightsAction
  | AiDigestControllerFetchMarketOverviewAction;
