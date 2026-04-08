import { Json } from '@metamask/utils';

import * as defaultConfigurations from './instances';
import { InitializationConfiguration } from './types';
import { RootMessenger, WalletOptions } from '../types';

export type InitializeArgs = {
  state: Record<string, Json>;
  messenger: RootMessenger;
  initializationConfigurations?: InitializationConfiguration<
    unknown,
    unknown
  >[];
  options: WalletOptions;
};

export function initialize({
  state,
  messenger,
  initializationConfigurations = [],
  options,
}: InitializeArgs) {
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

    const instanceMessenger = config.messenger(messenger);

    const { instance } = config.init({
      state: instanceState,
      messenger: instanceMessenger,
      options,
    });

    instances[name] = instance;
  }

  return instances;
}
