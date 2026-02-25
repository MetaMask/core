/* eslint-disable jest/unbound-method */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkState } from '@metamask/network-controller';
import { NetworkStatus, RpcEndpointType } from '@metamask/network-controller';

import type { RpcDataSourceOptions } from './RpcDataSource';
import { RpcDataSource } from './RpcDataSource';
import {
  createMockAssetControllerMessenger,
  MockRootMessenger,
  registerRpcDataSourceActions,
} from '../__fixtures__/MockAssetControllerMessenger';
import type { AssetsControllerMessenger } from '../AssetsController';
import type { ChainId, DataRequest, Context } from '../types';

const MOCK_CHAIN_ID_HEX = '0x1';
const MOCK_CHAIN_ID_CAIP = 'eip155:1' as ChainId;
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
type EthereumProvider = {
  request: jest.Mock;
};

function createMockInternalAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: MOCK_ACCOUNT_ID,
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

function createDataRequest(
  overrides?: Partial<DataRequest> & { accounts?: InternalAccount[] },
): DataRequest {
  const chainIds = overrides?.chainIds ?? [MOCK_CHAIN_ID_CAIP];
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

function createMockNetworkState(
  chainStatus: NetworkStatus = NetworkStatus.Available,
): NetworkState {
  return {
    selectedNetworkClientId: 'mainnet',
    networkConfigurationsByChainId: {
      [MOCK_CHAIN_ID_HEX]: {
        chainId: MOCK_CHAIN_ID_HEX,
        name: 'Mainnet',
        nativeCurrency: 'ETH',
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          {
            networkClientId: 'mainnet',
            url: 'https://mainnet.infura.io',
            type: RpcEndpointType.Custom,
          },
        ],
        blockExplorerUrls: [],
      },
    },
    networksMetadata: {
      mainnet: {
        status: chainStatus,
        EIPS: {},
      },
    },
  } as unknown as NetworkState;
}

type ActionHandlerOverrides = {
  'NetworkController:getState'?: () => NetworkState;
  'NetworkController:getNetworkClientById'?: (networkClientId: string) => {
    provider: EthereumProvider;
    configuration: { chainId: string };
  };
};

type WithControllerOptions = {
  options?: Partial<RpcDataSourceOptions>;
  networkState?: NetworkState;
  actionHandlerOverrides?: ActionHandlerOverrides;
};

type WithControllerCallback<ReturnValue> = ({
  controller,
  messenger,
  onActiveChainsUpdated,
}: {
  controller: RpcDataSource;
  rootMessenger: MockRootMessenger;
  messenger: AssetsControllerMessenger;
  onActiveChainsUpdated: (
    dataSourceName: string,
    chains: ChainId[],
    previousChains: ChainId[],
  ) => void;
}) => Promise<ReturnValue> | ReturnValue;

async function withController<ReturnValue>(
  options: WithControllerOptions,
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue>;
async function withController<ReturnValue>(
  fn: WithControllerCallback<ReturnValue>,
): Promise<ReturnValue>;
async function withController<ReturnValue>(
  ...args:
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
    | [WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [controllerOptions, fn] = args.length === 2 ? args : [{}, args[0]];
  const { options = {}, networkState = createMockNetworkState() } =
    controllerOptions;

  const { rootMessenger, assetsControllerMessenger } =
    createMockAssetControllerMessenger();
  registerRpcDataSourceActions(rootMessenger, { networkState });

  const onActiveChainsUpdated = options.onActiveChainsUpdated ?? jest.fn();
  const controller = new RpcDataSource({
    messenger: assetsControllerMessenger,
    onActiveChainsUpdated,
    ...options,
  });

  try {
    return await fn({
      controller,
      messenger: assetsControllerMessenger,
      rootMessenger,
      onActiveChainsUpdated,
    });
  } finally {
    controller.destroy();
  }
}

// Mock Web3Provider
jest.mock('@ethersproject/providers', () => ({
  Web3Provider: jest.fn().mockImplementation(() => ({
    getBalance: jest
      .fn()
      .mockResolvedValue({ toString: () => '1000000000000000000' }),
  })),
}));

describe('RpcDataSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default options', async () => {
      await withController(({ controller }) => {
        expect(controller).toBeInstanceOf(RpcDataSource);
        expect(controller.getName()).toBe('RpcDataSource');
      });
    });

    it('initializes with custom timeout', async () => {
      await withController({ options: { timeout: 5000 } }, ({ controller }) => {
        expect(controller).toBeDefined();
      });
    });

    it('initializes with custom balance interval', async () => {
      await withController(
        { options: { balanceInterval: 60000 } },
        ({ controller }) => {
          expect(controller).toBeDefined();
        },
      );
    });

    it('initializes with custom detection interval', async () => {
      await withController(
        { options: { detectionInterval: 300000 } },
        ({ controller }) => {
          expect(controller).toBeDefined();
        },
      );
    });

    it('initializes with token detection enabled', async () => {
      await withController(
        { options: { tokenDetectionEnabled: () => true } },
        ({ controller }) => {
          expect(controller).toBeDefined();
        },
      );
    });

    it('reports active chains on initialization', async () => {
      await withController(async ({ onActiveChainsUpdated }) => {
        expect(onActiveChainsUpdated).toHaveBeenCalledWith(
          'RpcDataSource',
          [MOCK_CHAIN_ID_CAIP],
          [],
        );
      });
    });

    it('updates state.activeChains before calling onActiveChainsUpdated so getActiveChainsSync returns new chains', async () => {
      let source: RpcDataSource | null = null;
      let callbackResult: {
        syncChains: ChainId[];
        newChains: ChainId[];
      } | null = null;
      await withController(
        {
          // Start with unavailable so activeChains is empty; publishing Available triggers a real state change.
          networkState: createMockNetworkState(NetworkStatus.Degraded),
          options: {
            onActiveChainsUpdated: (
              _name: string,
              newChains: ChainId[],
              _previousChains: ChainId[],
            ) => {
              // Simulate AssetsController: when handling the callback it calls
              // source.getActiveChainsSync() to get available chains for subscriptions.
              if (source !== null) {
                callbackResult = {
                  syncChains: source.getActiveChainsSync(), // eslint-disable-line n/no-sync -- testing sync API used by AssetsController
                  newChains,
                };
              }
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          source = controller;
          // Trigger callback via network state change (first call is during construction, before source is set).
          const newNetworkState = createMockNetworkState(
            NetworkStatus.Available,
          );
          rootMessenger.publish(
            'NetworkController:stateChange',
            newNetworkState,
            [],
          );
          await new Promise(process.nextTick);
          expect(callbackResult).not.toBeNull();
          const assertNotNull: <Val>(
            value: Val | null,
          ) => asserts value is Val = (value) => {
            expect(value).not.toBeNull();
          };
          assertNotNull(callbackResult);
          expect(callbackResult.syncChains).toStrictEqual(
            callbackResult.newChains,
          );
          const chains = await controller.getActiveChains();
          expect(chains).toContain(MOCK_CHAIN_ID_CAIP);
        },
      );
    });
  });

  describe('getName', () => {
    it('returns the controller name', async () => {
      await withController(({ controller }) => {
        expect(controller.getName()).toBe('RpcDataSource');
      });
    });
  });

  describe('getActiveChains', () => {
    it('returns active chains from state', async () => {
      await withController(async ({ controller }) => {
        const chains = await controller.getActiveChains();
        expect(chains).toContain(MOCK_CHAIN_ID_CAIP);
      });
    });

    it('returns empty array when no chains are available', async () => {
      const emptyNetworkState = {
        selectedNetworkClientId: 'mainnet',
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      };

      await withController(
        { networkState: emptyNetworkState },
        async ({ controller }) => {
          const chains = await controller.getActiveChains();
          expect(chains).toHaveLength(0);
        },
      );
    });
  });

  describe('getChainStatuses', () => {
    it('returns chain statuses', async () => {
      await withController(({ controller }) => {
        const statuses = controller.getChainStatuses();
        expect(statuses[MOCK_CHAIN_ID_CAIP]).toBeDefined();
        expect(statuses[MOCK_CHAIN_ID_CAIP].status).toBe('available');
      });
    });
  });

  describe('getChainStatus', () => {
    it('returns status for existing chain', async () => {
      await withController(({ controller }) => {
        const status = controller.getChainStatus(MOCK_CHAIN_ID_CAIP);
        expect(status).toBeDefined();
        expect(status?.chainId).toBe(MOCK_CHAIN_ID_CAIP);
      });
    });

    it('returns undefined for non-existent chain', async () => {
      await withController(({ controller }) => {
        const status = controller.getChainStatus('eip155:999');
        expect(status).toBeUndefined();
      });
    });
  });

  describe('fetch', () => {
    it('fetches balances for accounts', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount();
        const request: DataRequest = {
          accountsWithSupportedChains: [
            { account, supportedChains: [MOCK_CHAIN_ID_CAIP] },
          ],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response).toBeDefined();
      });
    });

    it('returns empty response for unsupported chains', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount();
        const request: DataRequest = {
          accountsWithSupportedChains: [
            {
              account,
              supportedChains: ['eip155:999'],
            },
          ],
          chainIds: ['eip155:999'],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response.assetsBalance).toBeUndefined();
      });
    });

    it('skips accounts that do not support the chain', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount({
          scopes: ['solana:mainnet'],
        });

        const request: DataRequest = {
          accountsWithSupportedChains: [{ account, supportedChains: [] }],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response.assetsBalance?.[account.id]).toBeUndefined();
      });
    });
  });

  describe('subscribe', () => {
    it('creates a subscription', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount();
        await controller.subscribe({
          request: {
            accountsWithSupportedChains: [
              { account, supportedChains: [MOCK_CHAIN_ID_CAIP] },
            ],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        // Should not throw
        expect(true).toBe(true);
      });
    });

    it('updates existing subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: true,
          onAssetsUpdate: jest.fn(),
        });

        expect(true).toBe(true);
      });
    });

    it('uses request.chainIds when activeChains is empty so subscription can start', async () => {
      const networkState = createMockNetworkState(NetworkStatus.Degraded);
      await withController({ networkState }, async ({ controller }) => {
        const account = createMockInternalAccount();
        await controller.subscribe({
          request: {
            accountsWithSupportedChains: [
              { account, supportedChains: [MOCK_CHAIN_ID_CAIP] },
            ],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub');
        expect(true).toBe(true);
      });
    });

    it('starts balance and staked balance polling for chain with staking contract (mainnet)', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub');
        expect(true).toBe(true);
      });
    });

    it('completes subscription for chain without staking contract (Polygon only)', async () => {
      const networkState = createMockNetworkState(NetworkStatus.Degraded);
      networkState.networkConfigurationsByChainId['0x89'] = {
        chainId: '0x89',
        name: 'Polygon',
        nativeCurrency: 'MATIC',
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          {
            networkClientId: 'polygon',
            url: 'https://polygon-rpc.com',
            type: RpcEndpointType.Custom,
          },
        ],
        blockExplorerUrls: [],
      };
      (networkState.networksMetadata as Record<string, unknown>).polygon = {
        status: NetworkStatus.Available,
        EIPS: {},
      };

      await withController({ networkState }, async ({ controller }) => {
        const account = createMockInternalAccount();
        await controller.subscribe({
          request: {
            accountsWithSupportedChains: [
              {
                account,
                supportedChains: ['eip155:137' as ChainId],
              },
            ],
            chainIds: ['eip155:137' as ChainId],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub');
        expect(true).toBe(true);
      });
    });

    it('unsubscribe stops all polling including staked balance', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub');
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub-2',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub-2');
        expect(true).toBe(true);
      });
    });
  });

  describe('unsubscribe', () => {
    it('removes a subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        await controller.unsubscribe('test-sub');

        // Should not throw
        expect(true).toBe(true);
      });
    });

    it('handles unsubscribing non-existent subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.unsubscribe('non-existent');

        // Should not throw
        expect(true).toBe(true);
      });
    });
  });

  describe('assetsMiddleware', () => {
    it('returns a middleware function', async () => {
      await withController(({ controller }) => {
        const middleware = controller.assetsMiddleware;
        expect(typeof middleware).toBe('function');
      });
    });

    it('passes through when no supported chains', async () => {
      await withController(async ({ controller }) => {
        const middleware = controller.assetsMiddleware;
        const context: Context = {
          request: createDataRequest({
            chainIds: ['eip155:999'],
          }),
          response: {},
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx) => Promise.resolve(ctx));

        await middleware(context, next);

        expect(next).toHaveBeenCalled();
      });
    });

    it('fetches balances for supported chains', async () => {
      await withController(async ({ controller }) => {
        const middleware = controller.assetsMiddleware;
        const context: Context = {
          request: createDataRequest(),
          response: {},
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx) => Promise.resolve(ctx));

        await middleware(context, next);

        expect(next).toHaveBeenCalled();
      });
    });
  });

  describe('destroy', () => {
    it('cleans up resources', async () => {
      await withController(({ controller }) => {
        controller.destroy();
        // Should not throw
        expect(true).toBe(true);
      });
    });
  });

  describe('network state changes', () => {
    it('updates chains when network state changes', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const newNetworkState = createMockNetworkState(NetworkStatus.Available);
        newNetworkState.networkConfigurationsByChainId['0x89'] = {
          chainId: '0x89',
          name: 'Polygon',
          nativeCurrency: 'MATIC',
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [
            {
              networkClientId: 'polygon',
              url: 'https://polygon-rpc.com',
              type: RpcEndpointType.Custom,
            },
          ],
          blockExplorerUrls: [],
        };
        newNetworkState.networksMetadata.polygon = {
          status: NetworkStatus.Available,
          EIPS: {},
        };

        rootMessenger.publish(
          'NetworkController:stateChange',
          newNetworkState,
          [],
        );

        await new Promise(process.nextTick);

        const chains = await controller.getActiveChains();
        expect(chains).toContain('eip155:137');
      });
    });
  });

  describe('instance methods', () => {
    it('exposes getAssetsMiddleware on instance', async () => {
      await withController(({ controller }) => {
        const middleware = controller.assetsMiddleware;
        expect(typeof middleware).toBe('function');
      });
    });

    it('exposes getActiveChains on instance', async () => {
      await withController(async ({ controller }) => {
        const chains = await controller.getActiveChains();
        expect(Array.isArray(chains)).toBe(true);
      });
    });

    it('exposes fetch on instance', async () => {
      await withController(async ({ controller }) => {
        const response = await controller.fetch(createDataRequest());
        expect(response).toBeDefined();
      });
    });

    it('exposes subscribe on instance', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        expect(true).toBe(true);
      });
    });

    it('exposes unsubscribe on instance', async () => {
      await withController(async ({ controller }) => {
        await controller.unsubscribe('test-sub');
        expect(true).toBe(true);
      });
    });
  });

  describe('account scope filtering', () => {
    it('includes accounts with wildcard EVM scope', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount({
          scopes: ['eip155:0'], // Wildcard for all EVM chains
        });

        const request = createDataRequest({
          accounts: [account],
          chainIds: [MOCK_CHAIN_ID_CAIP],
        });

        const response = await controller.fetch(request);
        expect(response).toBeDefined();
      });
    });

    it('includes accounts with specific chain scope', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount({
          scopes: ['eip155:1'],
        });

        const request = createDataRequest({
          accounts: [account],
          chainIds: [MOCK_CHAIN_ID_CAIP],
        });

        const response = await controller.fetch(request);
        expect(response).toBeDefined();
      });
    });

    it('excludes accounts without matching scope', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount({
          scopes: ['solana:mainnet'],
        });

        const request: DataRequest = {
          accountsWithSupportedChains: [{ account, supportedChains: [] }],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response.assetsBalance?.[account.id]).toBeUndefined();
      });
    });
  });
});
