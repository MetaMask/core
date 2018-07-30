import { stub } from 'sinon';
import AddressBookController from './AddressBookController';
import ComposableController from './ComposableController';
import TokenRatesController from './TokenRatesController';

describe('ComposableController', () => {
	it('should compose controller state', () => {
		const controller = new ComposableController({
			address: new AddressBookController(),
			tokenRates: new TokenRatesController()
		});
		expect(controller.state).toEqual({
			address: { addressBook: [] },
			tokenRates: { contractExchangeRates: {} }
		});
	});

	it('should compose flat controller state', () => {
		const controller = new ComposableController({
			address: new AddressBookController(),
			tokenRates: new TokenRatesController()
		});
		expect(controller.flatState).toEqual({
			addressBook: [],
			contractExchangeRates: {}
		});
	});

	it('should expose sibling context', () => {
		const controller = new ComposableController({
			address: new AddressBookController(),
			tokenRates: new TokenRatesController()
		});
		const addressContext = controller.controllers.tokenRates.context.address as AddressBookController;
		expect(addressContext).toBeDefined();
		addressContext.set('1337', 'foo');
		expect(controller.flatState).toEqual({
			addressBook: [{ address: '1337', name: 'foo' }],
			contractExchangeRates: {}
		});
	});

	it('should get and set new stores', () => {
		const controller = new ComposableController();
		const addressBook = new AddressBookController();
		controller.controllers = { address: addressBook };
		expect(controller.controllers).toEqual({ address: addressBook });
	});

	it('should notify listeners of nested state change', () => {
		const addressBookController = new AddressBookController();
		const controller = new ComposableController({ address: addressBookController });
		const listener = stub();
		controller.subscribe(listener);
		addressBookController.set('1337', 'foo');
		expect(listener.calledOnce).toBe(true);
		expect(listener.getCall(0).args[0]).toEqual({
			address: {
				addressBook: [
					{
						address: '1337',
						name: 'foo'
					}
				]
			}
		});
	});
});
