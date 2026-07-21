import type { InstanceSpecificOptions, WalletOptions } from '../types';
import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
} from './defaults';
import { defaultConfigurations, RootMessenger } from './defaults';
import { InitializationConfiguration } from './types';

type InitializeOptions = WalletOptions & {
  messenger: RootMessenger<DefaultActions, DefaultEvents>;
};

/**
 * Initialize all instances based on th default configurations and any additional configurations specified in `options`.
 *
 * @param options - The wallet options.
 * @returns A map containing the instances.
 */
export function initialize(options: InitializeOptions): DefaultInstances {
  const {
    messenger,
    state = {},
    initializationConfigurations = [],
    instanceOptions,
  } = options;

  const overriddenConfiguration = initializationConfigurations.map(
    (config) => config.name,
  );

  const configurationEntries = initializationConfigurations.concat(
    Object.values(defaultConfigurations).filter(
      (config) => !overriddenConfiguration.includes(config.name),
    ) as InitializationConfiguration<unknown, unknown>[],
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
      options: instanceOptions?.[camelCaseName] ?? {},
    });

    instances[name] = instance;
  }

  return instances as DefaultInstances;
}
