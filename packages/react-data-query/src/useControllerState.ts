import type { ControllerStore } from '@metamask/base-data-service';
// React 17 shim — will be replaced with `react` import after React 18 upgrade.
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { useSyncExternalStore } from 'use-sync-external-store/shim';

/**
 * Subscribe to controller state pushed from the background via data service
 * `cacheUpdated` events.
 *
 * Uses `useSyncExternalStore` — the React primitive for external store
 * subscriptions. No TanStack Query involvement on the UI side: no `queryFn`,
 * no `staleTime`, no cache policy. The background data service owns the fetch
 * cadence; the UI renders the latest value.
 *
 * For server state where the UI needs cache policy control (`staleTime`,
 * `refetchOnFocus`, `retry`), use `useQuery` with `get*QueryOptions` from
 * `@metamask/core-backend` — the UI-direct fetch model.
 *
 * @param store - A store created by `createControllerStore`.
 * @returns The latest value, or `undefined` before the first event.
 */
export function useControllerState<TData>(
  store: ControllerStore<TData>,
): TData | undefined {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
