import { SnapKeyring } from '@metamask/eth-snap-keyring';
import {
  KeyringControllerGetKeyringsByTypeAction,
  KeyringTypes,
} from '@metamask/keyring-controller';
import { Messenger, MessengerActions } from '@metamask/messenger';
import {
  MultichainRoutingService,
  MultichainRoutingServiceMessenger,
} from '@metamask/snaps-controllers';

import { InitializationConfiguration } from '../types';

type InitActions = KeyringControllerGetKeyringsByTypeAction;

type AllowedActions =
  | MessengerActions<MultichainRoutingServiceMessenger>
  | InitActions;

type WalletMultichainRoutingServiceMessenger = Messenger<
  'MultichainRoutingService',
  AllowedActions
>;

export const multichainRoutingService: InitializationConfiguration<
  MultichainRoutingService,
  WalletMultichainRoutingServiceMessenger
> = {
  name: 'MultichainRoutingService',
  init: ({ messenger }) => {
    const instance = new MultichainRoutingService({
      messenger: messenger as MultichainRoutingServiceMessenger,
      withSnapKeyring: async (operation) => {
        const [keyring] = messenger.call(
          'KeyringController:getKeyringsByType',
          KeyringTypes.snap,
        );

        return operation({ keyring: keyring as SnapKeyring });
      },
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const serviceMessenger: WalletMultichainRoutingServiceMessenger =
      new Messenger({
        namespace: 'MultichainRoutingService',
        parent,
      });

    parent.delegate({
      messenger: serviceMessenger,
      actions: [
        'SnapController:getRunnableSnaps',
        'SnapController:handleRequest',
        'PermissionController:getPermissions',
        'AccountsController:listMultichainAccounts',
        'KeyringController:getKeyringsByType',
      ],
    });

    return serviceMessenger;
  },
};
