import {
  QueryClient,
  DehydratedState,
  MutationState,
} from '@tanstack/query-core';

/**
 * Read the `globalId` correlation token from a mutation's `meta`.
 *
 * The UI query client generates a `globalId` for each mutation it creates and
 * threads it through the data service, which stores it on its own mutation's
 * `meta`. Because TanStack's `MutationMeta` is an open record, the value reads
 * as `unknown`, so we narrow it to a string here.
 *
 * @param meta - The mutation `meta`, if any.
 * @returns The `globalId` if present and a string, otherwise undefined.
 */
export function readGlobalId(
  meta: Record<string, unknown> | undefined,
): string | undefined {
  const globalId = meta?.globalId;
  return typeof globalId === 'string' ? globalId : undefined;
}

/**
 * Load a dehydrated mutation cache into a query client.
 *
 * TanStack Query's own `hydrate` matches dehydrated queries against the cache
 * by hash and updates them in place, but it always inserts a brand-new mutation
 * for every dehydrated mutation. Because data services emit a cache update on
 * every `added`/`updated` mutation event, calling `hydrate` directly would
 * append a fresh mutation to each subscribed query client on every event, so
 * the cache would grow without bound, and a found mutation could be stale.
 *
 * This behavior for `hydrate` makes sense because TanStack treats queries and
 * mutations differently. Queries are deduplicated: two attempts for the same
 * query using the same query key show up once in the query cache. But mutations
 * are discrete events/attempts, and `mutationKey` is used by observers to find
 * mutations, not enforce uniqueness.
 *
 * Because a mutation key is not unique, it cannot on its own tell us which UI
 * mutation a service cache update belongs to: multiple mutations may share a
 * key, and a mutation created with a custom `mutationFn` may reuse a key
 * without ever going through a data service. To correlate the two caches, the
 * UI query client tags each mutation it creates with a unique `globalId` and
 * threads it through the data service, which echoes it back on the mutation's
 * `meta`. This function updates the exact UI mutation carrying that `globalId`,
 * and ignores mutations that carry none.
 *
 * @param client - The UI query client whose mutation cache should be hydrated.
 * @param dehydratedState - The dehydrated state emitted by the data service.
 */
export function hydrateMutations(
  client: QueryClient,
  dehydratedState: DehydratedState,
): void {
  const mutationCache = client.getMutationCache();

  for (const dehydratedMutation of dehydratedState.mutations) {
    const { mutationKey, state, meta } = dehydratedMutation;

    const globalId = readGlobalId(meta);

    // A data service only publishes cache updates for mutations that have a
    // `mutationKey`, and only mutations that originated in the UI query client
    // carry a `globalId`. Without both, we cannot correlate the update with a
    // UI mutation, so we skip it.
    if (!mutationKey || !globalId) {
      continue;
    }

    const existingMutation = mutationCache.find({
      mutationKey,
      predicate: (mutation) => readGlobalId(mutation.meta) === globalId,
    });

    // A UI query client only subscribes to a mutation key's cache updates after
    // it has built a mutation for that key, so there is always a matching
    // mutation to update in place, and we can disregard the case in which there
    // is not.
    // istanbul ignore else
    if (existingMutation) {
      existingMutation.state = state;
      mutationCache.notify({
        type: 'updated',
        mutation: existingMutation,
        action: deriveMutationAction(state),
      });
    }
  }
}

/**
 * Build the `notify` action that describes a mutation's current state.
 *
 * @param state - The synced mutation state.
 * @returns The action describing the state.
 */
function deriveMutationAction(
  state: MutationState,
):
  | { type: 'success'; data: unknown }
  | { type: 'error'; error: unknown }
  | { type: 'pending'; variables: unknown; context: unknown; isPaused: boolean }
  | { type: 'continue' } {
  switch (state.status) {
    case 'success':
      return { type: 'success', data: state.data };
    case 'error':
      // A mutation in the `error` state always carries a non-null `error`.
      return { type: 'error', error: state.error };
    case 'pending':
      return {
        type: 'pending',
        variables: state.variables,
        context: state.context,
        isPaused: state.isPaused,
      };
    // The `idle` status carries no data, error, or variables, so a neutral
    // `continue` action refreshes subscribers without implying a result.
    default:
      return { type: 'continue' };
  }
}
