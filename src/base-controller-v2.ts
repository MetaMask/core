// 'Draft' is a type, and import/named apparently doesn't like it when you
// import a type: https://github.com/benmosher/eslint-plugin-import/issues/1699
// eslint-disable-next-line import/named
import { Draft, produce } from 'immer';

/**
 * State change callbacks
 */
export type Listener<T> = (state: T) => void;

type Anonymizer<T> = (value: T) => T;

export type Schema<T> = {
  [P in keyof T]: {
    persist: boolean;
    anonymous: boolean | Anonymizer<T[P]>;
  };
};

/**
 * Controller class that provides state management and subscriptions
 */
export class BaseController<S extends Record<string, any>> {
  private internalState: S;

  private internalListeners: Listener<S>[] = [];

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

  /**
   * Adds new listener to be notified of state changes
   *
   * @param listener - Callback triggered when state changes
   */
  subscribe(listener: Listener<S>) {
    this.internalListeners.push(listener);
  }

  /**
   * Removes existing listener from receiving state changes
   *
   * @param listener - Callback to remove
   * @returns - True if a listener is found and unsubscribed
   */
  unsubscribe(listener: Listener<S>) {
    const index = this.internalListeners.findIndex((cb) => listener === cb);
    index > -1 && this.internalListeners.splice(index, 1);
    return index > -1;
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
    this.internalState = produce(this.internalState, callback) as S;
  }

  /**
   * Prepares the controller for garbage collection. This should be extended
   * by any subclasses to clean up any additional connections or events.
   *
   * The only cleanup performed here is to remove listeners. While technically
   * this is not required for garbage collection, it at least ensures this
   * instance won't be responsible for keeping the listeners in memory.
   */
  protected destroy() {
    this.internalListeners = [];
  }
}

export default BaseController;
