declare type ActionHandler<Action, ActionType> = (...args: ExtractActionParameters<Action, ActionType>) => ExtractActionResponse<Action, ActionType>;
declare type ExtractActionParameters<Action, T> = Action extends {
    type: T;
    handler: (...args: infer H) => any;
} ? H : never;
declare type ExtractActionResponse<Action, T> = Action extends {
    type: T;
    handler: (...args: any) => infer H;
} ? H : never;
declare type ExtractEventHandler<Event, T> = Event extends {
    type: T;
    payload: infer P;
} ? P extends any[] ? (...payload: P) => void : never : never;
declare type ExtractEventPayload<Event, T> = Event extends {
    type: T;
    payload: infer P;
} ? P : never;
declare type ActionConstraint = {
    type: string;
    handler: (...args: any) => unknown;
};
declare type EventConstraint = {
    type: string;
    payload: unknown[];
};
/**
 * A namespaced string
 *
 * This type verifies that the string T is prefixed by the string Name followed by a colon.
 *
 * @template Name - The namespace we're checking for.
 * @template T - The full string, including the namespace.
 */
export declare type Namespaced<Name extends string, T> = T extends `${Name}:${string}` ? T : never;
declare type NarrowToNamespace<T, Namespace extends string> = T extends {
    type: `${Namespace}:${string}`;
} ? T : never;
declare type NarrowToAllowed<T, Allowed extends string> = T extends {
    type: Allowed;
} ? T : never;
/**
 * A restricted controller messenger.
 *
 * This acts as a wrapper around the controller messenger instance that restricts access to actions
 * and events.
 *
 * @template N - The namespace for this messenger. Typically this is the name of the controller or
 *   module that this messenger has been created for. The authority to publish events and register
 *   actions under this namespace is granted to this restricted messenger instance.
 * @template Action - A type union of all Action types.
 * @template Event - A type union of all Event types.
 * @template AllowedAction - A type union of the 'type' string for any allowed actions.
 * @template AllowedEvent - A type union of the 'type' string for any allowed events.
 */
export declare class RestrictedControllerMessenger<N extends string, Action extends ActionConstraint, Event extends EventConstraint, AllowedAction extends string, AllowedEvent extends string> {
    private controllerMessenger;
    private controllerName;
    private allowedActions;
    private allowedEvents;
    /**
     * Constructs a restricted controller messenger
     *
     * The provided allowlists grant the ability to call the listed actions and subscribe to the
     * listed events. The "name" provided grants ownership of any actions and events under that
     * namespace. Ownership allows registering actions and publishing events, as well as
     * unregistering actions and clearing event subscriptions.
     *
     * @param options
     * @param options.controllerMessenger - The controller messenger instance that is being wrapped.
     * @param options.name - The name of the thing this messenger will be handed to (e.g. the
     *   controller name). This grants "ownership" of actions and events under this namespace to the
     *   restricted controller messenger returned.
     * @param options.allowedActions - The list of actions that this restricted controller messenger
     *   should be alowed to call.
     * @param options.allowedEvents - The list of events that this restricted controller messenger
     *   should be allowed to subscribe to.
     */
    constructor({ controllerMessenger, name, allowedActions, allowedEvents, }: {
        controllerMessenger: ControllerMessenger<ActionConstraint, EventConstraint>;
        name: N;
        allowedActions?: AllowedAction[];
        allowedEvents?: AllowedEvent[];
    });
    /**
     * Register an action handler.
     *
     * This will make the registered function available to call via the `call` method.
     *
     * The action type this handler is registered under *must* be in the current namespace.
     *
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @param handler- The action handler. This function gets called when the `call` method is
     *   invoked with the given action type.
     * @throws Will throw when a handler has been registered for this action type already.
     * @template T - A type union of Action type strings that are namespaced by N.
     */
    registerActionHandler<T extends Namespaced<N, Action['type']>>(action: T, handler: ActionHandler<Action, T>): void;
    /**
     * Unregister an action handler.
     *
     * This will prevent this action from being called.
     *
     * The action type being unregistered *must* be in the current namespace.
     *
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @template T - A type union of Action type strings that are namespaced by N.
     */
    unregisterActionHandler<T extends Namespaced<N, Action['type']>>(action: T): void;
    /**
     * Call an action.
     *
     * This function will call the action handler corresponding to the given action type, passing
     * along any parameters given.
     *
     * The action type being called must be on the action allowlist.
     *
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @param params - The action parameters. These must match the type of the parameters of the
     *   registered action handler.
     * @throws Will throw when no handler has been registered for the given type.
     * @template T - A type union of allowed Action type strings.
     */
    call<T extends AllowedAction & string>(action: T, ...params: ExtractActionParameters<Action, T>): ExtractActionResponse<Action, T>;
    /**
     * Publish an event.
     *
     * Publishes the given payload to all subscribers of the given event type.
     *
     * The event type being published *must* be in the current namespace.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param payload - The event payload. The type of the parameters for each event handler must
     *   match the type of this payload.
     * @template E - A type union of Event type strings that are namespaced by N.
     */
    publish<E extends Namespaced<N, Event['type']>>(event: E, ...payload: ExtractEventPayload<Event, E>): void;
    /**
     * Subscribe to an event.
     *
     * Registers the given function as an event handler for the given event type.
     *
     * The event type being subscribed to must be on the event allowlist.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param handler - The event handler. The type of the parameters for this event handler must
     *   match the type of the payload for this event type.
     * @template T - A type union of allowed Event type strings.
     */
    subscribe<E extends AllowedEvent & string>(event: E, handler: ExtractEventHandler<Event, E>): void;
    /**
     * Unsubscribe from an event.
     *
     * Unregisters the given function as an event handler for the given event.
     *
     * The event type being unsubscribed to must be on the event allowlist.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param handler - The event handler to unregister.
     * @throws Will throw when the given event handler is not registered for this event.
     * @template T - A type union of allowed Event type strings.
     */
    unsubscribe<E extends AllowedEvent & string>(event: E, handler: ExtractEventHandler<Event, E>): void;
    /**
     * Clear subscriptions for a specific event.
     *
     * This will remove all subscribed handlers for this event.
     *
     * The event type being cleared *must* be in the current namespace.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @template E - A type union of Event type strings that are namespaced by N.
     */
    clearEventSubscriptions<E extends Namespaced<N, Event['type']>>(event: E): void;
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
export declare class ControllerMessenger<Action extends ActionConstraint, Event extends EventConstraint> {
    private actions;
    private events;
    /**
     * Register an action handler.
     *
     * This will make the registered function available to call via the `call` method.
     *
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @param handler- The action handler. This function gets called when the `call` method is
     *   invoked with the given action type.
     * @throws Will throw when a handler has been registered for this action type already.
     * @template T - A type union of Action type strings.
     */
    registerActionHandler<T extends Action['type']>(actionType: T, handler: ActionHandler<Action, T>): void;
    /**
     * Unregister an action handler.
     *
     * This will prevent this action from being called.
     *
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @template T - A type union of Action type strings.
     */
    unregisterActionHandler<T extends Action['type']>(actionType: T): void;
    /**
     * Unregister all action handlers.
     *
     * This prevents all actions from being called.
     */
    clearActions(): void;
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
     * @template T - A type union of Action type strings.
     */
    call<T extends Action['type']>(actionType: T, ...params: ExtractActionParameters<Action, T>): ExtractActionResponse<Action, T>;
    /**
     * Publish an event.
     *
     * Publishes the given payload to all subscribers of the given event type.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param payload - The event payload. The type of the parameters for each event handler must
     *   match the type of this payload.
     * @template E - A type union of Event type strings.
     */
    publish<E extends Event['type']>(eventType: E, ...payload: ExtractEventPayload<Event, E>): void;
    /**
     * Subscribe to an event.
     *
     * Registers the given function as an event handler for the given event type.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param handler - The event handler. The type of the parameters for this event handler must
     *   match the type of the payload for this event type.
     * @template E - A type union of Event type strings.
     */
    subscribe<E extends Event['type']>(eventType: E, handler: ExtractEventHandler<Event, E>): void;
    /**
     * Unsubscribe from an event.
     *
     * Unregisters the given function as an event handler for the given event.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param handler - The event handler to unregister.
     * @throws Will throw when the given event handler is not registered for this event.
     * @template E - A type union of Event type strings.
     */
    unsubscribe<E extends Event['type']>(eventType: E, handler: ExtractEventHandler<Event, E>): void;
    /**
     * Clear subscriptions for a specific event.
     *
     * This will remove all subscribed handlers for this event.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @template E - A type union of Event type strings.
     */
    clearEventSubscriptions<E extends Event['type']>(eventType: E): void;
    /**
     * Clear all subscriptions.
     *
     * This will remove all subscribed handlers for all events.
     */
    clearSubscriptions(): void;
    /**
     * Get a restricted controller messenger
     *
     * Returns a wrapper around the controller messenger instance that restricts access to actions
     * and events. The provided allowlists grant the ability to call the listed actions and subscribe
     * to the listed events. The "name" provided grants ownership of any actions and events under
     * that namespace. Ownership allows registering actions and publishing events, as well as
     * unregistering actions and clearing event subscriptions.
     *
     * @param options
     * @param options.name - The name of the thing this messenger will be handed to (e.g. the
     *   controller name). This grants "ownership" of actions and events under this namespace to the
     *   restricted controller messenger returned.
     * @param options.allowedActions - The list of actions that this restricted controller messenger
     *   should be alowed to call.
     * @param options.allowedEvents - The list of events that this restricted controller messenger
     *   should be allowed to subscribe to.
     * @template N - The namespace for this messenger. Typically this is the name of the controller or
     *   module that this messenger has been created for. The authority to publish events and register
     *   actions under this namespace is granted to this restricted messenger instance.
     * @template AllowedAction - A type union of the 'type' string for any allowed actions.
     * @template AllowedEvent - A type union of the 'type' string for any allowed events.
     */
    getRestricted<N extends string, AllowedAction extends string, AllowedEvent extends string>({ name, allowedActions, allowedEvents, }: {
        name: N;
        allowedActions?: Extract<Action['type'], AllowedAction>[];
        allowedEvents?: Extract<Event['type'], AllowedEvent>[];
    }): RestrictedControllerMessenger<N, NarrowToNamespace<Action, N> | NarrowToAllowed<Action, AllowedAction>, NarrowToNamespace<Event, N> | NarrowToAllowed<Event, AllowedEvent>, AllowedAction, AllowedEvent>;
}
export {};
