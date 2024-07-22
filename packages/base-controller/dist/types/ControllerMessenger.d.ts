import { RestrictedControllerMessenger } from './RestrictedControllerMessenger';
export type ActionHandler<Action extends ActionConstraint, ActionType = Action['type']> = (...args: ExtractActionParameters<Action, ActionType>) => ExtractActionResponse<Action, ActionType>;
export type ExtractActionParameters<Action extends ActionConstraint, ActionType = Action['type']> = Action extends {
    type: ActionType;
    handler: (...args: infer HandlerArgs) => unknown;
} ? HandlerArgs : never;
export type ExtractActionResponse<Action extends ActionConstraint, ActionType = Action['type']> = Action extends {
    type: ActionType;
    handler: (...args: infer _) => infer HandlerReturnValue;
} ? HandlerReturnValue : never;
export type ExtractEventHandler<Event extends EventConstraint, EventType = Event['type']> = Event extends {
    type: EventType;
    payload: infer Payload;
} ? Payload extends unknown[] ? (...payload: Payload) => void : never : never;
export type ExtractEventPayload<Event extends EventConstraint, EventType = Event['type']> = Event extends {
    type: EventType;
    payload: infer Payload;
} ? Payload extends unknown[] ? Payload : never : never;
export type GenericEventHandler = (...args: unknown[]) => void;
export type SelectorFunction<Event extends EventConstraint, EventType extends Event['type'], ReturnValue> = (...args: ExtractEventPayload<Event, EventType>) => ReturnValue;
export type SelectorEventHandler<SelectorReturnValue> = (newValue: SelectorReturnValue, previousValue: SelectorReturnValue | undefined) => void;
export type ActionConstraint = {
    type: string;
    handler: ((...args: never) => unknown) | ((...args: never[]) => unknown);
};
export type EventConstraint = {
    type: string;
    payload: unknown[];
};
/**
 * A namespaced string
 *
 * This type verifies that the string Name is prefixed by the string Name followed by a colon.
 *
 * @template Namespace - The namespace we're checking for.
 * @template Name - The full string, including the namespace.
 */
export type NamespacedBy<Namespace extends string, Name extends string> = Name extends `${Namespace}:${string}` ? Name : never;
export type NotNamespacedBy<Namespace extends string, Name extends string> = Name extends `${Namespace}:${string}` ? never : Name;
export type NamespacedName<Namespace extends string = string> = `${Namespace}:${string}`;
type NarrowToNamespace<Name, Namespace extends string> = Name extends {
    type: `${Namespace}:${string}`;
} ? Name : never;
type NarrowToAllowed<Name, Allowed extends string> = Name extends {
    type: Allowed;
} ? Name : never;
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
    #private;
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
    registerActionHandler<ActionType extends Action['type']>(actionType: ActionType, handler: ActionHandler<Action, ActionType>): void;
    /**
     * Unregister an action handler.
     *
     * This will prevent this action from being called.
     *
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @template ActionType - A type union of Action type strings.
     */
    unregisterActionHandler<ActionType extends Action['type']>(actionType: ActionType): void;
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
     * registered action handler.
     * @throws Will throw when no handler has been registered for the given type.
     * @template ActionType - A type union of Action type strings.
     * @returns The action return value.
     */
    call<ActionType extends Action['type']>(actionType: ActionType, ...params: ExtractActionParameters<Action, ActionType>): ExtractActionResponse<Action, ActionType>;
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
    registerInitialEventPayload<EventType extends Event['type']>({ eventType, getPayload, }: {
        eventType: EventType;
        getPayload: () => ExtractEventPayload<Event, EventType>;
    }): void;
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
    publish<EventType extends Event['type']>(eventType: EventType, ...payload: ExtractEventPayload<Event, EventType>): void;
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
    subscribe<EventType extends Event['type']>(eventType: EventType, handler: ExtractEventHandler<Event, EventType>): void;
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
    subscribe<EventType extends Event['type'], SelectorReturnValue>(eventType: EventType, handler: SelectorEventHandler<SelectorReturnValue>, selector: SelectorFunction<Event, EventType, SelectorReturnValue>): void;
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
    unsubscribe<EventType extends Event['type']>(eventType: EventType, handler: ExtractEventHandler<Event, EventType>): void;
    /**
     * Clear subscriptions for a specific event.
     *
     * This will remove all subscribed handlers for this event.
     *
     * @param eventType - The event type. This is a unique identifier for this event.
     * @template EventType - A type union of Event type strings.
     */
    clearEventSubscriptions<EventType extends Event['type']>(eventType: EventType): void;
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
     * This must not include internal actions that are in the messenger's namespace.
     * @template AllowedEvent - A type union of the 'type' string for any allowed events.
     * This must not include internal events that are in the messenger's namespace.
     * @returns The restricted controller messenger.
     */
    getRestricted<Namespace extends string, AllowedAction extends NotNamespacedBy<Namespace, Action['type']> = never, AllowedEvent extends NotNamespacedBy<Namespace, Event['type']> = never>({ name, allowedActions, allowedEvents, }: {
        name: Namespace;
        allowedActions: NotNamespacedBy<Namespace, Extract<Action['type'], AllowedAction>>[];
        allowedEvents: NotNamespacedBy<Namespace, Extract<Event['type'], AllowedEvent>>[];
    }): RestrictedControllerMessenger<Namespace, NarrowToNamespace<Action, Namespace> | NarrowToAllowed<Action, AllowedAction>, NarrowToNamespace<Event, Namespace> | NarrowToAllowed<Event, AllowedEvent>, AllowedAction, AllowedEvent>;
}
export {};
//# sourceMappingURL=ControllerMessenger.d.ts.map