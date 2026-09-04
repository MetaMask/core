import {
  DehydratedState,
  Mutation,
  MutationState,
  QueryClient,
} from '@tanstack/query-core';

import { hydrateMutations } from './hydrateMutations.js';

type MutationCacheAction = {
  type: string;
  [key: string]: unknown;
};

const MUTATION_KEY = ['ExampleDataService:addFollower', '1'];

describe('hydrateMutations', () => {
  it('updates the mutation whose `globalId` matches the dehydrated mutation', () => {
    const client = new QueryClient();
    buildUiMutation(client, { globalId: 'global-id-1' });

    hydrateMutations(
      client,
      createDehydratedState({
        globalId: 'global-id-1',
        state: createMutationState({ status: 'success', data: 'result' }),
      }),
    );

    const mutation = client.getMutationCache().find({
      mutationKey: MUTATION_KEY,
    });
    expect(mutation?.state.status).toBe('success');
    expect(mutation?.state.data).toBe('result');
  });

  it('leaves untouched a mutation whose `globalId` does not match', () => {
    const client = new QueryClient();
    const mutation = buildUiMutation(client, { globalId: 'global-id-1' });
    const stateBefore = mutation.state;

    hydrateMutations(
      client,
      createDehydratedState({
        globalId: 'a-different-global-id',
        state: createMutationState({ status: 'success', data: 'result' }),
      }),
    );

    expect(mutation.state).toBe(stateBefore);
  });

  it('ignores dehydrated mutations that carry no `globalId`', () => {
    const client = new QueryClient();
    const mutation = buildUiMutation(client, { globalId: 'global-id-1' });
    const stateBefore = mutation.state;

    hydrateMutations(client, {
      queries: [],
      mutations: [
        {
          mutationKey: MUTATION_KEY,
          state: createMutationState({ status: 'success', data: 'result' }),
        },
      ],
    });

    expect(mutation.state).toBe(stateBefore);
  });

  it('ignores dehydrated mutations that carry a non-string `globalId`', () => {
    const client = new QueryClient();
    const mutation = buildUiMutation(client, { globalId: 'global-id-1' });
    const stateBefore = mutation.state;

    hydrateMutations(client, {
      queries: [],
      mutations: [
        {
          mutationKey: MUTATION_KEY,
          meta: { globalId: 42 },
          state: createMutationState({ status: 'success', data: 'result' }),
        },
      ],
    });

    expect(mutation.state).toBe(stateBefore);
  });

  it('notifies subscribers with a `success` action when the mutation succeeded', () => {
    const actions = captureNotifyActions('global-id-1', {
      status: 'success',
      data: 'result',
    });

    expect(actions).toContainEqual({ type: 'success', data: 'result' });
  });

  it('notifies subscribers with an `error` action when the mutation failed', () => {
    const error = new Error('boom');

    const actions = captureNotifyActions('global-id-1', {
      status: 'error',
      error,
    });

    expect(actions).toContainEqual({ type: 'error', error });
  });

  it('notifies subscribers with a `pending` action while the mutation is pending', () => {
    const actions = captureNotifyActions('global-id-1', {
      status: 'pending',
      variables: { followerId: '1' },
      context: { previous: null },
      isPaused: true,
    });

    expect(actions).toContainEqual({
      type: 'pending',
      variables: { followerId: '1' },
      context: { previous: null },
      isPaused: true,
    });
  });

  it('notifies subscribers with a `continue` action when the mutation is idle', () => {
    const actions = captureNotifyActions('global-id-1', {
      status: 'idle',
    });

    expect(actions).toContainEqual({ type: 'continue' });
  });
});

/**
 * Build a mutation in a client's mutation cache, tagged with a `globalId`, to
 * stand in for a mutation the UI query client created.
 *
 * @param client - The client whose cache the mutation is built in.
 * @param options - The options.
 * @param options.globalId - The `globalId` to tag the mutation with.
 * @returns The built mutation.
 */
function buildUiMutation(
  client: QueryClient,
  { globalId }: { globalId: string },
): Mutation {
  return client.getMutationCache().build(client, {
    mutationKey: MUTATION_KEY,
    meta: { globalId },
  });
}

/**
 * Build a dehydrated mutation cache carrying a single mutation for the shared
 * mutation key, tagged with a `globalId`.
 *
 * @param options - The options.
 * @param options.globalId - The `globalId` to tag the dehydrated mutation with.
 * @param options.state - The state of the dehydrated mutation.
 * @returns The dehydrated state.
 */
function createDehydratedState({
  globalId,
  state,
}: {
  globalId: string;
  state: MutationState;
}): DehydratedState {
  return {
    queries: [],
    mutations: [
      {
        mutationKey: MUTATION_KEY,
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
 * Hydrate a UI mutation with a service mutation of a given state and collect the
 * actions that the mutation cache notifies its subscribers with.
 *
 * @param globalId - The `globalId` shared by the UI and service mutations.
 * @param stateOverrides - The state fields to give the service mutation.
 * @returns The captured notify actions.
 */
function captureNotifyActions(
  globalId: string,
  stateOverrides: Partial<MutationState>,
): MutationCacheAction[] {
  const client = new QueryClient();
  buildUiMutation(client, { globalId });

  const actions: MutationCacheAction[] = [];
  client.getMutationCache().subscribe((event) => {
    if (event.type === 'updated') {
      actions.push(event.action);
    }
  });

  hydrateMutations(
    client,
    createDehydratedState({
      globalId,
      state: createMutationState(stateOverrides),
    }),
  );

  return actions;
}
