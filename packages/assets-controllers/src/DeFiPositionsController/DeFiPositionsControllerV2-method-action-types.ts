/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { DeFiPositionsControllerV2 } from './DeFiPositionsControllerV2';

/**
 * Fetches DeFi positions for the selected account group and stores them,
 * shaped for direct client consumption. Everything happens behind this
 * method: resolving the accounts, calling the Accounts API, transforming the
 * response, and updating state.
 *
 * Throttled per set of accounts by an in-memory minimum interval, so repeated
 * calls within the window are no-ops (no HTTP, no regroup, no state write).
 * Pass `{ forceRefresh: true }` to bypass that throttle (e.g. pull-to-refresh
 * or after a confirmed transaction). The successful/forced fetch still
 * updates the throttle timestamp, so subsequent non-forced calls remain
 * gated. Disabled controllers and empty account groups return without
 * fetching.
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
