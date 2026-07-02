/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { NetworkConnectionBannerController } from './NetworkConnectionBannerController';

/**
 * Look for a failed network, if any, and populate the initial state of the
 * banner. Reacts to upstream state changes from this point on.
 *
 * Call this when the wallet UI that consumes the banner becomes active
 * (typically when the wallet is unlocked and the home surface mounts) so
 * timers do not run while the user is not looking at the wallet. Should
 * be called after `NetworkController`, `NetworkEnablementController`, and
 * `ConnectivityController` have been initialized. Idempotent.
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
 * Switches the chain's default RPC endpoint to its Infura endpoint,
 * causing the banner to clear once the network becomes available again.
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
  | NetworkConnectionBannerControllerStartAction
  | NetworkConnectionBannerControllerStopAction
  | NetworkConnectionBannerControllerDismissBannerAction
  | NetworkConnectionBannerControllerSwitchToDefaultInfuraRpcEndpointAction;
