import { validateControllerState } from '@metamask/base-controller';
import type {
  StateConstraint,
  ValidatableController,
} from '@metamask/base-controller';

import type { InstanceSpecificOptions, WalletOptions } from '../types.js';
import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
} from './defaults.js';
import { defaultConfigurations, RootMessenger } from './defaults.js';

type InitializeOptions = WalletOptions & {
  messenger: RootMessenger<DefaultActions, DefaultEvents>;
};

/**
 * Check whether a instance configuration reference defines a state `struct`.
 *
 * @param reference - The `reference` of an initialization configuration.
 * @returns Whether the reference has the metadata required to validate state.
 */
function isInstanceValidatable(
  reference:
    | Partial<ValidatableController<unknown, StateConstraint>>
    | undefined,
): reference is ValidatableController<unknown, StateConstraint> {
  return reference?.struct !== undefined;
}

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
    ),
  );

  const instances: Record<string, unknown> = {};

  for (const config of configurationEntries) {
    const { name, reference } = config;

    const rawState = state[name];

    const instanceState =
      rawState && isInstanceValidatable(reference)
        ? validateControllerState(
            name,
            reference,
            rawState,
            'lenient',
            messenger.captureException,
          )
        : rawState;

    const instanceMessenger = config.getMessenger(messenger);

    const camelCaseName =
      `${name.charAt(0).toLowerCase()}${name.slice(1)}` as keyof InstanceSpecificOptions;

    const instance: unknown = config.init({
      // TODO: Consider whether this can be improved
      state: instanceState as never,
      messenger: instanceMessenger,
      options: instanceOptions?.[camelCaseName] ?? {},
    });

    instances[name] = instance;
  }

  return instances as DefaultInstances;
}
