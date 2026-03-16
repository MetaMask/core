/* eslint-disable jest/unbound-method */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MockAnyNamespace } from '@metamask/messenger';
import type {
  PermissionConstraint,
  SubjectPermissions,
} from '@metamask/permission-controller';

import type {
  SnapDataSourceOptions,
  AccountBalancesUpdatedEventPayload,
  SnapDataSourceAllowedActions,
  SnapDataSourceAllowedEvents,
} from './SnapDataSource';
import {
  SnapDataSource,
  createSnapDataSource,
  extractChainFromAssetId,
  getChainIdsCaveat,
  KEYRING_PERMISSION,
  ASSETS_PERMISSION,
} from './SnapDataSource';
import type { AssetsControllerMessenger } from '../AssetsController';
import type { ChainId, DataRequest, Context, Caip19AssetId } from '../types';

// Test chain IDs
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as ChainId;
const BITCOIN_MAINNET = 'bip122:000000000019d6689c085ae165831e93' as ChainId;
const TRON_MAINNET = 'tron:728126428' as ChainId;

// Test snap IDs
const SOLANA_SNAP_ID = 'npm:@metamask/solana-wallet-snap';
const BITCOIN_SNAP_ID = 'npm:@metamask/bitcoin-wallet-snap';

type AllActions = SnapDataSourceAllowedActions;
type AllEvents = SnapDataSourceAllowedEvents;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_SOL_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501' as Caip19AssetId;
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
    getAssetsState: jest.fn().mockReturnValue({ assetsInfo: {} }),
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
  balances: Record<string, { amount: string; unit: string }> = {},
): jest.Mock {
  return jest.fn().mockImplementation((params) => {
    const { request } = params;
    if (request?.method === 'keyring_listAccountAssets') {
      return Promise.resolve(accountAssets);
    }
    if (request?.method === 'keyring_getAccountBalances') {
      return Promise.resolve(balances);
    }
    return Promise.resolve(null);
  });
}

function setupController(
  options: {
    installedSnaps?: Record<string, { version: string; chainIds?: ChainId[] }>;
    accountAssets?: string[];
    balances?: Record<string, { amount: string; unit: string }>;
    configuredNetworks?: ChainId[];
  } = {},
): SetupResult {
  const { installedSnaps = {}, accountAssets = [], balances = {} } = options;

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
    return undefined;
  });
  rootMessenger.registerActionHandler(
    'PermissionController:getPermissions',
    mockGetPermissions,
  );

  const controllerOptions: SnapDataSourceOptions = {
    messenger: controllerMessenger as unknown as AssetsControllerMessenger,
    onActiveChainsUpdated: activeChainsUpdateHandler,
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
      updateMode: 'full',
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
      updateMode: 'full',
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
      });
    await new Promise(process.nextTick);

    triggerBalancesUpdated({
      balances: {
        'account-1': {
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

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });

    expect(assetsUpdateHandler).toHaveBeenCalled();

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

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest(),
      isUpdate: false,
      onAssetsUpdate: assetsUpdateHandler,
    });

    assetsUpdateHandler.mockClear();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        chainIds: [SOLANA_MAINNET, BITCOIN_MAINNET],
      }),
      isUpdate: true,
      onAssetsUpdate: assetsUpdateHandler,
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalled();

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
    });

    await new Promise(process.nextTick);

    expect(instance).toBeInstanceOf(SnapDataSource);
    expect(instance.getName()).toBe('SnapDataSource');

    instance.destroy();
  });
});
