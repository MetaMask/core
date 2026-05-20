import type { InstanceSpecificOptions } from '../types';
import type { DefaultActions, DefaultEvents, RootMessenger } from './defaults';

export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : undefined;

type InstanceName<Instance> = Instance extends {
  name: infer Name extends string;
}
  ? Name
  : string;

type InstanceOptions<Instance> =
  InstanceName<Instance> extends keyof InstanceSpecificOptions
    ? NonNullable<InstanceSpecificOptions[InstanceName<Instance>]>
    : unknown;

export type InitFunctionArguments<Instance, InstanceMessenger> = {
  state: InstanceState<Instance> | undefined;
  messenger: InstanceMessenger;
  options: InstanceOptions<Instance>;
};

export type InitializationConfiguration<Instance, InstanceMessenger> = {
  name: InstanceName<Instance>;
  init(args: InitFunctionArguments<Instance, InstanceMessenger>): Instance;
  getMessenger(
    parent: RootMessenger<DefaultActions, DefaultEvents>,
  ): InstanceMessenger;
};
