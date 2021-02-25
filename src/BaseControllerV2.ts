import { enablePatches, produceWithPatches } from 'immer';

// Imported separately because only the type is used
// eslint-disable-next-line no-duplicate-imports
import type { Draft, Patch } from 'immer';

enablePatches();

/**
 * A state change listener.
 *
 * This function will get called for each state change, and is given a copy of
 * the new state along with a set of patches describing the changes since the
 * last update.
 *
 * @param state - The new controller state
 * @param patches - A list of patches describing any changes (see here for more
 *   information: https://immerjs.github.io/immer/docs/patches)
 */
export type Listener<T> = (state: T, patches: Patch[]) => void;

type Primitive = boolean | string | number | null;

// Based upon this StackOverflow answer: https://stackoverflow.com/a/64060332
type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? RecursivePartial<U>[]
    : T[P] extends Primitive
    ? T[P]
    : RecursivePartial<T>;
};

/**
 * An anonymizing function
 *
 * This function will accept one piece of the controller state (one property),
 * and will return an anonymized representation of this state. By "anonymized",
 * we mean that it should not contain any information that could be personally
 * identifiable.
 *
 * @param value - A piece of controller state
 * @returns An anonymized representation of the given state
 */
export type Anonymizer<T> = (value: T) => T extends Primitive ? T : RecursivePartial<T>;

/**
 * State metadata.
 *
 * This metadata describes which parts of state should be persisted, and how to
 * get an anonymized representation of the state.
 */
export type StateMetadata<T> = {
  [P in keyof T]: StatePropertyMetadata<T[P]>;
};

/**
 * Metadata for a single state property
 *
 * @property persist - Indicates whether this property should be persisted
 *   (`true` for persistent, `false` for transient)
 * @property anonymous - Indicates whether this property is already anonymous,
 *   (`true` for anonymous, `false` if it has potential to be personally
 *   identifiable), or is set to a function that returns an anonymized
 *   representation of this state.
 */
export interface StatePropertyMetadata<P> {
  persist: boolean;
  anonymous: boolean | Anonymizer<P>;
}

/**
 * Controller class that provides state management, subscriptions, and state metadata
 */
export class BaseController<S extends Record<string, unknown>> {
  private internalState: S;

  private internalListeners: Set<Listener<S>> = new Set();

  public readonly metadata: StateMetadata<S>;

  /**
   * Creates a BaseController instance.
   *
   * @param state - Initial controller state
   * @param metadata - State metadata, describing how to "anonymize" the state,
   *   and which parts should be persisted.
   */
  constructor(state: S, metadata: StateMetadata<S>) {
    this.internalState = state;
    this.metadata = metadata;
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
   * Adds new listener to be notified of state changes
   *
   * @param listener - Callback triggered when state changes
   */
  subscribe(listener: Listener<S>) {
    this.internalListeners.add(listener);
  }

  /**
   * Removes existing listener from receiving state changes
   *
   * @param listener - Callback to remove
   */
  unsubscribe(listener: Listener<S>) {
    this.internalListeners.delete(listener);
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
  protected update(callback: (state: Draft<S>) => void | S) {
    const [nextState, patches] = produceWithPatches(this.internalState, callback);
    this.internalState = nextState as S;
    for (const listener of this.internalListeners) {
      listener(nextState as S, patches);
    }
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
  protected destroy() {
    this.internalListeners.clear();
  }
}

// This function acts as a type guard. Using a `typeof` conditional didn't seem to work.
function isAnonymizingFunction<T>(x: boolean | Anonymizer<T>): x is Anonymizer<T> {
  return typeof x === 'function';
}

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
export function getAnonymizedState<S extends Record<string, any>>(
  state: S,
  metadata: StateMetadata<S>,
): RecursivePartial<S> {
  return Object.keys(state).reduce((anonymizedState, _key) => {
    const key: keyof S = _key; // https://stackoverflow.com/questions/63893394/string-cannot-be-used-to-index-type-t
    const metadataValue = metadata[key].anonymous;
    if (isAnonymizingFunction(metadataValue)) {
      anonymizedState[key] = metadataValue(state[key]);
    } else if (metadataValue) {
      anonymizedState[key] = state[key];
    }
    return anonymizedState;
  }, {} as RecursivePartial<S>);
}

/**
 * Returns the subset of state that should be persisted
 *
 * @param state - The controller state
 * @param metadata - The controller state metadata, which describes which pieces of state should be persisted
 * @returns The subset of controller state that should be persisted
 */
export function getPersistentState<S extends Record<string, any>>(state: S, metadata: StateMetadata<S>): Partial<S> {
  return Object.keys(state).reduce((persistedState, _key) => {
    const key: keyof S = _key; // https://stackoverflow.com/questions/63893394/string-cannot-be-used-to-index-type-t
    if (metadata[key].persist) {
      persistedState[key] = state[key];
    }
    return persistedState;
  }, {} as Partial<S>);
}
