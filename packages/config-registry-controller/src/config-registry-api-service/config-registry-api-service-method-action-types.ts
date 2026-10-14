/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ConfigRegistryApiService } from './config-registry-api-service.js';

export type ConfigRegistryApiServiceFetchConfigAction = {
  type: `ConfigRegistryApiService:fetchConfig`;
  handler: ConfigRegistryApiService['fetchConfig'];
};

export type ConfigRegistryApiServiceFetchEventsConfigAction = {
  type: `ConfigRegistryApiService:fetchEventsConfig`;
  handler: ConfigRegistryApiService['fetchEventsConfig'];
};

/**
 * Union of all ConfigRegistryApiService action types.
 */
export type ConfigRegistryApiServiceMethodActions =
  | ConfigRegistryApiServiceFetchConfigAction
  | ConfigRegistryApiServiceFetchEventsConfigAction;
