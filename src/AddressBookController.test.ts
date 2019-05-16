import AddressBookController from './AddressBookController';

describe('AddressBookController', () => {
	it('should set default state', () => {
		const controller = new AddressBookController();
		expect(controller.state).toEqual({ addressBook: {} });
	});

	it('should add a contact entry', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		expect(controller.state).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					name: 'foo'
				}
			}
		});
	});

	it('should update a contact entry', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'bar');
		expect(controller.state).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					name: 'bar'
				}
			}
		});
	});

	it('should not add invalid contact entry', () => {
		const controller = new AddressBookController();
		controller.set('1337', 'foo');
		expect(controller.state).toEqual({ addressBook: {} });
	});

	it('should remove a contact entry', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		controller.delete('0x32Be343B94f860124dC4fEe278FDCBD38C102D88');
		expect(controller.state).toEqual({ addressBook: {} });
	});

	it('should remove a contact entry', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
		controller.delete('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d');
		expect(controller.state).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					name: 'foo'
				}
			}
		});
	});

	it('should clear all contact entries', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
		controller.clear();
		expect(controller.state).toEqual({ addressBook: {} });
	});
});
