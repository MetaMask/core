export type ActionHandler<
  Action extends ActionConstraint,
  ActionType = Action['type'],
> = (
  ...args: ExtractActionParameters<Action, ActionType>
) => ExtractActionResponse<Action, ActionType>;

export type ExtractActionParameters<
  Action extends ActionConstraint,
  ActionType = Action['type'],
> = Action extends {
  type: ActionType;
  handler: (...args: infer HandlerArgs) => unknown;
}
  ? HandlerArgs
  : never;

export type ExtractActionResponse<
  Action extends ActionConstraint,
  ActionType = Action['type'],
> = Action extends {
  type: ActionType;
  handler: (...args: infer _) => infer HandlerReturnValue;
}
  ? HandlerReturnValue
  : never;

export type ExtractEventHandler<
  Event extends EventConstraint,
  EventType = Event['type'],
> = Event extends {
  type: EventType;
  payload: infer Payload;
}
  ? Payload extends unknown[]
    ? (...payload: Payload) => void
    : never
  : never;

export type ExtractEventPayload<
  Event extends EventConstraint,
  EventType = Event['type'],
> = Event extends {
  type: EventType;
  payload: infer Payload;
}
  ? Payload extends unknown[]
    ? Payload
    : never
  : never;

export type GenericEventHandler = (...args: unknown[]) => void;

export type SelectorFunction<
  Event extends EventConstraint,
  EventType extends Event['type'],
  ReturnValue = unknown,
> = (...args: ExtractEventPayload<Event, EventType>) => ReturnValue;
export type SelectorEventHandler<SelectorReturnValue = unknown> = (
  newValue: SelectorReturnValue,
  previousValue: SelectorReturnValue | undefined,
) => void;

export type ActionConstraint = {
  type: NamespacedName;
  handler: ((...args: never) => unknown) | ((...args: never[]) => unknown);
};
export type EventConstraint = {
  type: NamespacedName;
  payload: unknown[];
};

/**
 * Metadata for a single event subscription.
 *
 * @template Event - The event this subscription is for.
 */
type SubscriptionMetadata<Event extends EventConstraint> = {
  /**
   * Whether this subscription is for a delegated messenger. Delegation subscriptions are ignored
   * when clearing subscriptions.
   */
  delegation: boolean;
  /**
   * The optional selector function for this subscription.
   */
  selector?: SelectorFunction<Event, Event['type']>;
};

/**
 * A map of event handlers for a specific event.
 *
 * The key is the handler function, and the value contains additional subscription metadata.
 *
 * @template Event - The event these handlers are for.
 */
type EventSubscriptionMap<Event extends EventConstraint> = Map<
  GenericEventHandler | SelectorEventHandler,
  SubscriptionMetadata<Event>
>;

/**
 * A namespaced string
 *
 * This type verifies that the string Name is prefixed by the string Name followed by a colon.
 *
 * @template Namespace - The namespace we're checking for.
 * @template Name - The full string, including the namespace.
 */
export type NamespacedBy<
  Namespace extends string,
  Name extends string,
> = Name extends `${Namespace}:${string}` ? Name : never;

export type NotNamespacedBy<
  Namespace extends string,
  Name extends string,
> = Name extends `${Namespace}:${string}` ? never : Name;

export type NamespacedName<Namespace extends string = string> =
  `${Namespace}:${string}`;

/**
 * Validate that the given messenger has the provided capabilities.
 *
 * This type assumes that capability names are unique; action handlers and event payload types are
 * not verified.
 *
 * @template Subject - The messenger being validated.
 * @template ActionType - A type union of action types that the messenger should have.
 * @template EventType - A type union of event types that the messenger should have.
 */
type WithCapabilities<
  Subject extends Messenger<string, ActionConstraint, EventConstraint>,
  ActionType extends NamespacedName,
  EventType extends NamespacedName,
> =
  Subject extends Messenger<string, infer SubjectAction, infer SubjectEvent>
    ? SubjectAction['type'] extends ActionType
      ? SubjectEvent['type'] extends EventType
        ? DelegatedMessenger
        : never
      : never
    : never;

/**
 * A messenger that actions and/or events can be delegated to.
 *
 * This is a minimal type interface to avoid complex incompatibilities resulting from generics over
 * invariant types.
 */
type DelegatedMessenger = Pick<
  // The type is broadened to all actions/events because some messenger methods are contravariant
  // over this type (`registerDelegatedActionHandler` and `publishDelegated` for example). If this
  // type is narrowed to just the delegated actions/events, the types for event payload and action
  // parameters would not be wide enough.
  Messenger<string, ActionConstraint, EventConstraint>,
  | '_internalPublishDelegated'
  | '_internalRegisterDelegatedActionHandler'
  | '_internalRegisterDelegatedInitialEventPayload'
  | '_internalUnregisterDelegatedActionHandler'
>;

/**
 * A message broker for "actions" and "events".
 *
 * The messenger allows registering functions as 'actions' that can be called elsewhere,
 * and it allows publishing and subscribing to events. Both actions and events are identified by
 * unique strings prefixed by a namespace (which is delimited by a colon, e.g.
 * `Namespace:actionName`).
 *
 * @template Action - A type union of all Action types.
 * @template Event - A type union of all Event types.
 * @template Namespace - The namespace for the messenger.
 */
export class Messenger<
  Namespace extends string,
  Action extends ActionConstraint,
  Event extends EventConstraint,
> {
  readonly #namespace: Namespace;

  readonly #actions = new Map<Action['type'], Action['handler']>();

  readonly #events = new Map<Event['type'], EventSubscriptionMap<Event>>();

  /**
   * The set of messengers we've delegated events to and their event handlers, by event type.
   */
  readonly #subscriptionDelegationTargets = new Map<
    Event['type'],
    Map<DelegatedMessenger, ExtractEventHandler<Event, Event['type']>>
  >();

  /**
   * The set of messengers we've delegated actions to, by action type.
   */
  readonly #actionDelegationTargets = new Map<
    Action['type'],
    Set<DelegatedMessenger>
  >();

  /**
   * A map of functions for getting the initial event payload.
   *
   * Used only for events that represent state changes.
   */
  readonly #initialEventPayloadGetters = new Map<
    Event['type'],
    () => ExtractEventPayload<Event, Event['type']>
  >();

  /**
   * A cache of selector return values for their respective handlers.
   */
  readonly #eventPayloadCache = new Map<
    GenericEventHandler,
    unknown | undefined
  >();

  /**
   * Construct a messenger.
   *
   * @param args - Constructor arguments
   * @param args.namespace - The messenger namespace.
   */
  constructor({ namespace }: { namespace: Namespace }) {
    this.#namespace = namespace;
  }

  /**
   * Register an action handler.
   *
   * This will make the registered function available to call via the `call` method.
   *
   * The action being registered must be under the same namespace as the messenger.
   *
   * @param actionType - The action type. This is a unique identifier for this action.
   * @param handler - The action handler. This function gets called when the `call` method is
   * invoked with the given action type.
   * @throws Will throw when a handler has been registered for this action type already.
   * @template ActionType - A type union of Action type strings under this messenger's namespace.
   */
  registerActionHandler<
    ActionType extends Action['type'] & NamespacedName<Namespace>,
  >(actionType: ActionType, handler: ActionHandler<Action, ActionType>) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!this.#isInCurrentNamespace(actionType)) {
      throw new Error(
        `Only allowed registering action handlers prefixed by '${
          this.#namespace
        }:'`,
      );
    }
    this.#registerActionHandler(actionType, handler);
  }

  #registerActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
    handler: ActionHandler<ActionConstraint, ActionType>,
  ) {
    if (this.#actions.has(actionType)) {
      throw new Error(
        `A handler for ${actionType} has already been registered`,
      );
    }
    this.#actions.set(actionType, handler);
  }

  /**
   * Registers action handlers for a list of methods on a messenger client
   *
   * @param messengerClient - The object that is expected to make use of the messenger.
   * @param methodNames - The names of the methods on the messenger client to register as action
   * handlers.
   * @template MessengerClient - The type expected to make use of the messenger.
   * @template MethodNames - The type union of method names to register as action handlers.
   */
  registerMethodActionHandlers<
    MessengerClient extends { name: Namespace },
    MethodNames extends keyof MessengerClient & string,
  >(messengerClient: MessengerClient, methodNames: readonly MethodNames[]) {
    for (const methodName of methodNames) {
      const method = messengerClient[methodName];
      if (typeof method === 'function') {
        const actionType = `${messengerClient.name}:${methodName}` as const;
        this.registerActionHandler(actionType, method.bind(messengerClient));
      }
    }
  }

  /**
   * Unregister an action handler.
   *
   * This will prevent this action from being called.
   *
   * The action being unregistered must be under the same namespace as the messenger.
   *
   * @param actionType - The action type. This is a unique identifier for this action.
   * @template ActionType - A type union of Action type strings under this messenger's namespace.
   */
  unregisterActionHandler<
    ActionType extends Action['type'] & NamespacedName<Namespace>,
  >(actionType: ActionType) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!this.#isInCurrentNamespace(actionType)) {
      throw new Error(
        `Only allowed unregistering action handlers prefixed by '${
          this.#namespace
        }:'`,
      );
    }
    this.#unregisterActionHandler(actionType);
  }

  #unregisterActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
  ) {
    this.#actions.delete(actionType);
    const delegationTargets = this.#actionDelegationTargets.get(actionType);
    if (!delegationTargets) {
      return;
    }
    for (const messenger of delegationTargets) {
      messenger._internalUnregisterDelegatedActionHandler(actionType);
    }
    this.#actionDelegationTargets.delete(actionType);
  }

  /**
   * Unregister all action handlers.
   *
   * This prevents all actions from being called.
   */
  clearActions() {
    for (const actionType of this.#actions.keys()) {
      this.#unregisterActionHandler(actionType);
    }
  }

  /**
   * Call an action.
   *
   * This function will call the action handler corresponding to the given action type, passing
   * along any parameters given.
   *
   * @param actionType - The action type. This is a unique identifier for this action.
   * @param params - The action parameters. These must match the type of the parameters of the
   * registered action handler.
   * @throws Will throw when no handler has been registered for the given type.
   * @template ActionType - A type union of Action type strings.
   * @returns The action return value.
   */
  call<ActionType extends Action['type']>(
    actionType: ActionType,
    ...params: ExtractActionParameters<Action, ActionType>
  ): ExtractActionResponse<Action, ActionType> {
    const handler = this.#actions.get(actionType) as ActionHandler<
      Action,
      ActionType
    >;
    if (!handler) {
      throw new Error(`A handler for ${actionType} has not been registered`);
    }
    return handler(...params);
  }

  /**
   * Register a function for getting the initial payload for an event.
   *
   * This is used for events that represent a state change, where the payload is the state.
   * Registering a function for getting the payload allows event selectors to have a point of
   * comparison the first time state changes.
   *
   * The event type must be under the same namespace as the messenger.
   *
   * @param args - The arguments to this function
   * @param args.eventType - The event type to register a payload for.
   * @param args.getPayload - A function for retrieving the event payload.
   * @template EventType - A type union of Event type strings under this messenger's namespace.
   */
  registerInitialEventPayload<
    EventType extends Event['type'] & NamespacedName<Namespace>,
  >({
    eventType,
    getPayload,
  }: {
    eventType: EventType;
    getPayload: () => ExtractEventPayload<Event, EventType>;
  }) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!this.#isInCurrentNamespace(eventType)) {
      throw new Error(
        `Only allowed registering initial payloads for events prefixed by '${
          this.#namespace
        }:'`,
      );
    }
    this.#registerInitialEventPayload({ eventType, getPayload });
  }

  #registerInitialEventPayload<EventType extends Event['type']>({
    eventType,
    getPayload,
  }: {
    eventType: EventType;
    getPayload: () => ExtractEventPayload<Event, EventType>;
  }) {
    this.#initialEventPayloadGetters.set(eventType, getPayload);
    const delegationTargets =
      this.#subscriptionDelegationTargets.get(eventType);
    if (!delegationTargets) {
      return;
    }
    for (const messenger of delegationTargets.keys()) {
      messenger._internalRegisterDelegatedInitialEventPayload({
        eventType,
        getPayload,
      });
    }
  }

  /**
   * Publish an event.
   *
   * Publishes the given payload to all subscribers of the given event type.
   *
   * Note that this method should never throw directly. Any errors from
   * subscribers are captured and re-thrown in a timeout handler.
   *
   * The event being published must be under the same namespace as the messenger.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   * match the type of this payload.
   * @template EventType - A type union of Event type strings under this messenger's namespace.
   */
  publish<EventType extends Event['type'] & NamespacedName<Namespace>>(
    eventType: EventType & NamespacedName<Namespace>,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!this.#isInCurrentNamespace(eventType)) {
      throw new Error(
        `Only allowed publishing events prefixed by '${this.#namespace}:'`,
      );
    }
    this.#publish(eventType, ...payload);
  }

  #publish<EventType extends Event['type']>(
    eventType: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    const subscribers = this.#events.get(eventType);

    if (subscribers) {
      for (const [handler, { selector }] of subscribers.entries()) {
        try {
          if (selector) {
            const previousValue = this.#eventPayloadCache.get(handler);
            const newValue = selector(...payload);

            if (newValue !== previousValue) {
              this.#eventPayloadCache.set(handler, newValue);
              handler(newValue, previousValue);
            }
          } else {
            (handler as GenericEventHandler)(...payload);
          }
        } catch (error) {
          // Throw error after timeout so that it is capured as a console error
          // (and by Sentry) without interrupting the event publishing.
          setTimeout(() => {
            throw error;
          });
        }
      }
    }
  }

  /**
   * Subscribe to an event.
   *
   * Registers the given function as an event handler for the given event type.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param handler - The event handler. The type of the parameters for this event handler must
   * match the type of the payload for this event type.
   * @template EventType - A type union of Event type strings.
   */
  subscribe<EventType extends Event['type']>(
    eventType: EventType,
    handler: ExtractEventHandler<Event, EventType>,
  ): void;

  /**
   * Subscribe to an event, with a selector.
   *
   * Registers the given handler function as an event handler for the given
   * event type. When an event is published, its payload is first passed to the
   * selector. The event handler is only called if the selector's return value
   * differs from its last known return value.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param handler - The event handler. The type of the parameters for this event
   * handler must match the return type of the selector.
   * @param selector - The selector function used to select relevant data from
   * the event payload. The type of the parameters for this selector must match
   * the type of the payload for this event type.
   * @template EventType - A type union of Event type strings.
   * @template SelectorReturnValue - The selector return value.
   */
  subscribe<EventType extends Event['type'], SelectorReturnValue>(
    eventType: EventType,
    handler: SelectorEventHandler<SelectorReturnValue>,
    selector: SelectorFunction<Event, EventType, SelectorReturnValue>,
  ): void;

  subscribe<EventType extends Event['type'], SelectorReturnValue>(
    eventType: EventType,
    handler:
      | ExtractEventHandler<Event, EventType>
      | SelectorEventHandler<SelectorReturnValue>,
    selector?: SelectorFunction<Event, EventType, SelectorReturnValue>,
  ): void {
    // Widen type of event handler by dropping ReturnType parameter.
    //
    // We need to drop it here because it's used as the parameter to the event handler, and
    // functions in general are contravariant over the parameter type. This means the type is no
    // longer valid once it's added to a broader type union with other handlers (because as far
    // as TypeScript knows, we might call the handler with output from a different selector).
    //
    // This cast means the type system is not guaranteeing the handler is called with the matching
    // input selector return value. The parameter types do ensure they match when `subscribe` is
    // called, but past that point we need to make sure of that with manual review and tests
    // instead.
    const widenedHandler = handler as
      | ExtractEventHandler<Event, EventType>
      | SelectorEventHandler;
    this.#subscribe(eventType, widenedHandler, { delegation: false, selector });

    if (selector) {
      const getPayload = this.#initialEventPayloadGetters.get(eventType);
      if (getPayload) {
        const initialValue = selector(...getPayload());
        this.#eventPayloadCache.set(widenedHandler, initialValue);
      }
    }
  }

  /**
   * Subscribe to an event.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param handler - The event handler. The type of the parameters for this event handler must
   * match the type of the payload for this event type.
   * @param metadata - Event metadata.
   * @template SubscribedEvent - The event being subscribed to.
   * @template SelectorReturnValue - The selector return value.
   */
  #subscribe<SubscribedEvent extends EventConstraint>(
    eventType: SubscribedEvent['type'],
    handler:
      | ExtractEventHandler<SubscribedEvent, SubscribedEvent['type']>
      | SelectorEventHandler,
    metadata: SubscriptionMetadata<SubscribedEvent>,
  ): void {
    let subscribers = this.#events.get(eventType);
    if (!subscribers) {
      subscribers = new Map();
      this.#events.set(eventType, subscribers);
    }
    subscribers.set(handler, metadata);
  }

  /**
   * Unsubscribe from an event.
   *
   * Unregisters the given function as an event handler for the given event.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param handler - The event handler to unregister.
   * @throws Will throw when the given event handler is not registered for this event.
   * @template EventType - A type union of Event type strings.
   * @template SelectorReturnValue - The selector return value.
   */
  unsubscribe<EventType extends Event['type'], SelectorReturnValue = unknown>(
    eventType: EventType,
    handler:
      | ExtractEventHandler<Event, EventType>
      | SelectorEventHandler<SelectorReturnValue>,
  ) {
    const subscribers = this.#events.get(eventType);

    // Widen type of event handler by dropping ReturnType parameter.
    //
    // We need to drop it here because it's used as the parameter to the event handler, and
    // functions in general are contravariant over the parameter type. This means the type is no
    // longer valid once it's added to a broader type union with other handlers (because as far
    // as TypeScript knows, we might call the handler with output from a different selector).
    //
    // This poses no risk in this case, since we never call the handler past this point.
    const widenedHandler = handler as
      | ExtractEventHandler<Event, EventType>
      | SelectorEventHandler;
    if (!subscribers) {
      throw new Error(`Subscription not found for event: ${eventType}`);
    }
    const metadata = subscribers.get(widenedHandler);
    if (!metadata) {
      throw new Error(`Subscription not found for event: ${eventType}`);
    }
    if (metadata.selector) {
      this.#eventPayloadCache.delete(widenedHandler);
    }

    subscribers.delete(widenedHandler);
  }

  /**
   * Clear subscriptions for a specific event.
   *
   * This will remove all subscribed handlers for this event registered from this messenger. The
   * event may still have subscribers if it has been delegated to another messenger.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @template EventType - A type union of Event type strings.
   */
  clearEventSubscriptions<EventType extends Event['type']>(
    eventType: EventType,
  ) {
    const subscriptions = this.#events.get(eventType);
    if (!subscriptions) {
      return;
    }

    for (const [handler, metadata] of subscriptions.entries()) {
      if (metadata.delegation) {
        continue;
      }
      subscriptions.delete(handler);
    }

    if (subscriptions.size === 0) {
      this.#events.delete(eventType);
    }
  }

  /**
   * Clear all subscriptions.
   *
   * This will remove all subscribed handlers for all events registered from this messenger. Events
   * may still have subscribers if they are delegated to another messenger.
   */
  clearSubscriptions() {
    for (const eventType of this.#events.keys()) {
      this.clearEventSubscriptions(eventType);
    }
  }

  /**
   * Delegate actions and/or events to another messenger.
   *
   * The messenger these actions/events are delegated to will be able to call these actions and
   * subscribe to these events.
   *
   * Note that the messenger these actions/events are delegated to must still have these
   * actions/events included in its type definition (as part of the Action and Event type
   * parameters). Actions and events are statically type checked, they cannot be delegated
   * dynamically at runtime.
   *
   * @param args - Arguments.
   * @param args.actions - The action types to delegate.
   * @param args.events - The event types to delegate.
   * @param args.messenger - The messenger to delegate to.
   * @template DelegatedAction - A type union of delegated actions.
   * @template DelegatedEvent - A type union of delegated events.
   * @template Delegatee - The messenger the actions/events are delegated to.
   */
  delegate<
    DelegatedAction extends Action,
    DelegatedEvent extends Event,
    Delegatee extends Messenger<string, ActionConstraint, EventConstraint>,
  >({
    actions = [],
    events = [],
    messenger,
  }: {
    actions?: readonly DelegatedAction['type'][];
    events?: readonly DelegatedEvent['type'][];
    // Use intersection with Delegatee here so that TypeScript can infer the type of Delegatee
    // from this parameter.
    messenger: Delegatee &
      WithCapabilities<
        Delegatee,
        DelegatedAction['type'],
        DelegatedEvent['type']
      >;
  }) {
    for (const actionType of actions) {
      const delegatedActionHandler = (
        ...args: ExtractActionParameters<DelegatedAction, typeof actionType>
      ) => {
        // Cast to get more specific type, for this specific action
        // The types get collapsed by `this.#actions`
        const actionHandler = this.#actions.get(actionType) as
          | ActionHandler<DelegatedAction, typeof actionType>
          | undefined;
        if (!actionHandler) {
          throw new Error(
            `Cannot call '${actionType}', action not registered.`,
          );
        }
        return actionHandler(...args);
      };
      let delegationTargets = this.#actionDelegationTargets.get(actionType);
      if (!delegationTargets) {
        delegationTargets = new Set<DelegatedMessenger>();
        this.#actionDelegationTargets.set(actionType, delegationTargets);
      }
      if (delegationTargets.has(messenger)) {
        throw new Error(
          `The action '${actionType}' has already been delegated to this messenger`,
        );
      }
      delegationTargets.add(messenger);

      messenger._internalRegisterDelegatedActionHandler(
        actionType,
        delegatedActionHandler,
      );
    }
    for (const eventType of events) {
      const untypedSubscriber = (
        ...payload: ExtractEventPayload<DelegatedEvent, typeof eventType>
      ) => {
        messenger._internalPublishDelegated(eventType, ...payload);
      };
      // Cast to get more specific subscriber type for this specific event.
      // The types get collapsed here to the type union of all delegated
      // events, rather than the single subscriber type corresponding to this
      // event.
      const subscriber = untypedSubscriber as ExtractEventHandler<
        DelegatedEvent,
        typeof eventType
      >;
      let delegatedEventSubscriptions =
        this.#subscriptionDelegationTargets.get(eventType);
      if (!delegatedEventSubscriptions) {
        delegatedEventSubscriptions = new Map();
        this.#subscriptionDelegationTargets.set(
          eventType,
          delegatedEventSubscriptions,
        );
      }
      if (delegatedEventSubscriptions.has(messenger)) {
        throw new Error(
          `The event '${eventType}' has already been delegated to this messenger`,
        );
      }
      delegatedEventSubscriptions.set(messenger, subscriber);
      const getPayload = this.#initialEventPayloadGetters.get(eventType);
      if (getPayload) {
        messenger._internalRegisterDelegatedInitialEventPayload({
          eventType,
          getPayload,
        });
      }

      this.#subscribe(eventType, subscriber, { delegation: true });
    }
  }

  /**
   * Revoke delegated actions and/or events from another messenger.
   *
   * The messenger these actions/events are delegated to will no longer be able to call these
   * actions or subscribe to these events.
   *
   * @param args - Arguments.
   * @param args.actions - The action types to revoke.
   * @param args.events - The event types to revoke.
   * @param args.messenger - The messenger these actions/events were delegated to.
   * @template DelegatedAction - A type union of delegated actions.
   * @template DelegatedEvent - A type union of delegated events.
   * @template Delegatee - The messenger the actions/events are being revoked from.
   */
  revoke<
    DelegatedAction extends Action,
    DelegatedEvent extends Event,
    Delegatee extends Messenger<string, ActionConstraint, EventConstraint>,
  >({
    actions = [],
    events = [],
    messenger,
  }: {
    actions?: readonly DelegatedAction['type'][];
    events?: readonly DelegatedEvent['type'][];
    // Use intersection with Delegatee here so that TypeScript can infer the type of Delegatee
    // from this parameter.
    messenger: Delegatee &
      WithCapabilities<
        Delegatee,
        DelegatedAction['type'],
        DelegatedEvent['type']
      >;
  }) {
    for (const actionType of actions) {
      const delegationTargets = this.#actionDelegationTargets.get(actionType);
      if (!delegationTargets || !delegationTargets.has(messenger)) {
        // Nothing to revoke
        continue;
      }
      messenger._internalUnregisterDelegatedActionHandler(actionType);
      delegationTargets.delete(messenger);
      if (delegationTargets.size === 0) {
        this.#actionDelegationTargets.delete(actionType);
      }
    }
    for (const eventType of events) {
      const delegationTargets =
        this.#subscriptionDelegationTargets.get(eventType);
      if (!delegationTargets) {
        // Nothing to revoke
        continue;
      }
      const delegatedSubscriber = delegationTargets.get(messenger);
      if (!delegatedSubscriber) {
        // Nothing to revoke
        continue;
      }
      this.unsubscribe(eventType, delegatedSubscriber);
      delegationTargets.delete(messenger);
      if (delegationTargets.size === 0) {
        this.#subscriptionDelegationTargets.delete(eventType);
      }
    }
  }

  /**
   * Register an action handler for an action delegated from another messenger.
   *
   * This will make the registered function available to call via the `call` method.
   *
   * Note: This is an internal method. Never access this property from another module. This must be
   * exposed as a public property so that these methods can be called internally on other messenger
   * instances.
   *
   * @deprecated Internal use only. Use the `delegate` method for delegation.
   * @param actionType - The action type. This is a unique identifier for this action.
   * @param handler - The action handler. This function gets called when the `call` method is
   * invoked with the given action type.
   * @throws Will throw when a handler has been registered for this action type already.
   * @template ActionType - A type union of Action type strings.
   */
  _internalRegisterDelegatedActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
    // Using wider `ActionConstraint` type here rather than `Action` because the `Action` type is
    // contravariant over the handler parameter type. Using `Action` would lead to a type error
    // here because the messenger we've delegated to supports _additional_ actions.
    handler: ActionHandler<ActionConstraint, ActionType>,
  ) {
    this.#registerActionHandler(actionType, handler);
  }

  /**
   * Unregister an action handler for an action delegated from another messenger.
   *
   * This will prevent this action from being called.
   *
   * Note: This is an internal method. Never access this property from another module. This must be
   * exposed as a public property so that these methods can be called internally on other messenger
   * instances.
   *
   * @deprecated Internal use only. Use the `delegate` method for delegation.
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @template ActionType - A type union of Action type strings.
   */
  _internalUnregisterDelegatedActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
  ) {
    this.#unregisterActionHandler(actionType);
  }

  /**
   * Register a function for getting the initial payload for an event that has been delegated from
   * another messenger.
   *
   * This is used for events that represent a state change, where the payload is the state.
   * Registering a function for getting the payload allows event selectors to have a point of
   * comparison the first time state changes.
   *
   * Note: This is an internal method. Never access this property from another module. This must be
   * exposed as a public property so that these methods can be called internally on other messenger
   * instances.
   *
   * @deprecated Internal use only. Use the `delegate` method for delegation.
   * @param args - The arguments to this function
   * @param args.eventType - The event type to register a payload for.
   * @param args.getPayload - A function for retrieving the event payload.
   */
  _internalRegisterDelegatedInitialEventPayload<
    EventType extends Event['type'],
  >({
    eventType,
    getPayload,
  }: {
    eventType: EventType;
    getPayload: () => ExtractEventPayload<Event, EventType>;
  }) {
    this.#registerInitialEventPayload({ eventType, getPayload });
  }

  /**
   * Publish an event that was delegated from another messenger.
   *
   * Publishes the given payload to all subscribers of the given event type.
   *
   * Note that this method should never throw directly. Any errors from
   * subscribers are captured and re-thrown in a timeout handler.
   *
   * Note: This is an internal method. Never access this property from another module. This must be
   * exposed as a public property so that these methods can be called internally on other messenger
   * instances.
   *
   * @deprecated Internal use only. Use the `delegate` method for delegation.
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   * match the type of this payload.
   * @template EventType - A type union of Event type strings.
   */
  _internalPublishDelegated<EventType extends Event['type']>(
    eventType: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    this.#publish(eventType, ...payload);
  }

  /**
   * Determine whether the given name is within the current namespace.
   *
   * @param name - The name to check
   * @returns Whether the name is within the current namespace
   */
  #isInCurrentNamespace(name: string): name is NamespacedName<Namespace> {
    return name.startsWith(`${this.#namespace}:`);
  }
}
