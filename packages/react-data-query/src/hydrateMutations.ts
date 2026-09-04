import {
  QueryClient,
  DehydratedState,
  MutationState,
} from '@tanstack/query-core';

/**
 * Get the `globalId` of a mutation by reading its `meta` data.
 *
 * Each mutation that is routed from the UI query client to a data service is
 * assigned a `globalId` through the mutation's `meta` property. However, the
 * `meta` property is optional and untyped, so reading this property back
 * requires some validation.
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
 * Load dehydrated mutations into the given query client.
 *
 * TanStack Query's `hydrate` function works well for queries: it ensures that
 * incoming queries remain deduplicated as it hydrates them (using the query key
 * hash as a filter). But mutations don't need to be deduplicated, and so
 * `hydrate` follows a different process, opting to load incoming mutations as
 * new entries each time it is called.
 *
 * This does not well for what we want to achieve, which is to be able to
 * synchronize queries and mutations between a data service query client service
 * and a UI query client. To accomplish this, we assume that mutations which
 * originated on the UI side have been tagged with a custom UUID (stored as
 * `globalId` in its `meta`). This allows us to keep mutations with the same
 * UUID on both sides and thus sychronize them effectively.
 *
 * @param client - The UI query client whose mutation cache should be hydrated.
 * @param dehydratedState - The dehydrated state emitted by a data service's
 * `:cacheUpdated` event.
 */
export function hydrateMutations(
  client: QueryClient,
  dehydratedState: DehydratedState,
): void {
  const mutationCache = client.getMutationCache();

  for (const dehydratedMutation of dehydratedState.mutations) {
    const { mutationKey, state, meta } = dehydratedMutation;

    const globalId = readGlobalId(meta);

    // Although TanStack Query does not require mutations to have mutation keys,
    // all mutations created through data services or the UI query client *must*
    // have one. They must also have a global ID.
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
 * When publishing an `update` event through the mutation cache we must supply
 * an action. This function derives an appropriate action from a dehydrated
 * mutation's state.
 *
 * @param state - The state of a dehydrated mutation.
 * @returns The mutation cache action describing the state.
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
