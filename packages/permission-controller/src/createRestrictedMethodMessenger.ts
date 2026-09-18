import type {
  ActionConstraint,
  EventConstraint,
  MessengerActions,
} from '@metamask/messenger';
import { Messenger } from '@metamask/messenger';

/**
 * The subset of `RootMessenger`'s actions selected by `DelegatedActions`.
 */
type SelectedActions<
  RootMessenger extends Messenger<string, ActionConstraint, EventConstraint>,
  DelegatedActions extends readonly MessengerActions<RootMessenger>['type'][],
> = Extract<
  MessengerActions<RootMessenger>,
  { type: DelegatedActions[number] }
>;

/**
 * Create a child messenger scoped to a restricted-method permission
 * specification, delegating only the spec's declared actions from the root
 * messenger. This produces a minimally-scoped messenger whose action surface
 * matches exactly what the spec has declared it needs.
 *
 * Returns `undefined` when `actionNames` is omitted — there is nothing to
 * scope, and the builder can be invoked without a messenger.
 *
 * @param args - The arguments.
 * @param args.rootMessenger - The root messenger to delegate actions from.
 * @param args.namespace - The namespace for the scoped child messenger,
 * typically the spec's `targetName`.
 * @param args.actionNames - The action types the specification requires,
 * typically the spec's declared `actionNames`. Must be a non-empty tuple of
 * action types that exist on the root messenger.
 * @returns A scoped child messenger with the requested actions delegated, or
 * `undefined` if no actions were requested.
 */
export function createRestrictedMethodMessenger<
  Namespace extends string,
  RootMessenger extends Messenger<string, ActionConstraint, EventConstraint>,
  DelegatedActions extends readonly [
    MessengerActions<RootMessenger>['type'],
    ...MessengerActions<RootMessenger>['type'][],
  ],
>(args: {
  rootMessenger: RootMessenger;
  namespace: Namespace;
  actionNames: DelegatedActions;
}): Messenger<
  Namespace,
  SelectedActions<RootMessenger, DelegatedActions>,
  never,
  RootMessenger
>;

export function createRestrictedMethodMessenger<
  Namespace extends string,
  RootMessenger extends Messenger<string, ActionConstraint, EventConstraint>,
>(args: {
  rootMessenger: RootMessenger;
  namespace: Namespace;
  actionNames?: undefined;
}): undefined;

export function createRestrictedMethodMessenger<
  Namespace extends string,
  RootMessenger extends Messenger<string, ActionConstraint, EventConstraint>,
  DelegatedActions extends [
    MessengerActions<RootMessenger>['type'],
    ...MessengerActions<RootMessenger>['type'][],
  ],
>({
  rootMessenger,
  namespace,
  actionNames,
}: {
  rootMessenger: RootMessenger;
  namespace: Namespace;
  actionNames?: DelegatedActions;
}):
  | Messenger<
      Namespace,
      SelectedActions<RootMessenger, DelegatedActions>,
      never,
      RootMessenger
    >
  | undefined {
  if (!actionNames?.length) {
    return undefined;
  }

  const restrictedMethodMessenger = new Messenger<
    Namespace,
    SelectedActions<RootMessenger, DelegatedActions>,
    never,
    RootMessenger
  >({
    namespace,
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    actions: actionNames,
    messenger: restrictedMethodMessenger,
  });

  return restrictedMethodMessenger;
}
