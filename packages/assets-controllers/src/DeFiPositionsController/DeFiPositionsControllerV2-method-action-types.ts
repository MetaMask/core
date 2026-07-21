/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DeFiPositionsControllerV2 } from './DeFiPositionsControllerV2';

/**
 * Fetches DeFi positions for the selected account group and merges them into
 * `allDeFiPositionsV2` (other accounts' cached entries are kept so group
 * switches can reuse TTL'd state). No-ops when disabled, when the group has
 * no supported accounts, or when the same accounts + `vsCurrency` were
 * fetched within `minimumFetchIntervalMs`. Pass `{ forceRefresh: true }` to
 * bypass the throttle (e.g. pull-to-refresh). A `vsCurrency` change for the
 * same accounts also bypasses it.
 *
 * @param options - Optional fetch modifiers.
 * @param options.forceRefresh - When true, bypass the minimum-interval
 * throttle and fetch immediately.
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
