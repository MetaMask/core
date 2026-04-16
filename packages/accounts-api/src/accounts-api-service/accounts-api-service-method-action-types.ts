/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AccountsApiService } from './accounts-api-service';

/**
 * Get multi-account transactions (v4 endpoint).
 *
 * @param params - Essential params
 * @param params.accountAddresses - Array of CAIP-10 account addresses.
 * @param options - Query filter options.
 * @param options.networks - Comma-separated CAIP-2 network IDs.
 * @param options.startTimestamp - Start timestamp (epoch) from which to return results.
 * @param options.endTimestamp - End timestamp (epoch) for which to return results.
 * @param options.limit - Maximum number of transactions to request (default 50).
 * @param options.after - JWT containing the endCursor for the query.
 * @param options.before - JWT containing the startCursor for the query.
 * @param options.sortDirection - Sort direction (ASC/DESC).
 * @param options.includeLogs - Whether to include logs.
 * @param options.includeTxMetadata - Whether to include transaction metadata.
 * @param options.maxLogsPerTx - Maximum number of logs per transaction.
 * @param options.lang - Language for transaction category (default "en").
 * @param page - Pagination cursors.
 * @returns The multi-account transactions response.
 */
export type AccountsApiServiceFetchMultiAccountTransactionsV4Action = {
  type: `AccountsApiService:fetchMultiAccountTransactionsV4`;
  handler: AccountsApiService['fetchMultiAccountTransactionsV4'];
};

/**
 * Union of all AccountsApiService action types.
 */
export type AccountsApiServiceMethodActions =
  AccountsApiServiceFetchMultiAccountTransactionsV4Action;
