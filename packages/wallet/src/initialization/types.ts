import { RootMessenger, WalletOptions } from '../types';

export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : null;

export type InitFunctionArguments<Instance, InstanceMessenger> = {
  state: InstanceState<Instance>;
  messenger: InstanceMessenger;
  options: WalletOptions;
};

export type InitFunction<Instance, InstanceMessenger> = (
  args: InitFunctionArguments<Instance, InstanceMessenger>,
) => { instance: Instance };

export type MessengerInitFunction<NarrowedMessenger> = (
  parent: RootMessenger,
) => NarrowedMessenger;

export type InitializationConfiguration<Instance, InstanceMessenger> = {
  name: string;
  init: InitFunction<Instance, InstanceMessenger>;
  messenger: MessengerInitFunction<InstanceMessenger>;
};
