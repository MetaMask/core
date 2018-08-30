import BaseController from './BaseController';

/**
 * Child controller instances keyed by controller name
 */
export interface ChildControllerContext {
	[key: string]: BaseController<any, any>;
}

/**
 * List of child controller instances
 */
export type ControllerList = Array<BaseController<any, any>>;

/**
 * Controller that can be used to compose mutiple controllers together
 */
export class ComposableController extends BaseController<any, any> {
	private cachedState: any;
	private internalControllers: ControllerList = [];

	/**
	 * Map of stores to compose together
	 */
	context: ChildControllerContext = {};

	/**
	 * Name of this controller used during composition
	 */
	name = 'ComposableController';

	/**
	 * Creates a ComposableController instance
	 *
	 * @param controllers - Map of names to controller instances
	 * @param initialState - Initial state keyed by child controller name
	 */
	constructor(controllers: ControllerList = [], initialState?: any) {
		super();
		this.initialize();
		this.cachedState = initialState;
		this.controllers = controllers;
		this.cachedState = undefined;
	}

	/**
	 * Get current list of child composed store instances
	 *
	 * @returns - List of names to controller instances
	 */
	get controllers() {
		return this.internalControllers;
	}

	/**
	 * Set new list of controller instances
	 *
	 * @param controllers - List of names to controller instsances
	 */
	set controllers(controllers: ControllerList) {
		this.internalControllers = controllers;
		const initialState: any = {};
		controllers.forEach((controller) => {
			const name = controller.name;
			this.context[name] = controller;
			controller.context = this.context;
			this.cachedState && this.cachedState[name] && controller.update(this.cachedState[name]);
			initialState[name] = controller.state;
			controller.subscribe((state) => {
				this.update({ [name]: state });
			});
		});
		controllers.forEach((controller) => {
			controller.onComposed();
		});
		this.update(initialState, true);
	}

	/**
	 * Flat state representation, one that isn't keyed
	 * of controller name. Instead, all child controller state is merged
	 * together into a single, flat object.
	 *
	 * @returns - Merged state representation of all child controllers
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
