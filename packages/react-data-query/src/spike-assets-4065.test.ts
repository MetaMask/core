/**
 * @file
 * THROWAWAY SPIKE PROTOTYPE for ASSETS-4065 — not intended to be merged.
 *
 * Characterizes what loading/error signal survives the trip from a
 * background `BaseDataService` QueryClient to a UI `createUIQueryClient`
 * QueryClient when payloads are JSON-serialized (as they are over the
 * extension's background <-> UI port), and prototypes an alternative where the
 * background projects query status into plain JSON (controller-state style).
 *
 * See `docs/spikes/assets-4065-loading-state-sync.md`.
 */
import {
  BaseDataService,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';
import { createDeferredPromise } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import { QueryClient, QueryObserver } from '@tanstack/query-core';
import type { Query } from '@tanstack/query-core';
import { describe, expect, it } from 'vitest';

import { createUIQueryClient } from './createUIQueryClient.js';

const serviceName = 'SpikeAssetsService';

type SpikeAssetsResponse = {
  balances: Record<string, string>;
  errors: Record<string, string>;
};

type SpikeActions =
  | DataServiceInvalidateQueriesAction<typeof serviceName>
  | {
      type: `${typeof serviceName}:fetchAccountAssets`;
      handler: SpikeAssetsService['fetchAccountAssets'];
    };

type SpikeEvents =
  | DataServiceCacheUpdatedEvent<typeof serviceName>
  | DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

type SpikeMessenger = Messenger<typeof serviceName, SpikeActions, SpikeEvents>;

class SpikeAssetsService extends BaseDataService<
  typeof serviceName,
  SpikeMessenger
> {
  handler: (accountId: string) => Promise<SpikeAssetsResponse> = async () => ({
    balances: {},
    errors: {},
  });

  constructor(messenger: SpikeMessenger) {
    super({
      name: serviceName,
      messenger,
      policyOptions: { maxRetries: 0 },
      queryClientConfig: { defaultOptions: { queries: { staleTime: 0 } } },
    });
    this.messenger.registerMethodActionHandlers(this, [
      'fetchAccountAssets',
    ] as const);
  }

  async fetchAccountAssets(accountId: string): Promise<SpikeAssetsResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:fetchAccountAssets`, accountId],
      queryFn: async () => this.handler(accountId),
    });
  }

  async invalidate(): Promise<void> {
    await this.invalidateQueries();
  }
}

const jsonRoundTrip = <Value>(value: Value): Value =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

/**
 * Builds a background service and a UI client connected by an adapter that
 * JSON-serializes every action argument, result, rejection and event payload,
 * and swallows listener exceptions the way the extension's
 * `routeMessengerEventNotification` does.
 *
 * @returns The service, the UI client and any listener errors.
 */
function setup(): {
  service: SpikeAssetsService;
  uiClient: QueryClient;
  listenerErrors: unknown[];
  payloads: DataServiceGranularCacheUpdatedPayload[];
} {
  const messenger: SpikeMessenger = new Messenger({ namespace: serviceName });
  const service = new SpikeAssetsService(messenger);
  const listenerErrors: unknown[] = [];
  const payloads: DataServiceGranularCacheUpdatedPayload[] = [];
  const wrapped = new Map<unknown, (payload: unknown) => void>();

  const uiClient = createUIQueryClient([serviceName] as const, {
    call: async (action, ...params) => {
      try {
        // @ts-expect-error Template literal action types cannot be unified.
        const result = await messenger.call(action, ...jsonRoundTrip(params));
        return jsonRoundTrip(result as Json);
      } catch (error) {
        throw new Error((error as Error).message);
      }
    },
    subscribe: (event, handler) => {
      const listener = (payload: unknown): void => {
        try {
          const serialized = jsonRoundTrip(
            payload,
          ) as DataServiceGranularCacheUpdatedPayload;
          payloads.push(serialized);
          handler(serialized);
        } catch (error) {
          listenerErrors.push(error);
        }
      };
      wrapped.set(handler, listener);
      messenger.subscribe(
        event,
        listener as (payload: DataServiceGranularCacheUpdatedPayload) => void,
      );
    },
    unsubscribe: (event, handler) => {
      messenger.unsubscribe(
        event,
        wrapped.get(handler) as (
          payload: DataServiceGranularCacheUpdatedPayload,
        ) => void,
      );
    },
  });

  return { service, uiClient, listenerErrors, payloads };
}

const queryKey = [`${serviceName}:fetchAccountAssets`, 'account-1'];

const flush = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('ASSETS-4065 spike: loading state across the bridge', () => {
  it('UI-initiated fetches expose accurate loading and error state in the UI', async () => {
    const { service, uiClient } = setup();
    const deferred = createDeferredPromise<SpikeAssetsResponse>();
    service.handler = async () => deferred.promise;

    const observer = new QueryObserver(uiClient, { queryKey, retry: false });
    const unsubscribe = observer.subscribe(() => undefined);
    await flush();

    expect(observer.getCurrentResult().fetchStatus).toBe('fetching');
    expect(observer.getCurrentResult().isLoading).toBe(true);

    deferred.reject(new Error('Accounts API 503'));
    await flush();

    expect(observer.getCurrentResult().status).toBe('error');
    expect(observer.getCurrentResult().error?.message).toBe('Accounts API 503');
    unsubscribe();
  });

  it('background-initiated fetches are invisible to UI fetchStatus', async () => {
    const { service, uiClient, listenerErrors, payloads } = setup();
    const deferred = createDeferredPromise<SpikeAssetsResponse>();
    service.handler = async () => deferred.promise;

    // Observing (but not fetching) subscribes the UI to `cacheUpdated`.
    const observer = new QueryObserver(uiClient, { queryKey, enabled: false });
    const unsubscribe = observer.subscribe(() => undefined);

    // e.g. `#runStartupRefresh` / unlock / account switch in the background.
    const backgroundFetch = service.fetchAccountAssets('account-1');
    await flush();

    // The background did announce `fetchStatus: 'fetching'`...
    expect(
      payloads.some(
        (payload) =>
          payload.state?.queries[0]?.state.fetchStatus === 'fetching',
      ),
    ).toBe(true);
    // ...but `hydrate` deliberately drops `fetchStatus`, so the UI stays idle.
    expect(observer.getCurrentResult().fetchStatus).toBe('idle');
    expect(observer.getCurrentResult().status).toBe('pending');
    // The 'fetch' event fires before the retryer exists, so no in-flight
    // `promise` is dehydrated and nothing non-JSON crosses the bridge.
    expect(
      payloads.every(
        (payload) => payload.state?.queries[0]?.promise === undefined,
      ),
    ).toBe(true);
    expect(listenerErrors).toStrictEqual([]);

    deferred.resolve({ balances: { 'eip155:1/slip44:60': '1' }, errors: {} });
    await backgroundFetch;
    await flush();

    expect(observer.getCurrentResult().status).toBe('success');
    expect(observer.getCurrentResult().data).toStrictEqual({
      balances: { 'eip155:1/slip44:60': '1' },
      errors: {},
    });
    unsubscribe();
  });

  it('a background refetch failure after a success never reaches the UI', async () => {
    const { service, uiClient, payloads } = setup();
    service.handler = async () => ({ balances: { a: '1' }, errors: {} });

    const observer = new QueryObserver(uiClient, { queryKey, enabled: false });
    const unsubscribe = observer.subscribe(() => undefined);
    await service.fetchAccountAssets('account-1');
    await flush();
    expect(observer.getCurrentResult().status).toBe('success');

    service.handler = async () => {
      throw new Error('RPC fetch failed');
    };
    await service.invalidate();
    await expect(service.fetchAccountAssets('account-1')).rejects.toThrow(
      'RPC fetch failed',
    );
    await flush();

    const errorPayload = payloads.find(
      (payload) => payload.state?.queries[0]?.state.status === 'error',
    );
    expect(errorPayload?.state?.queries[0]?.state.error).toStrictEqual({});

    // `hydrate` only applies state with a newer `dataUpdatedAt`; errors don't
    // bump it, and a JSON-serialized `Error` is `{}` anyway.
    expect(observer.getCurrentResult().status).toBe('success');
    expect(observer.getCurrentResult().error).toBeNull();
    unsubscribe();
  });

  it('a query "succeeds" even when some chains failed (partial failure is data, not query state)', async () => {
    const { uiClient, service } = setup();
    service.handler = async () => ({
      balances: { 'eip155:1/slip44:60': '1' },
      errors: { 'eip155:56': 'Unprocessed by Accounts API' },
    });

    const result = await uiClient.fetchQuery({ queryKey, retry: false });

    expect(uiClient.getQueryState(queryKey)?.status).toBe('success');
    expect(result).toHaveProperty('errors', {
      'eip155:56': 'Unprocessed by Accounts API',
    });
  });

  it('option (a) prototype: projecting background query status into JSON state captures everything', async () => {
    type ProjectedStatus = {
      status: 'pending' | 'success' | 'error';
      fetchStatus: 'fetching' | 'paused' | 'idle';
      error: string | null;
      updatedAt: number;
    };
    const backgroundClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Stand-in for `AssetsController.update(...)`: JSON-only, patch-friendly.
    let controllerState: Record<string, ProjectedStatus> = {};
    const project = (query: Query): void => {
      controllerState = jsonRoundTrip({
        ...controllerState,
        [JSON.stringify(query.queryKey)]: {
          status: query.state.status,
          fetchStatus: query.state.fetchStatus,
          error:
            query.state.error instanceof Error
              ? query.state.error.message
              : null,
          updatedAt: Math.max(
            query.state.dataUpdatedAt,
            query.state.errorUpdatedAt,
          ),
        },
      });
    };
    backgroundClient.getQueryCache().subscribe(({ query }) => project(query));

    const key = ['assets', 'account-1', 'eip155:56'];
    const deferred = createDeferredPromise<Json>();
    const fetching = backgroundClient.fetchQuery({
      queryKey: key,
      queryFn: async () => deferred.promise,
    });

    expect(controllerState[JSON.stringify(key)]).toMatchObject({
      status: 'pending',
      fetchStatus: 'fetching',
    });

    deferred.reject(new Error('RPC fetch failed'));
    await expect(fetching).rejects.toThrow('RPC fetch failed');

    expect(controllerState[JSON.stringify(key)]).toMatchObject({
      status: 'error',
      fetchStatus: 'idle',
      error: 'RPC fetch failed',
    });
    backgroundClient.clear();
  });
});
