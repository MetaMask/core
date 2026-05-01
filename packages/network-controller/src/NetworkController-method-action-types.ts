/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkController } from './NetworkController';

/**
 * Returns the EthQuery instance for the currently selected network.
 *
 * @returns The EthQuery instance, or undefined if the provider has not been
 * initialized.
 */
export type NetworkControllerGetEthQueryAction = {
  type: `NetworkController:getEthQuery`;
  handler: NetworkController['getEthQuery'];
};

/**
 * Enables the RPC failover functionality. That is, if any RPC endpoints are
 * configured with failover URLs, then traffic will automatically be diverted
 * to them if those RPC endpoints are unavailable.
 */
export type NetworkControllerEnableRpcFailoverAction = {
  type: `NetworkController:enableRpcFailover`;
  handler: NetworkController['enableRpcFailover'];
};

/**
 * Disables the RPC failover functionality. That is, even if any RPC endpoints
 * are configured with failover URLs, then traffic will not automatically be
 * diverted to them if those RPC endpoints are unavailable.
 */
export type NetworkControllerDisableRpcFailoverAction = {
  type: `NetworkController:disableRpcFailover`;
  handler: NetworkController['disableRpcFailover'];
};

/**
 * Accesses the provider and block tracker for the currently selected network.
 *
 * @returns The proxy and block tracker proxies.
 * @deprecated This method has been replaced by `getSelectedNetworkClient` (which has a more easily used return type) and will be removed in a future release.
 */
export type NetworkControllerGetProviderAndBlockTrackerAction = {
  type: `NetworkController:getProviderAndBlockTracker`;
  handler: NetworkController['getProviderAndBlockTracker'];
};

/**
 * Accesses the provider and block tracker for the currently selected network.
 *
 * @returns an object with the provider and block tracker proxies for the currently selected network.
 */
export type NetworkControllerGetSelectedNetworkClientAction = {
  type: `NetworkController:getSelectedNetworkClient`;
  handler: NetworkController['getSelectedNetworkClient'];
};

/**
 * Accesses the chain ID from the selected network client.
 *
 * @returns The chain ID of the selected network client in hex format or undefined if there is no network client.
 */
export type NetworkControllerGetSelectedChainIdAction = {
  type: `NetworkController:getSelectedChainId`;
  handler: NetworkController['getSelectedChainId'];
};

/**
 * Internally, the Infura and custom network clients are categorized by type
 * so that when accessing either kind of network client, TypeScript knows
 * which type to assign to the network client. For some cases it's more useful
 * to be able to access network clients by ID instead of by type and then ID,
 * so this function makes that possible.
 *
 * @returns The network clients registered so far, keyed by ID.
 */
export type NetworkControllerGetNetworkClientRegistryAction = {
  type: `NetworkController:getNetworkClientRegistry`;
  handler: NetworkController['getNetworkClientRegistry'];
};

/**
 * Returns the Infura network client with the given ID.
 *
 * @param infuraNetworkClientId - An Infura network client ID.
 * @returns The Infura network client.
 * @throws If an Infura network client does not exist with the given ID.
 */
export type NetworkControllerGetNetworkClientByIdAction = {
  type: `NetworkController:getNetworkClientById`;
  handler: NetworkController['getNetworkClientById'];
};

/**
 * Creates proxies for accessing the global network client and its block
 * tracker. You must call this method in order to use
 * `getProviderAndBlockTracker` (or its replacement,
 * `getSelectedNetworkClient`).
 *
 * @param options - Optional arguments.
 * @param options.lookupNetwork - Usually, metadata for the global network
 * will be populated via a call to `lookupNetwork` after creating the provider
 * and block tracker proxies. This allows for responding to the status of the
 * global network after initializing this controller; however, it requires
 * making a request to the network to do so. In the clients, where controllers
 * are initialized before the UI is shown, this may be undesirable, as it
 * means that if the user has just installed MetaMask, their IP address may be
 * shared with a third party before they have a chance to finish onboarding.
 * You can pass `false` if you'd like to disable this request and call
 * `lookupNetwork` yourself.
 */
export type NetworkControllerInitializeProviderAction = {
  type: `NetworkController:initializeProvider`;
  handler: NetworkController['initializeProvider'];
};

/**
 * Uses a request for the latest block to gather the following information on
 * the given or selected network, persisting it to state:
 *
 * - The connectivity status: whether it is available, geo-blocked (Infura
 * only), unavailable, or unknown
 * - The capabilities status: whether it supports EIP-1559, whether it does
 * not, or whether it is unknown
 *
 * @param networkClientId - The ID of the network client to inspect.
 * If no ID is provided, uses the currently selected network.
 */
export type NetworkControllerLookupNetworkAction = {
  type: `NetworkController:lookupNetwork`;
  handler: NetworkController['lookupNetwork'];
};

/**
 * Uses a request for the latest block to gather the following information on
 * the given network, persisting it to state:
 *
 * - The connectivity status: whether the network is available, geo-blocked
 * (Infura only), unavailable, or unknown
 * - The feature compatibility status: whether the network supports EIP-1559,
 * whether it does not, or whether it is unknown
 *
 * @param networkClientId - The ID of the network client to inspect.
 * @deprecated Please use `lookupNetwork` and pass a network client ID
 * instead. This method will be removed in a future major version.
 */
export type NetworkControllerLookupNetworkByClientIdAction = {
  type: `NetworkController:lookupNetworkByClientId`;
  handler: NetworkController['lookupNetworkByClientId'];
};

/**
 * Convenience method to update provider network type settings.
 *
 * @param type - Human readable network name.
 * @deprecated This has been replaced by `setActiveNetwork`, and will be
 * removed in a future release
 */
export type NetworkControllerSetProviderTypeAction = {
  type: `NetworkController:setProviderType`;
  handler: NetworkController['setProviderType'];
};

/**
 * Changes the selected network.
 *
 * @param networkClientId - The ID of a network client that will be used to
 * make requests.
 * @param options - Options for this method.
 * @param options.updateState - Allows for updating state.
 * @throws if no network client is associated with the given
 * network client ID.
 */
export type NetworkControllerSetActiveNetworkAction = {
  type: `NetworkController:setActiveNetwork`;
  handler: NetworkController['setActiveNetwork'];
};

/**
 * Determines whether the network supports EIP-1559 by checking whether the
 * latest block has a `baseFeePerGas` property, then updates state
 * appropriately.
 *
 * @param networkClientId - The networkClientId to fetch the correct provider against which to check 1559 compatibility.
 * @returns A promise that resolves to true if the network supports EIP-1559
 * , false otherwise, or `undefined` if unable to determine the compatibility.
 */
export type NetworkControllerGetEIP1559CompatibilityAction = {
  type: `NetworkController:getEIP1559Compatibility`;
  handler: NetworkController['getEIP1559Compatibility'];
};

export type NetworkControllerGet1559CompatibilityWithNetworkClientIdAction = {
  type: `NetworkController:get1559CompatibilityWithNetworkClientId`;
  handler: NetworkController['get1559CompatibilityWithNetworkClientId'];
};

/**
 * Ensures that the provider and block tracker proxies are pointed to the
 * currently selected network and refreshes the metadata for the
 */
export type NetworkControllerResetConnectionAction = {
  type: `NetworkController:resetConnection`;
  handler: NetworkController['resetConnection'];
};

/**
 * Returns the network configuration that has been filed under the given chain
 * ID.
 *
 * @param chainId - The chain ID to use as a key.
 * @returns The network configuration if one exists, or undefined.
 */
export type NetworkControllerGetNetworkConfigurationByChainIdAction = {
  type: `NetworkController:getNetworkConfigurationByChainId`;
  handler: NetworkController['getNetworkConfigurationByChainId'];
};

/**
 * Returns the network configuration that contains an RPC endpoint with the
 * given network client ID.
 *
 * @param networkClientId - The network client ID to use as a key.
 * @returns The network configuration if one exists, or undefined.
 */
export type NetworkControllerGetNetworkConfigurationByNetworkClientIdAction = {
  type: `NetworkController:getNetworkConfigurationByNetworkClientId`;
  handler: NetworkController['getNetworkConfigurationByNetworkClientId'];
};

/**
 * Creates and registers network clients for the collection of Infura and
 * custom RPC endpoints that can be used to make requests for a particular
 * chain, storing the given configuration object in state for later reference.
 *
 * @param fields - The object that describes the new network/chain and lists
 * the RPC endpoints which front that chain.
 * @returns The newly added network configuration.
 * @throws if any part of `fields` would produce invalid state.
 * @see {@link NetworkConfiguration}
 */
export type NetworkControllerAddNetworkAction = {
  type: `NetworkController:addNetwork`;
  handler: NetworkController['addNetwork'];
};

/**
 * Updates the configuration for a previously stored network filed under the
 * given chain ID, creating + registering new network clients to represent RPC
 * endpoints that have been added and destroying + unregistering existing
 * network clients for RPC endpoints that have been removed.
 *
 * Note that if `chainId` is changed, then all network clients associated with
 * that chain will be removed and re-added, even if none of the RPC endpoints
 * have changed.
 *
 * @param chainId - The chain ID associated with an existing network.
 * @param fields - The object that describes the updates to the network/chain,
 * including the new set of RPC endpoints which should front that chain.
 * @param options - Options to provide.
 * @param options.replacementSelectedRpcEndpointIndex - Usually you cannot
 * remove an RPC endpoint that is being represented by the currently selected
 * network client. This option allows you to specify another RPC endpoint
 * (either an existing one or a new one) that should be used to select a new
 * network instead.
 * @returns The updated network configuration.
 * @throws if `chainId` does not refer to an existing network configuration,
 * if any part of `fields` would produce invalid state, etc.
 * @see {@link NetworkConfiguration}
 */
export type NetworkControllerUpdateNetworkAction = {
  type: `NetworkController:updateNetwork`;
  handler: NetworkController['updateNetwork'];
};

/**
 * Destroys and unregisters the network identified by the given chain ID, also
 * removing the associated network configuration from state.
 *
 * @param chainId - The chain ID associated with an existing network.
 * @throws if `chainId` does not refer to an existing network configuration,
 * or if the currently selected network is being removed.
 * @see {@link NetworkConfiguration}
 */
export type NetworkControllerRemoveNetworkAction = {
  type: `NetworkController:removeNetwork`;
  handler: NetworkController['removeNetwork'];
};

/**
 * Assuming that the network has been previously switched, switches to this
 * new network.
 *
 * If the network has not been previously switched, this method is equivalent
 * to {@link resetConnection}.
 */
export type NetworkControllerRollbackToPreviousProviderAction = {
  type: `NetworkController:rollbackToPreviousProvider`;
  handler: NetworkController['rollbackToPreviousProvider'];
};

/**
 * Merges the given backup data into controller state.
 *
 * @param backup - The data that has been backed up.
 * @param backup.networkConfigurationsByChainId - Network configurations,
 * keyed by chain ID.
 */
export type NetworkControllerLoadBackupAction = {
  type: `NetworkController:loadBackup`;
  handler: NetworkController['loadBackup'];
};

/**
 * Searches for the default RPC endpoint configured for the given chain and
 * returns its network client ID. This can then be passed to
 * {@link getNetworkClientById} to retrieve the network client.
 *
 * @param chainId - Chain ID to search for.
 * @returns The ID of the network client created for the chain's default RPC
 * endpoint.
 */
export type NetworkControllerFindNetworkClientIdByChainIdAction = {
  type: `NetworkController:findNetworkClientIdByChainId`;
  handler: NetworkController['findNetworkClientIdByChainId'];
};

/**
 * Union of all NetworkController action types.
 */
export type NetworkControllerMethodActions =
  | NetworkControllerGetEthQueryAction
  | NetworkControllerEnableRpcFailoverAction
  | NetworkControllerDisableRpcFailoverAction
  | NetworkControllerGetProviderAndBlockTrackerAction
  | NetworkControllerGetSelectedNetworkClientAction
  | NetworkControllerGetSelectedChainIdAction
  | NetworkControllerGetNetworkClientRegistryAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerInitializeProviderAction
  | NetworkControllerLookupNetworkAction
  | NetworkControllerLookupNetworkByClientIdAction
  | NetworkControllerSetProviderTypeAction
  | NetworkControllerSetActiveNetworkAction
  | NetworkControllerGetEIP1559CompatibilityAction
  | NetworkControllerGet1559CompatibilityWithNetworkClientIdAction
  | NetworkControllerResetConnectionAction
  | NetworkControllerGetNetworkConfigurationByChainIdAction
  | NetworkControllerGetNetworkConfigurationByNetworkClientIdAction
  | NetworkControllerAddNetworkAction
  | NetworkControllerUpdateNetworkAction
  | NetworkControllerRemoveNetworkAction
  | NetworkControllerRollbackToPreviousProviderAction
  | NetworkControllerLoadBackupAction
  | NetworkControllerFindNetworkClientIdByChainIdAction;
