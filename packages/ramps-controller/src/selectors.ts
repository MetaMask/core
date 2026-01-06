import type { RampsControllerState } from './RampsController';
import { RequestStatus, type RequestState } from './RequestCache';
import { createCacheKey } from './RequestCache';

/**
 * Result shape returned by request selectors.
 *
 * This object is memoized - the same reference is returned when the underlying
 * request state hasn't changed, making it safe to use with React Redux's
 * `useSelector` without `shallowEqual`.
 */
export type RequestSelectorResult<TData> = {
  /** The data returned by the request, or null if not yet loaded or on error. */
  data: TData | null;
  /** Whether the request is currently in progress. */
  isFetching: boolean;
  /** Error message if the request failed, or null if successful or not yet attempted. */
  error: string | null;
};

/**
 * Creates a memoized selector for a controller method's request state.
 *
 * This selector tracks the loading, error, and data state for a specific
 * controller method call. It's optimized for use with React Redux's `useSelector`
 * hook - the selector returns the same object reference when the underlying
 * request state hasn't changed, so no `shallowEqual` is needed.
 *
 * The selector uses reference equality on the request object itself, so it
 * works correctly with arrays and objects without expensive deep equality checks.
 *
 * @param getState - Function that extracts RampsControllerState from the root state.
 *   Typically a reselect selector like `selectRampsControllerState`.
 * @param method - The controller method name (e.g., 'updateGeolocation').
 * @param params - The parameters passed to the method, used to generate the cache key.
 *   Must match the params used when calling the controller method.
 * @returns A selector function that returns `{ data, isFetching, error }`.
 *
 * @example
 * ```ts
 * // In selectors file - create once at module level
 * import { createRequestSelector } from '@metamask/ramps-controller';
 * import { createSelector } from 'reselect';
 *
 * const selectRampsControllerState = createSelector(
 *   (state: RootState) => state.engine.backgroundState.RampsController,
 *   (rampsControllerState) => rampsControllerState,
 * );
 *
 * export const selectGeolocationRequest = createRequestSelector<
 *   RootState,
 *   string
 * >(selectRampsControllerState, 'updateGeolocation', []);
 *
 * // In hook - use directly with useSelector, no shallowEqual needed
 * export function useRampsGeolocation() {
 *   const { isFetching, error } = useSelector(selectGeolocationRequest);
 *   // ... rest of hook
 * }
 * ```
 *
 * @example
 * ```ts
 * // For methods with parameters
 * export const selectCryptoCurrenciesRequest = (region: string) =>
 *   createRequestSelector<RootState, CryptoCurrency[]>(
 *     selectRampsControllerState,
 *     'getCryptoCurrencies',
 *     [region],
 *   );
 *
 * // In component
 * const { data, isFetching, error } = useSelector(
 *   selectCryptoCurrenciesRequest('US')
 * );
 * ```
 */
export function createRequestSelector<TRootState, TData>(
  getState: (rootState: TRootState) => RampsControllerState | undefined,
  method: string,
  params: unknown[],
): (state: TRootState) => RequestSelectorResult<TData> {
  const cacheKey = createCacheKey(method, params);

  let lastRequest: RequestState | undefined;
  let lastResult: RequestSelectorResult<TData> | null = null;

  return (state: TRootState): RequestSelectorResult<TData> => {
    const request = getState(state)?.requests?.[cacheKey];

    if (request === lastRequest && lastResult !== null) {
      return lastResult;
    }

    lastRequest = request;
    lastResult = {
      data: (request?.data as TData) ?? null,
      isFetching: request?.status === RequestStatus.LOADING,
      error: request?.error ?? null,
    };

    return lastResult;
  };
}
