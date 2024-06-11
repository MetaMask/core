import { ControllerMessenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';

import type {
  AddressBookControllerActions,
  AddressBookControllerEvents,
} from './AddressBookController';
import {
  AddressBookController,
  AddressType,
  controllerName,
} from './AddressBookController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    AddressBookControllerActions,
    AddressBookControllerEvents
  >();
  return controllerMessenger.getRestricted({
    name: controllerName,
    allowedActions: [],
    allowedEvents: [],
  });
}

describe('AddressBookController', () => {
  it('should set default state', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should add a contact entry', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
          },
        },
      },
    });
  });

  it('should add a contact entry with chainId and memo', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 1',
      AddressType.externallyOwnedAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
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
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 1',
      AddressType.contractAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
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
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 1',
      AddressType.nonAccounts,
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
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
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(1),
      'account 2',
    );

    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'foo',
      toHex(2),
      'account 2',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: 'account 2',
            name: 'foo',
            addressType: undefined,
          },
        },
        [toHex(2)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(2),
            isEns: false,
            memo: 'account 2',
            name: 'foo',
            addressType: undefined,
          },
        },
      },
    });
  });

  it('should update a contact entry', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'bar');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'bar',
            addressType: undefined,
          },
        },
      },
    });
  });

  it('should not add invalid contact entry', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    // @ts-expect-error Intentionally invalid entry
    controller.set('0x01', 'foo', AddressType.externallyOwnedAccounts);
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should remove one contact entry', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');
    controller.delete(toHex(1), '0x32Be343B94f860124dC4fEe278FDCBD38C102D88');

    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should remove only one contact entry', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
    controller.delete(toHex(1), '0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
          },
        },
      },
    });
  });

  it('should add two contact entries with the same chainId', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
          },
          '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D': {
            address: '0xC38bF1aD06ef69F0c04E29DBeB4152B4175f0A8D',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'bar',
            addressType: undefined,
          },
        },
      },
    });
  });

  it('should correctly mark ens entries', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set(
      '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
      'metamask.eth',
    );

    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: true,
            memo: '',
            name: 'metamask.eth',
            addressType: undefined,
          },
        },
      },
    });
  });

  it('should clear all contact entries', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');
    controller.clear();
    expect(controller.state).toStrictEqual({ addressBook: {} });
  });

  it('should return true to indicate an address book entry has been added', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    expect(
      controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo'),
    ).toBe(true);
  });

  it('should return false to indicate an address book entry has NOT been added', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    expect(
      // @ts-expect-error Intentionally invalid entry
      controller.set('0x00', 'foo', AddressType.externallyOwnedAccounts),
    ).toBe(false);
  });

  it('should return true to indicate an address book entry has been deleted', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    expect(
      controller.delete(toHex(1), '0x32Be343B94f860124dC4fEe278FDCBD38C102D88'),
    ).toBe(true);
  });

  it('should return false to indicate an address book entry has NOT been deleted due to unsafe input', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    // @ts-expect-error Suppressing error to test runtime behavior
    expect(controller.delete('__proto__', '0x01')).toBe(false);
    expect(controller.delete(toHex(1), 'constructor')).toBe(false);
  });

  it('should return false to indicate an address book entry has NOT been deleted', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', '0x00');
    expect(controller.delete(toHex(1), '0x01')).toBe(false);
  });

  it('should normalize addresses so adding and removing entries work across casings', () => {
    const controller = new AddressBookController({
      messenger: getRestrictedMessenger(),
    });
    controller.set('0x32Be343B94f860124dC4fEe278FDCBD38C102D88', 'foo');

    controller.set('0xc38bf1ad06ef69f0c04e29dbeb4152b4175f0a8d', 'bar');

    controller.delete(toHex(1), '0xC38BF1AD06EF69F0C04E29DBEB4152B4175F0A8D');
    expect(controller.state).toStrictEqual({
      addressBook: {
        [toHex(1)]: {
          '0x32Be343B94f860124dC4fEe278FDCBD38C102D88': {
            address: '0x32Be343B94f860124dC4fEe278FDCBD38C102D88',
            chainId: toHex(1),
            isEns: false,
            memo: '',
            name: 'foo',
            addressType: undefined,
          },
        },
      },
    });
  });
});
