/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkConnectionBannerController } from './NetworkConnectionBannerController';

/**
 * Clears the banner state regardless of the current rule outcome. The next
 * subscription-driven evaluation will re-show the banner if the conditions
 * still hold.
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
  | NetworkConnectionBannerControllerDismissBannerAction
  | NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcAction;
