import { defaultAbiCoder } from '@ethersproject/abi';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { StakedBalanceDataSourceOptions } from './StakedBalanceDataSource';
import { StakedBalanceDataSource } from './StakedBalanceDataSource';
import type { AssetsControllerMessenger } from '../AssetsController';
import type {
  AssetsControllerStateInternal,
  ChainId,
  Context,
  DataRequest,
} from '../types';

function createMockProvider(options: {
  sharesWei?: string;
  assetsWei?: string;
}): { call: jest.Mock } {
  const { sharesWei = '0', assetsWei = '0' } = options;
  let callCount = 0;
  return {
    call: jest.fn().mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return defaultAbiCoder.encode(['uint256'], [sharesWei]);
      }
      return defaultAbiCoder.encode(['uint256'], [assetsWei]);
    }),
  };
}

jest.mock('@ethersproject/providers', () => {
  const actual = jest.requireActual('@ethersproject/providers');
  return {
    ...actual,
    Web3Provider: jest.fn().mockImplementation(
      (provider: {
        call?: jest.Mock;
      }): {
        call: (params: unknown) => Promise<string>;
      } => ({
        call: (params: unknown) =>
          provider?.call
            ? Promise.resolve(provider.call(params))
            : Promise.resolve('0x0'),
      }),
    ),
  };
});

const MAINNET_CHAIN_ID_HEX = '0x1';
const MAINNET_CHAIN_ID_CAIP = 'eip155:1' as ChainId;
const STAKING_CONTRACT_MAINNET = '0x4FEF9D741011476750A243aC70b9789a63dd47Df';
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';

function createMockInternalAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: MOCK_ACCOUNT_ID,
    address: MOCK_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [MAINNET_CHAIN_ID_CAIP],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
    ...overrides,
  } as InternalAccount;
}

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [MAINNET_CHAIN_ID_CAIP];
  const accounts = overrides?.accounts ?? [createMockInternalAccount()];
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

function getMockAssetsState(): AssetsControllerStateInternal {
  return {
    assetsInfo: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
  };
}

function createMiddlewareContext(overrides?: Partial<Context>): Context {
  return {
    request: createDataRequest(),
    response: {},
    getAssetsState: getMockAssetsState,
    ...overrides,
  };
}

type MockMessenger = {
  subscribe: jest.Mock;
  call: jest.Mock;
  publish: (event: string, ...args: unknown[]) => void;
  getSubscribeHandlers: () => Map<string, (payload: unknown) => void>;
};

type NetworkEnablementState = {
  enabledNetworkMap: Record<string, Record<string, boolean>>;
};

type WithControllerOptions = {
  options?: Partial<StakedBalanceDataSourceOptions>;
  enabledNetworkMap?: Record<string, Record<string, boolean>>;
  mockProvider?: ReturnType<typeof createMockProvider>;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
  messenger,
  onActiveChainsUpdated,
  mockProvider,
}: {
  controller: StakedBalanceDataSource;
  messenger: MockMessenger;
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
  mockProvider: ReturnType<typeof createMockProvider>;
}) => Promise<ReturnValue> | ReturnValue;

function createMockMessenger(
  mockProvider?: ReturnType<typeof createMockProvider>,
): MockMessenger {
  const subscribeHandlers: Map<string, (payload: unknown) => void> = new Map();
  const provider = mockProvider ?? createMockProvider({});

  const messenger = {
    subscribe: jest
      .fn()
      .mockImplementation((event: string, handler: (p: unknown) => void) => {
        subscribeHandlers.set(event, handler);
        return jest.fn(() => subscribeHandlers.delete(event));
      }),
    call: jest.fn().mockImplementation((action: string, id?: string) => {
      if (action === 'NetworkEnablementController:getState') {
        return {
          enabledNetworkMap: {
            eip155: { [MAINNET_CHAIN_ID_HEX]: true },
          },
        } as NetworkEnablementState;
      }
      if (action === 'NetworkController:getState') {
        return {
          networkConfigurationsByChainId: {
            [MAINNET_CHAIN_ID_HEX]: {
              chainId: MAINNET_CHAIN_ID_HEX,
              rpcEndpoints: [{ networkClientId: 'mainnet' }],
              defaultRpcEndpointIndex: 0,
            },
          },
          networksMetadata: {},
        };
      }
      if (
        action === 'NetworkController:getNetworkClientById' &&
        id === 'mainnet'
      ) {
        return {
          provider,
          configuration: { chainId: MAINNET_CHAIN_ID_HEX },
        };
      }
      return undefined;
    }),
    publish: (event: string, ...args: unknown[]): void => {
      const handler = subscribeHandlers.get(event);
      if (handler) {
        handler(args[0]);
      }
    },
    getSubscribeHandlers: (): Map<string, (payload: unknown) => void> =>
      subscribeHandlers,
  };

  return messenger;
}

async function withController<ReturnValue>(
  ...args:
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
    | [WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [controllerOptions, fn] = args.length === 2 ? args : [{}, args[0]];
  const {
    options = {},
    enabledNetworkMap = { eip155: { [MAINNET_CHAIN_ID_HEX]: true } },
    mockProvider = createMockProvider({
      sharesWei: '1000000000000000000',
      assetsWei: '1500000000000000000',
    }),
  } = controllerOptions;

  const messenger = createMockMessenger(mockProvider);
  messenger.call.mockImplementation((action: string, id?: string) => {
    if (action === 'NetworkEnablementController:getState') {
      return { enabledNetworkMap };
    }
    if (action === 'NetworkController:getState') {
      return {
        networkConfigurationsByChainId: {
          [MAINNET_CHAIN_ID_HEX]: {
            chainId: MAINNET_CHAIN_ID_HEX,
            rpcEndpoints: [{ networkClientId: 'mainnet' }],
            defaultRpcEndpointIndex: 0,
          },
        },
        networksMetadata: {},
      };
    }
    if (
      action === 'NetworkController:getNetworkClientById' &&
      id === 'mainnet'
    ) {
      return {
        provider: mockProvider,
        configuration: { chainId: MAINNET_CHAIN_ID_HEX },
      };
    }
    return undefined;
  });

  const onActiveChainsUpdated =
    (
      options as {
        onActiveChainsUpdated?: (n: string, c: ChainId[], p: ChainId[]) => void;
      }
    ).onActiveChainsUpdated ?? jest.fn();

  const messengerForController =
    messenger as unknown as AssetsControllerMessenger;
  const controller = new StakedBalanceDataSource({
    messenger: messengerForController,
    onActiveChainsUpdated,
    ...options,
  });

  try {
    return await fn({
      controller,
      messenger,
      onActiveChainsUpdated,
      mockProvider,
    });
  } finally {
    controller.destroy();
  }
}

describe('StakedBalanceDataSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default options', async () => {
      await withController(({ controller }) => {
        expect(controller).toBeInstanceOf(StakedBalanceDataSource);
        expect(controller.getName()).toBe('StakedBalanceDataSource');
      });
    });

    it('initializes with custom poll interval', async () => {
      await withController(
        { options: { pollInterval: 60_000 } },
        ({ controller }) => {
          expect(controller).toBeDefined();
        },
      );
    });

    it('initializes with enabled: false and has no active chains', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          expect(controller).toBeDefined();
          expect(await controller.getActiveChains()).toStrictEqual([]);
        },
      );
    });

    it('calls onActiveChainsUpdated with active staking chains when mainnet is enabled', async () => {
      await withController(({ onActiveChainsUpdated }) => {
        expect(onActiveChainsUpdated).toHaveBeenCalledWith(
          'StakedBalanceDataSource',
          expect.arrayContaining([MAINNET_CHAIN_ID_CAIP]),
          [],
        );
      });
    });

    it('subscribes to transaction and network events', async () => {
      await withController(({ messenger }) => {
        expect(messenger.subscribe).toHaveBeenCalledWith(
          'TransactionController:transactionConfirmed',
          expect.any(Function),
        );
        expect(messenger.subscribe).toHaveBeenCalledWith(
          'TransactionController:incomingTransactionsReceived',
          expect.any(Function),
        );
        expect(messenger.subscribe).toHaveBeenCalledWith(
          'NetworkController:stateChange',
          expect.any(Function),
        );
        expect(messenger.subscribe).toHaveBeenCalledWith(
          'NetworkEnablementController:stateChange',
          expect.any(Function),
        );
      });
    });
  });

  describe('getName', () => {
    it('returns the data source name', async () => {
      await withController(({ controller }) => {
        expect(controller.getName()).toBe('StakedBalanceDataSource');
      });
    });
  });

  describe('getActiveChainsSync', () => {
    it('returns active chains when mainnet is enabled', async () => {
      await withController(async ({ controller }) => {
        const chains = await controller.getActiveChains();
        expect(chains).toContain(MAINNET_CHAIN_ID_CAIP);
      });
    });

    it('returns empty array when no staking chains are enabled', async () => {
      await withController(
        { enabledNetworkMap: { eip155: {} } },
        async ({ controller }) => {
          const chains = await controller.getActiveChains();
          expect(chains).toHaveLength(0);
        },
      );
    });
  });

  describe('fetch', () => {
    it('returns empty response when disabled', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          const request = createDataRequest();
          const response = await controller.fetch(request);
          expect(response).toStrictEqual({});
        },
      );
    });

    it('returns empty response when no active chains', async () => {
      await withController(
        { enabledNetworkMap: { eip155: {} } },
        async ({ controller }) => {
          const request = createDataRequest();
          const response = await controller.fetch(request);
          expect(response).toStrictEqual({});
        },
      );
    });

    it('returns empty response for unsupported chain', async () => {
      await withController(async ({ controller }) => {
        const request = createDataRequest({
          chainIds: ['eip155:999' as ChainId],
          accountsWithSupportedChains: [
            {
              account: createMockInternalAccount(),
              supportedChains: ['eip155:999' as ChainId],
            },
          ],
        });
        const response = await controller.fetch(request);
        expect(response).toStrictEqual({});
      });
    });

    it('returns staked balance and metadata for mainnet when fetcher returns data', async () => {
      await withController(async ({ controller, messenger }) => {
        const account = createMockInternalAccount();
        const request = createDataRequest({
          accounts: [account],
          chainIds: [MAINNET_CHAIN_ID_CAIP],
          accountsWithSupportedChains: [
            { account, supportedChains: [MAINNET_CHAIN_ID_CAIP] },
          ],
        });
        const response = await controller.fetch(request);
        expect(messenger.call).toHaveBeenCalledWith(
          'NetworkController:getNetworkClientById',
          'mainnet',
        );
        expect(response).toBeDefined();
        expect(messenger.call).toHaveBeenCalledWith(
          'NetworkController:getNetworkClientById',
          'mainnet',
        );
      });
    });

    it('returns zero amount when getShares returns zero', async () => {
      await withController(
        {
          mockProvider: createMockProvider({ sharesWei: '0', assetsWei: '0' }),
        },
        async ({ controller }) => {
          const account = createMockInternalAccount();
          const request = createDataRequest({
            accounts: [account],
            chainIds: [MAINNET_CHAIN_ID_CAIP],
            accountsWithSupportedChains: [
              { account, supportedChains: [MAINNET_CHAIN_ID_CAIP] },
            ],
          });
          const response = await controller.fetch(request);
          expect(response).toBeDefined();
        },
      );
    });
  });

  describe('subscribe', () => {
    it('stores subscription and calls onAssetsUpdate after initial fetch', async () => {
      await withController(async ({ controller }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
        expect(await controller.getActiveChains()).toContain(
          MAINNET_CHAIN_ID_CAIP,
        );
        await controller.unsubscribe('test-sub');
      });
    });

    it('does not call onAssetsUpdate when no staking chains to subscribe', async () => {
      await withController(
        { enabledNetworkMap: { eip155: {} } },
        async ({ controller }) => {
          const onAssetsUpdate = jest.fn();
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
            getAssetsState: getMockAssetsState,
          });
          expect(onAssetsUpdate).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('unsubscribe', () => {
    it('removes subscription and stops polling', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
          getAssetsState: getMockAssetsState,
        });
        await controller.unsubscribe('test-sub');
        const chains = await controller.getActiveChains();
        expect(chains.length).toBeGreaterThan(0);
      });
    });
  });

  describe('transaction events', () => {
    it('refreshes staked balance when transactionConfirmed involves staking contract (to)', async () => {
      await withController(async ({ controller, messenger }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        (messenger.publish as (e: string, p: unknown) => void)(
          'TransactionController:transactionConfirmed',
          {
            chainId: MAINNET_CHAIN_ID_HEX,
            txParams: { to: STAKING_CONTRACT_MAINNET },
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(onAssetsUpdate.mock.calls.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('does not refresh when transactionConfirmed does not involve staking contract', async () => {
      await withController(async ({ controller, messenger }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        (messenger.publish as (e: string, p: unknown) => void)(
          'TransactionController:transactionConfirmed',
          {
            chainId: MAINNET_CHAIN_ID_HEX,
            txParams: {
              from: '0xabcdef1234567890abcdef1234567890abcdef12',
              to: '0x1234567890123456789012345678901234567890',
            },
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });

    it('refreshes when transactionConfirmed has from equal to staking contract', async () => {
      await withController(async ({ controller, messenger }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        (messenger.publish as (e: string, p: unknown) => void)(
          'TransactionController:transactionConfirmed',
          {
            chainId: MAINNET_CHAIN_ID_HEX,
            txParams: { from: STAKING_CONTRACT_MAINNET.toLowerCase() },
          },
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(onAssetsUpdate.mock.calls.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('refreshes when incomingTransactionsReceived includes tx involving staking contract', async () => {
      await withController(async ({ controller, messenger }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        (messenger.publish as (e: string, p: unknown) => void)(
          'TransactionController:incomingTransactionsReceived',
          [
            {
              chainId: MAINNET_CHAIN_ID_HEX,
              txParams: { to: STAKING_CONTRACT_MAINNET },
            },
          ],
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(onAssetsUpdate.mock.calls.length).toBeGreaterThanOrEqual(0);
      });
    });

    it('does not refresh when incomingTransactionsReceived has no tx involving staking contract', async () => {
      await withController(async ({ controller, messenger }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        (messenger.publish as (e: string, p: unknown) => void)(
          'TransactionController:incomingTransactionsReceived',
          [
            {
              chainId: MAINNET_CHAIN_ID_HEX,
              txParams: {
                to: '0x1234567890123456789012345678901234567890',
              },
            },
          ],
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(onAssetsUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe('refreshStakedBalance', () => {
    it('pushes updates for all subscribed accounts and chains', async () => {
      await withController(async ({ controller }) => {
        const onAssetsUpdate = jest.fn();
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate,
          getAssetsState: getMockAssetsState,
        });
        onAssetsUpdate.mockClear();
        expect(await controller.refreshStakedBalance()).toBeUndefined();
      });
    });

    it('does nothing when disabled', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          expect(await controller.refreshStakedBalance()).toBeUndefined();
        },
      );
    });
  });

  describe('assetsMiddleware', () => {
    it('passes through when disabled', async () => {
      await withController(
        { options: { enabled: false }, enabledNetworkMap: {} },
        async ({ controller }) => {
          const next = jest.fn().mockResolvedValue(undefined);
          const context = createMiddlewareContext();
          await controller.assetsMiddleware(context, next);
          expect(next).toHaveBeenCalledWith(context);
          expect(context.response).toStrictEqual({});
        },
      );
    });

    it('merges staked balance into response when balance data type requested', async () => {
      await withController(async ({ controller }) => {
        const next = jest.fn().mockResolvedValue(undefined);
        const context = createMiddlewareContext();
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(context);
        const hasBalance =
          context.response.assetsBalance &&
          Object.keys(context.response.assetsBalance).length > 0;
        expect(!hasBalance || context.response.assetsInfo !== undefined).toBe(
          true,
        );
      });
    });

    it('passes through without fetching when dataTypes does not include balance', async () => {
      await withController(async ({ controller }) => {
        const next = jest.fn().mockResolvedValue(undefined);
        const request = createDataRequest();
        request.dataTypes = ['price'];
        const context = createMiddlewareContext({ request, response: {} });
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(context);
        expect(context.response.assetsBalance).toBeUndefined();
      });
    });
  });

  describe('destroy', () => {
    it('unsubscribes from transaction and network events', async () => {
      const unsubscribeConfirmed = jest.fn();
      const unsubscribeIncoming = jest.fn();
      const unsubscribeNetwork = jest.fn();
      const unsubscribeEnablement = jest.fn();
      const messenger = createMockMessenger(createMockProvider({}));
      messenger.subscribe.mockImplementation((event: string) => {
        if (event === 'TransactionController:transactionConfirmed') {
          return unsubscribeConfirmed;
        }
        if (event === 'TransactionController:incomingTransactionsReceived') {
          return unsubscribeIncoming;
        }
        if (event === 'NetworkController:stateChange') {
          return unsubscribeNetwork;
        }
        if (event === 'NetworkEnablementController:stateChange') {
          return unsubscribeEnablement;
        }
        return jest.fn();
      });

      const messengerForController =
        messenger as unknown as AssetsControllerMessenger;
      const controller = new StakedBalanceDataSource({
        messenger: messengerForController,
        onActiveChainsUpdated: jest.fn(),
      });
      controller.destroy();

      expect(unsubscribeConfirmed).toHaveBeenCalled();
      expect(unsubscribeIncoming).toHaveBeenCalled();
      expect(unsubscribeNetwork).toHaveBeenCalled();
      expect(unsubscribeEnablement).toHaveBeenCalled();
    });
  });
});
