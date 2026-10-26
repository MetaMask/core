/* eslint-disable jest/unbound-method */
import type { Balance } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import type {
  PermissionConstraint,
  SubjectPermissions,
} from '@metamask/permission-controller';

import { getDefaultAssetsControllerState } from '../AssetsController.js';
import type { AssetsControllerMessenger } from '../AssetsController.js';
import type {
  AssetsControllerState,
  ChainId,
  DataRequest,
  Context,
  Caip19AssetId,
} from '../types.js';
import type { GetAssetVisibility } from '../utils/assetVisibility.js';
import type {
  SnapDataSourceOptions,
  AccountBalancesUpdatedEventPayload,
  SnapDataSourceAllowedActions,
  SnapDataSourceAllowedEvents,
} from './SnapDataSource.js';
import {
  SnapDataSource,
  createSnapDataSource,
  extractChainFromAssetId,
  getChainIdsCaveat,
  KEYRING_PERMISSION,
  ASSETS_PERMISSION,
  getSnapBalanceRetryDelay,
} from './SnapDataSource.js';

// Test chain IDs
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
const BITCOIN_MAINNET = 'bip122:000000000019d6689c085ae165831e93' as ChainId;
const TRON_MAINNET = 'tron:728126428' as ChainId;
const STELLAR_MAINNET = 'stellar:pubnet' as ChainId;

// Test snap IDs
const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap';
const BITCOIN_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap';
const STELLAR_SNAP_ID = 'npm:@metamask/stellar-wallet-snap';

type AllActions = SnapDataSourceAllowedActions;
type AllEvents = SnapDataSourceAllowedEvents;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_SOL_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
const MOCK_SOL_PIN =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:So11111111111111111111111111111111111111112' as Caip19AssetId;
const MOCK_STELLAR_ASSET = 'stellar:pubnet/slip44:148' as Caip19AssetId;
const MOCK_STELLAR_PIN =
  'stellar:pubnet/asset:USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' as Caip19AssetId;
const MOCK_BTC_ASSET =
  'bip122:000000000019d6689c085ae165831e93/slip44:0' as Caip19AssetId;
const MOCK_TRON_ASSET = 'tron:728126428/slip44:195' as Caip19AssetId;
const CHAIN_MAINNET = 'eip155:1' as ChainId;

type SetupResult = {
  controller: SnapDataSource;
  messenger: RootMessenger;
  mockGetRunnableSnaps: jest.Mock;
  mockHandleRequest: jest.Mock;
  mockGetPermissions: jest.Mock;
  assetsUpdateHandler: jest.Mock;
  activeChainsUpdateHandler: jest.Mock;
  triggerBalancesUpdated: (payload: AccountBalancesUpdatedEventPayload) => void;
  cleanup: () => void;
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
    scopes: ['solana:0', 'bip122:0', 'tron:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
      snap: {
        id: SOLANA_SNAP_ID,
        name: 'Solana Snap',
        enabled: true,
      },
    },
    ...overrides,
  } as InternalAccount;
}

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [SOLANA_MAINNET];
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
    ...overrides,
  };
}

/**
 * Creates mock permissions for PermissionController:getPermissions
 *
 * @param chainIds - Chain IDs this snap supports
 * @returns Mock permissions object with both keyring and assets permissions
 */
function createMockPermissions(
  chainIds: ChainId[] = [],
): SubjectPermissions<PermissionConstraint> {
  if (chainIds.length === 0) {
    return {};
  }

  return {
    // Keyring permission indicates this is a keyring snap
    [KEYRING_PERMISSION]: {
      id: 'mock-keyring-permission-id',
      parentCapability: KEYRING_PERMISSION,
      invoker: 'test',
      date: Date.now(),
      caveats: null,
    },
    // Assets permission contains the chainIds caveat
    [ASSETS_PERMISSION]: {
      id: 'mock-assets-permission-id',
      parentCapability: ASSETS_PERMISSION,
      invoker: 'test',
      date: Date.now(),
      caveats: [
        {
          type: 'chainIds',
          value: chainIds,
        },
      ],
    },
  } as unknown as SubjectPermissions<PermissionConstraint>;
}

/**
 * Creates a mock handler for SnapController:handleRequest
 *
 * @param accountAssets - Assets to return for keyring_listAccountAssets
 * @param balances - Balances to return for keyring_getAccountBalances
 * @returns Mock handler function
 */
function createMockHandleRequest(
  accountAssets: string[] = [],
  balances: Record<string, Balance> = {},
): jest.Mock {
  return jest.fn(
    (params: {
      request?: { method?: string; params?: { assets?: string[] } };
    }) => {
      const { request } = params;
      if (request?.method === 'keyring_listAccountAssets') {
        return Promise.resolve(accountAssets);
      }
      if (request?.method === 'keyring_getAccountBalances') {
        const requested = request.params?.assets;
        if (!requested) {
          return Promise.resolve(balances);
        }
        return Promise.resolve(
          Object.fromEntries(
            requested
              .filter((assetId) => balances[assetId])
              .map((assetId) => [assetId, balances[assetId]]),
          ),
        );
      }
      return Promise.resolve(null);
    },
  );
}

function setupController(
  options: {
    installedSnaps?: Record<string, { version: string; chainIds?: ChainId[] }>;
    accountAssets?: string[];
    balances?: Record<string, Balance>;
    configuredNetworks?: ChainId[];
    isBalanceV6Enabled?: () => boolean;
    getAssetVisibility?: GetAssetVisibility;
    getAssetsState?: () => AssetsControllerState;
    onBalanceFetchStatusChange?: SnapDataSourceOptions['onBalanceFetchStatusChange'];
    retryBackoff?: SnapDataSourceOptions['retryBackoff'];
  } = {},
): SetupResult {
  const {
    installedSnaps = {},
    accountAssets = [],
    balances = {},
    isBalanceV6Enabled = (): boolean => false,
    getAssetVisibility = (): ReturnType<GetAssetVisibility> => ({
      visibleAssetIds: [],
      hiddenAssetIds: [],
    }),
    getAssetsState = getDefaultAssetsControllerState,
  } = options;

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const controllerMessenger = new Messenger<
    'SnapDataSource',
    AllActions,
    AllEvents,
    RootMessenger
  >({
    namespace: 'SnapDataSource',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: controllerMessenger,
    actions: [
      'SnapController:getRunnableSnaps',
      'SnapController:handleRequest',
      'PermissionController:getPermissions',
    ],
    events: ['AccountsController:accountBalancesUpdated'],
  });

  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = jest.fn();

  // Build snaps array for SnapController:getRunnableSnaps
  // getRunnableSnaps returns only enabled, non-blocked snaps
  const snapsForGetRunnableSnaps = Object.entries(installedSnaps).map(
    ([id, { version }]) => ({
      id,
      version,
      enabled: true,
      blocked: false,
    }),
  );

  // Register SnapController action handlers
  const mockGetRunnableSnaps = jest
    .fn()
    .mockReturnValue(snapsForGetRunnableSnaps);
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    mockGetRunnableSnaps,
  );

  const mockHandleRequest = createMockHandleRequest(accountAssets, balances);
  rootMessenger.registerActionHandler(
    'SnapController:handleRequest',
    mockHandleRequest,
  );

  // Register PermissionController:getPermissions handler
  // Returns permissions with chainIds caveat based on installed snaps config
  const mockGetPermissions = jest.fn().mockImplementation((snapId: string) => {
    const snapConfig = installedSnaps[snapId];
    if (snapConfig?.chainIds) {
      return createMockPermissions(snapConfig.chainIds);
    }
    return;
  });
  rootMessenger.registerActionHandler(
    'PermissionController:getPermissions',
    mockGetPermissions,
  );

  const controllerOptions: SnapDataSourceOptions = {
    messenger: controllerMessenger as unknown as AssetsControllerMessenger,
    onActiveChainsUpdated: activeChainsUpdateHandler,
    onAssetsUpdate: assetsUpdateHandler,
    isBalanceV6Enabled,
    getAssetVisibility,
    getAssetsState,
    onBalanceFetchStatusChange: options.onBalanceFetchStatusChange,
    retryBackoff: options.retryBackoff,
  };

  const controller = new SnapDataSource(controllerOptions);

  // Subscribe so that balance updates are reported via onAssetsUpdate
  const chainIdsFromSnaps = Object.values(installedSnaps).flatMap(
    (snap) => snap.chainIds ?? [],
  );
  if (chainIdsFromSnaps.length > 0) {
    controller
      .subscribe({
        request: createDataRequest({
          chainIds: [...new Set(chainIdsFromSnaps)],
        }),
        subscriptionId: 'test-sub',
        isUpdate: false,
        onAssetsUpdate: assetsUpdateHandler,
      })
      .catch(() => undefined);
  }

  const triggerBalancesUpdated = (
    payload: AccountBalancesUpdatedEventPayload,
  ): void => {
    rootMessenger.publish('AccountsController:accountBalancesUpdated', payload);
  };

  const cleanup = (): void => {
    controller.destroy();
    rootMessenger.clearSubscriptions();
  };

  return {
    controller,
    messenger: rootMessenger,
    mockGetRunnableSnaps,
    mockHandleRequest,
    mockGetPermissions,
    assetsUpdateHandler,
    activeChainsUpdateHandler,
    triggerBalancesUpdated,
    cleanup,
  };
}

describe('SnapDataSource helper functions', () => {
  describe('extractChainFromAssetId', () => {
    it.each([
      { assetId: MOCK_SOL_ASSET, expected: SOLANA_MAINNET },
      { assetId: MOCK_BTC_ASSET, expected: BITCOIN_MAINNET },
      { assetId: MOCK_TRON_ASSET, expected: TRON_MAINNET },
    ])('extracts $expected from $assetId', ({ assetId, expected }) => {
      expect(extractChainFromAssetId(assetId)).toBe(expected);
    });
  });

  describe('getChainIdsCaveat', () => {
    it('returns null when permission has no caveats', () => {
      const permission = {
        id: 'test',
        parentCapability: KEYRING_PERMISSION,
        invoker: 'test',
        date: Date.now(),
        caveats: null,
      } as unknown as PermissionConstraint;

      expect(getChainIdsCaveat(permission)).toBeNull();
    });

    it('returns null when no chainIds caveat exists', () => {
      const permission = {
        id: 'test',
        parentCapability: KEYRING_PERMISSION,
        invoker: 'test',
        date: Date.now(),
        caveats: [{ type: 'other', value: [] }],
      } as unknown as PermissionConstraint;

      expect(getChainIdsCaveat(permission)).toBeNull();
    });

    it('returns chain IDs from chainIds caveat', () => {
      const chainIds = [SOLANA_MAINNET, BITCOIN_MAINNET];
      const permission = {
        id: 'test',
        parentCapability: KEYRING_PERMISSION,
        invoker: 'test',
        date: Date.now(),
        caveats: [{ type: 'chainIds', value: chainIds }],
      } as unknown as PermissionConstraint;

      expect(getChainIdsCaveat(permission)).toStrictEqual(chainIds);
    });
  });
});

describe('SnapDataSource', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with correct name', async () => {
    const { controller, cleanup } = setupController();
    expect(controller.getName()).toBe('SnapDataSource');
    await new Promise(process.nextTick);
    cleanup();
  });

  it('initializes with empty chains when no keyring snaps discovered', async () => {
    const { controller, cleanup } = setupController();
    await new Promise(process.nextTick);

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([]);

    cleanup();
  });

  it('discovers keyring snaps and populates active chains', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        [BITCOIN_SNAP_ID]: { version: '2.0.0', chainIds: [BITCOIN_MAINNET] },
      },
    });
    await new Promise(process.nextTick);

    const chains = await controller.getActiveChains();
    expect(chains).toContain(SOLANA_MAINNET);
    expect(chains).toContain(BITCOIN_MAINNET);

    cleanup();
  });

  it('exposes assetsMiddleware on instance', async () => {
    const { controller, cleanup } = setupController();
    await new Promise(process.nextTick);

    const middleware = controller.assetsMiddleware;
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');

    cleanup();
  });

  it('checks snap availability on initialization via PermissionController', async () => {
    const { mockGetRunnableSnaps, mockGetPermissions, cleanup } =
      setupController({
        installedSnaps: {
          [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        },
      });
    await new Promise(process.nextTick);

    expect(mockGetRunnableSnaps).toHaveBeenCalled();
    expect(mockGetPermissions).toHaveBeenCalledWith(SOLANA_SNAP_ID);

    cleanup();
  });

  it('fetch returns empty response for accounts without snap metadata', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
    });
    await new Promise(process.nextTick);

    // Create account without snap metadata (non-snap account)
    const nonSnapAccount = createMockAccount({
      metadata: {
        name: 'Test Account',
        keyring: { type: 'HD Key Tree' },
        importTime: Date.now(),
        lastSelected: Date.now(),
        // No snap property
      },
    });

    const response = await controller.fetch(
      createDataRequest({ accounts: [nonSnapAccount] }),
    );

    expect(response).toStrictEqual({
      assetsBalance: {},
      assetsInfo: {},
      updateMode: 'merge',
    });

    cleanup();
  });

  it('fetch returns empty response when request is undefined', async () => {
    const { controller, cleanup } = setupController();
    await new Promise(process.nextTick);

    const response = await controller.fetch(
      undefined as unknown as DataRequest,
    );

    expect(response).toStrictEqual({});

    cleanup();
  });

  it('fetch returns empty response when accounts array is empty', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(
      createDataRequest({ accounts: [] }),
    );

    // No accounts to fetch, so empty balances
    expect(response).toStrictEqual({
      assetsBalance: {},
      assetsInfo: {},
      updateMode: 'merge',
    });

    cleanup();
  });

  it('fetch calls snap keyring methods when snap discovered', async () => {
    const { controller, mockHandleRequest, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    // Verify keyring_listAccountAssets was called
    expect(mockHandleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        snapId: SOLANA_SNAP_ID,
        origin: 'metamask',
        handler: 'onKeyringRequest',
        request: expect.objectContaining({
          method: 'keyring_listAccountAssets',
          params: { id: 'mock-account-id' },
        }),
      }),
    );
    // Verify keyring_getAccountBalances was called
    expect(mockHandleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        snapId: SOLANA_SNAP_ID,
        origin: 'metamask',
        handler: 'onKeyringRequest',
        request: expect.objectContaining({
          method: 'keyring_getAccountBalances',
          params: { id: 'mock-account-id', assets: [MOCK_SOL_ASSET] },
        }),
      }),
    );
    expect(
      response.assetsBalance?.['mock-account-id']?.[MOCK_SOL_ASSET],
    ).toStrictEqual({ amount: '1000000000' });

    cleanup();
  });

  it('requests expected visible assets and zero-fills any the snap omitted', async () => {
    const getAssetVisibility = jest.fn().mockReturnValue({
      visibleAssetIds: [MOCK_SOL_ASSET, MOCK_SOL_PIN],
      hiddenAssetIds: [],
    });
    const { controller, mockHandleRequest, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility,
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(getAssetVisibility).toHaveBeenCalledWith(
      ['mock-account-id'],
      [SOLANA_MAINNET],
    );
    expect(mockHandleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: 'keyring_getAccountBalances',
          params: {
            id: 'mock-account-id',
            assets: [MOCK_SOL_ASSET, MOCK_SOL_PIN],
          },
        }),
      }),
    );
    expect(response).toStrictEqual({
      assetsBalance: {
        'mock-account-id': {
          [MOCK_SOL_ASSET]: { amount: '1000000000' },
          [MOCK_SOL_PIN]: { amount: '0' },
        },
      },
      assetsInfo: {},
      updateMode: 'full',
    });

    cleanup();
  });

  it('seeds omitted Stellar visible tokens with empty trustline metadata', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [STELLAR_SNAP_ID]: { version: '1.0.0', chainIds: [STELLAR_MAINNET] },
      },
      accountAssets: [MOCK_STELLAR_ASSET],
      balances: {
        [MOCK_STELLAR_ASSET]: { amount: '1000000000', unit: 'XLM' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_STELLAR_ASSET, MOCK_STELLAR_PIN],
        hiddenAssetIds: [],
      }),
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(
      createDataRequest({
        chainIds: [STELLAR_MAINNET],
        accounts: [
          createMockAccount({
            metadata: {
              name: 'Test Account',
              keyring: { type: 'HD Key Tree' },
              importTime: Date.now(),
              lastSelected: Date.now(),
              snap: {
                id: STELLAR_SNAP_ID,
                name: 'Stellar Snap',
                enabled: true,
              },
            },
          }),
        ],
      }),
    );

    expect(response.assetsBalance?.['mock-account-id']).toStrictEqual({
      [MOCK_STELLAR_ASSET]: { amount: '1000000000' },
      [MOCK_STELLAR_PIN]: {
        amount: '0',
        metadata: {
          authorized: false,
          limit: '0',
          sponsored: false,
        },
      },
    });

    cleanup();
  });

  it('does not zero-fill visible assets when the snap returns no balances', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {},
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_SOL_ASSET, MOCK_SOL_PIN],
        hiddenAssetIds: [],
      }),
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(response).toStrictEqual({
      assetsBalance: {},
      assetsInfo: {},
      updateMode: 'full',
    });

    cleanup();
  });

  it('does not write balances when getAccountBalances throws', async () => {
    const { controller, mockHandleRequest, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_SOL_ASSET],
        hiddenAssetIds: [],
      }),
    });
    mockHandleRequest.mockImplementation(
      (params: { request?: { method: string } }) => {
        if (params.request?.method === 'keyring_listAccountAssets') {
          return Promise.resolve([MOCK_SOL_ASSET]);
        }
        if (params.request?.method === 'keyring_getAccountBalances') {
          return Promise.reject(new Error('snap failed'));
        }
        return Promise.resolve(null);
      },
    );
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(response).toStrictEqual({
      assetsBalance: {},
      assetsInfo: {},
      updateMode: 'full',
    });

    cleanup();
  });

  it('fills an omitted visible asset from current state when the snap left it out', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_SOL_ASSET, MOCK_SOL_PIN],
        hiddenAssetIds: [],
      }),
      getAssetsState: () => ({
        ...getDefaultAssetsControllerState(),
        assetsBalance: {
          'mock-account-id': {
            [MOCK_SOL_PIN]: { amount: '42' },
          },
        },
      }),
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(response.assetsBalance?.['mock-account-id']).toStrictEqual({
      [MOCK_SOL_ASSET]: { amount: '1000000000' },
      [MOCK_SOL_PIN]: { amount: '42' },
    });

    cleanup();
  });

  it('uses the snap balance for a visible asset omitted from listAccountAssets', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
        [MOCK_SOL_PIN]: { amount: '42', unit: 'WSOL' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_SOL_ASSET, MOCK_SOL_PIN],
        hiddenAssetIds: [],
      }),
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(response.assetsBalance?.['mock-account-id']).toStrictEqual({
      [MOCK_SOL_ASSET]: { amount: '1000000000' },
      [MOCK_SOL_PIN]: { amount: '42' },
    });

    cleanup();
  });

  it('does not request hidden assets on the v6 snap fetch', async () => {
    const { controller, mockHandleRequest, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET, MOCK_SOL_PIN],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
        [MOCK_SOL_PIN]: { amount: '42', unit: 'WSOL' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_SOL_ASSET],
        hiddenAssetIds: [MOCK_SOL_PIN],
      }),
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(mockHandleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          method: 'keyring_getAccountBalances',
          params: {
            id: 'mock-account-id',
            assets: [MOCK_SOL_ASSET],
          },
        }),
      }),
    );
    expect(response.assetsBalance?.['mock-account-id']).toStrictEqual({
      [MOCK_SOL_ASSET]: { amount: '1000000000' },
    });

    cleanup();
  });

  it('fetch includes balance metadata when provided by the snap', async () => {
    const balanceMetadata = {
      spendable: '900000000',
      trustline: true,
    };

    const { controller, cleanup } = setupController({
      installedSnaps: {
        [STELLAR_SNAP_ID]: { version: '1.0.0', chainIds: [STELLAR_MAINNET] },
      },
      accountAssets: [MOCK_STELLAR_ASSET],
      balances: {
        [MOCK_STELLAR_ASSET]: {
          amount: '1000000000',
          unit: 'XLM',
          metadata: balanceMetadata,
        },
      },
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(
      createDataRequest({
        chainIds: [STELLAR_MAINNET],
        accounts: [
          createMockAccount({
            metadata: {
              name: 'Test Account',
              keyring: { type: 'HD Key Tree' },
              importTime: Date.now(),
              lastSelected: Date.now(),
              snap: {
                id: STELLAR_SNAP_ID,
                name: 'Stellar Snap',
                enabled: true,
              },
            },
          }),
        ],
      }),
    );

    expect(
      response.assetsBalance?.['mock-account-id']?.[MOCK_STELLAR_ASSET],
    ).toStrictEqual({
      amount: '1000000000',
      metadata: balanceMetadata,
    });

    cleanup();
  });

  it('fetch handles empty account assets gracefully', async () => {
    const { controller, mockHandleRequest, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [],
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    // Check that keyring_getAccountBalances was NOT called (since no assets)
    const getBalancesCalls = mockHandleRequest.mock.calls.filter((call) => {
      const params = call[0] as { request?: { method: string } };
      return params.request?.method === 'keyring_getAccountBalances';
    });
    expect(getBalancesCalls).toHaveLength(0);
    expect(response.assetsBalance).toStrictEqual({});

    cleanup();
  });

  it('fetch merges results from multiple snaps', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        [BITCOIN_SNAP_ID]: { version: '1.0.0', chainIds: [BITCOIN_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET, MOCK_BTC_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
        [MOCK_BTC_ASSET]: { amount: '100000000', unit: 'BTC' },
      },
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(
      createDataRequest({
        chainIds: [SOLANA_MAINNET, BITCOIN_MAINNET],
      }),
    );

    expect(response.assetsBalance?.['mock-account-id']).toBeDefined();

    cleanup();
  });

  it('handles snap balances updated event', async () => {
    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController({
        installedSnaps: {
          [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        },
        isBalanceV6Enabled: () => true,
      });
    await new Promise(process.nextTick);
    assetsUpdateHandler.mockClear();

    triggerBalancesUpdated({
      balances: {
        'account-1': {
          [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
        },
      },
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalledTimes(1);
    expect(assetsUpdateHandler).toHaveBeenCalledWith({
      updateMode: 'merge',
      assetsBalance: {
        'account-1': {
          [MOCK_SOL_ASSET]: { amount: '1000000000' },
        },
      },
    });

    cleanup();
  });

  it('includes balance metadata from snap balances updated event', async () => {
    const balanceMetadata = {
      spendable: '900000000',
      trustline: true,
    };

    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController({
        installedSnaps: {
          [STELLAR_SNAP_ID]: { version: '1.0.0', chainIds: [STELLAR_MAINNET] },
        },
      });
    await new Promise(process.nextTick);

    triggerBalancesUpdated({
      balances: {
        'account-1': {
          [MOCK_STELLAR_ASSET]: {
            amount: '1000000000',
            unit: 'XLM',
            metadata: balanceMetadata,
          },
        },
      },
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: {
          'account-1': {
            [MOCK_STELLAR_ASSET]: {
              amount: '1000000000',
              metadata: balanceMetadata,
            },
          },
        },
      }),
    );

    cleanup();
  });

  it('filters assets for chains without discovered snaps from balance update event', async () => {
    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController({
        installedSnaps: {
          [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        },
      });
    await new Promise(process.nextTick);

    const evmAsset = 'eip155:1/slip44:60' as Caip19AssetId;

    triggerBalancesUpdated({
      balances: {
        'account-1': {
          [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
          [evmAsset]: { amount: '5000000000000000000', unit: 'ETH' },
        },
      },
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: {
          'account-1': {
            [MOCK_SOL_ASSET]: { amount: '1000000000' },
          },
        },
      }),
    );

    cleanup();
  });

  it('skips malformed asset IDs in balance update and still applies valid balances', async () => {
    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController({
        installedSnaps: {
          [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        },
      });
    await new Promise(process.nextTick);

    triggerBalancesUpdated({
      balances: {
        'account-1': {
          'not-a-valid-caip19': { amount: '999', unit: 'FAKE' },
          [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
        },
      },
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        assetsBalance: {
          'account-1': {
            [MOCK_SOL_ASSET]: { amount: '1000000000' },
          },
        },
      }),
    );

    cleanup();
  });

  it('does not report empty balance updates', async () => {
    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController({
        installedSnaps: {
          [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        },
      });
    await new Promise(process.nextTick);

    const evmAsset = 'eip155:1/slip44:60' as Caip19AssetId;

    // Only EVM asset - no discovered snap for EVM
    triggerBalancesUpdated({
      balances: {
        'account-1': {
          [evmAsset]: { amount: '5000000000000000000', unit: 'ETH' },
        },
      },
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    cleanup();
  });

  it('subscribe performs initial fetch', async () => {
    const { controller, assetsUpdateHandler, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const subscriptionOnAssetsUpdate = jest.fn();
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: subscriptionOnAssetsUpdate,
    });

    expect(assetsUpdateHandler).toHaveBeenCalled();

    cleanup();
  });

  it('subscribe reports fetched balances via the constructor onAssetsUpdate, not the per-subscription callback', async () => {
    const { controller, assetsUpdateHandler, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);
    assetsUpdateHandler.mockClear();

    const subscriptionOnAssetsUpdate = jest.fn();
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: subscriptionOnAssetsUpdate,
    });

    expect(assetsUpdateHandler).toHaveBeenCalled();
    expect(subscriptionOnAssetsUpdate).not.toHaveBeenCalled();

    cleanup();
  });

  it('subscribe does nothing for chains without discovered snaps', async () => {
    const { controller, assetsUpdateHandler, cleanup } = setupController();
    await new Promise(process.nextTick);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET] }),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    cleanup();
  });

  it('subscribe update fetches data', async () => {
    const { controller, assetsUpdateHandler, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const subscriptionOnAssetsUpdate = jest.fn();
    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: subscriptionOnAssetsUpdate,
    });

    assetsUpdateHandler.mockClear();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        chainIds: [SOLANA_MAINNET, BITCOIN_MAINNET],
      }),
      isUpdate: true,
      onAssetsUpdate: subscriptionOnAssetsUpdate,
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalled();
    expect(subscriptionOnAssetsUpdate).not.toHaveBeenCalled();

    cleanup();
  });

  it('middleware passes to next when no supported chains', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
    });
    await new Promise(process.nextTick);

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({ chainIds: [CHAIN_MAINNET] }),
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(context);

    cleanup();
  });

  it('middleware merges response into context', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(
      context.response.assetsBalance?.['mock-account-id']?.[MOCK_SOL_ASSET],
    ).toBeDefined();
    expect(next).toHaveBeenCalled();

    cleanup();
  });

  it('middleware forwards full update mode for v6 snapshots', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
      isBalanceV6Enabled: () => true,
      getAssetVisibility: () => ({
        visibleAssetIds: [MOCK_SOL_ASSET],
        hiddenAssetIds: [],
      }),
    });
    await new Promise(process.nextTick);

    const next = jest.fn().mockImplementation(async (context) => context);
    const context = createMiddlewareContext();

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({ updateMode: 'full' }),
      }),
    );

    cleanup();
  });

  it('middleware removes handled chains from next request', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({
        chainIds: [SOLANA_MAINNET, CHAIN_MAINNET],
      }),
    });

    await controller.assetsMiddleware(context, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          chainIds: [CHAIN_MAINNET],
        }),
      }),
    );

    cleanup();
  });

  it('middleware keeps chains without discovered snaps in request', async () => {
    // No snaps discovered
    const { controller, cleanup } = setupController({
      installedSnaps: {},
    });
    await new Promise(process.nextTick);

    const next = jest.fn().mockResolvedValue(undefined);
    const context = createMiddlewareContext({
      request: createDataRequest({
        chainIds: [SOLANA_MAINNET, CHAIN_MAINNET],
      }),
    });

    await controller.assetsMiddleware(context, next);

    // All chains passed through since no snaps handle any chains
    expect(next).toHaveBeenCalledWith(context);

    cleanup();
  });

  it('destroy cleans up subscriptions', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: jest.fn(),
    });

    cleanup();

    // Just verify no errors on destroy
    expect(true).toBe(true);
  });

  describe('per-account balance fetch errors and retry', () => {
    const SOL_BALANCE = { amount: '1000000000', unit: 'SOL' };

    const failingHandler =
      (failing: { value: boolean }) =>
      (params: { request?: { method: string } }): Promise<unknown> => {
        if (params.request?.method === 'keyring_listAccountAssets') {
          return Promise.resolve([MOCK_SOL_ASSET]);
        }
        if (params.request?.method === 'keyring_getAccountBalances') {
          return failing.value
            ? Promise.reject(
                new Error('the account has not been synchronized yet'),
              )
            : Promise.resolve({ [MOCK_SOL_ASSET]: SOL_BALANCE });
        }
        return Promise.resolve(null);
      };

    const setupFailing = (
      options: {
        isBalanceV6Enabled?: () => boolean;
        retryBackoff?: SnapDataSourceOptions['retryBackoff'];
        onBalanceFetchStatusChange?: jest.Mock;
      } = {},
    ): SetupResult & {
      failing: { value: boolean };
      onStatus: jest.Mock;
    } => {
      const onStatus = options.onBalanceFetchStatusChange ?? jest.fn();
      const failing = { value: true };
      const setup = setupController({
        installedSnaps: {
          [SOLANA_SNAP_ID]: { version: '1.0.0', chainIds: [SOLANA_MAINNET] },
        },
        isBalanceV6Enabled: options.isBalanceV6Enabled ?? ((): boolean => true),
        getAssetVisibility: () => ({
          visibleAssetIds: [MOCK_SOL_ASSET],
          hiddenAssetIds: [],
        }),
        onBalanceFetchStatusChange: onStatus,
        // Long default so automatic retries never fire unless a test wants them.
        retryBackoff: options.retryBackoff ?? { initialDelayMs: 60_000 },
      });
      setup.mockHandleRequest.mockImplementation(failingHandler(failing));
      return { ...setup, failing, onStatus };
    };

    const flush = async (ms = 0): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    };

    it('getSnapBalanceRetryDelay grows exponentially and is capped', () => {
      expect(getSnapBalanceRetryDelay(1, 1000, 10_000)).toBe(1000);
      expect(getSnapBalanceRetryDelay(2, 1000, 10_000)).toBe(2000);
      expect(getSnapBalanceRetryDelay(3, 1000, 10_000)).toBe(4000);
      expect(getSnapBalanceRetryDelay(10, 1000, 10_000)).toBe(10_000);
      expect(getSnapBalanceRetryDelay(0)).toBe(30_000);
      expect(getSnapBalanceRetryDelay(100)).toBe(300_000);
    });

    it.each([
      ['v6', true],
      ['v5', false],
    ])(
      'reports the account as unavailable instead of swallowing the error (%s)',
      async (_label, v6) => {
        const { controller, onStatus, cleanup } = setupFailing({
          isBalanceV6Enabled: (): boolean => v6,
        });
        await flush();

        const response = await controller.fetch(createDataRequest());

        expect(response.assetsBalance).toStrictEqual({});
        expect(onStatus).toHaveBeenLastCalledWith({
          accountId: 'mock-account-id',
          chainIds: [SOLANA_MAINNET],
          error: expect.objectContaining({
            status: 'unavailable',
            error: 'the account has not been synchronized yet',
            attempts: expect.any(Number),
            failedAt: expect.any(Number),
            nextRetryAt: expect.any(Number),
          }),
        });
        expect(controller.getAccountBalanceErrors()).toStrictEqual({
          'mock-account-id': {
            chainIds: [SOLANA_MAINNET],
            attempts: expect.any(Number),
          },
        });

        cleanup();
      },
    );

    const lastError = (
      onStatus: jest.Mock,
    ): {
      attempts: number;
      failedAt: number;
      nextRetryAt: number | null;
      error: string;
    } => {
      const calls = onStatus.mock.calls.filter(
        ([update]) => update.accountId === 'mock-account-id' && update.error,
      );
      return calls[calls.length - 1]?.[0].error;
    };

    it('does not count ordinary failed fetches as retry attempts, and schedules the first retry after the initial delay', async () => {
      const { controller, onStatus, cleanup } = setupFailing({
        retryBackoff: { initialDelayMs: 30_000, maxDelayMs: 300_000 },
      });
      await flush();

      // Onboarding: many fetches fail within seconds (subscriptions, polling,
      // other controllers). None of them is a retry.
      for (let i = 0; i < 13; i++) {
        await controller.fetch(createDataRequest());
      }

      expect(
        controller.getAccountBalanceErrors()['mock-account-id']?.attempts,
      ).toBe(0);
      const status = lastError(onStatus);
      expect(status.attempts).toBe(0);
      expect(status.nextRetryAt).not.toBeNull();
      // The retry scheduled by the first failure is kept: ~30 s, not the cap.
      expect(
        (status.nextRetryAt as number) - status.failedAt,
      ).toBeLessThanOrEqual(30_000);
      expect((status.nextRetryAt as number) - Date.now()).toBeGreaterThan(
        25_000,
      );

      cleanup();
    });

    it('notifies repeated ordinary failures only when the error changes', async () => {
      const { controller, onStatus, cleanup } = setupFailing();
      await flush();
      await controller.fetch(createDataRequest());
      const callsAfterFirst = onStatus.mock.calls.length;

      await controller.fetch(createDataRequest());
      await controller.fetch(createDataRequest());

      expect(onStatus.mock.calls).toHaveLength(callsAfterFirst);

      cleanup();
    });

    it('only scheduled retries advance the backoff (30 s, 60 s, ... capped)', async () => {
      const { controller, onStatus, cleanup } = setupFailing({
        retryBackoff: { initialDelayMs: 20, maxDelayMs: 80 },
      });
      await flush();
      await controller.fetch(createDataRequest());
      const first = lastError(onStatus);
      expect(first.attempts).toBe(0);
      expect((first.nextRetryAt as number) - first.failedAt).toBe(20);

      // First scheduled retry fires after ~20 ms and fails again.
      await flush(35);
      const second = lastError(onStatus);
      expect(second.attempts).toBe(1);
      expect((second.nextRetryAt as number) - second.failedAt).toBe(40);

      // Second scheduled retry fires after ~40 ms more.
      await flush(55);
      const third = lastError(onStatus);
      expect(third.attempts).toBe(2);
      expect((third.nextRetryAt as number) - third.failedAt).toBe(80);

      cleanup();
    });

    it('a failed manual retry resets the backoff to the initial delay', async () => {
      const { controller, onStatus, cleanup } = setupFailing({
        retryBackoff: { initialDelayMs: 20, maxDelayMs: 80 },
      });
      await flush();
      await controller.fetch(createDataRequest());
      await flush(35);
      expect(lastError(onStatus).attempts).toBe(1);

      await controller.retryFailedAccounts(['mock-account-id']);

      const status = lastError(onStatus);
      expect(status.attempts).toBe(0);
      expect((status.nextRetryAt as number) - status.failedAt).toBe(20);

      cleanup();
    });

    it('a manual retry calls the snap again (so it can start a sync)', async () => {
      const { controller, mockHandleRequest, cleanup } = setupFailing();
      await flush();
      await controller.fetch(createDataRequest());
      mockHandleRequest.mockClear();

      await controller.retryFailedAccounts();

      expect(mockHandleRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            method: 'keyring_getAccountBalances',
          }),
        }),
      );

      cleanup();
    });

    it('retryFailedAccounts clears the error and reports balances on success', async () => {
      const { controller, failing, onStatus, assetsUpdateHandler, cleanup } =
        setupFailing();
      await flush();
      await controller.fetch(createDataRequest());
      assetsUpdateHandler.mockClear();

      failing.value = false;
      await controller.retryFailedAccounts(['mock-account-id']);

      expect(onStatus).toHaveBeenLastCalledWith({
        accountId: 'mock-account-id',
        chainIds: [SOLANA_MAINNET],
        error: null,
      });
      expect(controller.getAccountBalanceErrors()).toStrictEqual({});
      expect(assetsUpdateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          assetsBalance: {
            'mock-account-id': { [MOCK_SOL_ASSET]: { amount: '1000000000' } },
          },
        }),
      );

      cleanup();
    });

    it('retryFailedAccounts ignores accounts that did not fail', async () => {
      const { controller, mockHandleRequest, cleanup } = setupFailing();
      await flush();
      mockHandleRequest.mockClear();

      await controller.retryFailedAccounts(['some-other-account']);

      expect(mockHandleRequest).not.toHaveBeenCalled();

      cleanup();
    });

    it('a successful fetch clears a previous failure', async () => {
      const { controller, failing, onStatus, cleanup } = setupFailing();
      await flush();
      await controller.fetch(createDataRequest());

      failing.value = false;
      const response = await controller.fetch(createDataRequest());

      expect(response.assetsBalance).toStrictEqual({
        'mock-account-id': { [MOCK_SOL_ASSET]: { amount: '1000000000' } },
      });
      expect(onStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ error: null }),
      );
      expect(controller.getAccountBalanceErrors()).toStrictEqual({});

      cleanup();
    });

    it('a snap balances-updated event for the account clears the failure', async () => {
      const { controller, onStatus, triggerBalancesUpdated, cleanup } =
        setupFailing();
      await flush();
      await controller.fetch(createDataRequest());

      triggerBalancesUpdated({
        balances: {
          'mock-account-id': { [MOCK_SOL_ASSET]: SOL_BALANCE },
        },
      });
      await flush();

      expect(onStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ accountId: 'mock-account-id', error: null }),
      );
      expect(controller.getAccountBalanceErrors()).toStrictEqual({});

      cleanup();
    });

    it('retries automatically with backoff until the fetch succeeds', async () => {
      const { controller, failing, onStatus, assetsUpdateHandler, cleanup } =
        setupFailing({ retryBackoff: { initialDelayMs: 20, maxDelayMs: 40 } });
      await flush();
      await controller.fetch(createDataRequest());
      failing.value = false;
      assetsUpdateHandler.mockClear();

      await flush(150);

      expect(onStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({ error: null }),
      );
      expect(controller.getAccountBalanceErrors()).toStrictEqual({});
      expect(assetsUpdateHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          assetsBalance: {
            'mock-account-id': { [MOCK_SOL_ASSET]: { amount: '1000000000' } },
          },
        }),
      );

      cleanup();
    });

    it('destroy cancels pending retries', async () => {
      const { controller, mockHandleRequest, cleanup } = setupFailing({
        retryBackoff: { initialDelayMs: 20 },
      });
      await flush();
      await controller.fetch(createDataRequest());
      cleanup();
      mockHandleRequest.mockClear();

      await flush(100);

      expect(mockHandleRequest).not.toHaveBeenCalled();
    });

    it('a throwing status listener does not break the fetch', async () => {
      const onStatus = jest.fn(() => {
        throw new Error('listener failed');
      });
      const { controller, cleanup } = setupFailing({
        onBalanceFetchStatusChange: onStatus,
      });
      await flush();

      const response = await controller.fetch(createDataRequest());

      expect(response.assetsBalance).toStrictEqual({});
      expect(onStatus).toHaveBeenCalled();

      cleanup();
    });
  });

  it('createSnapDataSource factory creates instance', async () => {
    const rootMessenger = new Messenger<
      MockAnyNamespace,
      AllActions,
      AllEvents
    >({
      namespace: MOCK_ANY_NAMESPACE,
    });

    const controllerMessenger = new Messenger<
      'SnapDataSource',
      AllActions,
      AllEvents,
      RootMessenger
    >({
      namespace: 'SnapDataSource',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger: controllerMessenger,
      actions: [
        'SnapController:getRunnableSnaps',
        'SnapController:handleRequest',
        'PermissionController:getPermissions',
      ],
      events: ['AccountsController:accountBalancesUpdated'],
    });
    rootMessenger.registerActionHandler(
      'SnapController:getRunnableSnaps',
      jest.fn().mockReturnValue([]),
    );
    rootMessenger.registerActionHandler(
      'SnapController:handleRequest',
      jest.fn(),
    );
    rootMessenger.registerActionHandler(
      'PermissionController:getPermissions',
      jest.fn().mockReturnValue(undefined),
    );

    const instance = createSnapDataSource({
      messenger: controllerMessenger as unknown as AssetsControllerMessenger,
      onActiveChainsUpdated: jest.fn(),
      onAssetsUpdate: jest.fn(),
      isBalanceV6Enabled: () => false,
      getAssetVisibility: () => ({
        visibleAssetIds: [],
        hiddenAssetIds: [],
      }),
      getAssetsState: getDefaultAssetsControllerState,
    });

    await new Promise(process.nextTick);

    expect(instance).toBeInstanceOf(SnapDataSource);
    expect(instance.getName()).toBe('SnapDataSource');

    instance.destroy();
  });
});
