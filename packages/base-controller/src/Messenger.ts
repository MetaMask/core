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
  ReturnValue,
> = (...args: ExtractEventPayload<Event, EventType>) => ReturnValue;
export type SelectorEventHandler<SelectorReturnValue> = (
  newValue: SelectorReturnValue,
  previousValue: SelectorReturnValue | undefined,
) => void;

export type ActionConstraint = {
  type: string;
  handler: ((...args: never) => unknown) | ((...args: never[]) => unknown);
};
export type EventConstraint = {
  type: string;
  payload: unknown[];
};

type EventSubscriptionMap<
  Event extends EventConstraint,
  ReturnValue = unknown,
> = Map<
  GenericEventHandler | SelectorEventHandler<ReturnValue>,
  SelectorFunction<Event, Event['type'], ReturnValue> | undefined
>;

export type NamespacedName<Namespace extends string = string> =
  `${Namespace}:${string}`;

/**
 * A messenger that actions and/or events can be delegated to.
 *
 * This is a minimal type interface to avoid complex incompatibilities resulting from generics.
 */
type DelegatedMessenger<
  Action extends ActionConstraint,
  Event extends EventConstraint,
  Namespace extends string = string,
> = Pick<
  Messenger<Action, Event, Namespace>,
  | 'publishDelegated'
  | 'registerDelegatedActionHandler'
  | 'registerDelegatedInitialEventPayload'
  | 'unregisterDelegatedActionHandler'
>;

/**
 * A message broker for "actions" and "events".
 *
 * The messenger allows registering functions as 'actions' that can be called elsewhere,
 * and it allows publishing and subscribing to events. Both actions and events are identified by
 * unique strings.
 *
 * @template Action - A type union of all Action types.
 * @template Event - A type union of all Event types.
 */
export class Messenger<
  Action extends ActionConstraint,
  Event extends EventConstraint,
  Namespace extends string = string,
> {
  readonly #namespace: Namespace;

  readonly #actions = new Map<Action['type'], Action['handler']>();

  readonly #events = new Map<Event['type'], EventSubscriptionMap<Event>>();

  readonly #delegatedEventSubscriptions = new Map<
    Event['type'],
    Map<
      DelegatedMessenger<Action, Event>,
      ExtractEventHandler<Event, Event['type']>
    >
  >();

  readonly #delegatedActionHandlers = new Map<
    Action['type'],
    Set<DelegatedMessenger<Action, Event>>
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
   * @param namespace - The messenger namespace.
   */
  constructor(namespace: Namespace) {
    this.#namespace = namespace;
  }

  /**
   * Register an action handler.
   *
   * This will make the registered function available to call via the `call` method.
   *
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @param handler - The action handler. This function gets called when the `call` method is
   * invoked with the given action type.
   * @throws Will throw when a handler has been registered for this action type already.
   * @template ActionType - A type union of Action type strings.
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

  /**
   * Register a delegated action handler.
   *
   * This will make the registered function available to call via the `call` method.
   *
   * @deprecated Do not call this directly, instead use the `delegate` method.
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @param handler - The action handler. This function gets called when the `call` method is
   * invoked with the given action type.
   * @throws Will throw when a handler has been registered for this action type already.
   * @template ActionType - A type union of Action type strings.
   */
  registerDelegatedActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
    handler: ActionHandler<Action, ActionType>,
  ) {
    this.#registerActionHandler(actionType, handler);
  }

  #registerActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
    handler: ActionHandler<Action, ActionType>,
  ) {
    if (this.#actions.has(actionType)) {
      throw new Error(
        `A handler for ${actionType} has already been registered`,
      );
    }
    this.#actions.set(actionType, handler);
  }

  /**
   * Unregister an action handler.
   *
   * This will prevent this action from being called.
   *
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @template ActionType - A type union of Action type strings.
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

  /**
   * Unregister a delegated action handler.
   *
   * This will prevent this action from being called.
   *
   * @deprecated Do not call this directly, instead use the `delegate` method.
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @template ActionType - A type union of Action type strings.
   */
  unregisterDelegatedActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
  ) {
    this.#unregisterActionHandler(actionType);
  }

  #unregisterActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
  ) {
    this.#actions.delete(actionType);
    const delegatedMessengers = this.#delegatedActionHandlers.get(actionType);
    if (!delegatedMessengers) {
      return;
    }
    for (const messenger of delegatedMessengers) {
      messenger.unregisterDelegatedActionHandler(actionType);
    }
    this.#delegatedActionHandlers.delete(actionType);
  }

  /**
   * Unregister all action handlers.
   *
   * This prevents all actions from being called.
   */
  clearActions() {
    this.#actions.clear();
  }

  /**
   * Call an action.
   *
   * This function will call the action handler corresponding to the given action type, passing
   * along any parameters given.
   *
   * @param actionType - The action type. This is a unqiue identifier for this action.
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
   * @param args - The arguments to this function
   * @param args.eventType - The event type to register a payload for.
   * @param args.getPayload - A function for retrieving the event payload.
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

  /**
   * Register a function for getting the initial payload for a delegated event.
   *
   * This is used for events that represent a state change, where the payload is the state.
   * Registering a function for getting the payload allows event selectors to have a point of
   * comparison the first time state changes.
   *
   * @deprecated Do not call this directly, instead use the `delegate` method.
   * @param args - The arguments to this function
   * @param args.eventType - The event type to register a payload for.
   * @param args.getPayload - A function for retrieving the event payload.
   */
  registerDelegatedInitialEventPayload<EventType extends Event['type']>({
    eventType,
    getPayload,
  }: {
    eventType: EventType;
    getPayload: () => ExtractEventPayload<Event, EventType>;
  }) {
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
    const delegatedSubscribers =
      this.#delegatedEventSubscriptions.get(eventType);
    if (!delegatedSubscribers) {
      return;
    }
    const delegatedMessengers = delegatedSubscribers.keys();
    for (const messenger of delegatedMessengers) {
      messenger.registerDelegatedInitialEventPayload({ eventType, getPayload });
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
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   * match the type of this payload.
   * @template EventType - A type union of Event type strings.
   */
  publish<EventType extends Event['type'] & NamespacedName<Namespace>>(
    eventType: EventType,
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

  /**
   * Publish a delegated event.
   *
   * Publishes the given payload to all subscribers of the given event type.
   *
   * Note that this method should never throw directly. Any errors from
   * subscribers are captured and re-thrown in a timeout handler.
   *
   * @deprecated Do not call this directly, instead use the `delegate` method.
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   * match the type of this payload.
   * @template EventType - A type union of Event type strings.
   */
  publishDelegated<EventType extends Event['type']>(
    eventType: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    this.#publish(eventType, ...payload);
  }

  #publish<EventType extends Event['type']>(
    eventType: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    const subscribers = this.#events.get(eventType);

    if (subscribers) {
      for (const [handler, selector] of subscribers.entries()) {
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
    handler: ExtractEventHandler<Event, EventType>,
    selector?: SelectorFunction<Event, EventType, SelectorReturnValue>,
  ): void {
    let subscribers = this.#events.get(eventType);
    if (!subscribers) {
      subscribers = new Map();
      this.#events.set(eventType, subscribers);
    }

    subscribers.set(handler, selector);

    if (selector) {
      const getPayload = this.#initialEventPayloadGetters.get(eventType);
      if (getPayload) {
        const initialValue = selector(...getPayload());
        this.#eventPayloadCache.set(handler, initialValue);
      }
    }
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
   */
  unsubscribe<EventType extends Event['type']>(
    eventType: EventType,
    handler: ExtractEventHandler<Event, EventType>,
  ) {
    const subscribers = this.#events.get(eventType);

    if (!subscribers || !subscribers.has(handler)) {
      throw new Error(`Subscription not found for event: ${eventType}`);
    }

    const selector = subscribers.get(handler);
    if (selector) {
      this.#eventPayloadCache.delete(handler);
    }

    subscribers.delete(handler);
  }

  /**
   * Clear subscriptions for a specific event.
   *
   * This will remove all subscribed handlers for this event.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @template EventType - A type union of Event type strings.
   */
  clearEventSubscriptions<EventType extends Event['type']>(
    eventType: EventType,
  ) {
    this.#events.delete(eventType);
  }

  /**
   * Clear all subscriptions.
   *
   * This will remove all subscribed handlers for all events.
   */
  clearSubscriptions() {
    this.#events.clear();
  }

  /**
   * Delegate actions and/or events to another messenger.
   *
   * @param args - Arguments.
   * @param args.actions - The action types to delegate.
   * @param args.events - The event types to delegate.
   * @param args.messenger - The messenger to delegate to.
   */
  delegate<DelegatedAction extends Action, DelegatedEvent extends Event>({
    actions = [],
    events = [],
    messenger,
  }: {
    actions?: DelegatedAction['type'][];
    events?: DelegatedEvent['type'][];
    messenger: DelegatedMessenger<DelegatedAction, DelegatedEvent>;
  }) {
    for (const actionType of actions) {
      const delegatedActionHandler = (
        ...args: ExtractActionParameters<DelegatedAction, typeof actionType>
      ) => {
        // We use a cast to convince TypeScript that this handler corresponds to the given type.
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
      let actionHandlers = this.#delegatedActionHandlers.get(actionType);
      if (!actionHandlers) {
        actionHandlers = new Set<DelegatedMessenger<Action, Event>>();
        this.#delegatedActionHandlers.set(actionType, actionHandlers);
      }
      actionHandlers.add(messenger);

      messenger.registerDelegatedActionHandler(
        actionType,
        delegatedActionHandler,
      );
    }
    for (const eventType of events) {
      const untypedSubscriber = (
        ...payload: ExtractEventPayload<DelegatedEvent, typeof eventType>
      ) => {
        messenger.publishDelegated(eventType, ...payload);
      };
      // Cast required to convince TypeScript that this is the correct subscriber type for this
      // specific event.
      const subscriber = untypedSubscriber as ExtractEventHandler<
        DelegatedEvent,
        typeof eventType
      >;
      let delegatedEventSubscriptions =
        this.#delegatedEventSubscriptions.get(eventType);
      if (!delegatedEventSubscriptions) {
        delegatedEventSubscriptions = new Map();
        this.#delegatedEventSubscriptions.set(
          eventType,
          delegatedEventSubscriptions,
        );
      }
      delegatedEventSubscriptions.set(messenger, subscriber);
      const getPayload = this.#initialEventPayloadGetters.get(eventType);
      if (getPayload) {
        messenger.registerDelegatedInitialEventPayload({
          eventType,
          getPayload,
        });
      }
      this.subscribe(eventType, subscriber);
    }
  }

  /**
   * Revoke delegated actions and/or events from another messenger.
   *
   * @param args - Arguments.
   * @param args.actions - The action types to revoke.
   * @param args.events - The event types to revoke.
   * @param args.messenger - The messenger these actions/events were delegated to.
   */
  revoke<DelegatedAction extends Action, DelegatedEvent extends Event>({
    actions = [],
    events = [],
    messenger,
  }: {
    actions?: DelegatedAction['type'][];
    events?: DelegatedEvent['type'][];
    messenger: DelegatedMessenger<DelegatedAction, DelegatedEvent>;
  }) {
    for (const actionType of actions) {
      messenger.unregisterDelegatedActionHandler(actionType);
      const delegatedMessengers = this.#delegatedActionHandlers.get(actionType);
      if (!delegatedMessengers) {
        continue;
      }
      delegatedMessengers.delete(messenger);
    }
    for (const eventType of events) {
      const messengerDelegatedEventSubscriptions =
        this.#delegatedEventSubscriptions.get(eventType);
      if (!messengerDelegatedEventSubscriptions) {
        continue;
      }
      const subscriber = messengerDelegatedEventSubscriptions.get(messenger);
      if (!subscriber) {
        continue;
      }
      this.unsubscribe(eventType, subscriber);
      messengerDelegatedEventSubscriptions.delete(messenger);
      if (messengerDelegatedEventSubscriptions.size === 0) {
        this.#delegatedEventSubscriptions.delete(eventType);
      }
    }
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
