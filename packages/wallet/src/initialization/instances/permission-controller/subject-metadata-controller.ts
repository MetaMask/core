import { Messenger } from '@metamask/messenger';
import {
  SubjectMetadataController,
  SubjectMetadataControllerMessenger,
} from '@metamask/permission-controller';

import type { InitializationConfiguration } from '../../types.js';

export const subjectMetadataController: InitializationConfiguration<
  SubjectMetadataController,
  SubjectMetadataControllerMessenger
> = {
  name: 'SubjectMetadataController',
  reference: SubjectMetadataController,
  init: ({ state, messenger }) =>
    new SubjectMetadataController({
      state,
      messenger,
      subjectCacheLimit: 100,
    }),
  getMessenger: (parent) => {
    const messenger: SubjectMetadataControllerMessenger = new Messenger({
      namespace: 'SubjectMetadataController',
      parent,
    });

    parent.delegate({
      messenger,
      actions: ['PermissionController:hasPermissions'],
    });

    return messenger;
  },
};
