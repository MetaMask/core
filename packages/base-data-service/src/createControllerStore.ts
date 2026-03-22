import type { Json } from '@metamask/utils';

import type { CacheUpdatedPayload, GranularCacheUpdatedPayload } from './BaseDataService';

/**
 * A store that tracks the latest value from a data service's `cacheUpdated`
 * events. Compatible with `useSyncExternalStore` (React 18+) or any
 * subscribe/getSnapshot consumer.
 */
export type ControllerStore<TData> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TData | undefined;
};

/**
 * Extract query data from a `cacheUpdated` event payload.
 *
 * `BaseDataService` publishes `DehydratedState` as the event payload.
 * This helper unwraps the first query's data from that structure.
 *
 * @param payload - The raw event payload (CacheUpdatedPayload or
 *   GranularCacheUpdatedPayload).
 * @returns The data from the first dehydrated query, or `undefined`
 *   if the payload is a removal or has no query data.
 */
export function extractQueryData<TData = Json>(
  payload: CacheUpdatedPayload | GranularCacheUpdatedPayload,
): TData | undefined {
  if (payload.type === 'removed' || payload.state === null) {
    return undefined;
  }
  const query = payload.state.queries?.[0];
  return query?.state?.data as TData | undefined;
}

/**
 * Create a store that tracks the latest value from a data service's
 * `cacheUpdated` events.
 *
 * This is the framework-agnostic primitive for consuming controller state
 * on the UI side. The background data service uses `@tanstack/query-core`
 * internally; this store subscribes to the resulting messenger events and
 * exposes the latest value via a `subscribe`/`getSnapshot` API compatible
 * with React's `useSyncExternalStore`.
 *
 * @param subscribe - A function that subscribes to the messenger event and
 *   returns an unsubscribe function. The callback receives the raw event
 *   payload.
 * @param extract - Extracts the desired data from the raw event payload.
 *   Use `extractQueryData` for the common case of unwrapping
 *   `DehydratedState` from `cacheUpdated` events.
 * @returns A store with `subscribe` and `getSnapshot` methods.
 */
export function createControllerStore<TData>(
  subscribe: (
    callback: (payload: Json) => void,
  ) => (() => void) | Promise<() => void>,
  extract: (payload: Json) => TData | undefined,
): ControllerStore<TData> {
  let data: TData | undefined;
  const listeners = new Set<() => void>();
  let subscriptionStarted = false;
  let unsubscribe: (() => void) | undefined;

  function ensureSubscription(): void {
    if (subscriptionStarted) {
      return;
    }
    subscriptionStarted = true;

    const result = subscribe((payload: Json) => {
      const extracted = extract(payload);
      if (extracted !== undefined) {
        data = extracted;
        for (const listener of listeners) {
          listener();
        }
      }
    });

    // Handle both sync and async subscribe returns.
    if (result instanceof Promise) {
      result
        .then((unsub) => {
          unsubscribe = unsub;
        })
        .catch((error: unknown) => {
          console.warn('createControllerStore: subscription failed:', error);
        });
    } else {
      unsubscribe = result;
    }
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      ensureSubscription();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && unsubscribe) {
          unsubscribe();
          unsubscribe = undefined;
          subscriptionStarted = false;
          data = undefined;
        }
      };
    },
    getSnapshot(): TData | undefined {
      return data;
    },
  };
}
