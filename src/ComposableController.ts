import BaseController, { BaseConfig, BaseState } from './BaseController';

/**
 * Child controller instances keyed by controller name
 */
export interface ChildControllerContext {
	[key: string]: BaseController<any, any>;
}

/**
 * Controller that can be used to compose mutiple controllers together
 */
export class ComposableController extends BaseController<BaseState, BaseConfig> {
	/**
	 * Array of stores to compose together
	 */
	context: ChildControllerContext = {};

	/**
	 * Creates a ComposableController instance
	 *
	 * @param controllers - Map of names to controller instances
	 */
	constructor(controllers: ChildControllerContext = {}) {
		super();
		this.initialize();
		this.controllers = controllers;
	}

	/**
	 * Get current map of child composed store instances
	 *
	 * @returns Map of names to controller instances
	 */
	get controllers() {
		return this.context;
	}

	/**
	 * Set new map of controller instances
	 *
	 * @param controllers - Map of names to controller instsances
	 */
	set controllers(controllers: ChildControllerContext) {
		this.context = controllers;

		const initialState: ChildControllerContext = {};
		for (const name in controllers) {
			controllers[name].context = this.context;
			initialState[name] = controllers[name].state;
			controllers[name].subscribe((state) => {
				this.update({ [name]: state });
			});
			controllers[name].onComposed();
		}
		this.update(initialState, true);
	}

	/**
	 * Flat state representation, one that isn't keyed
	 * of controller name. Instead, all child controller state is merged
	 * together into a single, flat object.
	 *
	 * @returns Merged state representation of all child controllers
	 */
	get flatState() {
		let flatState = {};
		for (const name in this.context) {
			flatState = { ...flatState, ...this.context[name].state };
		}
		return flatState;
	}
}

export default ComposableController;
