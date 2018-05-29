import BaseController, { BaseConfig, BaseState } from './BaseController';

/**
 * Controller that can be used to compose mutiple controllers together
 */
export class ComposableController extends BaseController<BaseState, BaseConfig> {
	/**
	 * Array of stores to compose together
	 */
	internalStores: Array<BaseController<any, any>> = [];

	/**
	 * Creates a ComposableController instance
	 *
	 * @param stores - Array of stores to compose together
	 */
	constructor(stores: Array<BaseController<any, any>> = []) {
		super();
		this.initialize();
		this.stores = stores;
	}

	/**
	 * Get current list of composed stores
	 *
	 * @returns List of composed stores
	 */
	get stores() {
		return this.internalStores;
	}

	/**
	 * Set new list of composed stores
	 *
	 * @param stores - New list of composed stores
	 */
	set stores(stores: Array<BaseController<any, any>>) {
		this.internalStores = stores;

		let initialState = {};
		stores.forEach((store) => {
			initialState = { ...initialState, ...store.state };
			store.subscribe((state) => {
				this.update(state);
			});
		});
		this.update(initialState, true);
	}
}

export default ComposableController;
