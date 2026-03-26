/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkEnablementController } from './NetworkEnablementController';

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
export type NetworkEnablementControllerEnableNetworkAction = {
  type: `NetworkEnablementController:enableNetwork`;
  handler: NetworkEnablementController['enableNetwork'];
};

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
export type NetworkEnablementControllerEnableNetworkInNamespaceAction = {
  type: `NetworkEnablementController:enableNetworkInNamespace`;
  handler: NetworkEnablementController['enableNetworkInNamespace'];
};

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
export type NetworkEnablementControllerEnableAllPopularNetworksAction = {
  type: `NetworkEnablementController:enableAllPopularNetworks`;
  handler: NetworkEnablementController['enableAllPopularNetworks'];
};

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
export type NetworkEnablementControllerInitAction = {
  type: `NetworkEnablementController:init`;
  handler: NetworkEnablementController['init'];
};

/**
 * Initializes the native asset identifiers from network configurations.
 * This method should be called from the client during controller initialization
 * to populate the nativeAssetIdentifiers state based on actual network configurations.
 *
 * @param networks - Array of network configurations with chainId and nativeCurrency
 * @example
 * ```typescript
 * const evmNetworks = Object.values(networkControllerState.networkConfigurationsByChainId)
 * .map(config => ({
 * chainId: toEvmCaipChainId(config.chainId),
 * nativeCurrency: config.nativeCurrency,
 * }));
 *
 * const multichainNetworks = Object.values(multichainState.multichainNetworkConfigurationsByChainId)
 * .map(config => ({
 * chainId: config.chainId,
 * nativeCurrency: config.nativeCurrency,
 * }));
 *
 * await controller.initNativeAssetIdentifiers([...evmNetworks, ...multichainNetworks]);
 * ```
 */
export type NetworkEnablementControllerInitNativeAssetIdentifiersAction = {
  type: `NetworkEnablementController:initNativeAssetIdentifiers`;
  handler: NetworkEnablementController['initNativeAssetIdentifiers'];
};

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
export type NetworkEnablementControllerDisableNetworkAction = {
  type: `NetworkEnablementController:disableNetwork`;
  handler: NetworkEnablementController['disableNetwork'];
};

/**
 * Checks if a network is enabled.
 *
 * @param chainId - The chain ID of the network to check. Can be either:
 * - A Hex string (e.g., '0x1' for Ethereum mainnet) for EVM networks
 * - A CAIP-2 chain ID (e.g., 'eip155:1' for Ethereum mainnet, 'solana:mainnet' for Solana)
 * @returns True if the network is enabled, false otherwise
 */
export type NetworkEnablementControllerIsNetworkEnabledAction = {
  type: `NetworkEnablementController:isNetworkEnabled`;
  handler: NetworkEnablementController['isNetworkEnabled'];
};

/**
 * Returns popular EVM network chain IDs in hex form, restricted to networks
 * that exist in NetworkController (networkConfigurationsByChainId). Source list
 * is POPULAR_NETWORKS.
 *
 * @returns Hex chain IDs for popular EVM networks that are configured.
 */
export type NetworkEnablementControllerListPopularEvmNetworksAction = {
  type: `NetworkEnablementController:listPopularEvmNetworks`;
  handler: NetworkEnablementController['listPopularEvmNetworks'];
};

/**
 * Returns popular multichain (Bitcoin, Solana, Tron) mainnet chain IDs in
 * CAIP-2 form, restricted to networks that exist in MultichainNetworkController
 * (multichainNetworkConfigurationsByChainId).
 *
 * @returns CAIP-2 chain IDs for Bitcoin, Solana, and Tron mainnets that are configured.
 */
export type NetworkEnablementControllerListPopularMultichainNetworksAction = {
  type: `NetworkEnablementController:listPopularMultichainNetworks`;
  handler: NetworkEnablementController['listPopularMultichainNetworks'];
};

/**
 * Returns the list of popular network chain IDs in CAIP-2 form, restricted to
 * networks that exist in NetworkController (networkConfigurationsByChainId) and
 * MultichainNetworkController (multichainNetworkConfigurationsByChainId). EVM
 * popular networks come from POPULAR_NETWORKS; multichain popular are Bitcoin,
 * Solana, and Tron mainnets.
 *
 * @returns CAIP-2 chain IDs for popular EVM networks and multichain mainnets that are configured.
 */
export type NetworkEnablementControllerListPopularNetworksAction = {
  type: `NetworkEnablementController:listPopularNetworks`;
  handler: NetworkEnablementController['listPopularNetworks'];
};

/**
 * Union of all NetworkEnablementController action types.
 */
export type NetworkEnablementControllerMethodActions =
  | NetworkEnablementControllerEnableNetworkAction
  | NetworkEnablementControllerEnableNetworkInNamespaceAction
  | NetworkEnablementControllerEnableAllPopularNetworksAction
  | NetworkEnablementControllerInitAction
  | NetworkEnablementControllerInitNativeAssetIdentifiersAction
  | NetworkEnablementControllerDisableNetworkAction
  | NetworkEnablementControllerIsNetworkEnabledAction
  | NetworkEnablementControllerListPopularEvmNetworksAction
  | NetworkEnablementControllerListPopularMultichainNetworksAction
  | NetworkEnablementControllerListPopularNetworksAction;
