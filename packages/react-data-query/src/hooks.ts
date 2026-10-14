/**
 * @file
 * We provide re-exports of the underlying TanStack Query hooks with narrower types,
 * removing `staleTime` and `queryFn` which aren't useful when using data services.
 */

import { QueryKey, MutationKey } from '@metamask/base-data-service';
import {
  useQuery as useQueryFromTanStack,
  useInfiniteQuery as useInfiniteQueryFromTanStack,
  useMutation as useMutationFromTanStack,
  OmitKeyof,
  UseQueryOptions,
  InitialDataFunction,
  NonUndefinedGuard,
  UseInfiniteQueryOptions,
  UseQueryResult,
  UseInfiniteQueryResult,
  DefaultError,
  InfiniteData,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query';

// This is referenced in JSDoc below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { createUIQueryClient } from './createUIQueryClient.js';

const DATA_SERVICE_QUERY_DEFAULTS = {
  staleTime: 0,
  retry: false,
};

const DATA_SERVICE_MUTATION_DEFAULTS = {
  retry: false,
};

/**
 * Consume a query from a data service.
 *
 * @param options - The query options. Keep in mind that `staleTime` and `queryFn` are not supported
 * when querying data services.
 * @returns The query results.
 */
export function useQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: OmitKeyof<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    'initialData' | 'staleTime' | 'queryFn'
  > & {
    initialData?:
      | undefined
      | InitialDataFunction<NonUndefinedGuard<TQueryFnData>>
      | NonUndefinedGuard<TQueryFnData>;
  },
): UseQueryResult<TData, TError> {
  return useQueryFromTanStack({ ...DATA_SERVICE_QUERY_DEFAULTS, ...options });
}

/**
 * Consume a paginated query from a data service.
 *
 * @param options - The query options. Keep in mind that `staleTime` and `queryFn` are not supported
 * when querying data services.
 * @returns The paginated query results.
 */
export function useInfiniteQuery<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = InfiniteData<TQueryFnData>,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = unknown,
>(
  options: OmitKeyof<
    UseInfiniteQueryOptions<TQueryFnData, TError, TData, TQueryKey, TPageParam>,
    'staleTime' | 'queryFn'
  >,
): UseInfiniteQueryResult<TData, TError> {
  return useInfiniteQueryFromTanStack({
    ...DATA_SERVICE_QUERY_DEFAULTS,
    ...options,
  });
}

/**
 * Execute a mutation through a data service.
 *
 * This is a version of `useMutation` from TanStack Query which is intended to be used with a {@link createUIQueryClient|UI query client}. Note the following constraints:
 *
 * - The `mutationKey` must refer to a method within a data service by matching the following format: ``[`${ServiceName}:${actionName}`, ...arguments]``.
 * - Providing a custom `mutationFn` is not supported.
 * - Updating a connected query's cache data [before][1] or [after][2] a mutation via `setQueryData` is not supported.
 *
 * [1]: https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates#via-the-cache
 * [2]: https://tanstack.com/query/latest/docs/framework/react/guides/updates-from-mutation-responses
 *
 * @param options - The mutation options.
 * @returns The result of the mutation.
 */
export function useMutation<
  TData = unknown,
  TError = DefaultError,
  TVariables = void,
  TOnMutateResult = unknown,
  TMutationKey extends MutationKey = MutationKey,
>(
  options: OmitKeyof<
    UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
    'mutationKey' | 'mutationFn'
  > & {
    mutationKey: TMutationKey;
  },
): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  return useMutationFromTanStack({
    ...DATA_SERVICE_MUTATION_DEFAULTS,
    ...options,
  });
}
