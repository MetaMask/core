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

export type SelectorFunction<Event extends EventConstraint, ReturnValue> = (
  ...args: ExtractEventPayload<Event>
) => ReturnValue;
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
  SelectorFunction<ExtractEventPayload<Event>, ReturnValue> | undefined
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
  Name,
> = Name extends `${Namespace}:${string}` ? Name : never;

export type NotNamespacedBy<
  Namespace extends string,
  Name,
> = Name extends `${Namespace}:${string}` ? never : Name;

export type NamespacedName<Namespace extends string = string> =
  `${Namespace}:${string}`;

/**
 * A messaging system for controllers.
 *
 * The controller messenger allows registering functions as 'actions' that can be called elsewhere,
 * and it allows publishing and subscribing to events. Both actions and events are identified by
 * unique strings.
 *
 * @template Action - A type union of all Action types.
 * @template Event - A type union of all Event types.
 */
export class ControllerMessenger<
  Action extends ActionConstraint,
  Event extends EventConstraint,
> {
  readonly #actions = new Map<Action['type'], unknown>();

  readonly #events = new Map<Event['type'], EventSubscriptionMap<Event>>();

  readonly #parent:
    | ControllerMessenger<ActionConstraint, EventConstraint>
    | undefined;

  /**
   * A cache of selector return values for their respective handlers.
   */
  readonly #eventPayloadCache = new Map<
    GenericEventHandler,
    unknown | undefined
  >();

  /**
   * Construct a messenger, optionally specifying a parent to extend from.
   *
   * @param options - Options.
   * @param options.parent - The parent messenger.
   */
  constructor({
    parent,
  }: {
    parent?: ControllerMessenger<ActionConstraint, EventConstraint>;
  } = {}) {
    this.#parent = parent;
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
  registerActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
    handler: ActionHandler<Action, ActionType>,
  ) {
    if (this.#actions.has(actionType)) {
      throw new Error(
        `A handler for ${actionType} has already been registered`,
      );
    }
    if (this.#parent) {
      this.#parent.registerActionHandler(actionType, handler);
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
  unregisterActionHandler<ActionType extends Action['type']>(
    actionType: ActionType,
  ) {
    if (this.#parent) {
      this.#parent.unregisterActionHandler(actionType);
    }
    this.#actions.delete(actionType);
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
  publish<EventType extends Event['type']>(
    eventType: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    if (this.#parent) {
      this.#parent.publish(eventType, ...payload);
    }

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
    selector: SelectorFunction<
      ExtractEventPayload<Event, EventType>,
      SelectorReturnValue
    >,
  ): void;

  subscribe<EventType extends Event['type'], SelectorReturnValue>(
    eventType: EventType,
    handler: ExtractEventHandler<Event, EventType>,
    selector?: SelectorFunction<
      ExtractEventPayload<Event, EventType>,
      SelectorReturnValue
    >,
  ): void {
    let subscribers = this.#events.get(eventType);
    if (!subscribers) {
      subscribers = new Map();
      this.#events.set(eventType, subscribers);
    }

    subscribers.set(handler, selector);
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
   * Create another controller messenger that has access to a subset of actions/events.
   *
   * @param args - Arguments.
   * @param args.delegatedActions - Actions to delegate to this child messenger.
   * @param args.delegatedEvents - Events to delegate to this child messenger.
   * @returns A child controller messenger.
   */
  createChildMessenger<
    ChildAction extends ActionConstraint,
    ChildEvent extends EventConstraint,
  >({
    delegatedActions,
    delegatedEvents,
  }: {
    delegatedActions: ChildAction['type'][];
    delegatedEvents: ChildEvent['type'][];
  }): ControllerMessenger<ChildAction, ChildEvent> {
    const childMessenger = new ControllerMessenger<ChildAction, ChildEvent>({
      parent: this,
    });

    for (const delegatedAction of delegatedActions) {
      childMessenger.registerActionHandler(
        delegatedAction,
        // Cast used because I don't know of a way to convince TypeScript that
        // this handler matches the type for this specific action
        this.call.bind(delegatedAction) as ActionHandler<
          ChildAction,
          ChildAction['type']
        >,
      );
    }

    for (const delegatedEvent of delegatedEvents) {
      this.subscribe(
        delegatedEvent,
        // Cast used because I don't know of a way to convince TypeScript that
        // this event handler matches the type for this specific event
        childMessenger.publish.bind(delegatedEvent) as ExtractEventHandler<
          ChildEvent,
          ChildEvent['type']
        >,
      );
    }

    return childMessenger;
  }
}
