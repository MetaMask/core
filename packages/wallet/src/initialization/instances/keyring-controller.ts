import { SnapKeyring } from '@metamask/eth-snap-keyring';
import {
  KeyringController,
  KeyringControllerMessenger,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { Messenger } from '@metamask/messenger';
import { assert } from '@metamask/utils';

import { encryptorFactory } from '../../encryption';
import { InitializationConfiguration } from '../types';

const createSnapKeyringBuilder = (messenger: KeyringControllerMessenger) => {
  const SnapKeyringBuilder = (() => {
    return new SnapKeyring({
      messenger,
      // TODO: Partial implementation.
      callbacks: {
        addAccount: (
          _address: string,
          snapId: string,
          handleUserInput: (accepted: boolean) => Promise<void>,
        ) => {
          // TODO: Improve check.
          assert(
            snapId.startsWith('npm:@metamask/'),
            'Preinstalled Snaps only allowed for now.',
          );
          return handleUserInput(true);
        },
        addressExists: async (address: string) => {
          const addresses = await messenger.call(
            'KeyringController:getAccounts',
          );
          return addresses.includes(address.toLowerCase());
        },
        saveState: async () => {
          await messenger.call('KeyringController:persistAllKeyrings');
          await messenger.call('AccountsController:updateAccounts');
        },
      },
      isAnyAccountTypeAllowed: false,
    });
  }) as {
    (): SnapKeyring;
    type: typeof SnapKeyring.type;
    state: null;
  };

  SnapKeyringBuilder.state = null;
  SnapKeyringBuilder.type = SnapKeyring.type;

  return SnapKeyringBuilder;
};

export const keyringController: InitializationConfiguration<
  KeyringController,
  KeyringControllerMessenger
> = {
  name: 'KeyringController',
  init: ({ state, messenger }) => {
    const instance = new KeyringController({
      state,
      messenger,
      encryptor: encryptorFactory(600_000),
      keyringBuilders: [createSnapKeyringBuilder(messenger)],
    });

    // Ensure the SnapKeyring has been added, this happens in different places in the clients.
    messenger.subscribe('KeyringController:unlock', () => {
      const [snapKeyring] = instance.getKeyringsByType(KeyringTypes.snap);

      if (!snapKeyring) {
        instance.addNewKeyring(KeyringTypes.snap).catch(console.error);
      }
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: KeyringControllerMessenger = new Messenger({
      namespace: 'KeyringController',
      parent,
    });

    // TODO: These actions are not actually required by the KeyringController
    // They are required for SnapKeyring, which we instantiate in this initializer for now.
    parent.delegate({
      messenger: controllerMessenger,
      events: [],
      actions: [
        'SnapController:handleRequest',
        'SnapController:getSnap',
        'AccountsController:updateAccounts',
        'SnapController:isMinimumPlatformVersion',
      ],
    });

    return controllerMessenger;
  },
};
