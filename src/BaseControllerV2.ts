import { enablePatches, produceWithPatches } from 'immer';

// Imported separately because only the type is used
// eslint-disable-next-line no-duplicate-imports
import type { Draft, Patch } from 'immer';

enablePatches();

/**
 * State change callbacks
 */
export type Listener<T> = (state: T, patches: Patch[]) => void;

type primitive = null | boolean | number | string;

type DefinitelyNotJsonable = ((...args: any[]) => any) | undefined;

// Type copied from https://github.com/Microsoft/TypeScript/issues/1897#issuecomment-710744173
export type IsJsonable<T> =
  // Check if there are any non-jsonable types represented in the union
  // Note: use of tuples in this first condition side-steps distributive conditional types
  // (see https://github.com/microsoft/TypeScript/issues/29368#issuecomment-453529532)
  [Extract<T, DefinitelyNotJsonable>] extends [never]
    ? // Non-jsonable type union was found empty
      T extends primitive
      ? // Primitive is acceptable
        T
      : // Otherwise check if array
      T extends (infer U)[]
      ? // Arrays are special; just check array element type
        IsJsonable<U>[]
      : // Otherwise check if object
      // eslint-disable-next-line @typescript-eslint/ban-types
      T extends object
      ? // It's an object
        {
          // Iterate over keys in object case
          [P in keyof T]: IsJsonable<T[P]>; // Recursive call for children
        }
      : // Otherwise any other non-object no bueno
        never
    : // Otherwise non-jsonable type union was found not empty
      never;

/**
 * Controller class that provides state management and subscriptions
 */
export class BaseController<S extends Record<string, unknown>> {
  private internalState: IsJsonable<S>;

  private internalListeners: Set<Listener<S>> = new Set();

  /**
   * Creates a BaseController instance.
   *
   * @param state - Initial controller state
   */
  constructor(state: IsJsonable<S>) {
    this.internalState = state;
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
  protected update(callback: (state: Draft<IsJsonable<S>>) => void | IsJsonable<S>) {
    const [nextState, patches] = produceWithPatches(this.internalState, callback);
    this.internalState = nextState as IsJsonable<S>;
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
