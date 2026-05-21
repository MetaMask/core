import type { InstanceSpecificOptions, WalletOptions } from '../types';
import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
} from './defaults';
import { defaultConfigurations, RootMessenger } from './defaults';

export type InitializeArgs = {
  options: WalletOptions;
  messenger: RootMessenger<DefaultActions, DefaultEvents>;
};

export function initialize({
  options,
  messenger,
}: InitializeArgs): DefaultInstances {
  const { state = {}, initializationConfigurations = [] } = options;

  const overriddenConfiguration = initializationConfigurations.map(
    (config) => config.name,
  );

  const configurationEntries = initializationConfigurations.concat(
    Object.values(defaultConfigurations).filter(
      (config) => !overriddenConfiguration.includes(config.name),
    ),
  );

  const instances: Record<string, unknown> = {};

  for (const config of configurationEntries) {
    const { name } = config;

    const instanceState = state[name];

    const instanceMessenger = config.getMessenger(messenger);

    const camelCaseName =
      `${name.charAt(0).toLowerCase()}${name.slice(1)}` as keyof InstanceSpecificOptions;

    const instance = config.init({
      // TODO: Consider whether this can be improved
      state: instanceState as never,
      messenger: instanceMessenger,
      options: options.instanceOptions?.[camelCaseName] ?? {},
    });

    instances[name] = instance as Record<string, unknown>;
  }

  return instances as DefaultInstances;
}
