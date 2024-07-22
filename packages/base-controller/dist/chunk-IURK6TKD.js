"use strict";Object.defineProperty(exports, "__esModule", {value: true});



var _chunkZ4BLTVTBjs = require('./chunk-Z4BLTVTB.js');

// src/BaseControllerV2.ts
var _immer = require('immer');
_immer.enablePatches.call(void 0, );
var _internalState;
var BaseController = class {
  /**
   * Creates a BaseController instance.
   *
   * @param options - Controller options.
   * @param options.messenger - Controller messaging system.
   * @param options.metadata - ControllerState metadata, describing how to "anonymize" the state, and which
   * parts should be persisted.
   * @param options.name - The name of the controller, used as a namespace for events and actions.
   * @param options.state - Initial controller state.
   */
  constructor({
    messenger,
    metadata,
    name,
    state
  }) {
    _chunkZ4BLTVTBjs.__privateAdd.call(void 0, this, _internalState, void 0);
    this.messagingSystem = messenger;
    this.name = name;
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _internalState, _immer.freeze.call(void 0, state, true));
    this.metadata = metadata;
    this.messagingSystem.registerActionHandler(
      `${name}:getState`,
      () => this.state
    );
    this.messagingSystem.registerInitialEventPayload({
      eventType: `${name}:stateChange`,
      getPayload: () => [this.state, []]
    });
  }
  /**
   * Retrieves current controller state.
   *
   * @returns The current state.
   */
  get state() {
    return _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalState);
  }
  set state(_) {
    throw new Error(
      `Controller state cannot be directly mutated; use 'update' method instead.`
    );
  }
  /**
   * Updates controller state. Accepts a callback that is passed a draft copy
   * of the controller state. If a value is returned, it is set as the new
   * state. Otherwise, any changes made within that callback to the draft are
   * applied to the controller state.
   *
   * @param callback - Callback for updating state, passed a draft state
   * object. Return a new state object or mutate the draft to update state.
   * @returns An object that has the next state, patches applied in the update and inverse patches to
   * rollback the update.
   */
  update(callback) {
    const [nextState, patches, inversePatches] = _immer.produceWithPatches.call(void 0, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalState), callback);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _internalState, nextState);
    this.messagingSystem.publish(
      `${this.name}:stateChange`,
      nextState,
      patches
    );
    return { nextState, patches, inversePatches };
  }
  /**
   * Applies immer patches to the current state. The patches come from the
   * update function itself and can either be normal or inverse patches.
   *
   * @param patches - An array of immer patches that are to be applied to make
   * or undo changes.
   */
  applyPatches(patches) {
    const nextState = _immer.applyPatches.call(void 0, _chunkZ4BLTVTBjs.__privateGet.call(void 0, this, _internalState), patches);
    _chunkZ4BLTVTBjs.__privateSet.call(void 0, this, _internalState, nextState);
    this.messagingSystem.publish(
      `${this.name}:stateChange`,
      nextState,
      patches
    );
  }
  /**
   * Prepares the controller for garbage collection. This should be extended
   * by any subclasses to clean up any additional connections or events.
   *
   * The only cleanup performed here is to remove listeners. While technically
   * this is not required to ensure this instance is garbage collected, it at
   * least ensures this instance won't be responsible for preventing the
   * listeners from being garbage collected.
   */
  destroy() {
    this.messagingSystem.clearEventSubscriptions(`${this.name}:stateChange`);
  }
};
_internalState = new WeakMap();
function getAnonymizedState(state, metadata) {
  return deriveStateFromMetadata(state, metadata, "anonymous");
}
function getPersistentState(state, metadata) {
  return deriveStateFromMetadata(state, metadata, "persist");
}
function deriveStateFromMetadata(state, metadata, metadataProperty) {
  return Object.keys(state).reduce((derivedState, key) => {
    try {
      const stateMetadata = metadata[key];
      if (!stateMetadata) {
        throw new Error(`No metadata found for '${String(key)}'`);
      }
      const propertyMetadata = stateMetadata[metadataProperty];
      const stateProperty = state[key];
      if (typeof propertyMetadata === "function") {
        derivedState[key] = propertyMetadata(stateProperty);
      } else if (propertyMetadata) {
        derivedState[key] = stateProperty;
      }
      return derivedState;
    } catch (error) {
      setTimeout(() => {
        throw error;
      });
      return derivedState;
    }
  }, {});
}





exports.BaseController = BaseController; exports.getAnonymizedState = getAnonymizedState; exports.getPersistentState = getPersistentState;
//# sourceMappingURL=chunk-IURK6TKD.js.map