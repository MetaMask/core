/* eslint-disable jest/unbound-method */
import type { V5BalanceItem } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import type {
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceAllowedActions,
} from './AccountsApiDataSource';
import { AccountsApiDataSource } from './AccountsApiDataSource';
import type { ChainId, DataRequest, Context } from '../types';

type AllActions = AccountsApiDataSourceAllowedActions;
type AllEvents = never;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const CHAIN_ARBITRUM = 'eip155:42161' as ChainId;
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';

type MockApiClient = {
  accounts: {
    fetchV2SupportedNetworks: jest.Mock;
    fetchV5MultiAccountBalances: jest.Mock;
  };
};

function createMockAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: 'mock-account-id',
    address: MOCK_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

function createMockApiClient(
  supportedChains: number[] = [1, 137],
  balances: V5BalanceItem[] = [],
  unprocessedNetworks: string[] = [],
): MockApiClient {
  return {
    accounts: {
      fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
        fullSupport: supportedChains,
        partialSupport: [],
      }),
      fetchV5MultiAccountBalances: jest.fn().mockResolvedValue({
        balances,
        unprocessedNetworks,
      }),
    },
  };
}

function createMockBalanceItem(
  accountId: string,
  assetId: string,
  balance: string,
): V5BalanceItem {
  return { accountId, assetId, balance } as V5BalanceItem;
}

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [CHAIN_MAINNET];
  const accounts = overrides?.accounts ?? [createMockAccount()];
  const { accounts: _a, ...rest } = overrides ?? {};
  return {
    chainIds,
    accountsWithSupportedChains: accounts.map((a) => ({
      account: a,
      supportedChains: chainIds,
    })),
    dataTypes: ['balance'],
    ...rest,
  };
}

function createMiddlewareContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn(),
    ...overrides,
  };
}

type SetupResult = {
  controller: AccountsApiDataSource;
  messenger: RootMessenger;
  apiClient: MockApiClient;
  assetsUpdateHandler: jest.Mock;
  activeChainsUpdateHandler: jest.Mock;
};

async function setupController(
  options: {
    supportedChains?: number[];
    balances?: V5BalanceItem[];
    unprocessedNetworks?: string[];
  } = {},
): Promise<SetupResult> {
  const {
    supportedChains = [1, 137],
    balances = [],
    unprocessedNetworks = [],
  } = options;

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const controllerMessenger = new Messenger<
    'AccountsApiDataSource',
    AllActions,
    AllEvents,
    RootMessenger
  >({
    namespace: 'AccountsApiDataSource',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: controllerMessenger,
    actions: [],
    events: [],
  });

  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = jest.fn();

  const apiClient = createMockApiClient(
    supportedChains,
    balances,
    unprocessedNetworks,
  );

  const controller = new AccountsApiDataSource({
    queryApiClient:
      apiClient as unknown as AccountsApiDataSourceOptions['queryApiClient'],
    onActiveChainsUpdated: (dataSourceName, chains, previousChains): void =>
      activeChainsUpdateHandler(dataSourceName, chains, previousChains),
  });

  // Wait for async initialization
  await new Promise(process.nextTick);

  return {
    controller,
    messenger: rootMessenger,
    apiClient,
    assetsUpdateHandler,
    activeChainsUpdateHandler,
  };
}

describe('AccountsApiDataSource', () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const activeTimers = new Set<ReturnType<typeof originalSetInterval>>();

  beforeAll(() => {
    global.setInterval = ((callback: () => void, ms: number) => {
      const timer = originalSetInterval(callback, ms);
      timer.unref();
      activeTimers.add(timer);
      return timer;
    }) as typeof global.setInterval;

    global.clearInterval = ((timer: ReturnType<typeof originalSetInterval>) => {
      activeTimers.delete(timer);
      return originalClearInterval(timer);
    }) as typeof global.clearInterval;
  });

  afterAll(() => {
    for (const timer of activeTimers) {
      originalClearInterval(timer);
    }
    activeTimers.clear();
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', async () => {
    const { controller } = await setupController();
    expect(controller.getName()).toBe('AccountsApiDataSource');
    controller.destroy();
  });

  it('fetches active chains on initialization', async () => {
    const { controller, apiClient, activeChainsUpdateHandler } =
      await setupController({ supportedChains: [1, 137, 42161] });

    expect(apiClient.accounts.fetchV2SupportedNetworks).toHaveBeenCalled();
    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [CHAIN_MAINNET, CHAIN_POLYGON, CHAIN_ARBITRUM],
      [],
    );

    controller.destroy();
  });

  it('exposes assetsMiddleware and getActiveChains on instance', async () => {
    const { controller } = await setupController();

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET, CHAIN_POLYGON]);

    controller.destroy();
  });

  it.each([
    { input: 1, expected: 'eip155:1' },
    { input: '137', expected: 'eip155:137' },
    { input: 'eip155:42161', expected: 'eip155:42161' },
  ])('converts chain ID $input to $expected', async ({ input, expected }) => {
    const { controller, activeChainsUpdateHandler } = await setupController({
      supportedChains: [input as number],
    });

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [expected],
      [],
    );

    controller.destroy();
  });

  it('fetch returns error for unsupported chain', async () => {
    const { controller } = await setupController({ supportedChains: [1] });

    const request = createDataRequest({ chainIds: [CHAIN_POLYGON] });
    const response = await controller.fetch(request);

    expect(response.errors?.[CHAIN_POLYGON]).toBe(
      'Chain not supported by Accounts API',
    );

    controller.destroy();
  });

  it('fetch calls API with correct account IDs', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(createDataRequest());

    expect(apiClient.accounts.fetchV5MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
    );

    controller.destroy();
  });

  it('fetch processes balance response', async () => {
    const balances = [
      createMockBalanceItem(
        `eip155:1:${MOCK_ADDRESS}`,
        'eip155:1/slip44:60',
        '1000000000000000000',
      ),
    ];

    const { controller } = await setupController({ balances });

    const response = await controller.fetch(createDataRequest());

    expect(response.assetsBalance?.['mock-account-id']).toHaveProperty(
      'eip155:1/slip44:60',
    );
    expect(
      response.assetsBalance?.['mock-account-id']?.['eip155:1/slip44:60']
        ?.amount,
    ).toBe('1000000000000000000');

    controller.destroy();
  });

  it('fetch marks unprocessed networks as errors', async () => {
    const { controller } = await setupController({
      unprocessedNetworks: ['eip155:1'],
    });

    const response = await controller.fetch(createDataRequest());

    expect(response.errors?.[CHAIN_MAINNET]).toBe(
      'Unprocessed by Accounts API',
    );

    controller.destroy();
  });

  it('fetch handles API errors', async () => {
    const { controller, apiClient } = await setupController();

    apiClient.accounts.fetchV5MultiAccountBalances.mockRejectedValueOnce(
      new Error('API Error'),
    );

    const response = await controller.fetch(createDataRequest());

    expect(response.errors?.[CHAIN_MAINNET]).toContain('Fetch failed');

    controller.destroy();
  });

  it('fetch skips API when no valid account-chain combinations', async () => {
    const { controller, apiClient } = await setupController();

    const account = createMockAccount({ scopes: ['eip155:137'] });
    const request = createDataRequest({
      accountsWithSupportedChains: [{ account, supportedChains: [] }],
      chainIds: [CHAIN_MAINNET],
    });

    await controller.fetch(request);

    expect(
      apiClient.accounts.fetchV5MultiAccountBalances,
    ).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('middleware passes to next when no chains requested', async () => {
    const { controller } = await setupController();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ chainIds: [] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);

    controller.destroy();
  });

  it('middleware merges balance response into context', async () => {
    const balances = [
      createMockBalanceItem(
        `eip155:1:${MOCK_ADDRESS}`,
        'eip155:1/slip44:60',
        '1000000000000000000',
      ),
    ];

    const { controller } = await setupController({ balances });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsBalance?.['mock-account-id']).toHaveProperty(
      'eip155:1/slip44:60',
    );

    controller.destroy();
  });

  it('middleware removes handled chains from next request', async () => {
    const { controller } = await setupController({ supportedChains: [1] });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          chainIds: [CHAIN_POLYGON],
        }),
      }),
    );

    controller.destroy();
  });

  it('subscribe performs initial fetch', async () => {
    const { controller, assetsUpdateHandler } = await setupController();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('subscribe does nothing when no chains', async () => {
    const { controller, assetsUpdateHandler } = await setupController();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [] }),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    controller.destroy();
  });
});
