import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';

import {
  AssetsDataService,
  getSyncAssetsQueryKey,
  normalizeAssetsFetchOptions,
  serviceName,
  type AssetsDataServiceMessenger,
} from './AssetsDataService.js';

type RootMessenger = Messenger<
  typeof MOCK_ANY_NAMESPACE,
  MessengerActions<AssetsDataServiceMessenger>,
  MessengerEvents<AssetsDataServiceMessenger>
>;

const accountId = 'account-1';

function createService(loadAssets: jest.Mock): {
  service: AssetsDataService;
  root: RootMessenger;
} {
  const root: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  const serviceMessenger: AssetsDataServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: root,
  });
  const service = new AssetsDataService({
    messenger: serviceMessenger,
    loadAssets,
  });

  return { service, root };
}

describe('AssetsDataService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('normalizes list options so equivalent fetches share a query key', () => {
    expect(
      normalizeAssetsFetchOptions({
        chainIds: ['eip155:137', 'eip155:1'],
        bypassServerCache: true,
      }),
    ).toStrictEqual({
      chainIds: ['eip155:1', 'eip155:137'],
      bypassServerCache: true,
    });

    expect(
      getSyncAssetsQueryKey(['b', 'a'], {
        chainIds: ['eip155:137', 'eip155:1'],
      }),
    ).toStrictEqual(
      getSyncAssetsQueryKey(['a', 'b'], {
        chainIds: ['eip155:1', 'eip155:137'],
      }),
    );
  });

  it('runs a fetch through the controller and publishes fetching', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    let release: (value: Record<string, never>) => void = () => undefined;
    const pending = new Promise<Record<string, never>>((resolve) => {
      release = resolve;
    });
    const loadAssets = jest.fn().mockReturnValue(pending);
    const { service, root } = createService(loadAssets);
    const statuses: string[] = [];

    root.subscribe(
      'AssetsDataService:cacheUpdated',
      (payload: {
        state: { queries: { state: { fetchStatus: string } }[] } | null;
      }) => {
        const fetchStatus = payload.state?.queries[0]?.state.fetchStatus;
        if (fetchStatus) {
          statuses.push(fetchStatus);
        }
      },
    );

    const result = service.syncAssets([accountId], {
      chainIds: ['eip155:1'],
    });

    expect(loadAssets).toHaveBeenCalledWith([accountId], {
      chainIds: ['eip155:1'],
    });
    expect(statuses).toContain('fetching');

    release({});
    await expect(result).resolves.toStrictEqual({});
    expect(statuses).toContain('idle');

    service.destroy();
  });
});
