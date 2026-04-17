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

type ExtractInstance<Config> =
  Config extends InitializationConfiguration<infer Instance, unknown>
    ? Instance
    : never;

type ExtractInstanceMessenger<Config> =
  Config extends InitializationConfiguration<unknown, infer InferredMessenger>
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

export type WalletDestroyedEvent = {
  type: 'Root:walletDestroyed';
  payload: [];
};

export type DefaultEvents =
  | MessengerEvents<AllMessengers>
  | WalletDestroyedEvent;

export type RootMessenger<
  AllowedActions extends ActionConstraint = ActionConstraint,
  AllowedEvents extends EventConstraint = EventConstraint,
> = Messenger<'Root', AllowedActions, AllowedEvents>;

export type DefaultState = {
  [Key in keyof DefaultInstances]: InstanceState<DefaultInstances[Key]>;
};
