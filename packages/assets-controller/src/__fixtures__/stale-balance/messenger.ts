import type { NetworkState } from '@metamask/network-controller';
import {
  getDefaultNetworkControllerState,
  NetworkClientType,
  NetworkStatus,
  RpcEndpointType,
} from '@metamask/network-controller';
import type { Snap } from '@metamask/snaps-sdk';

import {
  registerAccountMocks,
  registerWalletLifecycleMocks,
} from '../MockAssetControllerMessenger.js';
import type { MockRootMessenger } from '../MockAssetControllerMessenger.js';
import { buildProviderState, createStaleBalanceProvider } from './provider.js';
import type { StaleBalanceProviderState } from './provider.js';
import { createSnapHandler } from './snap.js';
import type { StaleBalanceSnapState } from './snap.js';
import { buildStaleBalanceAccounts } from './staleBalanceWallet.js';
import {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_CHAIN_ID_HEX,
  BSC_NETWORK_CLIENT_ID,
  BSC_RPC_URL,
  ETH_ASSET_ID,
  HOODI_CHAIN_ID,
  HOODI_CHAIN_ID_HEX,
  HOODI_NATIVE_ASSET_ID,
  HOODI_NETWORK_CLIENT_ID,
  HOODI_RPC_URL,
  MAINNET_CHAIN_ID,
  MAINNET_CHAIN_ID_HEX,
  MAINNET_NETWORK_CLIENT_ID,
  MAINNET_RPC_URL,
  SOLANA_CHAIN_ID,
  SOLANA_SNAP_ID,
} from './wallet.js';

/** Keyring and assets permissions that make the snap a keyring snap claiming the Solana chain. */
const SOLANA_SNAP_PERMISSIONS = {
  'endowment:keyring': {
    id: 'mock-solana-keyring-permission-id',
    parentCapability: 'endowment:keyring',
    invoker: SOLANA_SNAP_ID,
    date: Date.now(),
    caveats: null,
  },
  'endowment:assets': {
    id: 'mock-solana-assets-permission-id',
    parentCapability: 'endowment:assets',
    invoker: SOLANA_SNAP_ID,
    date: Date.now(),
    caveats: [{ type: 'chainIds', value: [SOLANA_CHAIN_ID] }],
  },
} as const;

/**
 * NetworkController state with BNB Chain, mainnet and Hoodi configured.
 *
 * @returns The network state.
 */
function buildStaleBalanceNetworkState(): NetworkState {
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
      [HOODI_CHAIN_ID_HEX]: {
        chainId: HOODI_CHAIN_ID_HEX,
        name: 'Hoodi',
        nativeCurrency: 'ETH',
        blockExplorerUrls: [],
        defaultRpcEndpointIndex: 0,
        rpcEndpoints: [
          {
            networkClientId: HOODI_NETWORK_CLIENT_ID,
            url: HOODI_RPC_URL,
            type: RpcEndpointType.Custom,
            failoverUrls: [],
          },
        ],
      },
    },
    networksMetadata: {
      [BSC_NETWORK_CLIENT_ID]: { status: NetworkStatus.Available, EIPS: {} },
      [MAINNET_NETWORK_CLIENT_ID]: {
        status: NetworkStatus.Available,
        EIPS: {},
      },
      [HOODI_NETWORK_CLIENT_ID]: { status: NetworkStatus.Available, EIPS: {} },
    },
  };
}

/**
 * Provider states for the suite's three EVM chains, mutable between passes.
 *
 * @param overrides - Token balances / staking responses per chain.
 * @returns The per-chain provider states, keyed by network client ID.
 */
export function buildStaleBalanceProviderStates(overrides: {
  bsc?: Partial<StaleBalanceProviderState>;
  mainnet?: Partial<StaleBalanceProviderState>;
  hoodi?: Partial<StaleBalanceProviderState>;
}): {
  [networkClientId: string]: StaleBalanceProviderState;
} {
  return {
    [BSC_NETWORK_CLIENT_ID]: buildProviderState({
      chainIdHex: BSC_CHAIN_ID_HEX,
      nativeBalanceWei: '0',
      ...overrides.bsc,
    }),
    [MAINNET_NETWORK_CLIENT_ID]: buildProviderState({
      chainIdHex: MAINNET_CHAIN_ID_HEX,
      nativeBalanceWei: '0',
      ...overrides.mainnet,
    }),
    [HOODI_NETWORK_CLIENT_ID]: buildProviderState({
      chainIdHex: HOODI_CHAIN_ID_HEX,
      nativeBalanceWei: '0',
      ...overrides.hoodi,
    }),
  };
}

/**
 * Register the NetworkController, NetworkEnablement and ConfigRegistry
 * action handlers for the suite's three EVM chains.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 * @param providerStates - Provider states keyed by network client ID, as
 * built by {@link buildStaleBalanceProviderStates}.
 */
export function registerStaleBalanceNetwork(
  rootMessenger: MockRootMessenger,
  providerStates: Record<string, StaleBalanceProviderState>,
): void {
  const networkState = buildStaleBalanceNetworkState();

  rootMessenger.registerActionHandler(
    'NetworkController:getState',
    () => networkState,
  );

  rootMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    (networkClientId: string) =>
      ({
        configuration: {
          type: NetworkClientType.Custom,
          chainId: providerStates[networkClientId]?.chainIdHex,
          rpcUrl:
            networkState.networkConfigurationsByChainId[
              providerStates[networkClientId]?.chainIdHex ?? '0x0'
            ]?.rpcEndpoints[0]?.url,
          ticker: 'TEST',
          failoverRpcUrls: [],
        },
        provider: createStaleBalanceProvider(
          providerStates[networkClientId] ??
            buildProviderState({ chainIdHex: '0x0', nativeBalanceWei: '0' }),
        ),
      }) as never,
  );

  rootMessenger.registerActionHandler(
    'NetworkEnablementController:getState',
    () => ({
      enabledNetworkMap: {
        eip155: {
          [BSC_CHAIN_ID_HEX]: true,
          [MAINNET_CHAIN_ID_HEX]: true,
          [HOODI_CHAIN_ID_HEX]: true,
        },
        solana: { [SOLANA_CHAIN_ID]: true },
      },
      nativeAssetIdentifiers: {
        [BSC_CHAIN_ID]: BNB_ASSET_ID,
        [MAINNET_CHAIN_ID]: ETH_ASSET_ID,
        // Hoodi is absent from the controller's native-asset map, so it
        // balances through the zero-address ERC-20 fallback the extension
        // itself uses for such chains (see `NATIVE_ASSETS` in
        // `utils/native-assets.ts`). `NativeAssetIdentifier` models only
        // the `slip44` form, which does not admit that fallback asset ID.
        // @ts-expect-error The captured fallback asset ID is not a slip44 form.
        [HOODI_CHAIN_ID]: HOODI_NATIVE_ASSET_ID,
      },
    }),
  );

  rootMessenger.registerActionHandler(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    () => undefined,
  );
}

/**
 * Register the SnapController / PermissionController action handlers that
 * make the Solana keyring snap discoverable, plus its `handleRequest`
 * handler.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 * @param snapState - The snap response state.
 */
export function registerSolanaSnap(
  rootMessenger: MockRootMessenger,
  snapState: StaleBalanceSnapState,
): void {
  rootMessenger.registerActionHandler(
    'SnapController:getRunnableSnaps',
    () => [{ id: SOLANA_SNAP_ID }] as never as Snap[],
  );

  rootMessenger.registerActionHandler(
    'PermissionController:getPermissions',
    (subjectId: string) => {
      if (subjectId === SOLANA_SNAP_ID) {
        return SOLANA_SNAP_PERMISSIONS;
      }
      return {};
    },
  );

  rootMessenger.registerActionHandler(
    'SnapController:handleRequest',
    createSnapHandler(snapState),
  );
}

/**
 * Register every external action `AssetsController` needs to boot the
 * suite's wallet.
 *
 * @param rootMessenger - The root messenger to register handlers on.
 * @param opts - Providers, snap state, and lifecycle / flag options.
 * @param opts.providerStates - Provider states keyed by network client ID.
 * @param opts.snapState - The Solana snap response state.
 * @param opts.lifecycle - Lifecycle / feature flag overrides.
 */
export function registerStaleBalanceControllerActions(
  rootMessenger: MockRootMessenger,
  opts: {
    providerStates: Record<string, StaleBalanceProviderState>;
    snapState: StaleBalanceSnapState;
    lifecycle?: Parameters<typeof registerWalletLifecycleMocks>[1];
  },
): void {
  registerWalletLifecycleMocks(
    rootMessenger,
    opts.lifecycle ?? {
      isKeyringUnlocked: true,
      isAccountTreeInitialized: true,
      clientControllerState: { isUiOpen: true },
      remoteFeatureFlags: { assetsAccountsApiV6: true },
    },
  );
  registerAccountMocks(rootMessenger, {
    accounts: buildStaleBalanceAccounts(),
  });
  registerStaleBalanceNetwork(rootMessenger, opts.providerStates);
  registerSolanaSnap(rootMessenger, opts.snapState);
}
