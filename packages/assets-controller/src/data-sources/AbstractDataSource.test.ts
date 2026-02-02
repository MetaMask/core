import type {
  ActiveSubscription,
  DataSourceState,
  SubscriptionRequest,
} from './AbstractDataSource';
import { AbstractDataSource } from './AbstractDataSource';
import type { ChainId } from '../types';

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const CHAIN_ARBITRUM = 'eip155:42161' as ChainId;

class TestDataSource extends AbstractDataSource<'TestDataSource'> {
  constructor(initialState?: Partial<DataSourceState>) {
    super('TestDataSource', {
      activeChains: [],
      ...initialState,
    });
  }

  testUpdateActiveChains(
    chains: ChainId[],
    publishEvent: (chains: ChainId[]) => void,
  ): void {
    this.updateActiveChains(chains, publishEvent);
  }

  testAddActiveChain(
    chainId: ChainId,
    publishEvent: (chains: ChainId[]) => void,
  ): void {
    this.addActiveChain(chainId, publishEvent);
  }

  testRemoveActiveChain(
    chainId: ChainId,
    publishEvent: (chains: ChainId[]) => void,
  ): void {
    this.removeActiveChain(chainId, publishEvent);
  }

  getState(): DataSourceState {
    return this.state;
  }

  getSubscriptions(): Map<string, ActiveSubscription> {
    return this.activeSubscriptions;
  }

  addTestSubscription(id: string, subscription: ActiveSubscription): void {
    this.activeSubscriptions.set(id, subscription);
  }

  async subscribe(_request: SubscriptionRequest): Promise<void> {
    // noop
  }
}

type MockSubscription = {
  id: string;
  chains: ChainId[];
  cleanup: jest.Mock;
};

type WithDataSourceOptions = {
  initialChains?: ChainId[];
  subscriptions?: MockSubscription[];
};

type WithDataSourceParams = {
  dataSource: TestDataSource;
  publishEvent: jest.Mock;
};

function setupDataSource(
  options: WithDataSourceOptions = {},
): WithDataSourceParams {
  const { initialChains = [], subscriptions = [] } = options;

  const dataSource = new TestDataSource({ activeChains: initialChains });
  const publishEvent = jest.fn();

  for (const sub of subscriptions) {
    dataSource.addTestSubscription(sub.id, {
      cleanup: sub.cleanup,
      chains: sub.chains,
    });
  }

  return { dataSource, publishEvent };
}

function createMockSubscription(
  id: string,
  chains: ChainId[] = [CHAIN_MAINNET],
): MockSubscription {
  return { id, chains, cleanup: jest.fn() };
}

describe('AbstractDataSource', () => {
  it('initializes with provided name and state', () => {
    const { dataSource } = setupDataSource({ initialChains: [CHAIN_MAINNET] });

    expect(dataSource.getName()).toBe('TestDataSource');
    expect(dataSource.getState().activeChains).toStrictEqual([CHAIN_MAINNET]);
  });

  it('initializes with empty chains and subscriptions by default', () => {
    const { dataSource } = setupDataSource();

    expect(dataSource.getState().activeChains).toStrictEqual([]);
    expect(dataSource.getSubscriptions().size).toBe(0);
  });

  it.each([
    { chains: [], expected: [] },
    { chains: [CHAIN_MAINNET], expected: [CHAIN_MAINNET] },
    {
      chains: [CHAIN_MAINNET, CHAIN_POLYGON],
      expected: [CHAIN_MAINNET, CHAIN_POLYGON],
    },
  ])(
    'getActiveChains returns $expected when initialized with $chains',
    async ({ chains, expected }) => {
      const { dataSource } = setupDataSource({ initialChains: chains });

      const result = await dataSource.getActiveChains();

      expect(result).toStrictEqual(expected);
    },
  );

  it('unsubscribe calls cleanup and removes subscription', async () => {
    const sub = createMockSubscription('sub-1');
    const { dataSource } = setupDataSource({ subscriptions: [sub] });

    expect(dataSource.getSubscriptions().has('sub-1')).toBe(true);

    await dataSource.unsubscribe('sub-1');

    expect(sub.cleanup).toHaveBeenCalledTimes(1);
    expect(dataSource.getSubscriptions().has('sub-1')).toBe(false);
  });

  it('unsubscribe does nothing for non-existent subscription', async () => {
    const { dataSource } = setupDataSource();

    const result = await dataSource.unsubscribe('non-existent');

    expect(result).toBeUndefined();
  });

  it('unsubscribe handles multiple subscriptions independently', async () => {
    const sub1 = createMockSubscription('sub-1', [CHAIN_MAINNET]);
    const sub2 = createMockSubscription('sub-2', [CHAIN_POLYGON]);
    const { dataSource } = setupDataSource({ subscriptions: [sub1, sub2] });

    await dataSource.unsubscribe('sub-1');

    expect(sub1.cleanup).toHaveBeenCalledTimes(1);
    expect(sub2.cleanup).not.toHaveBeenCalled();
    expect(dataSource.getSubscriptions().has('sub-2')).toBe(true);
  });

  it.each([
    { initial: [], update: [CHAIN_MAINNET], name: 'adding from empty' },
    {
      initial: [CHAIN_MAINNET],
      update: [CHAIN_MAINNET, CHAIN_POLYGON],
      name: 'adding a chain',
    },
    {
      initial: [CHAIN_MAINNET, CHAIN_POLYGON],
      update: [CHAIN_MAINNET],
      name: 'removing a chain',
    },
    { initial: [CHAIN_MAINNET], update: [CHAIN_POLYGON], name: 'replacing' },
  ])('updateActiveChains publishes event when $name', ({ initial, update }) => {
    const { dataSource, publishEvent } = setupDataSource({
      initialChains: initial,
    });

    dataSource.testUpdateActiveChains(update, publishEvent);

    expect(dataSource.getState().activeChains).toStrictEqual(update);
    expect(publishEvent).toHaveBeenCalledWith(update);
  });

  it('updateActiveChains does not publish event when chains are identical', () => {
    const { dataSource, publishEvent } = setupDataSource({
      initialChains: [CHAIN_MAINNET, CHAIN_POLYGON],
    });

    dataSource.testUpdateActiveChains(
      [CHAIN_MAINNET, CHAIN_POLYGON],
      publishEvent,
    );

    expect(publishEvent).not.toHaveBeenCalled();
  });

  it.each([
    { initial: [], chainToAdd: CHAIN_MAINNET, expected: [CHAIN_MAINNET] },
    {
      initial: [CHAIN_MAINNET],
      chainToAdd: CHAIN_POLYGON,
      expected: [CHAIN_MAINNET, CHAIN_POLYGON],
    },
  ])(
    'addActiveChain adds chain and publishes event',
    ({ initial, chainToAdd, expected }) => {
      const { dataSource, publishEvent } = setupDataSource({
        initialChains: initial,
      });

      dataSource.testAddActiveChain(chainToAdd, publishEvent);

      expect(dataSource.getState().activeChains).toStrictEqual(expected);
      expect(publishEvent).toHaveBeenCalledWith(expected);
    },
  );

  it('addActiveChain does not add duplicate chain', () => {
    const { dataSource, publishEvent } = setupDataSource({
      initialChains: [CHAIN_MAINNET],
    });

    dataSource.testAddActiveChain(CHAIN_MAINNET, publishEvent);

    expect(dataSource.getState().activeChains).toStrictEqual([CHAIN_MAINNET]);
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it.each([
    {
      initial: [CHAIN_MAINNET, CHAIN_POLYGON],
      chainToRemove: CHAIN_MAINNET,
      expected: [CHAIN_POLYGON],
    },
    { initial: [CHAIN_MAINNET], chainToRemove: CHAIN_MAINNET, expected: [] },
  ])(
    'removeActiveChain removes chain and publishes event',
    ({ initial, chainToRemove, expected }) => {
      const { dataSource, publishEvent } = setupDataSource({
        initialChains: initial,
      });

      dataSource.testRemoveActiveChain(chainToRemove, publishEvent);

      expect(dataSource.getState().activeChains).toStrictEqual(expected);
      expect(publishEvent).toHaveBeenCalledWith(expected);
    },
  );

  it('removeActiveChain does nothing when chain not in list', () => {
    const { dataSource, publishEvent } = setupDataSource({
      initialChains: [CHAIN_MAINNET],
    });

    dataSource.testRemoveActiveChain(CHAIN_POLYGON, publishEvent);

    expect(dataSource.getState().activeChains).toStrictEqual([CHAIN_MAINNET]);
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('destroy calls cleanup for all subscriptions and clears map', () => {
    const sub1 = createMockSubscription('sub-1', [CHAIN_MAINNET]);
    const sub2 = createMockSubscription('sub-2', [CHAIN_POLYGON]);
    const sub3 = createMockSubscription('sub-3', [CHAIN_ARBITRUM]);
    const { dataSource } = setupDataSource({
      subscriptions: [sub1, sub2, sub3],
    });

    dataSource.destroy();

    expect(sub1.cleanup).toHaveBeenCalledTimes(1);
    expect(sub2.cleanup).toHaveBeenCalledTimes(1);
    expect(sub3.cleanup).toHaveBeenCalledTimes(1);
    expect(dataSource.getSubscriptions().size).toBe(0);
  });

  it('destroy handles empty subscriptions without throwing', () => {
    const { dataSource } = setupDataSource();

    expect(() => dataSource.destroy()).not.toThrow();
  });

  it('destroy can be called multiple times safely', () => {
    const sub = createMockSubscription('sub-1');
    const { dataSource } = setupDataSource({ subscriptions: [sub] });

    dataSource.destroy();
    dataSource.destroy();

    expect(sub.cleanup).toHaveBeenCalledTimes(1);
  });
});
