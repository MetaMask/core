import type {
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import * as defaultConfigurations from './instances';
import type { InitializationConfiguration, InstanceState } from './types';

export { defaultConfigurations };

type ExtractInstance<Config> =
  Config extends InitializationConfiguration<infer Instance, infer _>
    ? Instance
    : never;

type ExtractInstanceMessenger<Config> =
  Config extends InitializationConfiguration<infer _, infer InferredMessenger>
    ? InferredMessenger
    : never;

type ExtractName<Config> =
  ExtractInstance<Config> extends { name: infer Name extends string }
    ? Name
    : never;

type Configs = typeof defaultConfigurations;

type AllMessengers = ExtractInstanceMessenger<Configs[keyof Configs]>;

export type DefaultInstances = {
  [Key in keyof Configs as ExtractName<Configs[Key]>]: ExtractInstance<
    Configs[Key]
  >;
};

export type DefaultActions = MessengerActions<AllMessengers>;

export type DefaultEvents = MessengerEvents<AllMessengers>;

export type RootMessenger<
  AllowedActions extends DefaultActions = DefaultActions,
  AllowedEvents extends DefaultEvents = DefaultEvents,
> = Messenger<'Root', AllowedActions, AllowedEvents>;

export type DefaultState = {
  [Key in keyof DefaultInstances]: InstanceState<DefaultInstances[Key]>;
};
