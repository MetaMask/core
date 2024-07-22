"use strict";Object.defineProperty(exports, "__esModule", {value: true});




var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/RestrictedControllerMessenger.ts
var _controllerMessenger, _controllerName, _allowedActions, _allowedEvents, _isAllowedEvent, isAllowedEvent_fn, _isAllowedAction, isAllowedAction_fn, _isInCurrentNamespace, isInCurrentNamespace_fn;
var RestrictedControllerMessenger = class {
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
    allowedEvents
  }) {
    /**
     * Determine whether the given event type is allowed. Event types are
     * allowed if they are in the current namespace or on the list of
     * allowed events.
     *
     * @param eventType - The event type to check.
     * @returns Whether the event type is allowed.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isAllowedEvent);
    /**
     * Determine whether the given action type is allowed. Action types
     * are allowed if they are in the current namespace or on the list of
     * allowed actions.
     *
     * @param actionType - The action type to check.
     * @returns Whether the action type is allowed.
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isAllowedAction);
    /**
     * Determine whether the given name is within the current namespace.
     *
     * @param name - The name to check
     * @returns Whether the name is within the current namespace
     */
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _isInCurrentNamespace);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _controllerMessenger, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _controllerName, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _allowedActions, void 0);
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _allowedEvents, void 0);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _controllerMessenger, controllerMessenger);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _controllerName, name);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _allowedActions, allowedActions);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _allowedEvents, allowedEvents);
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
  registerActionHandler(action, handler) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, action)) {
      throw new Error(
        `Only allowed registering action handlers prefixed by '${_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerName)}:'`
      );
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).registerActionHandler(action, handler);
  }
  /**
   * Unregister an action handler.
   *
   * This will prevent this action from being called.
   *
   * The action type being unregistered *must* be in the current namespace.
   *
   * @param action - The action type. This is a unique identifier for this action.
   * @throws Will throw if an action handler that is not in the current namespace is being unregistered.
   * @template ActionType - A type union of Action type strings that are namespaced by Namespace.
   */
  unregisterActionHandler(action) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, action)) {
      throw new Error(
        `Only allowed unregistering action handlers prefixed by '${_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerName)}:'`
      );
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).unregisterActionHandler(action);
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
   * registered action handler.
   * @throws Will throw when no handler has been registered for the given type.
   * @template ActionType - A type union of allowed Action type strings.
   * @returns The action return value.
   */
  call(actionType, ...params) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isAllowedAction, isAllowedAction_fn).call(this, actionType)) {
      throw new Error(`Action missing from allow list: ${actionType}`);
    }
    const response = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).call(
      actionType,
      ...params
    );
    return response;
  }
  /**
   * Register a function for getting the initial payload for an event.
   *
   * This is used for events that represent a state change, where the payload is the state.
   * Registering a function for getting the payload allows event selectors to have a point of
   * comparison the first time state changes.
   *
   * The event type *must* be in the current namespace
   *
   * @param args - The arguments to this function
   * @param args.eventType - The event type to register a payload for.
   * @param args.getPayload - A function for retrieving the event payload.
   */
  registerInitialEventPayload({
    eventType,
    getPayload
  }) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, eventType)) {
      throw new Error(
        `Only allowed publishing events prefixed by '${_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerName)}:'`
      );
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).registerInitialEventPayload({
      eventType,
      getPayload
    });
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
   * @throws Will throw if an event that is not in the current namespace is being published.
   * @template EventType - A type union of Event type strings that are namespaced by Namespace.
   */
  publish(event, ...payload) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, event)) {
      throw new Error(
        `Only allowed publishing events prefixed by '${_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerName)}:'`
      );
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).publish(event, ...payload);
  }
  subscribe(event, handler, selector) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isAllowedEvent, isAllowedEvent_fn).call(this, event)) {
      throw new Error(`Event missing from allow list: ${event}`);
    }
    if (selector) {
      return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).subscribe(event, handler, selector);
    }
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).subscribe(event, handler);
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
   * @throws Will throw if the given event is not an allowed event for this controller messenger.
   * @template EventType - A type union of allowed Event type strings.
   */
  unsubscribe(event, handler) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isAllowedEvent, isAllowedEvent_fn).call(this, event)) {
      throw new Error(`Event missing from allow list: ${event}`);
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).unsubscribe(event, handler);
  }
  /**
   * Clear subscriptions for a specific event.
   *
   * This will remove all subscribed handlers for this event.
   *
   * The event type being cleared *must* be in the current namespace.
   *
   * @param event - The event type. This is a unique identifier for this event.
   * @throws Will throw if a subscription for an event that is not in the current namespace is being cleared.
   * @template EventType - A type union of Event type strings that are namespaced by Namespace.
   */
  clearEventSubscriptions(event) {
    if (!_chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, event)) {
      throw new Error(
        `Only allowed clearing events prefixed by '${_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerName)}:'`
      );
    }
    _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerMessenger).clearEventSubscriptions(event);
  }
};
_controllerMessenger = new WeakMap();
_controllerName = new WeakMap();
_allowedActions = new WeakMap();
_allowedEvents = new WeakMap();
_isAllowedEvent = new WeakSet();
isAllowedEvent_fn = function(eventType) {
  const allowedEvents = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _allowedEvents);
  return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, eventType) || allowedEvents !== null && allowedEvents.includes(eventType);
};
_isAllowedAction = new WeakSet();
isAllowedAction_fn = function(actionType) {
  const allowedActions = _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _allowedActions);
  return _chunkZ4BLTVTBjs.__privateMethod.call(void 0, this, _isInCurrentNamespace, isInCurrentNamespace_fn).call(this, actionType) || allowedActions !== null && allowedActions.includes(actionType);
};
_isInCurrentNamespace = new WeakSet();
isInCurrentNamespace_fn = function(name) {
  return name.startsWith(`${_chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _controllerName)}:`);
};



exports.RestrictedControllerMessenger = RestrictedControllerMessenger;
//# sourceMappingURL=chunk-UJFCPTF3.js.map