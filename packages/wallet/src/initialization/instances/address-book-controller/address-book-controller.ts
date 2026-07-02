import {
  AddressBookController,
  AddressBookControllerMessenger,
} from '@metamask/address-book-controller';
import { Messenger } from '@metamask/messenger';

import type { InitializationConfiguration } from '../../types';

export const addressBookController: InitializationConfiguration<
  AddressBookController,
  AddressBookControllerMessenger
> = {
  name: 'AddressBookController',
  init: ({ state, messenger }) =>
    new AddressBookController({
      state,
      messenger,
    }),
  getMessenger: (parent) =>
    new Messenger({
      namespace: 'AddressBookController',
      parent,
    }),
};
