/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DeFiPositionsControllerV2 } from './DeFiPositionsControllerV2';

/**
 * Fetches DeFi positions for the selected account group. Each account key in
 * a valid response replaces that account's state (other accounts stay). If
 * any account is still indexing (`processingDefiPositions`), the response is
 * discarded and prior state is kept. No-ops when disabled, when the group
 * has no supported accounts, or when the same accounts + `vsCurrency` were
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
