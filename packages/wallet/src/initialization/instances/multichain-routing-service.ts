import { KeyringTypes } from '@metamask/keyring-controller';
import { Messenger } from '@metamask/messenger';
import {
  MultichainRoutingService,
  MultichainRoutingServiceMessenger,
} from '@metamask/snaps-controllers';

import { RootMessenger } from '../defaults';
import { InitializationConfiguration } from '../types';

export const multichainRoutingService: InitializationConfiguration<
  MultichainRoutingService,
  MultichainRoutingServiceMessenger
> = {
  name: 'MultichainRoutingService',
  init: ({ messenger }) => {
    const instance = new MultichainRoutingService({
      messenger,
      withSnapKeyring: async (operation) => {
        const [keyring] = messenger.call(
          'KeyringController:getKeyringsByType',
          KeyringTypes.snap,
        );

        return operation({ keyring });
      },
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const serviceMessenger: MultichainRoutingServiceMessenger = new Messenger({
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
        // TODO: Only used for hook
        'KeyringController:getKeyringsByType',
      ],
    });

    return serviceMessenger;
  },
};
