import {
  RestrictedControllerMessenger
} from "./chunk-EJ5YPJOH.mjs";
import {
  __privateAdd,
  __privateGet
} from "./chunk-XUI43LEZ.mjs";

// src/ControllerMessenger.ts
var _actions, _events, _initialEventPayloadGetters, _eventPayloadCache;
var ControllerMessenger = class {
  constructor() {
    __privateAdd(this, _actions, /* @__PURE__ */ new Map());
    __privateAdd(this, _events, /* @__PURE__ */ new Map());
    /**
     * A map of functions for getting the initial event payload.
     *
     * Used only for events that represent state changes.
     */
    __privateAdd(this, _initialEventPayloadGetters, /* @__PURE__ */ new Map());
    /**
     * A cache of selector return values for their respective handlers.
     */
    __privateAdd(this, _eventPayloadCache, /* @__PURE__ */ new Map());
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
  registerActionHandler(actionType, handler) {
    if (__privateGet(this, _actions).has(actionType)) {
      throw new Error(
        `A handler for ${actionType} has already been registered`
      );
    }
    __privateGet(this, _actions).set(actionType, handler);
  }
  /**
   * Unregister an action handler.
   *
   * This will prevent this action from being called.
   *
   * @param actionType - The action type. This is a unqiue identifier for this action.
   * @template ActionType - A type union of Action type strings.
   */
  unregisterActionHandler(actionType) {
    __privateGet(this, _actions).delete(actionType);
  }
  /**
   * Unregister all action handlers.
   *
   * This prevents all actions from being called.
   */
  clearActions() {
    __privateGet(this, _actions).clear();
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
  call(actionType, ...params) {
    const handler = __privateGet(this, _actions).get(actionType);
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
  registerInitialEventPayload({
    eventType,
    getPayload
  }) {
    __privateGet(this, _initialEventPayloadGetters).set(eventType, getPayload);
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
  publish(eventType, ...payload) {
    const subscribers = __privateGet(this, _events).get(eventType);
    if (subscribers) {
      for (const [handler, selector] of subscribers.entries()) {
        try {
          if (selector) {
            const previousValue = __privateGet(this, _eventPayloadCache).get(handler);
            const newValue = selector(...payload);
            if (newValue !== previousValue) {
              __privateGet(this, _eventPayloadCache).set(handler, newValue);
              handler(newValue, previousValue);
            }
          } else {
            handler(...payload);
          }
        } catch (error) {
          setTimeout(() => {
            throw error;
          });
        }
      }
    }
  }
  subscribe(eventType, handler, selector) {
    let subscribers = __privateGet(this, _events).get(eventType);
    if (!subscribers) {
      subscribers = /* @__PURE__ */ new Map();
      __privateGet(this, _events).set(eventType, subscribers);
    }
    subscribers.set(handler, selector);
    if (selector) {
      const getPayload = __privateGet(this, _initialEventPayloadGetters).get(eventType);
      if (getPayload) {
        const initialValue = selector(...getPayload());
        __privateGet(this, _eventPayloadCache).set(handler, initialValue);
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
  unsubscribe(eventType, handler) {
    const subscribers = __privateGet(this, _events).get(eventType);
    if (!subscribers || !subscribers.has(handler)) {
      throw new Error(`Subscription not found for event: ${eventType}`);
    }
    const selector = subscribers.get(handler);
    if (selector) {
      __privateGet(this, _eventPayloadCache).delete(handler);
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
  clearEventSubscriptions(eventType) {
    __privateGet(this, _events).delete(eventType);
  }
  /**
   * Clear all subscriptions.
   *
   * This will remove all subscribed handlers for all events.
   */
  clearSubscriptions() {
    __privateGet(this, _events).clear();
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
   * This must not include internal actions that are in the messenger's namespace.
   * @template AllowedEvent - A type union of the 'type' string for any allowed events.
   * This must not include internal events that are in the messenger's namespace.
   * @returns The restricted controller messenger.
   */
  getRestricted({
    name,
    allowedActions,
    allowedEvents
  }) {
    return new RestrictedControllerMessenger({
      controllerMessenger: this,
      name,
      allowedActions,
      allowedEvents
    });
  }
};
_actions = new WeakMap();
_events = new WeakMap();
_initialEventPayloadGetters = new WeakMap();
_eventPayloadCache = new WeakMap();

export {
  ControllerMessenger
};
//# sourceMappingURL=chunk-AOA2V5WQ.mjs.map