import { defaultAbiCoder } from '@ethersproject/abi';
import * as ProviderModule from '@ethersproject/providers';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { NetworkStatus } from '@metamask/network-controller';

import {
  NetworkState,
  RpcEndpoint,
  RpcEndpointType,
} from '../../../network-controller/src/NetworkController';
import {
  AssetsControllerMessenger,
  getDefaultAssetsControllerState,
} from '../AssetsController';
import { STAKING_INTERFACE } from '../data-sources/evm-rpc-services/services/StakedBalanceFetcher';

// Test escape hatch for mocking areas that do not need explicit types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestMockType = any;

export type MockRootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AssetsControllerMessenger>,
  MessengerEvents<AssetsControllerMessenger>
>;

const MAINNET_CHAIN_ID_HEX = '0x1';
const MOCK_CHAIN_ID_CAIP = 'eip155:1';

export function createMockAssetControllerMessenger(): {
  rootMessenger: MockRootMessenger;
  assetsControllerMessenger: AssetsControllerMessenger;
} {
  const rootMessenger: MockRootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  const assetsControllerMessenger: AssetsControllerMessenger = new Messenger({
    namespace: 'AssetsController',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger: assetsControllerMessenger,
    actions: [
      // AssetsController
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      'AssetsController:getState',
      // RpcDataSource
      'TokenListController:getState',
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      // RpcDataSource, StakedBalanceDataSource
      'NetworkEnablementController:getState',
      // SnapDataSource
      'SnapController:getRunnableSnaps',
      'SnapController:handleRequest',
      'PermissionController:getPermissions',
      // BackendWebsocketDataSource
      'BackendWebSocketService:connect',
      'BackendWebSocketService:disconnect',
      'BackendWebSocketService:forceReconnection',
      'BackendWebSocketService:sendMessage',
      'BackendWebSocketService:sendRequest',
      'BackendWebSocketService:getConnectionInfo',
      'BackendWebSocketService:getSubscriptionsByChannel',
      'BackendWebSocketService:channelHasSubscription',
      'BackendWebSocketService:findSubscriptionsByChannelPrefix',
      'BackendWebSocketService:addChannelCallback',
      'BackendWebSocketService:removeChannelCallback',
      'BackendWebSocketService:getChannelCallbacks',
      'BackendWebSocketService:subscribe',
    ],
    events: [
      // AssetsController
      'AccountTreeController:selectedAccountGroupChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'PreferencesController:stateChange',
      // RpcDataSource, StakedBalanceDataSource
      'NetworkController:stateChange',
      'TransactionController:transactionConfirmed',
      'TransactionController:incomingTransactionsReceived',
      // StakedBalanceDataSource
      'NetworkEnablementController:stateChange',
      // SnapDataSource
      'AccountsController:accountBalancesUpdated',
      'PermissionController:stateChange',
      // BackendWebsocketDataSource
      'BackendWebSocketService:connectionStateChanged',
    ],
  });

  return {
    rootMessenger,
    assetsControllerMessenger,
  };
}

export function registerStakedMessengerActions(
  rootMessenger: MockRootMessenger,
  opts = {
    enabledNetworkMap: { eip155: { [MAINNET_CHAIN_ID_HEX]: true } } as Record<
      string,
      Record<string, boolean>
    >,
    mockProvider: createMockWeb3Provider({
      sharesWei: '1000000000000000000',
      assetsWei: '1500000000000000000',
    }),
  },
): void {
  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: opts.enabledNetworkMap,
      nativeAssetIdentifiers: {},
    }),
  );

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () =>
      ({
        provider: opts.mockProvider,
        configuration: { chainId: MAINNET_CHAIN_ID_HEX },
      }) as TestMockType,
  );

  rootMessenger.registerActionHandler('NetworkController:getState', () => ({
    networkConfigurationsByChainId: {
      [MAINNET_CHAIN_ID_HEX]: {
        chainId: MAINNET_CHAIN_ID_HEX,
        rpcEndpoints: [{ networkClientId: 'mainnet' }] as RpcEndpoint[],
        defaultRpcEndpointIndex: 0,
        blockExplorerUrls: [],
        name: 'Mainnet',
        nativeCurrency: 'ETH',
      },
    },
    networksMetadata: {},
    selectedNetworkClientId: 'mainnet',
  }));
}

export function registerRpcDataSourceActions(
  rootMessenger: MockRootMessenger,
  opts?: {
    networkState?: NetworkState;
  },
): void {
  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () => opts?.networkState ?? createMockNetworkState(),
  );

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () =>
      ({
        provider: { request: jest.fn().mockResolvedValue('0x0') },
        configuration: { chainId: MAINNET_CHAIN_ID_HEX },
      }) as TestMockType,
  );

  rootMessenger.registerActionHandler('AssetsController:getState', () =>
    getDefaultAssetsControllerState(),
  );

  rootMessenger.registerActionHandler('TokenListController:getState', () => ({
    tokensChainsCache: {},
  }));

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: {},
      nativeAssetIdentifiers: {
        [MOCK_CHAIN_ID_CAIP]: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
      },
    }),
  );
}

export function createMockWeb3Provider(
  options = {
    sharesWei: '1000000000000000000',
    assetsWei: '1500000000000000000',
  },
): jest.SpyInstance<ProviderModule.Web3Provider> {
  const mockProvider = jest.spyOn(ProviderModule, 'Web3Provider');

  const mockCalls = jest.fn().mockImplementation((callData) => {
    // Will decode and return mock shares or throw
    try {
      STAKING_INTERFACE.decodeFunctionData('getShares', callData.data);
      return defaultAbiCoder.encode(['uint256'], [options.sharesWei]);
    } catch {
      // do nothing
    }

    // Will decode and return mock assets or throw
    try {
      STAKING_INTERFACE.decodeFunctionData('convertToAssets', callData.data);
      return defaultAbiCoder.encode(['uint256'], [options.assetsWei]);
    } catch {
      // do nothing
    }

    throw new Error('MOCK FAILURE: Invalid function data');
  });

  mockProvider.mockReturnValue({
    call: mockCalls,
  } as unknown as ProviderModule.Web3Provider);

  return mockProvider;
}

export function createMockNetworkState(
  chainStatus: NetworkStatus = NetworkStatus.Available,
): NetworkState {
  return {
    selectedNetworkClientId: 'mainnet',
    networkConfigurationsByChainId: {
      [MAINNET_CHAIN_ID_HEX]: {
        chainId: MAINNET_CHAIN_ID_HEX,
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
