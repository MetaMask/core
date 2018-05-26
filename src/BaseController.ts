type Listener<T> = (state: T) => void;

/**
 * Base controller configuration
 */
export interface BaseConfig {
	disabled?: boolean;
}

/**
 * Base state representation
 */
export interface BaseState {
	name?: string;
}

/**
 * Controller class that provides subscription capabilities and
 * defines a standard interface other controllers must implement
 */
export class BaseController<S extends BaseState, C extends BaseConfig> {
	private internalState: S = {} as S;
	private listeners: Array<Listener<S>> = [];

	/**
	 * Determines if listeners are notified of state changes
	 */
	disabled?: boolean;

	/**
	 * Creates a BaseController
	 *
	 * @param state - Initial state to set on this controller
	 * @param config - Controller configuration
	 */
	constructor(initialState: S, config?: C) {
		this.disabled = config && config.disabled;
		this.state = initialState;
	}

	/**
	 * Retrieves internal state
	 *
	 * @returns - Current internal state
	 */
	get state(): S {
		return this.internalState;
	}

	/**
	 * Updates internal state
	 *
	 * @param state - New state to store
	 */
	set state(state: S) {
		/* tslint:disable-next-line:prefer-object-spread */
		this.internalState = Object.assign({}, state);
		this.notify();
	}

	/**
	 * Notifies all subscribed listeners of current state
	 */
	notify() {
		if (this.disabled) {
			return;
		}
		this.listeners.forEach((listener) => {
			listener(this.internalState);
		});
	}

	/**
	 * Adds new listener to be notified of state changes
	 *
	 * @param listener - Callback triggered when state changes
	 */
	subscribe(listener: Listener<S>) {
		this.listeners.push(listener);
	}

	/**
	 * Removes existing listener from receiving state changes
	 *
	 * @param listener - Callback to remove
	 * @returns - True if a listener is found and unsubscribed
	 */
	unsubscribe(listener: Listener<S>): boolean {
		const index = this.listeners.findIndex((cb) => listener === cb);
		index > -1 && this.listeners.splice(index, 1);
		return index > -1 ? true : false;
	}

	/**
	 * Merges new state on top of existing state
	 */
	mergeState(partialState: S) {
		/* tslint:disable-next-line:prefer-object-spread */
		this.state = Object.assign(this.internalState, partialState);
	}
}

export default BaseController;
