/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ConfigRegistryController } from './ConfigRegistryController.js';

/**
 * Get the network configuration for a given CAIP-2 chain ID.
 *
 * @param caip2ChainId - The CAIP-2 chain ID (e.g., "eip155:1").
 * @returns The network configuration if found, otherwise undefined.
 */
export type ConfigRegistryControllerGetNetworkConfigByCaip2ChainIdAction = {
  type: `ConfigRegistryController:getNetworkConfigByCaip2ChainId`;
  handler: ConfigRegistryController['getNetworkConfigByCaip2ChainId'];
};

/**
 * Stop all polling.
 */
export type ConfigRegistryControllerStopPollingAction = {
  type: `ConfigRegistryController:stopPolling`;
  handler: ConfigRegistryController['stopPolling'];
};

export type ConfigRegistryControllerStartPollingAction = {
  type: `ConfigRegistryController:startPolling`;
  handler: ConfigRegistryController['startPolling'];
};

/**
 * Union of all ConfigRegistryController action types.
 */
export type ConfigRegistryControllerMethodActions =
  | ConfigRegistryControllerGetNetworkConfigByCaip2ChainIdAction
  | ConfigRegistryControllerStopPollingAction
  | ConfigRegistryControllerStartPollingAction;
