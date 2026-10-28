import {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedPayload,
  DataServiceQueryState,
} from '@metamask/base-data-service';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  MessengerActions,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  Duration,
  createDeferredPromise,
  inMilliseconds,
} from '@metamask/utils';
import {
  hashKey,
  InfiniteData,
  InfiniteQueryObserver,
  // MutationObserver is part of the Web API and is therefore a global
  MutationObserver as TanStackQueryMutationObserver,
  QueryClient,
  QueryClientConfig,
  QueryObserver,
} from '@tanstack/query-core';
import assert from 'assert';
import type nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AddFollowerResponse,
  ExampleDataService,
  ExampleMessenger,
  GetActivityResponse,
  PageParam,
  serviceName,
} from '../../base-data-service/tests/ExampleDataService.js';
import {
  mockAssets,
  mockAddFollowerRequest,
  mockTransactionsPage1,
  mockTransactionsPage2,
  DEFAULT_ADD_FOLLOWER_REPLY,
} from '../../base-data-service/tests/mocks.js';
import {
  StorageServiceGetItemAction,
  StorageServiceSetItemAction,
  StorageServiceRemoveItemAction,
} from '../../storage-service/src/StorageService-method-action-types.js';
import { createUIQueryClient } from './createUIQueryClient.js';

const DATA_SERVICES = ['ExampleDataService'] as const;

type RootMessenger = Messenger<
  MockAnyNamespace,
  | StorageServiceGetItemAction
  | StorageServiceSetItemAction
  | StorageServiceRemoveItemAction,
  never
>;

/**
 * Handles granular cache update events emitted by data services.
 */
type DataServiceGranularCacheUpdatedHandler = (
  payload: DataServiceGranularCacheUpdatedPayload,
) => void;

/**
 * Create a root messenger.
 *
 * @param args - The arguments.
 * @param args.actionHandlers - The action handlers to mock.
 * @returns The root messenger.
 */
function createRootMessenger({
  actionHandlers = {
    'StorageService:getItem': vi.fn(),
    'StorageService:setItem': vi.fn(),
    'StorageService:removeItem': vi.fn(),
  },
}: {
  actionHandlers?: {
    [
      Action in MessengerActions<RootMessenger> as Action['type']
    ]?: Action['handler'];
  };
} = {}): RootMessenger {
  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: console.error,
  });

  for (const [actionType, actionHandler] of Object.entries(actionHandlers)) {
    // @ts-expect-error TypeScript puts all types and all handlers into
    // two unions, making it impossible to tell which belongs to which
    messenger.registerActionHandler(actionType, actionHandler);
  }

  return messenger;
}

/**
 * Create an ExampleDataService messenger.
 *
 * @param rootMessenger - The root messenger to derive the ExampleDataService
 * messenger from.
 * @returns The ExampleDataService messenger.
 */
function createServiceMessenger(
  rootMessenger = createRootMessenger(),
): ExampleMessenger {
  const messenger: ExampleMessenger = new Messenger({
    namespace: serviceName,
  });
  rootMessenger.delegate({
    actions: [
      'StorageService:getItem',
      'StorageService:setItem',
      'StorageService:removeItem',
    ],
    messenger,
  });
  return messenger;
}

function createClients(config?: QueryClientConfig): {
  service: ExampleDataService;
  clientA: QueryClient;
  clientB: QueryClient;
  messenger: ExampleMessenger;
} {
  const serviceMessenger = createServiceMessenger();
  const service = new ExampleDataService(serviceMessenger);
  const messengerAdapter = {
    call: (
      actionType: `ExampleDataService:${string}`,
      ...params: unknown[]
    ): unknown => {
      if (actionType.startsWith('ExampleDataService:')) {
        // @ts-expect-error TypeScript cannot unify template literals with
        // strings. We can safely assume that the ExampleDataService messenger
        // accepts an action prefixed with "ExampleDataService:", though.
        return serviceMessenger.call(actionType, ...params);
      }
      throw new Error(`Unknown action: ${actionType}`);
    },
    subscribe: (
      eventType: DataServiceGranularCacheUpdatedEvent<'ExampleDataService'>['type'],
      handler: DataServiceGranularCacheUpdatedHandler,
    ): void => {
      serviceMessenger.subscribe(eventType, handler);
    },
    unsubscribe: (
      eventType: DataServiceGranularCacheUpdatedEvent<'ExampleDataService'>['type'],
      handler: DataServiceGranularCacheUpdatedHandler,
    ): void => {
      serviceMessenger.unsubscribe(eventType, handler);
    },
  };

  const clientA = createUIQueryClient(DATA_SERVICES, messengerAdapter, config);
  const clientB = createUIQueryClient(DATA_SERVICES, messengerAdapter, config);

  return { service, clientA, clientB, messenger: serviceMessenger };
}

const getAssetsQueryKey = [
  'ExampleDataService:getAssets',
  [
    'eip155:1/slip44:60',
    'bip122:000000000019d6689c085ae165831e93/slip44:0',
    'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
  ],
];

const getActivityQueryKey = [
  'ExampleDataService:getActivity',
  '0x4bbeEB066eD09B7AEd07bF39EEe0460DFa261520',
];

const addFollowerMutationKey = ['ExampleDataService:addFollower', '1'];

describe('createUIQueryClient', () => {
  beforeEach(() => {
    // This is necessary to avoid a "Jest did not exit within 1 second" error
    // even for "simple" tests like fetching queries or executing mutations
    vi.useFakeTimers({ toNotFake: ['nextTick', 'setImmediate'] });

    mockAssets();
    mockTransactionsPage1();
    mockTransactionsPage2();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('proxies queries to the underlying service', async () => {
    const { clientA: client, service } = createClients();

    const result = await client.fetchQuery({
      queryKey: getAssetsQueryKey,
    });

    expect(result).toStrictEqual([
      {
        assetId: 'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
      },
      {
        assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        decimals: 8,
        name: 'Bitcoin',
        symbol: 'BTC',
      },
      {
        assetId: 'eip155:1/slip44:60',
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      },
    ]);

    service.destroy();
  });

  it('proxies mutations to the underlying service', async () => {
    const { clientA: client, service } = createClients();

    mockAddFollowerRequest();

    const mutationCache = client.getMutationCache();
    const mutation = mutationCache.build(client, {
      mutationKey: addFollowerMutationKey,
    });
    const result = await mutation.execute({});

    expect(result).toStrictEqual({
      followed: [
        {
          profileId: '550e8400-e29b-41d4-a716-446655440000',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          name: 'TraderAlice',
          imageUrl: 'https://example.com/avatar.png',
        },
      ],
    });

    service.destroy();
  });

  it('fetches queries using observers', async () => {
    const { clientA, clientB, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultA = await promiseA;

    expect(resultA).toHaveLength(3);

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultB = await promiseB;
    expect(resultA).toStrictEqual(resultB);

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('executes mutations using observers', async () => {
    const { clientA, clientB, service } = createClients();

    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observerA = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientA,
      {
        mutationKey: addFollowerMutationKey,
      },
    );
    const observerB = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientB,
      {
        mutationKey: addFollowerMutationKey,
      },
    );

    const resultA = await observerA.mutate();
    const resultB = await observerB.mutate();

    expect(resultA.followed).toHaveLength(1);
    expect(resultA).toStrictEqual(resultB);

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('assigns each mutation a distinct `globalId` so concurrent mutations sharing a key stay independent', async () => {
    const { clientA: client, service } = createClients();

    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observerA = new TanStackQueryMutationObserver<AddFollowerResponse>(
      client,
      { mutationKey: addFollowerMutationKey },
    );
    const observerB = new TanStackQueryMutationObserver<AddFollowerResponse>(
      client,
      { mutationKey: addFollowerMutationKey },
    );

    await Promise.all([observerA.mutate(), observerB.mutate()]);

    const globalMutationIds = client
      .getMutationCache()
      .findAll({ mutationKey: addFollowerMutationKey })
      .map((mutation) => mutation.meta?.globalId);

    expect(globalMutationIds).toHaveLength(2);
    expect(globalMutationIds[0]).toBeDefined();
    expect(globalMutationIds[1]).toBeDefined();
    expect(globalMutationIds[0]).not.toBe(globalMutationIds[1]);

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('assigns a distinct `globalId` to each mutation built from a single observer that mutates more than once', async () => {
    const { clientA: client, service } = createClients();

    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observer = new TanStackQueryMutationObserver<AddFollowerResponse>(
      client,
      { mutationKey: addFollowerMutationKey },
    );

    await observer.mutate();
    await observer.mutate();

    const globalMutationIds = client
      .getMutationCache()
      .findAll({ mutationKey: addFollowerMutationKey })
      .map((mutation) => mutation.meta?.globalId);

    expect(globalMutationIds).toHaveLength(2);
    expect(globalMutationIds[0]).toBeDefined();
    expect(globalMutationIds[1]).toBeDefined();
    expect(globalMutationIds[0]).not.toBe(globalMutationIds[1]);

    observer.reset();
    service.destroy();
  });

  it('preserves a pending mutation`s `globalId` when the observer`s options are re-defaulted', async () => {
    const { clientA: client, messenger, service } = createClients();

    const { promise: promiseToResolveMutation, resolve: resolveMutation } =
      createDeferredPromise();
    const replyFn = async (): Promise<[number, nock.ReplyBody]> => {
      await promiseToResolveMutation;
      return [
        DEFAULT_ADD_FOLLOWER_REPLY.status,
        DEFAULT_ADD_FOLLOWER_REPLY.body,
      ] as const;
    };
    mockAddFollowerRequest({ replyFn });

    const observer = new TanStackQueryMutationObserver<AddFollowerResponse>(
      client,
      { mutationKey: addFollowerMutationKey },
    );

    const promiseForMutation = observer.mutate();
    vi.advanceTimersByTime(0);

    const mutationFromUi = client
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    assert(mutationFromUi);
    const globalIdBeforeReDefaulting = mutationFromUi.meta?.globalId;

    // Simulate a re-render passing a fresh options object (as `useMutation`
    // does) while the mutation is still in flight. This must not mint a new
    // `globalId` for the in-flight mutation.
    observer.setOptions({ mutationKey: addFollowerMutationKey });

    const globalIdAfterReDefaulting = mutationFromUi.meta?.globalId;
    expect(globalIdAfterReDefaulting).toBe(globalIdBeforeReDefaulting);

    resolveMutation();
    await promiseForMutation;

    const { globalId } = mutationFromUi.meta ?? {};

    const hash = hashKey(addFollowerMutationKey);
    messenger.publish(`ExampleDataService:cacheUpdated:${hash}`, {
      objectType: 'mutation',
      type: 'updated',
      state: {
        queries: [],
        mutations: [
          {
            mutationKey: addFollowerMutationKey,
            meta: { globalId },
            state: {
              context: undefined,
              data: { followed: [{ profileId: 'from-service' }] },
              error: null,
              failureCount: 0,
              failureReason: null,
              isPaused: false,
              status: 'success' as const,
              submittedAt: 0,
              variables: undefined,
            },
          },
        ],
      },
    });

    expect(mutationFromUi.state.data).toStrictEqual({
      followed: [{ profileId: 'from-service' }],
    });

    observer.reset();
    service.destroy();
  });

  it('ignores :cacheUpdated events whose referenced mutation carries no `globalId`', async () => {
    const { clientA: client, messenger, service } = createClients();

    mockAddFollowerRequest();

    const observer = new TanStackQueryMutationObserver<AddFollowerResponse>(
      client,
      { mutationKey: addFollowerMutationKey },
    );

    await observer.mutate();

    const mutationFromUi = client
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    assert(mutationFromUi);
    const stateBeforeCacheUpdated = mutationFromUi.state;
    const dehydratedMutationFromDataService = {
      mutationKey: addFollowerMutationKey,
      state: {
        context: undefined,
        data: { followed: [] },
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        status: 'success' as const,
        submittedAt: 0,
        variables: undefined,
      },
    };

    const hash = hashKey(addFollowerMutationKey);
    messenger.publish(`ExampleDataService:cacheUpdated:${hash}`, {
      objectType: 'mutation',
      type: 'updated',
      state: {
        queries: [],
        mutations: [dehydratedMutationFromDataService],
      },
    });

    const mutationFromUi2 = client
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    assert(mutationFromUi2);
    expect(mutationFromUi2.state).toBe(stateBeforeCacheUpdated);

    observer.reset();
    service.destroy();
  });

  it('ignores `added` :cacheUpdated events so an idle service mutation cannot wipe a settled UI result', async () => {
    const { clientA: client, messenger, service } = createClients();

    mockAddFollowerRequest();

    const observer = new TanStackQueryMutationObserver<AddFollowerResponse>(
      client,
      { mutationKey: addFollowerMutationKey },
    );

    await observer.mutate();

    const mutationFromUi = client
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    assert(mutationFromUi);
    expect(mutationFromUi.state.status).toBe('success');
    const settledState = mutationFromUi.state;
    const { globalId } = mutationFromUi.meta ?? {};

    // Replay the kind of event a data service emits when it builds a fresh
    // mutation for the same key: the mutation is included in its initial
    // `idle` state under an `added` event.
    const hash = hashKey(addFollowerMutationKey);
    messenger.publish(`ExampleDataService:cacheUpdated:${hash}`, {
      objectType: 'mutation',
      type: 'added',
      state: {
        queries: [],
        mutations: [
          {
            mutationKey: addFollowerMutationKey,
            meta: { globalId },
            state: {
              context: undefined,
              data: undefined,
              error: null,
              failureCount: 0,
              failureReason: null,
              isPaused: false,
              status: 'idle' as const,
              submittedAt: 0,
              variables: undefined,
            },
          },
        ],
      },
    });

    expect(mutationFromUi.state).toBe(settledState);
    expect(mutationFromUi.state.status).toBe('success');

    observer.reset();
    service.destroy();
  });

  it('preserves mutations that share a mutation key with an action on the data service but were not actually routed through the data service', async () => {
    const { clientA: client, service } = createClients();

    mockAddFollowerRequest();

    const serviceObserver =
      new TanStackQueryMutationObserver<AddFollowerResponse>(client, {
        mutationKey: addFollowerMutationKey,
      });
    await serviceObserver.mutate();

    const customObserver = new TanStackQueryMutationObserver<string>(client, {
      mutationKey: addFollowerMutationKey,
      mutationFn: async (): Promise<string> => 'custom-result',
    });
    await customObserver.mutate();

    const mutations = client
      .getMutationCache()
      .findAll({ mutationKey: addFollowerMutationKey });

    expect(mutations).toHaveLength(2);
    expect(mutations[1].state.data).toBe('custom-result');
    // The mutation with a custom `mutationFn` is never routed to the data
    // service, so it must not be tagged with a `globalId`.
    expect(mutations[1].meta?.globalId).toBeUndefined();

    customObserver.reset();
    serviceObserver.reset();
    service.destroy();
  });

  it('fetches queries using observers in the same client', async () => {
    const { clientA, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultA = await promiseA;

    expect(resultA).toHaveLength(3);

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    const resultB = await promiseB;
    expect(resultA).toStrictEqual(resultB);

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('executes mutations using observers in the same client', async () => {
    const { clientA, service } = createClients();

    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observerA = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientA,
      {
        mutationKey: addFollowerMutationKey,
      },
    );
    const observerB = new TanStackQueryMutationObserver<AddFollowerResponse>(
      clientA,
      {
        mutationKey: addFollowerMutationKey,
      },
    );

    const resultA = await observerA.mutate();
    const resultB = await observerB.mutate();

    expect(resultA.followed).toHaveLength(1);
    expect(resultA).toStrictEqual(resultB);

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('synchronizes caches after invalidation', async () => {
    const { clientA, clientB, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    vi.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    // Replace the mock response and invalidate
    mockAssets({
      status: 200,
      body: [],
    });

    await clientA.invalidateQueries();

    const queryDataA = clientA.getQueryData(getAssetsQueryKey);
    const queryDataB = clientB.getQueryData(getAssetsQueryKey);

    expect(queryDataA).toStrictEqual([]);
    expect(queryDataB).toStrictEqual([]);

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('supports customizing query invalidation', async () => {
    const { clientA, messenger, service } = createClients();

    const spy = vi.spyOn(messenger, 'call');

    const observer = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const promise = new Promise((resolve) => {
      observer.subscribe((event) => {
        if (event.status === 'success') {
          resolve(event.data);
        }
      });
    });

    await promise;

    // Replace the mock response and invalidate
    mockAssets({
      status: 200,
      body: [],
    });

    await clientA.invalidateQueries(
      { queryKey: getAssetsQueryKey, refetchType: 'all' },
      { throwOnError: true },
    );

    expect(spy).toHaveBeenCalledWith(
      'ExampleDataService:invalidateQueries',
      { queryKey: getAssetsQueryKey, refetchType: 'all' },
      { throwOnError: true },
    );

    observer.destroy();
    service.destroy();
  });

  it('does not remove entries from the query cache if query observers still are subscribed', async () => {
    const { clientA, clientB, service } = createClients();

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    vi.advanceTimersByTime(0);

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    vi.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const queryData = clientA.getQueryData(getAssetsQueryKey);
    expect(queryData).toBeDefined();
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('does not remove entries from the mutation cache if mutation observers still are subscribed', async () => {
    const { clientA, clientB, service } = createClients();
    const { promise: promiseToResolveMutation, resolve: resolveMutation } =
      createDeferredPromise();
    const replyFn = async (): Promise<[number, nock.ReplyBody]> => {
      await promiseToResolveMutation;
      return [
        DEFAULT_ADD_FOLLOWER_REPLY.status,
        DEFAULT_ADD_FOLLOWER_REPLY.body,
      ] as const;
    };
    mockAddFollowerRequest({ replyFn });
    mockAddFollowerRequest({ replyFn });

    const observerA = new TanStackQueryMutationObserver(clientA, {
      mutationKey: addFollowerMutationKey,
    });
    const observerB = new TanStackQueryMutationObserver(clientB, {
      mutationKey: addFollowerMutationKey,
    });

    const promiseA = observerA.mutate();
    const promiseB = observerB.mutate();

    vi.advanceTimersByTime(0);

    const mutationBeforeRemovalA = clientA
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    const mutationBeforeRemovalB = clientB
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    expect(mutationBeforeRemovalA).toBeDefined();
    expect(mutationBeforeRemovalB).toBeDefined();

    resolveMutation();

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    vi.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const mutationDataAfterRemovalA = clientA
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    const mutationDataAfterRemovalB = clientB
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    expect(mutationDataAfterRemovalA).toBeDefined();
    expect(mutationDataAfterRemovalB).toBeDefined();

    observerA.reset();
    observerB.reset();
    service.destroy();
  });

  it('cleans up removed query cache entries once all query observers are removed', async () => {
    const defaultOptions = {
      queries: { gcTime: inMilliseconds(5, Duration.Minute) },
    };

    const { clientA, clientB, service } = createClients({ defaultOptions });

    const observerA = new QueryObserver(clientA, {
      queryKey: getAssetsQueryKey,
    });

    const observerB = new QueryObserver(clientB, {
      queryKey: getAssetsQueryKey,
    });

    const promiseA = new Promise((resolve) => {
      observerA.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    const promiseB = new Promise((resolve) => {
      observerB.subscribe((event) => {
        if (event.status === 'success' && !event.isFetching) {
          resolve(event.data);
        }
      });
    });

    vi.advanceTimersByTime(0);

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    vi.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const queryData = clientA.getQueryData(getAssetsQueryKey);

    expect(queryData).toBeDefined();
    expect(queryData).toStrictEqual(clientB.getQueryData(getAssetsQueryKey));

    observerA.destroy();
    observerB.destroy();

    vi.advanceTimersByTime(inMilliseconds(5, Duration.Minute));

    expect(clientA.getQueryData(getAssetsQueryKey)).toBeUndefined();
    service.destroy();
  });

  it('cleans up removed mutation cache entries once all mutation observers are removed', async () => {
    const defaultOptions = {
      mutations: { gcTime: inMilliseconds(5, Duration.Minute) },
    };

    const { clientA, clientB, service } = createClients({ defaultOptions });
    mockAddFollowerRequest();
    mockAddFollowerRequest();

    const observerA = new TanStackQueryMutationObserver(clientA, {
      mutationKey: addFollowerMutationKey,
    });

    const observerB = new TanStackQueryMutationObserver(clientB, {
      mutationKey: addFollowerMutationKey,
    });

    const promiseA = observerA.mutate();
    const promiseB = observerB.mutate();

    vi.advanceTimersByTime(0);

    await Promise.all([promiseA, promiseB]);

    // Advance the full gcTime of ExampleDataService
    vi.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const mutationBeforeRemovalA = clientA
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    const mutationBeforeRemovalB = clientB
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    expect(mutationBeforeRemovalA).toBeDefined();
    expect(mutationBeforeRemovalB).toBeDefined();

    observerA.reset();
    observerB.reset();

    vi.advanceTimersByTime(inMilliseconds(5, Duration.Minute));

    const mutationDataAfterRemovalA = clientA
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    const mutationDataAfterRemovalB = clientB
      .getMutationCache()
      .find({ mutationKey: addFollowerMutationKey });
    expect(mutationDataAfterRemovalA).toBeUndefined();
    expect(mutationDataAfterRemovalB).toBeUndefined();

    service.destroy();
  });

  it('fetches using paginated query observers', async () => {
    const { clientA, clientB, service } = createClients();

    const getPreviousPageParam = ({
      pageInfo,
    }: GetActivityResponse): PageParam | undefined =>
      pageInfo.hasPreviousPage ? { before: pageInfo.startCursor } : undefined;
    const getNextPageParam = ({
      pageInfo,
    }: GetActivityResponse): PageParam | undefined =>
      pageInfo.hasNextPage ? { after: pageInfo.endCursor } : undefined;

    const observerA = new InfiniteQueryObserver(clientA, {
      queryKey: getActivityQueryKey,
      initialPageParam: null,
      getNextPageParam,
      getPreviousPageParam,
    });

    const observerB = new InfiniteQueryObserver(clientB, {
      queryKey: getActivityQueryKey,
      initialPageParam: null,
      getNextPageParam,
      getPreviousPageParam,
    });

    const promiseA = new Promise<InfiniteData<GetActivityResponse>>(
      (resolve) => {
        observerA.subscribe((event) => {
          if (event.status === 'success') {
            resolve(event.data);
          }
        });
      },
    );

    const resultA = await promiseA;

    expect(resultA.pages[0].data).toHaveLength(3);

    const promiseB = new Promise<InfiniteData<GetActivityResponse>>(
      (resolve) => {
        observerB.subscribe((event) => {
          if (event.status === 'success') {
            resolve(event.data);
          }
        });
      },
    );

    const resultB = await promiseB;
    expect(resultA).toStrictEqual(resultB);

    // Advance the full gcTime of ExampleDataService
    vi.advanceTimersByTime(inMilliseconds(1, Duration.Day));

    const nextPageResult = await observerA.fetchNextPage();
    expect(nextPageResult.data?.pages).toHaveLength(2);

    expect(clientA.getQueryData(getActivityQueryKey)).toStrictEqual(
      clientB.getQueryData(getActivityQueryKey),
    );

    observerA.destroy();
    observerB.destroy();
    service.destroy();
  });

  it('errors if query observer attempts to use default query function without a data service', async () => {
    const { clientA } = createClients();

    const observer = new QueryObserver(clientA, {
      queryKey: ['query'],
      retry: false,
    });

    const promise = new Promise<Error>((_resolve, reject) => {
      observer.subscribe((event) => {
        if (event.status === 'error') {
          reject(event.error);
        }
      });
    });

    await expect(promise).rejects.toThrow(
      "You must pass a `queryKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `queryKey: ['ExampleDataService:getAssets', ...]`.",
    );
  });

  it('errors if mutation observer attempts to use default mutation function without a data service', async () => {
    const { clientA } = createClients();
    const observer = new TanStackQueryMutationObserver(clientA, {
      mutationKey: ['mutation'],
    });

    await expect(observer.mutate()).rejects.toThrow(
      "You must pass a `mutationKey` that calls an action on the messenger provided to `createUIQueryClient`, e.g. `mutationKey: ['ExampleDataService:createOrder', ...]`.",
    );
  });

  it('ignores attempts to invalidate non-data service queries', async () => {
    const { clientA, messenger } = createClients();

    const spy = vi.spyOn(messenger, 'call');

    const observer = new QueryObserver(clientA, {
      queryKey: ['query'],
      retry: false,
    });

    const promise = new Promise<void>((resolve) => {
      observer.subscribe(() => {
        resolve();
      });
    });

    await promise;

    await clientA.invalidateQueries({ queryKey: ['query'] });

    expect(spy).not.toHaveBeenCalled();
  });

  it('ignores non-data service queries', async () => {
    const { clientA, messenger } = createClients();

    const callSpy = vi.spyOn(messenger, 'call');
    const subscribeSpy = vi.spyOn(messenger, 'subscribe');

    const observer = new QueryObserver(clientA, {
      queryKey: [1, 2, 3],
      queryFn: (): string => 'foo',
      retry: false,
    });

    await new Promise<void>((resolve) => {
      observer.subscribe((event) => {
        if (event.status === 'success') {
          resolve();
        }
      });
    });

    expect(callSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('ignores non-data service mutations', async () => {
    const { clientA, messenger } = createClients();

    const callSpy = vi.spyOn(messenger, 'call');
    const subscribeSpy = vi.spyOn(messenger, 'subscribe');

    const observer = new TanStackQueryMutationObserver(clientA, {
      mutationKey: [1, 2, 3],
      mutationFn: async (): Promise<string> => 'foo',
      retry: false,
    });

    await observer.mutate();

    expect(callSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  describe('background fetch state', () => {
    const queryHash = hashKey(getAssetsQueryKey);
    const cacheUpdatedEvent =
      `ExampleDataService:cacheUpdated:${queryHash}` as const;
    // The service expects a tuple, while `getAssetsQueryKey` is inferred as a
    // plain array.
    const serviceQueryKey = getAssetsQueryKey as [string, string[]];

    beforeEach(() => {
      // These tests rely on TanStack's batched notifications, which are
      // flushed with `setTimeout`.
      vi.useRealTimers();
    });

    /**
     * Copy a value the way the extension port does, so that anything that is
     * not JSON safe (such as `Error` instances) is lost.
     *
     * @param value - The value to copy.
     * @returns The copied value.
     */
    function roundTrip<Value>(value: Value): Value {
      return JSON.parse(JSON.stringify(value)) as Value;
    }

    /**
     * Create a data service and a UI query client whose messenger adapter
     * passes every `:cacheUpdated` payload through a JSON round trip.
     *
     * @returns The service, the UI query client, and the service messenger.
     */
    function createRoundTripClient(): {
      service: ExampleDataService;
      client: QueryClient;
      messenger: ExampleMessenger;
    } {
      const serviceMessenger = createServiceMessenger();
      const service = new ExampleDataService(serviceMessenger);
      const wrappedHandlers = new Map<
        DataServiceGranularCacheUpdatedHandler,
        DataServiceGranularCacheUpdatedHandler
      >();

      const client = createUIQueryClient(DATA_SERVICES, {
        call: (actionType, ...params) =>
          // @ts-expect-error TypeScript cannot unify template literals with
          // strings. Every action here is prefixed with "ExampleDataService:".
          serviceMessenger.call(actionType, ...params),
        subscribe: (eventType, handler) => {
          const wrappedHandler: DataServiceGranularCacheUpdatedHandler = (
            payload,
          ) => handler(roundTrip(payload));
          wrappedHandlers.set(handler, wrappedHandler);
          serviceMessenger.subscribe(eventType, wrappedHandler);
        },
        unsubscribe: (eventType, handler) => {
          const wrappedHandler = wrappedHandlers.get(handler);
          assert(wrappedHandler);
          wrappedHandlers.delete(handler);
          serviceMessenger.unsubscribe(eventType, wrappedHandler);
        },
      });

      return { service, client, messenger: serviceMessenger };
    }

    /**
     * Build an `updated` payload for the `getAssets` query, as a data service
     * would publish it.
     *
     * @param state - The parts of the query state to set.
     * @returns The payload.
     */
    function buildQueryPayload(
      state: Partial<DataServiceQueryState>,
    ): DataServiceGranularCacheUpdatedPayload {
      return {
        type: 'updated',
        objectType: 'query',
        state: {
          mutations: [],
          queries: [
            {
              queryKey: getAssetsQueryKey,
              queryHash,
              dehydratedAt: Date.now(),
              state: {
                data: undefined,
                dataUpdateCount: 0,
                dataUpdatedAt: 0,
                error: null,
                errorUpdateCount: 0,
                errorUpdatedAt: 0,
                fetchFailureCount: 0,
                fetchFailureReason: null,
                fetchMeta: null,
                isInvalidated: false,
                status: 'pending',
                fetchStatus: 'idle',
                ...state,
              },
            },
          ],
        },
      };
    }

    /**
     * Subscribe an observer and wait until it has data and is idle.
     *
     * @param observer - The observer.
     * @returns The fetch statuses the observer reports from then on.
     */
    async function subscribeUntilSettled(
      observer: Pick<QueryObserver, 'subscribe'>,
    ): Promise<string[]> {
      const fetchStatuses: string[] = [];
      let settled = false;
      await new Promise<void>((resolve) => {
        observer.subscribe((result) => {
          if (settled) {
            fetchStatuses.push(result.fetchStatus);
          } else if (
            result.status === 'success' &&
            result.fetchStatus === 'idle'
          ) {
            settled = true;
            resolve();
          }
        });
      });
      return fetchStatuses;
    }

    it('shows a background fetch as fetching', async () => {
      const { client, service } = createRoundTripClient();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
      });
      const fetchStatuses = await subscribeUntilSettled(observer);

      mockAssets({ status: 200, body: [] });
      await service.invalidateQueries({
        queryKey: serviceQueryKey,
        refetchType: 'all',
      });

      // The observer can report several results in a row with the same fetch
      // status (for example new data arriving while still fetching), so only
      // look at the transitions.
      await vi.waitFor(() =>
        expect(
          fetchStatuses.filter(
            (fetchStatus, index) => fetchStatus !== fetchStatuses[index - 1],
          ),
        ).toStrictEqual(['fetching', 'idle']),
      );
      expect(observer.getCurrentResult().data).toStrictEqual([]);

      observer.destroy();
      service.destroy();
    });

    it('applies a background error after a success', async () => {
      const { client, messenger, service } = createRoundTripClient();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
      });
      await subscribeUntilSettled(observer);
      const uiQuery = client.getQueryCache().get(queryHash);
      assert(uiQuery);
      const { data, dataUpdatedAt } = uiQuery.state;
      const errorUpdatedAt = Date.now();

      messenger.publish(
        cacheUpdatedEvent,
        buildQueryPayload({
          data,
          dataUpdatedAt,
          status: 'error',
          error: { name: 'Error', message: 'boom' },
          errorUpdatedAt,
        }),
      );

      expect(uiQuery.state.status).toBe('error');
      expect(uiQuery.state.error).toBeInstanceOf(Error);
      expect(uiQuery.state.error?.message).toBe('boom');
      expect(uiQuery.state.errorUpdatedAt).toBe(errorUpdatedAt);
      expect(uiQuery.state.data).toBe(data);
      expect(observer.getCurrentResult().error?.message).toBe('boom');

      observer.destroy();
      service.destroy();
    });

    it('applies an error from a failed background refetch', async () => {
      const { client, service } = createRoundTripClient();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
      });
      await subscribeUntilSettled(observer);
      const { data } = observer.getCurrentResult();

      mockAssets({ status: 500 });
      mockAssets({ status: 500 });
      mockAssets({ status: 500 });
      await service.invalidateQueries({
        queryKey: serviceQueryKey,
        refetchType: 'all',
      });

      await vi.waitFor(() =>
        expect(observer.getCurrentResult()).toMatchObject({
          status: 'error',
          fetchStatus: 'idle',
        }),
      );
      expect(observer.getCurrentResult().error?.message).toBe(
        'Query failed with status code: 500.',
      );
      expect(observer.getCurrentResult().data).toBe(data);

      observer.destroy();
      service.destroy();
    });

    it('does not override a UI fetch in flight', async () => {
      const { client, messenger, service } = createRoundTripClient();
      const { promise, resolve } = createDeferredPromise<string[]>();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
        queryFn: async (): Promise<string[]> => promise,
      });
      observer.subscribe(() => undefined);
      const uiQuery = client.getQueryCache().get(queryHash);
      assert(uiQuery);
      expect(uiQuery.state.fetchStatus).toBe('fetching');

      messenger.publish(
        cacheUpdatedEvent,
        buildQueryPayload({
          status: 'error',
          error: { name: 'Error', message: 'boom' },
          errorUpdatedAt: Date.now(),
        }),
      );

      expect(uiQuery.state.fetchStatus).toBe('fetching');
      expect(uiQuery.state.status).toBe('pending');
      expect(uiQuery.state.error).toBeNull();

      resolve(['data']);
      await vi.waitFor(() =>
        expect(uiQuery.state).toMatchObject({
          status: 'success',
          fetchStatus: 'idle',
          data: ['data'],
        }),
      );

      observer.destroy();
      service.destroy();
    });

    it('resets a query to idle when its last observer leaves mid fetch', async () => {
      const { client, messenger, service } = createRoundTripClient();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
      });
      await subscribeUntilSettled(observer);
      const uiQuery = client.getQueryCache().get(queryHash);
      assert(uiQuery);

      messenger.publish(
        cacheUpdatedEvent,
        buildQueryPayload({
          data: uiQuery.state.data,
          dataUpdatedAt: uiQuery.state.dataUpdatedAt,
          status: 'success',
          fetchStatus: 'fetching',
        }),
      );
      expect(uiQuery.state.fetchStatus).toBe('fetching');
      expect(uiQuery.promise).toBeUndefined();

      observer.destroy();

      expect(uiQuery.state.fetchStatus).toBe('idle');
      service.destroy();
    });

    it('keeps a UI fetch going when its last observer leaves mid fetch', async () => {
      const { client, service } = createRoundTripClient();
      const { promise, resolve } = createDeferredPromise<string[]>();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
        queryFn: async (): Promise<string[]> => promise,
      });
      observer.subscribe(() => undefined);
      const uiQuery = client.getQueryCache().get(queryHash);
      assert(uiQuery);

      observer.destroy();

      expect(uiQuery.state.fetchStatus).toBe('fetching');

      resolve(['data']);
      await vi.waitFor(() => expect(uiQuery.state.fetchStatus).toBe('idle'));
      expect(uiQuery.promise).toBeUndefined();
      service.destroy();
    });

    it('resets a query to idle when the service removes it mid fetch', async () => {
      const { client, messenger, service } = createRoundTripClient();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
      });
      await subscribeUntilSettled(observer);
      const uiQuery = client.getQueryCache().get(queryHash);
      assert(uiQuery);

      messenger.publish(
        cacheUpdatedEvent,
        buildQueryPayload({
          data: uiQuery.state.data,
          dataUpdatedAt: uiQuery.state.dataUpdatedAt,
          status: 'success',
          fetchStatus: 'fetching',
        }),
      );
      expect(uiQuery.state.fetchStatus).toBe('fetching');

      messenger.publish(cacheUpdatedEvent, {
        type: 'removed',
        objectType: 'query',
        state: null,
      });

      expect(uiQuery.state.fetchStatus).toBe('idle');
      expect(uiQuery.state.status).toBe('success');

      observer.destroy();
      service.destroy();
    });

    it('ignores a removed event for a query the UI no longer has', async () => {
      const { client, messenger, service } = createRoundTripClient();
      const observer = new QueryObserver(client, {
        queryKey: getAssetsQueryKey,
      });
      await subscribeUntilSettled(observer);
      client.removeQueries({ queryKey: getAssetsQueryKey });

      messenger.publish(cacheUpdatedEvent, {
        type: 'removed',
        objectType: 'query',
        state: null,
      });

      expect(client.getQueryCache().get(queryHash)).toBeUndefined();

      observer.destroy();
      service.destroy();
    });
  });
});
