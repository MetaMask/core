import type { Json } from '@metamask/utils';
import { enablePatches, produceWithPatches, applyPatches } from 'immer';
import type { Draft, Patch } from 'immer';

import type { ActionConstraint, EventConstraint } from './ControllerMessenger';
import type { RestrictedControllerMessenger } from './RestrictedControllerMessenger';

enablePatches();

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
export type StateMetadata<T extends Record<string, Json>> = {
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
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface StatePropertyMetadata<T extends Json> {
  persist: boolean | StateDeriver<T>;
  anonymous: boolean | StateDeriver<T>;
}

export type ControllerGetStateAction<
  ControllerName extends string,
  ControllerState extends Record<string, unknown>,
> = {
  type: `${ControllerName}:getState`;
  handler: () => ControllerState;
};

export type ControllerStateChangeEvent<
  ControllerName extends string,
  ControllerState extends Record<string, unknown>,
> = {
  type: `${ControllerName}:stateChange`;
  payload: [ControllerState, Patch[]];
};

export type ControllerActions<
  ControllerName extends string,
  ControllerState extends Record<string, unknown>,
> = ControllerGetStateAction<ControllerName, ControllerState>;

export type ControllerEvents<
  ControllerName extends string,
  ControllerState extends Record<string, unknown>,
> = ControllerStateChangeEvent<ControllerName, ControllerState>;

/**
 * Controller class that provides state management, subscriptions, and state metadata
 */
export class BaseController<
  ControllerName extends string,
  ControllerState extends Record<string, Json>,
  messenger extends RestrictedControllerMessenger<
    ControllerName,
    ActionConstraint | ControllerActions<ControllerName, ControllerState>,
    EventConstraint | ControllerEvents<ControllerName, ControllerState>,
    string,
    string
  >,
> {
  #internalState: ControllerState;

  protected messagingSystem: messenger;

  /**
   * The name of the controller.
   *
   * This is used by the ComposableController to construct a composed application state.
   */
  public readonly name: ControllerName;

  public readonly metadata: StateMetadata<ControllerState>;

  /**
   * The existence of the `subscribe` property is how the ComposableController used to detect
   * whether a controller extends the old BaseController or the new one. We set it to `undefined` here to
   * ensure the ComposableController never mistakes them for an older style controller.
   *
   * This property is no longer used, and will be removed in a future release.
   *
   * @deprecated This will be removed in a future release
   */
  public readonly subscribe: undefined;

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
    state,
  }: {
    messenger: messenger;
    metadata: StateMetadata<ControllerState>;
    name: ControllerName;
    state: ControllerState;
  }) {
    this.messagingSystem = messenger;
    this.name = name;
    this.#internalState = state;
    this.metadata = metadata;

    this.messagingSystem.registerActionHandler(
      `${name}:getState`,
      () => this.state,
    );

    this.messagingSystem.registerInitialEventPayload({
      eventType: `${name}:stateChange`,
      getPayload: () => [this.state, []],
    });
  }

  /**
   * Retrieves current controller state.
   *
   * @returns The current state.
   */
  get state() {
    return this.#internalState;
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
   * object. Return a new state object or mutate the draft to update state.
   * @returns An object that has the next state, patches applied in the update and inverse patches to
   * rollback the update.
   */
  protected update(
    callback: (state: Draft<ControllerState>) => void | ControllerState,
  ): {
    nextState: ControllerState;
    patches: Patch[];
    inversePatches: Patch[];
  } {
    // We run into ts2589, "infinite type depth", if we don't cast
    // produceWithPatches here.
    const [nextState, patches, inversePatches] = (
      produceWithPatches as unknown as (
        state: ControllerState,
        cb: typeof callback,
      ) => [ControllerState, Patch[], Patch[]]
    )(this.#internalState, callback);

    this.#internalState = nextState;
    this.messagingSystem.publish(
      `${this.name}:stateChange`,
      nextState,
      patches,
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
  protected applyPatches(patches: Patch[]) {
    const nextState = applyPatches(this.#internalState, patches);
    this.#internalState = nextState;
    this.messagingSystem.publish(
      `${this.name}:stateChange`,
      nextState,
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
    this.messagingSystem.clearEventSubscriptions(`${this.name}:stateChange`);
  }
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
export function getAnonymizedState<
  ControllerState extends Record<string, Json>,
>(
  state: ControllerState,
  metadata: StateMetadata<ControllerState>,
): Record<string, Json> {
  return deriveStateFromMetadata(state, metadata, 'anonymous');
}

/**
 * Returns the subset of state that should be persisted.
 *
 * @param state - The controller state.
 * @param metadata - The controller state metadata, which describes which pieces of state should be persisted.
 * @returns The subset of controller state that should be persisted.
 */
export function getPersistentState<
  ControllerState extends Record<string, Json>,
>(
  state: ControllerState,
  metadata: StateMetadata<ControllerState>,
): Record<string, Json> {
  return deriveStateFromMetadata(state, metadata, 'persist');
}

/**
 * Use the metadata to derive state according to the given metadata property.
 *
 * @param state - The full controller state.
 * @param metadata - The controller metadata.
 * @param metadataProperty - The metadata property to use to derive state.
 * @returns The metadata-derived controller state.
 */
function deriveStateFromMetadata<ControllerState extends Record<string, Json>>(
  state: ControllerState,
  metadata: StateMetadata<ControllerState>,
  metadataProperty: 'anonymous' | 'persist',
): Record<string, Json> {
  return (Object.keys(state) as (keyof ControllerState)[]).reduce<
    Partial<Record<keyof ControllerState, Json>>
  >((persistedState, key) => {
    try {
      const stateMetadata = metadata[key];
      if (!stateMetadata) {
        throw new Error(`No metadata found for '${String(key)}'`);
      }
      const propertyMetadata = stateMetadata[metadataProperty];
      const stateProperty = state[key];
      if (typeof propertyMetadata === 'function') {
        persistedState[key] = propertyMetadata(stateProperty);
      } else if (propertyMetadata) {
        persistedState[key] = stateProperty;
      }
      return persistedState;
    } catch (error) {
      // Throw error after timeout so that it is captured as a console error
      // (and by Sentry) without interrupting state-related operations
      setTimeout(() => {
        throw error;
      });
      return persistedState;
    }
  }, {}) as Record<keyof ControllerState, Json>;
}
