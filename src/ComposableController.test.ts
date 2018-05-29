import 'isomorphic-fetch';
import { stub } from 'sinon';
import AddressBookController from './AddressBookController';
import ComposableController from './ComposableController';
import TokenRatesController from './TokenRatesController';

describe('ComposableController', () => {
	it('should compose controller state', () => {
		const controllerEmpty = new ComposableController();
		const controller = new ComposableController([new AddressBookController(), new TokenRatesController()]);
		expect(controller.state).toEqual({
			addressBook: [],
			contractExchangeRates: {}
		});
	});

	it('should notify listeners of nested state change', () => {
		const addressBookController = new AddressBookController();
		const controller = new ComposableController([addressBookController]);
		const listener = stub();
		controller.subscribe(listener);
		addressBookController.set('1337', 'foo');
		expect(listener.calledOnce).toBe(true);
		expect(listener.getCall(0).args[0]).toEqual({
			addressBook: [
				{
					address: '1337',
					name: 'foo'
				}
			]
		});
	});
});
