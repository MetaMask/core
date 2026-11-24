/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MultichainNetworkController } from './MultichainNetworkController.js';

/**
 * Sets the active network.
 *
 * @param id - The non-EVM Caip chain ID or EVM client ID of the network to set active.
 * @returns - A promise that resolves when the network is set active.
 */
export type MultichainNetworkControllerSetActiveNetworkAction = {
  type: `MultichainNetworkController:setActiveNetwork`;
  handler: MultichainNetworkController['setActiveNetwork'];
};

/**
 * Returns the active networks for the available EVM addresses (non-EVM networks will be supported in the future).
 * Fetches the data from the API and caches it in state.
 *
 * @returns A promise that resolves to the active networks for the available addresses
 */
export type MultichainNetworkControllerGetNetworksWithTransactionActivityByAccountsAction =
  {
    type: `MultichainNetworkController:getNetworksWithTransactionActivityByAccounts`;
    handler: MultichainNetworkController['getNetworksWithTransactionActivityByAccounts'];
  };

/**
 * Removes a network from the list of networks.
 * It only supports EVM networks.
 *
 * @param chainId - The chain ID of the network to remove.
 * @returns - A promise that resolves when the network is removed.
 */
export type MultichainNetworkControllerRemoveNetworkAction = {
  type: `MultichainNetworkController:removeNetwork`;
  handler: MultichainNetworkController['removeNetwork'];
};

/**
 * Union of all MultichainNetworkController action types.
 */
export type MultichainNetworkControllerMethodActions =
  | MultichainNetworkControllerSetActiveNetworkAction
  | MultichainNetworkControllerGetNetworksWithTransactionActivityByAccountsAction
  | MultichainNetworkControllerRemoveNetworkAction;
