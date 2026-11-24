import { Messenger } from '@metamask/messenger';
import {
  PermissionController,
  PermissionControllerMessenger,
} from '@metamask/permission-controller';

import type { InitializationConfiguration } from '../../types.js';

export type { PermissionControllerInstanceOptions } from './types.js';

export const permissionController: InitializationConfiguration<
  PermissionController,
  PermissionControllerMessenger
> = {
  name: 'PermissionController',
  reference: PermissionController,
  init: ({ state, messenger, options }) =>
    new PermissionController({
      state,
      messenger,
      caveatSpecifications: options.caveatSpecifications ?? {},
      permissionSpecifications: options.permissionSpecifications ?? {},
      unrestrictedMethods: options.unrestrictedMethods ?? [],
    }),
  getMessenger: (parent) => {
    const messenger: PermissionControllerMessenger = new Messenger({
      namespace: 'PermissionController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: [
        'ApprovalController:addRequest',
        'ApprovalController:hasRequest',
        'ApprovalController:acceptRequest',
        'ApprovalController:rejectRequest',
        'SubjectMetadataController:getSubjectMetadata',
        // These are used by permission side-effects. The Wallet does not
        // construct `SnapController` yet, so clients must register them if they use
        // Snap-related permissions.
        // @ts-expect-error Not part of the `PermissionControllerMessenger` type.
        'SnapController:getPermittedSnaps',
        // @ts-expect-error Not part of the `PermissionControllerMessenger` type.
        'SnapController:installSnaps',
      ],
    });

    return messenger;
  },
};
