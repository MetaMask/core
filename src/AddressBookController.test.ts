import 'isomorphic-fetch';
import { stub } from 'sinon';
import AddressBookController from './AddressBookController';

describe('AddressBookController', () => {
	it('should set default state', () => {
		const controller = new AddressBookController();
		expect(controller.state).toEqual({ addressBook: [] });
	});

	it('should add a contact entry', () => {
		const controller = new AddressBookController();
		controller.set('1337', 'foo');
		expect(controller.state).toEqual({ addressBook: [{ address: '1337', name: 'foo' }] });
	});

	it('should remove a contact entry', () => {
		const controller = new AddressBookController();
		controller.set('1337', 'foo');
		controller.delete('1337');
		expect(controller.state).toEqual({ addressBook: [] });
	});

	it('should clear all contact entries', () => {
		const controller = new AddressBookController();
		controller.set('1337', 'foo');
		controller.set('1338', 'bar');
		controller.clear();
		expect(controller.state).toEqual({ addressBook: [] });
	});
});
