import { Messenger } from '@metamask/messenger';
import {
  SnapInterfaceControllerMessenger,
  SnapInterfaceController,
} from '@metamask/snaps-controllers';

import { InitializationConfiguration } from '../types';

export const snapInterfaceController: InitializationConfiguration<
  SnapInterfaceController,
  SnapInterfaceControllerMessenger
> = {
  name: 'SnapInterfaceController',
  init: ({ messenger, state }) => {
    const instance = new SnapInterfaceController({
      messenger,
      state,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: SnapInterfaceControllerMessenger = new Messenger(
      {
        namespace: 'SnapInterfaceController',
        parent,
      },
    );

    parent.delegate({
      messenger: controllerMessenger,
      actions: [
        'PhishingController:testOrigin',
        'ApprovalController:hasRequest',
        'ApprovalController:acceptRequest',
        'SnapController:getSnap',
        'MultichainAssetsController:getState',
        'AccountsController:getSelectedMultichainAccount',
        'AccountsController:getAccountByAddress',
        'AccountsController:listMultichainAccounts',
        'PermissionController:hasPermission',
      ],
      events: ['NotificationServicesController:notificationsListUpdated'],
    });

    return controllerMessenger;
  },
};
