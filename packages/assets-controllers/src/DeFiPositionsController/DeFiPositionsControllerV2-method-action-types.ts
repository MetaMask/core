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
 * calls within the window are no-ops. Disabled controllers and empty account
 * groups return without fetching.
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
