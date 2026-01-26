/* eslint-disable jest/unbound-method */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type {
  SnapDataSourceMessenger,
  SnapDataSourceOptions,
  SnapProvider,
  AccountBalancesUpdatedEventPayload,
} from './SnapDataSource';
import {
  SnapDataSource,
  createSnapDataSource,
  getSnapTypeForChain,
  isSnapSupportedChain,
  extractChainFromAssetId,
  isSolanaChain,
  isBitcoinChain,
  isTronChain,
  SOLANA_MAINNET,
  SOLANA_SNAP_ID,
  BITCOIN_MAINNET,
  BITCOIN_SNAP_ID,
  TRON_MAINNET,
  ALL_DEFAULT_NETWORKS,
} from './SnapDataSource';
import type { ChainId, DataRequest, Context, Caip19AssetId } from '../types';

type AllActions = MessengerActions<SnapDataSourceMessenger>;
type AllEvents = MessengerEvents<SnapDataSourceMessenger>;
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
  snapProvider: jest.Mocked<SnapProvider>;
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
    },
    ...overrides,
  } as InternalAccount;
}

function createDataRequest(overrides?: Partial<DataRequest>): DataRequest {
  return {
    chainIds: [SOLANA_MAINNET],
    accounts: [createMockAccount()],
    dataTypes: ['balance'],
    ...overrides,
  };
}

function createMiddlewareContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: jest.fn().mockReturnValue({ assetsMetadata: {} }),
    ...overrides,
  };
}

function createMockSnapProvider(
  installedSnaps: Record<string, { version: string }> = {},
  accountAssets: string[] = [],
  balances: Record<string, { amount: string; unit: string }> = {},
): jest.Mocked<SnapProvider> {
  return {
    request: jest.fn().mockImplementation(({ method, params }) => {
      if (method === 'wallet_getSnaps') {
        return Promise.resolve(installedSnaps);
      }
      if (method === 'wallet_invokeSnap') {
        const snapRequest = params?.request;
        if (snapRequest?.method === 'keyring_listAccountAssets') {
          return Promise.resolve(accountAssets);
        }
        if (snapRequest?.method === 'keyring_getAccountBalances') {
          return Promise.resolve(balances);
        }
      }
      return Promise.resolve(null);
    }),
  };
}

function setupController(
  options: {
    installedSnaps?: Record<string, { version: string }>;
    accountAssets?: string[];
    balances?: Record<string, { amount: string; unit: string }>;
    configuredNetworks?: ChainId[];
  } = {},
): SetupResult {
  const {
    installedSnaps = {},
    accountAssets = [],
    balances = {},
    configuredNetworks,
  } = options;

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions, AllEvents>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const controllerMessenger = new Messenger<
    'SnapDataSource',
    MessengerActions<SnapDataSourceMessenger>,
    MessengerEvents<SnapDataSourceMessenger>,
    RootMessenger
  >({
    namespace: 'SnapDataSource',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: controllerMessenger,
    actions: [
      'AssetsController:assetsUpdate',
      'AssetsController:activeChainsUpdate',
    ],
    events: ['AccountsController:accountBalancesUpdated'],
  });

  const assetsUpdateHandler = jest.fn().mockResolvedValue(undefined);
  const activeChainsUpdateHandler = jest.fn();

  rootMessenger.registerActionHandler(
    'AssetsController:assetsUpdate',
    assetsUpdateHandler,
  );
  rootMessenger.registerActionHandler(
    'AssetsController:activeChainsUpdate',
    activeChainsUpdateHandler,
  );

  const snapProvider = createMockSnapProvider(
    installedSnaps,
    accountAssets,
    balances,
  );

  const controllerOptions: SnapDataSourceOptions = {
    messenger: controllerMessenger,
    snapProvider,
  };

  if (configuredNetworks) {
    controllerOptions.configuredNetworks = configuredNetworks;
  }

  const controller = new SnapDataSource(controllerOptions);

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
    snapProvider,
    assetsUpdateHandler,
    activeChainsUpdateHandler,
    triggerBalancesUpdated,
    cleanup,
  };
}

describe('SnapDataSource helper functions', () => {
  describe('getSnapTypeForChain', () => {
    it.each([
      { chainId: SOLANA_MAINNET, expected: 'solana' },
      { chainId: 'solana:devnet' as ChainId, expected: 'solana' },
      { chainId: BITCOIN_MAINNET, expected: 'bitcoin' },
      { chainId: 'bip122:testnet' as ChainId, expected: 'bitcoin' },
      { chainId: TRON_MAINNET, expected: 'tron' },
      { chainId: 'tron:0x2b6653dc' as ChainId, expected: 'tron' },
      { chainId: CHAIN_MAINNET, expected: null },
      { chainId: 'eip155:137' as ChainId, expected: null },
    ])('returns $expected for $chainId', ({ chainId, expected }) => {
      expect(getSnapTypeForChain(chainId)).toBe(expected);
    });
  });

  describe('isSnapSupportedChain', () => {
    it.each([
      { chainId: SOLANA_MAINNET, expected: true },
      { chainId: BITCOIN_MAINNET, expected: true },
      { chainId: TRON_MAINNET, expected: true },
      { chainId: CHAIN_MAINNET, expected: false },
    ])('returns $expected for $chainId', ({ chainId, expected }) => {
      expect(isSnapSupportedChain(chainId)).toBe(expected);
    });
  });

  describe('extractChainFromAssetId', () => {
    it.each([
      { assetId: MOCK_SOL_ASSET, expected: SOLANA_MAINNET },
      { assetId: MOCK_BTC_ASSET, expected: BITCOIN_MAINNET },
      { assetId: MOCK_TRON_ASSET, expected: TRON_MAINNET },
    ])('extracts $expected from $assetId', ({ assetId, expected }) => {
      expect(extractChainFromAssetId(assetId)).toBe(expected);
    });
  });

  describe('chain type helpers', () => {
    it('isSolanaChain returns true for solana chains', () => {
      expect(isSolanaChain(SOLANA_MAINNET)).toBe(true);
      expect(isSolanaChain(BITCOIN_MAINNET)).toBe(false);
    });

    it('isBitcoinChain returns true for bitcoin chains', () => {
      expect(isBitcoinChain(BITCOIN_MAINNET)).toBe(true);
      expect(isBitcoinChain(SOLANA_MAINNET)).toBe(false);
    });

    it('isTronChain returns true for tron chains', () => {
      expect(isTronChain(TRON_MAINNET)).toBe(true);
      expect(isTronChain(SOLANA_MAINNET)).toBe(false);
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

  it('initializes with default networks', async () => {
    const { controller, cleanup } = setupController();
    await new Promise(process.nextTick);

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual(ALL_DEFAULT_NETWORKS);

    cleanup();
  });

  it('initializes with configured networks', async () => {
    const { controller, cleanup } = setupController({
      configuredNetworks: [SOLANA_MAINNET, BITCOIN_MAINNET],
    });
    await new Promise(process.nextTick);

    const chains = await controller.getActiveChains();
    expect(chains).toStrictEqual([SOLANA_MAINNET, BITCOIN_MAINNET]);

    cleanup();
  });

  it('registers action handlers', async () => {
    const { messenger, cleanup } = setupController();
    await new Promise(process.nextTick);

    const middleware = messenger.call('SnapDataSource:getAssetsMiddleware');
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');

    cleanup();
  });

  it('checks snap availability on initialization', async () => {
    const { controller, snapProvider, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
      },
    });
    await new Promise(process.nextTick);

    expect(snapProvider.request).toHaveBeenCalledWith({
      method: 'wallet_getSnaps',
      params: {},
    });
    expect(controller.isSnapAvailable('solana')).toBe(true);
    expect(controller.isSnapAvailable('bitcoin')).toBe(false);

    cleanup();
  });

  it('getSnapsInfo returns all snap info', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
        [BITCOIN_SNAP_ID]: { version: '2.0.0' },
      },
    });
    await new Promise(process.nextTick);

    const info = controller.getSnapsInfo();

    expect(info.solana).toStrictEqual({
      snapId: SOLANA_SNAP_ID,
      chainPrefix: 'solana:',
      pollInterval: 30000,
      version: '1.0.0',
      available: true,
    });
    expect(info.bitcoin).toStrictEqual({
      snapId: BITCOIN_SNAP_ID,
      chainPrefix: 'bip122:',
      pollInterval: 60000,
      version: '2.0.0',
      available: true,
    });
    expect(info.tron.available).toBe(false);

    cleanup();
  });

  it('refreshSnapsStatus updates availability', async () => {
    const { controller, snapProvider, cleanup } = setupController();
    await new Promise(process.nextTick);

    expect(controller.isSnapAvailable('solana')).toBe(false);

    snapProvider.request.mockImplementation(({ method }) => {
      if (method === 'wallet_getSnaps') {
        return Promise.resolve({
          [SOLANA_SNAP_ID]: { version: '1.0.0' },
        });
      }
      return Promise.resolve(null);
    });

    await controller.refreshSnapsStatus();

    expect(controller.isSnapAvailable('solana')).toBe(true);

    cleanup();
  });

  it('addNetworks adds snap-supported chains', async () => {
    const { controller, activeChainsUpdateHandler, cleanup } = setupController({
      configuredNetworks: [SOLANA_MAINNET],
    });
    await new Promise(process.nextTick);

    controller.addNetworks([BITCOIN_MAINNET, CHAIN_MAINNET]);

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith(
      'SnapDataSource',
      expect.arrayContaining([SOLANA_MAINNET, BITCOIN_MAINNET]),
    );

    cleanup();
  });

  it('addNetworks ignores non-snap chains', async () => {
    const { controller, activeChainsUpdateHandler, cleanup } = setupController({
      configuredNetworks: [SOLANA_MAINNET],
    });
    await new Promise(process.nextTick);

    controller.addNetworks([CHAIN_MAINNET]);

    expect(activeChainsUpdateHandler).not.toHaveBeenCalled();

    cleanup();
  });

  it('removeNetworks removes chains', async () => {
    const { controller, activeChainsUpdateHandler, cleanup } = setupController({
      configuredNetworks: [SOLANA_MAINNET, BITCOIN_MAINNET],
    });
    await new Promise(process.nextTick);

    controller.removeNetworks([SOLANA_MAINNET]);

    expect(activeChainsUpdateHandler).toHaveBeenCalledWith('SnapDataSource', [
      BITCOIN_MAINNET,
    ]);

    cleanup();
  });

  it('fetch returns empty response for non-snap chains', async () => {
    const { controller, cleanup } = setupController();
    await new Promise(process.nextTick);

    const response = await controller.fetch(
      createDataRequest({ chainIds: [CHAIN_MAINNET] }),
    );

    expect(response).toStrictEqual({});

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

  it('fetch returns error when snap not available', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {},
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(response.errors?.[SOLANA_MAINNET]).toBe('solana snap not available');

    cleanup();
  });

  it('fetch calls snap keyring methods when snap available', async () => {
    const { controller, snapProvider, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    expect(snapProvider.request).toHaveBeenCalledWith({
      method: 'wallet_invokeSnap',
      params: {
        snapId: SOLANA_SNAP_ID,
        request: {
          method: 'keyring_listAccountAssets',
          params: { id: 'mock-account-id' },
        },
      },
    });
    expect(snapProvider.request).toHaveBeenCalledWith({
      method: 'wallet_invokeSnap',
      params: {
        snapId: SOLANA_SNAP_ID,
        request: {
          method: 'keyring_getAccountBalances',
          params: { id: 'mock-account-id', assets: [MOCK_SOL_ASSET] },
        },
      },
    });
    expect(
      response.assetsBalance?.['mock-account-id']?.[MOCK_SOL_ASSET],
    ).toStrictEqual({ amount: '1000000000' });

    cleanup();
  });

  it('fetch skips accounts without supported scopes', async () => {
    const { controller, snapProvider, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
      },
      accountAssets: [MOCK_SOL_ASSET],
      balances: {
        [MOCK_SOL_ASSET]: { amount: '1000000000', unit: 'SOL' },
      },
    });
    await new Promise(process.nextTick);

    const evmOnlyAccount = createMockAccount({
      scopes: ['eip155:0'],
    });

    await controller.fetch(
      createDataRequest({
        accounts: [evmOnlyAccount],
      }),
    );

    const invokeSnapCalls = snapProvider.request.mock.calls.filter((call) => {
      const arg = call[0] as { method: string };
      return arg.method === 'wallet_invokeSnap';
    });
    expect(invokeSnapCalls).toHaveLength(0);

    cleanup();
  });

  it('fetch handles empty account assets gracefully', async () => {
    const { controller, snapProvider, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
      },
      accountAssets: [],
    });
    await new Promise(process.nextTick);

    const response = await controller.fetch(createDataRequest());

    const getBalancesCalls = snapProvider.request.mock.calls.filter((call) => {
      const arg = call[0] as {
        method: string;
        params?: { request?: { method: string } };
      };
      return (
        arg.method === 'wallet_invokeSnap' &&
        arg.params?.request?.method === 'keyring_getAccountBalances'
      );
    });
    expect(getBalancesCalls).toHaveLength(0);
    expect(response.assetsBalance).toStrictEqual({});

    cleanup();
  });

  it('fetch merges results from multiple snaps', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
        [BITCOIN_SNAP_ID]: { version: '1.0.0' },
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
      setupController();
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
      'SnapDataSource',
    );

    cleanup();
  });

  it('filters non-snap assets from balance update event', async () => {
    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController();
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
      'SnapDataSource',
    );

    cleanup();
  });

  it('does not report empty balance updates', async () => {
    const { triggerBalancesUpdated, assetsUpdateHandler, cleanup } =
      setupController();
    await new Promise(process.nextTick);

    const evmAsset = 'eip155:1/slip44:60' as Caip19AssetId;

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
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
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
    });

    expect(assetsUpdateHandler).toHaveBeenCalled();

    cleanup();
  });

  it('subscribe does nothing for non-snap chains', async () => {
    const { controller, assetsUpdateHandler, cleanup } = setupController();
    await new Promise(process.nextTick);

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({ chainIds: [CHAIN_MAINNET] }),
      isUpdate: false,
    });

    expect(assetsUpdateHandler).not.toHaveBeenCalled();

    cleanup();
  });

  it('subscribe update fetches data', async () => {
    const { controller, assetsUpdateHandler, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
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
    });

    assetsUpdateHandler.mockClear();

    await controller.subscribe({
      subscriptionId: 'sub-1',
      request: createDataRequest({
        chainIds: [SOLANA_MAINNET, BITCOIN_MAINNET],
      }),
      isUpdate: true,
    });

    await new Promise(process.nextTick);

    expect(assetsUpdateHandler).toHaveBeenCalled();

    cleanup();
  });

  it('middleware passes to next when no supported chains', async () => {
    const { controller, cleanup } = setupController({
      configuredNetworks: [SOLANA_MAINNET],
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
      configuredNetworks: [SOLANA_MAINNET],
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
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
      configuredNetworks: [SOLANA_MAINNET],
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
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

  it('middleware keeps failed chains in request', async () => {
    const { controller, cleanup } = setupController({
      configuredNetworks: [SOLANA_MAINNET],
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

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          chainIds: expect.arrayContaining([SOLANA_MAINNET, CHAIN_MAINNET]),
        }),
      }),
    );

    cleanup();
  });

  it('destroy cleans up subscriptions', async () => {
    const { controller, cleanup } = setupController({
      installedSnaps: {
        [SOLANA_SNAP_ID]: { version: '1.0.0' },
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
      MessengerActions<SnapDataSourceMessenger>,
      MessengerEvents<SnapDataSourceMessenger>,
      RootMessenger
    >({
      namespace: 'SnapDataSource',
      parent: rootMessenger,
    });

    rootMessenger.delegate({
      messenger: controllerMessenger,
      actions: [
        'AssetsController:assetsUpdate',
        'AssetsController:activeChainsUpdate',
      ],
      events: ['AccountsController:accountBalancesUpdated'],
    });

    rootMessenger.registerActionHandler(
      'AssetsController:assetsUpdate',
      jest.fn(),
    );
    rootMessenger.registerActionHandler(
      'AssetsController:activeChainsUpdate',
      jest.fn(),
    );

    const snapProvider = createMockSnapProvider();

    const instance = createSnapDataSource({
      messenger: controllerMessenger,
      snapProvider,
    });

    await new Promise(process.nextTick);

    expect(instance).toBeInstanceOf(SnapDataSource);
    expect(instance.getName()).toBe('SnapDataSource');

    instance.destroy();
  });
});
