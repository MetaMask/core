import { AccountsControllerUpdateAccountsAction } from '@metamask/accounts-controller';
import { SnapKeyring, SnapKeyringMessenger } from '@metamask/eth-snap-keyring';
import {
  KeyringController,
  KeyringControllerGetAccountsAction,
  KeyringControllerMessenger,
  KeyringControllerPersistAllKeyringsAction,
  KeyringControllerUnlockEvent,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { Messenger, MessengerActions } from '@metamask/messenger';
import {
  SnapControllerGetSnapAction,
  SnapControllerHandleRequestAction,
  SnapControllerIsMinimumPlatformVersionAction,
} from '@metamask/snaps-controllers';
import { assert } from '@metamask/utils';

import { encryptorFactory } from '../../encryption';
import { InitializationConfiguration } from '../types';

type InitActions =
  | SnapControllerHandleRequestAction
  | SnapControllerGetSnapAction
  | SnapControllerIsMinimumPlatformVersionAction
  | AccountsControllerUpdateAccountsAction;

type KeyringControllerAllowedActions =
  | MessengerActions<KeyringControllerMessenger>
  | InitActions;

type WalletKeyringControllerMessenger = Messenger<
  'KeyringController',
  KeyringControllerAllowedActions,
  KeyringControllerUnlockEvent
>;

type SnapKeyringAllowedActions =
  | MessengerActions<SnapKeyringMessenger>
  | InitActions
  | KeyringControllerGetAccountsAction
  | KeyringControllerPersistAllKeyringsAction;

type WalletSnapKeyringMessenger = Messenger<
  'SnapKeyring',
  SnapKeyringAllowedActions
>;

const createSnapKeyringBuilder = (
  controllerMessenger: WalletKeyringControllerMessenger,
) => {
  const messenger: WalletSnapKeyringMessenger = new Messenger({
    namespace: 'SnapKeyring',
    parent: controllerMessenger,
  });

  controllerMessenger.delegate({
    messenger,
    events: [],
    actions: [
      'SnapController:handleRequest',
      'SnapController:getSnap',
      'AccountsController:updateAccounts',
      'SnapController:isMinimumPlatformVersion',
      'KeyringController:getAccounts',
      'KeyringController:persistAllKeyrings',
    ],
  });

  const SnapKeyringBuilder = (() => {
    return new SnapKeyring({
      messenger: messenger as SnapKeyringMessenger,
      // @ts-expect-error TODO: Partial implementation.
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
  WalletKeyringControllerMessenger
> = {
  name: 'KeyringController',
  init: ({ state, messenger }) => {
    const instance = new KeyringController({
      state,
      messenger: messenger as KeyringControllerMessenger,
      encryptor: encryptorFactory(600_000),
      // @ts-expect-error: `addAccounts` is missing in `SnapKeyring` type.
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
    const controllerMessenger: WalletKeyringControllerMessenger = new Messenger(
      {
        namespace: 'KeyringController',
        parent,
      },
    );

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
