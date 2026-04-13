import type {
  ActionConstraint,
  EventConstraint,
  ExtractActionParameters,
  ExtractActionResponse,
  Messenger,
  MessengerActions,
} from '@metamask/messenger';

import type { WalletOptions } from '../types';
import type { RootMessenger } from './defaults';

export type InstanceState<Instance> = Instance extends { state: unknown }
  ? Instance['state']
  : unknown;

export type InitFunctionArguments<Instance, InstanceMessenger> = {
  state: InstanceState<Instance>;
  messenger: InstanceMessenger;
  options: WalletOptions;
};

/**
 * Typed wrapper around `messenger.call.bind(messenger, actionType)`.
 *
 * TypeScript's `Function.prototype.bind` loses generic inference on
 * `Messenger.call`, so the bound function's parameters and return type
 * collapse to a union of every action. This helper restores the correct
 * per-action types via an explicit cast that is safe because `bind`
 * preserves the runtime behavior exactly.
 *
 * @param messenger - The messenger instance.
 * @param actionType - The action to bind.
 * @returns A function that calls the action with the correct types.
 */
export function bindMessengerAction<
  Msgr extends Messenger<string, ActionConstraint, EventConstraint>,
  ActionType extends MessengerActions<Msgr>['type'],
>(
  messenger: Msgr,
  actionType: ActionType,
): (
  ...args: ExtractActionParameters<MessengerActions<Msgr>, ActionType>
) => ExtractActionResponse<MessengerActions<Msgr>, ActionType> {
  return messenger.call.bind(messenger, actionType) as (
    ...args: ExtractActionParameters<MessengerActions<Msgr>, ActionType>
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
