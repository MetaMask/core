import type { InstanceSpecificOptions, WalletOptions } from '../types.js';
import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
} from './defaults.js';
import { defaultConfigurations, RootMessenger } from './defaults.js';
import { InitializationConfiguration } from './types.js';

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

  const defaultConfigurationEntries = Object.values(
    defaultConfigurations,
  ) as InitializationConfiguration<unknown, unknown>[];

  // Resolving two configurations with the same name would mean silently
  // discarding one, so reject it instead of picking a winner.
  const seenNames = new Set<string>();
  for (const { name } of initializationConfigurations) {
    if (seenNames.has(name)) {
      throw new Error(`Duplicate initialization configuration name: ${name}`);
    }
    seenNames.add(name);
  }

  const defaultNames = new Set(
    defaultConfigurationEntries.map((config) => config.name),
  );
  const overridesByName = new Map(
    initializationConfigurations.map((config) => [config.name, config]),
  );

  const configurationEntries = [
    // A configuration that does not override a default is additive, and runs
    // before the defaults — a default may depend on an action it registers.
    ...initializationConfigurations.filter(
      (config) => !defaultNames.has(config.name),
    ),
    // An override takes its default's slot; see `instances/index.ts`.
    ...defaultConfigurationEntries.map(
      (config) => overridesByName.get(config.name) ?? config,
    ),
  ];

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
