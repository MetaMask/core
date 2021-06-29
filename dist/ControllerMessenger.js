"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ControllerMessenger = exports.RestrictedControllerMessenger = void 0;
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
class RestrictedControllerMessenger {
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
    constructor({ controllerMessenger, name, allowedActions, allowedEvents, }) {
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
     * @param actionType - The action type. This is a unqiue identifier for this action.
     * @param handler- The action handler. This function gets called when the `call` method is
     *   invoked with the given action type.
     * @throws Will throw when a handler has been registered for this action type already.
     * @template T - A type union of Action type strings that are namespaced by N.
     */
    registerActionHandler(action, handler) {
        /* istanbul ignore if */ // Branch unreachable with valid types
        if (!action.startsWith(`${this.controllerName}:`)) {
            throw new Error(`Only allowed registering action handlers prefixed by '${this.controllerName}:'`);
        }
        return this.controllerMessenger.registerActionHandler(action, handler);
    }
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
    unregisterActionHandler(action) {
        /* istanbul ignore if */ // Branch unreachable with valid types
        if (!action.startsWith(`${this.controllerName}:`)) {
            throw new Error(`Only allowed unregistering action handlers prefixed by '${this.controllerName}:'`);
        }
        return this.controllerMessenger.unregisterActionHandler(action);
    }
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
    call(action, ...params) {
        /* istanbul ignore next */ // Branches unreachable with valid types
        if (this.allowedActions === null) {
            throw new Error('No actions allowed');
        }
        else if (!this.allowedActions.includes(action)) {
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
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param payload - The event payload. The type of the parameters for each event handler must
     *   match the type of this payload.
     * @template E - A type union of Event type strings that are namespaced by N.
     */
    publish(event, ...payload) {
        /* istanbul ignore if */ // Branch unreachable with valid types
        if (!event.startsWith(`${this.controllerName}:`)) {
            throw new Error(`Only allowed publishing events prefixed by '${this.controllerName}:'`);
        }
        return this.controllerMessenger.publish(event, ...payload);
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
     *   match the type of the payload for this event type.
     * @template T - A type union of allowed Event type strings.
     */
    subscribe(event, handler) {
        /* istanbul ignore next */ // Branches unreachable with valid types
        if (this.allowedEvents === null) {
            throw new Error('No events allowed');
        }
        else if (!this.allowedEvents.includes(event)) {
            throw new Error(`Event missing from allow list: ${event}`);
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
     * @param eventType - The event type. This is a unique identifier for this event.
     * @param handler - The event handler to unregister.
     * @throws Will throw when the given event handler is not registered for this event.
     * @template T - A type union of allowed Event type strings.
     */
    unsubscribe(event, handler) {
        /* istanbul ignore next */ // Branches unreachable with valid types
        if (this.allowedEvents === null) {
            throw new Error('No events allowed');
        }
        else if (!this.allowedEvents.includes(event)) {
            throw new Error(`Event missing from allow list: ${event}`);
        }
        return this.controllerMessenger.unsubscribe(event, handler);
    }
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
    clearEventSubscriptions(event) {
        /* istanbul ignore if */ // Branch unreachable with valid types
        if (!event.startsWith(`${this.controllerName}:`)) {
            throw new Error(`Only allowed clearing events prefixed by '${this.controllerName}:'`);
        }
        return this.controllerMessenger.clearEventSubscriptions(event);
    }
}
exports.RestrictedControllerMessenger = RestrictedControllerMessenger;
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
class ControllerMessenger {
    constructor() {
        this.actions = new Map();
        this.events = new Map();
    }
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
    registerActionHandler(actionType, handler) {
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
     * @template T - A type union of Action type strings.
     */
    unregisterActionHandler(actionType) {
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
     * @template T - A type union of Action type strings.
     */
    call(actionType, ...params) {
        const handler = this.actions.get(actionType);
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
     * @template E - A type union of Event type strings.
     */
    publish(eventType, ...payload) {
        const subscribers = this.events.get(eventType);
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
     * @template E - A type union of Event type strings.
     */
    subscribe(eventType, handler) {
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
     * @template E - A type union of Event type strings.
     */
    unsubscribe(eventType, handler) {
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
     * @template E - A type union of Event type strings.
     */
    clearEventSubscriptions(eventType) {
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
    getRestricted({ name, allowedActions, allowedEvents, }) {
        return new RestrictedControllerMessenger({
            controllerMessenger: this,
            name,
            allowedActions,
            allowedEvents,
        });
    }
}
exports.ControllerMessenger = ControllerMessenger;
//# sourceMappingURL=ControllerMessenger.js.map