import { AddressBookController, AddressType } from './AddressBookController';

describe('AddressBookController', () => {
  it('should set default state', () => {
    const controller = new AddressBookController();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should add a contact entry', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should add a contact entry with chainId and memo', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
      '1',
      'account 1',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: 'account 1',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should add a contact entry with address type contract accounts', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.contractAccounts,
      '1',
      'account 1',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: 'account 1',
            name: 'foo',
            addressType: AddressType.contractAccounts,
          },
        },
      },
    });
  });

  it('should add a contact entry with address type non accounts', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.nonAccounts,
      '1',
      'account 1',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: 'account 1',
            name: 'foo',
            addressType: AddressType.nonAccounts,
          },
        },
      },
    });
  });

  it('should add multiple contact entries with different chainIds', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
      '1',
      'account 2',
    );

    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
      '2',
      'account 2',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: 'account 2',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
        2: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '2',
            isEns: false,
            memo: 'account 2',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should update a contact entry', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'bar',
      AddressType.externallyOwnedAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'bar',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should not add invalid contact entry', () => {
    const controller = new AddressBookController();
    controller.set('0x01', 'foo', AddressType.externallyOwnedAccounts);
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should remove one contact entry', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );
    controller.delete('1', '0x32Be343B94f860124dC4fEe278FDCBD38C102D88');

    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should remove only one contact entry', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    controller.set(
      '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d',
      'bar',
      AddressType.externallyOwnedAccounts,
    );
    controller.delete('1', '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d');

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should add two contact entries with the same chainId', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    controller.set(
      '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d',
      'bar',
      AddressType.externallyOwnedAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
          '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D': {
            address: '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'bar',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should correctly mark ens entries', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'metamask.eth',
      AddressType.externallyOwnedAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: true,
            memo: '',
            name: 'metamask.eth',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });

  it('should clear all contact entries', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    controller.set(
      '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d',
      'bar',
      AddressType.externallyOwnedAccounts,
    );
    controller.clear();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should return true to indicate an address book entry has been added', () => {
    const controller = new AddressBookController();
    expect(
      controller.set(
        '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
        'foo',
        AddressType.externallyOwnedAccounts,
      ),
    ).toStrictEqual(true);
  });

  it('should return false to indicate an address book entry has NOT been added', () => {
    const controller = new AddressBookController();
    expect(
      controller.set('0x00', 'foo', AddressType.externallyOwnedAccounts),
    ).toStrictEqual(false);
  });

  it('should return true to indicate an address book entry has been deleted', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    expect(
      controller.delete('1', '0x32Be343B94f860124dC4fEe278FDCBD38C102D88'),
    ).toStrictEqual(true);
  });

  it('should return false to indicate an address book entry has NOT been deleted', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      '0x00',
      AddressType.externallyOwnedAccounts,
    );
    expect(controller.delete('1', '0x01')).toStrictEqual(false);
  });

  it('should normalize addresses so adding and removing entries work across casings', () => {
    const controller = new AddressBookController();
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      AddressType.externallyOwnedAccounts,
    );

    controller.set(
      '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d',
      'bar',
      AddressType.externallyOwnedAccounts,
    );

    controller.delete('1', '0xC38BF1AD06EF69F0C04E29DBEB4152B4175F0A8D');
    expect(controller.state).toStrictEqual({
      addressBook: {
        1: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: '1',
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: AddressType.externallyOwnedAccounts,
          },
        },
      },
    });
  });
});
