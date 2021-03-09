export type ActionHandler<Action, ActionType> = (
  ...args: ExtractActionParameters<Action, ActionType>
) => ExtractActionResponse<Action, ActionType>;
export type ExtractActionParameters<Action, T> = Action extends { type: T; handler: (...args: infer H) => any }
  ? H
  : never;
export type ExtractActionResponse<Action, T> = Action extends { type: T; handler: (...args: any) => infer H }
  ? H
  : never;

export type ExtractEvenHandler<Event, T> = Event extends { type: T; payload: infer P }
  ? P extends any[]
    ? (...payload: P) => void
    : never
  : never;
export type ExtractEventPayload<Event, T> = Event extends { type: T; payload: infer P } ? P : never;

type ActionConstraint = { type: string; handler: (...args: any) => unknown };
type EventConstraint = { type: string; payload: unknown[] };

/**
 * A messaging system for controllers.
 *
 * The controller messenger allows registering functions as 'actions' that can be called elsewhere,
 * and it allows publishing and subscribing to events. Both actions and events are identified by
 * unique strings.
 */
export class ControllerMessenger<Action extends ActionConstraint, Event extends EventConstraint> {
  private actions = new Map<Action['type'], unknown>();

  private events = new Map<Event['type'], Set<unknown>>();

  /**
   * Register an action handler.
   *
   * This will make the registered function available to call via the `call` method.
   *
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @param handler- The action handler. This function gets called when the `call` method is
   *   invoked with the given action type.
   * @throws Will throw when a handler has been registered for this action type already.
   */
  registerActionHandler<T extends Action['type']>(actionType: T, handler: ActionHandler<Action, T>) {
    if (this.actions.has(actionType)) {
      throw new Error(`A handler for ${actionType} has already been registered`);
    }
    this.actions.set(actionType, handler);
  }

  /**
   * Unregister an action handler.
   *
   * This will prevent this action from being called.
   *
   * @param actionType - The action type. This is a unqiue identifier for this action.
   */
  unregisterActionHandler<T extends Action['type']>(actionType: T) {
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
   *   registered action handler.
   * @throws Will throw when no handler has been registered for the given type.
   */
  call<T extends Action['type']>(
    actionType: T,
    ...params: ExtractActionParameters<Action, T>
  ): ExtractActionResponse<Action, T> {
    const handler = this.actions.get(actionType) as ActionHandler<Action, T>;
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
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param payload - The event payload. The type of the parameters for each event handler must
   *   match the type of this payload.
   */
  publish<E extends Event['type']>(eventType: E, ...payload: ExtractEventPayload<Event, E>) {
    const subscribers = this.events.get(eventType) as Set<ExtractEvenHandler<Event, E>>;

    if (subscribers) {
      for (const eventHandler of subscribers) {
        eventHandler(...payload);
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
   *   match the type of the payload for this event type.
   */
  subscribe<E extends Event['type']>(eventType: E, handler: ExtractEvenHandler<Event, E>) {
    let subscribers = this.events.get(eventType);
    if (!subscribers) {
      subscribers = new Set();
    }
    subscribers.add(handler);
    this.events.set(eventType, subscribers);
  }

  /**
   * Unsubscribe from an event.
   *
   * Unregisters the given function as an event handler for the given event.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   * @param handler - The event handler to unregister.
   * @throws Will throw when the given event handler is not registered for this event.
   */
  unsubscribe<E extends Event['type']>(eventType: E, handler: ExtractEvenHandler<Event, E>) {
    const subscribers = this.events.get(eventType);

    if (!subscribers || !subscribers.has(handler)) {
      throw new Error(`Subscription not found for event: '${eventType}'`);
    }

    subscribers.delete(handler);
    this.events.set(eventType, subscribers);
  }

  /**
   * Clear subscriptions for a specific event.
   *
   * This will remove all subscribed handlers for this event.
   *
   * @param eventType - The event type. This is a unique identifier for this event.
   */
  clearEventSubscriptions<E extends Event['type']>(eventType: E) {
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
}
