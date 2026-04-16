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
      permissionSpecifications: getPermissionSpecifications({}),
      caveatSpecifications: getCaveatSpecifications({}),
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
      ],
    });

    return controllerMessenger;
  },
};
