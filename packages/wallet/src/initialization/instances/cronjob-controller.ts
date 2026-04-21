import { KeyringTypes } from '@metamask/keyring-controller';
import { Messenger } from '@metamask/messenger';
import {
  CronjobController,
  CronjobControllerMessenger,
  CronjobControllerState,
} from '@metamask/snaps-controllers';

import { InitializationConfiguration } from '../types';

// We don't need a state manager for now.
class DummyStateManager {
  set(_state: CronjobControllerState) {
    // no-op
  }
  getInitialState() {
    return {};
  }
}

export const cronjobController: InitializationConfiguration<
  CronjobController,
  CronjobControllerMessenger
> = {
  name: 'CronjobController',
  init: ({ messenger, state }) => {
    const instance = new CronjobController({
      messenger,
      state,
      stateManager: new DummyStateManager(),
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: CronjobControllerMessenger = new Messenger({
      namespace: 'CronjobController',
      parent,
    });

    parent.delegate({
      messenger: controllerMessenger,
      events: [
        'SnapController:snapInstalled',
        'SnapController:snapUpdated',
        'SnapController:snapUninstalled',
        'SnapController:snapEnabled',
        'SnapController:snapDisabled',
      ],
      actions: [
        'PermissionController:getPermissions',
        'SnapController:handleRequest',
      ],
    });

    return controllerMessenger;
  },
};
