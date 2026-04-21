import { Messenger } from '@metamask/messenger';
import {
  PermissionController,
  PermissionControllerMessenger,
} from '@metamask/permission-controller';

import {
  getCaveatSpecifications,
  getPermissionSpecifications,
  unrestrictedMethods,
} from '../../permissions/specifications';
import { InitializationConfiguration } from '../types';

export const permissionController: InitializationConfiguration<
  PermissionController,
  PermissionControllerMessenger
> = {
  name: 'PermissionController',
  init: ({ messenger, state }) => {
    const instance = new PermissionController({
      messenger,
      state,
      permissionSpecifications: getPermissionSpecifications(messenger),
      caveatSpecifications: getCaveatSpecifications(messenger),
      unrestrictedMethods,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: PermissionControllerMessenger = new Messenger({
      namespace: 'PermissionController',
      parent,
    });

    parent.delegate({
      messenger: controllerMessenger,
      actions: [
        'ApprovalController:addRequest',
        'ApprovalController:hasRequest',
        'ApprovalController:acceptRequest',
        'ApprovalController:rejectRequest',
        'SnapController:getPermittedSnaps',
        'SnapController:installSnaps',
        'SubjectMetadataController:getSubjectMetadata',
        // TODO: These actions required for specifications, not part of the type.
        'PreferencesController:getState',
        'KeyringController:getState',
        'KeyringController:withKeyring',
        'KeyringController:getKeyringsByType',
        'SnapController:getSnap',
        'SnapController:getSnapState',
        'SnapController:clearSnapState',
        'SnapController:handleRequest',
        'ApprovalController:addAndShowApprovalRequest',
        'RateLimitController:call',
        'SnapController:updateSnapState',
        'SnapInterfaceController:createInterface',
        'SnapInterfaceController:getInterface',
        'SnapInterfaceController:setInterfaceDisplayed',
      ],
    });

    return controllerMessenger;
  },
};
