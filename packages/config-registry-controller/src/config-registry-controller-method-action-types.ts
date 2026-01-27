import type { ConfigRegistryController } from './config-registry-controller';

/**
 * Method action for the {@link ConfigRegistryController#updateConfigs} method.
 */
export type ConfigRegistryControllerUpdateConfigsAction = {
  type: 'ConfigRegistryController:updateConfigs';
  handler: ConfigRegistryController['updateConfigs'];
};

/**
 * Union type representing all method actions that
 * {@link ConfigRegistryController} registers on its messenger.
 */
export type ConfigRegistryControllerMethodActions =
  ConfigRegistryControllerUpdateConfigsAction;
