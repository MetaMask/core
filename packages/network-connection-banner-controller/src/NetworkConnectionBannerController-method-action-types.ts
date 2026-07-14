/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkConnectionBannerController } from './NetworkConnectionBannerController';

/**
 * Clears the banner state such that the banner will be hidden.
 */
export type NetworkConnectionBannerControllerDismissBannerAction = {
  type: `NetworkConnectionBannerController:dismissBanner`;
  handler: NetworkConnectionBannerController['dismissBanner'];
};

/**
 * Switches the chain's default RPC endpoint to its Infura endpoint and
 * makes it the active network, causing the banner to clear once the
 * network becomes available again.
 *
 * @param chainId - The chain whose default RPC endpoint should be switched.
 * @throws If the chain configuration cannot be found, or if it has no
 * Infura endpoint to switch to, or if the default is already Infura.
 */
export type NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcEndpointAction =
  {
    type: `NetworkConnectionBannerController:switchToDefaultInfuraRpcEndpoint`;
    handler: NetworkConnectionBannerController['switchToDefaultInfuraRpcEndpoint'];
  };

/**
 * Union of all NetworkConnectionBannerController action types.
 */
export type NetworkConnectionBannerControllerMethodActions =
  | NetworkConnectionBannerControllerDismissBannerAction
  | NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcEndpointAction;
