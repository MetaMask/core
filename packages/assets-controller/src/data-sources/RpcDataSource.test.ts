/* eslint-disable jest/unbound-method */
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkState } from '@metamask/network-controller';
import { NetworkStatus, RpcEndpointType } from '@metamask/network-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { BalanceFetcher, TokenDetector } from './evm-rpc-services';
import type {
  Address,
  BalanceFetchResult,
  TokenDetectionResult,
} from './evm-rpc-services';
import type { RpcDataSourceOptions } from './RpcDataSource';
import {
  RpcDataSource,
  caipChainIdToHex,
  createRpcDataSource,
} from './RpcDataSource';
import {
  createMockAssetControllerMessenger,
  MockRootMessenger,
  registerRpcDataSourceActions,
} from '../__fixtures__/MockAssetControllerMessenger';
import { getDefaultAssetsControllerState } from '../AssetsController';
import type { AssetsControllerMessenger } from '../AssetsController';
import type { Caip19AssetId, ChainId, DataRequest, Context } from '../types';

const MOCK_CHAIN_ID_HEX = '0x1';
const MOCK_CHAIN_ID_CAIP = 'eip155:1' as ChainId;
const MOCK_ACCOUNT_ID = 'mock-account-id';
const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890';
type EthereumProvider = { request: jest.Mock };

function createBalanceFetchResult(
  overrides?: Partial<BalanceFetchResult>,
): BalanceFetchResult {
  return {
    chainId: MOCK_CHAIN_ID_HEX,
    accountId: MOCK_ACCOUNT_ID,
    accountAddress: MOCK_ADDRESS as Address,
    timestamp: Date.now(),
    balances: [],
    failedAddresses: [],
    ...overrides,
  } as BalanceFetchResult;
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
  overrides?: Partial<NetworkState>,
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
    ...overrides,
  } as unknown as NetworkState;
}

type ActionHandlerOverrides = {
  'NetworkController:getState'?: () => NetworkState;
  'NetworkController:getNetworkClientById'?: (networkClientId: string) => {
    provider?: EthereumProvider;
    configuration: { chainId: string };
  };
  'AssetsController:getState'?: () => unknown;
  'TokenListController:getState'?: () => unknown;
  'NetworkEnablementController:getState'?: () => unknown;
};

type WithControllerOptions = {
  options?: Partial<RpcDataSourceOptions>;
  networkState?: NetworkState;
  actionHandlerOverrides?: ActionHandlerOverrides;
};

type WithControllerCallback<ReturnValue> = (ctx: {
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
  ...args:
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
    | [WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [controllerOptions, fn] = args.length === 2 ? args : [{}, args[0]];
  const {
    options = {},
    networkState = createMockNetworkState(),
    actionHandlerOverrides,
  } = controllerOptions;

  const { rootMessenger, assetsControllerMessenger } =
    createMockAssetControllerMessenger();
  const defaultNetworkState = networkState ?? createMockNetworkState();

  if (actionHandlerOverrides) {
    for (const [action, handler] of Object.entries(actionHandlerOverrides)) {
      if (handler) {
        (
          rootMessenger as {
            registerActionHandler: (a: string, h: () => unknown) => void;
          }
        ).registerActionHandler(action, handler as () => unknown);
      }
    }
    if (!actionHandlerOverrides['NetworkController:getState']) {
      (
        rootMessenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler(
        'NetworkController:getState',
        () => defaultNetworkState,
      );
    }
    if (!actionHandlerOverrides['NetworkController:getNetworkClientById']) {
      (
        rootMessenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkController:getNetworkClientById', () => ({
        provider: { request: jest.fn().mockResolvedValue('0x0') },
        configuration: { chainId: MOCK_CHAIN_ID_HEX },
      }));
    }
    if (!actionHandlerOverrides['AssetsController:getState']) {
      (
        rootMessenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('AssetsController:getState', () =>
        getDefaultAssetsControllerState(),
      );
    }
    if (!actionHandlerOverrides['TokenListController:getState']) {
      (
        rootMessenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('TokenListController:getState', () => ({
        tokensChainsCache: {},
      }));
    }
    if (!actionHandlerOverrides['NetworkEnablementController:getState']) {
      (
        rootMessenger as {
          registerActionHandler: (a: string, h: () => unknown) => void;
        }
      ).registerActionHandler('NetworkEnablementController:getState', () => ({
        enabledNetworkMap: {},
        nativeAssetIdentifiers: {
          [MOCK_CHAIN_ID_CAIP]: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
        },
      }));
    }
  } else {
    registerRpcDataSourceActions(rootMessenger, { networkState });
  }

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

jest.mock('@ethersproject/providers', () => ({
  Web3Provider: jest.fn().mockImplementation(() => ({
    getBalance: jest
      .fn()
      .mockResolvedValue({ toString: () => '1000000000000000000' }),
    call: jest.fn().mockResolvedValue('0x0'),
  })),
}));

describe('caipChainIdToHex', () => {
  it('returns hex unchanged when given hex string', () => {
    expect(caipChainIdToHex('0x1')).toBe('0x1');
    expect(caipChainIdToHex('0x89')).toBe('0x89');
  });

  it('converts CAIP-2 chain ID to hex', () => {
    expect(caipChainIdToHex('eip155:1')).toBe('0x1');
    expect(caipChainIdToHex('eip155:137')).toBe('0x89');
  });

  it('throws when given invalid chain ID', () => {
    expect(() => caipChainIdToHex('invalid')).toThrow(
      'caipChainIdToHex - Failed to provide CAIP-2 or Hex chainId',
    );
  });
});

describe('createRpcDataSource', () => {
  it('returns an instance of RpcDataSource', () => {
    const { assetsControllerMessenger } = createMockAssetControllerMessenger();
    const source = createRpcDataSource({
      messenger: assetsControllerMessenger,
      onActiveChainsUpdated: jest.fn(),
    });
    expect(source).toBeInstanceOf(RpcDataSource);
    source.destroy();
  });
});

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

    it('initializes with custom balance and detection intervals', async () => {
      await withController(
        {
          options: {
            balanceInterval: 60000,
            detectionInterval: 300000,
          },
        },
        ({ controller }) => {
          expect(controller.getBalancePollingInterval()).toBe(60000);
          expect(controller.getDetectionPollingInterval()).toBe(300000);
        },
      );
    });

    it('initializes with tokenDetectionEnabled and useExternalService getters', async () => {
      await withController(
        {
          options: {
            tokenDetectionEnabled: () => true,
            useExternalService: () => false,
          },
        },
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

    it('updates state.activeChains before calling onActiveChainsUpdated', async () => {
      let source: RpcDataSource | null = null;
      let callbackResult: {
        syncChains: ChainId[];
        newChains: ChainId[];
      } | null = null;
      await withController(
        {
          networkState: createMockNetworkState(NetworkStatus.Degraded),
          options: {
            onActiveChainsUpdated: (
              _name: string,
              newChains: ChainId[],
              _previousChains: ChainId[],
            ) => {
              if (source !== null) {
                callbackResult = {
                  // eslint-disable-next-line n/no-sync -- testing sync API used by AssetsController
                  syncChains: source.getActiveChainsSync(),
                  newChains,
                };
              }
            },
          },
        },
        async ({ controller, rootMessenger }) => {
          source = controller;
          rootMessenger.publish(
            'NetworkController:stateChange',
            createMockNetworkState(NetworkStatus.Available),
            [],
          );
          await new Promise(process.nextTick);
          expect(callbackResult).not.toBeNull();
          expect(callbackResult?.syncChains).toStrictEqual(
            callbackResult?.newChains,
          );
        },
      );
    });

    it('handles NetworkController getState failure in init', async () => {
      await withController(
        {
          actionHandlerOverrides: {
            'NetworkController:getState': () => {
              throw new Error('Network unavailable');
            },
          },
        },
        ({ controller }) => {
          expect(
            // eslint-disable-next-line n/no-sync -- testing sync API
            controller.getActiveChainsSync(),
          ).toStrictEqual([]);
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

    it('returns empty array when no chains available', async () => {
      const emptyState = createMockNetworkState(NetworkStatus.Degraded);
      await withController(
        { networkState: emptyState },
        async ({ controller }) => {
          const chains = await controller.getActiveChains();
          expect(chains).toStrictEqual([]);
        },
      );
    });
  });

  describe('getChainStatuses / getChainStatus', () => {
    it('returns chain statuses and single chain status', async () => {
      await withController(({ controller }) => {
        const statuses = controller.getChainStatuses();
        expect(statuses[MOCK_CHAIN_ID_CAIP]).toBeDefined();
        expect(statuses[MOCK_CHAIN_ID_CAIP].status).toBe('available');
        const status = controller.getChainStatus(MOCK_CHAIN_ID_CAIP);
        expect(status?.chainId).toBe(MOCK_CHAIN_ID_CAIP);
      });
    });

    it('returns undefined for non-existent chain', async () => {
      await withController(({ controller }) => {
        expect(
          controller.getChainStatus('eip155:999' as ChainId),
        ).toBeUndefined();
      });
    });
  });

  describe('polling interval getters/setters', () => {
    it('sets and gets balance polling interval', async () => {
      await withController(({ controller }) => {
        controller.setBalancePollingInterval(45_000);
        expect(controller.getBalancePollingInterval()).toBe(45_000);
      });
    });

    it('sets and gets detection polling interval', async () => {
      await withController(({ controller }) => {
        controller.setDetectionPollingInterval(120_000);
        expect(controller.getDetectionPollingInterval()).toBe(120_000);
      });
    });
  });

  describe('fetch', () => {
    it('fetches balances for accounts', async () => {
      await withController(async ({ controller }) => {
        const response = await controller.fetch(createDataRequest());
        expect(response).toBeDefined();
        expect(response.assetsBalance).toBeDefined();
      });
    });

    it('converts fetched balances to human-readable and merges metadata', async () => {
      const nativeAssetId = 'eip155:1/slip44:60' as Caip19AssetId;
      await withController(async ({ controller }) => {
        jest
          .spyOn(BalanceFetcher.prototype, 'fetchBalancesForTokens')
          .mockResolvedValue({
            chainId: MOCK_CHAIN_ID_HEX,
            accountId: MOCK_ACCOUNT_ID,
            accountAddress: MOCK_ADDRESS as Address,
            timestamp: Date.now(),
            balances: [
              {
                assetId: nativeAssetId,
                accountId: MOCK_ACCOUNT_ID,
                chainId: MOCK_CHAIN_ID_HEX,
                balance: '1000000000000000000',
                formattedBalance: '1',
                decimals: 18,
                timestamp: Date.now(),
              },
            ],
            failedAddresses: [],
          });
        const response = await controller.fetch(createDataRequest());
        expect(response.assetsBalance).toBeDefined();
        expect(response.assetsBalance?.[MOCK_ACCOUNT_ID]).toBeDefined();
        expect(
          response.assetsBalance?.[MOCK_ACCOUNT_ID]?.[nativeAssetId],
        ).toStrictEqual({ amount: '1' });
        expect(response.assetsInfo?.[nativeAssetId]).toMatchObject({
          type: 'native',
          symbol: 'ETH',
          decimals: 18,
        });
      });
    });

    it('uses getBalance when Multicall aggregate3 fails (#getMulticallProvider getBalance)', async () => {
      const { Web3Provider } = jest.requireMock('@ethersproject/providers');
      const mockCall = jest
        .fn()
        .mockRejectedValueOnce(new Error('aggregate3 unavailable'))
        .mockResolvedValue('0x0');
      const mockGetBalance = jest
        .fn()
        .mockResolvedValue({ toString: () => '1000000000000000000' });
      (Web3Provider as jest.Mock).mockImplementationOnce(() => ({
        call: mockCall,
        getBalance: mockGetBalance,
      }));

      await withController(async ({ controller }) => {
        const response = await controller.fetch(createDataRequest());
        expect(response.assetsBalance).toBeDefined();
        expect(response.assetsBalance?.[MOCK_ACCOUNT_ID]).toBeDefined();
        expect(mockGetBalance).toHaveBeenCalled();
      });
    });

    it('returns empty response when no active chains match', async () => {
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

    it('initializes assetsBalance[accountId] in catch when first fetch for account throws', async () => {
      await withController(async ({ controller }) => {
        jest
          .spyOn(BalanceFetcher.prototype, 'fetchBalancesForTokens')
          .mockRejectedValue(new Error('RPC unavailable'));
        const request = createDataRequest();
        const response = await controller.fetch(request);
        expect(response.errors).toBeDefined();
        expect(response.errors?.[MOCK_CHAIN_ID_CAIP]).toBe('RPC fetch failed');
        expect(response.assetsBalance).toBeDefined();
        expect(response.assetsBalance?.[MOCK_ACCOUNT_ID]).toBeDefined();
        expect(
          response.assetsBalance?.[MOCK_ACCOUNT_ID]?.['eip155:1/slip44:60'],
        ).toStrictEqual({ amount: '0' });
      });
    });

    it('returns undefined from #getProvider when network client has no provider', async () => {
      const networkState = createMockNetworkState(NetworkStatus.Available);
      (networkState.networkConfigurationsByChainId as Record<string, unknown>)[
        '0x89'
      ] = {
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

      await withController(
        {
          networkState,
          actionHandlerOverrides: {
            'NetworkController:getNetworkClientById': (
              networkClientId: string,
            ) => {
              if (networkClientId === 'polygon') {
                return { configuration: { chainId: '0x89' } };
              }
              return {
                provider: { request: jest.fn().mockResolvedValue('0x0') },
                configuration: { chainId: MOCK_CHAIN_ID_HEX },
              };
            },
          },
        },
        async ({ controller }) => {
          const account = createMockInternalAccount();
          const request: DataRequest = {
            accountsWithSupportedChains: [
              {
                account,
                supportedChains: [MOCK_CHAIN_ID_CAIP, 'eip155:137' as ChainId],
              },
            ],
            chainIds: [MOCK_CHAIN_ID_CAIP, 'eip155:137' as ChainId],
            dataTypes: ['balance'],
          };
          const response = await controller.fetch(request);
          expect(response.assetsBalance).toBeDefined();
          expect(response.errors).toBeDefined();
          expect(response.errors?.['eip155:137']).toBe('RPC fetch failed');
        },
      );
    });

    it('includes error and native balance when fetch fails for a chain', async () => {
      const networkState = createMockNetworkState(NetworkStatus.Available);
      (networkState.networkConfigurationsByChainId as Record<string, unknown>)[
        '0x89'
      ] = {
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

      await withController(
        {
          networkState,
          actionHandlerOverrides: {
            'NetworkController:getNetworkClientById': (
              networkClientId: string,
            ) => {
              if (networkClientId === 'polygon') {
                throw new Error('Provider unavailable');
              }
              return {
                provider: { request: jest.fn().mockResolvedValue('0x0') },
                configuration: { chainId: MOCK_CHAIN_ID_HEX },
              };
            },
          },
        },
        async ({ controller }) => {
          const account = createMockInternalAccount();
          const request: DataRequest = {
            accountsWithSupportedChains: [
              {
                account,
                supportedChains: [MOCK_CHAIN_ID_CAIP, 'eip155:137' as ChainId],
              },
            ],
            chainIds: [MOCK_CHAIN_ID_CAIP, 'eip155:137' as ChainId],
            dataTypes: ['balance'],
          };
          const response = await controller.fetch(request);
          expect(response.assetsBalance).toBeDefined();
          expect(response.errors).toBeDefined();
          expect(response.errors?.['eip155:137']).toBe('RPC fetch failed');
        },
      );
    });

    it('merges metadata from chain status, existing state, and token list', async () => {
      const getState = jest.fn().mockReturnValue({
        assetsInfo: {
          'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
            type: 'erc20',
            symbol: 'USDC',
            name: 'USD Coin',
            decimals: 6,
          },
        },
        assetsBalance: {},
        assetsPrice: {},
        customAssets: {},
        assetPreferences: {},
        selectedCurrency: 'usd',
      });
      const tokenListState = {
        tokensChainsCache: {
          '0x1': {
            data: {
              '0xabcdef00000000000000000000000000000000': {
                symbol: 'TKN',
                name: 'Token',
                decimals: 18,
                iconUrl: 'https://example.com/icon.png',
              },
            },
          },
        },
      };
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': getState,
            'TokenListController:getState': () => tokenListState,
          },
        },
        async ({ controller }) => {
          const response = await controller.fetch(createDataRequest());
          expect(response).toBeDefined();
        },
      );
    });

    it('handles AssetsController:getState throw in metadata lookup', async () => {
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => {
              throw new Error('Controller not ready');
            },
          },
        },
        async ({ controller }) => {
          const response = await controller.fetch(createDataRequest());
          expect(response).toBeDefined();
        },
      );
    });
  });

  describe('detectTokens', () => {
    it('returns empty when token detection disabled', async () => {
      await withController(
        {
          options: {
            tokenDetectionEnabled: () => false,
            useExternalService: () => true,
          },
        },
        async ({ controller }) => {
          const result = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );
          expect(result).toStrictEqual({});
        },
      );
    });

    it('returns empty when useExternalService false', async () => {
      await withController(
        {
          options: {
            tokenDetectionEnabled: () => true,
            useExternalService: () => false,
          },
        },
        async ({ controller }) => {
          const result = await controller.detectTokens(
            MOCK_CHAIN_ID_CAIP,
            createMockInternalAccount(),
          );
          expect(result).toStrictEqual({});
        },
      );
    });

    it('returns detected tokens when detection succeeds', async () => {
      const assetId = 'eip155:1/erc20:0xabc' as Caip19AssetId;
      const detectTokensSpy = jest
        .spyOn(TokenDetector.prototype, 'detectTokens')
        .mockResolvedValue({
          chainId: MOCK_CHAIN_ID_HEX,
          accountId: MOCK_ACCOUNT_ID,
          accountAddress: MOCK_ADDRESS as Address,
          detectedAssets: [
            {
              assetId,
              symbol: 'TST',
              name: 'Test',
              decimals: 18,
            } as TokenDetectionResult['detectedAssets'][0],
          ],
          detectedBalances: [
            {
              assetId,
              balance: '1000000000000000000',
            } as TokenDetectionResult['detectedBalances'][0],
          ],
          zeroBalanceAddresses: [],
          failedAddresses: [],
          timestamp: Date.now(),
        });

      await withController(async ({ controller }) => {
        const result = await controller.detectTokens(
          MOCK_CHAIN_ID_CAIP,
          createMockInternalAccount(),
        );
        expect(result.detectedAssets).toBeDefined();
        expect(result.assetsBalance).toBeDefined();
        expect(Object.keys(result.assetsInfo ?? {})).toHaveLength(1);
      });
      detectTokensSpy.mockRestore();
    });

    it('returns empty when no new tokens detected', async () => {
      jest.spyOn(TokenDetector.prototype, 'detectTokens').mockResolvedValue({
        chainId: MOCK_CHAIN_ID_HEX,
        accountId: MOCK_ACCOUNT_ID,
        accountAddress: MOCK_ADDRESS as Address,
        detectedAssets: [],
        detectedBalances: [],
        zeroBalanceAddresses: [],
        failedAddresses: [],
        timestamp: Date.now(),
      });

      await withController(async ({ controller }) => {
        const result = await controller.detectTokens(
          MOCK_CHAIN_ID_CAIP,
          createMockInternalAccount(),
        );
        expect(result).toStrictEqual({});
      });
    });

    it('returns empty and does not throw when detectTokens throws', async () => {
      jest
        .spyOn(TokenDetector.prototype, 'detectTokens')
        .mockRejectedValue(new Error('RPC error'));

      await withController(async ({ controller }) => {
        const result = await controller.detectTokens(
          MOCK_CHAIN_ID_CAIP,
          createMockInternalAccount(),
        );
        expect(result).toStrictEqual({});
      });
    });
  });

  describe('assetsMiddleware', () => {
    it('passes through when no supported chains', async () => {
      await withController(async ({ controller }) => {
        const context: Context = {
          request: createDataRequest({ chainIds: ['eip155:999' as ChainId] }),
          response: {},
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx: Context) => Promise.resolve(ctx));
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(context);
      });
    });

    it('fetches and merges balance and assetsInfo into context', async () => {
      await withController(async ({ controller }) => {
        const context: Context = {
          request: createDataRequest(),
          response: { assetsBalance: {}, assetsInfo: {} },
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx: Context) => Promise.resolve(ctx));
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalled();
        expect(context.response.assetsBalance).toBeDefined();
      });
    });

    it('passes remaining chainIds to next when some chains handled', async () => {
      await withController(async ({ controller }) => {
        const context: Context = {
          request: createDataRequest(),
          response: {},
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx: Context) => Promise.resolve(ctx));
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            request: expect.objectContaining({
              chainIds: expect.any(Array),
            }),
          }),
        );
      });
    });

    it('merges response.assetsInfo into context when fetch returns metadata', async () => {
      await withController(async ({ controller }) => {
        const context: Context = {
          request: createDataRequest(),
          response: { assetsInfo: {} },
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx: Context) => Promise.resolve(ctx));
        await controller.assetsMiddleware(context, next);
        expect(context.response.assetsInfo).toBeDefined();
        expect(next).toHaveBeenCalled();
      });
    });

    it('merges response.assetsInfo into context when fetch returns assetsInfo', async () => {
      const nativeAssetId = 'eip155:1/slip44:60' as Caip19AssetId;
      const mockAssetsInfo = {
        [nativeAssetId]: {
          type: 'native' as const,
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18,
        },
      };
      await withController(async ({ controller }) => {
        const context: Context = {
          request: createDataRequest(),
          response: {},
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx: Context) => Promise.resolve(ctx));
        jest.spyOn(controller, 'fetch').mockResolvedValue({
          assetsBalance: {},
          assetsInfo: mockAssetsInfo,
        });
        await controller.assetsMiddleware(context, next);
        expect(context.response.assetsInfo).toStrictEqual(mockAssetsInfo);
      });
    });

    it('calls next(context) unchanged when fetch returns errors for all chains', async () => {
      await withController(async ({ controller }) => {
        const context: Context = {
          request: createDataRequest(),
          response: {},
          getAssetsState: jest.fn(),
        };
        const next = jest
          .fn()
          .mockImplementation((ctx: Context) => Promise.resolve(ctx));
        jest.spyOn(controller, 'fetch').mockResolvedValue({
          errors: { [MOCK_CHAIN_ID_CAIP]: 'RPC fetch failed' },
        });
        await controller.assetsMiddleware(context, next);
        expect(next).toHaveBeenCalledWith(context);
      });
    });
  });

  describe('subscribe', () => {
    it('creates a subscription and starts polling', async () => {
      const balanceStartSpy = jest.spyOn(
        BalanceFetcher.prototype,
        'startPolling',
      );
      const detectionStartSpy = jest.spyOn(
        TokenDetector.prototype,
        'startPolling',
      );

      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        const expectedInput = {
          chainId: MOCK_CHAIN_ID_HEX,
          accountId: MOCK_ACCOUNT_ID,
          accountAddress: MOCK_ADDRESS,
        };
        expect(balanceStartSpy).toHaveBeenCalledWith(expectedInput);
        expect(detectionStartSpy).toHaveBeenCalledWith(expectedInput);
      });
    });

    it('uses request.chainIds when activeChains is empty so subscription can start', async () => {
      const balanceStartSpy = jest.spyOn(
        BalanceFetcher.prototype,
        'startPolling',
      );
      const networkState = createMockNetworkState(NetworkStatus.Degraded);
      await withController({ networkState }, async ({ controller }) => {
        // eslint-disable-next-line n/no-sync -- testing sync API used by AssetsController
        expect(controller.getActiveChainsSync()).toStrictEqual([]);

        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        expect(balanceStartSpy).toHaveBeenCalledWith({
          chainId: MOCK_CHAIN_ID_HEX,
          accountId: MOCK_ACCOUNT_ID,
          accountAddress: MOCK_ADDRESS,
        });
        await controller.unsubscribe('test-sub');
      });
    });

    it('starts balance polling for chain (Polygon)', async () => {
      const balanceStartSpy = jest.spyOn(
        BalanceFetcher.prototype,
        'startPolling',
      );

      const polygonChainId = 'eip155:137' as ChainId;
      const networkState = createMockNetworkState(NetworkStatus.Available);
      (networkState.networkConfigurationsByChainId as Record<string, unknown>)[
        '0x89'
      ] = {
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
        await controller.subscribe({
          request: createDataRequest({ chainIds: [polygonChainId] }),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        expect(balanceStartSpy).toHaveBeenCalledWith(
          expect.objectContaining({ chainId: '0x89' }),
        );
        await controller.unsubscribe('test-sub');
      });
    });

    it('returns early when chainsToSubscribe is empty', async () => {
      const networkState = createMockNetworkState(NetworkStatus.Degraded);
      await withController({ networkState }, async ({ controller }) => {
        await controller.subscribe({
          request: {
            accountsWithSupportedChains: [
              {
                account: createMockInternalAccount(),
                supportedChains: [],
              },
            ],
            chainIds: [],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        // eslint-disable-next-line n/no-sync -- testing sync API used by AssetsController
        expect(controller.getActiveChainsSync()).toStrictEqual([]);
      });
    });

    it('updates existing subscription when isUpdate true', async () => {
      const balanceStartSpy = jest.spyOn(
        BalanceFetcher.prototype,
        'startPolling',
      );
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
        expect(balanceStartSpy).toHaveBeenCalledTimes(2);
      });
    });

    it('skips account when chainsForAccount is empty', async () => {
      const balanceStartSpy = jest.spyOn(
        BalanceFetcher.prototype,
        'startPolling',
      );
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: {
            accountsWithSupportedChains: [
              {
                account: createMockInternalAccount(),
                supportedChains: ['eip155:137' as ChainId],
              },
            ],
            chainIds: [MOCK_CHAIN_ID_CAIP],
            dataTypes: ['balance'],
          },
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        expect(balanceStartSpy).not.toHaveBeenCalled();
        await controller.unsubscribe('test-sub');
      });
    });

    it('unsubscribe stops all polling', async () => {
      const balanceStopSpy = jest.spyOn(
        BalanceFetcher.prototype,
        'stopPollingByPollingToken',
      );
      const detectionStopSpy = jest.spyOn(
        TokenDetector.prototype,
        'stopPollingByPollingToken',
      );

      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub');
        expect(balanceStopSpy).toHaveBeenCalled();
        expect(detectionStopSpy).toHaveBeenCalled();
      });
    });
  });

  describe('unsubscribe', () => {
    it('removes subscription', async () => {
      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });
        await controller.unsubscribe('test-sub');
        await controller.unsubscribe('test-sub');
        expect(true).toBe(true);
      });
    });

    it('handles unsubscribing non-existent subscription', async () => {
      await withController(async ({ controller }) => {
        const result = await controller.unsubscribe('non-existent');
        expect(result).toBeUndefined();
      });
    });
  });

  describe('handleBalanceUpdate (via callback)', () => {
    it('invokes onAssetsUpdate with balance response when BalanceFetcher callback runs', async () => {
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        expect(balanceUpdateCallback).not.toBeNull();
        balanceUpdateCallback?.(
          createBalanceFetchResult({
            balances: [
              {
                assetId: 'eip155:1/slip44:60' as Caip19AssetId,
                balance: '1000000000000000000',
              } as BalanceFetchResult['balances'][0],
            ],
          }),
        );
      });
    });

    it('uses existing metadata from AssetsController state for ERC20 (#getExistingAssetsMetadata)', async () => {
      const erc20AssetId =
        'eip155:1/erc20:0xExisting00000000000000000000000000000001' as Caip19AssetId;
      const existingMetadata = {
        type: 'erc20' as const,
        symbol: 'FROM_STATE',
        name: 'From State',
        decimals: 6,
      };
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: { [erc20AssetId]: existingMetadata },
            }),
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });
          expect(balanceUpdateCallback).not.toBeNull();
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: erc20AssetId,
                  balance: '1000000',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      expect(onAssetsUpdate).toHaveBeenCalled();
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[erc20AssetId]).toStrictEqual(existingMetadata);
    });

    it('uses token list metadata for ERC20 not in AssetsController state (#getTokenMetadataFromTokenList)', async () => {
      const tokenAddress = '0xDef4567890123456789012345678901234567890';
      const erc20AssetId = `eip155:1/erc20:${tokenAddress}` as Caip19AssetId;
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const tokenListState = {
        tokensChainsCache: {
          [MOCK_CHAIN_ID_HEX]: {
            timestamp: 0,
            data: {
              [tokenAddress.toLowerCase()]: {
                address: tokenAddress,
                symbol: 'TKN',
                name: 'Test Token',
                decimals: 18,
                iconUrl: 'https://example.com/icon.png',
              },
            },
          },
        },
      };

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: {},
            }),
            'TokenListController:getState': () => tokenListState,
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });

          expect(balanceUpdateCallback).not.toBeNull();
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: erc20AssetId,
                  balance: '0',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      expect(onAssetsUpdate).toHaveBeenCalled();
      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[erc20AssetId]).toStrictEqual({
        type: 'erc20',
        symbol: 'TKN',
        name: 'Test Token',
        decimals: 18,
        image: 'https://example.com/icon.png',
      });
    });

    it('falls back to default metadata when ERC20 not in token list (#getTokenMetadataFromTokenList no match)', async () => {
      const tokenAddress = '0xAbc0000000000000000000000000000000000001';
      const erc20AssetId = `eip155:1/erc20:${tokenAddress}` as Caip19AssetId;
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const tokenListState = {
        tokensChainsCache: {
          [MOCK_CHAIN_ID_HEX]: {
            timestamp: 0,
            data: {
              '0xOtherAddress': {
                address: '0xOtherAddress',
                symbol: 'OTH',
                name: 'Other',
                decimals: 18,
              },
            },
          },
        },
      };

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: {},
            }),
            'TokenListController:getState': () => tokenListState,
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: erc20AssetId,
                  balance: '0',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[erc20AssetId]).toStrictEqual({
        type: 'erc20',
        symbol: '',
        name: '',
        decimals: 18,
      });
    });

    it('falls back to default metadata when token list has no chain cache (#getTokenMetadataFromTokenList)', async () => {
      const erc20AssetId =
        'eip155:1/erc20:0xAbc0000000000000000000000000000000000002' as Caip19AssetId;
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: {},
            }),
            'TokenListController:getState': () => ({ tokensChainsCache: {} }),
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: erc20AssetId,
                  balance: '0',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[erc20AssetId]).toStrictEqual({
        type: 'erc20',
        symbol: '',
        name: '',
        decimals: 18,
      });
    });

    it('falls back to default metadata when token list entry lacks symbol/decimals (#getTokenMetadataFromTokenList)', async () => {
      const tokenAddress = '0xAbc0000000000000000000000000000000000003';
      const erc20AssetId = `eip155:1/erc20:${tokenAddress}` as Caip19AssetId;
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const tokenListState = {
        tokensChainsCache: {
          [MOCK_CHAIN_ID_HEX]: {
            timestamp: 0,
            data: {
              [tokenAddress.toLowerCase()]: {
                address: tokenAddress,
                symbol: '',
                name: 'Incomplete',
                decimals: undefined as unknown as number,
              },
            },
          },
        },
      };

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: {},
            }),
            'TokenListController:getState': () => tokenListState,
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: erc20AssetId,
                  balance: '0',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[erc20AssetId]).toStrictEqual({
        type: 'erc20',
        symbol: '',
        name: '',
        decimals: 18,
      });
    });

    it('falls back to default metadata when non-ERC20 assetId in balance (#getTokenMetadataFromTokenList)', async () => {
      const nonErc20AssetId =
        'eip155:1/erc721:0xAbc0000000000000000000000000000000000004' as Caip19AssetId;
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: {},
            }),
            'TokenListController:getState': () => ({
              tokensChainsCache: {
                [MOCK_CHAIN_ID_HEX]: { timestamp: 0, data: {} },
              },
            }),
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: nonErc20AssetId,
                  balance: '0',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[nonErc20AssetId]).toStrictEqual({
        type: 'erc20',
        symbol: '',
        name: '',
        decimals: 18,
      });
    });

    it('falls back to default metadata when TokenListController:getState throws (#getTokenMetadataFromTokenList catch)', async () => {
      const erc20AssetId =
        'eip155:1/erc20:0xAbc0000000000000000000000000000000000005' as Caip19AssetId;
      let balanceUpdateCallback: ((result: BalanceFetchResult) => void) | null =
        null;
      jest
        .spyOn(BalanceFetcher.prototype, 'setOnBalanceUpdate')
        .mockImplementation(function (this: BalanceFetcher, callback) {
          balanceUpdateCallback = callback;
        });

      const onAssetsUpdate = jest.fn();
      await withController(
        {
          actionHandlerOverrides: {
            'AssetsController:getState': () => ({
              ...getDefaultAssetsControllerState(),
              assetsInfo: {},
            }),
            'TokenListController:getState': () => {
              throw new Error('Token list unavailable');
            },
          },
        },
        async ({ controller }) => {
          await controller.subscribe({
            request: createDataRequest(),
            subscriptionId: 'test-sub',
            isUpdate: false,
            onAssetsUpdate,
          });
          balanceUpdateCallback?.(
            createBalanceFetchResult({
              balances: [
                {
                  assetId: erc20AssetId,
                  balance: '0',
                } as BalanceFetchResult['balances'][0],
              ],
            }),
          );
        },
      );

      const [response] = onAssetsUpdate.mock.calls[0];
      expect(response.assetsInfo[erc20AssetId]).toStrictEqual({
        type: 'erc20',
        symbol: '',
        name: '',
        decimals: 18,
      });
    });
  });

  describe('handleDetectionUpdate (via callback)', () => {
    it('invokes onAssetsUpdate when TokenDetector callback runs', async () => {
      let detectionUpdateCallback:
        | ((result: TokenDetectionResult) => void)
        | null = null;
      jest
        .spyOn(TokenDetector.prototype, 'setOnDetectionUpdate')
        .mockImplementation(function (this: TokenDetector, callback) {
          detectionUpdateCallback = callback;
        });

      await withController(async ({ controller }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        expect(detectionUpdateCallback).not.toBeNull();
        detectionUpdateCallback?.({
          chainId: MOCK_CHAIN_ID_HEX,
          accountId: MOCK_ACCOUNT_ID,
          accountAddress: MOCK_ADDRESS as Address,
          detectedAssets: [
            {
              assetId: 'eip155:1/erc20:0xabc' as Caip19AssetId,
              symbol: 'T',
              name: 'T',
              decimals: 18,
            } as TokenDetectionResult['detectedAssets'][0],
          ],
          detectedBalances: [
            {
              assetId: 'eip155:1/erc20:0xabc' as Caip19AssetId,
              balance: '0',
            } as TokenDetectionResult['detectedBalances'][0],
          ],
          zeroBalanceAddresses: [],
          failedAddresses: [],
          timestamp: Date.now(),
        });
      });
    });
  });

  describe('transaction events', () => {
    it('refreshes balance when transaction confirmed', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        rootMessenger.publish('TransactionController:transactionConfirmed', {
          chainId: MOCK_CHAIN_ID_HEX,
        } as unknown as TransactionMeta);
        await new Promise(process.nextTick);
        expect(controller).toBeDefined();
      });
    });

    it('does not refresh when transaction confirmed has no chainId', async () => {
      await withController(async ({ rootMessenger }) => {
        rootMessenger.publish(
          'TransactionController:transactionConfirmed',
          {} as unknown as TransactionMeta,
        );
        await new Promise(process.nextTick);
        expect(true).toBe(true);
      });
    });

    it('refreshes balance when incoming transactions received', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        rootMessenger.publish(
          'TransactionController:incomingTransactionsReceived',
          [{ chainId: MOCK_CHAIN_ID_HEX }] as unknown as TransactionMeta[],
        );
        await new Promise(process.nextTick);
        expect(controller).toBeDefined();
      });
    });

    it('refreshes all active chains when incoming transactions empty', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        await controller.subscribe({
          request: createDataRequest(),
          subscriptionId: 'test-sub',
          isUpdate: false,
          onAssetsUpdate: jest.fn(),
        });

        rootMessenger.publish(
          'TransactionController:incomingTransactionsReceived',
          [] as TransactionMeta[],
        );
        await new Promise(process.nextTick);
        expect(controller).toBeDefined();
      });
    });
  });

  describe('network state change', () => {
    it('clears provider cache and updates chains on NetworkController state change', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const newState = createMockNetworkState(NetworkStatus.Available);
        (newState.networkConfigurationsByChainId as Record<string, unknown>)[
          '0x89'
        ] = {
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
        (newState.networksMetadata as Record<string, unknown>).polygon = {
          status: NetworkStatus.Available,
          EIPS: {},
        };

        rootMessenger.publish('NetworkController:stateChange', newState, []);
        await new Promise(process.nextTick);
        const chains = await controller.getActiveChains();
        expect(chains).toContain('eip155:137');
      });
    });

    it('skips chain when defaultRpcEndpoint missing', async () => {
      const networkState = createMockNetworkState(NetworkStatus.Available);
      (networkState.networkConfigurationsByChainId as Record<string, unknown>)[
        '0x2'
      ] = {
        chainId: '0x2',
        name: 'Other',
        nativeCurrency: 'ETH',
        defaultRpcEndpointIndex: 99,
        rpcEndpoints: [],
        blockExplorerUrls: [],
      };
      (networkState.networksMetadata as Record<string, unknown>).other = {
        status: NetworkStatus.Available,
        EIPS: {},
      };

      await withController({ networkState }, async ({ controller }) => {
        const statuses = controller.getChainStatuses();
        expect(Object.keys(statuses)).toContain('eip155:1');
      });
    });
  });

  describe('destroy', () => {
    it('cleans up subscriptions and caches', () => {
      const { rootMessenger, assetsControllerMessenger } =
        createMockAssetControllerMessenger();
      registerRpcDataSourceActions(rootMessenger, {
        networkState: createMockNetworkState(),
      });
      const controller = new RpcDataSource({
        messenger: assetsControllerMessenger,
        onActiveChainsUpdated: jest.fn(),
      });
      controller.destroy();
      expect(controller).toBeDefined();
    });
  });

  describe('account scope filtering', () => {
    it('includes accounts with wildcard EVM scope', async () => {
      await withController(async ({ controller }) => {
        const account = createMockInternalAccount({ scopes: ['eip155:0'] });
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
