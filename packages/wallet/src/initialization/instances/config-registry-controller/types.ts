import type { ConfigRegistryController } from '@metamask/config-registry-controller';

type ConfigRegistryControllerOptions = ConstructorParameters<
  typeof ConfigRegistryController
>[0];

/**
 * Per-instance options for the wallet's `ConfigRegistryController`.
 */
export type ConfigRegistryControllerInstanceOptions = {
  pollingInterval?: ConfigRegistryControllerOptions['pollingInterval'];
  fallbackConfig?: ConfigRegistryControllerOptions['fallbackConfig'];
};
