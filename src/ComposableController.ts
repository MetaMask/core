import BaseController, { BaseConfig, BaseState } from './BaseController';

/**
 * Controller that can be used to compose mutiple controllers together
 */
export class ComposableController extends BaseController<BaseState, BaseConfig> {
	/**
	 * Creates a ComposableController instance
	 *
	 * @param stores - Array of stores to compose together
	 */
	constructor(stores: Array<BaseController<any, any>> = []) {
		super();
		this.initialize();
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
