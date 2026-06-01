import type {
  ActionConstraint,
  EventConstraint,
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import * as defaultConfigurations from './instances';
import type { InitializationConfiguration, InstanceState } from './types';

export { defaultConfigurations };

/**
 * Utility type for inferring and extracting an instance type from an initialization configuration.
 */
type ExtractInstance<Config> =
  Config extends InitializationConfiguration<
    infer Instance,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    infer _Messenger
  >
    ? Instance
    : never;

/**
 * Utility type for inferring and extracting an instance messenger type from an initialization configuration.
 */
type ExtractInstanceMessenger<Config> =
  Config extends InitializationConfiguration<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    infer _Instance,
    infer InferredMessenger
  >
    ? InferredMessenger
    : never;

/**
 * Utility type for inferring and extracting the name of an instance from an initialization configuration.
 */
type ExtractName<Config> =
  ExtractInstance<Config> extends { name: infer Name extends string }
    ? Name
    : never;

type DefaultConfigs = typeof defaultConfigurations;

type AllDefaultMessengers = ExtractInstanceMessenger<
  DefaultConfigs[keyof DefaultConfigs]
>;

export type DefaultInstances = {
  [Key in keyof DefaultConfigs as ExtractName<
    DefaultConfigs[Key]
  >]: ExtractInstance<DefaultConfigs[Key]>;
};

export type DefaultActions = MessengerActions<AllDefaultMessengers>;

export type DefaultEvents = MessengerEvents<AllDefaultMessengers>;

export type RootMessenger<
  AllowedActions extends ActionConstraint,
  AllowedEvents extends EventConstraint,
> = Messenger<'Root', AllowedActions, AllowedEvents>;

export type DefaultState = {
  [Key in keyof DefaultInstances]: InstanceState<DefaultInstances[Key]>;
};
