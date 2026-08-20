import type {
  ConfigRegistryApiEnv,
  ConfigRegistryApiService,
} from '@metamask/config-registry-controller';

type ConfigRegistryApiServiceOptions = ConstructorParameters<
  typeof ConfigRegistryApiService
>[0];

/**
 * Per-instance options for the wallet's `ConfigRegistryApiService`.
 */
export type ConfigRegistryApiServiceInstanceOptions = {
  env: ConfigRegistryApiEnv;
  fetch?: ConfigRegistryApiServiceOptions['fetch'];
  policyOptions?: ConfigRegistryApiServiceOptions['policyOptions'];
};
