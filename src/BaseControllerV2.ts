import { enablePatches, produceWithPatches } from 'immer';

// Imported separately because only the type is used
// eslint-disable-next-line no-duplicate-imports
import type { Draft, Patch } from 'immer';

enablePatches();

/**
 * State change callbacks
 */
export type Listener<T> = (state: T, patches: Patch[]) => void;

export type Anonymizer<T> = (value: T) => T;

export type Schema<T> = {
  [P in keyof T]: {
    persist: boolean;
    anonymous: boolean | Anonymizer<T[P]>;
  };
};

/**
 * Controller class that provides state management and subscriptions
 */
export class BaseController<S extends Record<string, unknown>> {
  private internalState: S;

  private internalListeners: Set<Listener<S>> = new Set();

  public readonly schema: Schema<S>;

  /**
   * Creates a BaseController instance.
   *
   * @param state - Initial controller state
   * @param schema - State schema, describing how to "anonymize" the state,
   *   and which parts should be persisted.
   */
  constructor(state: S, schema: Schema<S>) {
    this.internalState = state;
    this.schema = schema;
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

export function getAnonymizedState<S extends Record<string, any>>(state: S, schema: Schema<S>) {
  return Object.keys(state).reduce((anonymizedState, _key) => {
    const key: keyof S = _key; // https://stackoverflow.com/questions/63893394/string-cannot-be-used-to-index-type-t
    const schemaValue = schema[key].anonymous;
    if (isAnonymizingFunction(schemaValue)) {
      anonymizedState[key] = schemaValue(state[key]);
    } else if (schemaValue) {
      anonymizedState[key] = state[key];
    }
    return anonymizedState;
  }, {} as Partial<S>);
}

export function getPersistentState<S extends Record<string, any>>(state: S, schema: Schema<S>) {
  return Object.keys(state).reduce((persistedState, _key) => {
    const key: keyof S = _key; // https://stackoverflow.com/questions/63893394/string-cannot-be-used-to-index-type-t
    if (schema[key].persist) {
      persistedState[key] = state[key];
    }
    return persistedState;
  }, {} as Partial<S>);
}
