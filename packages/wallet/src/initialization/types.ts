import type {
  ActionConstraint,
  EventConstraint,
  ExtractActionParameters,
  ExtractActionResponse,
  Messenger,
  MessengerActions,
} from '@metamask/messenger';

import { createProviderRpc } from '../json-rpc/createProviderRpc';
import type { WalletOptions } from '../types';
import type { RootMessenger } from './defaults';

export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : unknown;

export type InitFunctionArguments<Instance, InstanceMessenger> = {
  state: InstanceState<Instance>;
  messenger: InstanceMessenger;
  options: WalletOptions;
  createProviderRpc: typeof createProviderRpc;
};

/**
 * Typed wrapper around `messenger.call.bind(messenger, actionType, ...args)`.
 *
 * TypeScript's `Function.prototype.bind` loses generic inference on
 * `Messenger.call`, so the bound function's parameters and return type
 * collapse to a union of every action. This helper restores the correct
 * per-action types and additionally accepts pre-bound leading arguments,
 * narrowing the returned function's parameters to the remaining tail.
 *
 * @param messenger - The messenger instance.
 * @param actionType - The action to bind.
 * @param bound - Optional leading arguments to pre-bind to the action.
 * @returns A function that calls the action with the correct types.
 */
export function bindMessengerAction<
  Msgr extends Messenger<string, ActionConstraint, EventConstraint>,
  ActionType extends MessengerActions<Msgr>['type'],
  const Bound extends unknown[] = [],
>(
  messenger: Msgr,
  actionType: ActionType,
  ...bound: Bound
): (
  ...rest: ExtractActionParameters<MessengerActions<Msgr>, ActionType> extends [
    ...Bound,
    ...infer Rest,
  ]
    ? Rest
    : never
) => ExtractActionResponse<MessengerActions<Msgr>, ActionType> {
  // All of this is supported with messenger.call.bind, but the types won't work for that.
  return Function.prototype.bind.call(
    messenger.call,
    messenger,
    actionType,
    ...bound,
  ) as (
    ...rest: ExtractActionParameters<
      MessengerActions<Msgr>,
      ActionType
    > extends [...Bound, ...infer Rest]
      ? Rest
      : never
  ) => ExtractActionResponse<MessengerActions<Msgr>, ActionType>;
}

export type InitializationConfiguration<Instance, InstanceMessenger> = {
  name: string;
  // This is a method as opposed to function property in order to collect
  // heterogeneous InitializationConfiguration values in a single array.
  init(args: InitFunctionArguments<Instance, InstanceMessenger>): {
    instance: Instance;
  };
  messenger(parent: RootMessenger): InstanceMessenger;
};
