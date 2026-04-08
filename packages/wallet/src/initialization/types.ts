import { RootMessenger, WalletOptions } from '../types';

export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : unknown;

export type InitFunctionArguments<Instance, InstanceMessenger> = {
  state: InstanceState<Instance>;
  messenger: InstanceMessenger;
  options: WalletOptions;
};

// Method syntax provides bivariant parameter checking, which is needed to
// collect heterogeneous InitializationConfiguration values in a single array.
export type InitializationConfiguration<Instance, InstanceMessenger> = {
  name: string;
  init(args: InitFunctionArguments<Instance, InstanceMessenger>): {
    instance: Instance;
  };
  messenger(parent: RootMessenger): InstanceMessenger;
};
