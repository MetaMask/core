import { ChildControllerContext } from './ComposableController';

/**
 * State change callbacks
 */
export type Listener<T> = (state: T) => void;

/**
 * @type BaseConfig
 *
 * Base controller configuration
 *
 * @property disabled - Determines if this controller is enabled
 */
export interface BaseConfig {
	disabled?: boolean;
}

/**
 * @type BaseState
 *
 * Base state representation
 *
 * @property name - Unique name for this controller
 */
export interface BaseState {
	name?: string;
}

/**
 * Controller class that provides configuration, state management, and subscriptions
 */
export class BaseController<C extends BaseConfig, S extends BaseState> {
	/**
	 * Map of all sibling child controllers keyed by name if this
	 * controller is composed using a ComposableController, allowing
	 * any API on any sibling controller to be accessed
	 */
	context: ChildControllerContext = {};

	/**
	 * Determines if listeners are notified of state changes
	 */
	disabled = false;

	/**
	 * Name of this controller used during composition
	 */
	name = 'BaseController';

	/**
	 * List of required sibling controllers this controller needs to function
	 */
	requiredControllers: string[] = [];

	private internalConfig: C = this.defaultConfig;
	private internalState: S = this.defaultState;
	private internalListeners: Array<Listener<S>> = [];

	/**
	 * Creates a BaseController instance. Both initial state and initial
	 * configuration options are merged with defaults upon initialization.
	 *
	 * @param config - Initial options used to configure this controller
	 * @param state - Initial state to set on this controller
	 */
	constructor(config?: C, state?: S) {
		this.configure(Object.assign(this.defaultConfig, config));
		this.update(Object.assign(this.defaultState, state));
	}

	/**
	 * Default controller configuration options
	 */
	get defaultConfig(): C {
		return {} as C;
	}

	/**
	 * Default controller state
	 */
	get defaultState(): S {
		return {} as S;
	}

	/**
	 * Current controller configuration options
	 */
	get config() {
		return this.internalConfig;
	}

	/**
	 * Current controller state
	 */
	get state() {
		return this.internalState;
	}

	/**
	 * Updates controller configuration
	 *
	 * @param config - New configuration options
	 * @param overwrite - Overwrite config instead of merging
	 */
	configure(config: Partial<C>, overwrite = false) {
		// console.log('1', config)
		this.internalConfig = overwrite ? (config as C) : Object.assign(this.internalConfig, config);
		// console.log('2', this.internalConfig)

		for (const key in this.internalConfig) {
			if (typeof this.internalConfig[key] !== 'undefined') {
				(this as any)[key as string] = this.internalConfig[key];
			}
		}
		// console.log('3', this.config)
	}

	/**
	 * Notifies all subscribed listeners of current state
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
	 * Extension point called if and when this controller is composed
	 * with other controllers using a ComposableController
	 */
	onComposed() {
		this.requiredControllers.forEach((name) => {
			if (!this.context[name]) {
				throw new Error(`${this.name} must be composed with ${name}.`);
			}
		});
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
		return index > -1 ? true : false;
	}

	/**
	 * Updates controller state
	 *
	 * @param state - New state
	 * @param overwrite - Overwrite state instead of merging
	 */
	update(state: Partial<S>, overwrite = false) {
		this.internalState = overwrite ? Object.assign({}, state as S) : Object.assign({}, this.internalState, state);
		this.notify();
	}
}

export default BaseController;
