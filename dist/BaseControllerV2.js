"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPersistentState = exports.getAnonymizedState = exports.BaseController = void 0;
const immer_1 = require("immer");
immer_1.enablePatches();
/**
 * Controller class that provides state management, subscriptions, and state metadata
 */
class BaseController {
    /**
     * Creates a BaseController instance.
     *
     * @param options
     * @param options.messenger - Controller messaging system
     * @param options.metadata - State metadata, describing how to "anonymize" the state, and which
     *   parts should be persisted.
     * @param options.name - The name of the controller, used as a namespace for events and actions
     * @param options.state - Initial controller state
     */
    constructor({ messenger, metadata, name, state, }) {
        this.messagingSystem = messenger;
        this.name = name;
        this.internalState = state;
        this.metadata = metadata;
        this.messagingSystem.registerActionHandler(`${name}:getState`, () => this.state);
    }
    /**
     * Retrieves current controller state
     *
     * @returns - Current state
     */
    get state() {
        return this.internalState;
    }
    set state(_) {
        throw new Error(`Controller state cannot be directly mutated; use 'update' method instead.`);
    }
    /**
     * Updates controller state. Accepts a callback that is passed a draft copy
     * of the controller state. If a value is returned, it is set as the new
     * state. Otherwise, any changes made within that callback to the draft are
     * applied to the controller state.
     *
     * @param callback - Callback for updating state, passed a draft state
     *   object. Return a new state object or mutate the draft to update state.
     */
    update(callback) {
        const [nextState, patches] = immer_1.produceWithPatches(this.internalState, callback);
        this.internalState = nextState;
        this.messagingSystem.publish(`${this.name}:stateChange`, nextState, patches);
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
}
exports.BaseController = BaseController;
/**
 * Returns an anonymized representation of the controller state.
 *
 * By "anonymized" we mean that it should not contain any information that could be personally
 * identifiable.
 *
 * @param state - The controller state
 * @param metadata - The controller state metadata, which describes how to derive the
 *   anonymized state
 * @returns The anonymized controller state
 */
function getAnonymizedState(state, metadata) {
    return deriveStateFromMetadata(state, metadata, 'anonymous');
}
exports.getAnonymizedState = getAnonymizedState;
/**
 * Returns the subset of state that should be persisted
 *
 * @param state - The controller state
 * @param metadata - The controller state metadata, which describes which pieces of state should be persisted
 * @returns The subset of controller state that should be persisted
 */
function getPersistentState(state, metadata) {
    return deriveStateFromMetadata(state, metadata, 'persist');
}
exports.getPersistentState = getPersistentState;
function deriveStateFromMetadata(state, metadata, metadataProperty) {
    return Object.keys(state).reduce((persistedState, key) => {
        const propertyMetadata = metadata[key][metadataProperty];
        const stateProperty = state[key];
        if (typeof propertyMetadata === 'function') {
            persistedState[key] = propertyMetadata(stateProperty);
        }
        else if (propertyMetadata) {
            persistedState[key] = stateProperty;
        }
        return persistedState;
    }, {});
}
//# sourceMappingURL=BaseControllerV2.js.map