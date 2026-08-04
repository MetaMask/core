/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DeFiPositionsControllerV2 } from './DeFiPositionsControllerV2.js';

/**
 * Fetches DeFi positions for the selected account group. State is updated only
 * when every selected account in the response is ready (none report
 * `processingDefiPositions`); each account key in that response replaces that
 * account's state (other accounts stay). While any account is still indexing,
 * prior state is kept and the method polls (invalidating the balances cache
 * between attempts) until all selected accounts are ready, the attempt limit
 * is reached, or a request fails. Concurrent calls for the same selected
 * accounts and `vsCurrency` share one in-flight promise; calls for a different
 * selection or fiat currency start a new fetch and leave prior polls running
 * so a later switch back can join them. When a successful ready response
 * required more than one attempt, reports the attempt count to Sentry via
 * `messenger.captureException` (error name `DeFiPositionsV2FetchAttempts`) so
 * poll limits can be tuned. No-ops when disabled or when the group has no
 * supported accounts. Caching / spam prevention is handled by the apiClient
 * TanStack Query cache (keyed by accounts + query options including
 * `vsCurrency`). Pass `{ forceRefresh: true }` to bypass the cache on the
 * first attempt (e.g. pull-to-refresh).
 *
 * @param options - Optional fetch modifiers.
 * @param options.forceRefresh - When true, bypass the apiClient cache on the
 * first attempt and fetch immediately.
 * @returns Resolves when the fetch (and any processing polls) finish.
 */
export type DeFiPositionsControllerV2FetchDeFiPositionsAction = {
  type: `DeFiPositionsControllerV2:fetchDeFiPositions`;
  handler: DeFiPositionsControllerV2['fetchDeFiPositions'];
};

/**
 * Union of all DeFiPositionsControllerV2 action types.
 */
export type DeFiPositionsControllerV2MethodActions =
  DeFiPositionsControllerV2FetchDeFiPositionsAction;
