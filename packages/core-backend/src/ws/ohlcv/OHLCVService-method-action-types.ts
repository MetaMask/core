/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { OHLCVService } from './OHLCVService';

/**
 * Subscribe to an OHLCV channel for real-time candlestick data.
 *
 * @param options - The subscription parameters (assetId, interval, currency).
 */
export type OHLCVServiceSubscribeAction = {
  type: `OHLCVService:subscribe`;
  handler: OHLCVService['subscribe'];
};

/**
 * Unsubscribe from an OHLCV channel.
 *
 * @param options - The subscription parameters to unsubscribe from.
 */
export type OHLCVServiceUnsubscribeAction = {
  type: `OHLCVService:unsubscribe`;
  handler: OHLCVService['unsubscribe'];
};

/**
 * Union of all OHLCVService action types.
 */
export type OHLCVServiceMethodActions =
  | OHLCVServiceSubscribeAction
  | OHLCVServiceUnsubscribeAction;
