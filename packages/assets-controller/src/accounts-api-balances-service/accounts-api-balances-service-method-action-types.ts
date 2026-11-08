/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AccountsApiBalancesService } from './accounts-api-balances-service.js';

/**
 * Fetches balances for the given accounts from the Accounts API v5 or v6
 * multi account balances endpoint. Serves from cache when fresh, and shares
 * one request between concurrent identical calls.
 *
 * @param options - The fetch options. See {@link FetchBalancesOptions}.
 * @returns The validated balances response.
 */
export type AccountsApiBalancesServiceFetchBalancesAction = {
  type: `AccountsApiBalancesService:fetchBalances`;
  handler: AccountsApiBalancesService['fetchBalances'];
};

/**
 * Union of all AccountsApiBalancesService action types.
 */
export type AccountsApiBalancesServiceMethodActions =
  AccountsApiBalancesServiceFetchBalancesAction;
