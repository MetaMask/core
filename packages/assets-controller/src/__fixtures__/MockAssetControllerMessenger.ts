import { defaultAbiCoder } from '@ethersproject/abi';
import * as ProviderModule from '@ethersproject/providers';
import { clientControllerSelectors } from '@metamask/client-controller';
import type { KeyringControllerMessenger } from '@metamask/keyring-controller';
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
import type { FeatureFlags } from '@metamask/remote-feature-flag-controller';

import {
  AssetsControllerMessenger,
  getDefaultAssetsControllerState,
} from '../AssetsController.js';
import { STAKING_INTERFACE } from '../data-sources/evm-rpc-services/services/StakedBalanceFetcher.js';

// Test escape hatch for mocking areas that do not need explicit types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TestMockType = any;

type GlobalActions = MessengerActions<
  AssetsControllerMessenger | KeyringControllerMessenger
>;
type GlobalEvents = MessengerEvents<
  AssetsControllerMessenger | KeyringControllerMessenger
>;

export type MockRootMessenger = Messenger<
  MockAnyNamespace,
  GlobalActions,
  GlobalEvents
>;

const MAINNET_CHAIN_ID_HEX = '0x1';
const MOCK_CHAIN_ID_CAIP = 'eip155:1';

/**
 * Register a mock `KeyringController:isUnlocked` handler backed by the
 * `:unlock` / `:lock` events.
 *
 * @param messenger - The root messenger to register handlers on.
 * @param initialUnlocked - Initial unlock state.
 */
export function registerKeyringUnlockMock(
  messenger: MockRootMessenger,
  initialUnlocked = false,
): void {
  let isKeyringUnlocked = initialUnlocked;
  messenger.registerActionHandler(
    'KeyringController:isUnlocked',
    () => isKeyringUnlocked,
  );

  messenger.subscribe('KeyringController:unlock', () => {
    isKeyringUnlocked = true;
  });
  messenger.subscribe('KeyringController:lock', () => {
    isKeyringUnlocked = false;
  });
}

export function createMockRootMessenger(): MockRootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

export function createMockAssetsControllerMessenger(
  rootMessenger: MockRootMessenger,
  options?: {
    delegateGetState?: boolean;
  },
): AssetsControllerMessenger {
  const { delegateGetState = true } = options ?? {};

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
      'AccountTreeController:isInitialized',
      'ClientController:getState',
      'KeyringController:isUnlocked',
      ...(delegateGetState ? ['AssetsController:getState' as const] : []),
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

    events: [
      // AssetsController
      'AccountTreeController:selectedAccountGroupChange',
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
  });

  return assetsControllerMessenger;
}

export function createMockMessengers(options?: {
  delegateGetState?: boolean;
  registerCustomRootActions?: (rootMessenger: MockRootMessenger) => void;
}): {
  rootMessenger: MockRootMessenger;
  assetsControllerMessenger: AssetsControllerMessenger;
} {
  const { delegateGetState = true, registerCustomRootActions } = options ?? {};

  const rootMessenger = createMockRootMessenger();

  registerCustomRootActions?.(rootMessenger);

  const assetsControllerMessenger = createMockAssetsControllerMessenger(
    rootMessenger,
    { delegateGetState },
  );

  return { rootMessenger, assetsControllerMessenger };
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

export type RegisterWalletLifecycleMocksOptions = {
  isKeyringUnlocked?: boolean;
  isAccountTreeInitialized?: boolean;
  clientControllerState?: { isUiOpen: boolean };
  remoteFeatureFlags?: FeatureFlags;
};

export type RegisterAccountMocksOptions = {
  accounts?: InternalAccount[];
  selectedAccount?: InternalAccount;
};

export type RegisterAssetsControllerActionsOptions =
  RegisterWalletLifecycleMocksOptions &
    RegisterAccountMocksOptions & {
      enabledNetworkMap?: Record<string, Record<string, boolean>>;
      nativeAssetIdentifiers?: Record<string, string>;
      networkState?: NetworkState;
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
 * Register the wallet-wide lifecycle mocks: keyring lock state, account-tree
 * readiness, client UI state, and remote feature flags.
 *
 * Each of these mocks maintains its own state from the matching event, so it
 * has to subscribe before the controller messenger is delegated to.
 *
 * @param rootMessenger - The root mock messenger.
 * @param opts - Initial lifecycle state.
 */
export function registerWalletLifecycleMocks(
  rootMessenger: MockRootMessenger,
  opts: RegisterWalletLifecycleMocksOptions = {},
): void {
  registerKeyringUnlockMock(rootMessenger, opts.isKeyringUnlocked ?? false);

  let isAccountTreeInitialized = opts.isAccountTreeInitialized ?? false;
  rootMessenger.registerActionHandler(
    'AccountTreeController:isInitialized',
    () => isAccountTreeInitialized,
  );
  rootMessenger.subscribe('AccountTreeController:initialized', () => {
    isAccountTreeInitialized = true;
  });
  rootMessenger.subscribe('AccountTreeController:uninitialized', () => {
    isAccountTreeInitialized = false;
  });

  let clientControllerState = opts.clientControllerState ?? { isUiOpen: false };
  rootMessenger.registerActionHandler(
    'ClientController:getState',
    () => clientControllerState,
  );
  rootMessenger.subscribe(
    'ClientController:stateChange',
    (isUiOpen: boolean) => {
      clientControllerState = { isUiOpen };
    },
    clientControllerSelectors.selectIsUiOpen,
  );

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({
      remoteFeatureFlags: opts.remoteFeatureFlags ?? {},
      cacheTimestamp: 0,
    }),
  );
}

/**
 * Register the account mocks AssetsController reads through
 * AccountsController and AccountTreeController.
 *
 * @param rootMessenger - The root mock messenger.
 * @param opts - The accounts to serve.
 */
export function registerAccountMocks(
  rootMessenger: MockRootMessenger,
  opts: RegisterAccountMocksOptions = {},
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
  registerWalletLifecycleMocks(rootMessenger, opts);
  registerAccountMocks(rootMessenger, opts);

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
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
  );
}
