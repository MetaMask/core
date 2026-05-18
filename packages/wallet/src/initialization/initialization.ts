import { Json } from '@metamask/utils';

import { WalletOptions } from '../types';
import type { DefaultInstances } from './defaults';
import { defaultConfigurations, RootMessenger } from './defaults';
import type { InitializationConfiguration } from './types';

export type InitializeArgs = {
  state: Record<string, Json>;
  messenger: RootMessenger;
  options: WalletOptions;
};

export function initialize({
  state,
  messenger,
  options,
}: InitializeArgs): DefaultInstances {
  const instances: Record<string, unknown> = {};

  for (const config of Object.values(defaultConfigurations) as InitializationConfiguration<unknown, unknown>[]) {
    const { name } = config;

    const instanceState = state[name];

    const instanceMessenger = config.messenger(messenger);

    const { instance } = config.init({
      state: instanceState,
      messenger: instanceMessenger,
      options,
    });

    instances[name] = instance as Record<string, unknown>;
    options.logger?.info(`[wallet] ${name}: initialized`);
  }

  return instances as DefaultInstances;
}
