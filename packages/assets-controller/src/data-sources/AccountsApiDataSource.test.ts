/* eslint-disable jest/unbound-method */
import type { V5BalanceItem, V6BalanceItem } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';

import { getDefaultTrackedAssetsForChain } from '../defaults.js';
import type {
  ChainId,
  Caip19AssetId,
  DataRequest,
  Context,
  AssetsControllerStateInternal,
} from '../types.js';
import type { AssetVisibility } from '../utils/assetVisibility.js';
import { getAssetVisibility } from '../utils/assetVisibility.js';
import { ZERO_ADDRESS } from '../utils/constants.js';
import { NATIVE_ASSETS } from '../utils/native-assets.js';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
} from '../utils/snaps-assets-migration.js';
import type {
  AccountsApiDataSourceOptions,
  AccountsApiDataSourceAllowedActions,
  AccountsApiDataSourceAllowedEvents,
} from './AccountsApiDataSource.js';
import {
  AccountsApiDataSource,
  filterResponseToKnownAssets,
} from './AccountsApiDataSource.js';

type AllActions = AccountsApiDataSourceAllowedActions;
type AllEvents = AccountsApiDataSourceAllowedEvents;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const CHAIN_ARBITRUM = 'eip155:42161' as ChainId;
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const [MAINNET_MUSD] = getDefaultTrackedAssetsForChain(CHAIN_MAINNET);
const MAINNET_NATIVE = 'eip155:1/slip44:60' as Caip19AssetId;
const POLYGON_NATIVE = 'eip155:137/slip44:966' as Caip19AssetId;

function getNativeAssetForChain(chainId: ChainId): Caip19AssetId {
  return NATIVE_ASSETS[chainId] ?? `${chainId}/erc20:${ZERO_ADDRESS}`;
}

function isBalanceV6EnabledFromFlags(
  remoteFeatureFlags: Record<string, unknown>,
): boolean {
  return remoteFeatureFlags.assetsAccountsApiV6 === true;
}

type MockApiClient = {
  accounts: {
    fetchV2SupportedNetworks: jest.Mock;
    fetchV5MultiAccountBalances: jest.Mock;
    fetchV6MultiAccountBalances: jest.Mock;
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
  supportedChains: (number | string)[] = [1, 137],
  balances: V5BalanceItem[] = [],
  unprocessedNetworks: string[] = [],
  v6Balances: V6BalanceItem[] = [],
  unprocessedIncludeAssetIds: string[] = [],
  partialSupport: (number | string)[] = [],
): MockApiClient {
  return {
    accounts: {
      fetchV2SupportedNetworks: jest.fn().mockResolvedValue({
        fullSupport: supportedChains,
        partialSupport,
      }),
      fetchV5MultiAccountBalances: jest.fn().mockResolvedValue({
        balances,
        unprocessedNetworks,
      }),
      fetchV6MultiAccountBalances: jest.fn().mockResolvedValue({
        balances: v6Balances,
        unprocessedNetworks,
        unprocessedIncludeAssetIds,
      }),
    },
  };
}

function createMockV6BalanceItem(
  accountId: string,
  assetId: string,
  balance: string,
  object: 'token' | 'defi' = 'token',
  type: string = 'erc20',
  metadata?: V6BalanceItem['metadata'],
): V6BalanceItem {
  return {
    accountId,
    object,
    type,
    assetId,
    balance,
    ...(metadata ? { metadata } : {}),
  } as V6BalanceItem;
}

function createMockBalanceItem(
  accountId: string,
  assetId: string,
  balance: string,
  metadata?: V5BalanceItem['metadata'],
): V5BalanceItem {
  return {
    accountId,
    assetId,
    balance,
    ...(metadata ? { metadata } : {}),
  } as V5BalanceItem;
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

function createAssetsState(
  overrides: Partial<AssetsControllerStateInternal> = {},
): AssetsControllerStateInternal {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
    selectedCurrency: 'usd',
    ...overrides,
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
    supportedChains?: (number | string)[];
    partialSupport?: (number | string)[];
    balances?: V5BalanceItem[];
    unprocessedNetworks?: string[];
    unprocessedIncludeAssetIds?: string[];
    fetchTimeoutMs?: number;
    v6Balances?: V6BalanceItem[];
    remoteFeatureFlags?: Record<string, unknown>;
    getAssetsState?: () => AssetsControllerStateInternal;
    tokenDetectionEnabled?: () => boolean;
  } = {},
): Promise<SetupResult> {
  const {
    supportedChains = [1, 137],
    partialSupport = [],
    balances = [],
    unprocessedNetworks = [],
    unprocessedIncludeAssetIds = [],
    fetchTimeoutMs,
    v6Balances = [],
    remoteFeatureFlags = {},
    getAssetsState = (): AssetsControllerStateInternal => createAssetsState(),
    tokenDetectionEnabled,
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

  (
    rootMessenger as unknown as {
      registerActionHandler: (a: string, h: () => unknown) => void;
    }
  ).registerActionHandler('RemoteFeatureFlagController:getState', () => ({
    remoteFeatureFlags,
    cacheTimestamp: 0,
  }));

  rootMessenger.delegate({
    messenger: controllerMessenger,
    actions: ['RemoteFeatureFlagController:getState'],

    events: ['RemoteFeatureFlagController:stateChange'],
  });

  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = jest.fn();

  const apiClient = createMockApiClient(
    supportedChains,
    balances,
    unprocessedNetworks,
    v6Balances,
    unprocessedIncludeAssetIds,
    partialSupport,
  );

  const controller = new AccountsApiDataSource({
    messenger:
      controllerMessenger as unknown as AccountsApiDataSourceOptions['messenger'],
    queryApiClient:
      apiClient as unknown as AccountsApiDataSourceOptions['queryApiClient'],
    onActiveChainsUpdated: (dataSourceName, chains, previousChains): void =>
      activeChainsUpdateHandler(dataSourceName, chains, previousChains),
    isBalanceV6Enabled: (): boolean =>
      isBalanceV6EnabledFromFlags(remoteFeatureFlags),
    getAssetsState,
    getAssetVisibility: (accountIds, chainIds): AssetVisibility =>
      getAssetVisibility({
        state: getAssetsState(),
        accountIds,
        chainIds,
        getNativeAssetForChain,
      }),
    ...(fetchTimeoutMs === undefined ? {} : { fetchTimeoutMs }),
    ...(tokenDetectionEnabled === undefined ? {} : { tokenDetectionEnabled }),
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

  it('refreshActiveChains re-fetches supported networks and updates activeChains', async () => {
    const { controller, apiClient, activeChainsUpdateHandler } =
      await setupController({ supportedChains: [1] });

    activeChainsUpdateHandler.mockClear();
    apiClient.accounts.fetchV2SupportedNetworks.mockClear();
    apiClient.accounts.fetchV2SupportedNetworks.mockResolvedValue({
      fullSupport: ['eip155:1', 'eip155:137'],
      partialSupport: [],
    });

    await controller.refreshActiveChains();

    expect(apiClient.accounts.fetchV2SupportedNetworks).toHaveBeenCalledTimes(
      1,
    );
    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [CHAIN_MAINNET, CHAIN_POLYGON],
      [CHAIN_MAINNET],
    );
    expect(await controller.getActiveChains()).toStrictEqual([
      CHAIN_MAINNET,
      CHAIN_POLYGON,
    ]);

    controller.destroy();
  });

  describe('RemoteFeatureFlagController:stateChange subscription', () => {
    it('refreshes active chains when a migration stage changes', async () => {
      const { controller, apiClient, messenger } = await setupController({
        remoteFeatureFlags: {},
      });

      apiClient.accounts.fetchV2SupportedNetworks.mockClear();

      messenger.publish(
        'RemoteFeatureFlagController:stateChange',
        {
          remoteFeatureFlags: {
            [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
              stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
            },
          },
          cacheTimestamp: 0,
        },
        [],
      );

      await new Promise(process.nextTick);

      expect(apiClient.accounts.fetchV2SupportedNetworks).toHaveBeenCalledTimes(
        1,
      );

      controller.destroy();
    });

    it('does not refresh active chains when an unrelated flag changes', async () => {
      const { controller, apiClient, messenger } = await setupController({
        remoteFeatureFlags: {},
      });

      // Establish the baseline migration-stage signature.
      messenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { remoteFeatureFlags: {}, cacheTimestamp: 0 },
        [],
      );
      await new Promise(process.nextTick);
      apiClient.accounts.fetchV2SupportedNetworks.mockClear();

      // An unrelated flag change keeps the migration-stage signature identical,
      // so the selector-gated handler must not fire.
      messenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { remoteFeatureFlags: { someUnrelatedFlag: true }, cacheTimestamp: 0 },
        [],
      );
      await new Promise(process.nextTick);

      expect(
        apiClient.accounts.fetchV2SupportedNetworks,
      ).not.toHaveBeenCalled();

      controller.destroy();
    });
  });

  it('exposes assetsMiddleware and getActiveChains on instance', async () => {
    const { controller } = await setupController();

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET, CHAIN_POLYGON]);

    controller.destroy();
  });

  it('filters out migration networks from active chains when the migration FF is unset', async () => {
    const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const { controller, activeChainsUpdateHandler } = await setupController({
      supportedChains: [1, SOLANA_CHAIN_ID as unknown as number],
    });

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [CHAIN_MAINNET],
      [],
    );

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET]);

    controller.destroy();
  });

  it('filters out migration networks whose migration stage is Off', async () => {
    const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const { controller, activeChainsUpdateHandler } = await setupController({
      supportedChains: [1, SOLANA_CHAIN_ID as unknown as number],
      remoteFeatureFlags: {
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
          stage: SnapsAssetsMigrationStage.Off,
        },
      },
    });

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [CHAIN_MAINNET],
      [],
    );

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET]);

    controller.destroy();
  });

  it.each([
    {
      stageName: 'ReadAssetsControllerWithFallback',
      stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
    },
    {
      stageName: 'ReadAssetsControllerWithoutFallback',
      stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithoutFallback,
    },
    {
      stageName: 'ReadAssetsControllerOnly',
      stage: SnapsAssetsMigrationStage.ReadAssetsControllerOnly,
    },
  ])(
    'surfaces a migration network as an active chain when its migration stage is $stageName',
    async ({ stage }) => {
      const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
      const { controller, activeChainsUpdateHandler } = await setupController({
        supportedChains: [1, SOLANA_CHAIN_ID as unknown as number],
        remoteFeatureFlags: {
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: { stage },
        },
      });

      expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
        'AccountsApiDataSource',
        [CHAIN_MAINNET, SOLANA_CHAIN_ID],
        [],
      );

      const chains = await controller.getActiveChains();
      expect(chains).toStrictEqual([CHAIN_MAINNET, SOLANA_CHAIN_ID]);

      controller.destroy();
    },
  );

  it('gates migration networks independently per namespace', async () => {
    const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const STELLAR_CHAIN_ID = 'stellar:pubnet';
    const { controller } = await setupController({
      supportedChains: [
        1,
        SOLANA_CHAIN_ID as unknown as number,
        STELLAR_CHAIN_ID as unknown as number,
      ],
      remoteFeatureFlags: {
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        },
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar]: {
          stage: SnapsAssetsMigrationStage.Off,
        },
      },
    });

    // Solana is staged on, Stellar is Off — only Solana joins EVM chains.
    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET, SOLANA_CHAIN_ID]);

    controller.destroy();
  });

  it('treats v2 CAIP-2 fullSupport and partialSupport arrays as active chains', async () => {
    const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const SOLANA_DEVNET = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
    const TRON_MAINNET = 'tron:728126428';
    const STELLAR_PUBNET = 'stellar:pubnet';
    const { controller } = await setupController({
      supportedChains: ['eip155:1', 'eip155:137', 'eip155:59144'],
      partialSupport: [
        TRON_MAINNET,
        SOLANA_MAINNET,
        SOLANA_DEVNET,
        STELLAR_PUBNET,
      ],
      remoteFeatureFlags: {
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        },
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.tron]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        },
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        },
      },
    });

    expect(await controller.getActiveChains()).toStrictEqual([
      CHAIN_MAINNET,
      CHAIN_POLYGON,
      'eip155:59144',
      TRON_MAINNET,
      SOLANA_MAINNET,
      SOLANA_DEVNET,
      STELLAR_PUBNET,
    ]);

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
      undefined,
      undefined,
    );

    controller.destroy();
  });

  it('fetch bypasses TanStack cache when forceUpdate is true', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(createDataRequest({ forceUpdate: true }));

    expect(apiClient.accounts.fetchV5MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      undefined,
      { staleTime: 0, gcTime: 0 },
    );

    controller.destroy();
  });

  it('fetch requests a full cache bypass when request.bypassServerCache is true', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(
      createDataRequest({ forceUpdate: true, bypassServerCache: true }),
    );

    expect(apiClient.accounts.fetchV5MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      undefined,
      { staleTime: 0, gcTime: 0, bypassServerCache: true },
    );

    controller.destroy();
  });

  it('fetch bypasses caches when bypassServerCache is set without forceUpdate', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(createDataRequest({ bypassServerCache: true }));

    expect(apiClient.accounts.fetchV5MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      undefined,
      { staleTime: 0, gcTime: 0, bypassServerCache: true },
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

    const { controller } = await setupController({
      balances,
    });

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

  it('fetch persists Stellar native and trustline metadata from v5 balances', async () => {
    const STELLAR_CHAIN_ID = 'stellar:pubnet' as ChainId;
    const stellarAddress =
      'GCRTHNJHYCV4F4JOAIMUE2ALYPE3C7Q53XTSUVGYJ4UXYIKWZAK7FWPG';
    const nativeAssetId = 'stellar:pubnet/slip44:148';
    const usdcAssetId =
      'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
    // The Accounts API client parses balance-row metadata, so the data source
    // only ever sees the `V6TokenBalanceMetadata` fields.
    const nativeMetadata = {
      spendableBalance: '8944804518',
      minimumReserveBalance: '200000000',
    };
    const trustlineMetadata = {
      limit: '9223372036854775807',
      authorized: true,
      sponsored: false,
    };

    const { controller } = await setupController({
      supportedChains: [1, STELLAR_CHAIN_ID as unknown as number],
      remoteFeatureFlags: {
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        },
      },
      balances: [
        createMockBalanceItem(
          `${STELLAR_CHAIN_ID}:${stellarAddress}`,
          nativeAssetId,
          '914.4804518',
          nativeMetadata,
        ),
        createMockBalanceItem(
          `${STELLAR_CHAIN_ID}:${stellarAddress}`,
          usdcAssetId,
          '0',
          trustlineMetadata,
        ),
      ],
    });

    const response = await controller.fetch(
      createDataRequest({
        chainIds: [STELLAR_CHAIN_ID],
        accounts: [
          createMockAccount({
            address: stellarAddress,
            type: 'stellar:ss58',
            scopes: [STELLAR_CHAIN_ID],
          }),
        ],
      }),
    );

    expect(
      response.assetsBalance?.['mock-account-id']?.[
        nativeAssetId as Caip19AssetId
      ],
    ).toStrictEqual({
      amount: '914.4804518',
      metadata: nativeMetadata,
    });
    expect(
      response.assetsBalance?.['mock-account-id']?.[
        usdcAssetId as Caip19AssetId
      ],
    ).toStrictEqual({
      amount: '0',
      metadata: trustlineMetadata,
    });

    controller.destroy();
  });

  it('excludes staking contract asset IDs from v5 balance response', async () => {
    const stakingAssetId =
      'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df';
    const balances = [
      createMockBalanceItem(
        `eip155:1:${MOCK_ADDRESS}`,
        'eip155:1/slip44:60',
        '1000000000000000000',
      ),
      createMockBalanceItem(`eip155:1:${MOCK_ADDRESS}`, stakingAssetId, '0'),
    ];

    const { controller } = await setupController({ balances });

    const response = await controller.fetch(createDataRequest());
    const accountBalances = response.assetsBalance?.['mock-account-id'] ?? {};

    expect(accountBalances).toHaveProperty('eip155:1/slip44:60');
    expect(
      Object.keys(accountBalances).some((id) =>
        id.toLowerCase().includes('0x4fef9d741011476750a243ac70b9789a63dd47df'),
      ),
    ).toBe(false);

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

  describe('assetsAccountsApiV6 feature flag', () => {
    it('uses the v5 endpoint by default', async () => {
      const { controller, apiClient } = await setupController();

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV5MultiAccountBalances,
      ).toHaveBeenCalledTimes(1);
      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).not.toHaveBeenCalled();

      controller.destroy();
    });

    it('uses the v6 endpoint when the assetsAccountsApiV6 remote flag is enabled', async () => {
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledTimes(1);
      expect(
        apiClient.accounts.fetchV5MultiAccountBalances,
      ).not.toHaveBeenCalled();

      controller.destroy();
    });

    it('sets updateMode to full for v6 fetches', async () => {
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
      });

      const response = await controller.fetch(createDataRequest());

      expect(response.updateMode).toBe('full');

      controller.destroy();
    });

    it('uses the v5 endpoint when the assetsAccountsApiV6 remote flag is disabled', async () => {
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: false },
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV5MultiAccountBalances,
      ).toHaveBeenCalledTimes(1);
      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).not.toHaveBeenCalled();

      controller.destroy();
    });

    it('calls the v6 endpoint with default tracked assets as includeAssetIds when enabled', async () => {
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
        undefined,
      );
      expect(
        apiClient.accounts.fetchV5MultiAccountBalances,
      ).not.toHaveBeenCalled();

      controller.destroy();
    });

    it('reads the flag per fetch so it can revert to v5 at runtime', async () => {
      const remoteFeatureFlags = {
        assetsAccountsApiV6: true,
      };
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags,
      });

      await controller.fetch(createDataRequest());
      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledTimes(1);

      remoteFeatureFlags.assetsAccountsApiV6 = false;
      await controller.fetch(createDataRequest());
      expect(
        apiClient.accounts.fetchV5MultiAccountBalances,
      ).toHaveBeenCalledTimes(1);

      controller.destroy();
    });

    it('processes v6 token balances grouped by account', async () => {
      const accountId = `eip155:1:${MOCK_ADDRESS}`;
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        v6Balances: [
          createMockV6BalanceItem(
            accountId,
            'eip155:1/slip44:60',
            '1000000000000000000',
            'token',
            'native',
          ),
        ],
      });

      const response = await controller.fetch(createDataRequest());

      expect(
        response.assetsBalance?.['mock-account-id']?.['eip155:1/slip44:60']
          ?.amount,
      ).toBe('1000000000000000000');

      controller.destroy();
    });

    it('persists Stellar native and trustline metadata from v6 balances', async () => {
      const STELLAR_CHAIN_ID = 'stellar:pubnet' as ChainId;
      const stellarAddress =
        'GDZRSRB4DOK3372HO2OKYVJKGTL5MYF5VUSO5CD5CJJNQVG35HMBQT6U';
      const nativeAssetId = 'stellar:pubnet/slip44:148';
      const aquaAssetId =
        'stellar:pubnet/asset:AQUA-GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA';
      // The Accounts API client parses balance-row metadata, so the data
      // source only ever sees the `V6TokenBalanceMetadata` fields.
      const nativeMetadata = {
        spendableBalance: '8944803018',
        minimumReserveBalance: '200000000',
      };
      const trustlineMetadata = {
        limit: '9223372036854775807',
        authorized: true,
        sponsored: false,
      };

      const { controller } = await setupController({
        supportedChains: [1, STELLAR_CHAIN_ID as unknown as number],
        remoteFeatureFlags: {
          assetsAccountsApiV6: true,
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar]: {
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
          },
        },
        v6Balances: [
          createMockV6BalanceItem(
            `${STELLAR_CHAIN_ID}:${stellarAddress}`,
            aquaAssetId,
            '0',
            'token',
            'token',
            trustlineMetadata,
          ),
          createMockV6BalanceItem(
            `${STELLAR_CHAIN_ID}:${stellarAddress}`,
            nativeAssetId,
            '914.4803018',
            'token',
            'native',
            nativeMetadata,
          ),
        ],
      });

      const response = await controller.fetch(
        createDataRequest({
          chainIds: [STELLAR_CHAIN_ID],
          accounts: [
            createMockAccount({
              address: stellarAddress,
              type: 'stellar:ss58',
              scopes: [STELLAR_CHAIN_ID],
            }),
          ],
        }),
      );

      expect(
        response.assetsBalance?.['mock-account-id']?.[
          aquaAssetId as Caip19AssetId
        ],
      ).toStrictEqual({
        amount: '0',
        metadata: trustlineMetadata,
      });
      expect(
        response.assetsBalance?.['mock-account-id']?.[
          nativeAssetId as Caip19AssetId
        ],
      ).toStrictEqual({
        amount: '914.4803018',
        metadata: nativeMetadata,
      });

      controller.destroy();
    });

    it('ignores v6 defi positions', async () => {
      const accountId = `eip155:1:${MOCK_ADDRESS}`;
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        v6Balances: [
          createMockV6BalanceItem(
            accountId,
            'eip155:1/slip44:60',
            '1000000000000000000',
            'token',
            'native',
          ),
          createMockV6BalanceItem(
            accountId,
            'eip155:1/erc20:0xdefi',
            '500',
            'defi',
          ),
        ],
      });

      const response = await controller.fetch(createDataRequest());

      const accountBalances = response.assetsBalance?.['mock-account-id'] ?? {};
      expect(accountBalances).toHaveProperty('eip155:1/slip44:60');
      expect(accountBalances).not.toHaveProperty('eip155:1/erc20:0xdefi');

      controller.destroy();
    });

    it('excludes staking contract asset IDs from v6 balance response', async () => {
      const accountId = `eip155:1:${MOCK_ADDRESS}`;
      const stakingAssetId =
        'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df';
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        v6Balances: [
          createMockV6BalanceItem(
            accountId,
            'eip155:1/slip44:60',
            '1000000000000000000',
            'token',
            'native',
          ),
          createMockV6BalanceItem(accountId, stakingAssetId, '0'),
        ],
      });

      const response = await controller.fetch(createDataRequest());
      const accountBalances = response.assetsBalance?.['mock-account-id'] ?? {};

      expect(accountBalances).toHaveProperty('eip155:1/slip44:60');
      expect(
        Object.keys(accountBalances).some((id) =>
          id
            .toLowerCase()
            .includes('0x4fef9d741011476750a243ac70b9789a63dd47df'),
        ),
      ).toBe(false);

      controller.destroy();
    });

    it('omits v6 balances from unprocessed networks', async () => {
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        unprocessedNetworks: ['eip155:1'],
        v6Balances: [
          createMockV6BalanceItem(
            `eip155:1:${MOCK_ADDRESS}`,
            MAINNET_NATIVE,
            '1000000000000000000',
            'token',
            'native',
          ),
          createMockV6BalanceItem(
            `eip155:137:${MOCK_ADDRESS}`,
            'eip155:137/slip44:966',
            '2000000000000000000',
            'token',
            'native',
          ),
        ],
      });

      const response = await controller.fetch(
        createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
      );

      expect(response.errors?.[CHAIN_MAINNET]).toBe(
        'Unprocessed by Accounts API',
      );
      expect(response.assetsBalance?.['mock-account-id']).toStrictEqual({
        'eip155:137/slip44:966': { amount: '2000000000000000000' },
      });

      controller.destroy();
    });

    it('handles v6 API errors', async () => {
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
      });

      apiClient.accounts.fetchV6MultiAccountBalances.mockRejectedValueOnce(
        new Error('API Error'),
      );

      const response = await controller.fetch(createDataRequest());

      expect(response.errors?.[CHAIN_MAINNET]).toContain('Fetch failed');

      controller.destroy();
    });

    it('passes EVM custom assets on requested chains to v6 as includeAssetIds', async () => {
      const customToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [customToken] },
          }),
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        {
          includeAssetIds: expect.arrayContaining([customToken, MAINNET_MUSD]),
        },
        undefined,
      );

      controller.destroy();
    });

    it('omits custom assets that are not on a requested chain from includeAssetIds', async () => {
      const polygonToken =
        'eip155:137/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [polygonToken] },
          }),
      });

      await controller.fetch(createDataRequest({ chainIds: [CHAIN_MAINNET] }));

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
        undefined,
      );

      controller.destroy();
    });

    it('errors a chain that came back without every requested include asset id', async () => {
      const customToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        unprocessedIncludeAssetIds: [customToken],
        v6Balances: [
          createMockV6BalanceItem(
            `eip155:1:${MOCK_ADDRESS}`,
            MAINNET_NATIVE,
            '1000000000000000000',
            'token',
            'native',
          ),
        ],
      });

      const response = await controller.fetch(createDataRequest());

      // A snapshot missing one of its `includeAssetIds` is not a full
      // snapshot, so the chain fails and its partial balances are dropped.
      expect(response.errors?.[CHAIN_MAINNET]).toBe(
        'Unresolved includeAssetIds',
      );
      expect(response.assetsBalance).toBeUndefined();

      controller.destroy();
    });

    it('errors only the chain of the unresolved include asset id', async () => {
      const customToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;

      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        unprocessedIncludeAssetIds: [customToken],
        v6Balances: [
          createMockV6BalanceItem(
            `eip155:137:${MOCK_ADDRESS}`,
            POLYGON_NATIVE,
            '5000000000000000000',
            'token',
            'native',
          ),
        ],
      });

      const response = await controller.fetch(
        createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
      );

      expect(response.errors?.[CHAIN_POLYGON]).toBeUndefined();
      expect(
        response.assetsBalance?.['mock-account-id']?.[POLYGON_NATIVE],
      ).toStrictEqual({ amount: '5000000000000000000' });

      controller.destroy();
    });

    it('omits pins not on a requested chain from includeAssetIds', async () => {
      const solanaToken =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;
      const malformed = 'not-a-caip-asset' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [solanaToken, malformed] },
          }),
      });

      await controller.fetch(createDataRequest());

      // No custom asset on a requested chain — still include defaults.
      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
        undefined,
      );

      controller.destroy();
    });

    it('ignores malformed unprocessed include asset ids', async () => {
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        unprocessedIncludeAssetIds: ['not-a-caip-asset'],
      });

      const response = await controller.fetch(createDataRequest());

      // The malformed unprocessed id cannot be parsed, so it is dropped from
      // both axes (no error, no asset-axis entry).
      expect(response.errors).toBeUndefined();
      expect(response.unprocessedCustomAssets).toBeUndefined();

      controller.destroy();
    });

    it('passes EVM hidden assets on requested chains to v6 as excludeAssetIds', async () => {
      const hiddenToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            assetPreferences: { [hiddenToken]: { hidden: true } },
          }),
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        {
          includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD],
          excludeAssetIds: [hiddenToken],
        },
        undefined,
      );

      controller.destroy();
    });

    it('omits hidden assets that are not on a requested chain from excludeAssetIds', async () => {
      const polygonToken =
        'eip155:137/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            assetPreferences: { [polygonToken]: { hidden: true } },
          }),
      });

      await controller.fetch(createDataRequest({ chainIds: [CHAIN_MAINNET] }));

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
        undefined,
      );

      controller.destroy();
    });

    it('omits hidden assets not on a requested chain from excludeAssetIds', async () => {
      const solanaToken =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;
      const malformed = 'not-a-caip-asset' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            assetPreferences: {
              [solanaToken]: { hidden: true },
              [malformed]: { hidden: true },
            },
          }),
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
        undefined,
      );

      controller.destroy();
    });

    it('passes Solana pins on requested Solana chains to v6 as includeAssetIds', async () => {
      const solanaChain = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
      const solanaNative =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
      const solanaToken =
        `${solanaChain}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        supportedChains: [1, solanaChain as unknown as number],
        remoteFeatureFlags: {
          assetsAccountsApiV6: true,
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
          },
        },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [solanaToken] },
          }),
      });

      await controller.fetch(createDataRequest({ chainIds: [solanaChain] }));

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`${solanaChain}:${MOCK_ADDRESS}`],
        { includeAssetIds: [solanaNative, solanaToken] },
        undefined,
      );

      controller.destroy();
    });

    it('passes hidden Solana assets on requested Solana chains to v6 as excludeAssetIds', async () => {
      const solanaChain = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
      const solanaNative =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
      const solanaToken =
        `${solanaChain}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        supportedChains: [1, solanaChain as unknown as number],
        remoteFeatureFlags: {
          assetsAccountsApiV6: true,
          [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.solana]: {
            stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
          },
        },
        getAssetsState: () =>
          createAssetsState({
            assetPreferences: { [solanaToken]: { hidden: true } },
          }),
      });

      await controller.fetch(createDataRequest({ chainIds: [solanaChain] }));

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`${solanaChain}:${MOCK_ADDRESS}`],
        {
          includeAssetIds: [solanaNative],
          excludeAssetIds: [solanaToken],
        },
        undefined,
      );

      controller.destroy();
    });

    it('reads natives, visible pins, and default tracked assets as includeAssetIds, not detected ERC-20 balances', async () => {
      const pinnedToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const trackedToken =
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;
      const native = 'eip155:1/slip44:60' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [pinnedToken] },
            assetsBalance: {
              'mock-account-id': {
                [native]: { amount: '1' },
                [trackedToken]: { amount: '2' },
              },
            },
          }),
      });

      await controller.fetch(createDataRequest());

      const [, params] =
        apiClient.accounts.fetchV6MultiAccountBalances.mock.calls[0];
      expect(params?.includeAssetIds ?? []).toStrictEqual(
        expect.arrayContaining([pinnedToken, native, MAINNET_MUSD]),
      );
      expect(params?.includeAssetIds ?? []).not.toContain(trackedToken);

      controller.destroy();
    });

    it('includes map-encoded erc20 natives in includeAssetIds, not synthetic slip44 ids', async () => {
      const gnosisNative =
        'eip155:100/erc20:0x0000000000000000000000000000000000000000' as Caip19AssetId;
      const syntheticSlip44 = 'eip155:1/slip44:bandwidth' as Caip19AssetId;
      const gnosisChain = 'eip155:100' as ChainId;
      const { controller, apiClient } = await setupController({
        supportedChains: [1, 100],
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            assetsBalance: {
              'mock-account-id': {
                [gnosisNative]: { amount: '1' },
                [syntheticSlip44]: { amount: '1' },
              },
            },
          }),
      });

      await controller.fetch(
        createDataRequest({ chainIds: [CHAIN_MAINNET, gnosisChain] }),
      );

      const [, params] =
        apiClient.accounts.fetchV6MultiAccountBalances.mock.calls[0];
      expect(params?.includeAssetIds ?? []).toContain(gnosisNative);
      expect(params?.includeAssetIds ?? []).not.toContain(syntheticSlip44);

      controller.destroy();
    });

    it('ignores request.customAssets when building v6 includeAssetIds', async () => {
      const statePin =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const requestOnlyToken =
        'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [statePin] },
          }),
      });

      await controller.fetch(
        createDataRequest({ customAssets: [requestOnlyToken] }),
      );

      const [, params] =
        apiClient.accounts.fetchV6MultiAccountBalances.mock.calls[0];
      expect(params?.includeAssetIds).toStrictEqual(
        expect.arrayContaining([statePin, MAINNET_MUSD]),
      );
      expect(params?.includeAssetIds).not.toContain(requestOnlyToken);

      controller.destroy();
    });

    it('does not include a state pin that is also hidden', async () => {
      const token =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [token] },
            assetPreferences: { [token]: { hidden: true } },
          }),
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        {
          includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD],
          excludeAssetIds: [token],
        },
        undefined,
      );

      controller.destroy();
    });

    it('excludes hidden native and default tracked assets from includeAssetIds', async () => {
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            assetPreferences: {
              [MAINNET_NATIVE]: { hidden: true },
              [MAINNET_MUSD]: { hidden: true },
            },
          }),
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        {
          excludeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD],
        },
        undefined,
      );

      controller.destroy();
    });

    it('sends both includeAssetIds and excludeAssetIds when pins and hidden assets differ', async () => {
      const pinned =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const hidden =
        'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        getAssetsState: () =>
          createAssetsState({
            customAssets: { 'mock-account-id': [pinned] },
            assetPreferences: { [hidden]: { hidden: true } },
          }),
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        {
          includeAssetIds: expect.arrayContaining([pinned, MAINNET_MUSD]),
          excludeAssetIds: [hidden],
        },
        undefined,
      );

      controller.destroy();
    });

    it('includes default tracked assets as includeAssetIds even with no pins or native in state', async () => {
      const { controller, apiClient } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
      });

      await controller.fetch(createDataRequest());

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
        undefined,
      );

      controller.destroy();
    });

    it('sends the same includeAssetIds on subscribe polls as on fetch', async () => {
      const pinnedToken =
        'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
      const { controller, apiClient, assetsUpdateHandler } =
        await setupController({
          remoteFeatureFlags: { assetsAccountsApiV6: true },
          getAssetsState: () =>
            createAssetsState({
              customAssets: { 'mock-account-id': [pinnedToken] },
            }),
        });

      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
      });

      expect(
        apiClient.accounts.fetchV6MultiAccountBalances,
      ).toHaveBeenCalledWith(
        [`eip155:1:${MOCK_ADDRESS}`],
        {
          includeAssetIds: expect.arrayContaining([pinnedToken, MAINNET_MUSD]),
        },
        { staleTime: 0, gcTime: 0 },
      );

      controller.destroy();
    });
  });

  it('fetch marks every requested chain as errored when the call exceeds the configured timeout', async () => {
    const { controller, apiClient } = await setupController({
      fetchTimeoutMs: 10,
    });

    apiClient.accounts.fetchV5MultiAccountBalances.mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    const response = await controller.fetch(
      createDataRequest({ chainIds: [CHAIN_MAINNET] }),
    );

    expect(response.errors?.[CHAIN_MAINNET]).toContain('timed out');

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

    const { controller } = await setupController({
      balances,
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsBalance?.['mock-account-id']).toHaveProperty(
      'eip155:1/slip44:60',
    );

    controller.destroy();
  });

  it('middleware forwards full updateMode from v6 fetches', async () => {
    const { controller } = await setupController({
      remoteFeatureFlags: { assetsAccountsApiV6: true },
    });

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(context.response.updateMode).toBe('full');

    controller.destroy();
  });

  it('middleware skips Accounts API when balance is not requested', async () => {
    const { controller, apiClient } = await setupController({
      balances: [
        createMockBalanceItem(
          `eip155:1:${MOCK_ADDRESS}`,
          'eip155:1/slip44:60',
          '1',
        ),
      ],
    });

    apiClient.accounts.fetchV5MultiAccountBalances.mockClear();

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ dataTypes: ['price'] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(
      apiClient.accounts.fetchV5MultiAccountBalances,
    ).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);

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

  it('subscribe polling fetch always bypasses the TanStack cache', async () => {
    const { controller, apiClient, assetsUpdateHandler } =
      await setupController();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(apiClient.accounts.fetchV5MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      undefined,
      { staleTime: 0, gcTime: 0 },
    );

    controller.destroy();
  });

  it('subscribe skips initial fetch when skipInitialFetch is true', async () => {
    const { controller, assetsUpdateHandler, apiClient } =
      await setupController();

    apiClient.accounts.fetchV5MultiAccountBalances.mockClear();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
      skipInitialFetch: true,
    });

    expect(assetsUpdateHandler).not.toHaveBeenCalled();
    expect(
      apiClient.accounts.fetchV5MultiAccountBalances,
    ).not.toHaveBeenCalled();

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

  it('subscribe update immediately fetches newly added chains', async () => {
    const { controller, assetsUpdateHandler } = await setupController();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET] }),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });
    expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);

    const fetchSpy = jest.spyOn(controller, 'fetch');

    // Simulate a chain handoff (e.g. websocket coverage dropped for Polygon).
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
      isUpdate: true,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ chainIds: [CHAIN_POLYGON] }),
    );
    expect(assetsUpdateHandler).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('subscribe update does not fetch when no chains are added', async () => {
    const { controller, assetsUpdateHandler } = await setupController();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });
    expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);

    // Removing a chain (or an account-only update) should not trigger a fetch.
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET] }),
      isUpdate: true,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  describe('tokenDetectionEnabled', () => {
    async function setupControllerWithDetection(
      options: {
        supportedChains?: number[];
        balances?: V5BalanceItem[];
        unprocessedNetworks?: string[];
        tokenDetectionEnabled?: boolean;
        getAssetsState?: () => AssetsControllerStateInternal;
        remoteFeatureFlags?: Record<string, unknown>;
      } = {},
    ): Promise<SetupResult> {
      const {
        supportedChains = [1, 137],
        balances = [],
        unprocessedNetworks = [],
        tokenDetectionEnabled,
        getAssetsState = (): AssetsControllerStateInternal =>
          createAssetsState(),
        remoteFeatureFlags = {},
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

      (
        rootMessenger as unknown as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('RemoteFeatureFlagController:getState', () => ({
        remoteFeatureFlags,
        cacheTimestamp: 0,
      }));

      rootMessenger.delegate({
        messenger: controllerMessenger,
        actions: ['RemoteFeatureFlagController:getState'],
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
        messenger:
          controllerMessenger as unknown as AccountsApiDataSourceOptions['messenger'],
        queryApiClient:
          apiClient as unknown as AccountsApiDataSourceOptions['queryApiClient'],
        onActiveChainsUpdated: (dataSourceName, chains, previousChains): void =>
          activeChainsUpdateHandler(dataSourceName, chains, previousChains),
        isBalanceV6Enabled: (): boolean =>
          isBalanceV6EnabledFromFlags(remoteFeatureFlags),
        getAssetsState,
        getAssetVisibility: (accountIds, chainIds): AssetVisibility =>
          getAssetVisibility({
            state: getAssetsState(),
            accountIds,
            chainIds,
            getNativeAssetForChain,
          }),
      };

      if (tokenDetectionEnabled !== undefined) {
        controllerOptions.tokenDetectionEnabled = (): boolean =>
          tokenDetectionEnabled;
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
          getAssetsState: () =>
            createAssetsState({
              assetsBalance: {
                [ACCOUNT_ID]: {
                  [KNOWN_ASSET]: { amount: '500' },
                },
              },
            }),
        });

      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
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
          getAssetsState: () => createAssetsState(),
        });

      await controller.subscribe({
        subscriptionId: 'sub-1',
        request: createDataRequest(),
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
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
        getAssetsState: () =>
          createAssetsState({
            assetsBalance: {
              [ACCOUNT_ID]: {
                [KNOWN_ASSET]: { amount: '500' },
              },
            },
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
        getAssetsState: () => createAssetsState(),
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

    it('does not filter unknown tokens on the v6 path when tokenDetectionEnabled is false', async () => {
      const known = createMockV6BalanceItem(
        `eip155:1:${MOCK_ADDRESS}`,
        KNOWN_ASSET,
        '1000',
      );
      const unknown = createMockV6BalanceItem(
        `eip155:1:${MOCK_ADDRESS}`,
        UNKNOWN_ASSET,
        '2000',
      );
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        tokenDetectionEnabled: (): boolean => false,
        v6Balances: [known, unknown],
        getAssetsState: () =>
          createAssetsState({
            assetsBalance: {
              [ACCOUNT_ID]: {
                [KNOWN_ASSET]: { amount: '500' },
              },
            },
          }),
      });

      const response = await controller.fetch(createDataRequest());
      const accountBalances = response.assetsBalance?.[ACCOUNT_ID] ?? {};
      expect(Object.keys(accountBalances)).toHaveLength(2);
      expect(accountBalances[KNOWN_ASSET as Caip19AssetId]).toBeDefined();
      expect(accountBalances[UNKNOWN_ASSET as Caip19AssetId]).toBeDefined();

      controller.destroy();
    });

    it('claims handled chains on v6 when tokenDetectionEnabled is false', async () => {
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
        tokenDetectionEnabled: (): boolean => false,
        v6Balances: [
          createMockV6BalanceItem(
            `eip155:1:${MOCK_ADDRESS}`,
            'eip155:1/slip44:60',
            '1000000000000000000',
            'token',
            'native',
          ),
        ],
        getAssetsState: () => createAssetsState(),
      });

      const nextFn = jest.fn().mockResolvedValue(undefined);
      const context = createMiddlewareContext({
        request: createDataRequest({
          chainIds: [CHAIN_MAINNET],
        }),
      });

      await controller.assetsMiddleware(context, nextFn);

      expect(nextFn).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            chainIds: [],
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
    return createAssetsState({ assetsBalance: balances });
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
