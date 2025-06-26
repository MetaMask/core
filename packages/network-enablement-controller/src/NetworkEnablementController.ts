import { BaseController } from '@metamask/base-controller';
import type {
  RestrictedMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId, toHex } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import { toEvmCaipChainId } from '@metamask/multichain-network-controller';
import type {
  NetworkConfiguration,
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

// Unique name for the controller
const controllerName = 'NetworkEnablementController';

/**
 * Information about an ordered network.
 */
export type NetworksInfo = {
  networkId: CaipChainId; // The network's chain id
};

// State shape for NetworkEnablementController
export type NetworkEnablementControllerState = {
  enabledNetworkMap: Record<CaipNamespace, Record<string, boolean>>;
};

export type NetworkEnablementControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    NetworkEnablementControllerState
  >;

export type NetworkEnablementControllerSetEnabledNetworksAction = {
  type: `${typeof controllerName}:setEnabledNetworks`;
  handler: NetworkEnablementController['setEnabledNetworks'];
};

export type NetworkEnablementControllerDisableNetworkAction = {
  type: `${typeof controllerName}:disableNetwork`;
  handler: NetworkEnablementController['disableNetwork'];
};

export type NetworkEnablementControllerIsNetworkEnabledAction = {
  type: `${typeof controllerName}:isNetworkEnabled`;
  handler: NetworkEnablementController['isNetworkEnabled'];
};

/**
 * All actions that {@link NetworkEnablementController} calls internally.
 */
type AllowedActions = never;

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
  (): NetworkEnablementControllerState => {
    return {
      enabledNetworkMap: {
        eip155: {
          [ChainId[BuiltInNetworkName.Mainnet]]: true,
          [ChainId[BuiltInNetworkName.LineaMainnet]]: true,
          [ChainId[BuiltInNetworkName.BaseMainnet]]: true,
        },
        solana: {
          [SolScope.Mainnet]: true,
        },
      },
    };
  };

// Metadata for the controller state
const metadata = {
  enabledNetworkMap: {
    persist: true,
    anonymous: true,
  },
};

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
    const defaultState = getDefaultNetworkEnablementControllerState();

    // Deep merge enabledNetworkMap
    const mergedEnabledNetworkMap = {
      eip155: {
        ...defaultState.enabledNetworkMap.eip155,
        ...state?.enabledNetworkMap?.eip155,
      },
      solana: {
        ...defaultState.enabledNetworkMap.solana,
        ...state?.enabledNetworkMap?.solana,
      },
    };

    // Call the constructor of BaseControllerV2
    super({
      messenger,
      metadata,
      name: controllerName,
      state: { enabledNetworkMap: mergedEnabledNetworkMap },
    });

    this.messagingSystem = messenger;

    // Subscribe to network state changes
    this.messagingSystem.subscribe(
      'NetworkController:networkAdded',
      (networkAdded: NetworkConfiguration) => {
        this.#onNetworkAdded(networkAdded);
      },
    );

    // Subscribe to network removal events
    this.messagingSystem.subscribe(
      'NetworkController:networkRemoved',
      (networkRemoved: NetworkConfiguration) => {
        this.#onNetworkRemoved(networkRemoved);
      },
    );
  }

  /**
   * Handles network added events.
   * This method is called when a network is added to the network controller.
   * The network is automatically enabled when added.
   *
   * @param networkAdded - The network added event.
   */
  #onNetworkAdded(networkAdded: NetworkConfiguration) {
    this.setEvmEnabledNetwork(networkAdded.chainId);
  }

  /**
   * Handles network removed events.
   * This method is called when a network is removed from the network controller.
   * The network is automatically disabled when removed.
   *
   * @param networkRemoved - The network removed event.
   */
  #onNetworkRemoved(networkRemoved: NetworkConfiguration) {
    this.disableNetwork(networkRemoved.chainId);
  }

  /**
   * Sets the enabled network for an EVM chain.
   *
   * @param chainId - The chain ID of the network to enable.
   */
  setEvmEnabledNetwork(chainId: Hex) {
    const caipChainId = toEvmCaipChainId(chainId);
    const { namespace } = parseCaipChainId(caipChainId);

    if (namespace === (KnownCaipNamespace.Eip155 as string)) {
      this.update((state: NetworkEnablementControllerState) => {
        state.enabledNetworkMap.eip155[chainId] = true;
      });
    }
  }

  /**
   * Sets the enabled network for a Solana chain.
   *
   * @param caipChainId - The CAIP-2 chain ID of the network to enable.
   */
  setSolanaEnabledNetwork(caipChainId: CaipChainId) {
    const { namespace } = parseCaipChainId(caipChainId);

    if (namespace === (KnownCaipNamespace.Solana as string)) {
      this.update((state: NetworkEnablementControllerState) => {
        state.enabledNetworkMap.solana[caipChainId] = true;
      });
    }
  }

  /**
   * Disables a network by removing it from the enabled network map.
   *
   * @param chainId - The chain ID of the network to disable.
   */
  disableNetwork(chainId: Hex | CaipChainId) {
    let namespace: CaipNamespace | undefined;
    let networkId: string;

    if (!isHexString(chainId) && !isCaipChainId(chainId)) {
      return;
    }

    // Handle both Hex and CaipChainId formats
    if (isHexString(chainId)) {
      const caipChainId = toEvmCaipChainId(chainId as Hex);
      const parsed = parseCaipChainId(caipChainId);
      namespace = parsed.namespace;
      networkId = chainId;
    } else {
      const parsed = parseCaipChainId(chainId as CaipChainId);
      namespace = parsed.namespace;
      networkId = chainId as CaipChainId;
    }

    if (!namespace) {
      return;
    }

    this.update((state: NetworkEnablementControllerState) => {
      if (namespace && state.enabledNetworkMap[namespace]) {
        state.enabledNetworkMap[namespace][networkId] = false;
      }
    });
  }

  /**
   * Checks if a network is enabled.
   *
   * @param chainId - The chain ID of the network to check.
   * @returns True if the network is enabled, false otherwise.
   */
  isNetworkEnabled(chainId: Hex | CaipChainId): boolean {
    let namespace: CaipNamespace | undefined;
    let networkId: string;

    if (!isHexString(chainId) && !isCaipChainId(chainId)) {
      return false;
    }

    // Handle both Hex and CaipChainId formats
    if (isHexString(chainId)) {
      const caipChainId = toEvmCaipChainId(chainId as Hex);
      const parsed = parseCaipChainId(caipChainId);
      namespace = parsed.namespace;
      networkId = chainId;
    } else {
      const parsed = parseCaipChainId(chainId as CaipChainId);
      namespace = parsed.namespace;
      networkId = chainId as CaipChainId;
    }

    if (!namespace) {
      return false;
    }

    return this.state.enabledNetworkMap[namespace]?.[networkId] === true;
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

    // Clear all existing enabled networks first
    this.update((state: NetworkEnablementControllerState) => {
      Object.keys(state.enabledNetworkMap).forEach((namespace) => {
        state.enabledNetworkMap[namespace as CaipNamespace] = {};
      });
    });

    // Enable the specified networks
    ids.forEach((chainId) => {
      const { namespace, reference } = parseCaipChainId(chainId);
      if (namespace === (KnownCaipNamespace.Eip155 as string)) {
        // For EVM chains, convert the chain ID to hex format
        const hexChainId = toHex(parseInt(reference, 10));
        this.setEvmEnabledNetwork(hexChainId);
      } else if (namespace === (KnownCaipNamespace.Solana as string)) {
        this.setSolanaEnabledNetwork(chainId);
      }
    });
  }

  /**
   * Gets all enabled networks for a specific namespace.
   *
   * @param namespace - The namespace to get enabled networks for.
   * @returns Array of enabled network IDs for the namespace.
   */
  getEnabledNetworksForNamespace(namespace: CaipNamespace): string[] {
    const enabledNetworks = this.state.enabledNetworkMap[namespace];
    if (!enabledNetworks) {
      return [];
    }
    return Object.keys(enabledNetworks).filter(
      (networkId) => enabledNetworks[networkId],
    );
  }

  /**
   * Gets all enabled networks across all namespaces.
   *
   * @returns Object mapping namespaces to arrays of enabled network IDs.
   */
  getAllEnabledNetworks(): Record<CaipNamespace, string[]> {
    const result: Record<CaipNamespace, string[]> = {} as Record<
      CaipNamespace,
      string[]
    >;

    Object.keys(this.state.enabledNetworkMap).forEach((namespace) => {
      result[namespace as CaipNamespace] = this.getEnabledNetworksForNamespace(
        namespace as CaipNamespace,
      );
    });

    return result;
  }
}
