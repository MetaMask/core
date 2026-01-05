import type { RampsControllerState } from './RampsController';
import { RequestStatus } from './RequestCache';
import { createCacheKey } from './RequestCache';

/**
 * Result shape returned by request selectors.
 */
export type RequestSelectorResult<TData> = {
  data: TData | null;
  isFetching: boolean;
  error: string | null;
};

/**
 * Creates a selector for a controller method's request state.
 *
 * The selector is memoized - it returns the same object reference if
 * the underlying values haven't changed, so no need for shallowEqual.
 *
 * @param getState - Function that extracts RampsControllerState from the client's root state.
 * @param method - The controller method name (e.g., 'getCryptoCurrencies').
 * @param params - The parameters passed to the method.
 * @returns A selector function that returns { data, isFetching, error }.
 *
 * @example
 * ```ts
 * const getRampsState = (state: RootState) =>
 *   state.engine.backgroundState.RampsController;
 *
 * export const selectCryptoCurrencies = (region: string) =>
 *   createRequestSelector<RootState, CryptoCurrency[]>(
 *     getRampsState,
 *     'getCryptoCurrencies',
 *     [region],
 *   );
 *
 * // In hook - no shallowEqual needed
 * const { data, isFetching, error } = useSelector(selectCryptoCurrencies(region));
 * ```
 */
export function createRequestSelector<TRootState, TData>(
  getState: (rootState: TRootState) => RampsControllerState | undefined,
  method: string,
  params: unknown[],
): (state: TRootState) => RequestSelectorResult<TData> {
  const cacheKey = createCacheKey(method, params);

  let lastResult: RequestSelectorResult<TData> | null = null;
  let lastData: TData | null = null;
  let lastStatus: string | undefined;
  let lastError: string | null = null;

  return (state: TRootState): RequestSelectorResult<TData> => {
    const request = getState(state)?.requests?.[cacheKey];
    const data = (request?.data as TData) ?? null;
    const status = request?.status;
    const error = request?.error ?? null;

    if (
      lastResult !== null &&
      data === lastData &&
      status === lastStatus &&
      error === lastError
    ) {
      return lastResult;
    }

    lastData = data;
    lastStatus = status;
    lastError = error;
    lastResult = {
      data,
      isFetching: status === RequestStatus.LOADING,
      error,
    };

    return lastResult;
  };
}
