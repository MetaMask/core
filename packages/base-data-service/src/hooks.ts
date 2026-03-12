import {
  useQuery as useQueryTanStack,
  useInfiniteQuery as useInfiniteQueryTanStack,
  OmitKeyof,
  UseQueryOptions,
  QueryKey,
  InitialDataFunction,
  NonUndefinedGuard,
  UseInfiniteQueryOptions,
  UseQueryResult,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';

// We provide re-exports of the underlying TanStack Query hooks with narrower types,
// removing `staleTime` and `queryFn` which aren't useful when using data services.

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
