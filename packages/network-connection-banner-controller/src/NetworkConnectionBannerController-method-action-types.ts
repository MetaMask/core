/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkConnectionBannerController } from './NetworkConnectionBannerController';

/**
 * Starts evaluating network connection state. Call this when the wallet
 * UI that consumes the banner becomes active (typically when the wallet
 * is unlocked and the home surface mounts) so timers do not run while
 * the user is not looking at the wallet. Idempotent.
 */
export type NetworkConnectionBannerControllerStartAction = {
  type: `NetworkConnectionBannerController:start`;
  handler: NetworkConnectionBannerController['start'];
};

/**
 * Stops evaluating network connection state. Clears any pending banner
 * timers and resets state to `available`. Call this when the UI
 * consuming the banner is no longer active. Idempotent.
 */
export type NetworkConnectionBannerControllerStopAction = {
  type: `NetworkConnectionBannerController:stop`;
  handler: NetworkConnectionBannerController['stop'];
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
  | NetworkConnectionBannerControllerStartAction
  | NetworkConnectionBannerControllerStopAction
  | NetworkConnectionBannerControllerDismissBannerAction
  | NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcAction;
