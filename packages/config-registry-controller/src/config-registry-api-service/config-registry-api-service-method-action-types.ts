import type { ConfigRegistryApiService } from './config-registry-api-service';

/**
 * Method action for the {@link ConfigRegistryApiService#fetchConfig} method.
 */
export type ConfigRegistryApiServiceFetchConfigAction = {
  type: 'ConfigRegistryApiService:fetchConfig';
  handler: ConfigRegistryApiService['fetchConfig'];
};

/**
 * Union type representing all method actions that
 * {@link ConfigRegistryApiService} registers on its messenger.
 */
export type ConfigRegistryApiServiceMethodActions =
  ConfigRegistryApiServiceFetchConfigAction;
