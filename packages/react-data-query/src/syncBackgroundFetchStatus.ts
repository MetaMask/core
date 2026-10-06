import { DehydratedState, QueryClient } from '@tanstack/query-core';

/**
 * Copy a background query's `fetchStatus` onto the matching UI query.
 *
 * `hydrate` drops `fetchStatus` so a dehydrated snapshot cannot leave a query
 * stuck in `fetching`. Data-service cache updates are live fetches, not SSR
 * snapshots, so UI observers need `isFetching` and `isLoading` to follow the
 * background `fetchStatus`.
 *
 * A UI query that has its own in-flight `queryFn` (`query.promise`) keeps its
 * `fetchStatus`. Overwriting it would clear `isFetching` while that call is
 * still pending.
 *
 * @param client - The UI query client.
 * @param queryHash - Hash of the query the cache event belongs to.
 * @param dehydratedState - Dehydrated state from the data service cache event.
 */
export function syncBackgroundFetchStatus(
  client: QueryClient,
  queryHash: string,
  dehydratedState: DehydratedState,
): void {
  const dehydrated = dehydratedState.queries.find(
    (entry) => entry.queryHash === queryHash,
  );
  const query = client.getQueryCache().get(queryHash);

  if (!dehydrated || !query || query.promise) {
    return;
  }

  if (query.state.fetchStatus === dehydrated.state.fetchStatus) {
    return;
  }

  query.setState({ fetchStatus: dehydrated.state.fetchStatus });
}
