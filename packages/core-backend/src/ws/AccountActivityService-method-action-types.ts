/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AccountActivityService } from './AccountActivityService';

/**
 * Subscribe to account activity (transactions and balance updates) for a single
 * account. Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or
 * "solana:0:ABC123...").
 *
 * The call is idempotent: if the address already has an active subscription it
 * is skipped, so multiple callers can use it safely.
 *
 * @param subscription - Account subscription configuration with address
 */
export type AccountActivityServiceSubscribeAction = {
  type: `AccountActivityService:subscribe`;
  handler: AccountActivityService['subscribe'];
};

/**
 * Subscribe to account activity (transactions and balance updates) for one or
 * more accounts. Each address should be in CAIP-10 format (e.g.,
 * "eip155:0:0x1234..." or "solana:0:ABC123...").
 *
 * The call is idempotent: addresses that already have an active subscription are
 * skipped, so multiple consumers (e.g. data sources and the auto-subscription)
 * can call this safely.
 *
 * @param subscription - Account subscription configuration with addresses
 */
export type AccountActivityServiceSubscribeManyAction = {
  type: `AccountActivityService:subscribeMany`;
  handler: AccountActivityService['subscribeMany'];
};

/**
 * Unsubscribe from account activity for the specified account.
 * Address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or
 * "solana:0:ABC123...").
 *
 * @param subscription - Account subscription configuration with address to unsubscribe
 */
export type AccountActivityServiceUnsubscribeAction = {
  type: `AccountActivityService:unsubscribe`;
  handler: AccountActivityService['unsubscribe'];
};

/**
 * Unsubscribe from account activity for the specified accounts.
 * Each address should be in CAIP-10 format (e.g., "eip155:0:0x1234..." or
 * "solana:0:ABC123...").
 *
 * @param subscription - Account subscription configuration with addresses to unsubscribe
 */
export type AccountActivityServiceUnsubscribeManyAction = {
  type: `AccountActivityService:unsubscribeMany`;
  handler: AccountActivityService['unsubscribeMany'];
};

/**
 * Union of all AccountActivityService action types.
 */
export type AccountActivityServiceMethodActions =
  | AccountActivityServiceSubscribeAction
  | AccountActivityServiceSubscribeManyAction
  | AccountActivityServiceUnsubscribeAction
  | AccountActivityServiceUnsubscribeManyAction;
