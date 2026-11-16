import type { V5BalanceItem, V6BalanceItem } from '@metamask/core-backend';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { createMockMessengers } from '../__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from '../__fixtures__/MockAssetControllerMessenger.js';
import { waitUntilStable } from '../__fixtures__/test-utils.js';
import type { AssetsControllerMessenger } from '../AssetsController.js';
import { getDefaultTrackedAssetsForChain } from '../defaults.js';
import type {
  ChainId,
  Caip19AssetId,
  DataRequest,
  Context,
  AssetsControllerState,
} from '../types.js';
import type { AssetVisibility } from '../utils/assetVisibility.js';
import { getAssetVisibility } from '../utils/assetVisibility.js';
import { ZERO_ADDRESS } from '../utils/constants.js';
import { NATIVE_ASSETS } from '../utils/native-assets.js';
import {
  SNAPS_ASSETS_MIGRATION_FLAG_KEYS,
  SnapsAssetsMigrationStage,
} from '../utils/snaps-assets-migration.js';
import { AccountsApiDataSource } from './AccountsApiDataSource.js';
import type { AccountsApiDataSourceOptions } from './AccountsApiDataSource.js';

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

type MockApiClient = {
  accounts: {
    fetchV2SupportedNetworks: Mock;
    fetchV5MultiAccountBalances: Mock;
    fetchV6MultiAccountBalances: Mock;
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
  };
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
      fetchV2SupportedNetworks: vi.fn().mockResolvedValue({
        fullSupport: supportedChains,
        partialSupport,
      }),
      fetchV5MultiAccountBalances: vi.fn().mockResolvedValue({
        balances,
        unprocessedNetworks,
      }),
      fetchV6MultiAccountBalances: vi.fn().mockResolvedValue({
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
  overrides: Partial<AssetsControllerState> = {},
): AssetsControllerState {
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
    ...overrides,
  };
}

type SetupResult = {
  controller: AccountsApiDataSource;
  messenger: MockRootMessenger;
  apiClient: MockApiClient;
  assetsUpdateHandler: Mock;
  activeChainsUpdateHandler: Mock;
};

function createTestMessenger(remoteFeatureFlags: FeatureFlags = {}): {
  rootMessenger: MockRootMessenger;
  assetsControllerMessenger: AssetsControllerMessenger;
} {
  return createMockMessengers({
    registerCustomRootActions: (rootMessenger): void => {
      rootMessenger.registerActionHandler(
        'RemoteFeatureFlagController:getState',
        () => ({
          remoteFeatureFlags,
          cacheTimestamp: 0,
        }),
      );
    },
  });
}

const teardowns: (() => void)[] = [];

async function setupController(
  options: {
    supportedChains?: (number | string)[];
    partialSupport?: (number | string)[];
    balances?: V5BalanceItem[];
    unprocessedNetworks?: string[];
    unprocessedIncludeAssetIds?: string[];
    fetchTimeoutMs?: number;
    v6Balances?: V6BalanceItem[];
    remoteFeatureFlags?: FeatureFlags;
    getAssetsState?: () => AssetsControllerState;
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
    getAssetsState = (): AssetsControllerState => createAssetsState(),
  } = options;

  const { rootMessenger, assetsControllerMessenger } =
    createTestMessenger(remoteFeatureFlags);

  const assetsUpdateHandler = vi.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = vi.fn();

  const apiClient = createMockApiClient(
    supportedChains,
    balances,
    unprocessedNetworks,
    v6Balances,
    unprocessedIncludeAssetIds,
    partialSupport,
  );

  const controller = new AccountsApiDataSource({
    messenger: assetsControllerMessenger,
    queryApiClient:
      apiClient as unknown as AccountsApiDataSourceOptions['queryApiClient'],
    onActiveChainsUpdated: (dataSourceName, chains, previousChains): void =>
      activeChainsUpdateHandler(dataSourceName, chains, previousChains),
    getAssetVisibility: (accountIds, chainIds): AssetVisibility =>
      getAssetVisibility({
        state: getAssetsState(),
        accountIds,
        chainIds,
        getNativeAssetForChain,
      }),
    ...(fetchTimeoutMs === undefined ? {} : { fetchTimeoutMs }),
  });

  teardowns.push(() => controller.destroy());

  await waitUntilStable(() => controller.getActiveChainsSync());

  return {
    controller,
    messenger: rootMessenger,
    apiClient,
    assetsUpdateHandler,
    activeChainsUpdateHandler,
  };
}

describe('AccountsApiDataSource', () => {
  afterEach(() => {
    teardowns.splice(0).forEach((teardown) => teardown());
    vi.clearAllMocks();
  });

  it('initializes with correct name', async () => {
    const { controller } = await setupController();
    expect(controller.getName()).toBe('AccountsApiDataSource');
  });

  it('fetches active chains on initialization', async () => {
    const { apiClient, activeChainsUpdateHandler } = await setupController({
      supportedChains: [1, 137, 42161],
    });

    expect(apiClient.accounts.fetchV2SupportedNetworks).toHaveBeenCalled();
    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [CHAIN_MAINNET, CHAIN_POLYGON, CHAIN_ARBITRUM],
      [],
    );
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
  });

  describe('RemoteFeatureFlagController:stateChange subscription', () => {
    it('refreshes active chains when a migration stage changes', async () => {
      const { apiClient, messenger } = await setupController({
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

      expect(apiClient.accounts.fetchV2SupportedNetworks).toHaveBeenCalledTimes(
        1,
      );
    });

    it('does not refresh active chains when an unrelated flag changes', async () => {
      const { apiClient, messenger } = await setupController({
        remoteFeatureFlags: {},
      });

      // Establish the baseline migration-stage signature.
      messenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { remoteFeatureFlags: {}, cacheTimestamp: 0 },
        [],
      );
      apiClient.accounts.fetchV2SupportedNetworks.mockClear();

      // An unrelated flag change keeps the migration-stage signature identical,
      // so the selector-gated handler must not fire.
      messenger.publish(
        'RemoteFeatureFlagController:stateChange',
        { remoteFeatureFlags: { someUnrelatedFlag: true }, cacheTimestamp: 0 },
        [],
      );
      await waitUntilStable(() => [
        apiClient.accounts.fetchV2SupportedNetworks.mock.calls.length,
      ]);

      expect(
        apiClient.accounts.fetchV2SupportedNetworks,
      ).not.toHaveBeenCalled();
    });
  });

  it('exposes assetsMiddleware and getActiveChains on instance', async () => {
    const { controller } = await setupController();

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET, CHAIN_POLYGON]);
  });

  it('filters out migration networks from active chains when the migration FF is unset', async () => {
    const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const { controller, activeChainsUpdateHandler } = await setupController({
      supportedChains: [1, SOLANA_CHAIN_ID],
    });

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [CHAIN_MAINNET],
      [],
    );

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([CHAIN_MAINNET]);
  });

  it('filters out migration networks whose migration stage is Off', async () => {
    const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const { controller, activeChainsUpdateHandler } = await setupController({
      supportedChains: [1, SOLANA_CHAIN_ID],
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
        supportedChains: [1, SOLANA_CHAIN_ID],
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
    },
  );

  it('gates migration networks independently per namespace', async () => {
    const SOLANA_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const STELLAR_CHAIN_ID = 'stellar:pubnet';
    const { controller } = await setupController({
      supportedChains: [1, SOLANA_CHAIN_ID, STELLAR_CHAIN_ID],
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
  });

  it.each([
    { input: 1, expected: 'eip155:1' },
    { input: '137', expected: 'eip155:137' },
    { input: 'eip155:42161', expected: 'eip155:42161' },
  ])('converts chain ID $input to $expected', async ({ input, expected }) => {
    const { activeChainsUpdateHandler } = await setupController({
      supportedChains: [input],
    });

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'AccountsApiDataSource',
      [expected],
      [],
    );
  });

  it('fetch returns error for unsupported chain', async () => {
    const { controller } = await setupController({ supportedChains: [1] });

    const request = createDataRequest({ chainIds: [CHAIN_POLYGON] });
    const response = await controller.fetch(request);

    expect(response.errors?.[CHAIN_POLYGON]).toBe(
      'Chain not supported by Accounts API',
    );
  });

  it('fetch calls API with correct account IDs', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(createDataRequest());

    expect(apiClient.accounts.fetchV6MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
      undefined,
    );
  });

  it('fetch bypasses TanStack cache when forceUpdate is true', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(createDataRequest({ forceUpdate: true }));

    expect(apiClient.accounts.fetchV6MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
      { staleTime: 0, gcTime: 0 },
    );
  });

  it('fetch requests a full cache bypass when request.bypassServerCache is true', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(
      createDataRequest({ forceUpdate: true, bypassServerCache: true }),
    );

    expect(apiClient.accounts.fetchV6MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
      { staleTime: 0, gcTime: 0, bypassServerCache: true },
    );
  });

  it('fetch bypasses caches when bypassServerCache is set without forceUpdate', async () => {
    const { controller, apiClient } = await setupController();

    await controller.fetch(createDataRequest({ bypassServerCache: true }));

    expect(apiClient.accounts.fetchV6MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
      { staleTime: 0, gcTime: 0, bypassServerCache: true },
    );
  });

  it('fetch processes balance response', async () => {
    const { controller } = await setupController({
      v6Balances: [
        createMockV6BalanceItem(
          `eip155:1:${MOCK_ADDRESS}`,
          'eip155:1/slip44:60',
          '1000000000000000000',
          'token',
          'native',
        ),
      ],
    });

    const response = await controller.fetch(createDataRequest());

    expect(response.assetsBalance?.['mock-account-id']).toHaveProperty(
      'eip155:1/slip44:60',
    );
    expect(
      response.assetsBalance?.['mock-account-id']?.['eip155:1/slip44:60']
        ?.amount,
    ).toBe('1000000000000000000');
  });

  it('fetch persists Stellar native and trustline metadata', async () => {
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
      supportedChains: [1, STELLAR_CHAIN_ID],
      remoteFeatureFlags: {
        [SNAPS_ASSETS_MIGRATION_FLAG_KEYS.stellar]: {
          stage: SnapsAssetsMigrationStage.ReadAssetsControllerWithFallback,
        },
      },
      v6Balances: [
        createMockV6BalanceItem(
          `${STELLAR_CHAIN_ID}:${stellarAddress}`,
          nativeAssetId,
          '914.4804518',
          'token',
          'native',
          nativeMetadata,
        ),
        createMockV6BalanceItem(
          `${STELLAR_CHAIN_ID}:${stellarAddress}`,
          usdcAssetId,
          '0',
          'token',
          'asset',
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
  });

  it('excludes staking contract asset IDs from the balance response', async () => {
    const stakingAssetId =
      'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df';
    const { controller } = await setupController({
      v6Balances: [
        createMockV6BalanceItem(
          `eip155:1:${MOCK_ADDRESS}`,
          'eip155:1/slip44:60',
          '1000000000000000000',
          'token',
          'native',
        ),
        createMockV6BalanceItem(
          `eip155:1:${MOCK_ADDRESS}`,
          stakingAssetId,
          '0',
          'token',
          'erc20',
        ),
      ],
    });

    const response = await controller.fetch(createDataRequest());
    const accountBalances = response.assetsBalance?.['mock-account-id'] ?? {};

    expect(accountBalances).toHaveProperty('eip155:1/slip44:60');
    expect(
      Object.keys(accountBalances).some((id) =>
        id.toLowerCase().includes('0x4fef9d741011476750a243ac70b9789a63dd47df'),
      ),
    ).toBe(false);
  });

  it('fetch marks unprocessed networks as errors', async () => {
    const { controller } = await setupController({
      unprocessedNetworks: ['eip155:1'],
    });

    const response = await controller.fetch(createDataRequest());

    expect(response.errors?.[CHAIN_MAINNET]).toBe(
      'Unprocessed by Accounts API',
    );
  });

  it('fetch handles API errors', async () => {
    const { controller, apiClient } = await setupController();

    apiClient.accounts.fetchV6MultiAccountBalances.mockRejectedValueOnce(
      new Error('API Error'),
    );

    const response = await controller.fetch(createDataRequest());

    expect(response.errors?.[CHAIN_MAINNET]).toContain('Fetch failed');
  });

  describe('balances endpoint', () => {
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
    });

    it('sets updateMode to full for v6 fetches', async () => {
      const { controller } = await setupController({
        remoteFeatureFlags: { assetsAccountsApiV6: true },
      });

      const response = await controller.fetch(createDataRequest());

      expect(response.updateMode).toBe('full');
    });

    it('calls the v6 endpoint with default tracked assets as includeAssetIds', async () => {
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
        supportedChains: [1, STELLAR_CHAIN_ID],
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
    });

    it('passes Solana pins on requested Solana chains to v6 as includeAssetIds', async () => {
      const solanaChain = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
      const solanaNative =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
      const solanaToken =
        `${solanaChain}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        supportedChains: [1, solanaChain],
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
    });

    it('passes hidden Solana assets on requested Solana chains to v6 as excludeAssetIds', async () => {
      const solanaChain = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
      const solanaNative =
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
      const solanaToken =
        `${solanaChain}/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` as Caip19AssetId;
      const { controller, apiClient } = await setupController({
        supportedChains: [1, solanaChain],
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
    });
  });

  it('fetch marks every requested chain as errored when the call exceeds the configured timeout', async () => {
    const { controller, apiClient } = await setupController({
      fetchTimeoutMs: 10,
    });

    apiClient.accounts.fetchV6MultiAccountBalances.mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    const response = await controller.fetch(
      createDataRequest({ chainIds: [CHAIN_MAINNET] }),
    );

    expect(response.errors?.[CHAIN_MAINNET]).toContain('timed out');
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
      apiClient.accounts.fetchV6MultiAccountBalances,
    ).not.toHaveBeenCalled();
  });

  it('middleware passes to next when no chains requested', async () => {
    const { controller } = await setupController();

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ chainIds: [] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware merges balance response into context', async () => {
    const { controller } = await setupController({
      v6Balances: [
        createMockV6BalanceItem(
          `eip155:1:${MOCK_ADDRESS}`,
          'eip155:1/slip44:60',
          '1000000000000000000',
          'token',
          'native',
        ),
      ],
    });

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(context.response.assetsBalance?.['mock-account-id']).toHaveProperty(
      'eip155:1/slip44:60',
    );
  });

  it('middleware copies unprocessed-chain errors onto the pipeline context', async () => {
    const { controller } = await setupController({
      unprocessedNetworks: ['eip155:1'],
    });

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      response: { errors: { [CHAIN_POLYGON]: 'existing' } },
    });

    await controller.assetsMiddleware(context, next);

    expect(context.response.errors?.[CHAIN_MAINNET]).toBe(
      'Unprocessed by Accounts API',
    );
    expect(context.response.errors?.[CHAIN_POLYGON]).toBe('existing');
  });

  it('middleware copies timed-out chains onto the pipeline context', async () => {
    const { controller, apiClient } = await setupController({
      fetchTimeoutMs: 10,
    });

    apiClient.accounts.fetchV6MultiAccountBalances.mockImplementationOnce(
      () => new Promise(() => undefined),
    );

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(context.response.errors?.[CHAIN_MAINNET]).toContain('timed out');
  });

  it('middleware forwards full updateMode from v6 fetches', async () => {
    const { controller } = await setupController({
      remoteFeatureFlags: { assetsAccountsApiV6: true },
    });

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(context.response.updateMode).toBe('full');
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

    apiClient.accounts.fetchV6MultiAccountBalances.mockClear();

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ dataTypes: ['price'] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(
      apiClient.accounts.fetchV6MultiAccountBalances,
    ).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(context);
  });

  it('middleware keeps every requested chain for later lane stages', async () => {
    const { controller } = await setupController({ supportedChains: [1] });

    const next = vi.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ chainIds: [CHAIN_MAINNET, CHAIN_POLYGON] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
        }),
      }),
    );
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

    expect(apiClient.accounts.fetchV6MultiAccountBalances).toHaveBeenCalledWith(
      [`eip155:1:${MOCK_ADDRESS}`],
      { includeAssetIds: [MAINNET_NATIVE, MAINNET_MUSD] },
      { staleTime: 0, gcTime: 0 },
    );
  });

  it('subscribe skips initial fetch when skipInitialFetch is true', async () => {
    const { controller, assetsUpdateHandler, apiClient } =
      await setupController();

    apiClient.accounts.fetchV6MultiAccountBalances.mockClear();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
      skipInitialFetch: true,
    });

    expect(assetsUpdateHandler).not.toHaveBeenCalled();
    expect(
      apiClient.accounts.fetchV6MultiAccountBalances,
    ).not.toHaveBeenCalled();
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

    const fetchSpy = vi.spyOn(controller, 'fetch');

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
  });
});
