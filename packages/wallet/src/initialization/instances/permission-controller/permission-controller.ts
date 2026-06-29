import { Messenger } from '@metamask/messenger';
import {
  CaveatSpecificationConstraint,
  GenericPermissionController,
  PermissionController,
  PermissionControllerMessenger,
  PermissionSpecificationConstraint,
} from '@metamask/permission-controller';

import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '../../defaults';
import type { InitializationConfiguration } from '../../types';

export const permissionController: InitializationConfiguration<
  GenericPermissionController,
  PermissionControllerMessenger
> = {
  name: 'PermissionController',
  init: ({ state, messenger, options }) =>
    new PermissionController<
      PermissionSpecificationConstraint,
      CaveatSpecificationConstraint
    >({
      state,
      messenger,
      caveatSpecifications: options.caveatSpecifications ?? {},
      permissionSpecifications: options.permissionSpecifications ?? {},
      unrestrictedMethods: options.unrestrictedMethods ?? [],
    }),
  getMessenger: (parent: RootMessenger<DefaultActions, DefaultEvents>) => {
    const permissionControllerMessenger: PermissionControllerMessenger =
      new Messenger({
        namespace: 'PermissionController',
        parent,
      });

    parent.delegate({
      messenger: permissionControllerMessenger,
      actions: [
        'ApprovalController:addRequest',
        'ApprovalController:hasRequest',
        'ApprovalController:acceptRequest',
        'ApprovalController:rejectRequest',
        'SubjectMetadataController:getSubjectMetadata',
      ],
    });

    return permissionControllerMessenger;
  },
};
