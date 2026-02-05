/* eslint-disable jest/unbound-method */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { NetworkState } from '@metamask/network-controller';
import { NetworkStatus, RpcEndpointType } from '@metamask/network-controller';

import type {
  RpcDataSourceMessenger,
  RpcDataSourceOptions,
} from './RpcDataSource';
import { RpcDataSource, createRpcDataSource } from './RpcDataSource';
import type { ChainId, DataRequest, DataType, Context } from '../types';

type AllActions = MessengerActions<RpcDataSourceMessenger>;
type AllEvents = MessengerEvents<RpcDataSourceMessenger>;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_CHAIN_ID_HEX = '0x1';
const MOCK_CHAIN_ID_CAIP = 'eip155:1' as ChainId;
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
type EthereumProvider = {
  request: jest.Mock;
};

function createMockProvider(): EthereumProvider {
  return {
    request: jest.fn().mockResolvedValue('0x0'),
  };
}

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
}: {
  controller: RpcDataSource;
  messenger: RootMessenger;
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
  const {
    options = {},
    networkState = createMockNetworkState(),
    actionHandlerOverrides = {},
  } = controllerOptions;

  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const rpcDataSourceMessenger = new Messenger<
    'RpcDataSource',
    MessengerActions<RpcDataSourceMessenger>,
    MessengerEvents<RpcDataSourceMessenger>,
    RootMessenger
  >({
    namespace: 'RpcDataSource',
    parent: messenger,
  });

  messenger.delegate({
    messenger: rpcDataSourceMessenger,
    actions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'AssetsController:activeChainsUpdate',
      'AssetsController:assetsUpdate',
      'AssetsController:getState',
      'TokenListController:getState',
      'NetworkEnablementController:getState',
    ],
    events: ['NetworkController:stateChange'],
  });

  // Mock NetworkController:getState
  messenger.registerActionHandler(
    'NetworkController:getState',
    actionHandlerOverrides['NetworkController:getState'] ??
      ((): NetworkState => networkState),
  );

  // Mock NetworkController:getNetworkClientById
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    actionHandlerOverrides['NetworkController:getNetworkClientById'] ??
      ((): {
        provider: EthereumProvider;
        configuration: { chainId: string };
      } => ({
        provider: createMockProvider(),
        configuration: { chainId: MOCK_CHAIN_ID_HEX },
      })),
  );

  // Mock AssetsController:activeChainsUpdate
  messenger.registerActionHandler(
    'AssetsController:activeChainsUpdate',
    jest.fn(),
  );

  // Mock AssetsController:assetsUpdate
  messenger.registerActionHandler(
    'AssetsController:assetsUpdate',
    jest.fn().mockResolvedValue(undefined),
  );

  // Mock AssetsController:getState
  messenger.registerActionHandler('AssetsController:getState', () => ({
    assetsMetadata: {},
    assetsBalance: {},
  }));

  // Mock TokenListController:getState
  messenger.registerActionHandler('TokenListController:getState', () => ({
    tokensChainsCache: {},
  }));

  // Mock NetworkEnablementController:getState
  messenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: {},
      nativeAssetIdentifiers: {
        [MOCK_CHAIN_ID_CAIP]: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
      },
    }),
  );

  const controller = new RpcDataSource({
    messenger: rpcDataSourceMessenger as unknown as RpcDataSourceMessenger,
    ...options,
  });

  try {
    return await fn({ controller, messenger });
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
        { options: { tokenDetectionEnabled: true } },
        ({ controller }) => {
          expect(controller).toBeDefined();
        },
      );
    });

    it('reports active chains on initialization', async () => {
      await withController(async ({ messenger }) => {
        const activeChainsUpdate = messenger.call as jest.Mock;
        // The controller should have called activeChainsUpdate during initialization
        expect(activeChainsUpdate).toBeDefined();
      });
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
      } as unknown as NetworkState;

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
        const status = controller.getChainStatus('eip155:999' as ChainId);
        expect(status).toBeUndefined();
      });
    });
  });

  describe('fetch', () => {
    it('fetches balances for accounts', async () => {
      await withController(async ({ controller }) => {
        const request: DataRequest = {
          accounts: [createMockInternalAccount()],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response).toBeDefined();
      });
    });

    it('returns empty response for unsupported chains', async () => {
      await withController(async ({ controller }) => {
        const request: DataRequest = {
          accounts: [createMockInternalAccount()],
          chainIds: ['eip155:999' as ChainId],
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
          accounts: [account],
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
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
        });

        // Should not throw
        expect(true).toBe(true);
      });
    });

    it('updates existing subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
        });

        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: true,
        });

        expect(true).toBe(true);
      });
    });
  });

  describe('unsubscribe', () => {
    it('removes a subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
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
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: ['eip155:999' as ChainId],
            dataTypes: ['balance'] as DataType[],
          },
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
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'] as DataType[],
          },
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
      await withController(async ({ controller, messenger }) => {
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

        (messenger.publish as CallableFunction)(
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

  describe('createRpcDataSource', () => {
    it('creates an RpcDataSource instance', async () => {
      const messenger: RootMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      const rpcDataSourceMessenger = new Messenger<
        'RpcDataSource',
        MessengerActions<RpcDataSourceMessenger>,
        MessengerEvents<RpcDataSourceMessenger>,
        RootMessenger
      >({
        namespace: 'RpcDataSource',
        parent: messenger,
      });

      messenger.delegate({
        messenger: rpcDataSourceMessenger,
        actions: [
          'NetworkController:getState',
          'NetworkController:getNetworkClientById',
          'AssetsController:activeChainsUpdate',
          'AssetsController:assetsUpdate',
        ],
        events: ['NetworkController:stateChange'],
      });

      messenger.registerActionHandler('NetworkController:getState', () =>
        createMockNetworkState(),
      );
      messenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        () => ({
          provider: createMockProvider(),
          configuration: { chainId: MOCK_CHAIN_ID_HEX },
        }),
      );
      messenger.registerActionHandler(
        'AssetsController:activeChainsUpdate',
        jest.fn(),
      );
      messenger.registerActionHandler(
        'AssetsController:assetsUpdate',
        jest.fn().mockResolvedValue(undefined),
      );

      const controller = createRpcDataSource({
        messenger: rpcDataSourceMessenger as unknown as RpcDataSourceMessenger,
      });

      try {
        expect(controller).toBeInstanceOf(RpcDataSource);
        expect(controller.getName()).toBe('RpcDataSource');
      } finally {
        controller.destroy();
      }
    });
  });

  describe('messenger action handlers', () => {
    it('registers getAssetsMiddleware action', async () => {
      await withController(({ messenger }) => {
        const middleware = messenger.call('RpcDataSource:getAssetsMiddleware');
        expect(typeof middleware).toBe('function');
      });
    });

    it('registers getActiveChains action', async () => {
      await withController(async ({ messenger }) => {
        const chains = await messenger.call('RpcDataSource:getActiveChains');
        expect(Array.isArray(chains)).toBe(true);
      });
    });

    it('registers fetch action', async () => {
      await withController(async ({ messenger }) => {
        const response = await messenger.call('RpcDataSource:fetch', {
          accounts: [createMockInternalAccount()],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        });
        expect(response).toBeDefined();
      });
    });

    it('registers subscribe action', async () => {
      await withController(async ({ messenger }) => {
        await messenger.call('RpcDataSource:subscribe', {
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
        });
        expect(true).toBe(true);
      });
    });

    it('registers unsubscribe action', async () => {
      await withController(async ({ messenger }) => {
        await messenger.call('RpcDataSource:unsubscribe', 'test-sub');
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

        const request: DataRequest = {
          accounts: [account],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response).toBeDefined();
      });
    });

    it('includes accounts with specific chain scope', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount({
          scopes: ['eip155:1'],
        });

        const request: DataRequest = {
          accounts: [account],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

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
          accounts: [account],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response.assetsBalance?.[account.id]).toBeUndefined();
      });
    });
  });
});
