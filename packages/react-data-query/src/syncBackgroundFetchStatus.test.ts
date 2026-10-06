import { createDeferredPromise } from '@metamask/utils';
import {
  DehydratedState,
  FetchStatus,
  Query,
  QueryClient,
  QueryKey,
} from '@tanstack/query-core';

import { syncBackgroundFetchStatus } from './syncBackgroundFetchStatus.js';

const queryKey: QueryKey = ['ExampleDataService:getAssets'];

/**
 * Build a dehydrated cache snapshot for `query` with the given fetch status.
 *
 * @param query - The query to snapshot.
 * @param fetchStatus - The fetch status to publish.
 * @returns Dehydrated state containing that query.
 */
function dehydratedState<
  TQueryFnData = unknown,
  TError extends Error = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  query: Query<TQueryFnData, TError, TData, TQueryKey>,
  fetchStatus: FetchStatus,
): DehydratedState {
  return {
    mutations: [],
    queries: [
      {
        dehydratedAt: query.state.dataUpdatedAt,
        queryHash: query.queryHash,
        queryKey: query.queryKey,
        state: {
          ...query.state,
          fetchStatus,
        },
      },
    ],
  };
}

describe('syncBackgroundFetchStatus', () => {
  it('copies fetchStatus onto an idle UI query', () => {
    const client = new QueryClient();
    const query = client.getQueryCache().build(client, { queryKey });

    syncBackgroundFetchStatus(
      client,
      query.queryHash,
      dehydratedState(query, 'fetching'),
    );

    expect(query.state.fetchStatus).toBe('fetching');

    syncBackgroundFetchStatus(
      client,
      query.queryHash,
      dehydratedState(query, 'idle'),
    );

    expect(query.state.fetchStatus).toBe('idle');
    client.clear();
  });

  it('does nothing when fetchStatus already matches', () => {
    const client = new QueryClient();
    const query = client.getQueryCache().build(client, { queryKey });

    syncBackgroundFetchStatus(
      client,
      query.queryHash,
      dehydratedState(query, 'idle'),
    );

    expect(query.state.fetchStatus).toBe('idle');
    client.clear();
  });

  it('does nothing when the dehydrated state has no matching query', () => {
    const client = new QueryClient();
    const query = client.getQueryCache().build(client, { queryKey });

    syncBackgroundFetchStatus(client, query.queryHash, {
      mutations: [],
      queries: [],
    });

    expect(query.state.fetchStatus).toBe('idle');
    client.clear();
  });

  it('does nothing when the UI cache has no matching query', () => {
    const client = new QueryClient();
    const query = client.getQueryCache().build(client, { queryKey });
    const state = dehydratedState(query, 'fetching');
    client.getQueryCache().remove(query);

    syncBackgroundFetchStatus(client, query.queryHash, state);

    expect(client.getQueryCache().find({ queryKey })).toBeUndefined();
    client.clear();
  });

  it('does nothing while the UI query has its own in-flight fetch', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { promise, resolve } = createDeferredPromise<string>();
    const query = client.getQueryCache().build(client, {
      queryKey,
      queryFn: async () => promise,
    });
    const fetching = query.fetch();

    syncBackgroundFetchStatus(
      client,
      query.queryHash,
      dehydratedState(query, 'idle'),
    );

    expect(query.state.fetchStatus).toBe('fetching');

    resolve('done');
    await fetching;
    client.clear();
  });
});
