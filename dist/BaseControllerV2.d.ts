import type { Draft, Patch } from 'immer';
import type { RestrictedControllerMessenger } from './ControllerMessenger';
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
export declare type Listener<T> = (state: T, patches: Patch[]) => void;
/**
 * An function to derive state.
 *
 * This function will accept one piece of the controller state (one property),
 * and will return some derivation of that state.
 *
 * @param value - A piece of controller state.
 * @returns Something derived from controller state.
 */
export declare type StateDeriver<T extends Json> = (value: T) => Json;
/**
 * State metadata.
 *
 * This metadata describes which parts of state should be persisted, and how to
 * get an anonymized representation of the state.
 */
export declare type StateMetadata<T extends Record<string, Json>> = {
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
export interface StatePropertyMetadata<T extends Json> {
    persist: boolean | StateDeriver<T>;
    anonymous: boolean | StateDeriver<T>;
}
export declare type Json = null | boolean | number | string | Json[] | {
    [prop: string]: Json;
};
/**
 * Controller class that provides state management, subscriptions, and state metadata
 */
export declare class BaseController<N extends string, S extends Record<string, Json>, messenger extends RestrictedControllerMessenger<N, any, any, string, string>> {
    private internalState;
    protected messagingSystem: messenger;
    /**
     * The name of the controller.
     *
     * This is used by the ComposableController to construct a composed application state.
     */
    readonly name: N;
    readonly metadata: StateMetadata<S>;
    /**
     * The existence of the `subscribe` property is how the ComposableController detects whether a
     * controller extends the old BaseController or the new one. We set it to `undefined` here to
     * ensure the ComposableController never mistakes them for an older style controller.
     */
    readonly subscribe: undefined;
    /**
     * Creates a BaseController instance.
     *
     * @param options - Controller options.
     * @param options.messenger - Controller messaging system.
     * @param options.metadata - State metadata, describing how to "anonymize" the state, and which
     * parts should be persisted.
     * @param options.name - The name of the controller, used as a namespace for events and actions.
     * @param options.state - Initial controller state.
     */
    constructor({ messenger, metadata, name, state, }: {
        messenger: messenger;
        metadata: StateMetadata<S>;
        name: N;
        state: S;
    });
    /**
     * Retrieves current controller state.
     *
     * @returns The current state.
     */
    get state(): S;
    set state(_: S);
    /**
     * Updates controller state. Accepts a callback that is passed a draft copy
     * of the controller state. If a value is returned, it is set as the new
     * state. Otherwise, any changes made within that callback to the draft are
     * applied to the controller state.
     *
     * @param callback - Callback for updating state, passed a draft state
     * object. Return a new state object or mutate the draft to update state.
     */
    protected update(callback: (state: Draft<S>) => void | S): void;
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
export declare function getAnonymizedState<S extends Record<string, Json>>(state: S, metadata: StateMetadata<S>): Record<string, Json>;
/**
 * Returns the subset of state that should be persisted.
 *
 * @param state - The controller state.
 * @param metadata - The controller state metadata, which describes which pieces of state should be persisted.
 * @returns The subset of controller state that should be persisted.
 */
export declare function getPersistentState<S extends Record<string, Json>>(state: S, metadata: StateMetadata<S>): Record<string, Json>;
