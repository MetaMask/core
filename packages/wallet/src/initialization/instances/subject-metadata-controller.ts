import { Messenger } from '@metamask/messenger';
import {
  SubjectMetadataController,
  SubjectMetadataControllerMessenger,
} from '@metamask/permission-controller';

import { InitializationConfiguration } from '../types';

export const subjectMetadataController: InitializationConfiguration<
  SubjectMetadataController,
  SubjectMetadataControllerMessenger
> = {
  name: 'SubjectMetadataController',
  init: ({ messenger, state }) => {
    const instance = new SubjectMetadataController({
      messenger,
      state,
      subjectCacheLimit: 100,
    });

    return {
      instance,
    };
  },
  messenger: (parent) => {
    const controllerMessenger: SubjectMetadataControllerMessenger =
      new Messenger({
        namespace: 'SubjectMetadataController',
        parent,
      });

    parent.delegate({
      messenger: controllerMessenger,
      actions: ['PermissionController:hasPermissions'],
    });

    return controllerMessenger;
  },
};
