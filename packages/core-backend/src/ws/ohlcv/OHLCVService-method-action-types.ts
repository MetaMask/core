/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { OHLCVService } from './OHLCVService.js';

/**
 * Subscribe to an OHLCV channel. If this is the first subscriber for the
 * given asset/interval/currency combination a WebSocket subscription is
 * created. Additional calls for the same combination only bump the reference
 * count.
 *
 * @param options - The subscription parameters.
 * @returns A promise that resolves once the subscription is established.
 */
export type OHLCVServiceSubscribeAction = {
  type: `OHLCVService:subscribe`;
  handler: OHLCVService['subscribe'];
};

/**
 * Unsubscribe from an OHLCV channel. Decrements the reference count and,
 * when it reaches zero, starts a grace-period timer before actually
 * unsubscribing from the WebSocket to absorb rapid navigation patterns.
 *
 * @param options - The subscription parameters to unsubscribe from.
 * @returns A promise that resolves once the unsubscription is processed.
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
