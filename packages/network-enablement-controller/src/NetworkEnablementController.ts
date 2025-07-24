import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId, toHex } from '@metamask/controller-utils';
import type { MultichainNetworkControllerGetStateAction } from '@metamask/multichain-network-controller';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerNetworkAddedEvent,
  NetworkControllerNetworkRemovedEvent,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import { KnownCaipNamespace, parseCaipChainId } from '@metamask/utils';

import { POPULAR_NETWORKS } from './constants';
import { selectAllEnabledNetworks } from './selectors';
import { SolScope } from './types';
import { deriveKeys, isOnlyNetworkEnabledInNamespace } from './utils';

const controllerName = 'NetworkEnablementController';

/**
 * Information about an ordered network.
 */
export type NetworksInfo = {
  /**
   * The network's chain id
   */
  networkId: CaipChainId;
};

/**
 * A map of enabled networks by namespace and chain id.
 */
type EnabledMap = Record<CaipNamespace, Record<CaipChainId | Hex, boolean>>;

// State shape for NetworkEnablementController
export type NetworkEnablementControllerState = {
  enabledNetworkMap: EnabledMap;
};

export type NetworkEnablementControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    NetworkEnablementControllerState
  >;

export type NetworkEnablementControllerSetEnabledNetworksAction = {
  type: `${typeof controllerName}:enableNetwork`;
  handler: NetworkEnablementController['enableNetwork'];
};

export type NetworkEnablementControllerDisableNetworkAction = {
  type: `${typeof controllerName}:disableNetwork`;
  handler: NetworkEnablementController['disableNetwork'];
};

/**
 * All actions that {@link NetworkEnablementController} calls internally.
 */
export type AllowedActions =
  | NetworkControllerGetStateAction
  | MultichainNetworkControllerGetStateAction;

export type NetworkEnablementControllerActions =
  | NetworkEnablementControllerGetStateAction
  | NetworkEnablementControllerSetEnabledNetworksAction
  | NetworkEnablementControllerDisableNetworkAction;

export type NetworkEnablementControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    NetworkEnablementControllerState
  >;

export type NetworkEnablementControllerEvents =
  NetworkEnablementControllerStateChangeEvent;

/**
 * All events that {@link NetworkEnablementController} subscribes to internally.
 */
export type AllowedEvents =
  | NetworkControllerNetworkAddedEvent
  | NetworkControllerNetworkRemovedEvent
  | NetworkControllerStateChangeEvent;

export type NetworkEnablementControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  NetworkEnablementControllerActions | AllowedActions,
  NetworkEnablementControllerEvents | AllowedEvents,
  AllowedActions['type'],
  AllowedEvents['type']
>;

/**
 * Gets the default state for the NetworkEnablementController.
 *
 * @returns The default state with pre-enabled networks.
 */
const getDefaultNetworkEnablementControllerState =
  (): NetworkEnablementControllerState => ({
    enabledNetworkMap: {
      [KnownCaipNamespace.Eip155]: {
        [ChainId[BuiltInNetworkName.Mainnet]]: true,
        [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
        [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
      },
      [KnownCaipNamespace.Solana]: {
        [SolScope.Mainnet]: true,
      },
    },
  });

// Metadata for the controller state
const metadata = {
  enabledNetworkMap: {
    persist: true,
    anonymous: true,
  },
};

/**
 * Controller responsible for managing network enablement state across different blockchain networks.
 *
 * This controller tracks which networks are enabled/disabled for the user and provides methods
 * to toggle network states. It supports both EVM (EIP-155) and non-EVM networks like Solana.
 *
 * The controller maintains a map of enabled networks organized by namespace (e.g., 'eip155', 'solana')
 * and provides methods to query and modify network enablement states.
 */
export class NetworkEnablementController extends BaseController<
  typeof controllerName,
  NetworkEnablementControllerState,
  NetworkEnablementControllerMessenger
> {
  /**
   * Creates a NetworkEnablementController instance.
   *
   * @param args - The arguments to this function.
   * @param args.messenger - Messenger used to communicate with BaseV2 controller.
   * @param args.state - Initial state to set on this controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: NetworkEnablementControllerMessenger;
    state?: Partial<NetworkEnablementControllerState>;
  }) {
    super({
      messenger,
      metadata,
      name: controllerName,
      state: {
        ...getDefaultNetworkEnablementControllerState(),
        ...state,
      },
    });

    messenger.subscribe('NetworkController:networkAdded', ({ chainId }) => {
      this.#toggleNetwork(chainId, true);
    });

    messenger.subscribe('NetworkController:networkRemoved', ({ chainId }) => {
      this.#removeNetworkEntry(chainId);
    });
  }

  /**
   * Enables or disables a network for the user.
   *
   * This method accepts either a Hex chain ID (for EVM networks) or a CAIP-2 chain ID
   * (for any blockchain network). The method will automatically convert Hex chain IDs
   * to CAIP-2 format internally. This dual parameter support allows for backward
   * compatibility with existing EVM chain ID formats while supporting newer
   * multi-chain standards.
   *
   * When enabling a non-popular network, this method will disable all other networks
   * to ensure only one network is active at a time (exclusive mode).
   *
   * @param chainId - The chain ID of the network to enable or disable. Can be either:
   * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
   * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
   */
  enableNetwork(chainId: Hex | CaipChainId): void {
    this.#toggleNetwork(chainId, true);
  }

  /**
   * Disables a network for the user.
   *
   * This method accepts either a Hex chain ID (for EVM networks) or a CAIP-2 chain ID
   * (for any blockchain network). The method will automatically convert Hex chain IDs
   * to CAIP-2 format internally.
   *
   * Note: This method will prevent disabling the last remaining enabled network
   * to ensure at least one network is always available.
   *
   * @param chainId - The chain ID of the network to disable. Can be either:
   * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
   * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
   */
  disableNetwork(chainId: Hex | CaipChainId): void {
    this.#toggleNetwork(chainId, false);
  }

  /**
   * Ensures that a namespace bucket exists in the state.
   *
   * This method creates the namespace entry in the enabledNetworkMap if it doesn't
   * already exist. This is used to prepare the state structure before adding
   * network entries.
   *
   * @param state - The current controller state
   * @param ns - The CAIP namespace to ensure exists
   */
  #ensureNamespaceBucket(
    state: NetworkEnablementControllerState,
    ns: CaipNamespace,
  ) {
    if (!state.enabledNetworkMap[ns]) {
      state.enabledNetworkMap[ns] = {};
    }
  }

  /**
   * Ensures that a network entry exists in the state.
   *
   * This method creates a network entry in the enabledNetworkMap if it doesn't
   * already exist. It's called when a new network is added to ensure the
   * state structure is properly initialized.
   *
   * @param chainId - The chain ID to ensure has an entry (Hex or CAIP-2 format)
   * @param enable - Whether to enable the network by default (defaults to false)
   */
  #ensureNetworkEntry(chainId: Hex | CaipChainId, enable = false): void {
    const { namespace, storageKey } = deriveKeys(chainId);
    this.update((s) => {
      this.#ensureNamespaceBucket(s, namespace);
      if (!(storageKey in s.enabledNetworkMap[namespace])) {
        s.enabledNetworkMap[namespace][storageKey] = enable;
      }
    });
  }

  /**
   * Removes a network entry from the state.
   *
   * This method is called when a network is removed from the system. It cleans up
   * the network entry and ensures that at least one network remains enabled.
   *
   * @param chainId - The chain ID to remove (Hex or CAIP-2 format)
   */
  #removeNetworkEntry(chainId: Hex | CaipChainId): void {
    const { namespace, storageKey } = deriveKeys(chainId);
    if (isOnlyNetworkEnabledInNamespace(this.state, namespace, chainId)) {
      return;
    }

    this.update((s) => {
      if (namespace in s.enabledNetworkMap) {
        delete s.enabledNetworkMap[namespace][storageKey];
      }
    });
  }

  /**
   * Checks if a network is considered a popular network.
   *
   * Popular networks are predefined networks that are commonly used and trusted.
   * When enabling a non-popular network, the system switches to exclusive mode
   * (only one network enabled at a time).
   *
   * @param caipId - The chain ID to check (can be Hex or CAIP-2 format)
   * @returns True if the network is popular, false otherwise
   */
  #isPopularNetwork(caipId: CaipChainId): boolean {
    const { reference } = parseCaipChainId(caipId);
    return POPULAR_NETWORKS.includes(toHex(reference));
  }

  /**
   * Toggles the enabled state of a network.
   *
   * This is the core method that handles enabling and disabling networks. It includes
   * several safety checks and business logic:
   * - Prevents enabling unknown networks
   * - Prevents disabling the last remaining enabled network
   * - Implements exclusive mode for non-popular networks
   * - Ensures at least one network remains enabled
   *
   * The method accepts either Hex or CAIP-2 chain IDs for flexibility and
   * backward compatibility.
   *
   * @param chainId - The chain ID to toggle (Hex or CAIP-2 format)
   * @param enable - True to enable the network, false to disable it
   */
  #toggleNetwork(chainId: Hex | CaipChainId, enable: boolean): void {
    const { namespace, storageKey, caipId } = deriveKeys(chainId);

    // Don't update the last remaining enabled network
    if (
      !enable &&
      Object.values(selectAllEnabledNetworks(this.state)[namespace]).flat()
        .length <= 1
    ) {
      throw new Error('Cannot disable the last remaining enabled network');
    }

    this.update((s) => {
      // Ensure entry exists first
      this.#ensureNetworkEntry(chainId);
      // If enabling a non-popular network, disable all networks in the same namespace
      if (enable && !this.#isPopularNetwork(caipId)) {
        Object.keys(s.enabledNetworkMap[namespace]).forEach((key) => {
          s.enabledNetworkMap[namespace][key as CaipChainId | Hex] = false;
        });
      }
      s.enabledNetworkMap[namespace][storageKey] = enable;
    });
  }
}
