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
  handler: (...args: never[]) => infer HandlerReturnValue;
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
  ? Payload
  : never;

export type GenericEventHandler = (...args: unknown[]) => void;

export type SelectorFunction<Args extends unknown[], ReturnValue> = (
  ...args: Args
) => ReturnValue;
export type SelectorEventHandler<SelectorReturnValue> = (
  newValue: SelectorReturnValue,
  previousValue: SelectorReturnValue | undefined,
) => void;

export type ActionConstraint = {
  type: string;
  handler: (...args: never[]) => unknown;
};
export type EventConstraint = {
  type: string;
  payload: unknown[];
};

type EventSubscriptionMap = Map<
  GenericEventHandler | SelectorEventHandler<unknown>,
  SelectorFunction<unknown[], unknown> | undefined
>;

/**
 * A namespaced string
 *
 * This type verifies that the string Name is prefixed by the string Name followed by a colon.
 *
 * @template Namespace - The namespace we're checking for.
 * @template Name - The full string, including the namespace.
 */
export type Namespaced<
  Namespace extends string,
  Name,
> = Name extends `${Namespace}:${string}` ? Name : never;

type NarrowToNamespace<Name, Namespace extends string> = Name extends {
  type: `${Namespace}:${string}`;
}
  ? Name
  : never;

type NarrowToAllowed<Name, Allowed extends string> = Name extends {
  type: Allowed;
}
  ? Name
  : never;

/**
 * A restricted controller messenger.
 *
 * This acts as a wrapper around the controller messenger instance that restricts access to actions
 * and events.
 *
 * @template Namespace - The namespace for this messenger. Typically this is the name of the controller or
 * module that this messenger has been created for. The authority to publish events and register
 * actions under this namespace is granted to this restricted messenger instance.
 * @template Action - A type union of all Action types.
 * @template Event - A type union of all Event types.
 * @template AllowedAction - A type union of the 'type' string for any allowed actions.
 * @template AllowedEvent - A type union of the 'type' string for any allowed events.
 */
export class RestrictedControllerMessenger<
  Namespace extends string,
  Action extends ActionConstraint,
  Event extends EventConstraint,
  AllowedAction extends string,
  AllowedEvent extends string,
> {
  private readonly controllerMessenger: ControllerMessenger<
    ActionConstraint,
    EventConstraint
  >;

  private readonly controllerName: Namespace;

  private readonly allowedActions: AllowedAction[] | null;

  private readonly allowedEvents: AllowedEvent[] | null;

  /**
   * Constructs a restricted controller messenger
   *
   * The provided allowlists grant the ability to call the listed actions and subscribe to the
   * listed events. The "name" provided grants ownership of any actions and events under that
   * namespace. Ownership allows registering actions and publishing events, as well as
   * unregistering actions and clearing event subscriptions.
   *
   * @param options - The controller options.
   * @param options.controllerMessenger - The controller messenger instance that is being wrapped.
   * @param options.name - The name of the thing this messenger will be handed to (e.g. the
   * controller name). This grants "ownership" of actions and events under this namespace to the
   * restricted controller messenger returned.
   * @param options.allowedActions - The list of actions that this restricted controller messenger
   * should be alowed to call.
   * @param options.allowedEvents - The list of events that this restricted controller messenger
   * should be allowed to subscribe to.
   */
  constructor({
    controllerMessenger,
    name,
    allowedActions,
    allowedEvents,
  }: {
    controllerMessenger: ControllerMessenger<ActionConstraint, EventConstraint>;
    name: Namespace;
    allowedActions?: AllowedAction[];
    allowedEvents?: AllowedEvent[];
  }) {
    this.controllerMessenger = controllerMessenger;
    this.controllerName = name;
    this.allowedActions = allowedActions || null;
    this.allowedEvents = allowedEvents || null;
  }

  /**
   * Register an action handler.
   *
   * This will make the registered function available to call via the `call` method.
   *
   * The action type this handler is registered under *must* be in the current namespace.
   *
   * @param action - The action type. This is a unqiue identifier for this action.
   * @param handler - The action handler. This function gets called when the `call` method is
   * invoked with the given action type.
   * @throws Will throw if an action handler that is not in the current namespace is being registered.
   * @template ActionType - A type union of Action type strings that are namespaced by Namespace.
   */
  registerActionHandler<ActionType extends Action['type']>(
    action: ActionType,
    handler: ActionHandler<Action, ActionType>,
  ) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!action.startsWith(`${this.controllerName}:`)) {
      throw new Error(
        `Only allowed registering action handlers prefixed by '${this.controllerName}:'`,
      );
    }
    this.controllerMessenger.registerActionHandler(action, handler);
  }

  /**
   * Unregister an action handler.
   *
   * This will prevent this action from being called.
   *
   * The action type being unregistered *must* be in the current namespace.
   *
   * @param action - The action type. This is a unqiue identifier for this action.
   * @template ActionType - A type union of Action type strings that are namespaced by Namespace.
   */
  unregisterActionHandler<
    ActionType extends Namespaced<Namespace, Action['type']>,
  >(action: ActionType) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!action.startsWith(`${this.controllerName}:`)) {
      throw new Error(
        `Only allowed unregistering action handlers prefixed by '${this.controllerName}:'`,
      );
    }
    this.controllerMessenger.unregisterActionHandler(action);
  }

  /**
   * Call an action.
   *
   * This function will call the action handler corresponding to the given action type, passing
   * along any parameters given.
   *
   * The action type being called must be on the action allowlist.
   *
   * @param action - The action type. This is a unqiue identifier for this action.
   * @param params - The action parameters. These must match the type of the parameters of the
   * registered action handler.
   * @throws Will throw when no handler has been registered for the given type.
   * @template ActionType - A type union of allowed Action type strings.
   * @returns The action return value.
   */
  call<ActionType extends AllowedAction & string>(
    action: ActionType,
    ...params: ExtractActionParameters<Action, ActionType>
  ): ExtractActionResponse<Action, ActionType> {
    /* istanbul ignore next */ // Branches unreachable with valid types
    if (this.allowedActions === null) {
      throw new Error('No actions allowed');
    } else if (!this.allowedActions.includes(action)) {
      throw new Error(`Action missing from allow list: ${action}`);
    }
    return this.controllerMessenger.call(action, ...params);
  }

  /**
   * Publish an event.
   *
   * Publishes the given payload to all subscribers of the given event type.
   *
   * The event type being published *must* be in the current namespace.
   *
   * @param event - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   * match the type of this payload.
   * @template EventType - A type union of Event type strings that are namespaced by Namespace.
   */
  publish<EventType extends Namespaced<Namespace, Event['type']>>(
    event: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!event.startsWith(`${this.controllerName}:`)) {
      throw new Error(
        `Only allowed publishing events prefixed by '${this.controllerName}:'`,
      );
    }
    this.controllerMessenger.publish(event, ...payload);
  }

  /**
   * Subscribe to an event.
   *
   * Registers the given function as an event handler for the given event type.
   *
   * The event type being subscribed to must be on the event allowlist.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param handler - The event handler. The type of the parameters for this event handler must
   * match the type of the payload for this event type.
   * @template EventType - A type union of Event type strings.
   */
  subscribe<EventType extends AllowedEvent & string>(
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
   * The event type being subscribed to must be on the event allowlist.
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
  subscribe<EventType extends AllowedEvent & string, SelectorReturnValue>(
    eventType: EventType,
    handler: SelectorEventHandler<SelectorReturnValue>,
    selector: SelectorFunction<
      ExtractEventPayload<Event, EventType>,
      SelectorReturnValue
    >,
  ): void;

  subscribe<EventType extends AllowedEvent & string, SelectorReturnValue>(
    event: EventType,
    handler: ExtractEventHandler<Event, EventType>,
    selector?: SelectorFunction<
      ExtractEventPayload<Event, EventType>,
      SelectorReturnValue
    >,
  ) {
    /* istanbul ignore next */ // Branches unreachable with valid types
    if (this.allowedEvents === null) {
      throw new Error('No events allowed');
    } else if (!this.allowedEvents.includes(event)) {
      throw new Error(`Event missing from allow list: ${event}`);
    }

    if (selector) {
      return this.controllerMessenger.subscribe(event, handler, selector);
    }
    return this.controllerMessenger.subscribe(event, handler);
  }

  /**
   * Unsubscribe from an event.
   *
   * Unregisters the given function as an event handler for the given event.
   *
   * The event type being unsubscribed to must be on the event allowlist.
   *
   * @param event - The event type. This is a unique identifier for this event.
   * @param handler - The event handler to unregister.
   * @throws Will throw when the given event handler is not registered for this event.
   * @template EventType - A type union of allowed Event type strings.
   */
  unsubscribe<EventType extends AllowedEvent & string>(
    event: EventType,
    handler: ExtractEventHandler<Event, EventType>,
  ) {
    /* istanbul ignore next */ // Branches unreachable with valid types
    if (this.allowedEvents === null) {
      throw new Error('No events allowed');
    } else if (!this.allowedEvents.includes(event)) {
      throw new Error(`Event missing from allow list: ${event}`);
    }
    this.controllerMessenger.unsubscribe(event, handler);
  }

  /**
   * Clear subscriptions for a specific event.
   *
   * This will remove all subscribed handlers for this event.
   *
   * The event type being cleared *must* be in the current namespace.
   *
   * @param event - The event type. This is a unique identifier for this event.
   * @template EventType - A type union of Event type strings that are namespaced by Namespace.
   */
  clearEventSubscriptions<
    EventType extends Namespaced<Namespace, Event['type']>,
  >(event: EventType) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!event.startsWith(`${this.controllerName}:`)) {
      throw new Error(
        `Only allowed clearing events prefixed by '${this.controllerName}:'`,
      );
    }
    this.controllerMessenger.clearEventSubscriptions(event);
  }
}

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
  private readonly actions = new Map<Action['type'], unknown>();

  private readonly events = new Map<Event['type'], EventSubscriptionMap>();

  /**
   * A cache of selector return values for their respective handlers.
   */
  private readonly eventPayloadCache = new Map<
    GenericEventHandler,
    unknown | undefined
  >();

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
    if (this.actions.has(actionType)) {
      throw new Error(
        `A handler for ${actionType} has already been registered`,
      );
    }
    this.actions.set(actionType, handler);
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
    this.actions.delete(actionType);
  }

  /**
   * Unregister all action handlers.
   *
   * This prevents all actions from being called.
   */
  clearActions() {
    this.actions.clear();
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
    const handler = this.actions.get(actionType) as ActionHandler<
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
    const subscribers = this.events.get(eventType);

    if (subscribers) {
      for (const [handler, selector] of subscribers.entries()) {
        try {
          if (selector) {
            const previousValue = this.eventPayloadCache.get(handler);
            const newValue = selector(...payload);

            if (newValue !== previousValue) {
              this.eventPayloadCache.set(handler, newValue);
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
    let subscribers = this.events.get(eventType);
    if (!subscribers) {
      subscribers = new Map();
      this.events.set(eventType, subscribers);
    }

    subscribers.set(
      handler,
      selector as SelectorFunction<unknown[], SelectorReturnValue>,
    );
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
    const subscribers = this.events.get(eventType);

    if (!subscribers || !subscribers.has(handler)) {
      throw new Error(`Subscription not found for event: ${eventType}`);
    }

    const selector = subscribers.get(handler);
    if (selector) {
      this.eventPayloadCache.delete(handler);
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
    this.events.delete(eventType);
  }

  /**
   * Clear all subscriptions.
   *
   * This will remove all subscribed handlers for all events.
   */
  clearSubscriptions() {
    this.events.clear();
  }

  /**
   * Get a restricted controller messenger
   *
   * Returns a wrapper around the controller messenger instance that restricts access to actions
   * and events. The provided allowlists grant the ability to call the listed actions and subscribe
   * to the listed events. The "name" provided grants ownership of any actions and events under
   * that namespace. Ownership allows registering actions and publishing events, as well as
   * unregistering actions and clearing event subscriptions.
   *
   * @param options - Controller messenger options.
   * @param options.name - The name of the thing this messenger will be handed to (e.g. the
   * controller name). This grants "ownership" of actions and events under this namespace to the
   * restricted controller messenger returned.
   * @param options.allowedActions - The list of actions that this restricted controller messenger
   * should be alowed to call.
   * @param options.allowedEvents - The list of events that this restricted controller messenger
   * should be allowed to subscribe to.
   * @template Namespace - The namespace for this messenger. Typically this is the name of the controller or
   * module that this messenger has been created for. The authority to publish events and register
   * actions under this namespace is granted to this restricted messenger instance.
   * @template AllowedAction - A type union of the 'type' string for any allowed actions.
   * @template AllowedEvent - A type union of the 'type' string for any allowed events.
   * @returns The restricted controller messenger.
   */
  getRestricted<
    Namespace extends string,
    AllowedAction extends string,
    AllowedEvent extends string,
  >({
    name,
    allowedActions,
    allowedEvents,
  }: {
    name: Namespace;
    allowedActions?: Extract<Action['type'], AllowedAction>[];
    allowedEvents?: Extract<Event['type'], AllowedEvent>[];
  }): RestrictedControllerMessenger<
    Namespace,
    | NarrowToNamespace<Action, Namespace>
    | NarrowToAllowed<Action, AllowedAction>,
    NarrowToNamespace<Event, Namespace> | NarrowToAllowed<Event, AllowedEvent>,
    AllowedAction,
    AllowedEvent
  > {
    return new RestrictedControllerMessenger<
      Namespace,
      | NarrowToNamespace<Action, Namespace>
      | NarrowToAllowed<Action, AllowedAction>,
      | NarrowToNamespace<Event, Namespace>
      | NarrowToAllowed<Event, AllowedEvent>,
      AllowedAction,
      AllowedEvent
    >({
      controllerMessenger: this,
      name,
      allowedActions,
      allowedEvents,
    });
  }
}
