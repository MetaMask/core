/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SelectedNetworkController } from './SelectedNetworkController';

export type SelectedNetworkControllerSetNetworkClientIdForDomainAction = {
  type: `SelectedNetworkController:setNetworkClientIdForDomain`;
  handler: SelectedNetworkController['setNetworkClientIdForDomain'];
};

export type SelectedNetworkControllerGetNetworkClientIdForDomainAction = {
  type: `SelectedNetworkController:getNetworkClientIdForDomain`;
  handler: SelectedNetworkController['getNetworkClientIdForDomain'];
};

/**
 * Accesses the provider and block tracker for the currently selected network.
 *
 * @param domain - the domain for the provider
 * @returns The proxy and block tracker proxies.
 */
export type SelectedNetworkControllerGetProviderAndBlockTrackerAction = {
  type: `SelectedNetworkController:getProviderAndBlockTracker`;
  handler: SelectedNetworkController['getProviderAndBlockTracker'];
};

/**
 * Union of all SelectedNetworkController action types.
 */
export type SelectedNetworkControllerMethodActions =
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerGetProviderAndBlockTrackerAction;
