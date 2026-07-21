/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DeFiPositionsControllerV2 } from './DeFiPositionsControllerV2';

/**
 * Fetches DeFi positions for the selected account group. Each account key in
 * a ready response replaces that account's state (other accounts stay).
 * Accounts still indexing (`processingDefiPositions`) are skipped so prior
 * state is kept for them. No-ops when disabled or when the group has no
 * supported accounts. Caching / spam prevention is handled by the apiClient
 * TanStack Query cache (keyed by accounts + query options including
 * `vsCurrency`). Pass `{ forceRefresh: true }` to bypass the cache (e.g.
 * pull-to-refresh).
 *
 * @param options - Optional fetch modifiers.
 * @param options.forceRefresh - When true, bypass the apiClient cache and
 * fetch immediately.
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
