import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BuiltInNetworkName, ChainId } from '@metamask/controller-utils';
import { BtcScope, SolScope, TrxScope } from '@metamask/keyring-api';
import type { Messenger } from '@metamask/messenger';
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

import { POPULAR_NETWORKS } from './constants';
import { Slip44Service } from './services';
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

/**
 * A native asset identifier in CAIP-19-like format.
 * Format: `{caip2ChainId}/slip44:{coinType}`
 *
 * @example
 * - `eip155:1/slip44:60` for Ethereum mainnet (ETH)
 * - `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501` for Solana mainnet (SOL)
 * - `bip122:000000000019d6689c085ae165831e93/slip44:0` for Bitcoin mainnet (BTC)
 */
export type NativeAssetIdentifier = `${CaipChainId}/slip44:${number}`;

/**
 * A map of CAIP-2 chain IDs to their native asset identifiers.
 * Uses CAIP-19-like format to identify the native asset for each chain.
 *
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export type NativeAssetIdentifiersMap = Record<
  CaipChainId,
  NativeAssetIdentifier
>;

// State shape for NetworkEnablementController
export type NetworkEnablementControllerState = {
  enabledNetworkMap: EnabledMap;
  nativeAssetIdentifiers: NativeAssetIdentifiersMap;
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

export type NetworkEnablementControllerMessenger = Messenger<
  typeof controllerName,
  NetworkEnablementControllerActions | AllowedActions,
  NetworkEnablementControllerEvents | AllowedEvents
>;

/**
 * Builds a native asset identifier in CAIP-19-like format.
 *
 * @param caipChainId - The CAIP-2 chain ID (e.g., 'eip155:1', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
 * @param slip44CoinType - The SLIP-44 coin type number
 * @returns The native asset identifier string (e.g., 'eip155:1/slip44:60')
 */
function buildNativeAssetIdentifier(
  caipChainId: CaipChainId,
  slip44CoinType: number,
): NativeAssetIdentifier {
  return `${caipChainId}/slip44:${slip44CoinType}`;
}

/**
 * Network configuration with chain ID and native currency symbol.
 * Used to initialize native asset identifiers.
 */
export type NetworkConfig = {
  chainId: CaipChainId;
  nativeCurrency: string;
};

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
        [ChainId[BuiltInNetworkName.ArbitrumOne]]: true,
        [ChainId[BuiltInNetworkName.BscMainnet]]: true,
        [ChainId[BuiltInNetworkName.OptimismMainnet]]: true,
        [ChainId[BuiltInNetworkName.PolygonMainnet]]: true,
        [ChainId[BuiltInNetworkName.SeiMainnet]]: true,
      },
      [KnownCaipNamespace.Solana]: {
        [SolScope.Mainnet]: true,
        [SolScope.Testnet]: false,
        [SolScope.Devnet]: false,
      },
      [KnownCaipNamespace.Bip122]: {
        [BtcScope.Mainnet]: true,
        [BtcScope.Testnet]: false,
        [BtcScope.Signet]: false,
      },
      [KnownCaipNamespace.Tron]: {
        [TrxScope.Mainnet]: true,
        [TrxScope.Nile]: false,
        [TrxScope.Shasta]: false,
      },
    },
    // nativeAssetIdentifiers is initialized as empty and should be populated
    // by the client using initNativeAssetIdentifiers() during controller init
    nativeAssetIdentifiers: {},
  });

// Metadata for the controller state
const metadata = {
  enabledNetworkMap: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  nativeAssetIdentifiers: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
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

    messenger.subscribe(
      'NetworkController:networkAdded',
      ({ chainId, nativeCurrency }) => {
        // eslint-disable-next-line no-void
        void this.#onAddNetwork(chainId, nativeCurrency);
      },
    );

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
    const { namespace, storageKey } = deriveKeys(chainId);

    this.update((state) => {
      // disable all networks in all namespaces first
      Object.keys(state.enabledNetworkMap).forEach((ns) => {
        Object.keys(state.enabledNetworkMap[ns]).forEach((key) => {
          state.enabledNetworkMap[ns][key as CaipChainId | Hex] = false;
        });
      });

      // if the namespace bucket does not exist, return
      // new nemespace are added only when a new network is added
      if (!state.enabledNetworkMap[namespace]) {
        return;
      }

      // enable the network
      state.enabledNetworkMap[namespace][storageKey] = true;
    });
  }

  /**
   * Enables a network for the user within a specific namespace.
   *
   * This method accepts either a Hex chain ID (for EVM networks) or a CAIP-2 chain ID
   * (for any blockchain network) and enables it within the specified namespace.
   * The method validates that the chainId belongs to the specified namespace for safety.
   *
   * Before enabling the target network, this method disables all other networks
   * in the same namespace to ensure exclusive behavior within the namespace.
   *
   * @param chainId - The chain ID of the network to enable. Can be either:
   * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
   * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
   * @param namespace - The CAIP namespace where the network should be enabled
   * @throws Error if the chainId's derived namespace doesn't match the provided namespace
   */
  enableNetworkInNamespace(
    chainId: Hex | CaipChainId,
    namespace: CaipNamespace,
  ): void {
    const { namespace: derivedNamespace, storageKey } = deriveKeys(chainId);

    // Validate that the derived namespace matches the provided namespace
    if (derivedNamespace !== namespace) {
      throw new Error(
        `Chain ID ${chainId} belongs to namespace ${derivedNamespace}, but namespace ${namespace} was specified`,
      );
    }

    this.update((state) => {
      // Ensure the namespace bucket exists
      this.#ensureNamespaceBucket(state, namespace);

      // Disable all networks in the specified namespace first
      if (state.enabledNetworkMap[namespace]) {
        Object.keys(state.enabledNetworkMap[namespace]).forEach((key) => {
          state.enabledNetworkMap[namespace][key as CaipChainId | Hex] = false;
        });
      }

      // Enable the target network in the specified namespace
      state.enabledNetworkMap[namespace][storageKey] = true;
    });
  }

  /**
   * Enables all popular networks and Solana mainnet.
   *
   * This method first disables all networks across all namespaces, then enables
   * all networks defined in POPULAR_NETWORKS (EVM networks), Solana mainnet, and
   * Bitcoin mainnet. This provides exclusive behavior - only popular networks will
   * be enabled after calling this method.
   *
   * Popular networks that don't exist in NetworkController or MultichainNetworkController configurations will be skipped silently.
   */
  enableAllPopularNetworks(): void {
    this.update((state) => {
      // First disable all networks across all namespaces
      Object.keys(state.enabledNetworkMap).forEach((ns) => {
        Object.keys(state.enabledNetworkMap[ns]).forEach((key) => {
          state.enabledNetworkMap[ns][key as CaipChainId | Hex] = false;
        });
      });

      // Get current network configurations to check if networks exist
      const networkControllerState = this.messenger.call(
        'NetworkController:getState',
      );
      const multichainState = this.messenger.call(
        'MultichainNetworkController:getState',
      );

      // Enable all popular EVM networks that exist in NetworkController configurations
      POPULAR_NETWORKS.forEach((chainId) => {
        const { namespace, storageKey } = deriveKeys(chainId as Hex);

        // Check if network exists in NetworkController configurations
        if (
          networkControllerState.networkConfigurationsByChainId[chainId as Hex]
        ) {
          // Ensure namespace bucket exists
          this.#ensureNamespaceBucket(state, namespace);
          // Enable the network
          state.enabledNetworkMap[namespace][storageKey] = true;
        }
      });

      // Enable Solana mainnet if it exists in MultichainNetworkController configurations
      const solanaKeys = deriveKeys(SolScope.Mainnet as CaipChainId);
      if (
        multichainState.multichainNetworkConfigurationsByChainId[
          SolScope.Mainnet
        ]
      ) {
        // Ensure namespace bucket exists
        this.#ensureNamespaceBucket(state, solanaKeys.namespace);
        // Enable Solana mainnet
        state.enabledNetworkMap[solanaKeys.namespace][solanaKeys.storageKey] =
          true;
      }

      // Enable Bitcoin mainnet if it exists in MultichainNetworkController configurations
      const bitcoinKeys = deriveKeys(BtcScope.Mainnet as CaipChainId);
      if (
        multichainState.multichainNetworkConfigurationsByChainId[
          BtcScope.Mainnet
        ]
      ) {
        // Ensure namespace bucket exists
        this.#ensureNamespaceBucket(state, bitcoinKeys.namespace);
        // Enable Bitcoin mainnet
        state.enabledNetworkMap[bitcoinKeys.namespace][bitcoinKeys.storageKey] =
          true;
      }

      // Enable Tron mainnet if it exists in MultichainNetworkController configurations
      const tronKeys = deriveKeys(TrxScope.Mainnet as CaipChainId);
      if (
        multichainState.multichainNetworkConfigurationsByChainId[
          TrxScope.Mainnet
        ]
      ) {
        // Ensure namespace bucket exists
        this.#ensureNamespaceBucket(state, tronKeys.namespace);
        // Enable Tron mainnet
        state.enabledNetworkMap[tronKeys.namespace][tronKeys.storageKey] = true;
      }
    });
  }

  /**
   * Initializes the network enablement state from network controller configurations.
   *
   * This method reads the current network configurations from both NetworkController
   * and MultichainNetworkController and syncs the enabled network map and nativeAssetIdentifiers accordingly.
   * It ensures proper namespace buckets exist for all configured networks and only
   * adds missing networks with a default value of false, preserving existing user settings.
   *
   * This method should be called after the NetworkController and MultichainNetworkController
   * have been initialized and their configurations are available.
   */
  async init(): Promise<void> {
    // Get network configurations from NetworkController (EVM networks)
    const networkControllerState = this.messenger.call(
      'NetworkController:getState',
    );

    // Get network configurations from MultichainNetworkController (all networks)
    const multichainState = this.messenger.call(
      'MultichainNetworkController:getState',
    );

    // Build nativeAssetIdentifiers for EVM networks using chainid.network
    const evmNativeAssetUpdates: {
      caipChainId: CaipChainId;
      identifier: NativeAssetIdentifier;
    }[] = [];

    for (const [chainId, config] of Object.entries(
      networkControllerState.networkConfigurationsByChainId,
    )) {
      const { caipChainId } = deriveKeys(chainId as Hex);

      // Skip if already in state
      if (this.state.nativeAssetIdentifiers[caipChainId] !== undefined) {
        continue;
      }

      // Parse hex chainId to number for chainid.network lookup
      const numericChainId = parseInt(chainId, 16);

      // EVM networks: use getSlip44ByChainId (chainid.network data)
      // Default to 60 (Ethereum) if no specific mapping is found
      const slip44CoinType =
        (await Slip44Service.getSlip44ByChainId(
          numericChainId,
          config.nativeCurrency,
        )) ?? 60;

      evmNativeAssetUpdates.push({
        caipChainId,
        identifier: buildNativeAssetIdentifier(caipChainId, slip44CoinType),
      });
    }

    // Update state synchronously
    this.update((state) => {
      // Initialize namespace buckets for EVM networks from NetworkController
      Object.entries(
        networkControllerState.networkConfigurationsByChainId,
      ).forEach(([chainId]) => {
        const { namespace, storageKey } = deriveKeys(chainId as Hex);
        this.#ensureNamespaceBucket(state, namespace);

        // Only add network if it doesn't already exist in state (preserves user settings)
        state.enabledNetworkMap[namespace][storageKey] ??= false;
      });

      // Apply nativeAssetIdentifier updates
      for (const { caipChainId, identifier } of evmNativeAssetUpdates) {
        state.nativeAssetIdentifiers[caipChainId] = identifier;
      }

      // Initialize namespace buckets for all networks from MultichainNetworkController
      Object.keys(
        multichainState.multichainNetworkConfigurationsByChainId,
      ).forEach((chainId) => {
        const { namespace, storageKey } = deriveKeys(chainId as CaipChainId);
        this.#ensureNamespaceBucket(state, namespace);

        // Only add network if it doesn't already exist in state (preserves user settings)
        state.enabledNetworkMap[namespace][storageKey] ??= false;
      });
    });
  }

  /**
   * Initializes the native asset identifiers from network configurations.
   * This method should be called from the client during controller initialization
   * to populate the nativeAssetIdentifiers state based on actual network configurations.
   *
   * @param networks - Array of network configurations with chainId and nativeCurrency
   * @example
   * ```typescript
   * const evmNetworks = Object.values(networkControllerState.networkConfigurationsByChainId)
   *   .map(config => ({
   *     chainId: toEvmCaipChainId(config.chainId),
   *     nativeCurrency: config.nativeCurrency,
   *   }));
   *
   * const multichainNetworks = Object.values(multichainState.multichainNetworkConfigurationsByChainId)
   *   .map(config => ({
   *     chainId: config.chainId,
   *     nativeCurrency: config.nativeCurrency,
   *   }));
   *
   * await controller.initNativeAssetIdentifiers([...evmNetworks, ...multichainNetworks]);
   * ```
   */
  async initNativeAssetIdentifiers(networks: NetworkConfig[]): Promise<void> {
    // Process networks and collect updates
    const updates: {
      chainId: CaipChainId;
      identifier: NativeAssetIdentifier;
    }[] = [];

    for (const { chainId, nativeCurrency } of networks) {
      // Check if nativeCurrency is already in CAIP-19 format (e.g., "bip122:.../slip44:0")
      // Non-EVM networks from MultichainNetworkController use this format
      if (nativeCurrency.includes('/slip44:')) {
        updates.push({
          chainId,
          identifier: nativeCurrency as NativeAssetIdentifier,
        });
        continue;
      }

      // Extract namespace from CAIP-2 chainId
      const [namespace, reference] = chainId.split(':');
      let slip44CoinType: number | undefined;

      if (namespace === 'eip155') {
        // EVM networks: use getSlip44ByChainId (chainid.network data)
        // Default to 60 (Ethereum) if no specific mapping is found
        const numericChainId = parseInt(reference, 10);
        slip44CoinType =
          (await Slip44Service.getSlip44ByChainId(
            numericChainId,
            nativeCurrency,
          )) ?? 60;
      } else {
        // Non-EVM networks: use getSlip44BySymbol (@metamask/slip44 package)
        slip44CoinType = Slip44Service.getSlip44BySymbol(nativeCurrency);
      }

      if (slip44CoinType !== undefined) {
        updates.push({
          chainId,
          identifier: buildNativeAssetIdentifier(chainId, slip44CoinType),
        });
      }
    }

    // Apply all updates synchronously
    this.update((state) => {
      for (const { chainId, identifier } of updates) {
        state.nativeAssetIdentifiers[chainId] = identifier;
      }
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

    this.update((state) => {
      state.enabledNetworkMap[namespace][storageKey] = false;
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
  ): void {
    if (!state.enabledNetworkMap[ns]) {
      state.enabledNetworkMap[ns] = {};
    }
  }

  /**
   * Checks if popular networks mode is active (more than 2 popular networks enabled).
   *
   * This method counts how many networks defined in POPULAR_NETWORKS are currently
   * enabled in the state and returns true if more than 2 are enabled. It only checks
   * networks that actually exist in the NetworkController configurations.
   *
   * @returns True if more than 2 popular networks are enabled, false otherwise
   */
  #isInPopularNetworksMode(): boolean {
    // Get current network configurations to check which popular networks exist
    const networkControllerState = this.messenger.call(
      'NetworkController:getState',
    );

    // Count how many popular networks are enabled
    const enabledPopularNetworksCount = POPULAR_NETWORKS.reduce(
      (count, chainId) => {
        // Only check networks that actually exist in NetworkController configurations
        if (
          !networkControllerState.networkConfigurationsByChainId[chainId as Hex]
        ) {
          return count; // Skip networks that don't exist
        }

        const { namespace, storageKey } = deriveKeys(chainId as Hex);
        const isEnabled = this.state.enabledNetworkMap[namespace]?.[storageKey];
        return isEnabled ? count + 1 : count;
      },
      0,
    );

    // Return true if more than 2 popular networks are enabled
    return enabledPopularNetworksCount > 1;
  }

  /**
   * Removes a network entry from the state.
   *
   * This method is called when a network is removed from the system. It cleans up
   * the network entry from both enabledNetworkMap and nativeAssetIdentifiers, and ensures that
   * at least one network remains enabled.
   *
   * @param chainId - The chain ID to remove (Hex or CAIP-2 format)
   */
  #removeNetworkEntry(chainId: Hex | CaipChainId): void {
    const derivedKeys = deriveKeys(chainId);
    const { namespace, storageKey, caipChainId } = derivedKeys;

    this.update((state) => {
      // fallback and enable ethereum mainnet
      if (isOnlyNetworkEnabledInNamespace(this.state, derivedKeys)) {
        state.enabledNetworkMap[namespace][
          ChainId[BuiltInNetworkName.Mainnet]
        ] = true;
      }

      if (namespace in state.enabledNetworkMap) {
        delete state.enabledNetworkMap[namespace][storageKey];
      }

      // Remove from nativeAssetIdentifiers as well
      delete state.nativeAssetIdentifiers[caipChainId];
    });
  }

  /**
   * Handles the addition of a new EVM network to the controller.
   *
   * @param chainId - The chain ID to add (Hex format)
   * @param nativeCurrency - The native currency symbol of the network (e.g., 'ETH')
   *
   * @description
   * - If in popular networks mode (>2 popular networks enabled) AND adding a popular network:
   * - Keep current selection (add but don't enable the new network)
   * - Otherwise:
   * - Switch to the newly added network (disable all others, enable this one)
   * - Also updates the nativeAssetIdentifiers with the CAIP-19-like identifier
   */
  async #onAddNetwork(chainId: Hex, nativeCurrency: string): Promise<void> {
    const { namespace, storageKey, reference, caipChainId } =
      deriveKeys(chainId);

    // Parse hex chainId to number for chainid.network lookup
    const numericChainId = parseInt(reference, 16);

    // EVM networks: use getSlip44ByChainId (chainid.network data)
    // Default to 60 (Ethereum) if no specific mapping is found
    const slip44CoinType =
      (await Slip44Service.getSlip44ByChainId(
        numericChainId,
        nativeCurrency,
      )) ?? 60;

    this.update((state) => {
      // Ensure the namespace bucket exists
      this.#ensureNamespaceBucket(state, namespace);

      // Check if popular networks mode is active (>2 popular networks enabled)
      const inPopularNetworksMode = this.#isInPopularNetworksMode();

      // Check if the network being added is a popular network
      const isAddedNetworkPopular = isPopularNetwork(reference);

      // Keep current selection only if in popular networks mode AND adding a popular network
      const shouldKeepCurrentSelection =
        inPopularNetworksMode && isAddedNetworkPopular;

      if (shouldKeepCurrentSelection) {
        // Add the popular network but don't enable it (keep current selection)
        state.enabledNetworkMap[namespace][storageKey] = true;
      } else {
        // Switch to the newly added network (disable all others, enable this one)
        Object.keys(state.enabledNetworkMap).forEach((ns) => {
          Object.keys(state.enabledNetworkMap[ns]).forEach((key) => {
            state.enabledNetworkMap[ns][key as CaipChainId | Hex] = false;
          });
        });
        // Enable the newly added network
        state.enabledNetworkMap[namespace][storageKey] = true;
      }

      // Update nativeAssetIdentifiers with the CAIP-19-like identifier
      state.nativeAssetIdentifiers[caipChainId] = buildNativeAssetIdentifier(
        caipChainId,
        slip44CoinType,
      );
    });
  }
}
