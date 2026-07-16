/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AccountActivityService } from './AccountActivityService';

/**
 * Subscribe to account activity (transactions and balance updates)
 * Addresses should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
 *
 * @param subscription - The subscription configuration
 * @param subscription.addresses - Array of addresses to subscribe to, each in CAIP-10 format
 * or an `addresses` array for batch subscription
 */
export type AccountActivityServiceSubscribeAction = {
  type: `AccountActivityService:subscribe`;
  handler: AccountActivityService['subscribe'];
};

/**
 * Unsubscribe from account activity for specified addresses
 * Addresses should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or "solana:0:ABC123...")
 *
 * @param subscription - The subscription configuration
 * @param subscription.addresses - Array of addresses to unsubscribe from, each in CAIP-10 format
 */
export type AccountActivityServiceUnsubscribeAction = {
  type: `AccountActivityService:unsubscribe`;
  handler: AccountActivityService['unsubscribe'];
};

/**
 * Union of all AccountActivityService action types.
 */
export type AccountActivityServiceMethodActions =
  | AccountActivityServiceSubscribeAction
  | AccountActivityServiceUnsubscribeAction;
