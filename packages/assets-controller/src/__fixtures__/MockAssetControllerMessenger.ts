import { defaultAbiCoder } from '@ethersproject/abi';
import * as ProviderModule from '@ethersproject/providers';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import {
  MOCK_ANY_NAMESPACE,
  Messenger,
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { NetworkStatus, RpcEndpointType } from '@metamask/network-controller';
import type { NetworkState } from '@metamask/network-controller';

import {
  AssetsControllerMessenger,
  getDefaultAssetsControllerState,
} from '../AssetsController.js';
import { STAKING_INTERFACE } from '../data-sources/evm-rpc-services/services/StakedBalanceFetcher.js';

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
      'AccountsController:getSelectedAccount',
      'AccountTreeController:getAccountsFromSelectedAccountGroup',
      // RpcDataSource
      'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      // RpcDataSource, StakedBalanceDataSource
      'NetworkEnablementController:getState',
      // SnapDataSource
      'SnapController:getRunnableSnaps',
      'SnapController:handleRequest',
      'PermissionController:getPermissions',
      // PhishingController
      'PhishingController:bulkScanTokens',
      // AccountsApiDataSource
      'RemoteFeatureFlagController:getState',
    ],
    /* eslint-disable no-restricted-syntax */
    events: [
      // AssetsController
      'AccountTreeController:selectedAccountGroupChange',
      'AccountTreeController:stateChange',
      'AccountTreeController:initialized',
      'AccountTreeController:uninitialized',
      'ClientController:stateChange',
      'KeyringController:lock',
      'KeyringController:unlock',
      'PreferencesController:stateChange',
      'TransactionController:unapprovedTransactionAdded',
      // RpcDataSource, StakedBalanceDataSource
      'NetworkController:stateChange',
      'TransactionController:transactionConfirmed',
      'NetworkController:networkAdded',
      'NetworkController:networkDidChange',
      'NetworkController:networkRemoved',
      // StakedBalanceDataSource
      'NetworkEnablementController:stateChange',
      // SnapDataSource
      'AccountsController:accountBalancesUpdated',
      'PermissionController:stateChange',
      'SnapController:snapInstalled',
      // AccountActivityService (real-time balances + chain status)
      'AccountActivityService:balanceUpdated',
      'AccountActivityService:statusChanged',
      // AccountsApiDataSource
      'RemoteFeatureFlagController:stateChange',
    ],
    /* eslint-enable no-restricted-syntax */
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
        rpcEndpoints: [{ networkClientId: 'mainnet' }] as TestMockType,
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
  assetsControllerMessenger: AssetsControllerMessenger,
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

  assetsControllerMessenger.registerActionHandler(
    'AssetsController:getState',
    () => getDefaultAssetsControllerState(),
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: {},
      nativeAssetIdentifiers: {
        [MOCK_CHAIN_ID_CAIP]: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
      },
    }),
  );

  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
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

export type RegisterAssetsControllerActionsOptions = {
  accounts?: InternalAccount[];
  selectedAccount?: InternalAccount;
  enabledNetworkMap?: Record<string, Record<string, boolean>>;
  nativeAssetIdentifiers?: Record<string, string>;
  networkState?: NetworkState;
  remoteFeatureFlags?: Record<string, boolean>;
  clientControllerState?: { isUiOpen: boolean };
};

/**
 * Build a mock internal account with sensible defaults.
 *
 * @param overrides - Partial account to override defaults.
 * @returns The internal account.
 */
export function createMockInternalAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  const { metadata, ...rest } = overrides ?? {};
  return {
    id: 'mock-account-id',
    address: '0x1234567890123456789012345678901234567890',
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:1'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
      ...metadata,
    },
    ...rest,
  } as InternalAccount;
}

/**
 * Register mock action handlers for external controller actions that
 * AssetsController and its data sources call.
 *
 * @param rootMessenger - The root mock messenger.
 * @param opts - Action handler return value overrides.
 */
export function registerAssetsControllerActions(
  rootMessenger: MockRootMessenger,
  opts: RegisterAssetsControllerActionsOptions = {},
): void {
  const accounts = opts.accounts ?? [
    opts.selectedAccount ?? createMockInternalAccount(),
  ];
  const selectedAccount = opts.selectedAccount ?? accounts[0];

  rootMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    () => selectedAccount,
  );

  rootMessenger.registerActionHandler(
    'AccountTreeController:getAccountsFromSelectedAccountGroup',
    () => accounts,
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () =>
      ({
        enabledNetworkMap: opts.enabledNetworkMap ?? {
          eip155: { [MAINNET_CHAIN_ID_HEX]: true },
        },
        nativeAssetIdentifiers: opts.nativeAssetIdentifiers ?? {
          [MOCK_CHAIN_ID_CAIP]: `${MOCK_CHAIN_ID_CAIP}/slip44:60`,
        },
      }) as TestMockType,
  );

  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () => opts.networkState ?? createMockNetworkState(),
  );

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () =>
      ({
        provider: { request: jest.fn().mockResolvedValue('0x0') },
        configuration: { chainId: MAINNET_CHAIN_ID_HEX },
      }) as TestMockType,
  );

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({
      remoteFeatureFlags: opts.remoteFeatureFlags ?? {},
      cacheTimestamp: 0,
    }),
  );

  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
  );

  if (opts.clientControllerState !== undefined) {
    (
      rootMessenger as {
        registerActionHandler: (a: string, h: () => unknown) => void;
      }
    ).registerActionHandler(
      'ClientController:getState',
      () => opts.clientControllerState,
    );
  }
}
