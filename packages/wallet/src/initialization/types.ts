import type { WalletOptions } from '../types';
import type { RootMessenger } from './defaults';

export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : unknown;

export type InitFunctionArguments<Instance, InstanceMessenger> = {
  state: InstanceState<Instance>;
  messenger: InstanceMessenger;
  options: WalletOptions;
};

export type InitializationConfiguration<Instance, InstanceMessenger> = {
  name: string;
  // This is a method as opposed to function property in order to collect
  // heterogeneous InitializationConfiguration values in a single array.
  init(args: InitFunctionArguments<Instance, InstanceMessenger>): {
    instance: Instance;
  };
  messenger(parent: RootMessenger): InstanceMessenger;
};
