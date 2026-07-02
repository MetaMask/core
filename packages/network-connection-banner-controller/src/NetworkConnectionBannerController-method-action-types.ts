/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkConnectionBannerController } from './NetworkConnectionBannerController';

/**
 * Starts evaluating network connection state.
 *
 * This method should be called after the upstream network, network
 * enablement, and connectivity controllers have been initialized.
 */
export type NetworkConnectionBannerControllerInitAction = {
  type: `NetworkConnectionBannerController:init`;
  handler: NetworkConnectionBannerController['init'];
};

/**
 * Clears the banner state such that the banner will be hidden.
 */
export type NetworkConnectionBannerControllerDismissBannerAction = {
  type: `NetworkConnectionBannerController:dismissBanner`;
  handler: NetworkConnectionBannerController['dismissBanner'];
};

/**
 * Switches the chain's default RPC endpoint to its first Infura endpoint,
 * causing the banner to clear once the network becomes available again.
 *
 * @param args - The arguments to this action.
 * @param args.chainId - The chain whose default RPC should be switched.
 * @throws If the chain configuration cannot be found, or if it has no
 * Infura endpoint to switch to, or if the default is already Infura.
 */
export type NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcAction = {
  type: `NetworkConnectionBannerController:switchToDefaultInfuraRpc`;
  handler: NetworkConnectionBannerController['switchToDefaultInfuraRpc'];
};

/**
 * Union of all NetworkConnectionBannerController action types.
 */
export type NetworkConnectionBannerControllerMethodActions =
  | NetworkConnectionBannerControllerInitAction
  | NetworkConnectionBannerControllerDismissBannerAction
  | NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcAction;
