import type {
  ActionConstraint,
  EventConstraint,
  MessengerActions,
} from '@metamask/messenger';
import { Messenger } from '@metamask/messenger';

/**
 * Create a child messenger scoped to a restricted-method permission
 * specification, with the spec's declared actions delegated from the root
 * messenger. Analogous to `selectHooks` for `methodHooks`, but for messenger
 * actions.
 *
 * Returns `undefined` when the spec declares no actions — there is nothing to
 * scope, and the builder can be invoked without a messenger.
 *
 * @param args - The arguments.
 * @param args.rootMessenger - The root messenger to delegate actions from.
 * @param args.namespace - The namespace for the scoped child messenger,
 * typically the spec's `targetName`.
 * @param args.actionNames - The action types the specification requires,
 * typically the spec's declared `actionNames`.
 * @returns A scoped child messenger with the requested actions delegated, or
 * `undefined` if no actions were requested.
 */
export function createRestrictedMethodMessenger<
  RootMessenger extends Messenger<string, ActionConstraint, EventConstraint>,
  DelegatedActions extends readonly MessengerActions<RootMessenger>['type'][],
>({
  rootMessenger,
  namespace,
  actionNames,
}: {
  rootMessenger: RootMessenger;
  namespace: string;
  actionNames?: DelegatedActions;
}):
  | Messenger<
      string,
      Extract<
        MessengerActions<RootMessenger>,
        { type: DelegatedActions[number] }
      >,
      never,
      RootMessenger
    >
  | undefined {
  if (!actionNames?.length) {
    return undefined;
  }

  const restrictedMethodMessenger = new Messenger<
    string,
    Extract<
      MessengerActions<RootMessenger>,
      { type: DelegatedActions[number] }
    >,
    never,
    RootMessenger
  >({
    namespace,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: [...actionNames],
    messenger: restrictedMethodMessenger,
  });

  return restrictedMethodMessenger;
}
