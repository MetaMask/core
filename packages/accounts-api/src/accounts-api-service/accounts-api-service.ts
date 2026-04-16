import { BaseDataService } from '@metamask/base-data-service';
import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import type { CreateServicePolicyOptions } from '@metamask/controller-utils';
import { HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  nullable,
  number,
  optional,
  string,
  type,
  validate,
} from '@metamask/superstruct';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import type { AccountsApiServiceMethodActions } from './accounts-api-service-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link AccountsApiService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'AccountsApiService';

// === MESSENGER ===

/**
 * All of the methods within {@link AccountsApiService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['fetchMultiAccountTransactionsV4'] as const;

/**
 * Invalidates cached queries for {@link AccountsApiService}.
 */
export type AccountsApiServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link AccountsApiService} exposes to other consumers.
 */
export type AccountsApiServiceActions =
  | AccountsApiServiceMethodActions
  | AccountsApiServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link AccountsApiService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link AccountsApiService}'s cache is updated.
 */
export type AccountsApiServiceCacheUpdatedEvent = DataServiceCacheUpdatedEvent<
  typeof serviceName
>;

/**
 * Published when a key within {@link AccountsApiService}'s cache is
 * updated.
 */
export type AccountsApiServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link AccountsApiService} exposes to other consumers.
 */
export type AccountsApiServiceEvents =
  | AccountsApiServiceCacheUpdatedEvent
  | AccountsApiServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link AccountsApiService} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link AccountsApiService}.
 */
export type AccountsApiServiceMessenger = Messenger<
  typeof serviceName,
  AccountsApiServiceActions | AllowedActions,
  AccountsApiServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * Struct to validate what the API endpoint returns.
 */
const MultiAccountTransactionsV4ResponseStruct = type({
  unprocessedNetworks: array(string()),
  pageInfo: type({
    count: number(),
    hasPreviousPage: boolean(),
    hasNextPage: boolean(),
    startCursor: optional(nullable(string())),
    endCursor: optional(nullable(string())),
  }),
  data: array(
    type({
      hash: string(),
      timestamp: string(),
      chainId: number(),
      blockNumber: number(),
      blockHash: string(),
      gas: number(),
      gasUsed: number(),
      gasPrice: string(),
      effectiveGasPrice: string(),
      nonce: number(),
      cumulativeGasUsed: number(),
      methodId: optional(nullable(string())),
      value: string(),
      to: string(),
      from: string(),
      isError: optional(boolean()),
      valueTransfers: optional(
        array(
          type({
            from: string(),
            to: string(),
            amount: string(),
            decimal: number(),
            contractAddress: optional(string()),
            symbol: string(),
            name: string(),
            transferType: string(),
          }),
        ),
      ),
      logs: optional(
        array(
          type({
            data: string(),
            topics: array(string()),
            address: string(),
            logIndex: number(),
          }),
        ),
      ),
      transactionType: optional(string()),
      transactionCategory: optional(string()),
      transactionProtocol: optional(string()),
    }),
  ),
});

/**
 * What the API endpoint returns.
 */
type MultiAccountTransactionsV4Response = Infer<
  typeof MultiAccountTransactionsV4ResponseStruct
>;

/**
 * The base URL of the API that the service represents.
 */
const BASE_URL = 'https://accounts.api.cx.metamask.io';

/**
 * This service class wraps the Accounts API.
 *
 * @example
 *
 * ``` ts
 * // === Setup ===
 *
 * import type { MessengerActions, MessengerEvents } from '@metamask/messenger';
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   AccountsApiServiceMessenger,
 * } from '@metamask/accounts-api';
 *
 * const rootMessenger = new Messenger<
 *   'Root',
 *   AccountsApiServiceActions
 *   AccountsApiServiceEvents
 * >({ namespace: 'Root' });
 * const accountsApiServiceMessenger = new Messenger<
 *   'AccountsApiService',
 *   MessengerActions<AccountsApiServiceMessenger>,
 *   MessengerEvents<AccountsApiServiceMessenger>,
 *   typeof rootMessenger,
 * >({
 *   namespace: 'AccountsApiService',
 *   parent: rootMessenger,
 * });
 * // Instantiate the service to register its actions on the messenger
 * new AccountsApiService({
 *   messenger: accountsApiServiceMessenger,
 * });
 *
 * // ... Later ...
 *
 * // Fetch the past week's accountss on Mainnet for ETH, in USD
 * const transactions = await rootMessenger.call(
 *   'AccountsApiService:fetchMultiAccountTransactionsV4',
 *   params: {
 *     accountAddresses: ['eip155:1:0x123'],
 *   },
 *   options: {
 *     sortDirection: 'DESC',
 *   },
 * );
 *
 * // The same thing, only using React Query
 *
 * import { useQuery } from '@metamask/react-data-query';
 *
 * const { data, isFetching } = useQuery({
 *   queryKey: [
 *     'AccountsApiService:fetchMultiAccountTransactionsV4' as const,
 *     {
 *       params: {
 *         accountAddresses: ['eip155:1:0x123']
 *       },
 *       options: {
 *         sortDirection: 'DESC',
 *       },
 *     },
 *   ],
 * });
 * ```
 */
export class AccountsApiService extends BaseDataService<
  typeof serviceName,
  AccountsApiServiceMessenger
> {
  /**
   * Constructs a new AccountsApiService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.queryClientConfig - Configuration for the underlying TanStack
   * Query client.
   * @param args.policyOptions - Options to pass to `createServicePolicy`, which
   * is used to wrap each request. See {@link CreateServicePolicyOptions}.
   */
  constructor({
    messenger,
    queryClientConfig = {},
    policyOptions = {},
  }: {
    messenger: AccountsApiServiceMessenger;
    queryClientConfig?: QueryClientConfig;
    policyOptions?: CreateServicePolicyOptions;
  }) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions,
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

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
  async fetchMultiAccountTransactionsV4(
    params: {
      accountAddresses: string[];
    },
    options?: {
      networks?: string[];
      startTimestamp?: number;
      endTimestamp?: number;
      limit?: number;
      after?: string;
      before?: string;
      sortDirection?: 'ASC' | 'DESC';
      includeLogs?: boolean;
      includeTxMetadata?: boolean;
      maxLogsPerTx?: number;
      lang?: string;
    },
    page?: { before: string } | { after: string },
  ): Promise<MultiAccountTransactionsV4Response> {
    const normalizedParams = {
      accountAddresses: [...params.accountAddresses].sort(),
      ...options,
    };
    if (options?.networks) {
      normalizedParams.networks = [...options.networks].sort();
    }

    let url: URL;
    if (params) {
      url = new URL('/v4/multiaccount/transactions', BASE_URL);
      for (const [key, value] of Object.entries(normalizedParams)) {
        if (value !== undefined) {
          url.searchParams.append(
            key,
            Array.isArray(value) ? value.join(',') : value.toString(),
          );
        }
      }
    }

    const jsonResponse =
      await this.fetchInfiniteQuery<MultiAccountTransactionsV4Response>(
        {
          queryKey: [
            `${this.name}:fetchMultiAccountTransactionsV4`,
            normalizedParams,
          ],
          queryFn: async ({ signal }) => {
            const response = await fetch(url, { signal });

            if (!response.ok) {
              throw new HttpError(
                response.status,
                `Accounts API failed with status '${response.status}'`,
              );
            }

            return response.json();
          },
          staleTime: inMilliseconds(30, Duration.Second),
          getPreviousPageParam: ({ pageInfo }) =>
            pageInfo.hasPreviousPage
              ? { before: pageInfo.startCursor }
              : undefined,
          getNextPageParam: ({ pageInfo }) =>
            pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
        },
        page,
      );

    const [error, validJsonResponse] = validate(
      jsonResponse,
      MultiAccountTransactionsV4ResponseStruct,
    );
    if (error) {
      throw new Error(
        `Malformed response received from Accounts API: ${error
          .failures()
          .map(
            (failure) =>
              `At ${failure.path.join('.')}->${failure.key}, ${failure.message}`,
          )
          .join('; ')}`,
      );
    }

    return validJsonResponse;
  }
}
