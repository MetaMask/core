import type { Json } from '@metamask/utils';
import type { Draft, Patch } from 'immer';
import type { ActionConstraint, EventConstraint } from './ControllerMessenger';
import type { RestrictedControllerMessenger } from './RestrictedControllerMessenger';
/**
 * A type that constrains the state of all controllers.
 *
 * In other words, the narrowest supertype encompassing all controller state.
 */
export type StateConstraint = Record<string, Json>;
/**
 * A state change listener.
 *
 * This function will get called for each state change, and is given a copy of
 * the new state along with a set of patches describing the changes since the
 * last update.
 *
 * @param state - The new controller state.
 * @param patches - A list of patches describing any changes (see here for more
 * information: https://immerjs.github.io/immer/docs/patches)
 */
export type Listener<T> = (state: T, patches: Patch[]) => void;
/**
 * An function to derive state.
 *
 * This function will accept one piece of the controller state (one property),
 * and will return some derivation of that state.
 *
 * @param value - A piece of controller state.
 * @returns Something derived from controller state.
 */
export type StateDeriver<T extends Json> = (value: T) => Json;
/**
 * State metadata.
 *
 * This metadata describes which parts of state should be persisted, and how to
 * get an anonymized representation of the state.
 */
export type StateMetadata<T extends StateConstraint> = {
    [P in keyof T]: StatePropertyMetadata<T[P]>;
};
/**
 * Metadata for a single state property
 *
 * @property persist - Indicates whether this property should be persisted
 * (`true` for persistent, `false` for transient), or is set to a function
 * that derives the persistent state from the state.
 * @property anonymous - Indicates whether this property is already anonymous,
 * (`true` for anonymous, `false` if it has potential to be personally
 * identifiable), or is set to a function that returns an anonymized
 * representation of this state.
 */
export type StatePropertyMetadata<T extends Json> = {
    persist: boolean | StateDeriver<T>;
    anonymous: boolean | StateDeriver<T>;
};
export type ControllerGetStateAction<ControllerName extends string, ControllerState extends StateConstraint> = {
    type: `${ControllerName}:getState`;
    handler: () => ControllerState;
};
export type ControllerStateChangeEvent<ControllerName extends string, ControllerState extends StateConstraint> = {
    type: `${ControllerName}:stateChange`;
    payload: [ControllerState, Patch[]];
};
export type ControllerActions<ControllerName extends string, ControllerState extends StateConstraint> = ControllerGetStateAction<ControllerName, ControllerState>;
export type ControllerEvents<ControllerName extends string, ControllerState extends StateConstraint> = ControllerStateChangeEvent<ControllerName, ControllerState>;
/**
 * Controller class that provides state management, subscriptions, and state metadata
 */
export declare class BaseController<ControllerName extends string, ControllerState extends StateConstraint, messenger extends RestrictedControllerMessenger<ControllerName, ActionConstraint | ControllerActions<ControllerName, ControllerState>, EventConstraint | ControllerEvents<ControllerName, ControllerState>, string, string>> {
    #private;
    protected messagingSystem: messenger;
    /**
     * The name of the controller.
     *
     * This is used by the ComposableController to construct a composed application state.
     */
    readonly name: ControllerName;
    readonly metadata: StateMetadata<ControllerState>;
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
    constructor({ messenger, metadata, name, state, }: {
        messenger: messenger;
        metadata: StateMetadata<ControllerState>;
        name: ControllerName;
        state: ControllerState;
    });
    /**
     * Retrieves current controller state.
     *
     * @returns The current state.
     */
    get state(): ControllerState;
    set state(_: ControllerState);
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
    protected update(callback: (state: Draft<ControllerState>) => void | ControllerState): {
        nextState: ControllerState;
        patches: Patch[];
        inversePatches: Patch[];
    };
    /**
     * Applies immer patches to the current state. The patches come from the
     * update function itself and can either be normal or inverse patches.
     *
     * @param patches - An array of immer patches that are to be applied to make
     * or undo changes.
     */
    protected applyPatches(patches: Patch[]): void;
    /**
     * Prepares the controller for garbage collection. This should be extended
     * by any subclasses to clean up any additional connections or events.
     *
     * The only cleanup performed here is to remove listeners. While technically
     * this is not required to ensure this instance is garbage collected, it at
     * least ensures this instance won't be responsible for preventing the
     * listeners from being garbage collected.
     */
    protected destroy(): void;
}
/**
 * Returns an anonymized representation of the controller state.
 *
 * By "anonymized" we mean that it should not contain any information that could be personally
 * identifiable.
 *
 * @param state - The controller state.
 * @param metadata - The controller state metadata, which describes how to derive the
 * anonymized state.
 * @returns The anonymized controller state.
 */
export declare function getAnonymizedState<ControllerState extends StateConstraint>(state: ControllerState, metadata: StateMetadata<ControllerState>): Record<keyof ControllerState, Json>;
/**
 * Returns the subset of state that should be persisted.
 *
 * @param state - The controller state.
 * @param metadata - The controller state metadata, which describes which pieces of state should be persisted.
 * @returns The subset of controller state that should be persisted.
 */
export declare function getPersistentState<ControllerState extends StateConstraint>(state: ControllerState, metadata: StateMetadata<ControllerState>): Record<keyof ControllerState, Json>;
//# sourceMappingURL=BaseControllerV2.d.ts.map