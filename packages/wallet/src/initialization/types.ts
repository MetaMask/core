import type { InstanceSpecificOptions } from '../types.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from './defaults.js';

/**
 * Utility type for inferring the state of an instance.
 */
export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : undefined;

/**
 * Utility type for inferring the name of an instance.
 */
type InstanceName<Instance> = Instance extends {
  name: infer Name extends string;
}
  ? Name
  : string;

/**
 * Utility type for lower-casing the first character of an instance name, required for camel-casing.
 */
type LowerCaseFirstLetter<Name extends string> =
  Name extends `${infer Character1}${infer Rest}`
    ? `${Lowercase<Character1>}${Rest}`
    : Lowercase<Name>;

type CamelCaseInstanceName<Instance> = LowerCaseFirstLetter<
  InstanceName<Instance>
>;

/**
 * Utility type for narrowing the InstanceSpecificOptions to just the options required for the instance.
 */
type InstanceOptions<Instance> =
  CamelCaseInstanceName<Instance> extends keyof InstanceSpecificOptions
    ? NonNullable<InstanceSpecificOptions[CamelCaseInstanceName<Instance>]>
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
