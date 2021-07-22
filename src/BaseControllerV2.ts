import { enablePatches, produceWithPatches } from 'immer';

// Imported separately because only the type is used
// eslint-disable-next-line no-duplicate-imports
import type { Draft, Patch } from 'immer';

import type {
  RestrictedControllerMessenger,
  Namespaced,
} from './ControllerMessenger';

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

type primitive = null | boolean | number | string;

type DefinitelyNotJsonable = ((...args: any[]) => any) | undefined;

// Credit to https://github.com/grant-dennison for this type
// Source: https://github.com/Microsoft/TypeScript/issues/1897#issuecomment-710744173
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
          [P in keyof T]: P extends string
            ? // Recursive call for children
              IsJsonable<T[P]>
            : // Exclude non-string keys
              never;
        }
      : // Otherwise any other non-object no bueno
        never
    : // Otherwise non-jsonable type union was found not empty
      never;

/**
 * An function to derive state.
 *
 * This function will accept one piece of the controller state (one property),
 * and will return some derivation of that state.
 *
 * @param value - A piece of controller state
 * @returns Something derived from controller state
 */
export type StateDeriver<T> = (value: IsJsonable<T>) => IsJsonable<Json>;

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
 *   (`true` for persistent, `false` for transient), or is set to a function
 *   that derives the persistent state from the state.
 * @property anonymous - Indicates whether this property is already anonymous,
 *   (`true` for anonymous, `false` if it has potential to be personally
 *   identifiable), or is set to a function that returns an anonymized
 *   representation of this state.
 */
export interface StatePropertyMetadata<T> {
  persist: boolean | StateDeriver<T>;
  anonymous: boolean | StateDeriver<T>;
}

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [prop: string]: Json };

/**
 * Controller class that provides state management, subscriptions, and state metadata
 */
export class BaseController<
  N extends string,
  S extends Record<string, unknown>
> {
  private internalState: IsJsonable<S>;

  protected messagingSystem: RestrictedControllerMessenger<
    N,
    any,
    any,
    string,
    string
  >;

  /**
   * The name of the controller.
   *
   * This is used by the ComposableController to construct a composed application state.
   */
  public readonly name: N;

  public readonly metadata: StateMetadata<S>;

  /**
   * The existence of the `subscribe` property is how the ComposableController detects whether a
   * controller extends the old BaseController or the new one. We set it to `never` here to ensure
   * this property is never used for new BaseController-based controllers, to ensure the
   * ComposableController never mistakes them for an older style controller.
   */
  public readonly subscribe: never;

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
  constructor({
    messenger,
    metadata,
    name,
    state,
  }: {
    messenger: RestrictedControllerMessenger<N, any, any, string, string>;
    metadata: StateMetadata<S>;
    name: N;
    state: IsJsonable<S>;
  }) {
    this.messagingSystem = messenger;
    this.name = name;
    this.internalState = state;
    this.metadata = metadata;

    this.messagingSystem.registerActionHandler(
      `${name}:getState`,
      () => this.state,
    );
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
    throw new Error(
      `Controller state cannot be directly mutated; use 'update' method instead.`,
    );
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
  protected update(
    callback: (state: Draft<IsJsonable<S>>) => void | IsJsonable<S>,
  ) {
    const [nextState, patches] = produceWithPatches(
      this.internalState,
      callback,
    );
    this.internalState = nextState as IsJsonable<S>;
    this.messagingSystem.publish(
      `${this.name}:stateChange` as Namespaced<N, any>,
      nextState as S,
      patches,
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
  protected destroy() {
    this.messagingSystem.clearEventSubscriptions(
      `${this.name}:stateChange` as Namespaced<N, any>,
    );
  }
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
export function getAnonymizedState<S extends Record<string, unknown>>(
  state: IsJsonable<S>,
  metadata: StateMetadata<S>,
): IsJsonable<Record<string, Json>> {
  return deriveStateFromMetadata(state, metadata, 'anonymous');
}

/**
 * Returns the subset of state that should be persisted
 *
 * @param state - The controller state
 * @param metadata - The controller state metadata, which describes which pieces of state should be persisted
 * @returns The subset of controller state that should be persisted
 */
export function getPersistentState<S extends Record<string, unknown>>(
  state: IsJsonable<S>,
  metadata: StateMetadata<S>,
): IsJsonable<Record<string, Json>> {
  return deriveStateFromMetadata(state, metadata, 'persist');
}

function deriveStateFromMetadata<S extends Record<string, unknown>>(
  state: IsJsonable<S>,
  metadata: StateMetadata<S>,
  metadataProperty: 'anonymous' | 'persist',
): IsJsonable<Record<string, Json>> {
  return Object.keys(state).reduce((persistedState, key) => {
    const propertyMetadata = metadata[key as keyof S][metadataProperty];
    const stateProperty = state[key];
    if (typeof propertyMetadata === 'function') {
      persistedState[key as string] = propertyMetadata(stateProperty);
    } else if (propertyMetadata) {
      persistedState[key as string] = stateProperty;
    }
    return persistedState;
  }, {} as IsJsonable<Record<string, Json>>);
}
