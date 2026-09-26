import { MockInternalProvider } from '@metamask/eth-json-rpc-provider';
import type { NetworkState } from '@metamask/network-controller';
import {
  getDefaultNetworkControllerState,
  NetworkClientType,
  NetworkStatus,
  RpcEndpointType,
} from '@metamask/network-controller';

import {
  registerAccountMocks,
  registerWalletLifecycleMocks,
} from '../MockAssetControllerMessenger.js';
import type {
  MockRootMessenger,
  RegisterWalletLifecycleMocksOptions,
} from '../MockAssetControllerMessenger.js';
import {
  ETH_ASSET_ID,
  MAINNET_CHAIN_ID,
  MAINNET_CHAIN_ID_HEX,
  MAINNET_NETWORK_CLIENT_ID,
  MAINNET_RPC_URL,
} from './wallet.js';
import { buildWsAccount } from './wsWallet.js';

/**
 * RPC provider that answers the cheap probes `RpcDataSource` makes without
 * inventing token balances. Persist the stubs so a slow-lane fallback cannot
 * fail the suite for want of a matching request.
 *
 * @returns The mock provider.
 */
function createMainnetMockProvider(): MockInternalProvider {
  return new MockInternalProvider({
    stubs: [
      { method: 'eth_chainId', result: MAINNET_CHAIN_ID_HEX },
      { method: 'eth_call', result: '0x' },
      { method: 'eth_getBalance', result: '0x' },
      { method: 'eth_blockNumber', result: '0x' },
    ].map(({ method, result }) => ({
      request: { method },
      response: { result },
      discardAfterMatching: false,
    })),
  });
}

/**
 * NetworkController state with Ethereum Mainnet selected and enabled.
 *
 * @returns The network state.
 */
function buildMainnetNetworkState(): NetworkState {
  return {
    ...getDefaultNetworkControllerState(),
    selectedNetworkClientId: MAINNET_NETWORK_CLIENT_ID,
    networkConfigurationsByChainId: {
      [MAINNET_CHAIN_ID_HEX]: {
        chainId: MAINNET_CHAIN_ID_HEX,
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          {
            networkClientId: MAINNET_NETWORK_CLIENT_ID,
            url: MAINNET_RPC_URL,
            type: RpcEndpointType.Custom,
            failoverUrls: [],
          },
        ],
      },
    },
    networksMetadata: {
      [MAINNET_NETWORK_CLIENT_ID]: {
        status: NetworkStatus.Available,
        EIPS: {},
      },
    },
  };
}

/**
 * Register the NetworkController / NetworkEnablement / ConfigRegistry handlers
 * the websocket price-update fixtures need. Shared by the pipeline and
 * controller integration tests.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 */
export function registerMainnetNetwork(rootMessenger: MockRootMessenger): void {
  const provider = createMainnetMockProvider();
  const networkState = buildMainnetNetworkState();

  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () => networkState,
  );

  // `RpcDataSource` only reads `provider` off the client, so the
  // configuration is here to keep the shape honest rather than to be used.
  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    () =>
      ({
        configuration: {
          type: NetworkClientType.Custom,
          chainId: MAINNET_CHAIN_ID_HEX,
          rpcUrl: MAINNET_RPC_URL,
          ticker: 'ETH',
          failoverRpcUrls: [],
        },
        provider,
      }) as never,
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: { eip155: { [MAINNET_CHAIN_ID_HEX]: true } },
      nativeAssetIdentifiers: { [MAINNET_CHAIN_ID]: ETH_ASSET_ID },
    }),
  );

  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
  );
}

type RegisterWsControllerActionsOptions = RegisterWalletLifecycleMocksOptions;

/**
 * Register every external action `AssetsController` needs to boot the
 * websocket price-update wallet: the account, lifecycle, feature flags, and
 * the network handlers from {@link registerMainnetNetwork}.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 * @param opts - Lifecycle / flag overrides.
 */
export function registerWsControllerActions(
  rootMessenger: MockRootMessenger,
  opts: RegisterWsControllerActionsOptions = {},
): void {
  registerWalletLifecycleMocks(rootMessenger, opts);
  registerAccountMocks(rootMessenger, {
    accounts: [buildWsAccount()],
  });
  registerMainnetNetwork(rootMessenger);
}
