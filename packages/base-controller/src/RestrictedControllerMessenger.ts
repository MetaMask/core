import type {
  ActionConstraint,
  ActionHandler,
  ControllerMessenger,
  EventConstraint,
  ExtractActionParameters,
  ExtractActionResponse,
  ExtractEventHandler,
  ExtractEventPayload,
  NamespacedName,
  SelectorEventHandler,
  SelectorFunction,
} from './ControllerMessenger';

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
  readonly #controllerMessenger: ControllerMessenger<
    ActionConstraint,
    EventConstraint
  >;

  readonly #controllerName: Namespace;

  readonly #allowedActions: AllowedAction[] | null;

  readonly #allowedEvents: AllowedEvent[] | null;

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
    this.#controllerMessenger = controllerMessenger;
    this.#controllerName = name;
    this.#allowedActions = allowedActions || null;
    this.#allowedEvents = allowedEvents || null;
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
    if (!action.startsWith(`${this.#controllerName}:`)) {
      throw new Error(
        `Only allowed registering action handlers prefixed by '${
          this.#controllerName
        }:'`,
      );
    }
    this.#controllerMessenger.registerActionHandler(action, handler);
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
  unregisterActionHandler<ActionType extends NamespacedName<Namespace>>(
    action: ActionType,
  ) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!action.startsWith(`${this.#controllerName}:`)) {
      throw new Error(
        `Only allowed unregistering action handlers prefixed by '${
          this.#controllerName
        }:'`,
      );
    }
    this.#controllerMessenger.unregisterActionHandler(action);
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
  call<ActionType extends AllowedAction & NamespacedName>(
    action: ActionType,
    ...params: ExtractActionParameters<Action, ActionType>
  ): ExtractActionResponse<Action, ActionType> {
    /* istanbul ignore next */ // Branches unreachable with valid types
    if (this.#allowedActions === null) {
      throw new Error('No actions allowed');
    } else if (!this.#allowedActions.includes(action)) {
      throw new Error(`Action missing from allow list: ${action}`);
    }
    return this.#controllerMessenger.call(action, ...params);
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
  publish<EventType extends NamespacedName<Namespace>>(
    event: EventType,
    ...payload: ExtractEventPayload<Event, EventType>
  ) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!event.startsWith(`${this.#controllerName}:`)) {
      throw new Error(
        `Only allowed publishing events prefixed by '${this.#controllerName}:'`,
      );
    }
    this.#controllerMessenger.publish(event, ...payload);
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
  subscribe<EventType extends AllowedEvent & NamespacedName>(
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
  subscribe<
    EventType extends AllowedEvent & NamespacedName,
    SelectorReturnValue,
  >(
    eventType: EventType,
    handler: SelectorEventHandler<SelectorReturnValue>,
    selector: SelectorFunction<
      ExtractEventPayload<Event, EventType>,
      SelectorReturnValue
    >,
  ): void;

  subscribe<
    EventType extends AllowedEvent & NamespacedName,
    SelectorReturnValue,
  >(
    event: EventType,
    handler: ExtractEventHandler<Event, EventType>,
    selector?: SelectorFunction<
      ExtractEventPayload<Event, EventType>,
      SelectorReturnValue
    >,
  ) {
    /* istanbul ignore next */ // Branches unreachable with valid types
    if (this.#allowedEvents === null) {
      throw new Error('No events allowed');
    } else if (!this.#allowedEvents.includes(event)) {
      throw new Error(`Event missing from allow list: ${event}`);
    }

    if (selector) {
      return this.#controllerMessenger.subscribe(event, handler, selector);
    }
    return this.#controllerMessenger.subscribe(event, handler);
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
  unsubscribe<EventType extends AllowedEvent & NamespacedName>(
    event: EventType,
    handler: ExtractEventHandler<Event, EventType>,
  ) {
    /* istanbul ignore next */ // Branches unreachable with valid types
    if (this.#allowedEvents === null) {
      throw new Error('No events allowed');
    } else if (!this.#allowedEvents.includes(event)) {
      throw new Error(`Event missing from allow list: ${event}`);
    }
    this.#controllerMessenger.unsubscribe(event, handler);
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
  clearEventSubscriptions<EventType extends NamespacedName<Namespace>>(
    event: EventType,
  ) {
    /* istanbul ignore if */ // Branch unreachable with valid types
    if (!event.startsWith(`${this.#controllerName}:`)) {
      throw new Error(
        `Only allowed clearing events prefixed by '${this.#controllerName}:'`,
      );
    }
    this.#controllerMessenger.clearEventSubscriptions(event);
  }
}
