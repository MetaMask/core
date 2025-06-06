// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { BaseController, RestrictedMessenger } from '@metamask/base-controller';
import { BtcScope, SolScope } from '@metamask/keyring-api';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type {
  NetworkControllerStateChangeEvent,
  NetworkState,
} from '@metamask/network-controller';
import type { CaipChainId, Hex } from '@metamask/utils';
import type { Patch } from 'immer';

// TODO: Figure out how to get these from an internal source
export const CHAIN_IDS = {
  SEPOLIA: '0xaa36a7',
  LINEA_SEPOLIA: '0xe705',
  LOCALHOST: '0x539',
  MEGAETH_TESTNET: '0x18c6',
  MONAD_TESTNET: '0x279f',
} as const;

export const TEST_CHAINS: Hex[] = [
  CHAIN_IDS.SEPOLIA,
  CHAIN_IDS.LINEA_SEPOLIA,
  CHAIN_IDS.LOCALHOST,
  CHAIN_IDS.MEGAETH_TESTNET,
  CHAIN_IDS.MONAD_TESTNET,
];

// Unique name for the controller
const controllerName = 'NetworkVisibilityController';

/**
 * Information about a network's visibility state.
 */
export type NetworksInfo = {
  networkId: CaipChainId; // The network's chain id
};

// State shape for NetworkVisibilityController
export type NetworkVisibilityControllerState = {
  orderedNetworkList: NetworksInfo[];
  enabledNetworkMap: Record<CaipChainId, boolean>;
};

// Describes the structure of a state change event
export type NetworkVisibilityStateChange = {
  type: `${typeof controllerName}:stateChange`;
  payload: [NetworkVisibilityControllerState, Patch[]];
};

// Describes the action for updating the networks list
export type NetworkVisibilityControllerupdateNetworksListAction = {
  type: `${typeof controllerName}:updateNetworksList`;
  handler: NetworkVisibilityController['updateNetworksList'];
};

// Union of all possible actions for the messenger
export type NetworkVisibilityControllerMessengerActions =
  NetworkVisibilityControllerupdateNetworksListAction;

// Type for the messenger of NetworkVisibilityController
export type NetworkVisibilityControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  NetworkVisibilityControllerMessengerActions,
  NetworkVisibilityStateChange | NetworkControllerStateChangeEvent,
  never,
  | NetworkVisibilityStateChange['type']
  | NetworkControllerStateChangeEvent['type']
>;

// Default state for the controller
// TODO: This should be a function getDefaultNetworkVisibilityControllerState
const defaultState: NetworkVisibilityControllerState = {
  orderedNetworkList: [],
  enabledNetworkMap: {},
};

// Metadata for the controller state
const metadata = {
  orderedNetworkList: {
    persist: true,
    anonymous: true,
  },
  enabledNetworkMap: {
    persist: true,
    anonymous: true,
  },
};

/**
 * Controller that manages the visibility and order of networks.
 * This controller subscribes to network state changes and ensures
 * that the network list is updated based on the latest network configurations.
 */
export class NetworkVisibilityController extends BaseController<
  typeof controllerName,
  NetworkVisibilityControllerState,
  NetworkVisibilityControllerMessenger
> {
  /**
   * Creates a NetworkVisibilityController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: NetworkVisibilityControllerMessenger;
    state?: NetworkVisibilityControllerState;
  }) {
    // Call the constructor of BaseControllerV2
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { ...defaultState, ...state },
    });

    // Subscribe to network state changes
    this.messagingSystem.subscribe(
      'NetworkController:stateChange',
      (networkControllerState) => {
        this.onNetworkControllerStateChange(networkControllerState);
      },
    );
  }

  /**
   * Handles the state change of the network controller and updates the networks list.
   *
   * @param networkControllerState - The state of the network controller.
   * @param networkControllerState.networkConfigurationsByChainId - A record mapping chain IDs to their network configurations, used to determine which networks are available and should be included in the ordered list.
   */
  onNetworkControllerStateChange({
    networkConfigurationsByChainId,
  }: NetworkState) {
    this.update((state) => {
      // Filter out testnets, which are in the state but not orderable
      const hexChainIds = Object.keys(networkConfigurationsByChainId).filter(
        (chainId) =>
          !TEST_CHAINS.includes(chainId as (typeof TEST_CHAINS)[number]),
      ) as Hex[];
      const chainIds: CaipChainId[] = hexChainIds.map(toEvmCaipChainId);
      const nonEvmChainIds: CaipChainId[] = [
        BtcScope.Mainnet,
        SolScope.Mainnet,
      ];

      const newNetworks = chainIds
        .filter(
          (chainId) =>
            !state.orderedNetworkList.some(
              ({ networkId }) => networkId === chainId,
            ),
        )
        .map((chainId) => ({ networkId: chainId }));

      state.orderedNetworkList = state.orderedNetworkList
        // Filter out deleted networks
        .filter(
          ({ networkId }) =>
            chainIds.includes(networkId) ||
            // Since Bitcoin and Solana are not part of the @metamask/network-controller, we have
            // to add a second check to make sure it is not filtered out.
            // TODO: Update this logic to @metamask/multichain-network-controller once all networks are migrated.
            nonEvmChainIds.includes(networkId),
        )
        // Append new networks to the end
        .concat(newNetworks);
    });
  }

  /**
   * Updates the networks list in the state with the provided list of networks.
   *
   * @param chainIds - The list of CAIP-2 chain IDs to update in the state.
   */
  updateNetworksList(chainIds: CaipChainId[]) {
    this.update((state) => {
      state.orderedNetworkList = chainIds.map((chainId) => ({
        networkId: chainId,
      }));
    });
  }

  /**
   * Sets the enabled networks in the controller state.
   * This method updates the enabledNetworkMap to mark specified networks as enabled.
   * It can handle both a single chain ID or an array of chain IDs.
   *
   * @param chainIds - A single CAIP-2 chain ID (e.g. 'eip155:1') or an array of chain IDs
   * to be enabled. All other networks will be implicitly disabled.
   */
  setEnabledNetworks(chainIds: CaipChainId | CaipChainId[]) {
    const ids = Array.isArray(chainIds) ? chainIds : [chainIds];
    this.update((state) => {
      state.enabledNetworkMap = Object.fromEntries(ids.map((id) => [id, true]));
    });
  }
}
