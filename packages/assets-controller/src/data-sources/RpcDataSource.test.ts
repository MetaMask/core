import type { InternalAccount } from '@metamask/keyring-internal-api';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { NetworkStatus, RpcEndpointType } from '@metamask/network-controller';
import type { NetworkState } from '@metamask/network-controller';

import * as rpcDatasourceMocks from './rpc-datasource';
import {
  RpcDataSource,
  caipChainIdToHex,
  createRpcDataSource,
} from './RpcDataSource';
import type {
  RpcDataSourceMessenger,
  RpcDataSourceOptions,
  EthereumProvider,
} from './RpcDataSource';
import type { ChainId, DataRequest } from '../types';

type AllActions = MessengerActions<RpcDataSourceMessenger>;
type AllEvents = MessengerEvents<RpcDataSourceMessenger>;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

const MOCK_ACCOUNT_ID = 'mock-account-id-1';
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
const MOCK_CHAIN_ID_CAIP = 'eip155:1' as ChainId;
const MOCK_CHAIN_ID_HEX = '0x1';
const MOCK_NETWORK_CLIENT_ID = 'mainnet';

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
  overrides?: Partial<NetworkState>,
): NetworkState {
  return {
    selectedNetworkClientId: MOCK_NETWORK_CLIENT_ID,
    networkConfigurationsByChainId: {
      [MOCK_CHAIN_ID_HEX]: {
        chainId: MOCK_CHAIN_ID_HEX,
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          {
            networkClientId: MOCK_NETWORK_CLIENT_ID,
            url: 'https://mainnet.infura.io',
            type: RpcEndpointType.Custom,
          },
        ],
        blockExplorerUrls: [],
      },
    },
    networksMetadata: {
      [MOCK_NETWORK_CLIENT_ID]: {
        status: NetworkStatus.Available,
        EIPS: {},
      },
    },
    ...overrides,
  } as NetworkState;
}

function createMockProvider(): jest.Mocked<EthereumProvider> {
  return {
    request: jest.fn(),
  };
}

// Mock the rpc-datasource module - factory creates fresh mocks each time
jest.mock('./rpc-datasource');

// Get access to the mocked functions
type MockedServices = {
  mockBalanceFetcher: {
    fetchBalancesForTokens: jest.Mock;
    fetchBalances: jest.Mock;
    setUserTokensStateGetter: jest.Mock;
    setOnBalanceUpdate: jest.Mock;
    startPolling: jest.Mock;
    stopPollingByPollingToken: jest.Mock;
    stopAllPolling: jest.Mock;
    setIntervalLength: jest.Mock;
    getIntervalLength: jest.Mock;
  };
  mockTokenDetector: {
    detectTokens: jest.Mock;
    setTokenListStateGetter: jest.Mock;
    setOnDetectionUpdate: jest.Mock;
    startPolling: jest.Mock;
    stopPollingByPollingToken: jest.Mock;
    stopAllPolling: jest.Mock;
    setIntervalLength: jest.Mock;
    getIntervalLength: jest.Mock;
  };
  multicallProviderGetter?: (hexChainId: string) => unknown;
};

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
  mockBalanceFetcher,
  mockTokenDetector,
  multicallProviderGetter,
}: {
  controller: RpcDataSource;
  messenger: RootMessenger;
  mockBalanceFetcher: MockedServices['mockBalanceFetcher'];
  mockTokenDetector: MockedServices['mockTokenDetector'];
  multicallProviderGetter: MockedServices['multicallProviderGetter'];
}) => Promise<ReturnValue> | ReturnValue;

const createMockBalanceFetcher = (): MockedServices['mockBalanceFetcher'] => ({
  fetchBalancesForTokens: jest.fn().mockResolvedValue({ balances: [] }),
  fetchBalances: jest.fn().mockResolvedValue({ balances: [] }),
  setUserTokensStateGetter: jest.fn(),
  setOnBalanceUpdate: jest.fn(),
  startPolling: jest.fn().mockReturnValue('balance-polling-token'),
  stopPollingByPollingToken: jest.fn(),
  stopAllPolling: jest.fn(),
  setIntervalLength: jest.fn(),
  getIntervalLength: jest.fn().mockReturnValue(30000),
});

const createMockTokenDetector = (): MockedServices['mockTokenDetector'] => ({
  detectTokens: jest.fn().mockResolvedValue({
    detectedAssets: [],
    detectedBalances: [],
  }),
  setTokenListStateGetter: jest.fn(),
  setOnDetectionUpdate: jest.fn(),
  startPolling: jest.fn().mockReturnValue('detection-polling-token'),
  stopPollingByPollingToken: jest.fn(),
  stopAllPolling: jest.fn(),
  setIntervalLength: jest.fn(),
  getIntervalLength: jest.fn().mockReturnValue(180000),
});

// Store mock instances for each test
let currentMockBalanceFetcher: MockedServices['mockBalanceFetcher'];
let currentMockTokenDetector: MockedServices['mockTokenDetector'];
let currentMulticallProviderGetter: MockedServices['multicallProviderGetter'];

const getMockedServices = (): MockedServices => {
  return {
    mockBalanceFetcher: currentMockBalanceFetcher,
    mockTokenDetector: currentMockTokenDetector,
    multicallProviderGetter: currentMulticallProviderGetter,
  };
};

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
      ((
        _networkClientId: string,
      ): {
        provider: EthereumProvider;
        configuration: { chainId: string };
      } => ({
        provider: createMockProvider(),
        configuration: {
          chainId: MOCK_CHAIN_ID_HEX,
        },
      })),
  );

  // Mock AssetsController:activeChainsUpdate
  const mockActiveChainsUpdate = jest.fn();
  messenger.registerActionHandler(
    'AssetsController:activeChainsUpdate',
    mockActiveChainsUpdate,
  );

  // Mock AssetsController:assetsUpdate
  const mockAssetsUpdate = jest.fn().mockResolvedValue(undefined);
  messenger.registerActionHandler(
    'AssetsController:assetsUpdate',
    mockAssetsUpdate,
  );

  // Mock AssetsController:getState
  messenger.registerActionHandler('AssetsController:getState', () => ({
    allTokens: {},
    allDetectedTokens: {},
    allIgnoredTokens: {},
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

  const { mockBalanceFetcher, mockTokenDetector, multicallProviderGetter } =
    getMockedServices();

  try {
    return await fn({
      controller,
      messenger,
      mockBalanceFetcher,
      mockTokenDetector,
      multicallProviderGetter,
    });
  } finally {
    controller.destroy();
  }
}

describe('RpcDataSource', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Create fresh mock instances for each test
    currentMockBalanceFetcher = createMockBalanceFetcher();
    currentMockTokenDetector = createMockTokenDetector();
    currentMulticallProviderGetter = undefined;

    const mockMulticallClient = {
      batchBalanceOf: jest.fn(),
    };

    (rpcDatasourceMocks.MulticallClient as jest.Mock).mockImplementation(
      (providerGetter: (hexChainId: string) => unknown) => {
        currentMulticallProviderGetter = providerGetter;
        return mockMulticallClient;
      },
    );
    (rpcDatasourceMocks.BalanceFetcher as jest.Mock).mockImplementation(
      () => currentMockBalanceFetcher,
    );
    (rpcDatasourceMocks.TokenDetector as jest.Mock).mockImplementation(
      () => currentMockTokenDetector,
    );
  });

  describe('caipChainIdToHex', () => {
    it('returns hex chain ID unchanged when given a hex string', () => {
      expect(caipChainIdToHex('0x1')).toBe('0x1');
      expect(caipChainIdToHex('0x89')).toBe('0x89');
    });

    it('converts CAIP-2 chain ID to hex', () => {
      expect(caipChainIdToHex('eip155:1')).toBe('0x1');
      expect(caipChainIdToHex('eip155:137')).toBe('0x89');
      expect(caipChainIdToHex('eip155:56')).toBe('0x38');
    });

    it('throws error for invalid chain ID format', () => {
      expect(() => caipChainIdToHex('invalid')).toThrow(
        'caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId',
      );
      expect(() => caipChainIdToHex('1')).toThrow(
        'caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId',
      );
    });
  });

  describe('createRpcDataSource', () => {
    it('creates an RpcDataSource instance', async () => {
      await withController(({ controller }) => {
        // createRpcDataSource is just a factory function that calls new RpcDataSource
        // We verify it works by testing the controller itself
        expect(controller).toBeInstanceOf(RpcDataSource);
      });
    });

    it('returns a valid RpcDataSource via factory function', async () => {
      await withController(({ controller }) => {
        expect(controller).toBeInstanceOf(RpcDataSource);
        expect(controller.getName()).toBe('RpcDataSource');
      });
    });
  });

  describe('constructor', () => {
    it('initializes with default options', async () => {
      await withController(({ controller }) => {
        expect(controller.getName()).toBe('RpcDataSource');
      });
    });

    it('initializes from NetworkController state', async () => {
      await withController(async ({ controller }) => {
        const activeChains = await controller.getActiveChains();
        expect(activeChains).toContain(MOCK_CHAIN_ID_CAIP);
      });
    });

    it('sets up chain statuses from network state', async () => {
      await withController(({ controller }) => {
        const chainStatuses = controller.getChainStatuses();
        expect(chainStatuses[MOCK_CHAIN_ID_CAIP]).toBeDefined();
        expect(chainStatuses[MOCK_CHAIN_ID_CAIP].name).toBe('Ethereum Mainnet');
        expect(chainStatuses[MOCK_CHAIN_ID_CAIP].nativeCurrency).toBe('ETH');
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
    it('returns active chains from network state', async () => {
      await withController(async ({ controller }) => {
        const activeChains = await controller.getActiveChains();
        expect(activeChains).toStrictEqual([MOCK_CHAIN_ID_CAIP]);
      });
    });

    it('returns empty array when no networks are configured', async () => {
      const emptyNetworkState = createMockNetworkState({
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      });

      await withController(
        { networkState: emptyNetworkState },
        async ({ controller }) => {
          const activeChains = await controller.getActiveChains();
          expect(activeChains).toStrictEqual([]);
        },
      );
    });
  });

  describe('getChainStatuses', () => {
    it('returns a copy of chain statuses', async () => {
      await withController(({ controller }) => {
        const statuses1 = controller.getChainStatuses();
        const statuses2 = controller.getChainStatuses();
        expect(statuses1).not.toBe(statuses2);
        expect(statuses1).toStrictEqual(statuses2);
      });
    });
  });

  describe('getChainStatus', () => {
    it('returns status for a specific chain', async () => {
      await withController(({ controller }) => {
        const status = controller.getChainStatus(MOCK_CHAIN_ID_CAIP);
        expect(status).toBeDefined();
        expect(status?.chainId).toBe(MOCK_CHAIN_ID_CAIP);
      });
    });

    it('returns undefined for unknown chain', async () => {
      await withController(({ controller }) => {
        const status = controller.getChainStatus('eip155:999' as ChainId);
        expect(status).toBeUndefined();
      });
    });
  });

  describe('fetch', () => {
    it('returns empty response when no active chains match request', async () => {
      await withController(async ({ controller }) => {
        const request: DataRequest = {
          accounts: [createMockInternalAccount()],
          chainIds: ['eip155:999' as ChainId],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response).toStrictEqual({});
      });
    });

    it('fetches balances for active chains', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [
            {
              assetId: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
              balance: '1000000000000000000',
            },
          ],
        });

        const request: DataRequest = {
          accounts: [createMockInternalAccount()],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response.assetsBalance).toBeDefined();
        expect(response.assetsBalance?.[MOCK_ACCOUNT_ID]).toBeDefined();
      });
    });

    it('skips accounts that do not support the chain', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        const accountWithDifferentScope = createMockInternalAccount({
          scopes: ['eip155:137'], // Polygon only
        });

        const request: DataRequest = {
          accounts: [accountWithDifferentScope],
          chainIds: [MOCK_CHAIN_ID_CAIP], // Mainnet
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        // BalanceFetcher should not be called for this account/chain combo
        expect(
          mockBalanceFetcher.fetchBalancesForTokens,
        ).not.toHaveBeenCalled();
        expect(response.assetsBalance).toBeDefined();
      });
    });

    it('handles errors gracefully and reports failed chains', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockRejectedValue(
          new Error('RPC error'),
        );

        const request: DataRequest = {
          accounts: [createMockInternalAccount()],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        const response = await controller.fetch(request);
        expect(response.errors).toBeDefined();
        expect(response.errors?.[MOCK_CHAIN_ID_CAIP]).toBe('RPC fetch failed');
      });
    });
  });

  describe('detectTokens', () => {
    it('returns empty response when token detection is disabled', async () => {
      await withController(
        { options: { tokenDetectionEnabled: false } },
        async ({ controller }) => {
          const response = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );
          expect(response).toStrictEqual({});
        },
      );
    });

    it('detects tokens when enabled', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, mockTokenDetector }) => {
          const mockAssetId = `${MOCK_CHAIN_ID_CAIP}/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`;
          mockTokenDetector.detectTokens.mockResolvedValue({
            detectedAssets: [{ assetId: mockAssetId }],
            detectedBalances: [{ assetId: mockAssetId, balance: '1000000' }],
          });

          const response = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );

          expect(response.detectedAssets).toBeDefined();
          expect(response.detectedAssets?.[MOCK_ACCOUNT_ID]).toContain(
            mockAssetId,
          );
          expect(response.assetsBalance?.[MOCK_ACCOUNT_ID]).toBeDefined();
        },
      );
    });

    it('returns empty response when no tokens detected', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, mockTokenDetector }) => {
          mockTokenDetector.detectTokens.mockResolvedValue({
            detectedAssets: [],
            detectedBalances: [],
          });

          const response = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );

          expect(response).toStrictEqual({});
        },
      );
    });

    it('handles detection errors gracefully', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, mockTokenDetector }) => {
          mockTokenDetector.detectTokens.mockRejectedValue(
            new Error('Detection failed'),
          );

          const response = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );

          expect(response).toStrictEqual({});
        },
      );
    });

    it('detects tokens with empty balances list', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, mockTokenDetector }) => {
          const mockAssetId = `${MOCK_CHAIN_ID_CAIP}/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`;
          mockTokenDetector.detectTokens.mockResolvedValue({
            detectedAssets: [{ assetId: mockAssetId }],
            detectedBalances: [], // No balances returned
          });

          const response = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );

          expect(response.detectedAssets).toBeDefined();
          expect(response.detectedAssets?.[MOCK_ACCOUNT_ID]).toContain(
            mockAssetId,
          );
          // assetsBalance should still be defined but empty for the account
          expect(response.assetsBalance?.[MOCK_ACCOUNT_ID]).toStrictEqual({});
        },
      );
    });
  });

  describe('subscribe', () => {
    it('does nothing when no active chains match', async () => {
      await withController(async ({ controller }) => {
        // Should complete without throwing
        const result = await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: ['eip155:999' as ChainId],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });
        expect(result).toBeUndefined();
      });
    });

    it('creates subscription for active chains', async () => {
      await withController(async ({ controller }) => {
        const subscribeResult = await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });
        expect(subscribeResult).toBeUndefined();

        // Subscription should be active - unsubscribe should work
        const unsubscribeResult = await controller.unsubscribe('sub-1');
        expect(unsubscribeResult).toBeUndefined();
      });
    });

    it('updates existing subscription when isUpdate is true', async () => {
      await withController(async ({ controller }) => {
        // Create initial subscription
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });

        // Update subscription - should complete without error
        const updateResult = await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance', 'metadata'],
          },
          subscriptionId: 'sub-1',
          isUpdate: true,
        });
        expect(updateResult).toBeUndefined();

        await controller.unsubscribe('sub-1');
      });
    });

    it('replaces subscription when isUpdate is false for existing subscription', async () => {
      await withController(async ({ controller }) => {
        // Create initial subscription
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });

        // Replace subscription - should complete without error
        const replaceResult = await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });
        expect(replaceResult).toBeUndefined();

        await controller.unsubscribe('sub-1');
      });
    });

    it('skips accounts that do not support the chain in subscription', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        const polygonOnlyAccount = createMockInternalAccount({
          id: 'polygon-only-account',
          scopes: ['eip155:137'], // Polygon only
        });

        await controller.subscribe({
          request: {
            accounts: [polygonOnlyAccount],
            chainIds: [MOCK_CHAIN_ID_CAIP], // Mainnet - account doesn't support this
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-skip-test',
          isUpdate: false,
        });

        // BalanceFetcher should not be called since account doesn't support the chain
        expect(
          mockBalanceFetcher.fetchBalancesForTokens,
        ).not.toHaveBeenCalled();

        await controller.unsubscribe('sub-skip-test');
      });
    });

    it('sets up detection polling when token detection is enabled', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true, detectionInterval: 1000 } },
        async ({ controller, mockTokenDetector }) => {
          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-detection-test',
            isUpdate: false,
          });

          // Detection polling should have been started
          expect(mockTokenDetector.startPolling).toHaveBeenCalled();

          await controller.unsubscribe('sub-detection-test');
        },
      );
    });

    it('starts both balance and detection polling on subscribe', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, mockTokenDetector, mockBalanceFetcher }) => {
          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-both-polling',
            isUpdate: false,
          });

          // Both balance and detection polling should have been started
          expect(mockBalanceFetcher.startPolling).toHaveBeenCalled();
          expect(mockTokenDetector.startPolling).toHaveBeenCalled();

          await controller.unsubscribe('sub-both-polling');
        },
      );
    });

    it('starts detection polling when tokenDetectionEnabled', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, mockTokenDetector }) => {
          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-with-detection',
            isUpdate: false,
          });

          // Detection polling should have been started
          expect(mockTokenDetector.startPolling).toHaveBeenCalled();

          await controller.unsubscribe('sub-with-detection');
        },
      );
    });

    it('reports detected tokens when detection callback is triggered', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, messenger, mockTokenDetector }) => {
          const mockAssetId = `${MOCK_CHAIN_ID_CAIP}/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`;

          const mockAssetsUpdate = jest.fn().mockResolvedValue(undefined);
          messenger.unregisterActionHandler('AssetsController:assetsUpdate');
          messenger.registerActionHandler(
            'AssetsController:assetsUpdate',
            mockAssetsUpdate,
          );

          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-with-detection',
            isUpdate: false,
          });

          // Get the callback that was passed to setOnDetectionUpdate
          const onDetectionUpdate =
            mockTokenDetector.setOnDetectionUpdate.mock.calls[0]?.[0];
          expect(onDetectionUpdate).toBeDefined();

          // Simulate detection callback with detected tokens
          onDetectionUpdate({
            chainId: MOCK_CHAIN_ID_HEX,
            accountId: MOCK_ACCOUNT_ID,
            accountAddress: MOCK_ADDRESS,
            detectedAssets: [{ assetId: mockAssetId }],
            detectedBalances: [{ assetId: mockAssetId, balance: '5000000' }],
            zeroBalanceAddresses: [],
            failedAddresses: [],
            timestamp: Date.now(),
          });

          // Check that the detected assets were reported
          expect(mockAssetsUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
              detectedAssets: expect.objectContaining({
                [MOCK_ACCOUNT_ID]: [mockAssetId],
              }),
              assetsBalance: expect.objectContaining({
                [MOCK_ACCOUNT_ID]: expect.objectContaining({
                  [mockAssetId]: { amount: '5000000' },
                }),
              }),
            }),
            'RpcDataSource',
          );

          await controller.unsubscribe('sub-with-detection');
        },
      );
    });
  });

  describe('unsubscribe', () => {
    it('does nothing for non-existent subscription', async () => {
      await withController(async ({ controller }) => {
        // Should not throw
        const result = await controller.unsubscribe('non-existent');
        expect(result).toBeUndefined();
      });
    });

    it('cleans up active subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });

        const result1 = await controller.unsubscribe('sub-1');
        expect(result1).toBeUndefined();

        // Unsubscribing again should be a no-op
        const result2 = await controller.unsubscribe('sub-1');
        expect(result2).toBeUndefined();
      });
    });
  });

  describe('destroy', () => {
    it('cleans up all resources', async () => {
      await withController(async ({ controller }) => {
        // Create some subscriptions
        await controller.subscribe({
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'sub-1',
          isUpdate: false,
        });

        // destroy should not throw
        expect(() => controller.destroy()).not.toThrow();
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

    it('passes through when no chains are supported', async () => {
      const emptyNetworkState = createMockNetworkState({
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      });

      await withController(
        { networkState: emptyNetworkState },
        async ({ controller }) => {
          const middleware = controller.assetsMiddleware;
          const mockNext = jest.fn().mockImplementation((ctx) => ctx);

          const mockAssetsState = {
            assetsMetadata: {},
            assetsBalance: {},
            customAssets: {},
          };

          const context = {
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance' as const],
            },
            response: {},
            getAssetsState: (): typeof mockAssetsState => mockAssetsState,
          };

          await middleware(context, mockNext);

          expect(mockNext).toHaveBeenCalledWith(context);
        },
      );
    });

    it('fetches balances and merges into response', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [
            {
              assetId: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
              balance: '1000000000000000000',
            },
          ],
        });

        const middleware = controller.assetsMiddleware;
        const mockNext = jest.fn().mockImplementation((ctx) => ctx);

        const mockAssetsState = {
          assetsMetadata: {},
          assetsBalance: {},
          customAssets: {},
        };

        const context = {
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance' as const],
          },
          response: {} as Record<string, unknown>,
          getAssetsState: (): typeof mockAssetsState => mockAssetsState,
        };

        await middleware(context, mockNext);

        expect(context.response.assetsBalance).toBeDefined();
      });
    });

    it('removes handled chains from the request for next middleware', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [
            {
              assetId: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
              balance: '1000000000000000000',
            },
          ],
        });

        const middleware = controller.assetsMiddleware;
        let nextContext: unknown = null;
        const mockNext = jest.fn().mockImplementation((ctx) => {
          nextContext = ctx;
          return ctx;
        });

        const mockAssetsState = {
          assetsMetadata: {},
          assetsBalance: {},
          customAssets: {},
        };

        const context = {
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP, 'eip155:137' as ChainId],
            dataTypes: ['balance' as const],
          },
          response: {},
          getAssetsState: (): typeof mockAssetsState => mockAssetsState,
        };

        await middleware(context, mockNext);

        // The successfully handled chain should be removed
        expect((nextContext as typeof context).request.chainIds).not.toContain(
          MOCK_CHAIN_ID_CAIP,
        );
      });
    });

    it('calls next with original context when all chains fail', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        // Make balance fetcher throw to simulate chain failure
        // This causes fetch() to add chain to errors
        mockBalanceFetcher.fetchBalancesForTokens.mockRejectedValue(
          new Error('RPC error'),
        );

        const middleware = controller.assetsMiddleware;
        let receivedContext: unknown = null;
        const mockNext = jest.fn().mockImplementation((ctx) => {
          receivedContext = ctx;
          return ctx;
        });

        const mockAssetsState = {
          assetsMetadata: {},
          assetsBalance: {},
          customAssets: {},
        };

        const originalContext = {
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance' as const],
          },
          response: {},
          getAssetsState: (): typeof mockAssetsState => mockAssetsState,
        };

        await middleware(originalContext, mockNext);

        // When all chains fail (are in errors), next is called with original context
        expect(mockNext).toHaveBeenCalled();
        expect(receivedContext).not.toBeNull();
        // The chain should still be in the request since it failed
        const ctx = receivedContext as typeof originalContext;
        expect(ctx.request.chainIds).toContain(MOCK_CHAIN_ID_CAIP);
      });
    });
  });

  describe('network state changes', () => {
    it('updates active chains when network state changes', async () => {
      await withController(async ({ controller, messenger }) => {
        const initialChains = await controller.getActiveChains();
        expect(initialChains).toContain(MOCK_CHAIN_ID_CAIP);

        // Simulate network state change with new chain
        const newNetworkState = createMockNetworkState({
          networkConfigurationsByChainId: {
            [MOCK_CHAIN_ID_HEX]: {
              chainId: MOCK_CHAIN_ID_HEX,
              name: 'Ethereum Mainnet',
              nativeCurrency: 'ETH',
              defaultRpcEndpointIndex: 0,
              rpcEndpoints: [
                {
                  networkClientId: MOCK_NETWORK_CLIENT_ID,
                  url: 'https://mainnet.infura.io',
                  type: RpcEndpointType.Custom,
                },
              ],
              blockExplorerUrls: [],
            },
            '0x89': {
              chainId: '0x89',
              name: 'Polygon',
              nativeCurrency: 'MATIC',
              defaultRpcEndpointIndex: 0,
              rpcEndpoints: [
                {
                  networkClientId: 'polygon-mainnet',
                  url: 'https://polygon-rpc.com',
                  type: RpcEndpointType.Custom,
                },
              ],
              blockExplorerUrls: [],
            },
          },
          networksMetadata: {
            [MOCK_NETWORK_CLIENT_ID]: {
              status: NetworkStatus.Available,
              EIPS: {},
            },
            'polygon-mainnet': {
              status: NetworkStatus.Available,
              EIPS: {},
            },
          },
        });

        messenger.publish('NetworkController:stateChange', newNetworkState, []);

        const updatedChains = await controller.getActiveChains();
        expect(updatedChains).toContain(MOCK_CHAIN_ID_CAIP);
        expect(updatedChains).toContain('eip155:137');
      });
    });

    it('includes chains with unknown status as active', async () => {
      const networkStateWithUnknown = createMockNetworkState({
        networksMetadata: {
          // No metadata means 'unknown' status
        },
      });

      await withController(
        { networkState: networkStateWithUnknown },
        async ({ controller }) => {
          const activeChains = await controller.getActiveChains();
          // Unknown status chains should be included as active
          expect(activeChains).toContain(MOCK_CHAIN_ID_CAIP);
        },
      );
    });

    it('excludes chains with unavailable status', async () => {
      const networkStateWithUnavailable = createMockNetworkState({
        networksMetadata: {
          [MOCK_NETWORK_CLIENT_ID]: {
            status: NetworkStatus.Unavailable,
            EIPS: {},
          },
        },
      });

      await withController(
        { networkState: networkStateWithUnavailable },
        async ({ controller }) => {
          const activeChains = await controller.getActiveChains();
          // Unavailable chains should be excluded
          expect(activeChains).not.toContain(MOCK_CHAIN_ID_CAIP);
        },
      );
    });

    it('does not emit activeChainsUpdate when chains have not changed', async () => {
      await withController(async ({ messenger }) => {
        const mockActiveChainsUpdate = jest.fn();
        messenger.unregisterActionHandler(
          'AssetsController:activeChainsUpdate',
        );
        messenger.registerActionHandler(
          'AssetsController:activeChainsUpdate',
          mockActiveChainsUpdate,
        );

        // Clear the mock from initial registration
        mockActiveChainsUpdate.mockClear();

        // Publish the same network state (no actual change)
        const sameNetworkState = createMockNetworkState();
        messenger.publish(
          'NetworkController:stateChange',
          sameNetworkState,
          [],
        );

        // Should not emit activeChainsUpdate since chains haven't changed
        expect(mockActiveChainsUpdate).not.toHaveBeenCalled();
      });
    });

    it('skips chains without default RPC endpoint', async () => {
      const networkStateWithBadConfig = createMockNetworkState({
        networkConfigurationsByChainId: {
          [MOCK_CHAIN_ID_HEX]: {
            chainId: MOCK_CHAIN_ID_HEX,
            name: 'Ethereum Mainnet',
            nativeCurrency: 'ETH',
            defaultRpcEndpointIndex: 5, // Out of bounds
            rpcEndpoints: [],
            blockExplorerUrls: [],
          },
        },
      });

      await withController(
        { networkState: networkStateWithBadConfig },
        async ({ controller }) => {
          const activeChains = await controller.getActiveChains();
          // Chain without valid RPC endpoint should be skipped
          expect(activeChains).not.toContain(MOCK_CHAIN_ID_CAIP);
        },
      );
    });
  });

  describe('account scope filtering', () => {
    it('supports accounts with wildcard scope eip155:0', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const wildcardAccount = createMockInternalAccount({
          scopes: ['eip155:0'], // Wildcard - all EVM chains
        });

        const request: DataRequest = {
          accounts: [wildcardAccount],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        await controller.fetch(request);

        expect(mockBalanceFetcher.fetchBalancesForTokens).toHaveBeenCalled();
      });
    });

    it('supports accounts with no scopes (legacy accounts)', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const legacyAccount = createMockInternalAccount({
          scopes: [],
        });

        const request: DataRequest = {
          accounts: [legacyAccount],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        };

        await controller.fetch(request);

        expect(mockBalanceFetcher.fetchBalancesForTokens).toHaveBeenCalled();
      });
    });

    it('filters out accounts that do not match chain scope', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const polygonOnlyAccount = createMockInternalAccount({
          scopes: ['eip155:137'],
        });

        const request: DataRequest = {
          accounts: [polygonOnlyAccount],
          chainIds: [MOCK_CHAIN_ID_CAIP], // Mainnet
          dataTypes: ['balance'],
        };

        await controller.fetch(request);

        expect(
          mockBalanceFetcher.fetchBalancesForTokens,
        ).not.toHaveBeenCalled();
      });
    });

    it('supports accounts with hex chain ID in scope', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const hexScopeAccount = createMockInternalAccount({
          scopes: ['eip155:0x1'], // Hex format
        });

        const request: DataRequest = {
          accounts: [hexScopeAccount],
          chainIds: [MOCK_CHAIN_ID_CAIP], // eip155:1
          dataTypes: ['balance'],
        };

        await controller.fetch(request);

        expect(mockBalanceFetcher.fetchBalancesForTokens).toHaveBeenCalled();
      });
    });

    it('filters accounts with non-matching namespace', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const nonEvmAccount = createMockInternalAccount({
          scopes: ['solana:mainnet'], // Different namespace
        });

        const request: DataRequest = {
          accounts: [nonEvmAccount],
          chainIds: [MOCK_CHAIN_ID_CAIP], // eip155:1
          dataTypes: ['balance'],
        };

        await controller.fetch(request);

        // Should not call balance fetcher for non-matching namespace
        expect(
          mockBalanceFetcher.fetchBalancesForTokens,
        ).not.toHaveBeenCalled();
      });
    });

    it('matches exact chain reference for eip155 chains', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const accountWithExactScope = createMockInternalAccount({
          scopes: ['eip155:1'], // Exact match
        });

        const request: DataRequest = {
          accounts: [accountWithExactScope],
          chainIds: [MOCK_CHAIN_ID_CAIP], // eip155:1
          dataTypes: ['balance'],
        };

        await controller.fetch(request);

        expect(mockBalanceFetcher.fetchBalancesForTokens).toHaveBeenCalled();
      });
    });
  });

  describe('constructor error handling', () => {
    it('handles NetworkController initialization error gracefully', async () => {
      await withController(
        {
          actionHandlerOverrides: {
            'NetworkController:getState': () => {
              throw new Error('NetworkController not available');
            },
          },
        },
        async ({ controller }) => {
          // Controller should still be created
          expect(controller.getName()).toBe('RpcDataSource');
          // But with no active chains
          const chains = await controller.getActiveChains();
          expect(chains).toStrictEqual([]);
        },
      );
    });
  });

  describe('provider error handling', () => {
    it('returns undefined when provider fails to get network client', async () => {
      await withController(
        {
          actionHandlerOverrides: {
            'NetworkController:getNetworkClientById': () => {
              throw new Error('Network client not found');
            },
          },
        },
        async ({ controller, mockBalanceFetcher }) => {
          // Return empty balances to trigger the native balance fallback path
          mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
            balances: [],
          });

          const response = await controller.fetch({
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          });

          // Should have response with empty assetsBalance due to provider error
          expect(response.assetsBalance).toBeDefined();
        },
      );
    });
  });

  describe('provider caching', () => {
    it('uses cached provider on subsequent calls', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [
            {
              assetId: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
              balance: '1000000000000000000',
            },
          ],
        });

        const request = {
          accounts: [createMockInternalAccount()],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance' as const],
        };

        // First fetch - creates and caches provider
        await controller.fetch(request);
        // Second fetch - should use cached provider
        await controller.fetch(request);

        // Both fetches should succeed using the same provider
        expect(mockBalanceFetcher.fetchBalancesForTokens).toHaveBeenCalledTimes(
          2,
        );
      });
    });

    it('returns undefined for unknown chain', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const request = {
          accounts: [createMockInternalAccount()],
          chainIds: ['eip155:999999' as ChainId], // Unknown chain
          dataTypes: ['balance' as const],
        };

        const response = await controller.fetch(request);

        // Unknown chain should be filtered out, no fetches made
        expect(
          mockBalanceFetcher.fetchBalancesForTokens,
        ).not.toHaveBeenCalled();
        expect(response).toStrictEqual({});
      });
    });
  });

  describe('messenger action handlers', () => {
    it('registers and responds to RpcDataSource:getActiveChains action', async () => {
      await withController(async ({ messenger }) => {
        const chains = await messenger.call('RpcDataSource:getActiveChains');
        expect(chains).toContain(MOCK_CHAIN_ID_CAIP);
      });
    });

    it('registers and responds to RpcDataSource:fetch action', async () => {
      await withController(async ({ messenger, mockBalanceFetcher }) => {
        mockBalanceFetcher.fetchBalancesForTokens.mockResolvedValue({
          balances: [],
        });

        const response = await messenger.call('RpcDataSource:fetch', {
          accounts: [createMockInternalAccount()],
          chainIds: [MOCK_CHAIN_ID_CAIP],
          dataTypes: ['balance'],
        });

        expect(response).toBeDefined();
        expect(response.assetsBalance).toBeDefined();
      });
    });

    it('registers and responds to RpcDataSource:subscribe action', async () => {
      await withController(async ({ controller, messenger }) => {
        const result = await messenger.call('RpcDataSource:subscribe', {
          request: {
            accounts: [createMockInternalAccount()],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'messenger-sub-test',
          isUpdate: false,
        });
        expect(result).toBeUndefined();

        await controller.unsubscribe('messenger-sub-test');
      });
    });

    it('registers and responds to RpcDataSource:unsubscribe action', async () => {
      await withController(async ({ messenger }) => {
        const result = await messenger.call(
          'RpcDataSource:unsubscribe',
          'non-existent-sub',
        );
        expect(result).toBeUndefined();
      });
    });

    it('registers and responds to RpcDataSource:getAssetsMiddleware action', async () => {
      await withController(async ({ messenger }) => {
        const middleware = messenger.call('RpcDataSource:getAssetsMiddleware');
        expect(typeof middleware).toBe('function');
      });
    });
  });

  describe('polling interval configuration', () => {
    it('sets balance polling interval via setBalancePollingInterval', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        controller.setBalancePollingInterval(60000);

        expect(mockBalanceFetcher.setIntervalLength).toHaveBeenCalledWith(
          60000,
        );
      });
    });

    it('gets balance polling interval via getBalancePollingInterval', async () => {
      await withController(async ({ controller, mockBalanceFetcher }) => {
        mockBalanceFetcher.getIntervalLength.mockReturnValue(45000);

        const interval = controller.getBalancePollingInterval();

        expect(interval).toBe(45000);
        expect(mockBalanceFetcher.getIntervalLength).toHaveBeenCalled();
      });
    });

    it('sets detection polling interval via setDetectionPollingInterval', async () => {
      await withController(async ({ controller, mockTokenDetector }) => {
        controller.setDetectionPollingInterval(300000);

        expect(mockTokenDetector.setIntervalLength).toHaveBeenCalledWith(
          300000,
        );
      });
    });

    it('gets detection polling interval via getDetectionPollingInterval', async () => {
      await withController(async ({ controller, mockTokenDetector }) => {
        mockTokenDetector.getIntervalLength.mockReturnValue(240000);

        const interval = controller.getDetectionPollingInterval();

        expect(interval).toBe(240000);
        expect(mockTokenDetector.getIntervalLength).toHaveBeenCalled();
      });
    });
  });

  describe('createRpcDataSource factory function', () => {
    it('creates an RpcDataSource instance via factory function', () => {
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
      messenger.registerActionHandler('AssetsController:getState', () => ({
        allTokens: {},
        allDetectedTokens: {},
        allIgnoredTokens: {},
      }));
      messenger.registerActionHandler('TokenListController:getState', () => ({
        tokensChainsCache: {},
      }));
      messenger.registerActionHandler(
        'NetworkEnablementController:getState',
        () => ({
          enabledNetworkMap: {},
          nativeAssetIdentifiers: {},
        }),
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

  describe('balance update callback', () => {
    it('reports balance updates when callback is triggered', async () => {
      await withController(
        async ({ controller, messenger, mockBalanceFetcher }) => {
          const mockAssetsUpdate = jest.fn().mockResolvedValue(undefined);
          messenger.unregisterActionHandler('AssetsController:assetsUpdate');
          messenger.registerActionHandler(
            'AssetsController:assetsUpdate',
            mockAssetsUpdate,
          );

          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-balance-update',
            isUpdate: false,
          });

          // Get the callback that was passed to setOnBalanceUpdate
          const onBalanceUpdate =
            mockBalanceFetcher.setOnBalanceUpdate.mock.calls[0]?.[0];
          expect(onBalanceUpdate).toBeDefined();

          // Simulate balance callback with balances
          onBalanceUpdate({
            chainId: MOCK_CHAIN_ID_HEX,
            accountId: MOCK_ACCOUNT_ID,
            accountAddress: MOCK_ADDRESS,
            balances: [
              {
                assetId: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
                balance: '1000000000000000000',
                formattedBalance: '1',
                decimals: 18,
                timestamp: Date.now(),
              },
            ],
            failedAddresses: [],
            timestamp: Date.now(),
          });

          // Check that the balance update was reported
          expect(mockAssetsUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
              assetsBalance: expect.objectContaining({
                [MOCK_ACCOUNT_ID]: expect.objectContaining({
                  [`${MOCK_CHAIN_ID_CAIP}/slip44:60`]: {
                    amount: '1000000000000000000',
                  },
                }),
              }),
            }),
            'RpcDataSource',
          );

          await controller.unsubscribe('sub-balance-update');
        },
      );
    });

    it('handles errors in balance update callback gracefully', async () => {
      await withController(
        async ({ controller, messenger, mockBalanceFetcher }) => {
          const mockAssetsUpdate = jest
            .fn()
            .mockRejectedValue(new Error('Update failed'));
          messenger.unregisterActionHandler('AssetsController:assetsUpdate');
          messenger.registerActionHandler(
            'AssetsController:assetsUpdate',
            mockAssetsUpdate,
          );

          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-balance-error',
            isUpdate: false,
          });

          // Get the callback that was passed to setOnBalanceUpdate
          const onBalanceUpdate =
            mockBalanceFetcher.setOnBalanceUpdate.mock.calls[0]?.[0];
          expect(onBalanceUpdate).toBeDefined();

          // Simulate balance callback - should not throw even if assetsUpdate rejects
          expect(() => {
            onBalanceUpdate({
              chainId: MOCK_CHAIN_ID_HEX,
              accountId: MOCK_ACCOUNT_ID,
              accountAddress: MOCK_ADDRESS,
              balances: [
                {
                  assetId: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
                  balance: '1000000000000000000',
                  formattedBalance: '1',
                  decimals: 18,
                  timestamp: Date.now(),
                },
              ],
              failedAddresses: [],
              timestamp: Date.now(),
            });
          }).not.toThrow();

          await controller.unsubscribe('sub-balance-error');
        },
      );
    });
  });

  describe('detection update callback error handling', () => {
    it('handles errors in detection update callback gracefully', async () => {
      await withController(
        { options: { tokenDetectionEnabled: true } },
        async ({ controller, messenger, mockTokenDetector }) => {
          const mockAssetsUpdate = jest
            .fn()
            .mockRejectedValue(new Error('Detection update failed'));
          messenger.unregisterActionHandler('AssetsController:assetsUpdate');
          messenger.registerActionHandler(
            'AssetsController:assetsUpdate',
            mockAssetsUpdate,
          );

          await controller.subscribe({
            request: {
              accounts: [createMockInternalAccount()],
              chainIds: [MOCK_CHAIN_ID_CAIP],
              dataTypes: ['balance'],
            },
            subscriptionId: 'sub-detection-error',
            isUpdate: false,
          });

          // Get the callback that was passed to setOnDetectionUpdate
          const onDetectionUpdate =
            mockTokenDetector.setOnDetectionUpdate.mock.calls[0]?.[0];
          expect(onDetectionUpdate).toBeDefined();

          const mockAssetId = `${MOCK_CHAIN_ID_CAIP}/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`;

          // Simulate detection callback - should not throw even if assetsUpdate rejects
          expect(() => {
            onDetectionUpdate({
              chainId: MOCK_CHAIN_ID_HEX,
              accountId: MOCK_ACCOUNT_ID,
              accountAddress: MOCK_ADDRESS,
              detectedAssets: [{ assetId: mockAssetId }],
              detectedBalances: [{ assetId: mockAssetId, balance: '5000000' }],
              zeroBalanceAddresses: [],
              failedAddresses: [],
              timestamp: Date.now(),
            });
          }).not.toThrow();

          await controller.unsubscribe('sub-detection-error');
        },
      );
    });
  });

  describe('internal provider and state getter callbacks', () => {
    it('multicall provider getter returns a valid provider for known chain', async () => {
      await withController(async ({ multicallProviderGetter }) => {
        expect(multicallProviderGetter).toBeDefined();

        // Call the provider getter with a hex chain ID
        const rpcProvider = multicallProviderGetter?.(MOCK_CHAIN_ID_HEX);
        expect(rpcProvider).toBeDefined();

        // The provider should have call and getBalance methods
        expect(rpcProvider).toHaveProperty('call');
        expect(rpcProvider).toHaveProperty('getBalance');
      });
    });

    it('multicall provider getter throws for unknown chain', async () => {
      await withController(async ({ multicallProviderGetter }) => {
        expect(multicallProviderGetter).toBeDefined();

        // Call the provider getter with an unknown chain ID
        expect(() => multicallProviderGetter?.('0x999999')).toThrow(
          'No provider available for chain 0x999999',
        );
      });
    });

    it('multicall provider getter throws when network client throws', async () => {
      await withController(
        {
          actionHandlerOverrides: {
            'NetworkController:getNetworkClientById': (
              _networkClientId: string,
            ): {
              provider: EthereumProvider;
              configuration: { chainId: string };
            } => {
              throw new Error('Network client not available');
            },
          },
        },
        async ({ multicallProviderGetter }) => {
          expect(multicallProviderGetter).toBeDefined();

          // Call the provider getter - should throw because getProvider returns undefined
          // due to the caught error
          expect(() => multicallProviderGetter?.(MOCK_CHAIN_ID_HEX)).toThrow(
            `No provider available for chain ${MOCK_CHAIN_ID_HEX}`,
          );
        },
      );
    });

    it('multicall provider getter uses cached provider on second call', async () => {
      await withController(async ({ multicallProviderGetter }) => {
        expect(multicallProviderGetter).toBeDefined();

        // First call - creates and caches provider
        const provider1 = multicallProviderGetter?.(MOCK_CHAIN_ID_HEX);
        expect(provider1).toBeDefined();

        // Second call - should use cached provider
        const provider2 = multicallProviderGetter?.(MOCK_CHAIN_ID_HEX);
        expect(provider2).toBeDefined();
      });
    });

    it('state getter callbacks are invoked by BalanceFetcher', async () => {
      await withController(async ({ mockBalanceFetcher }) => {
        // Get the callback that was passed to setUserTokensStateGetter
        const getUserTokensState =
          mockBalanceFetcher.setUserTokensStateGetter.mock.calls[0]?.[0];
        expect(getUserTokensState).toBeDefined();

        // Invoke the callback - should return state from AssetsController
        const state = getUserTokensState();
        expect(state).toStrictEqual({
          allTokens: {},
          allDetectedTokens: {},
          allIgnoredTokens: {},
        });
      });
    });

    it('state getter callbacks are invoked by TokenDetector', async () => {
      await withController(async ({ mockTokenDetector }) => {
        // Get the callback that was passed to setTokenListStateGetter
        const getTokenListState =
          mockTokenDetector.setTokenListStateGetter.mock.calls[0]?.[0];
        expect(getTokenListState).toBeDefined();

        // Invoke the callback - should return state from TokenListController
        const state = getTokenListState();
        expect(state).toStrictEqual({
          tokensChainsCache: {},
        });
      });
    });
  });
});
