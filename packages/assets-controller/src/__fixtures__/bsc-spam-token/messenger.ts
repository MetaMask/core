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
import { buildBscSpamAccount } from './bscSpamWallet.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_CHAIN_ID_HEX,
  BSC_NETWORK_CLIENT_ID,
  BSC_RPC_URL,
} from './wallet.js';

/**
 * RPC provider that answers the cheap probes `RpcDataSource` makes without
 * inventing token balances. Persist the stubs so a slow-lane fallback cannot
 * fail the suite for want of a matching request.
 *
 * @returns The mock provider.
 */
function createBscMockProvider(): MockInternalProvider {
  return new MockInternalProvider({
    stubs: [
      { method: 'eth_chainId', result: BSC_CHAIN_ID_HEX },
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
 * NetworkController state with BNB Chain selected and enabled.
 *
 * @returns The network state.
 */
function buildBscNetworkState(): NetworkState {
  return {
    ...getDefaultNetworkControllerState(),
    selectedNetworkClientId: BSC_NETWORK_CLIENT_ID,
    networkConfigurationsByChainId: {
      [BSC_CHAIN_ID_HEX]: {
        chainId: BSC_CHAIN_ID_HEX,
        name: 'BNB Chain',
        nativeCurrency: 'BNB',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          {
            networkClientId: BSC_NETWORK_CLIENT_ID,
            url: BSC_RPC_URL,
            type: RpcEndpointType.Custom,
            failoverUrls: [],
          },
        ],
      },
    },
    networksMetadata: {
      [BSC_NETWORK_CLIENT_ID]: { status: NetworkStatus.Available, EIPS: {} },
    },
  };
}

/**
 * Register the NetworkController / NetworkEnablement / ConfigRegistry handlers
 * the BNB Chain spam-token fixtures need. Shared by the pipeline and
 * controller integration tests.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 */
export function registerBscSpamNetwork(rootMessenger: MockRootMessenger): void {
  const provider = createBscMockProvider();
  const networkState = buildBscNetworkState();

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
          chainId: BSC_CHAIN_ID_HEX,
          rpcUrl: BSC_RPC_URL,
          ticker: 'BNB',
          failoverRpcUrls: [],
        },
        provider,
      }) as never,
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: { eip155: { [BSC_CHAIN_ID_HEX]: true } },
      nativeAssetIdentifiers: { [BSC_CHAIN_ID]: BNB_ASSET_ID },
    }),
  );

  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
  );
}

type RegisterBscSpamControllerActionsOptions =
  RegisterWalletLifecycleMocksOptions;

/**
 * Register every external action `AssetsController` needs to boot the BNB
 * Chain spam-token wallet: the account, lifecycle, feature flags, and the
 * network handlers from {@link registerBscSpamNetwork}.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 * @param opts - Lifecycle / flag overrides.
 */
export function registerBscSpamControllerActions(
  rootMessenger: MockRootMessenger,
  opts: RegisterBscSpamControllerActionsOptions = {},
): void {
  registerWalletLifecycleMocks(rootMessenger, opts);
  registerAccountMocks(rootMessenger, {
    accounts: [buildBscSpamAccount()],
  });
  registerBscSpamNetwork(rootMessenger);
}
