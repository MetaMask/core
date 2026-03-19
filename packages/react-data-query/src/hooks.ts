import { QueryKey } from '@metamask/base-data-service';
import {
  useQuery as useQueryTanStack,
  useInfiniteQuery as useInfiniteQueryTanStack,
  OmitKeyof,
  UseQueryOptions,
  InitialDataFunction,
  NonUndefinedGuard,
  UseInfiniteQueryOptions,
  UseQueryResult,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';

// We provide re-exports of the underlying TanStack Query hooks with narrower types,
// removing `staleTime` and `queryFn` which aren't useful when using data services.

/**
 * Consume a query from a data service.
 *
 * @param options - The query options. Keep in mind that `staleTime` and `queryFn` are not supported
 * when querying data services.
 * @returns The query results.
 */
export function useQuery<
  TQueryFnData = unknown,
  TError = unknown,
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
  return useQueryTanStack(options);
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
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: OmitKeyof<
    UseInfiniteQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryFnData,
      TQueryKey
    >,
    'staleTime' | 'queryFn'
  >,
): UseInfiniteQueryResult<TData, TError> {
  return useInfiniteQueryTanStack(options);
}
