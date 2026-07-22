import {
  AddressBookController,
  getDefaultAddressBookControllerState,
} from '@metamask/address-book-controller';
import { Messenger } from '@metamask/messenger';

import { defaultConfigurations } from '../../defaults.js';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults.js';
import { addressBookController } from './address-book-controller.js';

const ADDRESS = '0x1234567890123456789012345678901234567890';

/**
 * Creates a root messenger for use in tests.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger<DefaultActions, DefaultEvents> {
  return new Messenger({ namespace: 'Root' });
}

describe('addressBookController', () => {
  it('is registered as a default initialization configuration', () => {
    expect(Object.values(defaultConfigurations)).toContain(
      addressBookController,
    );
  });

  it('initializes an AddressBookController with default state', () => {
    const messenger = addressBookController.getMessenger(getRootMessenger());

    const instance = addressBookController.init({
      state: undefined,
      messenger,
      options: {},
    });

    expect(instance).toBeInstanceOf(AddressBookController);
    expect(instance.state).toStrictEqual(
      getDefaultAddressBookControllerState(),
    );
  });

  it('merges provided state over the defaults', () => {
    const messenger = addressBookController.getMessenger(getRootMessenger());

    const entry = {
      address: ADDRESS,
      name: 'Alice',
      chainId: '0x1' as const,
      memo: '',
      isEns: false,
    };

    const instance = addressBookController.init({
      state: { addressBook: { '0x1': { [ADDRESS]: entry } } },
      messenger,
      options: {},
    });

    expect(instance.state.addressBook['0x1'][ADDRESS]).toStrictEqual(entry);
  });

  it('exposes its state through the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = addressBookController.getMessenger(rootMessenger);

    addressBookController.init({ state: undefined, messenger, options: {} });

    expect(rootMessenger.call('AddressBookController:getState')).toStrictEqual(
      getDefaultAddressBookControllerState(),
    );
  });

  it('registers its method actions on the root messenger', () => {
    const rootMessenger = getRootMessenger();
    const messenger = addressBookController.getMessenger(rootMessenger);

    const instance = addressBookController.init({
      state: undefined,
      messenger,
      options: {},
    });

    rootMessenger.call('AddressBookController:set', ADDRESS, 'Alice');

    expect(instance.list()).toHaveLength(1);
  });
});
