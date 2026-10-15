import type {
  StateConstraint,
  ValidatableController,
} from '@metamask/base-controller';

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

/**
 * The class of a stateful instance, which may define a static `struct`
 * describing its state.
 *
 * Every stateful instance's initialization configuration has a reference to
 * its class, but only some classes define a `struct`. When one is present,
 * `initialize` uses it to validate the instance's state before passing the
 * state to `init`.
 */
export type InstanceReference<Instance, State extends StateConstraint> = (new (
  ...args: never[]
) => Instance) & {
  struct?: ValidatableController<Instance, State>['struct'];
};

export type InitializationConfiguration<Instance, InstanceMessenger> = {
  name: InstanceName<Instance>;
  init(args: InitFunctionArguments<Instance, InstanceMessenger>): Instance;
  getMessenger(
    parent: RootMessenger<DefaultActions, DefaultEvents>,
  ): InstanceMessenger;
} & (InstanceState<Instance> extends StateConstraint
  ? {
      reference: InstanceReference<Instance, InstanceState<Instance>>;
    }
  : { reference?: never });

/**
 * An initialization configuration for an instance of any kind.
 *
 * `InitializationConfiguration` requires a `reference` for instances that
 * have state and forbids one for instances that do not, so no single
 * instantiation of it describes both kinds. This union covers both, so that
 * lists mixing them, such as the configurations given to the wallet, can be
 * typed without resorting to `any`.
 */
export type AnyInitializationConfiguration =
  | InitializationConfiguration<unknown, unknown>
  | InitializationConfiguration<{ state: StateConstraint }, unknown>;
