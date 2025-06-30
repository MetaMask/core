import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId, toHex } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import type { MultichainNetworkControllerGetStateAction } from '@metamask/multichain-network-controller';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerNetworkAddedEvent,
  NetworkControllerNetworkRemovedEvent,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import {
  isCaipChainId,
  isHexString,
  KnownCaipNamespace,
  parseCaipChainId,
} from '@metamask/utils';

import { POPULAR_NETWORKS } from './constants';

// Unique name for the controller
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
type EnabledMap = Record<CaipNamespace, Record<string, boolean>>;

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
  type: `${typeof controllerName}:setEnabledNetworks`;
  handler: NetworkEnablementController['setEnabledNetwork'];
};

export type NetworkEnablementControllerDisableNetworkAction = {
  type: `${typeof controllerName}:disableNetwork`;
  handler: NetworkEnablementController['setDisabledNetwork'];
};

export type NetworkEnablementControllerIsNetworkEnabledAction = {
  type: `${typeof controllerName}:isNetworkEnabled`;
  handler: NetworkEnablementController['isNetworkEnabled'];
};

/**
 * All actions that {@link NetworkEnablementController} calls internally.
 */
type AllowedActions =
  | NetworkControllerGetStateAction
  | MultichainNetworkControllerGetStateAction;

export type NetworkEnablementControllerActions =
  | NetworkEnablementControllerGetStateAction
  | NetworkEnablementControllerSetEnabledNetworksAction
  | NetworkEnablementControllerDisableNetworkAction
  | NetworkEnablementControllerIsNetworkEnabledAction;

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
type AllowedEvents =
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
        [SolScope.Mainnet]: false,
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

    this.messagingSystem = messenger;

    messenger.subscribe('NetworkController:networkAdded', ({ chainId }) => {
      this.#ensureNetworkEntry(chainId, false);
      this.#toggleNetwork(chainId, true);
    });

    messenger.subscribe('NetworkController:networkRemoved', ({ chainId }) => {
      this.#removeNetworkEntry(chainId);
    });
  }

  /**
   * Enables a network for the user.
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
   * @param chainId - The chain ID of the network to enable. Can be either:
   * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
   * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
   */
  setEnabledNetwork(chainId: Hex | CaipChainId): void {
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
  setDisabledNetwork(chainId: Hex | CaipChainId): void {
    this.#toggleNetwork(chainId, false);
  }

  /**
   * Checks if a network is currently enabled for the user.
   *
   * This method accepts either a Hex chain ID (for EVM networks) or a CAIP-2 chain ID
   * (for any blockchain network). It returns false for unknown networks or if there's
   * an error parsing the chain ID.
   *
   * @param chainId - The chain ID of the network to check. Can be either:
   * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
   * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
   * @returns True if the network is enabled, false otherwise.
   */
  isNetworkEnabled(chainId: Hex | CaipChainId): boolean {
    try {
      const { namespace, storageKey } = this.#deriveKeys(chainId);
      return (
        namespace in this.state.enabledNetworkMap &&
        this.state.enabledNetworkMap[namespace][storageKey]
      );
    } catch {
      return false;
    }
  }

  /**
   * Gets all enabled networks for a specific namespace.
   *
   * This method returns an array of chain IDs (as strings) for all enabled networks
   * within the specified namespace (e.g., 'eip155' for EVM networks, 'solana' for Solana).
   *
   * @param namespace - The CAIP namespace to get enabled networks for (e.g., 'eip155', 'solana')
   * @returns An array of chain ID strings for enabled networks in the namespace
   */
  getEnabledNetworksForNamespace(namespace: CaipNamespace): string[] {
    return Object.entries(this.state.enabledNetworkMap[namespace] ?? {})
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
  }

  /**
   * Gets all enabled networks across all namespaces.
   *
   * This method returns a record where keys are CAIP namespaces and values are arrays
   * of enabled chain IDs within each namespace.
   *
   * @returns A record mapping namespace to array of enabled chain IDs
   */
  getAllEnabledNetworks(): Record<CaipNamespace, string[]> {
    return Object.keys(this.state.enabledNetworkMap).reduce<
      Record<CaipNamespace, string[]>
    >((acc, ns) => {
      acc[ns] = this.getEnabledNetworksForNamespace(ns);
      return acc;
    }, {});
  }

  // ---------------------------- Internals ----------------------------------

  /**
   * Derives the namespace, storage key, and CAIP chain ID from a given chain ID.
   *
   * This internal method handles the conversion between different chain ID formats.
   * For EVM networks, it converts Hex chain IDs to CAIP-2 format and determines
   * the appropriate storage key. For non-EVM networks, it parses the CAIP-2 chain ID
   * and uses the full chain ID as the storage key.
   *
   * @param chainId - The chain ID to derive keys from (Hex or CAIP-2 format)
   * @returns An object containing namespace, storageKey, and caipId
   * @throws Error if the chain ID cannot be parsed
   */
  #deriveKeys(chainId: Hex | CaipChainId) {
    const caipId: CaipChainId = isCaipChainId(chainId)
      ? chainId
      : toEvmCaipChainId(chainId);
    const { namespace, reference } = parseCaipChainId(caipId);
    let storageKey: string;
    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      storageKey = isHexString(chainId) ? chainId : toHex(reference);
    } else {
      storageKey = caipId;
    }
    return { namespace, storageKey, caipId };
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
    const { namespace, storageKey } = this.#deriveKeys(chainId);
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
    const { namespace, storageKey } = this.#deriveKeys(chainId);
    this.update((s) => {
      if (namespace in s.enabledNetworkMap) {
        delete s.enabledNetworkMap[namespace][storageKey];
        if (Object.keys(s.enabledNetworkMap[namespace]).length === 0) {
          delete s.enabledNetworkMap[namespace];
        }
      }
      this.#ensureAtLeastOneEnabled(s);
    });
  }

  /**
   * Ensures that at least one network is enabled.
   *
   * This method is a safety mechanism that prevents all networks from being disabled.
   * If no networks are enabled, it automatically enables Ethereum mainnet as a fallback.
   *
   * @param state - The current controller state
   */
  #ensureAtLeastOneEnabled(state: NetworkEnablementControllerState) {
    const anyEnabled = Object.values(state.enabledNetworkMap).some((map) =>
      Object.values(map).some((enabled) => enabled),
    );
    if (!anyEnabled) {
      this.#ensureNamespaceBucket(state, KnownCaipNamespace.Eip155);
      state.enabledNetworkMap[KnownCaipNamespace.Eip155][
        ChainId[BuiltInNetworkName.Mainnet]
      ] = true;
    }
  }

  /**
   * Checks if a network is known to the system.
   *
   * This method verifies whether a network exists in the NetworkController or
   * MultichainNetworkController configurations. It's used to prevent enabling
   * unknown networks.
   *
   * @param caipId - The CAIP-2 chain ID to check
   * @returns True if the network is known, false otherwise
   */
  #isKnownNetwork(caipId: CaipChainId): boolean {
    const { namespace, reference } = parseCaipChainId(caipId);
    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      const { networkConfigurationsByChainId } = this.messagingSystem.call(
        'NetworkController:getState',
      );
      return toHex(reference) in networkConfigurationsByChainId;
    }
    if (namespace === (KnownCaipNamespace.Solana as string)) {
      const { multichainNetworkConfigurationsByChainId } =
        this.messagingSystem.call('MultichainNetworkController:getState');
      return caipId in multichainNetworkConfigurationsByChainId;
    }
    return false;
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
  #isPopularNetwork(caipId: CaipChainId | string): boolean {
    if (isHexString(caipId)) {
      return POPULAR_NETWORKS.includes(caipId);
    }
    const { namespace, reference } = parseCaipChainId(caipId);
    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      return POPULAR_NETWORKS.includes(toHex(reference));
    }
    return false;
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
    const { namespace, storageKey, caipId } = this.#deriveKeys(chainId);

    // Ignore unknown networks
    if (!this.#isKnownNetwork(caipId)) {
      return;
    }

    // Don't disable the last remaining enabled network
    if (
      !enable &&
      Object.values(this.getAllEnabledNetworks()).flat().length <= 1
    ) {
      return;
    }

    this.update((s) => {
      // Ensure entry exists first
      this.#ensureNetworkEntry(chainId);

      // If enabling a non-popular network, disable all others
      if (enable && !this.#isPopularNetwork(caipId)) {
        Object.values(s.enabledNetworkMap).forEach((map) => {
          Object.keys(map).forEach((key) => {
            map[key] = false;
          });
        });
      }

      // disable all non popular networks when enabling a non popular network
      Object.values(s.enabledNetworkMap).forEach((map) => {
        Object.keys(map).forEach((key) => {
          if (!this.#isPopularNetwork(key)) {
            map[key] = false;
          }
        });
      });

      s.enabledNetworkMap[namespace][storageKey] = enable;
      this.#ensureAtLeastOneEnabled(s);
    });
  }
}
