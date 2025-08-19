import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedMessenger,
} from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import type { MultichainNetworkControllerGetStateAction } from '@metamask/multichain-network-controller';
import type {
  NetworkControllerGetStateAction,
  NetworkControllerNetworkAddedEvent,
  NetworkControllerNetworkRemovedEvent,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { TransactionControllerTransactionSubmittedEvent } from '@metamask/transaction-controller';
import type { CaipChainId, CaipNamespace, Hex } from '@metamask/utils';
import { KnownCaipNamespace } from '@metamask/utils';

import { SolScope } from './types';
import {
  deriveKeys,
  isOnlyNetworkEnabledInNamespace,
  isPopularNetwork,
} from './utils';

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
 * A map of enabled networks by CAIP namespace and chain ID.
 * For EIP-155 networks, the keys are Hex chain IDs.
 * For other networks, the keys are CAIP chain IDs.
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
  | NetworkControllerStateChangeEvent
  | TransactionControllerTransactionSubmittedEvent;

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
      this.#onAddNetwork(chainId);
    });

    messenger.subscribe('NetworkController:networkRemoved', ({ chainId }) => {
      this.#removeNetworkEntry(chainId);
    });

    // Listen for confirmed staking transactions
    messenger.subscribe(
      'TransactionController:transactionSubmitted',
      (transactionMeta) => {
        if (transactionMeta?.transactionMeta?.chainId) {
          this.enableNetwork(
            transactionMeta.transactionMeta.chainId as Hex | CaipChainId,
          );
        }
      },
    );
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
    const { namespace, storageKey, reference } = deriveKeys(chainId);

    const isPopular = isPopularNetwork(reference);

    this.update((s) => {
      // if the namespace bucket does not exist, return
      // new nemespace are added only when a new network is added
      if (!s.enabledNetworkMap[namespace]) {
        return;
      }

      // If enabling a non-popular network, disable all networks in the same namespace
      if (!isPopular) {
        // disable all networks in the same namespace
        Object.keys(s.enabledNetworkMap[namespace]).forEach((key) => {
          s.enabledNetworkMap[namespace][key as CaipChainId | Hex] = false;
        });
      } else {
        // disable all custom networks
        Object.keys(s.enabledNetworkMap[namespace]).forEach((key) => {
          const { reference: keyReference } = deriveKeys(key as CaipChainId);
          if (!isPopularNetwork(keyReference)) {
            s.enabledNetworkMap[namespace][key as CaipChainId | Hex] = false;
          }
        });
      }
      s.enabledNetworkMap[namespace][storageKey] = true;
    });
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
    const derivedKeys = deriveKeys(chainId);
    const { namespace, storageKey } = derivedKeys;

    if (isOnlyNetworkEnabledInNamespace(this.state, derivedKeys)) {
      throw new Error('Cannot disable the last remaining enabled network');
    }

    this.update((s) => {
      s.enabledNetworkMap[namespace][storageKey] = false;
    });
  }

  /**
   * Checks if a network is enabled.
   *
   * @param chainId - The chain ID of the network to check. Can be either:
   * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
   * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
   * @returns True if the network is enabled, false otherwise
   */
  isNetworkEnabled(chainId: Hex | CaipChainId): boolean {
    const derivedKeys = deriveKeys(chainId);
    const { namespace, storageKey } = derivedKeys;
    return this.state.enabledNetworkMap[namespace]?.[storageKey] ?? false;
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
   * Removes a network entry from the state.
   *
   * This method is called when a network is removed from the system. It cleans up
   * the network entry and ensures that at least one network remains enabled.
   *
   * @param chainId - The chain ID to remove (Hex or CAIP-2 format)
   */
  #removeNetworkEntry(chainId: Hex | CaipChainId): void {
    const derivedKeys = deriveKeys(chainId);
    const { namespace, storageKey } = derivedKeys;

    this.update((s) => {
      // fallback and enable ethereum mainnet
      if (isOnlyNetworkEnabledInNamespace(this.state, derivedKeys)) {
        s.enabledNetworkMap[namespace][ChainId[BuiltInNetworkName.Mainnet]] =
          true;
      }

      if (namespace in s.enabledNetworkMap) {
        delete s.enabledNetworkMap[namespace][storageKey];
      }
    });
  }

  /**
   * Handles the addition of a new network to the controller.
   *
   * This method is called when a network is added to the system. It automatically
   * enables the new network and implements exclusive mode for non-popular networks.
   * If the network already exists, no changes are made.
   *
   * @param chainId - The chain ID of the network being added (Hex or CAIP-2 format)
   */
  #onAddNetwork(chainId: Hex | CaipChainId): void {
    const { namespace, storageKey, reference } = deriveKeys(chainId);

    this.update((s) => {
      // Ensure the namespace bucket exists
      this.#ensureNamespaceBucket(s, namespace);

      // If adding a non-popular network, disable all other networks in the same namespace
      // This implements exclusive mode where only one non-popular network can be active
      if (!isPopularNetwork(reference)) {
        Object.keys(s.enabledNetworkMap[namespace]).forEach((key) => {
          s.enabledNetworkMap[namespace][key as CaipChainId | Hex] = false;
        });
      }

      // Add the new network as enabled
      s.enabledNetworkMap[namespace][storageKey] = true;
    });
  }
}
