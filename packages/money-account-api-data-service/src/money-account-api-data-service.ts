import type {
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { BaseDataService } from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  TraceContext,
  TraceRequest,
} from '@metamask/controller-utils';
import { handleWhen, HttpError } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import { validate } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import type { QueryClientConfig } from '@tanstack/query-core';

import {
  DEFAULT_STALE_TIME_MS,
  Env,
  MONEY_ACCOUNT_API_URL_MAP,
  RATE_HISTORY_STALE_TIME_MS,
} from './constants';
import { MoneyAccountApiResponseValidationError } from './errors';
import { projectLogger, createModuleLogger } from './logger';
import type { MoneyAccountApiDataServiceMethodActions } from './money-account-api-data-service-method-action-types';
import type {
  HistoryResponse,
  InterestResponse,
  PositionResponse,
  RateHistoryResponse,
} from './response.types';
import {
  HistoryResponseStruct,
  InterestResponseStruct,
  PositionResponseStruct,
  RateHistoryResponseStruct,
} from './structs';
import type {
  HistoryOptions,
  InterestOptions,
  RateHistoryOptions,
} from './types';

// === GENERAL ===

/**
 * The name of the {@link MoneyAccountApiDataService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'MoneyAccountApiDataService';

const log = createModuleLogger(projectLogger, serviceName);
const traceLogger = createModuleLogger(projectLogger, 'trace');

export const TRACES = {
  POSITIONS_API: 'Money Account API Fetch Positions',
  INTEREST_API: 'Money Account API Fetch Interest',
  HISTORY_API: 'Money Account API Fetch History',
  RATE_HISTORY_API: 'Money Account API Fetch Rate History',
} as const;

export type MoneyAccountApiDataServiceTraceName =
  (typeof TRACES)[keyof typeof TRACES];

export type MoneyAccountApiDataServiceTraceRequest = Omit<
  TraceRequest,
  'name'
> & {
  name: MoneyAccountApiDataServiceTraceName;
  startTime?: number;
};

export type MoneyAccountApiDataServiceTraceCallback = <ReturnType>(
  request: MoneyAccountApiDataServiceTraceRequest,
  fn?: (context?: TraceContext) => ReturnType,
) => Promise<ReturnType>;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'fetchPositions',
  'fetchInterest',
  'fetchHistory',
  'fetchRateHistory',
] as const;

/**
 * Invalidates cached queries for {@link MoneyAccountApiDataService}.
 */
export type MoneyAccountApiDataServiceInvalidateQueriesAction =
  DataServiceInvalidateQueriesAction<typeof serviceName>;

/**
 * Actions that {@link MoneyAccountApiDataService} exposes to other consumers.
 */
export type MoneyAccountApiDataServiceActions =
  | MoneyAccountApiDataServiceMethodActions
  | MoneyAccountApiDataServiceInvalidateQueriesAction;

/**
 * Actions from other messengers that {@link MoneyAccountApiDataService} calls.
 */
type AllowedActions = never;

/**
 * Published when {@link MoneyAccountApiDataService}'s cache is updated.
 */
export type MoneyAccountApiDataServiceCacheUpdatedEvent =
  DataServiceCacheUpdatedEvent<typeof serviceName>;

/**
 * Published when a key within {@link MoneyAccountApiDataService}'s cache is
 * updated.
 */
export type MoneyAccountApiDataServiceGranularCacheUpdatedEvent =
  DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

/**
 * Events that {@link MoneyAccountApiDataService} exposes to other consumers.
 */
export type MoneyAccountApiDataServiceEvents =
  | MoneyAccountApiDataServiceCacheUpdatedEvent
  | MoneyAccountApiDataServiceGranularCacheUpdatedEvent;

/**
 * Events from other messengers that {@link MoneyAccountApiDataService}
 * subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link MoneyAccountApiDataService}.
 */
export type MoneyAccountApiDataServiceMessenger = Messenger<
  typeof serviceName,
  MoneyAccountApiDataServiceActions | AllowedActions,
  MoneyAccountApiDataServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

export type MoneyAccountApiDataServiceOptions = {
  messenger: MoneyAccountApiDataServiceMessenger;
  env?: Env;
  queryClientConfig?: QueryClientConfig;
  policyOptions?: CreateServicePolicyOptions;
  trace?: MoneyAccountApiDataServiceTraceCallback;
};

/**
 * Data service responsible for fetching positions, interest, cash-flow
 * history, and vault rate history from the Money Account APY Tracking API.
 */
export class MoneyAccountApiDataService extends BaseDataService<
  typeof serviceName,
  MoneyAccountApiDataServiceMessenger
> {
  readonly #baseUrl: string;

  readonly #trace: MoneyAccountApiDataServiceTraceCallback;

  /**
   * Constructs a new MoneyAccountApiDataService.
   *
   * @param options - The constructor arguments.
   * @param options.messenger - The messenger suited for this service.
   * @param options.env - The target environment. Defaults to production.
   * @param options.queryClientConfig - Configuration for the underlying
   * TanStack Query client.
   * @param options.policyOptions - Options to pass to `createServicePolicy`.
   * @param options.trace - Optional callback to trace network requests.
   */
  constructor({
    messenger,
    env = Env.PRD,
    queryClientConfig = {},
    policyOptions = {},
    trace,
  }: MoneyAccountApiDataServiceOptions) {
    super({
      name: serviceName,
      messenger,
      queryClientConfig,
      policyOptions: {
        retryFilterPolicy: handleWhen(
          (error) => !(error instanceof MoneyAccountApiResponseValidationError),
        ),
        ...policyOptions,
      },
    });

    this.#baseUrl = MONEY_ACCOUNT_API_URL_MAP[env];

    this.#trace =
      trace ??
      (async <Result>(
        _request: MoneyAccountApiDataServiceTraceRequest,
        fn?: (context?: TraceContext) => Result,
      ): Promise<Result> => {
        return await Promise.resolve(fn?.() as Result);
      });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('Initialized', { env, baseUrl: this.#baseUrl });
  }

  /**
   * Fetches the current vault positions for a given user address.
   *
   * @param address - The user's Ethereum address.
   * @returns The position response containing vault positions and an optional
   * `balance` summary (`null` when the API balance path is unavailable).
   */
  async fetchPositions(address: string): Promise<PositionResponse> {
    const url = new URL(
      `/v1/positions/${address.toLowerCase()}`,
      this.#baseUrl,
    );

    return this.fetchQuery({
      queryKey: [`${this.name}:fetchPositions`, address.toLowerCase()],
      staleTime: DEFAULT_STALE_TIME_MS,
      queryFn: async () => {
        return this.#traceNetworkRequest(
          {
            name: TRACES.POSITIONS_API,
            data: { operation: 'fetchPositions' },
          },
          async () => {
            const response = await fetch(url);

            if (!response.ok) {
              throw new HttpError(
                response.status,
                `Money Account API positions request failed with status '${response.status}'`,
              );
            }

            const json: Json = await response.json();

            const [error, validated] = validate(json, PositionResponseStruct);
            if (error) {
              throw new MoneyAccountApiResponseValidationError(
                `Malformed response from positions endpoint: ${error.message}`,
              );
            }

            return validated as unknown as PositionResponse;
          },
        );
      },
    });
  }

  /**
   * Fetches the interest earned for a given address and vault over a
   * specified time window.
   *
   * @param address - The user's Ethereum address.
   * @param options - Options specifying vault, window, and optional chain ID.
   * @returns The interest response.
   */
  async fetchInterest(
    address: string,
    options: InterestOptions,
  ): Promise<InterestResponse> {
    const url = new URL(
      `/v1/positions/${address.toLowerCase()}/interest`,
      this.#baseUrl,
    );
    url.searchParams.append(
      'vault_address',
      options.vaultAddress.toLowerCase(),
    );
    url.searchParams.append('window', options.window);
    if (options.chainId !== undefined) {
      url.searchParams.append('chain_id', String(options.chainId));
    }

    return this.fetchQuery({
      queryKey: [
        `${this.name}:fetchInterest`,
        address.toLowerCase(),
        options.vaultAddress.toLowerCase(),
        options.window,
        ...(options.chainId === undefined ? [] : [options.chainId]),
      ],
      staleTime: DEFAULT_STALE_TIME_MS,
      queryFn: async () => {
        return this.#traceNetworkRequest(
          {
            name: TRACES.INTEREST_API,
            data: { operation: 'fetchInterest' },
          },
          async () => {
            const response = await fetch(url);

            if (!response.ok) {
              throw new HttpError(
                response.status,
                `Money Account API interest request failed with status '${response.status}'`,
              );
            }

            const json: Json = await response.json();

            const [error, validated] = validate(json, InterestResponseStruct);
            if (error) {
              throw new MoneyAccountApiResponseValidationError(
                `Malformed response from interest endpoint: ${error.message}`,
              );
            }

            return validated as unknown as InterestResponse;
          },
        );
      },
    });
  }

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
  async fetchHistory(
    address: string,
    options?: HistoryOptions,
  ): Promise<HistoryResponse> {
    const normalizedAddress = address.toLowerCase();
    const normalizedVault = options?.vaultAddress?.toLowerCase() ?? null;

    return this.fetchInfiniteQuery(
      {
        queryKey: [
          `${this.name}:fetchHistory`,
          normalizedAddress,
          normalizedVault,
          options?.chainId ?? null,
          options?.limit ?? null,
        ],
        staleTime: DEFAULT_STALE_TIME_MS,
        queryFn: async (context) => {
          const cursor = context.pageParam as string | null | undefined;

          const url = new URL(
            `/v1/positions/${normalizedAddress}/history`,
            this.#baseUrl,
          );
          if (normalizedVault) {
            url.searchParams.append('vault_address', normalizedVault);
          }
          if (options?.chainId !== undefined) {
            url.searchParams.append('chain_id', String(options.chainId));
          }
          if (cursor) {
            url.searchParams.append('cursor', cursor);
          }
          if (options?.limit !== undefined) {
            url.searchParams.append('limit', String(options.limit));
          }

          return this.#traceNetworkRequest(
            {
              name: TRACES.HISTORY_API,
              data: { operation: 'fetchHistory' },
            },
            async () => {
              const response = await fetch(url);

              if (!response.ok) {
                throw new HttpError(
                  response.status,
                  `Money Account API history request failed with status '${response.status}'`,
                );
              }

              const json: Json = await response.json();

              const [error, validated] = validate(json, HistoryResponseStruct);
              if (error) {
                throw new MoneyAccountApiResponseValidationError(
                  `Malformed response from history endpoint: ${error.message}`,
                );
              }

              return validated as unknown as HistoryResponse;
            },
          );
        },
      },
      options?.cursor ?? undefined,
    );
  }

  /**
   * Fetches the exchange-rate time series for a given vault.
   *
   * @param vaultAddress - The vault's Ethereum address.
   * @param options - Optional range and chain ID filters.
   * @returns The rate history response.
   */
  async fetchRateHistory(
    vaultAddress: string,
    options?: RateHistoryOptions,
  ): Promise<RateHistoryResponse> {
    const url = new URL(
      `/v1/vaults/${vaultAddress.toLowerCase()}/rate-history`,
      this.#baseUrl,
    );
    if (options?.chainId !== undefined) {
      url.searchParams.append('chain_id', String(options.chainId));
    }
    if (options?.from) {
      url.searchParams.append('from', options.from);
    }
    if (options?.to) {
      url.searchParams.append('to', options.to);
    }

    return this.fetchQuery({
      queryKey: [
        `${this.name}:fetchRateHistory`,
        vaultAddress.toLowerCase(),
        ...(options?.chainId === undefined ? [null] : [options.chainId]),
        ...(options?.from ? [options.from] : [null]),
        ...(options?.to ? [options.to] : [null]),
      ],
      staleTime: RATE_HISTORY_STALE_TIME_MS,
      queryFn: async () => {
        return this.#traceNetworkRequest(
          {
            name: TRACES.RATE_HISTORY_API,
            data: { operation: 'fetchRateHistory' },
          },
          async () => {
            const response = await fetch(url);

            if (!response.ok) {
              throw new HttpError(
                response.status,
                `Money Account API rate-history request failed with status '${response.status}'`,
              );
            }

            const json: Json = await response.json();

            const [error, validated] = validate(
              json,
              RateHistoryResponseStruct,
            );
            if (error) {
              throw new MoneyAccountApiResponseValidationError(
                `Malformed response from rate-history endpoint: ${error.message}`,
              );
            }

            return validated as unknown as RateHistoryResponse;
          },
        );
      },
    });
  }

  /**
   * Runs a network request and emits a best-effort backdated trace.
   *
   * @param request - Trace metadata for the network request.
   * @param fn - Network request to execute.
   * @returns The network request result.
   */
  async #traceNetworkRequest<Result>(
    request: MoneyAccountApiDataServiceTraceRequest,
    fn: () => Promise<Result>,
  ): Promise<Result> {
    const startTime = Date.now();
    let success = false;
    let errorName: string | undefined;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      errorName = error instanceof Error ? error.name : typeof error;
      throw error;
    } finally {
      const traceRequest = {
        ...request,
        startTime,
        data: {
          ...request.data,
          success,
          ...(errorName ? { errorName } : {}),
        },
      };
      const onTraceError = (traceError: unknown): void => {
        traceLogger('Failed to emit trace', {
          traceName: request.name,
          traceError,
        });
      };

      try {
        Promise.resolve(this.#trace(traceRequest, () => undefined)).catch(
          onTraceError,
        );
      } catch (traceError) {
        onTraceError(traceError);
      }
    }
  }
}
