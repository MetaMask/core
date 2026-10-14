import {
  DehydratedState,
  Mutation,
  MutationState,
  QueryClient,
  MutationCacheNotifyEvent,
} from '@tanstack/query-core';
import assert from 'assert';

import { hydrateMutations } from './hydrateMutations.js';

const EXAMPLE_MUTATION_KEY = ['ExampleDataService:addFollower', '1'];
const EXAMPLE_GLOBAL_ID = 'global-id';

type NotifyEventMutationUpdated = Extract<
  MutationCacheNotifyEvent,
  { type: 'updated' }
>;

describe('hydrateMutations', () => {
  it('updates the mutation whose `globalId` matches the dehydrated mutation', () => {
    const globalId = EXAMPLE_GLOBAL_ID;
    const { queryClient } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId,
    });
    const dehydratedMutationState = {
      status: 'success' as const,
      data: 'result',
    };

    hydrateMutations(
      queryClient,
      createDehydratedStateWithMutation({
        mutationKey: EXAMPLE_MUTATION_KEY,
        globalId,
        state: createMutationState(dehydratedMutationState),
      }),
    );

    const mutation = queryClient.getMutationCache().find({
      mutationKey: EXAMPLE_MUTATION_KEY,
    });
    assert(mutation);
    expect(mutation.state.status).toBe(dehydratedMutationState.status);
    expect(mutation.state.data).toBe(dehydratedMutationState.data);
  });

  it('leaves untouched a mutation whose `globalId` does not match', () => {
    const { queryClient, mutation } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: 'some-global-id',
    });
    const stateBefore = mutation.state;

    hydrateMutations(
      queryClient,
      createDehydratedStateWithMutation({
        mutationKey: EXAMPLE_MUTATION_KEY,
        globalId: 'a-different-global-id',
        state: createMutationState({ status: 'success', data: 'result' }),
      }),
    );

    expect(mutation.state).toBe(stateBefore);
  });

  it('ignores dehydrated mutations that have no `globalId`', () => {
    const { queryClient, mutation } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: EXAMPLE_GLOBAL_ID,
    });
    const stateBefore = mutation.state;

    hydrateMutations(
      queryClient,
      createDehydratedStateWithMutation({
        mutationKey: EXAMPLE_MUTATION_KEY,
        globalId: undefined,
        state: createMutationState({ status: 'success', data: 'result' }),
      }),
    );

    expect(mutation.state).toBe(stateBefore);
  });

  it('ignores dehydrated mutations that have a non-string `globalId`', () => {
    const { queryClient, mutation } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: EXAMPLE_GLOBAL_ID,
    });
    const stateBefore = mutation.state;

    hydrateMutations(
      queryClient,
      createDehydratedStateWithMutation({
        mutationKey: EXAMPLE_MUTATION_KEY,
        globalId: 42,
        state: createMutationState({ status: 'success', data: 'result' }),
      }),
    );

    expect(mutation.state).toBe(stateBefore);
  });

  it('notifies subscribers with a `success` action when the mutation succeeded', () => {
    const { queryClient } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: EXAMPLE_GLOBAL_ID,
    });

    const actions = capturingMutationCacheActions(queryClient, () => {
      hydrateMutations(
        queryClient,
        createDehydratedStateWithMutation({
          mutationKey: EXAMPLE_MUTATION_KEY,
          globalId: EXAMPLE_GLOBAL_ID,
          state: createMutationState({ status: 'success', data: 'result' }),
        }),
      );
    });

    expect(actions).toContainEqual({ type: 'success', data: 'result' });
  });

  it('notifies subscribers with an `error` action when the mutation failed', () => {
    const error = new Error('boom');

    const { queryClient } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: EXAMPLE_GLOBAL_ID,
    });

    const actions = capturingMutationCacheActions(queryClient, () => {
      hydrateMutations(
        queryClient,
        createDehydratedStateWithMutation({
          mutationKey: EXAMPLE_MUTATION_KEY,
          globalId: EXAMPLE_GLOBAL_ID,
          state: createMutationState({ status: 'error', error }),
        }),
      );
    });

    expect(actions).toContainEqual({ type: 'error', error });
  });

  it('notifies subscribers with a `pending` action while the mutation is pending', () => {
    const { queryClient } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: EXAMPLE_GLOBAL_ID,
    });

    const actions = capturingMutationCacheActions(queryClient, () => {
      hydrateMutations(
        queryClient,
        createDehydratedStateWithMutation({
          mutationKey: EXAMPLE_MUTATION_KEY,
          globalId: EXAMPLE_GLOBAL_ID,
          state: createMutationState({
            status: 'pending',
            variables: { followerId: '1' },
            context: { previous: null },
            isPaused: true,
          }),
        }),
      );
    });

    expect(actions).toContainEqual({
      type: 'pending',
      variables: { followerId: '1' },
      context: { previous: null },
      isPaused: true,
    });
  });

  it('notifies subscribers with a `continue` action when the mutation is idle', () => {
    const { queryClient } = createQueryClientWithMutation({
      mutationKey: EXAMPLE_MUTATION_KEY,
      globalId: EXAMPLE_GLOBAL_ID,
    });

    const actions = capturingMutationCacheActions(queryClient, () => {
      hydrateMutations(
        queryClient,
        createDehydratedStateWithMutation({
          mutationKey: EXAMPLE_MUTATION_KEY,
          globalId: EXAMPLE_GLOBAL_ID,
          state: createMutationState({
            status: 'idle',
          }),
        }),
      );
    });

    expect(actions).toContainEqual({ type: 'continue' });
  });
});

/**
 * Create a query queryClient that is prepopulated with a mutation. The mutation is
 * tagged with a `globalId` to stand in for a mutation the UI query queryClient
 * created.
 *
 * @param args - The arguments.
 * @param args.mutationKey - The key to assign to the mutation.
 * @param args.globalId - The `globalId` to tag the mutation with.
 * @returns The query queryClient.
 */
function createQueryClientWithMutation({
  mutationKey,
  globalId,
}: {
  mutationKey: string[];
  globalId: string;
}): {
  queryClient: QueryClient;
  mutation: Mutation<unknown, unknown, unknown, unknown>;
} {
  const queryClient = new QueryClient();
  const mutation = queryClient.getMutationCache().build(queryClient, {
    mutationKey,
    meta: { globalId },
  });
  return { queryClient, mutation };
}

/**
 * Construct a dehydrated mutation cache containing a single mutation for the
 * shared mutation key, tagged with a `globalId`.
 *
 * @param options - The options.
 * @param options.mutationKey - The key to assign to the dehydrated mutation.
 * @param options.globalId - The `globalId` to tag the dehydrated mutation with.
 * @param options.state - The state of the dehydrated mutation.
 * @returns The dehydrated state.
 */
function createDehydratedStateWithMutation({
  mutationKey,
  globalId,
  state,
}: {
  mutationKey: string[];
  globalId?: unknown;
  state: MutationState;
}): DehydratedState {
  return {
    queries: [],
    mutations: [
      {
        mutationKey,
        meta: { globalId },
        state,
      },
    ],
  };
}

/**
 * Build a mutation state, filling in the fields that are irrelevant to the test
 * with neutral defaults.
 *
 * @param overrides - The state fields the test cares about.
 * @returns The mutation state.
 */
function createMutationState(overrides: Partial<MutationState>): MutationState {
  return {
    context: undefined,
    data: undefined,
    error: null,
    failureCount: 0,
    failureReason: null,
    isPaused: false,
    status: 'idle',
    submittedAt: 0,
    variables: undefined,
    ...overrides,
  };
}

/**
 * Executes a function that presumably operates on a query client, collecting
 * the actions that its mutation cache produces when there are updates.
 *
 * @param queryClient - The query client.
 * @param fn - The function to call.
 * @returns The captured mutation cache actions.
 */
function capturingMutationCacheActions(
  queryClient: QueryClient,
  fn: () => void,
): NotifyEventMutationUpdated['action'][] {
  const actions: NotifyEventMutationUpdated['action'][] = [];
  queryClient.getMutationCache().subscribe((event) => {
    if (event.type === 'updated') {
      actions.push(event.action);
    }
  });

  fn();

  return actions;
}
