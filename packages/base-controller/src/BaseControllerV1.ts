/**
 * State change callbacks
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type Listener<T> = (state: T) => void;

/**
 * @type BaseConfig
 *
 * Base controller configuration
 * @property disabled - Determines if this controller is enabled
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface BaseConfig {
  disabled?: boolean;
}

/**
 * @type BaseState
 *
 * Base state representation
 * @property name - Unique name for this controller
 */
// This interface was created before this ESLint rule was added.
// Convert to a `type` in a future major version.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export interface BaseState {
  name?: string;
}

/**
 * @deprecated This class has been renamed to BaseControllerV1 and is no longer recommended for use for controllers. Please use BaseController (formerly BaseControllerV2) instead.
 *
 * Controller class that provides configuration, state management, and subscriptions.
 *
 * The core purpose of every controller is to maintain an internal data object
 * called "state". Each controller is responsible for its own state, and all global wallet state
 * is tracked in a controller as state.
 */
// TODO: Either fix this lint violation or explain why it's necessary to ignore.
// eslint-disable-next-line @typescript-eslint/naming-convention
export class BaseControllerV1<C extends BaseConfig, S extends BaseState> {
  /**
   * Default options used to configure this controller
   */
  defaultConfig: C = {} as never;

  /**
   * Default state set on this controller
   */
  defaultState: S = {} as never;

  /**
   * Determines if listeners are notified of state changes
   */
  disabled = false;

  /**
   * Name of this controller used during composition
   */
  name = 'BaseController';

  private readonly initialConfig: Partial<C>;

  private readonly initialState: Partial<S>;

  private internalConfig: C = this.defaultConfig;

  private internalState: S = this.defaultState;

  private readonly internalListeners: Listener<S>[] = [];

  /**
   * Creates a BaseControllerV1 instance. Both initial state and initial
   * configuration options are merged with defaults upon initialization.
   *
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(config: Partial<C> = {}, state: Partial<S> = {}) {
    this.initialState = state;
    this.initialConfig = config;
  }

  /**
   * Enables the controller. This sets each config option as a member
   * variable on this instance and triggers any defined setters. This
   * also sets initial state and triggers any listeners.
   *
   * @returns This controller instance.
   */
  protected initialize() {
    this.internalState = this.defaultState;
    this.internalConfig = this.defaultConfig;
    this.configure(this.initialConfig);
    this.update(this.initialState);
    return this;
  }

  /**
   * Retrieves current controller configuration options.
   *
   * @returns The current configuration.
   */
  get config() {
    return this.internalConfig;
  }

  /**
   * Retrieves current controller state.
   *
   * @returns The current state.
   */
  get state() {
    return this.internalState;
  }

  /**
   * Updates controller configuration.
   *
   * @param config - New configuration options.
   * @param overwrite - Overwrite config instead of merging.
   * @param fullUpdate - Boolean that defines if the update is partial or not.
   */
  configure(config: Partial<C>, overwrite = false, fullUpdate = true) {
    if (fullUpdate) {
      this.internalConfig = overwrite
        ? (config as C)
        : Object.assign(this.internalConfig, config);

      for (const key of Object.keys(this.internalConfig) as (keyof C)[]) {
        const value = this.internalConfig[key];
        if (value !== undefined) {
          (this as unknown as C)[key] = value;
        }
      }
    } else {
      for (const key of Object.keys(config) as (keyof C)[]) {
        /* istanbul ignore else */
        if (this.internalConfig[key] !== undefined) {
          const value = (config as C)[key];
          this.internalConfig[key] = value;
          (this as unknown as C)[key] = value;
        }
      }
    }
  }

  /**
   * Notifies all subscribed listeners of current state.
   */
  notify() {
    if (this.disabled) {
      return;
    }

    this.internalListeners.forEach((listener) => {
      listener(this.internalState);
    });
  }

  /**
   * Adds new listener to be notified of state changes.
   *
   * @param listener - The callback triggered when state changes.
   */
  subscribe(listener: Listener<S>) {
    this.internalListeners.push(listener);
  }

  /**
   * Removes existing listener from receiving state changes.
   *
   * @param listener - The callback to remove.
   * @returns `true` if a listener is found and unsubscribed.
   */
  unsubscribe(listener: Listener<S>) {
    const index = this.internalListeners.findIndex((cb) => listener === cb);
    index > -1 && this.internalListeners.splice(index, 1);
    return index > -1;
  }

  /**
   * Updates controller state.
   *
   * @param state - The new state.
   * @param overwrite - Overwrite state instead of merging.
   */
  update(state: Partial<S>, overwrite = false) {
    this.internalState = overwrite
      ? Object.assign({}, state as S)
      : Object.assign({}, this.internalState, state);
    this.notify();
  }
}

export default BaseControllerV1;
