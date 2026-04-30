import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type {
  ActionConstraint,
  EventConstraint,
  Messenger,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { SubjectType } from '@metamask/permission-controller';
import { Duplex } from 'readable-stream';

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

export type WalletCreateProviderRpcAction = {
  type: 'Wallet:createProviderRpc';
  handler: (options: {
    origin: string;
    subjectType: SubjectType;
    stream: Duplex;
  }) => { engine: JsonRpcEngine };
};

export type DefaultActions =
  | MessengerActions<AllMessengers>
  | WalletCreateProviderRpcAction;

export type WalletDestroyedEvent = {
  type: 'Wallet:destroyed';
  payload: [];
};

export type DefaultEvents =
  | MessengerEvents<AllMessengers>
  | WalletDestroyedEvent;

export type RootMessenger<
  AllowedActions extends ActionConstraint = ActionConstraint,
  AllowedEvents extends EventConstraint = EventConstraint,
> = Messenger<'Wallet', AllowedActions, AllowedEvents>;

export type DefaultState = {
  [Key in keyof DefaultInstances]: InstanceState<DefaultInstances[Key]>;
};
