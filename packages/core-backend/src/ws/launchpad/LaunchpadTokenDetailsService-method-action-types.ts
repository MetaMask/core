/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { LaunchpadTokenDetailsService } from './LaunchpadTokenDetailsService.js';

/**
 * Subscribe to a launchpad token's detail channel. If this is the first
 * subscriber for the asset a WebSocket subscription is created. Additional
 * calls for the same asset only bump the reference count.
 *
 * @param options - The subscription parameters.
 * @returns A promise that resolves once the subscription is established.
 */
export type LaunchpadTokenDetailsServiceSubscribeAction = {
  type: `LaunchpadTokenDetailsService:subscribe`;
  handler: LaunchpadTokenDetailsService['subscribe'];
};

/**
 * Unsubscribe from a launchpad token's detail channel. Decrements the
 * reference count and, when it reaches zero, starts a grace-period timer before
 * actually unsubscribing from the WebSocket to absorb rapid navigation
 * patterns.
 *
 * @param options - The subscription parameters to unsubscribe from.
 * @returns A promise that resolves once the unsubscription is processed.
 */
export type LaunchpadTokenDetailsServiceUnsubscribeAction = {
  type: `LaunchpadTokenDetailsService:unsubscribe`;
  handler: LaunchpadTokenDetailsService['unsubscribe'];
};

/**
 * Union of all LaunchpadTokenDetailsService action types.
 */
export type LaunchpadTokenDetailsServiceMethodActions =
  | LaunchpadTokenDetailsServiceSubscribeAction
  | LaunchpadTokenDetailsServiceUnsubscribeAction;
