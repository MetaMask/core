/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountApiDataService } from './money-account-api-data-service.js';

/**
 * Fetches the current vault positions for a given user address.
 *
 * @param address - The user's Ethereum address.
 * @returns The position response containing vault positions.
 */
export type MoneyAccountApiDataServiceFetchPositionsAction = {
  type: `MoneyAccountApiDataService:fetchPositions`;
  handler: MoneyAccountApiDataService['fetchPositions'];
};

/**
 * Fetches the interest earned for a given address and vault over a
 * specified time window.
 *
 * @param address - The user's Ethereum address.
 * @param options - Options specifying vault, window, and optional chain ID.
 * @returns The interest response.
 */
export type MoneyAccountApiDataServiceFetchInterestAction = {
  type: `MoneyAccountApiDataService:fetchInterest`;
  handler: MoneyAccountApiDataService['fetchInterest'];
};

/**
 * Fetches cursor-paginated cash-flow history for a given address.
 * Uses `fetchInfiniteQuery` for proper TanStack Query pagination semantics.
 *
 * When paginating, consumers must re-pass the same filter options
 * (`vaultAddress`, `chainId`, `limit`) alongside `cursor` on every page
 * request. This ensures the query key matches the original infinite query
 * and that the HTTP request includes the correct filters.
 *
 * @param address - The user's Ethereum address.
 * @param options - Optional filtering and pagination options.
 * @returns The history response containing cash-flow entries for the requested page.
 */
export type MoneyAccountApiDataServiceFetchHistoryAction = {
  type: `MoneyAccountApiDataService:fetchHistory`;
  handler: MoneyAccountApiDataService['fetchHistory'];
};

/**
 * Fetches the exchange-rate time series for a given vault.
 *
 * @param vaultAddress - The vault's Ethereum address.
 * @param options - Optional range and chain ID filters.
 * @returns The rate history response.
 */
export type MoneyAccountApiDataServiceFetchRateHistoryAction = {
  type: `MoneyAccountApiDataService:fetchRateHistory`;
  handler: MoneyAccountApiDataService['fetchRateHistory'];
};

/**
 * Union of all MoneyAccountApiDataService action types.
 */
export type MoneyAccountApiDataServiceMethodActions =
  | MoneyAccountApiDataServiceFetchPositionsAction
  | MoneyAccountApiDataServiceFetchInterestAction
  | MoneyAccountApiDataServiceFetchHistoryAction
  | MoneyAccountApiDataServiceFetchRateHistoryAction;
