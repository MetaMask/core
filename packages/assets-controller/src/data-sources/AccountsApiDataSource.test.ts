/* eslint-disable jest/unbound-method */
import type { V5BalanceItem } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import type {
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceAllowedActions,
} from './AccountsApiDataSource';
import {
  AccountsApiDataSource,
  filterResponseToKnownAssets,
} from './AccountsApiDataSource';
import type {
  ChainId,
  DataRequest,
  Context,
  AssetsControllerStateInternal,
} from '../types';

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

  describe('tokenDetectionEnabled', () => {
    async function setupControllerWithDetection(
      options: {
        supportedChains?: number[];
        balances?: V5BalanceItem[];
        unprocessedNetworks?: string[];
        tokenDetectionEnabled?: boolean;
      } = {},
    ): Promise<SetupResult> {
      const {
        supportedChains = [1, 137],
        balances = [],
        unprocessedNetworks = [],
        tokenDetectionEnabled,
      } = options;

      const rootMessenger = new Messenger<
        MockAnyNamespace,
        AllActions,
        AllEvents
      >({
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

      const controllerOptions: AccountsApiDataSourceOptions = {
        queryApiClient:
          apiClient as unknown as AccountsApiDataSourceOptions['queryApiClient'],
        onActiveChainsUpdated: (dataSourceName, chains, previousChains): void =>
          activeChainsUpdateHandler(dataSourceName, chains, previousChains),
      };

      if (tokenDetectionEnabled !== undefined) {
        controllerOptions.tokenDetectionEnabled = tokenDetectionEnabled;
      }

      const controller = new AccountsApiDataSource(controllerOptions);

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

    const KNOWN_ASSET =
      'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const UNKNOWN_ASSET =
      'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7';
    const ACCOUNT_ID = 'mock-account-id';

    it('includes all tokens when tokenDetectionEnabled is true (default)', async () => {
      const { controller, assetsUpdateHandler } =
        await setupControllerWithDetection({
          balances: [
            createMockBalanceItem(
              `eip155:1:${MOCK_ADDRESS}`,
              KNOWN_ASSET,
              '1000',
            ),
            createMockBalanceItem(
              `eip155:1:${MOCK_ADDRESS}`,
              UNKNOWN_ASSET,
              '2000',
            ),
          ],
        });

      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
        getAssetsState: () => ({
          assetsInfo: {},
          assetsBalance: {
            [ACCOUNT_ID]: {
              [KNOWN_ASSET]: { amount: '500' },
            },
          },
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
        }),
      });

      expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);
      const response = assetsUpdateHandler.mock.calls[0][0];
      // Both tokens should be included
      expect(
        Object.keys(response.assetsBalance?.[ACCOUNT_ID] ?? {}),
      ).toHaveLength(2);

      controller.destroy();
    });

    it('filters out unknown tokens when tokenDetectionEnabled is false', async () => {
      const { controller, assetsUpdateHandler } =
        await setupControllerWithDetection({
          tokenDetectionEnabled: false,
          balances: [
            createMockBalanceItem(
              `eip155:1:${MOCK_ADDRESS}`,
              KNOWN_ASSET,
              '1000',
            ),
            createMockBalanceItem(
              `eip155:1:${MOCK_ADDRESS}`,
              UNKNOWN_ASSET,
              '2000',
            ),
          ],
        });

      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
        getAssetsState: () => ({
          assetsInfo: {},
          assetsBalance: {
            [ACCOUNT_ID]: {
              [KNOWN_ASSET]: { amount: '500' },
            },
          },
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
        }),
      });

      expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);
      const response = assetsUpdateHandler.mock.calls[0][0];
      // Only the known token should be included
      const accountBalances = response.assetsBalance?.[ACCOUNT_ID] ?? {};
      expect(Object.keys(accountBalances)).toHaveLength(1);
      expect(accountBalances[KNOWN_ASSET]).toStrictEqual({ amount: '1000' });
      expect(accountBalances[UNKNOWN_ASSET]).toBeUndefined();

      controller.destroy();
    });

    it('returns empty balance when no tokens are known and tokenDetectionEnabled is false', async () => {
      const { controller, assetsUpdateHandler } =
        await setupControllerWithDetection({
          tokenDetectionEnabled: false,
          balances: [
            createMockBalanceItem(
              `eip155:1:${MOCK_ADDRESS}`,
              UNKNOWN_ASSET,
              '2000',
            ),
          ],
        });

      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
        getAssetsState: () => ({
          assetsInfo: {},
          assetsBalance: {},
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
        }),
      });

      expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);
      const response = assetsUpdateHandler.mock.calls[0][0];
      // No balances should be returned
      expect(response.assetsBalance).toBeUndefined();

      controller.destroy();
    });

    it('filters unknown tokens in middleware when tokenDetectionEnabled is false', async () => {
      const { controller } = await setupControllerWithDetection({
        tokenDetectionEnabled: false,
        balances: [
          createMockBalanceItem(
            `eip155:1:${MOCK_ADDRESS}`,
            KNOWN_ASSET,
            '1000',
          ),
          createMockBalanceItem(
            `eip155:1:${MOCK_ADDRESS}`,
            UNKNOWN_ASSET,
            '2000',
          ),
        ],
      });

      // Set up state accessor via subscribe (middleware uses the stored getAssetsState)
      await controller.subscribe({
        subscriptionId: 'sub-setup',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: jest.fn(),
        getAssetsState: () => ({
          assetsInfo: {},
          assetsBalance: {
            [ACCOUNT_ID]: {
              [KNOWN_ASSET]: { amount: '500' },
            },
          },
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
        }),
      });

      const middleware = controller.assetsMiddleware;
      const context = createMiddlewareContext();
      const nextFn = jest.fn();

      await middleware(context, nextFn);

      // Verify only known asset is in the response
      const accountBalances =
        context.response.assetsBalance?.[ACCOUNT_ID] ?? {};
      expect(accountBalances[KNOWN_ASSET as never]).toStrictEqual({
        amount: '1000',
      });
      expect(accountBalances[UNKNOWN_ASSET as never]).toBeUndefined();

      controller.destroy();
    });

    it('middleware does not remove chains when tokenDetectionEnabled is false and filter removes all balance data (bootstrap for RPC)', async () => {
      const { controller } = await setupControllerWithDetection({
        tokenDetectionEnabled: false,
        supportedChains: [1, 137],
        balances: [
          createMockBalanceItem(
            `eip155:1:${MOCK_ADDRESS}`,
            'eip155:1/slip44:60',
            '1000000000000000000',
          ),
        ],
      });

      // Simulate new account: subscribe with empty state so #getAssetsState is set.
      // Filter will then remove all API balance data (no assets in state).
      await controller.subscribe({
        subscriptionId: 'sub-setup',
        request: createDataRequest({
          chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
        }),
        isUpdate: false,
        onAssetsUpdate: jest.fn(),
        getAssetsState: () => ({
          assetsInfo: {},
          assetsBalance: {},
          assetsPrice: {},
          customAssets: {},
          assetPreferences: {},
        }),
      });

      const nextFn = jest.fn().mockResolvedValue(undefined);
      const context = createMiddlewareContext({
        request: createDataRequest({
          chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
        }),
      });

      await controller.assetsMiddleware(context, nextFn);

      // All chains must still be passed to next middleware so RPC can fetch native balances
      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
          }),
        }),
      );

      controller.destroy();
    });
  });
});

// =============================================================================
// filterResponseToKnownAssets — standalone unit tests
// =============================================================================

describe('filterResponseToKnownAssets', () => {
  const ACCOUNT_A = 'account-a';
  const ACCOUNT_B = 'account-b';
  const ASSET_1 = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const ASSET_2 = 'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7';
  const ASSET_3 = 'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F';

  function buildState(
    balances: Record<string, Record<string, { amount: string }>>,
  ): AssetsControllerStateInternal {
    return {
      assetsInfo: {},
      assetsBalance: balances,
      assetsPrice: {},
      customAssets: {},
      assetPreferences: {},
    };
  }

  it('returns response unchanged when assetsBalance is undefined', () => {
    const response = { errors: { 'eip155:1': 'fail' } };
    const state = buildState({});

    expect(filterResponseToKnownAssets(response, state)).toStrictEqual(
      response,
    );
  });

  it('keeps only assets that exist in state', () => {
    const response = {
      assetsBalance: {
        [ACCOUNT_A]: {
          [ASSET_1]: { amount: '100' },
          [ASSET_2]: { amount: '200' },
        },
      },
    };
    const state = buildState({
      [ACCOUNT_A]: { [ASSET_1]: { amount: '50' } },
    });

    const result = filterResponseToKnownAssets(response, state);

    expect(result.assetsBalance?.[ACCOUNT_A]).toStrictEqual({
      [ASSET_1]: { amount: '100' },
    });
    expect(
      result.assetsBalance?.[ACCOUNT_A]?.[ASSET_2 as never],
    ).toBeUndefined();
  });

  it('drops accounts that have no balances in state', () => {
    const response = {
      assetsBalance: {
        [ACCOUNT_A]: { [ASSET_1]: { amount: '100' } },
        [ACCOUNT_B]: { [ASSET_2]: { amount: '200' } },
      },
    };
    const state = buildState({
      [ACCOUNT_A]: { [ASSET_1]: { amount: '10' } },
      // ACCOUNT_B not in state
    });

    const result = filterResponseToKnownAssets(response, state);

    expect(result.assetsBalance?.[ACCOUNT_A]).toBeDefined();
    expect(result.assetsBalance?.[ACCOUNT_B]).toBeUndefined();
  });

  it('returns undefined assetsBalance when all assets are filtered out', () => {
    const response = {
      assetsBalance: {
        [ACCOUNT_A]: { [ASSET_1]: { amount: '100' } },
      },
    };
    const state = buildState({
      [ACCOUNT_A]: { [ASSET_3]: { amount: '10' } },
    });

    const result = filterResponseToKnownAssets(response, state);

    expect(result.assetsBalance).toBeUndefined();
  });

  it('preserves other response fields (errors, etc.)', () => {
    const response = {
      assetsBalance: {
        [ACCOUNT_A]: { [ASSET_1]: { amount: '100' } },
      },
      errors: { 'eip155:137': 'Unprocessed by Accounts API' },
    };
    const state = buildState({
      [ACCOUNT_A]: { [ASSET_1]: { amount: '50' } },
    });

    const result = filterResponseToKnownAssets(response, state);

    expect(result.errors).toStrictEqual({
      'eip155:137': 'Unprocessed by Accounts API',
    });
    expect(result.assetsBalance?.[ACCOUNT_A]).toStrictEqual({
      [ASSET_1]: { amount: '100' },
    });
  });

  it('handles multiple accounts with mixed known/unknown assets', () => {
    const response = {
      assetsBalance: {
        [ACCOUNT_A]: {
          [ASSET_1]: { amount: '100' },
          [ASSET_2]: { amount: '200' },
        },
        [ACCOUNT_B]: {
          [ASSET_2]: { amount: '300' },
          [ASSET_3]: { amount: '400' },
        },
      },
    };
    const state = buildState({
      [ACCOUNT_A]: { [ASSET_2]: { amount: '10' } },
      [ACCOUNT_B]: { [ASSET_3]: { amount: '20' } },
    });

    const result = filterResponseToKnownAssets(response, state);

    expect(result.assetsBalance?.[ACCOUNT_A]).toStrictEqual({
      [ASSET_2]: { amount: '200' },
    });
    expect(result.assetsBalance?.[ACCOUNT_B]).toStrictEqual({
      [ASSET_3]: { amount: '400' },
    });
  });
});
