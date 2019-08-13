import AddressBookController from '../src/user/AddressBookController';

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
					chainId: 1,
					memo: '',
					name: 'foo'
				}
			}
		});
	});

	it('should add a contact entry with chainId and memo', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo', 1, 'account 1');
		expect(controller.state).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					chainId: 1,
					memo: 'account 1',
					name: 'foo'
				}
			}
		});
	});

	it('should add a contact entry with chainId and memo', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo', 2, 'account 2');
		expect(controller.state).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					chainId: 2,
					memo: 'account 2',
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
					chainId: 1,
					memo: '',
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
					chainId: 1,
					memo: '',
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

	it('should return true to indicate an address book entry has been added', () => {
		const controller = new AddressBookController();
		expect(controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo')).toBeTruthy();
	});

	it('should return false to indicate an address book entry has NOT been added', () => {
		const controller = new AddressBookController();
		expect(controller.set('1337', 'foo')).toBeFalsy();
	});

	it('should return true to indicate an address book entry has been deleted', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		expect(controller.delete('0x32Be343B94f860124dC4fEe278FDCBD38C102D88')).toBeTruthy();
	});

	it('should return false to indicate an address book entry has NOT been deleted', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		expect(controller.delete('bar')).toBeFalsy();
	});

	it('should normalize addresses so adding a removing entries work across casings', () => {
		const controller = new AddressBookController();
		controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
		expect(controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar')).toBeTruthy();
		controller.delete('0xC38BF1AD06EF69F0C04E29DBEB4152B4175F0A8D');
		expect(controller.state).toEqual({
			addressBook: {
				'0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
					address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
					chainId: 1,
					memo: '',
					name: 'foo'
				}
			}
		});
	});
});
