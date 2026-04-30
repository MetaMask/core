import { Json } from '@metamask/utils';

import { createProviderRpc } from '../json-rpc/createProviderRpc';
import { WalletOptions } from '../types';
import type {
  DefaultActions,
  DefaultEvents,
  DefaultInstances,
} from './defaults';
import { defaultConfigurations, RootMessenger } from './defaults';
import { InitializationConfiguration } from './types';

export type InitializeArgs = {
  state: Record<string, Json>;
  messenger: RootMessenger<DefaultActions, DefaultEvents>;
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
}: InitializeArgs): DefaultInstances {
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

  const castInstances = instances as DefaultInstances;

  Object.values(castInstances).forEach((instance) => {
    if ('init' in instance) {
      const potentialPromise = instance.init();
      if (potentialPromise instanceof Promise) {
        potentialPromise.catch(console.error);
      }
    }
  });

  return castInstances;
}
