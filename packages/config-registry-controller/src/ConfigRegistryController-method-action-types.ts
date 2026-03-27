/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ConfigRegistryController } from './ConfigRegistryController';

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
  | ConfigRegistryControllerStopPollingAction
  | ConfigRegistryControllerStartPollingAction;
