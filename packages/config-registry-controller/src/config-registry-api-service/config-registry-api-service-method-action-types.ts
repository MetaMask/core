import type { ConfigRegistryApiService } from './config-registry-api-service';

/**
 * Fetches the latest config from the config registry API.
 *
 * @param args - The arguments to the function.
 * @param args.options - Optional fetch options (e.g. etag for cache validation).
 */
export type ConfigRegistryApiServiceFetchConfigAction = {
  type: 'ConfigRegistryApiService:fetchConfig';
  handler: ConfigRegistryApiService['fetchConfig'];
};

/**
 * Union of all ConfigRegistryApiService action types.
 */
export type ConfigRegistryApiServiceMethodActions =
  ConfigRegistryApiServiceFetchConfigAction;
